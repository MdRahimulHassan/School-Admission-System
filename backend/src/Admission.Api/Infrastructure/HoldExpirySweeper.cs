using Admission.Api.Data;

namespace Admission.Api.Infrastructure;

/// <summary>
/// Background job that marks overdue HELD rows as EXPIRED every few seconds, with no API call needed.
///
/// Correctness does not depend on it: every query already treats a HELD row past its deadline as
/// expired, so a seat is free the very instant its hold runs out. The sweeper just keeps the stored
/// status in line with reality. It is safe to run in several backend processes at once.
/// </summary>
public sealed class HoldExpirySweeper(
    AdmissionStore store, AppSettings settings, ILogger<HoldExpirySweeper> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(settings.SweepIntervalSeconds));
        try
        {
            do
            {
                try
                {
                    var expired = await store.ExpireOverdueHoldsAsync(stoppingToken);
                    if (expired > 0)
                    {
                        logger.LogInformation("Released {Count} expired seat hold(s)", expired);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // e.g. the database restarted. Try again on the next tick instead of killing the app.
                    logger.LogWarning(ex, "Expiry sweep failed; will retry");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown.
        }
    }
}
