namespace Admission.Api.Data;

public static class HoldStatus
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

/// <summary>A class (one shift) together with its live seat counts.</summary>
public sealed class ClassSeats
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public int TotalSeats { get; init; }
    public int HeldSeats { get; init; }
    public int ConfirmedSeats { get; init; }
    public int AvailableSeats => TotalSeats - HeldSeats - ConfirmedSeats;
}

/// <summary>
/// An application as the outside world should see it: <see cref="Status"/> is already
/// EXPIRED once the deadline has passed, even if the row has not been swept yet.
/// </summary>
public sealed class Hold
{
    public string Id { get; init; } = "";
    public string ClassId { get; init; } = "";
    public string ClassName { get; init; } = "";
    public string StudentId { get; init; } = "";
    public string Status { get; init; } = "";
    public DateTime ExpiresAt { get; init; }
}

public enum CreateHoldOutcome
{
    Created,
    ClassNotFound,
    AlreadyApplied,
    NoSeatsAvailable,
}

public sealed record CreateHoldResult(CreateHoldOutcome Outcome, Hold? Hold = null);

public enum HoldActionOutcome
{
    /// <summary>The requested change was applied by this call.</summary>
    Done,
    /// <summary>The hold was already in the requested state (a repeated call).</summary>
    AlreadyDone,
    NotFound,
    NotOwner,
    Expired,
    Cancelled,
    Confirmed,
}

public sealed record HoldActionResult(HoldActionOutcome Outcome, Hold? Hold = null);
