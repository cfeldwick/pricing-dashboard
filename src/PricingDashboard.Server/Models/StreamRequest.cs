namespace PricingDashboard.Server.Models;

public record StreamRequest
{
    public required string Currency { get; init; }
    public required List<Instrument> Instruments { get; init; }
}

public record CurrencyInfo
{
    public required string Currency { get; init; }
    public required List<string> InstrumentTypes { get; init; }
}
