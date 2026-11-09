using Admission.Api.Tests.Support;

namespace Admission.Api.Tests;

public class PersistenceTests
{
    [Fact]
    public async Task Data_survives_a_backend_restart()
    {
        string classId, heldId, confirmedId;
        var student = ApiClient.NewStudentId();
        var otherStudent = ApiClient.NewStudentId();

        // First run of the backend.
        await using (var firstRun = new ApiFactory())
        {
            var client = firstRun.CreateClient();
            classId = await client.CreateClassAsync(totalSeats: 3, name: "Class 9 - Morning Shift");
            heldId = await client.ApplyOkAsync(classId, student);
            confirmedId = await client.ApplyOkAsync(classId, otherStudent);
            await client.ConfirmAsync(confirmedId, otherStudent);
        }

        // The backend is gone; start a brand new one against the same database.
        await using var secondRun = new ApiFactory();
        var restarted = secondRun.CreateClient();

        Assert.Equal((3, 1, 1, 1), await restarted.GetSeatsAsync(classId));
        Assert.Equal("HELD", await restarted.GetHoldStatusAsync(heldId));
        Assert.Equal("CONFIRMED", await restarted.GetHoldStatusAsync(confirmedId));

        // The student can carry on where they left off.
        var myHolds = await (await restarted.SendAsync(HttpMethod.Get, "/me/holds", student)).ReadJsonAsync();
        Assert.Equal(heldId, myHolds.EnumerateArray().Single().GetProperty("holdId").GetString());
        Assert.True((await restarted.ConfirmAsync(heldId, student)).IsSuccessStatusCode);
    }
}
