namespace PricingDashboard.Server.Models;

public record StreamRequest
{
    public required string Currency { get; init; }
    public required List<Instrument> Instruments { get; init; }
}

public record InstrumentTypeInfo
{
    public required string Type { get; init; }
    public required List<string> Groups { get; init; }
}

public record CurrencyInfo
{
    public required string Currency { get; init; }
    public required List<InstrumentTypeInfo> InstrumentTypes { get; init; }
}

public record HistoricalPriceRequest
{
    public required string Currency { get; init; }
    public required List<Instrument> Instruments { get; init; }
    public required DateTime AsOfDate { get; init; }
}

public record HistoricalPriceResponse
{
    public required string Currency { get; init; }
    public required DateTime AsOfDate { get; init; }
    public required List<InstrumentPrice> Prices { get; init; }
}
