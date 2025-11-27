using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public interface IMarketDataService
{
    IDisposable Subscribe(string topic, Action<YieldCurve> onCurveReceived);
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}
