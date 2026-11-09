using Npgsql;

namespace Admission.Api.Infrastructure;

/// <summary>
/// Runtime settings. Everything here can be changed with environment variables,
/// so the same build runs locally, in Docker and in tests.
/// </summary>
public sealed record AppSettings(string ConnectionString, int HoldDurationSeconds, int SweepIntervalSeconds)
{
    public const string ConnectionStringKey = "DB_CONNECTION_STRING";
    public const string HoldDurationKey = "HOLD_DURATION_SECONDS";
    public const string SweepIntervalKey = "EXPIRY_SWEEP_INTERVAL_SECONDS";

    public const int DefaultHoldDurationSeconds = 600;
    public const int DefaultSweepIntervalSeconds = 5;

    private const string DefaultConnectionString =
        "Host=localhost;Port=5432;Database=admission;Username=admission;Password=admission";

    public static AppSettings FromConfiguration(IConfiguration configuration)
    {
        var rawConnection = configuration[ConnectionStringKey];
        var connectionString = WithDriverDefaults(NormalizeConnectionString(
            string.IsNullOrWhiteSpace(rawConnection) ? DefaultConnectionString : rawConnection.Trim()));

        return new AppSettings(
            connectionString,
            ReadPositiveInt(configuration, HoldDurationKey, DefaultHoldDurationSeconds),
            ReadPositiveInt(configuration, SweepIntervalKey, DefaultSweepIntervalSeconds));
    }

    /// <summary>
    /// Accepts both the Npgsql keyword format ("Host=...;Database=...") and the
    /// URL format ("postgres://user:pass@host:5432/db") that many hosts hand out.
    /// </summary>
    private static string NormalizeConnectionString(string value)
    {
        var isUrl = value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
                    || value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);
        if (!isUrl)
        {
            return value;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException($"{ConnectionStringKey} is not a valid PostgreSQL URL.");
        }

        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
        };
        if (userInfo.Length > 1)
        {
            builder.Password = Uri.UnescapeDataString(userInfo[1]);
        }

        return builder.ConnectionString;
    }

    /// <summary>
    /// The driver otherwise probes for Kerberos (GSS) encryption on every new connection. The slim
    /// runtime image has no Kerberos library, so each probe logs an error before falling back.
    /// Switch the probe off unless the connection string asks for it explicitly.
    /// </summary>
    private static string WithDriverDefaults(string connectionString)
    {
        NpgsqlConnectionStringBuilder builder;
        try
        {
            builder = new NpgsqlConnectionStringBuilder(connectionString);
        }
        catch (ArgumentException ex)
        {
            throw new InvalidOperationException($"{ConnectionStringKey} is not a valid connection string: {ex.Message}");
        }

        if (!connectionString.Contains("Gss", StringComparison.OrdinalIgnoreCase))
        {
            builder.GssEncryptionMode = GssEncryptionMode.Disable;
        }

        return builder.ConnectionString;
    }

    private static int ReadPositiveInt(IConfiguration configuration, string key, int defaultValue)
    {
        var raw = configuration[key];
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        // A typo here would silently change how long seats stay reserved, so refuse to start instead.
        if (!int.TryParse(raw.Trim(), out var value) || value <= 0)
        {
            throw new InvalidOperationException(
                $"{key} must be a positive whole number of seconds, but was '{raw}'.");
        }

        return value;
    }
}
