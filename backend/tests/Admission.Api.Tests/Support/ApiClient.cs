using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Admission.Api.Tests.Support;

/// <summary>Small helpers so the tests read like the API contract.</summary>
public static class ApiClient
{
    public const string StudentIdHeader = "X-Student-Id";

    private static long _studentCounter = Random.Shared.NextInt64(1_000_000_000_000_000, 8_000_000_000_000_000);

    /// <summary>A fresh, valid 17-digit birth registration number.</summary>
    public static string NewStudentId() => "2" + Interlocked.Increment(ref _studentCounter).ToString("D16");

    public static Task<HttpResponseMessage> SendAsync(
        this HttpClient client, HttpMethod method, string url, string? studentId = null, string? jsonBody = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (studentId is not null)
        {
            request.Headers.TryAddWithoutValidation(StudentIdHeader, studentId);
        }
        if (jsonBody is not null)
        {
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    public static async Task<string> CreateClassAsync(this HttpClient client, int totalSeats, string? name = null)
    {
        var response = await client.PostAsJsonAsync("/classes", new { name = name ?? $"Class {Guid.NewGuid():N}", totalSeats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.ReadJsonAsync()).GetProperty("id").GetString()!;
    }

    public static Task<HttpResponseMessage> ApplyAsync(this HttpClient client, string classId, string? studentId) =>
        client.SendAsync(HttpMethod.Post, $"/classes/{classId}/holds", studentId);

    /// <summary>Applies and returns the new holdId, failing the test if the seat was not granted.</summary>
    public static async Task<string> ApplyOkAsync(this HttpClient client, string classId, string studentId)
    {
        var response = await client.ApplyAsync(classId, studentId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.ReadJsonAsync()).GetProperty("holdId").GetString()!;
    }

    public static Task<HttpResponseMessage> ConfirmAsync(this HttpClient client, string holdId, string? studentId) =>
        client.SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", studentId);

    public static Task<HttpResponseMessage> CancelAsync(this HttpClient client, string holdId, string? studentId) =>
        client.SendAsync(HttpMethod.Delete, $"/holds/{holdId}", studentId);

    public static async Task<(int Total, int Held, int Confirmed, int Available)> GetSeatsAsync(this HttpClient client, string classId)
    {
        var response = await client.GetAsync($"/classes/{classId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.ReadJsonAsync();
        return (json.GetProperty("totalSeats").GetInt32(), json.GetProperty("heldSeats").GetInt32(),
            json.GetProperty("confirmedSeats").GetInt32(), json.GetProperty("availableSeats").GetInt32());
    }

    public static async Task<string> GetHoldStatusAsync(this HttpClient client, string holdId)
    {
        var response = await client.GetAsync($"/holds/{holdId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.ReadJsonAsync()).GetProperty("status").GetString()!;
    }

    public static async Task<string> ErrorCodeAsync(this HttpResponseMessage response) =>
        (await response.ReadJsonAsync()).GetProperty("error").GetString()!;
}
