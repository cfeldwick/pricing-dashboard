using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PricingDashboard.Server.Models;
using SolaceSystems.Solclient.Messaging;

namespace PricingDashboard.Server.Services;

public class SolaceMarketDataService : IMarketDataService, IHostedService, IDisposable
{
    private readonly ILogger<SolaceMarketDataService> _logger;
    private readonly SolaceConfiguration _config;
    private readonly ConcurrentDictionary<string, TopicSubscription> _subscriptions = new();
    private readonly ConcurrentDictionary<string, YieldCurve> _cachedCurves = new();
    private readonly JsonSerializerOptions _jsonOptions;

    private IContext? _context;
    private ISession? _session;
    private bool _isConnected;
    private readonly object _connectionLock = new();

    public SolaceMarketDataService(
        ILogger<SolaceMarketDataService> logger,
        IOptions<SolaceConfiguration> config)
    {
        _logger = logger;
        _config = config.Value;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting Solace Market Data Service");
        _logger.LogInformation("Connecting to {Host}, VPN: {Vpn}, Kerberos: {UseKerberos}",
            _config.Host, _config.VpnName, _config.UseKerberos);

        try
        {
            await Task.Run(() => InitializeSolace(), cancellationToken);
            _logger.LogInformation("Solace Market Data Service started successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start Solace Market Data Service");
            throw;
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping Solace Market Data Service");

        await Task.Run(() =>
        {
            lock (_connectionLock)
            {
                foreach (var subscription in _subscriptions.Values)
                {
                    subscription.Dispose();
                }
                _subscriptions.Clear();

                if (_session != null)
                {
                    _session.Disconnect();
                    _session.Dispose();
                    _session = null;
                }

                if (_context != null)
                {
                    _context.Dispose();
                    _context = null;
                }

                _isConnected = false;
            }
        }, cancellationToken);

        _logger.LogInformation("Solace Market Data Service stopped");
    }

    private void InitializeSolace()
    {
        lock (_connectionLock)
        {
            // Initialize Solace API
            var contextFactoryProperties = new ContextFactoryProperties();
            ContextFactory.Instance.Init(contextFactoryProperties);

            // Create context
            var contextProperties = new ContextProperties();
            _context = ContextFactory.Instance.CreateContext(contextProperties, null);

            // Create session properties
            var sessionProperties = new SessionProperties
            {
                Host = _config.Host,
                VPNName = _config.VpnName,
                ConnectTimeoutInMsecs = _config.ConnectTimeoutMs,
                ReconnectRetries = _config.ReconnectRetries,
                ReconnectRetriesWaitInMsecs = _config.ReconnectRetryIntervalMs,
            };

            if (_config.UseKerberos)
            {
                sessionProperties.AuthenticationScheme = AuthenticationSchemes.AUTHENTICATION_SCHEME_GSS_KRB;
                sessionProperties.KRBServiceName = _config.KerberosServiceName;
                _logger.LogInformation("Using Kerberos authentication with service name: {ServiceName}",
                    _config.KerberosServiceName);
            }
            else
            {
                sessionProperties.AuthenticationScheme = AuthenticationSchemes.AUTHENTICATION_SCHEME_BASIC;
                sessionProperties.UserName = _config.Username;
                sessionProperties.Password = _config.Password;
            }

            // Create and connect session
            _session = _context.CreateSession(
                sessionProperties,
                HandleMessage,
                HandleSessionEvent);

            var result = _session.Connect();
            if (result != ReturnCode.CYCLIENT_OK)
            {
                throw new InvalidOperationException($"Failed to connect to Solace: {result}");
            }

            _isConnected = true;
            _logger.LogInformation("Connected to Solace broker successfully");
        }
    }

    private void HandleSessionEvent(object? sender, SessionEventArgs args)
    {
        _logger.LogInformation("Solace session event: {Event}, Info: {Info}",
            args.Event, args.Info);

        switch (args.Event)
        {
            case SessionEvent.UpNotice:
                _isConnected = true;
                _logger.LogInformation("Solace session is UP");
                ResubscribeAll();
                break;

            case SessionEvent.DownError:
            case SessionEvent.ConnectFailedError:
                _isConnected = false;
                _logger.LogWarning("Solace session is DOWN: {Info}", args.Info);
                break;

            case SessionEvent.Reconnecting:
                _logger.LogInformation("Solace session reconnecting...");
                break;

            case SessionEvent.Reconnected:
                _isConnected = true;
                _logger.LogInformation("Solace session reconnected");
                ResubscribeAll();
                break;
        }
    }

    private void HandleMessage(object? sender, MessageEventArgs args)
    {
        try
        {
            var message = args.Message;
            var topic = message.Destination?.Name;

            if (string.IsNullOrEmpty(topic))
            {
                _logger.LogWarning("Received message with no destination");
                return;
            }

            // Get message content
            var content = message.BinaryAttachment;
            if (content == null || content.Length == 0)
            {
                _logger.LogWarning("Received empty message on topic {Topic}", topic);
                return;
            }

            // Deserialize yield curve
            var curve = DeserializeYieldCurve(content, topic);
            if (curve == null)
            {
                return;
            }

            // Cache the curve
            _cachedCurves[topic] = curve;

            // Notify subscribers
            if (_subscriptions.TryGetValue(topic, out var subscription))
            {
                subscription.NotifyHandlers(curve);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling Solace message");
        }
        finally
        {
            args.Message.Dispose();
        }
    }

    private YieldCurve? DeserializeYieldCurve(byte[] content, string topic)
    {
        try
        {
            // Try to deserialize as JSON
            var curve = JsonSerializer.Deserialize<YieldCurve>(content, _jsonOptions);
            return curve;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize yield curve from topic {Topic}", topic);

            // Try alternative format - you may need to adjust this based on your actual message format
            try
            {
                var json = System.Text.Encoding.UTF8.GetString(content);
                _logger.LogDebug("Raw message content: {Content}", json);

                // Attempt to parse a different structure if needed
                var curve = JsonSerializer.Deserialize<YieldCurve>(json, _jsonOptions);
                return curve;
            }
            catch
            {
                _logger.LogError("Could not parse message content from topic {Topic}", topic);
                return null;
            }
        }
    }

    public IDisposable Subscribe(string topic, Action<YieldCurve> onCurveReceived)
    {
        var subscription = _subscriptions.GetOrAdd(topic, t => CreateSubscription(t));
        var handler = subscription.AddHandler(onCurveReceived);

        _logger.LogInformation("New subscription to {Topic}, total handlers: {Count}",
            topic, subscription.HandlerCount);

        // Send cached curve if available
        if (_cachedCurves.TryGetValue(topic, out var cachedCurve))
        {
            _logger.LogDebug("Sending cached curve for {Topic}", topic);
            try
            {
                onCurveReceived(cachedCurve);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending cached curve to handler");
            }
        }

        return new SubscriptionHandle(() =>
        {
            subscription.RemoveHandler(handler);
            _logger.LogInformation("Removed handler from {Topic}, remaining handlers: {Count}",
                topic, subscription.HandlerCount);

            if (subscription.HandlerCount == 0)
            {
                if (_subscriptions.TryRemove(topic, out var removed))
                {
                    removed.Dispose();
                    _logger.LogInformation("Unsubscribed from topic {Topic}", topic);
                }
            }
        });
    }

    private TopicSubscription CreateSubscription(string topic)
    {
        _logger.LogInformation("Creating subscription for topic {Topic}", topic);

        var subscription = new TopicSubscription(topic, _logger);

        if (_isConnected && _session != null)
        {
            SubscribeToTopic(topic);
        }

        return subscription;
    }

    private void SubscribeToTopic(string topic)
    {
        if (_session == null || !_isConnected)
        {
            _logger.LogWarning("Cannot subscribe to {Topic} - session not connected", topic);
            return;
        }

        try
        {
            var solaceTopic = ContextFactory.Instance.CreateTopic(topic);
            var result = _session.Subscribe(solaceTopic, true);

            if (result != ReturnCode.CYCLIENT_OK)
            {
                _logger.LogError("Failed to subscribe to {Topic}: {Result}", topic, result);
            }
            else
            {
                _logger.LogInformation("Successfully subscribed to Solace topic {Topic}", topic);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error subscribing to topic {Topic}", topic);
        }
    }

    private void UnsubscribeFromTopic(string topic)
    {
        if (_session == null || !_isConnected)
        {
            return;
        }

        try
        {
            var solaceTopic = ContextFactory.Instance.CreateTopic(topic);
            _session.Unsubscribe(solaceTopic, true);
            _logger.LogInformation("Unsubscribed from Solace topic {Topic}", topic);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unsubscribing from topic {Topic}", topic);
        }
    }

    private void ResubscribeAll()
    {
        _logger.LogInformation("Resubscribing to {Count} topics after reconnect", _subscriptions.Count);

        foreach (var topic in _subscriptions.Keys)
        {
            SubscribeToTopic(topic);
        }
    }

    public void Dispose()
    {
        StopAsync(CancellationToken.None).GetAwaiter().GetResult();
        ContextFactory.Instance.Cleanup();
    }

    private class TopicSubscription : IDisposable
    {
        private readonly string _topic;
        private readonly ILogger _logger;
        private readonly List<Action<YieldCurve>> _handlers = new();
        private readonly object _lock = new();

        public TopicSubscription(string topic, ILogger logger)
        {
            _topic = topic;
            _logger = logger;
        }

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

        public void NotifyHandlers(YieldCurve curve)
        {
            List<Action<YieldCurve>> handlers;
            lock (_lock) handlers = _handlers.ToList();

            foreach (var handler in handlers)
            {
                try
                {
                    handler(curve);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in curve handler for topic {Topic}", _topic);
                }
            }
        }

        public void Dispose()
        {
            lock (_lock) _handlers.Clear();
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
