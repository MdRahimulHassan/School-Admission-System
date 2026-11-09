namespace Admission.Api.Infrastructure;

/// <summary>Body of every non-2xx response: a stable machine code plus a readable message.</summary>
public sealed record ErrorResponse(string Error, string Message);

public static class ApiResults
{
    public static IResult Error(int statusCode, string code, string message) =>
        Results.Json(new ErrorResponse(code, message), statusCode: statusCode);

    public static IResult BadRequest(string code, string message) =>
        Error(StatusCodes.Status400BadRequest, code, message);

    public static IResult NotFound(string code, string message) =>
        Error(StatusCodes.Status404NotFound, code, message);

    public static IResult Forbidden(string code, string message) =>
        Error(StatusCodes.Status403Forbidden, code, message);

    public static IResult Conflict(string code, string message) =>
        Error(StatusCodes.Status409Conflict, code, message);
}
