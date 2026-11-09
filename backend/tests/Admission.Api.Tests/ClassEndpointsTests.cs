using System.Net;
using System.Text.Json;
using Admission.Api.Tests.Support;

namespace Admission.Api.Tests;

public class ClassEndpointsTests(DefaultApiFactory factory) : IClassFixture<DefaultApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Creating_a_class_returns_201_with_the_contract_fields()
    {
        var response = await _client.SendAsync(HttpMethod.Post, "/classes",
            jsonBody: """{ "name": "Class 6 - Morning Shift", "totalSeats": 120 }""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.ReadJsonAsync();
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("id").GetString()));
        Assert.Equal("Class 6 - Morning Shift", json.GetProperty("name").GetString());
        Assert.Equal(120, json.GetProperty("totalSeats").GetInt32());
    }

    [Fact]
    public async Task A_new_class_is_listed_and_readable_with_all_seats_available()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 40, name: "Class 7 - Day Shift");

        var single = await (await _client.GetAsync($"/classes/{classId}")).ReadJsonAsync();
        var list = await (await _client.GetAsync("/classes")).ReadJsonAsync();
        var listed = list.EnumerateArray().Single(c => c.GetProperty("id").GetString() == classId);

        foreach (var json in new[] { single, listed })
        {
            Assert.Equal(classId, json.GetProperty("id").GetString());
            Assert.Equal("Class 7 - Day Shift", json.GetProperty("name").GetString());
            Assert.Equal(40, json.GetProperty("totalSeats").GetInt32());
            Assert.Equal(0, json.GetProperty("heldSeats").GetInt32());
            Assert.Equal(0, json.GetProperty("confirmedSeats").GetInt32());
            Assert.Equal(40, json.GetProperty("availableSeats").GetInt32());
        }
    }

    [Fact]
    public async Task Two_shifts_of_the_same_class_are_separate_classes_with_their_own_seats()
    {
        var morning = await _client.CreateClassAsync(totalSeats: 1, name: "Class 6 - Morning Shift");
        var day = await _client.CreateClassAsync(totalSeats: 1, name: "Class 6 - Day Shift");
        var student = ApiClient.NewStudentId();

        await _client.ApplyOkAsync(morning, student);

        Assert.Equal(0, (await _client.GetSeatsAsync(morning)).Available);
        Assert.Equal(1, (await _client.GetSeatsAsync(day)).Available);
        // The same student may also apply to the other shift: it is a different class.
        await _client.ApplyOkAsync(day, student);
    }

    [Theory]
    [InlineData("c_doesnotexist")]
    [InlineData("12345")]
    [InlineData("has%20space")]
    public async Task An_unknown_class_is_404(string classId)
    {
        var response = await _client.GetAsync($"/classes/{classId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("CLASS_NOT_FOUND", await response.ErrorCodeAsync());
    }

    [Theory]
    [InlineData("")]
    [InlineData("this is not json")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("""{ "totalSeats": 10 }""")]
    [InlineData("""{ "name": "A" }""")]
    [InlineData("""{ "name": "", "totalSeats": 10 }""")]
    [InlineData("""{ "name": "   ", "totalSeats": 10 }""")]
    [InlineData("""{ "name": 123, "totalSeats": 10 }""")]
    [InlineData("""{ "name": null, "totalSeats": 10 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 0 }""")]
    [InlineData("""{ "name": "A", "totalSeats": -5 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 1.5 }""")]
    [InlineData("""{ "name": "A", "totalSeats": "ten" }""")]
    [InlineData("""{ "name": "A", "totalSeats": null }""")]
    [InlineData("""{ "name": "A", "totalSeats": 99999999999999999999 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 10 """)]
    public async Task Invalid_input_is_400_never_500(string body)
    {
        var response = await _client.SendAsync(HttpMethod.Post, "/classes", jsonBody: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Every error has a machine code and a human-readable message.
        var json = await response.ReadJsonAsync();
        Assert.Equal(JsonValueKind.String, json.GetProperty("error").ValueKind);
        Assert.Equal(JsonValueKind.String, json.GetProperty("message").ValueKind);
    }

    [Fact]
    public async Task A_name_that_is_too_long_is_400()
    {
        var response = await _client.SendAsync(HttpMethod.Post, "/classes",
            jsonBody: JsonSerializer.Serialize(new { name = new string('x', 201), totalSeats = 10 }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_url_is_404_with_a_json_error()
    {
        var response = await _client.GetAsync("/no/such/url");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("NOT_FOUND", await response.ErrorCodeAsync());
    }
}
