using Npgsql;

namespace Admission.Api.Infrastructure;

/// <summary>
/// Last line of defence: turns anything an endpoint did not handle into a JSON error.
/// Bad requests stay 4xx, an unreachable database becomes 503, and only a genuine bug is a 500.
/// </summary>
public sealed class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The client went away; there is nobody left to answer.
        }
        catch (BadHttpRequestException ex)
        {
            await WriteAsync(context, ex.StatusCode is >= 400 and < 500 ? ex.StatusCode : 400,
                "BAD_REQUEST", "The request could not be read. Check the URL, headers and JSON body.");
        }
        catch (Exception ex) when (IsDatabaseUnavailable(ex))
        {
            logger.LogError(ex, "Database is unavailable");
            await WriteAsync(context, StatusCodes.Status503ServiceUnavailable,
                "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error for {Method} {Path}", context.Request.Method, context.Request.Path);
            await WriteAsync(context, StatusCodes.Status500InternalServerError,
                "INTERNAL_ERROR", "Something went wrong on the server.");
        }
    }

    private static bool IsDatabaseUnavailable(Exception ex) => ex switch
    {
        // 08 = connection exception, 53 = insufficient resources (e.g. too many connections),
        // 57P = operator intervention (server shutting down / restarting).
        PostgresException pg => pg.SqlState.StartsWith("08") || pg.SqlState.StartsWith("53") || pg.SqlState.StartsWith("57P"),
        // Any other NpgsqlException is a transport problem: cannot connect, broken socket, pool exhausted.
        NpgsqlException => true,
        TimeoutException => true,
        _ => false,
    };

    private static async Task WriteAsync(HttpContext context, int statusCode, string code, string message)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsJsonAsync(new ErrorResponse(code, message));
    }
}
