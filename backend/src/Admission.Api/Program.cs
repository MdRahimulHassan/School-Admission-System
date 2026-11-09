using System.Text.Json.Serialization;
using Admission.Api.Data;
using Admission.Api.Endpoints;
using Admission.Api.Infrastructure;
using Npgsql;

// Database columns are snake_case (total_seats), C# properties are PascalCase (TotalSeats).
Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);

// Resolved lazily from IConfiguration so environment variables (and test overrides) are honoured.
builder.Services.AddSingleton(sp => AppSettings.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
builder.Services.AddSingleton(sp => NpgsqlDataSource.Create(sp.GetRequiredService<AppSettings>().ConnectionString));
builder.Services.AddSingleton<DatabaseMigrator>();
builder.Services.AddSingleton<AdmissionStore>();

// Leave out fields that have no value instead of sending "field": null.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);

// The React UI is served from a different origin (another port), so the browser needs CORS.
// There are no cookies or credentials in this API, which makes allowing any origin safe.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Fail fast on a bad HOLD_DURATION_SECONDS / connection string instead of on the first request.
_ = app.Services.GetRequiredService<AppSettings>();

// Create or upgrade the schema before accepting any traffic.
await app.Services.GetRequiredService<DatabaseMigrator>().MigrateAsync(app.Lifetime.ApplicationStopping);

app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapClassEndpoints();
app.MapHoldEndpoints();

app.MapFallback(() => ApiResults.NotFound("NOT_FOUND", "This URL does not exist."));

app.Run();

// Lets the integration tests start the real application with WebApplicationFactory<Program>.
public partial class Program;
