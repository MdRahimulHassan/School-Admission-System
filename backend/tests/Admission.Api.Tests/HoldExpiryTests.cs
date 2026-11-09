using System.Net;
using Admission.Api.Tests.Support;
using Dapper;
using Npgsql;

namespace Admission.Api.Tests;

/// <summary>
/// Holds last 2 seconds here, and the background sweeper does not run during these tests,
/// so everything below is the seat coming back purely because its deadline passed.
/// </summary>
public class HoldExpiryTests(ShortHoldApiFactory factory) : IClassFixture<ShortHoldApiFactory>
{
    private static readonly TimeSpan PastTheDeadline = TimeSpan.FromSeconds(3);

    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task An_unpaid_hold_expires_by_itself_and_the_seat_returns_without_any_api_call()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 1);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        Assert.Equal((1, 1, 0, 0), await _client.GetSeatsAsync(classId));

        await Task.Delay(PastTheDeadline);

        // The very first thing we do after waiting is read the seat counts.
        Assert.Equal((1, 0, 0, 1), await _client.GetSeatsAsync(classId));
        Assert.Equal("EXPIRED", await _client.GetHoldStatusAsync(holdId));

        var myHolds = await (await _client.SendAsync(HttpMethod.Get, "/me/holds", student)).ReadJsonAsync();
        Assert.Equal("EXPIRED", myHolds.EnumerateArray().Single().GetProperty("status").GetString());
    }

    [Fact]
    public async Task An_expired_hold_can_be_neither_confirmed_nor_cancelled()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 1);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);

        await Task.Delay(PastTheDeadline);
        var confirm = await _client.ConfirmAsync(holdId, student);
        var cancel = await _client.CancelAsync(holdId, student);

        Assert.Equal(HttpStatusCode.Conflict, confirm.StatusCode);
        Assert.Equal("HOLD_EXPIRED", await confirm.ErrorCodeAsync());
        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);
        Assert.Equal("EXPIRED", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((1, 0, 0, 1), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task After_expiry_the_seat_can_be_taken_by_someone_else_and_the_student_may_apply_again()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 2);
        var student = ApiClient.NewStudentId();
        var firstHold = await _client.ApplyOkAsync(classId, student);
        await _client.ApplyOkAsync(classId, ApiClient.NewStudentId());
        Assert.Equal(HttpStatusCode.Conflict, (await _client.ApplyAsync(classId, ApiClient.NewStudentId())).StatusCode);

        await Task.Delay(PastTheDeadline);

        var secondHold = await _client.ApplyOkAsync(classId, student);       // same student, new application
        await _client.ApplyOkAsync(classId, ApiClient.NewStudentId());       // a different student
        Assert.NotEqual(firstHold, secondHold);
        Assert.Equal("EXPIRED", await _client.GetHoldStatusAsync(firstHold));
        Assert.Equal("HELD", await _client.GetHoldStatusAsync(secondHold));
        Assert.Equal((2, 2, 0, 0), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task A_hold_confirmed_in_time_never_expires()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 1);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        Assert.Equal(HttpStatusCode.OK, (await _client.ConfirmAsync(holdId, student)).StatusCode);

        await Task.Delay(PastTheDeadline);

        Assert.Equal("CONFIRMED", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((1, 0, 1, 0), await _client.GetSeatsAsync(classId));
        Assert.Equal(HttpStatusCode.Conflict, (await _client.ApplyAsync(classId, ApiClient.NewStudentId())).StatusCode);
    }

    [Fact]
    public async Task The_background_sweeper_marks_overdue_rows_as_expired_in_the_database()
    {
        // A separate backend instance whose sweeper runs every second, with 1-second holds.
        await using var sweeping = new ApiFactory(holdDurationSeconds: 1, sweepIntervalSeconds: 1);
        var client = sweeping.CreateClient();
        var classId = await client.CreateClassAsync(totalSeats: 1);
        var holdId = await client.ApplyOkAsync(classId, ApiClient.NewStudentId());

        // Look at the stored row directly, without calling any API in between.
        await using var connection = new NpgsqlConnection(TestDatabase.ConnectionString);
        var storedStatus = "";
        for (var attempt = 0; attempt < 20 && storedStatus != "EXPIRED"; attempt++)
        {
            await Task.Delay(500);
            storedStatus = await connection.QuerySingleAsync<string>(
                "SELECT status FROM holds WHERE id = @holdId", new { holdId });
        }

        Assert.Equal("EXPIRED", storedStatus);
    }
}
