using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

// Every test talks to the same real PostgreSQL, and several tests wait on real time,
// so run test classes one after another to keep connection usage and timings predictable.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Admission.Api.Tests.Support;

public static class TestDatabase
{
    /// <summary>
    /// The tests run against a real PostgreSQL, because the seat guarantee lives in database locks.
    /// docker-compose.test.yml provides one and sets TEST_DB_CONNECTION_STRING.
    /// </summary>
    public static string ConnectionString { get; } =
        Environment.GetEnvironmentVariable("TEST_DB_CONNECTION_STRING")
        ?? "Host=127.0.0.1;Port=54329;Database=admission;Username=admission;Password=admission;Maximum Pool Size=20";
}

/// <summary>
/// Boots the real application in memory (same Program.cs, routing, middleware and SQL as production),
/// pointed at the test database. One instance behaves like one backend process.
/// </summary>
public class ApiFactory(int holdDurationSeconds = 600, int sweepIntervalSeconds = 1) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DB_CONNECTION_STRING"] = TestDatabase.ConnectionString,
            ["HOLD_DURATION_SECONDS"] = holdDurationSeconds.ToString(),
            ["EXPIRY_SWEEP_INTERVAL_SECONDS"] = sweepIntervalSeconds.ToString(),
        }));
    }
}

/// <summary>Default settings: holds last 10 minutes.</summary>
public sealed class DefaultApiFactory() : ApiFactory(holdDurationSeconds: 600);

/// <summary>
/// Holds last 2 seconds and the background sweeper is effectively switched off (once an hour),
/// which proves that an overdue hold frees its seat by itself, without the sweeper or any API call.
/// </summary>
public sealed class ShortHoldApiFactory() : ApiFactory(holdDurationSeconds: 2, sweepIntervalSeconds: 3600);
