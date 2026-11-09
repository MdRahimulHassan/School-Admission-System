using System.Text.Json;
using System.Text.RegularExpressions;
using Admission.Api.Infrastructure;

namespace Admission.Api.Endpoints;

/// <summary>Input checks shared by the endpoints. Every failure is a 4xx with a clear message, never a 500.</summary>
public static partial class RequestValidation
{
    public const string StudentIdHeader = "X-Student-Id";

    [GeneratedRegex("^[0-9]{17}$")]
    private static partial Regex StudentIdPattern();

    // IDs we generate look like "c_9f2c4e1ab07d3356". Anything else cannot exist, so it is simply "not found".
    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex ResourceIdPattern();

    public static bool IsPlausibleId(string? id) => id is not null && ResourceIdPattern().IsMatch(id);

    /// <summary>Reads the student's 17-digit birth registration number from the X-Student-Id header.</summary>
    public static bool TryGetStudentId(HttpRequest request, out string studentId, out IResult? error)
    {
        studentId = "";
        error = null;

        var values = request.Headers[StudentIdHeader];
        if (values.Count == 0 || string.IsNullOrWhiteSpace(values[0]))
        {
            error = ApiResults.BadRequest("STUDENT_ID_REQUIRED",
                $"The {StudentIdHeader} header is required. It must be the student's 17-digit birth registration number.");
            return false;
        }

        var candidate = values.Count == 1 ? values[0]!.Trim() : "";
        if (!StudentIdPattern().IsMatch(candidate))
        {
            error = ApiResults.BadRequest("STUDENT_ID_INVALID",
                $"The {StudentIdHeader} header must be exactly 17 digits (the student's birth registration number).");
            return false;
        }

        studentId = candidate;
        return true;
    }

    /// <summary>
    /// Reads the request body as a JSON object. Done by hand (rather than automatic model binding) so that
    /// malformed JSON, a missing body or a wrong type always produces a helpful 400.
    /// </summary>
    public static async Task<(JsonElement? Body, IResult? Error)> ReadJsonObjectAsync(HttpRequest request, CancellationToken ct)
    {
        try
        {
            using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return (null, ApiResults.BadRequest("INVALID_BODY", "The request body must be a JSON object."));
            }

            return (document.RootElement.Clone(), null);
        }
        catch (JsonException)
        {
            return (null, ApiResults.BadRequest("INVALID_JSON", "The request body is missing or is not valid JSON."));
        }
    }
}
