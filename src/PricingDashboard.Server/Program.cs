using PricingDashboard.Server.Hubs;
using PricingDashboard.Server.Models;
using PricingDashboard.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Bind Solace configuration
builder.Services.Configure<SolaceConfiguration>(
    builder.Configuration.GetSection(SolaceConfiguration.SectionName));

// Register market data service based on configuration
var solaceConfig = builder.Configuration
    .GetSection(SolaceConfiguration.SectionName)
    .Get<SolaceConfiguration>() ?? new SolaceConfiguration();

if (solaceConfig.Enabled)
{
    builder.Services.AddSingleton<IMarketDataService, SolaceMarketDataService>();
    builder.Services.AddHostedService(sp => (SolaceMarketDataService)sp.GetRequiredService<IMarketDataService>());
    Console.WriteLine("Using REAL Solace market data service");
}
else
{
    builder.Services.AddSingleton<IMarketDataService, FakeSolaceMarketDataService>();
    builder.Services.AddHostedService(sp => (FakeSolaceMarketDataService)sp.GetRequiredService<IMarketDataService>());
    Console.WriteLine("Using FAKE Solace market data service (demo mode)");
}

// Register other application services
builder.Services.AddSingleton<ISubscriptionManager, SubscriptionManager>();
builder.Services.AddSingleton<ITemplateService, TemplateService>();
builder.Services.AddSingleton<IPricingService, PricingService>();

var app = builder.Build();

// Configure middleware
app.UseCors();

// Map endpoints
app.MapHub<PricingHub>("/hubs/pricing");

// Health check endpoint
app.MapGet("/health", (IMarketDataService marketDataService) => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    marketDataService = marketDataService.GetType().Name
}));

// API endpoints for non-streaming operations
app.MapGet("/api/currencies", (ITemplateService templateService) =>
    templateService.GetAvailableCurrencies());

app.MapGet("/api/currencies/{currency}", (string currency, ITemplateService templateService) =>
{
    var info = templateService.GetCurrencyInfo(currency);
    return info != null ? Results.Ok(info) : Results.NotFound();
});

// Historical prices endpoint - one-off request for comparison columns
app.MapPost("/api/historical-prices", async (
    HistoricalPriceRequest request,
    IMarketDataService marketDataService,
    ITemplateService templateService,
    IPricingService pricingService,
    ILogger<Program> logger) =>
{
    logger.LogInformation("Historical price request for {Currency} as of {Date} with {Count} instruments",
        request.Currency, request.AsOfDate, request.Instruments.Count);

    // Get historical curve for the requested date
    var curve = await marketDataService.GetHistoricalCurveAsync(request.Currency, request.AsOfDate);
    if (curve == null)
    {
        logger.LogWarning("Could not retrieve historical curve for {Currency} as of {Date}",
            request.Currency, request.AsOfDate);
        return Results.NotFound(new { error = "Historical curve not available" });
    }

    // Create template for pricing
    var template = templateService.CreateInjectedTemplate(request.Currency, request.Instruments);
    if (template == null)
    {
        logger.LogWarning("Failed to create template for {Currency}", request.Currency);
        return Results.BadRequest(new { error = "Invalid currency or instruments" });
    }

    // Calculate prices using the historical curve
    var prices = pricingService.CalculatePrices(template, curve);

    var response = new HistoricalPriceResponse
    {
        Currency = request.Currency,
        AsOfDate = request.AsOfDate,
        Prices = prices
    };

    return Results.Ok(response);
});

app.Run();
