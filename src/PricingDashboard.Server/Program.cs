using PricingDashboard.Server.Hubs;
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

// Register application services
builder.Services.AddSingleton<IMarketDataService, FakeSolaceMarketDataService>();
builder.Services.AddHostedService(sp => (FakeSolaceMarketDataService)sp.GetRequiredService<IMarketDataService>());
builder.Services.AddSingleton<ISubscriptionManager, SubscriptionManager>();
builder.Services.AddSingleton<ITemplateService, TemplateService>();
builder.Services.AddSingleton<IPricingService, PricingService>();

var app = builder.Build();

// Configure middleware
app.UseCors();

// Map endpoints
app.MapHub<PricingHub>("/hubs/pricing");

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// API endpoints for non-streaming operations
app.MapGet("/api/currencies", (ITemplateService templateService) =>
    templateService.GetAvailableCurrencies());

app.MapGet("/api/currencies/{currency}", (string currency, ITemplateService templateService) =>
{
    var info = templateService.GetCurrencyInfo(currency);
    return info != null ? Results.Ok(info) : Results.NotFound();
});

app.Run();
