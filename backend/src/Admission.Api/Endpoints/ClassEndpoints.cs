using System.Text.Json;
using Admission.Api.Data;
using Admission.Api.Infrastructure;

namespace Admission.Api.Endpoints;

public sealed record ClassResponse(
    string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats)
{
    public static ClassResponse From(ClassSeats c) =>
        new(c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, c.AvailableSeats);
}

public static class ClassEndpoints
{
    public const int MaxNameLength = 200;
    public const int MaxTotalSeats = 100_000;

    public static void MapClassEndpoints(this IEndpointRouteBuilder app)
    {
        // 1. POST /classes : create a class (one shift = one class)
        app.MapPost("/classes", async (HttpRequest request, AdmissionStore store, CancellationToken ct) =>
        {
            var (body, error) = await RequestValidation.ReadJsonObjectAsync(request, ct);
            if (error is not null)
            {
                return error;
            }

            if (!body!.Value.TryGetProperty("name", out var nameElement)
                || nameElement.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(nameElement.GetString()))
            {
                return ApiResults.BadRequest("NAME_REQUIRED", "\"name\" is required and must be a non-empty text.");
            }

            var name = nameElement.GetString()!.Trim();
            if (name.Length > MaxNameLength || name.Contains('\0'))
            {
                return ApiResults.BadRequest("NAME_INVALID", $"\"name\" must be at most {MaxNameLength} characters.");
            }

            if (!body.Value.TryGetProperty("totalSeats", out var seatsElement)
                || seatsElement.ValueKind != JsonValueKind.Number
                || !seatsElement.TryGetInt32(out var totalSeats)
                || totalSeats < 1
                || totalSeats > MaxTotalSeats)
            {
                return ApiResults.BadRequest("TOTAL_SEATS_INVALID",
                    $"\"totalSeats\" is required and must be a whole number between 1 and {MaxTotalSeats}.");
            }

            var created = await store.CreateClassAsync(name, totalSeats, ct);
            return Results.Json(ClassResponse.From(created), statusCode: StatusCodes.Status201Created);
        });

        // 2. GET /classes : every class with its seat counts
        app.MapGet("/classes", async (AdmissionStore store, CancellationToken ct) =>
        {
            var classes = await store.ListClassesAsync(ct);
            return Results.Json(classes.Select(ClassResponse.From));
        });

        // 3. GET /classes/{classId} : seat counts of one class
        app.MapGet("/classes/{classId}", async (string classId, AdmissionStore store, CancellationToken ct) =>
        {
            var found = RequestValidation.IsPlausibleId(classId) ? await store.GetClassAsync(classId, ct) : null;
            return found is null
                ? ApiResults.NotFound("CLASS_NOT_FOUND", "This class does not exist.")
                : Results.Json(ClassResponse.From(found));
        });
    }
}
