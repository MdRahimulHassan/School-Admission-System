using System.Security.Cryptography;
using Dapper;
using Npgsql;

namespace Admission.Api.Data;

/// <summary>
/// All database access for classes and holds.
///
/// Rules that keep the seat count correct (see ASSUMPTIONS.md for the reasoning):
///  * A seat is occupied by a CONFIRMED hold, or by a HELD hold whose expires_at is still in the future.
///  * Seat counts are always computed from the holds table, never stored, so they cannot drift.
///  * Creating a hold locks the class row (SELECT ... FOR UPDATE). Only one request per class
///    can be between "count the seats" and "insert the hold" at a time, across every backend process.
///  * The database clock is the only clock used for expiry, so several backends always agree.
/// </summary>
public sealed class AdmissionStore(NpgsqlDataSource dataSource)
{
    private const string UniqueViolation = "23505";

    private const string ClassSeatsSelect =
        """
        SELECT c.id,
               c.name,
               c.total_seats,
               (count(h.id) FILTER (WHERE h.status = 'HELD' AND h.expires_at > now()))::int AS held_seats,
               (count(h.id) FILTER (WHERE h.status = 'CONFIRMED'))::int                    AS confirmed_seats
        FROM classes c
        LEFT JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD', 'CONFIRMED')
        """;

    // A HELD row past its deadline is reported as EXPIRED straight away; nobody has to wait for the sweeper.
    private const string HoldSelect =
        """
        SELECT h.id,
               h.class_id,
               c.name AS class_name,
               h.student_id,
               CASE WHEN h.status = 'HELD' AND h.expires_at <= now() THEN 'EXPIRED' ELSE h.status END AS status,
               h.expires_at
        FROM holds h
        JOIN classes c ON c.id = h.class_id
        """;

    // ---------------------------------------------------------------- classes

    public async Task<ClassSeats> CreateClassAsync(string name, int totalSeats, CancellationToken ct)
    {
        var id = NewId("c");
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(
            "INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @totalSeats)",
            new { id, name, totalSeats }, cancellationToken: ct));

