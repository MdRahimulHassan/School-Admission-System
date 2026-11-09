using System.Reflection;
using Dapper;
using Npgsql;

namespace Admission.Api.Data;

/// <summary>
/// Applies the embedded *.sql scripts in name order, each exactly once.
/// Runs at startup so a fresh database (first "docker compose up") is ready without manual steps.
/// </summary>
public sealed class DatabaseMigrator(NpgsqlDataSource dataSource, ILogger<DatabaseMigrator> logger)
{
    // Arbitrary constant. Two backend processes starting together both try to migrate;
    // the advisory lock makes the second one wait until the first has finished.
    private const long MigrationLockKey = 727_274_001;

    private const int MaxConnectAttempts = 30;
    private static readonly TimeSpan ConnectRetryDelay = TimeSpan.FromSeconds(2);

    public async Task MigrateAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenWithRetryAsync(cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            "SELECT pg_advisory_lock(@key)", new { key = MigrationLockKey }, cancellationToken: cancellationToken));
        try
        {
            await connection.ExecuteAsync(new CommandDefinition(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version    text        PRIMARY KEY,
                    applied_at timestamptz NOT NULL DEFAULT now()
                )
                """, cancellationToken: cancellationToken));

            var applied = (await connection.QueryAsync<string>(new CommandDefinition(
                "SELECT version FROM schema_migrations", cancellationToken: cancellationToken))).ToHashSet();

            foreach (var (version, sql) in LoadScripts())
            {
                if (applied.Contains(version))
                {
                    continue;
                }

                // Script + bookkeeping row commit together: a crash can never leave a half-applied migration.
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                await connection.ExecuteAsync(new CommandDefinition(sql, transaction: transaction, cancellationToken: cancellationToken));
                await connection.ExecuteAsync(new CommandDefinition(
                    "INSERT INTO schema_migrations (version) VALUES (@version)",
                    new { version }, transaction, cancellationToken: cancellationToken));
                await transaction.CommitAsync(cancellationToken);

                logger.LogInformation("Applied database migration {Version}", version);
            }
        }
        finally
        {
            await connection.ExecuteAsync("SELECT pg_advisory_unlock(@key)", new { key = MigrationLockKey });
        }
    }

    /// <summary>The database container may still be starting when the backend boots, so wait for it.</summary>
    private async Task<NpgsqlConnection> OpenWithRetryAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await dataSource.OpenConnectionAsync(cancellationToken);
            }
            catch (Exception ex) when (ex is NpgsqlException or TimeoutException && attempt < MaxConnectAttempts)
            {
                logger.LogWarning("Database not reachable yet (attempt {Attempt}/{Max}): {Message}",
                    attempt, MaxConnectAttempts, ex.Message);
                await Task.Delay(ConnectRetryDelay, cancellationToken);
            }
        }
    }

    private static IEnumerable<(string Version, string Sql)> LoadScripts()
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string marker = ".Data.Migrations.";

        return assembly.GetManifestResourceNames()
            .Where(name => name.Contains(marker) && name.EndsWith(".sql", StringComparison.OrdinalIgnoreCase))
            .OrderBy(name => name, StringComparer.Ordinal)
            .Select(name =>
            {
                using var stream = assembly.GetManifestResourceStream(name)!;
                using var reader = new StreamReader(stream);
                var version = name[(name.IndexOf(marker, StringComparison.Ordinal) + marker.Length)..^".sql".Length];
                return (version, reader.ReadToEnd());
            })
            .ToList();
    }
}
