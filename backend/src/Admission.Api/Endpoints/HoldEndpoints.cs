using System.Globalization;
using Admission.Api.Data;
using Admission.Api.Infrastructure;

namespace Admission.Api.Endpoints;

/// <summary>
/// Shape used by every hold response. It is a superset of what the API contract asks for:
/// studentId is only filled in for the student who owns the hold (it is omitted from the
/// public GET /holds/{holdId}, which needs no X-Student-Id header).
/// remainingSeconds is the time left by the server's clock (0 unless HELD), so a client can show a
/// correct countdown even when its own clock is wrong.
/// </summary>
public sealed record HoldResponse(
    string HoldId, string ClassId, string ClassName, string? StudentId, string Status, string ExpiresAt,
    double RemainingSeconds)
{
    public static HoldResponse From(Hold hold, bool includeStudentId) =>
        new(hold.Id, hold.ClassId, hold.ClassName, includeStudentId ? hold.StudentId : null,
            hold.Status, FormatUtc(hold.ExpiresAt), Math.Round(hold.RemainingSeconds, 1));

    /// <summary>ISO 8601 in UTC with whole seconds, exactly like the contract example "2026-11-01T04:10:00Z".</summary>
    private static string FormatUtc(DateTime value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
}

public static class HoldEndpoints
{
    private static IResult HoldNotFound() =>
        ApiResults.NotFound("HOLD_NOT_FOUND", "This application does not exist.");

    private static IResult NotOwner() =>
        ApiResults.Forbidden("NOT_YOUR_HOLD", "This application belongs to a different student.");

    public static void MapHoldEndpoints(this IEndpointRouteBuilder app)
    {
        // 4. POST /classes/{classId}/holds : apply, i.e. hold a seat for a limited time
        app.MapPost("/classes/{classId}/holds", async (
            string classId, HttpRequest request, AdmissionStore store, AppSettings settings, CancellationToken ct) =>
        {
            if (!RequestValidation.TryGetStudentId(request, out var studentId, out var error))
            {
                return error!;
            }

            var result = RequestValidation.IsPlausibleId(classId)
                ? await store.CreateHoldAsync(classId, studentId, settings.HoldDurationSeconds, ct)
                : new CreateHoldResult(CreateHoldOutcome.ClassNotFound);

            return result.Outcome switch
            {
                CreateHoldOutcome.Created => Results.Json(
                    HoldResponse.From(result.Hold!, includeStudentId: true), statusCode: StatusCodes.Status201Created),
                CreateHoldOutcome.ClassNotFound => ApiResults.NotFound("CLASS_NOT_FOUND", "This class does not exist."),
                CreateHoldOutcome.AlreadyApplied => ApiResults.Conflict("ALREADY_APPLIED",
                    "This student already has an active application or a confirmed admission in this class."),
                _ => ApiResults.Conflict("NO_SEATS_AVAILABLE", "No seats are available in this class right now."),
            };
        });

        // 5. GET /holds/{holdId} : current state of an application
        app.MapGet("/holds/{holdId}", async (string holdId, AdmissionStore store, CancellationToken ct) =>
        {
            var hold = RequestValidation.IsPlausibleId(holdId) ? await store.GetHoldAsync(holdId, ct) : null;
            return hold is null ? HoldNotFound() : Results.Json(HoldResponse.From(hold, includeStudentId: false));
        });

        // 6. POST /holds/{holdId}/confirm : admission fee paid, admission confirmed
        app.MapPost("/holds/{holdId}/confirm", async (
            string holdId, HttpRequest request, AdmissionStore store, CancellationToken ct) =>
        {
            if (!RequestValidation.TryGetStudentId(request, out var studentId, out var error))
            {
                return error!;
            }

            var result = RequestValidation.IsPlausibleId(holdId)
                ? await store.ConfirmHoldAsync(holdId, studentId, ct)
                : new HoldActionResult(HoldActionOutcome.NotFound);

            return result.Outcome switch
            {
                // A repeated confirm gets the same 200 again; the seat is still counted only once.
                HoldActionOutcome.Done or HoldActionOutcome.AlreadyDone =>
                    Results.Json(HoldResponse.From(result.Hold!, includeStudentId: true)),
                HoldActionOutcome.NotFound => HoldNotFound(),
                HoldActionOutcome.NotOwner => NotOwner(),
                HoldActionOutcome.Cancelled => ApiResults.Conflict("HOLD_CANCELLED",
                    "This application was cancelled and can no longer be confirmed."),
                _ => ApiResults.Conflict("HOLD_EXPIRED",
                    "The time to pay the admission fee has run out. The seat has been released; please apply again."),
            };
        });

        // 7. DELETE /holds/{holdId} : cancel an application and free the seat
        app.MapDelete("/holds/{holdId}", async (
            string holdId, HttpRequest request, AdmissionStore store, CancellationToken ct) =>
        {
            if (!RequestValidation.TryGetStudentId(request, out var studentId, out var error))
            {
                return error!;
            }

            var result = RequestValidation.IsPlausibleId(holdId)
                ? await store.CancelHoldAsync(holdId, studentId, ct)
                : new HoldActionResult(HoldActionOutcome.NotFound);

            return result.Outcome switch
            {
                // Cancelling twice is harmless: the application is cancelled either way.
                HoldActionOutcome.Done or HoldActionOutcome.AlreadyDone => Results.NoContent(),
                HoldActionOutcome.NotFound => HoldNotFound(),
                HoldActionOutcome.NotOwner => NotOwner(),
                HoldActionOutcome.Confirmed => ApiResults.Conflict("HOLD_ALREADY_CONFIRMED",
                    "This admission is already confirmed and cannot be cancelled here."),
                _ => ApiResults.Conflict("HOLD_EXPIRED",
                    "This application has already expired; there is nothing left to cancel."),
            };
        });

        // 8. GET /me/holds : every application of this student, newest first
        app.MapGet("/me/holds", async (HttpRequest request, AdmissionStore store, CancellationToken ct) =>
        {
            if (!RequestValidation.TryGetStudentId(request, out var studentId, out var error))
            {
                return error!;
            }

            var holds = await store.ListHoldsForStudentAsync(studentId, ct);
            return Results.Json(holds.Select(hold => HoldResponse.From(hold, includeStudentId: true)));
        });
    }
}
