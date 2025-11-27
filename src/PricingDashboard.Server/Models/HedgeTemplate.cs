namespace PricingDashboard.Server.Models;

public record HedgeTemplate
{
    public required string Currency { get; init; }
    public required string CurveTopicPattern { get; init; }
    public required Dictionary<string, InstrumentTypeConfig> InstrumentTypes { get; init; }
}

public record InstrumentTypeConfig
{
    public List<Instrument> Instruments { get; init; } = new();
    public string? Description { get; init; }
}

public record InjectedTemplate
{
    public required string Currency { get; init; }
    public required string CurveTopic { get; init; }
    public required Dictionary<string, List<Instrument>> InstrumentsByType { get; init; }
}
