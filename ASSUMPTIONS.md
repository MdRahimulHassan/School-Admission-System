# Assumptions

Where the brief was silent, this is what I assumed and why.

## Seats and concurrency

**How "held + confirmed ≤ totalSeats" is guaranteed.**
Creating a hold runs in one database transaction that first locks the class row
(`SELECT ... FOR UPDATE`), then counts the occupied seats, then inserts the hold. Only one request
per class can be between "count" and "insert" at a time, so two requests can never both take the
last seat. Different classes do not block each other.

**Seat counts are never stored.** `heldSeats`, `confirmedSeats` and `availableSeats` are counted
from the `holds` table on every read. There is no counter column that could drift out of sync.

**Bonus: two backend processes, one database.** The lock lives in PostgreSQL, not in the
application's memory, so it works the same for one process or many. Nothing about seats is kept in
process memory. Supporting details:

- Expiry uses the **database clock** (`now()` / `clock_timestamp()`), never the application
  clock, so processes on machines with slightly different clocks still agree on what has expired.
- A partial unique index (`class_id, student_id` where status is `HELD` or `CONFIRMED`) is a
  second, database-level guard for "one active application per student per class".
- Startup migrations take an advisory lock, so two processes starting together do not collide.
- The expiry sweeper uses `FOR UPDATE SKIP LOCKED`, so sweepers in different processes never
  wait on or deadlock with each other.

It is verified two ways: an automated test starts two independent backend instances against one
database and fires 200 simultaneous applications at 15 seats through both
(`ConcurrencyTests.Two_backend_processes_sharing_one_database_still_never_overbook`), and
`docker compose --profile two-backends up` runs a real second process on another port.

## Expiry

**A seat is free the instant its deadline passes.** Every query treats a `HELD` row whose
`expires_at` is in the past as expired, so no API call and no background job is needed for the
seat to come back or for the status to read `EXPIRED`. A background sweeper also runs every 5
seconds and writes `EXPIRED` into those rows, but that is housekeeping only; the tests switch it
off to prove the seat returns without it.

**`HOLD_DURATION_SECONDS` must be a positive whole number.** If it is set to something else
(e.g. `abc` or `0`) the backend refuses to start with a clear message, rather than silently using a
different duration. Unset or empty means the default, 600.

**Changing `HOLD_DURATION_SECONDS` affects new holds only.** Each hold stores its own deadline
when it is created; existing holds keep the deadline they were given.

**`expiresAt` is shown in whole seconds, UTC** (`2026-11-01T04:10:00Z`, as in the brief). The
exact deadline is kept with full precision in the database; the displayed value is rounded down,
so a client never believes it has more time than it really has.

## Students and applications

**`X-Student-Id` must be exactly 17 digits.** Missing or malformed is `400`. There is no login,
as the brief says, so the header is trusted as the student's identity.

**"One active application" is per class.** A student may apply to several classes (for example
the Morning and Day shifts) at the same time, because the brief makes each shift its own class and
states the rule per class.

**After a hold expires or is cancelled, the same student may apply again** to that class. It
creates a new application with a new `holdId`; the old one stays in "My applications" as history.

**A confirmed admission cannot be cancelled** through `DELETE /holds/{holdId}` (`409`). The fee
has been paid at that point, and undoing it would need a refund process the brief does not
describe. Only a `HELD` application can be cancelled.

**Cancelling is idempotent, confirming is idempotent.** Cancelling an already-cancelled hold is
`204` again. Confirming an already-confirmed hold is `200` again and `confirmedSeats` does not
change. Cancelling or confirming an **expired** hold is `409`.

**Someone else's hold is `403`.** Confirming or cancelling with a different `X-Student-Id` than
the owner's is refused and changes nothing.

**`GET /holds/{holdId}` needs no header** (the brief lists none) and therefore does not return
`studentId`, so a birth registration number is not exposed to whoever knows a hold ID. Hold IDs
are random (64 bits), not sequential, so they cannot be guessed.

## Classes

**Duplicate class names are allowed.** The brief does not forbid them and names carry no logic;
classes are identified by `id`. (Rejecting duplicates would also break repeated automated runs
against a database that keeps its data.)

**`totalSeats` must be a whole number from 1 to 100,000; `name` 1 to 200 characters.** A class
with zero seats is meaningless, and the upper limits only exist to reject obvious mistakes.

**Classes cannot be edited or deleted.** The brief defines no endpoint for it.

**No admin authentication.** The brief says no login; "school admin" is just the person using the
"create class" screen.

## API details

**Status codes:** `400` invalid input, `403` not your hold, `404` unknown class/hold/URL,
`409` the request is valid but not possible right now (class full, already applied, hold expired,
cancelled or already confirmed), `503` database unreachable. `500` is reserved for real bugs.

**Every error has the same JSON shape:** `{ "error": "MACHINE_CODE", "message": "readable text" }`.
The UI uses the code to show a message in the user's language.

**Responses contain a few extra fields** (allowed by the brief), such as `className` on holds and
the seat counts on the `POST /classes` response. No contract field is missing or renamed.

**CORS allows any origin**, because the UI runs on a different port and the API uses no cookies.

## Technology

**.NET 10 (LTS)** with ASP.NET Core minimal APIs. The brief allows ".NET 8 or newer".

**Dapper + plain SQL instead of a full ORM.** The guarantees in this system are database
guarantees (row lock, conditional `UPDATE`, partial unique index). Writing that SQL explicitly keeps
the critical path short and reviewable. Schema changes are plain `.sql` migration files applied at
startup.

**Tests run against a real PostgreSQL**, not an in-memory fake, because the behaviour being
tested is the database's locking.
