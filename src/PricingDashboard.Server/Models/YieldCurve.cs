namespace PricingDashboard.Server.Models;

public record YieldCurve
{
    public required string Currency { get; init; }
    public required DateTime Timestamp { get; init; }
    public required long SequenceNumber { get; init; }
    public required Dictionary<string, double> Points { get; init; }
}

public record CurvePoint
{
    public required string Tenor { get; init; }
    public required double Rate { get; init; }
}
