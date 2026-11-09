using System.Net;
using Admission.Api.Tests.Support;

namespace Admission.Api.Tests;

/// <summary>
/// The core promise of the system: however many requests arrive together,
/// held + confirmed never exceeds totalSeats.
/// </summary>
public class ConcurrencyTests(DefaultApiFactory factory) : IClassFixture<DefaultApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Many_simultaneous_applications_never_hold_more_seats_than_the_class_has()
    {
        const int seats = 10;
        const int applicants = 200;
        var classId = await _client.CreateClassAsync(totalSeats: seats);

        // While the rush is on, keep reading the seat counts and check the invariant at every instant we can observe.
        using var stopWatching = new CancellationTokenSource();
        var watcher = Task.Run(async () =>
        {
            var observations = 0;
            while (!stopWatching.IsCancellationRequested)
            {
                var (total, held, confirmed, available) = await _client.GetSeatsAsync(classId);
                Assert.True(held + confirmed <= total, $"Overbooked: held={held} confirmed={confirmed} total={total}");
                Assert.Equal(total - held - confirmed, available);
                observations++;
            }
            return observations;
        });

        // 200 different students apply at the same moment for 10 seats.
        var startTogether = new TaskCompletionSource();
        var requests = Enumerable.Range(0, applicants).Select(async _ =>
        {
            var student = ApiClient.NewStudentId();
            await startTogether.Task;
            return await _client.ApplyAsync(classId, student);
        }).ToList();
        startTogether.SetResult();
        var responses = await Task.WhenAll(requests);

        stopWatching.Cancel();
        Assert.True(await watcher > 0);

        var granted = responses.Where(r => r.StatusCode == HttpStatusCode.Created).ToList();
        var refused = responses.Where(r => r.StatusCode == HttpStatusCode.Conflict).ToList();
        Assert.Equal(seats, granted.Count);                    // exactly the seats that exist, not one more
        Assert.Equal(applicants - seats, refused.Count);       // everyone else gets a clean 409, nobody a 500
        foreach (var response in refused)
        {
            Assert.Equal("NO_SEATS_AVAILABLE", await response.ErrorCodeAsync());
        }

        var holdIds = new HashSet<string>();
        foreach (var response in granted)
        {
            holdIds.Add((await response.ReadJsonAsync()).GetProperty("holdId").GetString()!);
        }
        Assert.Equal(seats, holdIds.Count);
        Assert.Equal((seats, seats, 0, 0), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Two_backend_processes_sharing_one_database_still_never_overbook()
    {
        // Bonus requirement. Each factory is a complete, independent backend (its own services,
        // its own connection pool, its own sweeper); the only thing they share is PostgreSQL.
        await using var secondBackend = new ApiFactory();
        var clients = new[] { _client, secondBackend.CreateClient() };

        const int seats = 15;
        const int applicants = 200;
        var classId = await _client.CreateClassAsync(totalSeats: seats);

        var startTogether = new TaskCompletionSource();
        var requests = Enumerable.Range(0, applicants).Select(async i =>
        {
            var student = ApiClient.NewStudentId();
            await startTogether.Task;
            return await clients[i % 2].ApplyAsync(classId, student);   // alternate between the two backends
        }).ToList();
        startTogether.SetResult();
        var responses = await Task.WhenAll(requests);

        Assert.Equal(seats, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(applicants - seats, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        // Both backends report the same, correct numbers.
        Assert.Equal((seats, seats, 0, 0), await clients[0].GetSeatsAsync(classId));
        Assert.Equal((seats, seats, 0, 0), await clients[1].GetSeatsAsync(classId));
    }

    [Fact]
    public async Task The_same_student_applying_many_times_at_once_gets_exactly_one_seat()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 50);
        var student = ApiClient.NewStudentId();

        var startTogether = new TaskCompletionSource();
        var requests = Enumerable.Range(0, 40).Select(async _ =>
        {
            await startTogether.Task;
            return await _client.ApplyAsync(classId, student);
        }).ToList();
        startTogether.SetResult();
        var responses = await Task.WhenAll(requests);

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(39, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal((50, 1, 0, 49), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Confirming_one_hold_many_times_at_once_increases_confirmed_seats_exactly_once()
    {
        var classId = await _client.CreateClassAsync(totalSeats: 5);
        var student = ApiClient.NewStudentId();
        var holdId = await _client.ApplyOkAsync(classId, student);

        var startTogether = new TaskCompletionSource();
        var requests = Enumerable.Range(0, 40).Select(async _ =>
        {
            await startTogether.Task;
            return await _client.ConfirmAsync(holdId, student);
        }).ToList();
        startTogether.SetResult();
        var responses = await Task.WhenAll(requests);

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal((5, 0, 1, 4), await _client.GetSeatsAsync(classId));
    }

    [Fact]
    public async Task Seats_freed_by_cancelling_during_a_rush_are_reused_without_overbooking()
    {
        const int seats = 5;
        var classId = await _client.CreateClassAsync(totalSeats: seats);

        // Fill the class, then let everyone cancel and 100 new students apply, all at the same time.
        var owners = new List<(string Student, string HoldId)>();
        for (var i = 0; i < seats; i++)
        {
            var student = ApiClient.NewStudentId();
            owners.Add((student, await _client.ApplyOkAsync(classId, student)));
        }

        var startTogether = new TaskCompletionSource();
        var cancels = owners.Select(async owner =>
        {
            await startTogether.Task;
            return await _client.CancelAsync(owner.HoldId, owner.Student);
        }).ToList();
        var applies = Enumerable.Range(0, 100).Select(async _ =>
        {
            var student = ApiClient.NewStudentId();
            await startTogether.Task;
            return await _client.ApplyAsync(classId, student);
        }).ToList();
        startTogether.SetResult();
        await Task.WhenAll(cancels);
        var responses = await Task.WhenAll(applies);

        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }));
        var (total, held, confirmed, available) = await _client.GetSeatsAsync(classId);
        Assert.True(held + confirmed <= total);
        Assert.Equal(responses.Count(r => r.StatusCode == HttpStatusCode.Created), held);
        Assert.Equal(total - held, available);
    }
}