        return new ClassSeats { Id = id, Name = name, TotalSeats = totalSeats };
    }

    public async Task<IReadOnlyList<ClassSeats>> ListClassesAsync(CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        var rows = await connection.QueryAsync<ClassSeats>(new CommandDefinition(
            ClassSeatsSelect + " GROUP BY c.id ORDER BY c.created_at, c.id", cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<ClassSeats?> GetClassAsync(string classId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await connection.QuerySingleOrDefaultAsync<ClassSeats>(new CommandDefinition(
            ClassSeatsSelect + " WHERE c.id = @classId GROUP BY c.id", new { classId }, cancellationToken: ct));
    }

    // ------------------------------------------------------------------ holds

    public async Task<CreateHoldResult> CreateHoldAsync(
        string classId, string studentId, int holdDurationSeconds, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);

        // Cheap check without any lock. When a class is already full, thousands of late requests
        // are turned away here instead of queueing for the class lock. It can only say "no":
        // a hold is never granted on the strength of this unlocked read.
        var before = await ReadOccupancyAsync(connection, null, classId, studentId, onlyUnexpired: true, ct);
        if (before is null)
        {
            return new CreateHoldResult(CreateHoldOutcome.ClassNotFound);
        }
        if (before.StudentActive)
        {
            return new CreateHoldResult(CreateHoldOutcome.AlreadyApplied);
        }
        if (before.Occupied >= before.TotalSeats)
        {
            return new CreateHoldResult(CreateHoldOutcome.NoSeatsAvailable);
        }

        await using var transaction = await connection.BeginTransactionAsync(ct);

        // 1. Take the per-class lock. Every other "create hold" for this class, in this or any other
        //    backend process, now waits here until we commit or roll back.
        var locked = await connection.ExecuteScalarAsync<string?>(new CommandDefinition(
            "SELECT id FROM classes WHERE id = @classId FOR UPDATE",
            new { classId }, transaction, cancellationToken: ct));
        if (locked is null)
        {
            return new CreateHoldResult(CreateHoldOutcome.ClassNotFound);
        }

        // 2. Release seats whose deadline has passed. clock_timestamp() is the real current time;
        //    now() would be the time this transaction started, i.e. before we waited for the lock.
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE holds SET status = 'EXPIRED'
            WHERE class_id = @classId AND status = 'HELD' AND expires_at <= clock_timestamp()
            """,
            new { classId }, transaction, cancellationToken: ct));

        // 3. Count again, this time under the lock, so the answer cannot change before we insert.
        var occupancy = (await ReadOccupancyAsync(connection, transaction, classId, studentId, onlyUnexpired: false, ct))!;
        if (occupancy.StudentActive)
        {
            return new CreateHoldResult(CreateHoldOutcome.AlreadyApplied);
        }
        if (occupancy.Occupied >= occupancy.TotalSeats)
        {
            return new CreateHoldResult(CreateHoldOutcome.NoSeatsAvailable);
        }

        // 4. There is a free seat and it is ours.
        var holdId = NewId("h");
        try
        {
            await connection.ExecuteAsync(new CommandDefinition(
                """
                INSERT INTO holds (id, class_id, student_id, status, created_at, expires_at)
                VALUES (@holdId, @classId, @studentId, 'HELD', clock_timestamp(),
                        clock_timestamp() + make_interval(secs => @seconds))
                """,
                new { holdId, classId, studentId, seconds = (double)holdDurationSeconds },
                transaction, cancellationToken: ct));
        }
        catch (PostgresException ex) when (ex.SqlState == UniqueViolation)
        {
            // The partial unique index (one active hold per student per class) said no.
            return new CreateHoldResult(CreateHoldOutcome.AlreadyApplied);
        }

        var hold = await connection.QuerySingleAsync<Hold>(new CommandDefinition(
            HoldSelect + " WHERE h.id = @holdId", new { holdId }, transaction, cancellationToken: ct));

        await transaction.CommitAsync(ct);
        return new CreateHoldResult(CreateHoldOutcome.Created, hold);
    }

    public async Task<Hold?> GetHoldAsync(string holdId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await GetHoldAsync(connection, holdId, ct);
    }

    public async Task<IReadOnlyList<Hold>> ListHoldsForStudentAsync(string studentId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        var rows = await connection.QueryAsync<Hold>(new CommandDefinition(
            HoldSelect + " WHERE h.student_id = @studentId ORDER BY h.created_at DESC, h.id",
            new { studentId }, cancellationToken: ct));
        return rows.AsList();
    }

    /// <summary>
    /// HELD -> CONFIRMED, only for the owner and only before the deadline.
    /// The WHERE clause makes this a single atomic step: of any number of simultaneous or repeated
    /// calls, exactly one changes the row. confirmedSeats is a count of CONFIRMED rows, so it goes up once.
    /// </summary>
    public Task<HoldActionResult> ConfirmHoldAsync(string holdId, string studentId, CancellationToken ct) =>
        ChangeHeldHoldAsync(holdId, studentId, HoldStatus.Confirmed, "confirmed_at", ct);

    /// <summary>HELD -> CANCELLED, only for the owner and only before the deadline. Frees the seat immediately.</summary>
    public Task<HoldActionResult> CancelHoldAsync(string holdId, string studentId, CancellationToken ct) =>
        ChangeHeldHoldAsync(holdId, studentId, HoldStatus.Cancelled, "cancelled_at", ct);

    private async Task<HoldActionResult> ChangeHeldHoldAsync(
        string holdId, string studentId, string newStatus, string timestampColumn, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);

        // newStatus and timestampColumn are fixed strings chosen above, never user input.
        var changed = await connection.ExecuteAsync(new CommandDefinition(
            $"""
             UPDATE holds SET status = '{newStatus}', {timestampColumn} = now()
             WHERE id = @holdId AND student_id = @studentId AND status = 'HELD' AND expires_at > now()
             """,
            new { holdId, studentId }, cancellationToken: ct));

        var hold = await GetHoldAsync(connection, holdId, ct);
        if (hold is null)
        {
            return new HoldActionResult(HoldActionOutcome.NotFound);
        }
        if (hold.StudentId != studentId)
        {
            return new HoldActionResult(HoldActionOutcome.NotOwner);
        }
        if (changed == 1)
        {
            return new HoldActionResult(HoldActionOutcome.Done, hold);
        }
        if (hold.Status == newStatus)
        {
            return new HoldActionResult(HoldActionOutcome.AlreadyDone, hold);
        }

        return new HoldActionResult(hold.Status switch
        {
            HoldStatus.Confirmed => HoldActionOutcome.Confirmed,
            HoldStatus.Cancelled => HoldActionOutcome.Cancelled,
            _ => HoldActionOutcome.Expired,
        }, hold);
    }

    /// <summary>
    /// Marks overdue HELD rows as EXPIRED. Purely housekeeping: seat counts and statuses already
    /// treat those rows as expired. SKIP LOCKED means the sweeper never waits on, or deadlocks with,
    /// a request (or another backend's sweeper) that is working on the same rows.
    /// </summary>
    public async Task<int> ExpireOverdueHoldsAsync(CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE holds SET status = 'EXPIRED'
            WHERE id IN (
                SELECT id FROM holds
                WHERE status = 'HELD' AND expires_at <= now()
                ORDER BY id
                FOR UPDATE SKIP LOCKED
            )
            """, cancellationToken: ct));
    }

    // ---------------------------------------------------------------- helpers

    private static Task<Hold?> GetHoldAsync(NpgsqlConnection connection, string holdId, CancellationToken ct) =>
        connection.QuerySingleOrDefaultAsync<Hold>(new CommandDefinition(
            HoldSelect + " WHERE h.id = @holdId", new { holdId }, cancellationToken: ct));

    private sealed class Occupancy
    {
        public int TotalSeats { get; init; }
        public int Occupied { get; init; }
        public bool StudentActive { get; init; }
    }

    /// <summary>
    /// How many seats of the class are taken, and whether this student already holds one of them.
    /// Returns null when the class does not exist.
    /// </summary>
    private static Task<Occupancy?> ReadOccupancyAsync(
        NpgsqlConnection connection, NpgsqlTransaction? transaction,
        string classId, string studentId, bool onlyUnexpired, CancellationToken ct)
    {
        // Under the class lock, overdue rows have just been marked EXPIRED, so status alone is enough
        // (and any hold that expires in the next instant is still counted, which errs on the safe side).
        var activeHeld = onlyUnexpired
            ? "(h.status = 'HELD' AND h.expires_at > now())"
            : "h.status = 'HELD'";

        return connection.QuerySingleOrDefaultAsync<Occupancy>(new CommandDefinition(
            $"""
             SELECT c.total_seats,
                    (count(h.id) FILTER (WHERE {activeHeld} OR h.status = 'CONFIRMED'))::int AS occupied,
                    coalesce(bool_or(h.student_id = @studentId AND ({activeHeld} OR h.status = 'CONFIRMED')), false) AS student_active
             FROM classes c
             LEFT JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD', 'CONFIRMED')
             WHERE c.id = @classId
             GROUP BY c.id
             """,
            new { classId, studentId }, transaction, cancellationToken: ct));
    }

    /// <summary>e.g. "c_9f2c4e1ab07d3356": a readable prefix plus 64 random bits, so IDs cannot be guessed.</summary>
    private static string NewId(string prefix) =>
        $"{prefix}_{Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant()}";
}
