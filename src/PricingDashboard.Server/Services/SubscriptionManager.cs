using System.Collections.Concurrent;
using System.Threading.Channels;
using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public interface ISubscriptionManager
{
    ChannelReader<YieldCurve> Subscribe(string sessionId, string topic);
    void Unsubscribe(string sessionId, string topic);
    void UnsubscribeAll(string sessionId);
}

public class SubscriptionManager : ISubscriptionManager
{
    private readonly IMarketDataService _marketDataService;
    private readonly ILogger<SubscriptionManager> _logger;
    private readonly ConcurrentDictionary<string, SharedSubscription> _sharedSubscriptions = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _sessionTopics = new();
    private readonly object _lock = new();

    public SubscriptionManager(
        IMarketDataService marketDataService,
        ILogger<SubscriptionManager> logger)
    {
        _marketDataService = marketDataService;
        _logger = logger;
    }

    public ChannelReader<YieldCurve> Subscribe(string sessionId, string topic)
    {
        lock (_lock)
        {
            var sharedSub = _sharedSubscriptions.GetOrAdd(topic, t => CreateSharedSubscription(t));
            var channel = sharedSub.AddSession(sessionId);

            var topics = _sessionTopics.GetOrAdd(sessionId, _ => new HashSet<string>());
            topics.Add(topic);

            _logger.LogInformation(
                "Session {SessionId} subscribed to {Topic}. Total sessions on topic: {Count}",
                sessionId, topic, sharedSub.SessionCount);

            return channel;
        }
    }

    public void Unsubscribe(string sessionId, string topic)
    {
        lock (_lock)
        {
            if (_sharedSubscriptions.TryGetValue(topic, out var sharedSub))
            {
                sharedSub.RemoveSession(sessionId);

                if (sharedSub.SessionCount == 0)
                {
                    _sharedSubscriptions.TryRemove(topic, out _);
                    sharedSub.Dispose();
                    _logger.LogInformation("Disposed shared subscription for {Topic}", topic);
                }
            }

            if (_sessionTopics.TryGetValue(sessionId, out var topics))
            {
                topics.Remove(topic);
            }
        }
    }

    public void UnsubscribeAll(string sessionId)
    {
        lock (_lock)
        {
            if (!_sessionTopics.TryRemove(sessionId, out var topics))
                return;

            foreach (var topic in topics)
            {
                if (_sharedSubscriptions.TryGetValue(topic, out var sharedSub))
                {
                    sharedSub.RemoveSession(sessionId);

                    if (sharedSub.SessionCount == 0)
                    {
                        _sharedSubscriptions.TryRemove(topic, out _);
                        sharedSub.Dispose();
                        _logger.LogInformation("Disposed shared subscription for {Topic}", topic);
                    }
                }
            }

            _logger.LogInformation("Unsubscribed session {SessionId} from all topics", sessionId);
        }
    }

    private SharedSubscription CreateSharedSubscription(string topic)
    {
        _logger.LogInformation("Creating shared subscription for {Topic}", topic);
        return new SharedSubscription(topic, _marketDataService, _logger);
    }

    private class SharedSubscription : IDisposable
    {
        private readonly string _topic;
        private readonly ILogger _logger;
        private readonly IDisposable _marketDataSubscription;
        private readonly ConcurrentDictionary<string, Channel<YieldCurve>> _sessionChannels = new();
        private YieldCurve? _latestCurve;

        public int SessionCount => _sessionChannels.Count;

        public SharedSubscription(string topic, IMarketDataService marketDataService, ILogger logger)
        {
            _topic = topic;
            _logger = logger;
            _marketDataSubscription = marketDataService.Subscribe(topic, OnCurveReceived);
        }

        private void OnCurveReceived(YieldCurve curve)
        {
            _latestCurve = curve;

            foreach (var (sessionId, channel) in _sessionChannels)
            {
                // Use TryWrite - if channel is full, drop the update (backpressure)
                if (!channel.Writer.TryWrite(curve))
                {
                    _logger.LogDebug(
                        "Dropped curve update for session {SessionId} on {Topic} - channel full",
                        sessionId, _topic);
                }
            }
        }

        public ChannelReader<YieldCurve> AddSession(string sessionId)
        {
            // Bounded channel with capacity 1 - always keep only latest
            var channel = Channel.CreateBounded<YieldCurve>(new BoundedChannelOptions(1)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = true
            });

            _sessionChannels[sessionId] = channel;

            // Send cached curve immediately if available
            if (_latestCurve != null)
            {
                channel.Writer.TryWrite(_latestCurve);
            }

            return channel.Reader;
        }

        public void RemoveSession(string sessionId)
        {
            if (_sessionChannels.TryRemove(sessionId, out var channel))
            {
                channel.Writer.Complete();
            }
        }

        public void Dispose()
        {
            _marketDataSubscription.Dispose();
            foreach (var channel in _sessionChannels.Values)
            {
                channel.Writer.Complete();
            }
            _sessionChannels.Clear();
        }
    }
}
