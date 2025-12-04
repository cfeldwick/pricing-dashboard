using System.Collections.Concurrent;
using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public class FakeSolaceMarketDataService : IMarketDataService, IHostedService
{
    private readonly ILogger<FakeSolaceMarketDataService> _logger;
    private readonly ConcurrentDictionary<string, TopicSubscription> _subscriptions = new();
    private readonly ConcurrentDictionary<string, YieldCurve> _latestCurves = new();
    private CancellationTokenSource? _cts;
    private Task? _publishTask;
    private readonly Random _random = new();

    private static readonly string[] Tenors =
    {
        "1D", "1W", "2W", "1M", "2M", "3M", "6M", "9M",
        "1Y", "18M", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y", "15Y", "20Y", "25Y", "30Y"
    };

    private static readonly Dictionary<string, double> BaseCurves = new()
    {
        ["USD"] = 4.5,
        ["EUR"] = 3.2,
        ["GBP"] = 4.8,
        ["JPY"] = 0.5,
        ["CHF"] = 1.2
    };

    public FakeSolaceMarketDataService(ILogger<FakeSolaceMarketDataService> logger)
    {
        _logger = logger;
        InitializeBaseCurves();
    }

    private void InitializeBaseCurves()
    {
        foreach (var (currency, baseRate) in BaseCurves)
        {
            var topic = $"MARKET/YIELDCURVE/{currency}";
            _latestCurves[topic] = GenerateCurve(currency, baseRate, 0);
        }
    }

    private YieldCurve GenerateCurve(string currency, double baseRate, long sequence)
    {
        var points = new Dictionary<string, double>();
        var currentRate = baseRate;

        foreach (var tenor in Tenors)
        {
            var tenorYears = TenorToYears(tenor);
            var spread = tenorYears * 0.1 + (_random.NextDouble() - 0.5) * 0.02;
            points[tenor] = Math.Round(currentRate + spread, 4);
        }

        return new YieldCurve
        {
            Currency = currency,
            Timestamp = DateTime.UtcNow,
            SequenceNumber = sequence,
            Points = points
        };
    }

    private static double TenorToYears(string tenor)
    {
        if (tenor.EndsWith("D")) return int.Parse(tenor[..^1]) / 365.0;
        if (tenor.EndsWith("W")) return int.Parse(tenor[..^1]) / 52.0;
        if (tenor.EndsWith("M")) return int.Parse(tenor[..^1]) / 12.0;
        if (tenor.EndsWith("Y")) return int.Parse(tenor[..^1]);
        return 1.0;
    }

    public Task<YieldCurve?> GetHistoricalCurveAsync(string currency, DateTime asOfDate)
    {
        if (!BaseCurves.TryGetValue(currency, out var baseRate))
        {
            _logger.LogWarning("Unknown currency for historical curve: {Currency}", currency);
            return Task.FromResult<YieldCurve?>(null);
        }

        // Use a deterministic seed based on currency and date so same inputs give same outputs
        var seed = HashCode.Combine(currency, asOfDate.Date);
        var historicalRandom = new Random(seed);

        // Apply a date-based shift to simulate historical rates
        // More recent dates are closer to current rates
        var daysAgo = (DateTime.UtcNow.Date - asOfDate.Date).Days;
        var historicalShift = daysAgo * 0.001; // ~0.1% per 100 days difference
        var perturbedBase = baseRate - historicalShift + (historicalRandom.NextDouble() - 0.5) * 0.3;

        var curve = GenerateHistoricalCurve(currency, perturbedBase, historicalRandom, asOfDate);
        _logger.LogInformation("Generated historical curve for {Currency} as of {Date}", currency, asOfDate.Date);

        return Task.FromResult<YieldCurve?>(curve);
    }

    private YieldCurve GenerateHistoricalCurve(string currency, double baseRate, Random random, DateTime asOfDate)
    {
        var points = new Dictionary<string, double>();
        var currentRate = baseRate;

        foreach (var tenor in Tenors)
        {
            var tenorYears = TenorToYears(tenor);
            var spread = tenorYears * 0.1 + (random.NextDouble() - 0.5) * 0.02;
            points[tenor] = Math.Round(currentRate + spread, 4);
        }

        return new YieldCurve
        {
            Currency = currency,
            Timestamp = asOfDate,
            SequenceNumber = 0,
            Points = points
        };
    }

    public IDisposable Subscribe(string topic, Action<YieldCurve> onCurveReceived)
    {
        var subscription = _subscriptions.GetOrAdd(topic, _ => new TopicSubscription(topic));
        var handler = subscription.AddHandler(onCurveReceived);

        _logger.LogInformation("New subscription to {Topic}, total handlers: {Count}",
            topic, subscription.HandlerCount);

        if (_latestCurves.TryGetValue(topic, out var latestCurve))
        {
            _logger.LogInformation("Sending cached curve for {Topic}", topic);
            onCurveReceived(latestCurve);
        }

        return new SubscriptionHandle(() =>
        {
            subscription.RemoveHandler(handler);
            _logger.LogInformation("Removed subscription from {Topic}, remaining handlers: {Count}",
                topic, subscription.HandlerCount);

            if (subscription.HandlerCount == 0)
            {
                _subscriptions.TryRemove(topic, out _);
                _logger.LogInformation("Removed topic {Topic} - no more subscribers", topic);
            }
        });
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting Fake Solace Market Data Service");
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _publishTask = PublishCurvesAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping Fake Solace Market Data Service");
        _cts?.Cancel();
        if (_publishTask != null)
        {
            await _publishTask;
        }
    }

    private async Task PublishCurvesAsync(CancellationToken cancellationToken)
    {
        long sequence = 1;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(500 + _random.Next(500)), cancellationToken);

                foreach (var (currency, baseRate) in BaseCurves)
                {
                    var topic = $"MARKET/YIELDCURVE/{currency}";

                    if (!_subscriptions.ContainsKey(topic))
                        continue;

                    var perturbedBase = baseRate + (_random.NextDouble() - 0.5) * 0.1;
                    var curve = GenerateCurve(currency, perturbedBase, sequence);
                    _latestCurves[topic] = curve;

                    if (_subscriptions.TryGetValue(topic, out var subscription))
                    {
                        _logger.LogDebug("Publishing curve for {Currency}, seq {Seq}", currency, sequence);
                        subscription.Publish(curve);
                    }
                }

                sequence++;
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error publishing curves");
            }
        }
    }

    private class TopicSubscription
    {
        private readonly string _topic;
        private readonly List<Action<YieldCurve>> _handlers = new();
        private readonly object _lock = new();

        public TopicSubscription(string topic) => _topic = topic;

        public int HandlerCount
        {
            get { lock (_lock) return _handlers.Count; }
        }

        public Action<YieldCurve> AddHandler(Action<YieldCurve> handler)
        {
            lock (_lock) _handlers.Add(handler);
            return handler;
        }

        public void RemoveHandler(Action<YieldCurve> handler)
        {
            lock (_lock) _handlers.Remove(handler);
        }

        public void Publish(YieldCurve curve)
        {
            List<Action<YieldCurve>> handlers;
            lock (_lock) handlers = _handlers.ToList();

            foreach (var handler in handlers)
            {
                try
                {
                    handler(curve);
                }
                catch
                {
                    // Handler errors shouldn't affect other handlers
                }
            }
        }
    }

    private class SubscriptionHandle : IDisposable
    {
        private readonly Action _onDispose;
        private bool _disposed;

        public SubscriptionHandle(Action onDispose) => _onDispose = onDispose;

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _onDispose();
        }
    }
}
