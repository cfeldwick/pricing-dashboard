namespace PricingDashboard.Server.Models;

public record Instrument
{
    public required string Id { get; init; }
    public required string Type { get; init; }
    public required string Group { get; init; }
    public required string Start { get; init; }
    public required string End { get; init; }
    public required string FreeText { get; init; }
}

public record InstrumentPrice
{
    public required string InstrumentId { get; init; }
    public required string Type { get; init; }
    public required string Group { get; init; }
    public required string Start { get; init; }
    public required string End { get; init; }
    public required string FreeText { get; init; }
    public required double Price { get; init; }
    public required DateTime Timestamp { get; init; }
}

public record PriceUpdate
{
    public required string Currency { get; init; }
    public required List<InstrumentPrice> Prices { get; init; }
    public required DateTime CurveTimestamp { get; init; }
    public required long SequenceNumber { get; init; }
}
