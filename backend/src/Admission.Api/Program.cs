using Admission.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Resolved lazily from IConfiguration so environment variables (and test overrides) are honoured.
builder.Services.AddSingleton(sp => AppSettings.FromConfiguration(sp.GetRequiredService<IConfiguration>()));

// The React UI is served from a different origin (another port), so the browser needs CORS.
// There are no cookies or credentials in this API, which makes allowing any origin safe.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Fail fast on a bad HOLD_DURATION_SECONDS / connection string instead of on the first request.
_ = app.Services.GetRequiredService<AppSettings>();

app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapFallback(() => ApiResults.NotFound("NOT_FOUND", "This URL does not exist."));

app.Run();

// Lets the integration tests start the real application with WebApplicationFactory<Program>.
public partial class Program;
