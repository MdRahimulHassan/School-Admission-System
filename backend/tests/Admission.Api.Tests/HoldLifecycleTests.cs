using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using Admission.Api.Tests.Support;

namespace Admission.Api.Tests;

public class HoldLifecycleTests(DefaultApiFactory factory) : IClassFixture<DefaultApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    // ------------------------------------------------------------------ apply

    [Fact]
    public async Task Applying_holds_a_seat_and_returns_201_with_the_contract_fields()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var before = DateTime.UtcNow;

        var response = await _client.ApplyAsync(classId, student);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.ReadJsonAsync();
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("holdId").GetString()));
        Assert.Equal(classId, json.GetProperty("classId").GetString());
        Assert.Equal(student, json.GetProperty("studentId").GetString());
        Assert.Equal("HELD", json.GetProperty("status").GetString());

        // expiresAt has the contract's format (UTC, whole seconds, "Z") and is HOLD_DURATION_SECONDS (600) ahead.
        var expiresAtText = json.GetProperty("expiresAt").GetString()!;
        Assert.Matches(new Regex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"), expiresAtText);
        var expiresAt = DateTime.Parse(expiresAtText, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);
        Assert.InRange((expiresAt - before).TotalSeconds, 590, 610);
        // Extra field: time left by the server's clock, for a countdown that ignores the client's clock.
        Assert.InRange(json.GetProperty("remainingSeconds").GetDouble(), 590, 600);

        Assert.Equal((5, 1, 0, 4), await _client.GetSeatsAsync(classId));
    }

    [Theory]
    [InlineData(null)]                     // header missing
    [InlineData("")]
    [InlineData("12345")]                  // too short
    [InlineData("201526912345678901")]     // 18 digits
    [InlineData("2015269123456789")]       // 16 digits
    [InlineData("2015269123456789X")]      // not all digits
    [InlineData("20152691 234567890")]
    public async Task Student_id_must_be_a_17_digit_number_on_every_student_endpoint(string? studentId)
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var holdId = await _client.ApplyOkAsync(classId, ApiClient.NewStudentId());

        var responses = new[]
        {
            await _client.ApplyAsync(classId, studentId),
            await _client.ConfirmAsync(holdId, studentId),
            await _client.CancelAsync(holdId, studentId),
            await _client.SendAsync(HttpMethod.Get, "/me/holds", studentId),
        };

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode));
        // Nothing was changed by the rejected calls.
        Assert.Equal("HELD", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((5, 1, 0, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Applying_to_an_unknown_class_is_404()
    {
        var response = await _client.ApplyAsync("c_doesnotexist", ApiClient.NewStudentId());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("CLASS_NOT_FOUND", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task A_student_cannot_have_two_active_applications_in_the_same_class()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        await _client.ApplyOkAsync(classId, student);

        var second = await _client.ApplyAsync(classId, student);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("ALREADY_APPLIED", await second.ErrorCodeAsync());
        Assert.Equal((5, 1, 0, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task A_student_with_a_confirmed_admission_cannot_apply_to_that_class_again()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        await _client.ConfirmAsync(holdId, student);

        var again = await _client.ApplyAsync(classId, student);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("ALREADY_APPLIED", await again.ErrorCodeAsync());
        Assert.Equal((5, 0, 1, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Applying_to_a_full_class_is_409()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 2);
        var confirmedStudent = ApiClient.NewStudentId();
        var confirmedHold = await _client.ApplyOkAsync(classId, confirmedStudent);
        await _client.ConfirmAsync(confirmedHold, confirmedStudent);   // one seat confirmed
        await _client.ApplyOkAsync(classId, ApiClient.NewStudentId()); // one seat held

        var response = await _client.ApplyAsync(classId, ApiClient.NewStudentId());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("NO_SEATS_AVAILABLE", await response.ErrorCodeAsync());
        Assert.Equal((2, 1, 1, 0), await _client.GetSeatsAsync(classId));
    }

    // ----------------------------------------------------------------- status

    [Fact]
    public async Task Hold_status_endpoint_returns_the_contract_fields()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var holdId = await _client.ApplyOkAsync(classId, ApiClient.NewStudentId());

        var response = await _client.GetAsync($"/holds/{holdId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.ReadJsonAsync();
        Assert.Equal(holdId, json.GetProperty("holdId").GetString());
        Assert.Equal(classId, json.GetProperty("classId").GetString());
        Assert.Equal("HELD", json.GetProperty("status").GetString());
        Assert.Matches(new Regex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"), json.GetProperty("expiresAt").GetString()!);
    }

    [Fact]
    public async Task An_unknown_hold_is_404_on_every_hold_endpoint()
    {
        var student = ApiClient.NewStudentId();

        var responses = new[]
        {
            await _client.GetAsync("/holds/h_doesnotexist"),
            await _client.ConfirmAsync("h_doesnotexist", student),
            await _client.CancelAsync("h_doesnotexist", student),
        };

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));
    }

    // ---------------------------------------------------------------- confirm

    [Fact]
    public async Task Confirming_turns_a_held_seat_into_a_confirmed_seat()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);

        var response = await _client.ConfirmAsync(holdId, student);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.ReadJsonAsync();
        Assert.Equal(holdId, json.GetProperty("holdId").GetString());
        Assert.Equal("CONFIRMED", json.GetProperty("status").GetString());
        Assert.Equal(0, json.GetProperty("remainingSeconds").GetDouble());
        Assert.Equal("CONFIRMED", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((5, 0, 1, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Confirming_the_same_hold_repeatedly_counts_the_seat_only_once()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);

        for (var i = 0; i < 5; i++)
        {
            var response = await _client.ConfirmAsync(holdId, student);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("CONFIRMED", (await response.ReadJsonAsync()).GetProperty("status").GetString());
        }

        Assert.Equal((5, 0, 1, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Only_the_owner_can_confirm_or_cancel_a_hold()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var holdId = await _client.ApplyOkAsync(classId, ApiClient.NewStudentId());
        var someoneElse = ApiClient.NewStudentId();

        var confirm = await _client.ConfirmAsync(holdId, someoneElse);
        var cancel = await _client.CancelAsync(holdId, someoneElse);

        Assert.Equal(HttpStatusCode.Forbidden, confirm.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, cancel.StatusCode);
        Assert.Equal("HELD", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((5, 1, 0, 4), await _client.GetSeatsAsync(classId));
    }

    // ----------------------------------------------------------------- cancel

    [Fact]
    public async Task Cancelling_returns_204_and_frees_the_seat_for_others_and_for_the_same_student()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 1);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        Assert.Equal((1, 1, 0, 0), await _client.GetSeatsAsync(classId));

        var response = await _client.CancelAsync(holdId, student);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("CANCELLED", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((1, 0, 0, 1), await _client.GetSeatsAsync(classId));

        // Cancelling again is harmless.
        Assert.Equal(HttpStatusCode.NoContent, (await _client.CancelAsync(holdId, student)).StatusCode);

        // The student may apply again, which creates a new application.
        var newHoldId = await _client.ApplyOkAsync(classId, student);
        Assert.NotEqual(holdId, newHoldId);
    }

    [Fact]
    public async Task A_cancelled_hold_cannot_be_confirmed()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        await _client.CancelAsync(holdId, student);

        var response = await _client.ConfirmAsync(holdId, student);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("HOLD_CANCELLED", await response.ErrorCodeAsync());
        Assert.Equal((5, 0, 0, 5), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task A_confirmed_admission_cannot_be_cancelled()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);
        await _client.ConfirmAsync(holdId, student);

        var response = await _client.CancelAsync(holdId, student);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("HOLD_ALREADY_CONFIRMED", await response.ErrorCodeAsync());
        Assert.Equal("CONFIRMED", await _client.GetHoldStatusAsync(holdId));
        Assert.Equal((5, 0, 1, 4), await _client.GetSeatsAsync(classId));
    }

    // --------------------------------------------------------------- my holds

    [Fact]
    public async Task My_holds_lists_only_this_students_applications_with_class_names()
    {
        var morning = await _client.CreateClassAsync(totalSeats: 5, name: "Class 8 - Morning Shift");
        var day = await _client.CreateClassAsync(totalSeats: 5, name: "Class 8 - Day Shift");
        var student = ApiClient.NewStudentId();
        var heldId = await _client.ApplyOkAsync(morning, student);
        var confirmedId = await _client.ApplyOkAsync(day, student);
        await _client.ConfirmAsync(confirmedId, student);
        await _client.ApplyOkAsync(morning, ApiClient.NewStudentId()); // somebody else's application

        var response = await _client.SendAsync(HttpMethod.Get, "/me/holds", student);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var holds = (await response.ReadJsonAsync()).EnumerateArray().ToList();
        Assert.Equal(2, holds.Count);

        var held = holds.Single(h => h.GetProperty("holdId").GetString() == heldId);
        Assert.Equal(morning, held.GetProperty("classId").GetString());
        Assert.Equal("Class 8 - Morning Shift", held.GetProperty("className").GetString());
        Assert.Equal("HELD", held.GetProperty("status").GetString());
        Assert.False(string.IsNullOrWhiteSpace(held.GetProperty("expiresAt").GetString()));

        var confirmed = holds.Single(h => h.GetProperty("holdId").GetString() == confirmedId);
        Assert.Equal("Class 8 - Day Shift", confirmed.GetProperty("className").GetString());
        Assert.Equal("CONFIRMED", confirmed.GetProperty("status").GetString());
    }

    [Fact]
    public async Task My_holds_is_an_empty_list_for_a_student_who_never_applied()
    {
        var response = await _client.SendAsync(HttpMethod.Get, "/me/holds", ApiClient.NewStudentId());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.ReadJsonAsync()).EnumerateArray());
    }
}
