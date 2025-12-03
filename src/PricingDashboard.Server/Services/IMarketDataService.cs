using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public interface IMarketDataService
{
    IDisposable Subscribe(string topic, Action<YieldCurve> onCurveReceived);
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Load a historical yield curve for a specific date (one-off, non-streaming)
    /// </summary>
    Task<YieldCurve?> GetHistoricalCurveAsync(string currency, DateTime asOfDate);
}
