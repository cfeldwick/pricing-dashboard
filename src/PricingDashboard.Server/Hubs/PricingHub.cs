using System.Runtime.CompilerServices;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using PricingDashboard.Server.Models;
using PricingDashboard.Server.Services;

namespace PricingDashboard.Server.Hubs;

public class PricingHub : Hub
{
    private readonly ITemplateService _templateService;
    private readonly ISubscriptionManager _subscriptionManager;
    private readonly IPricingService _pricingService;
    private readonly ILogger<PricingHub> _logger;

    public PricingHub(
        ITemplateService templateService,
        ISubscriptionManager subscriptionManager,
        IPricingService pricingService,
        ILogger<PricingHub> logger)
    {
        _templateService = templateService;
        _subscriptionManager = subscriptionManager;
        _pricingService = pricingService;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        _subscriptionManager.UnsubscribeAll(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public IReadOnlyList<string> GetCurrencies()
    {
        return _templateService.GetAvailableCurrencies();
    }

    public CurrencyInfo? GetCurrencyInfo(string currency)
    {
        return _templateService.GetCurrencyInfo(currency);
    }

    public async IAsyncEnumerable<PriceUpdate> StreamPrices(
        StreamRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Starting price stream for {Currency} with {Count} instruments",
            request.Currency, request.Instruments.Count);

        var template = _templateService.CreateInjectedTemplate(request.Currency, request.Instruments);
        if (template == null)
        {
            _logger.LogWarning("Failed to create template for {Currency}", request.Currency);
            yield break;
        }

        var curveChannel = _subscriptionManager.Subscribe(Context.ConnectionId, template.CurveTopic);
        long sequence = 0;

        try
        {
            await foreach (var curve in curveChannel.ReadAllAsync(cancellationToken))
            {
                // Calculate prices for all instruments
                var prices = _pricingService.CalculatePrices(template, curve);

                sequence++;
                var update = new PriceUpdate
                {
                    Currency = request.Currency,
                    Prices = prices,
                    CurveTimestamp = curve.Timestamp,
                    SequenceNumber = sequence
                };

                _logger.LogDebug(
                    "Sending price update seq {Seq} for {Currency}",
                    sequence, request.Currency);

                yield return update;
            }
        }
        finally
        {
            _subscriptionManager.Unsubscribe(Context.ConnectionId, template.CurveTopic);
            _logger.LogInformation(
                "Ended price stream for {Currency}, sent {Count} updates",
                request.Currency, sequence);
        }
    }

    public void StopStream()
    {
        _logger.LogInformation("Stop stream requested by {ConnectionId}", Context.ConnectionId);
        _subscriptionManager.UnsubscribeAll(Context.ConnectionId);
    }
}
