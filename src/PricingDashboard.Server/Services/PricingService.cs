using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public interface IPricingService
{
    List<InstrumentPrice> CalculatePrices(InjectedTemplate template, YieldCurve curve);
}

public class PricingService : IPricingService
{
    private readonly ILogger<PricingService> _logger;
    private readonly Random _random = new();

    private static readonly Dictionary<string, double> TenorYears = new()
    {
        ["1D"] = 1.0 / 365, ["1W"] = 1.0 / 52, ["2W"] = 2.0 / 52,
        ["1M"] = 1.0 / 12, ["2M"] = 2.0 / 12, ["3M"] = 3.0 / 12,
        ["6M"] = 6.0 / 12, ["9M"] = 9.0 / 12, ["1Y"] = 1.0,
        ["18M"] = 1.5, ["2Y"] = 2.0, ["3Y"] = 3.0, ["4Y"] = 4.0,
        ["5Y"] = 5.0, ["7Y"] = 7.0, ["10Y"] = 10.0, ["15Y"] = 15.0,
        ["20Y"] = 20.0, ["25Y"] = 25.0, ["30Y"] = 30.0
    };

    public PricingService(ILogger<PricingService> logger)
    {
        _logger = logger;
    }

    public List<InstrumentPrice> CalculatePrices(InjectedTemplate template, YieldCurve curve)
    {
        var prices = new List<InstrumentPrice>();
        var timestamp = DateTime.UtcNow;

        foreach (var (instrumentType, instruments) in template.InstrumentsByType)
        {
            foreach (var instrument in instruments)
            {
                var price = CalculateInstrumentPrice(instrumentType, instrument, curve);

                prices.Add(new InstrumentPrice
                {
                    InstrumentId = instrument.Id,
                    Type = instrument.Type,
                    Start = instrument.Start,
                    End = instrument.End,
                    Price = price,
                    Timestamp = timestamp
                });
            }
        }

        return prices;
    }

    private double CalculateInstrumentPrice(string instrumentType, Instrument instrument, YieldCurve curve)
    {
        // Stubbed pricing logic - in reality this would call a pricing library
        // For demo purposes, we derive a price from the curve points

        var startRate = InterpolateRate(curve, instrument.Start);
        var endRate = InterpolateRate(curve, instrument.End);

        double price = instrumentType switch
        {
            "Deposit" => CalculateDepositRate(startRate, endRate, instrument),
            "Swap" => CalculateSwapRate(startRate, endRate, instrument),
            "BasisSwap" => CalculateBasisSwapSpread(startRate, endRate, instrument),
            _ => (startRate + endRate) / 2
        };

        // Add small noise to simulate market movement
        price += (_random.NextDouble() - 0.5) * 0.001;

        return Math.Round(price, 5);
    }

    private double InterpolateRate(YieldCurve curve, string tenor)
    {
        if (curve.Points.TryGetValue(tenor, out var rate))
            return rate;

        // Simple linear interpolation between surrounding tenors
        var tenorYears = GetTenorYears(tenor);
        var sortedPoints = curve.Points
            .Select(p => (Tenor: p.Key, Years: GetTenorYears(p.Key), Rate: p.Value))
            .OrderBy(p => p.Years)
            .ToList();

        var lower = sortedPoints.LastOrDefault(p => p.Years <= tenorYears);
        var upper = sortedPoints.FirstOrDefault(p => p.Years >= tenorYears);

        if (lower == default) return upper.Rate;
        if (upper == default) return lower.Rate;
        if (Math.Abs(upper.Years - lower.Years) < 0.0001) return lower.Rate;

        var t = (tenorYears - lower.Years) / (upper.Years - lower.Years);
        return lower.Rate + t * (upper.Rate - lower.Rate);
    }

    private static double GetTenorYears(string tenor)
    {
        return TenorYears.GetValueOrDefault(tenor, 1.0);
    }

    private double CalculateDepositRate(double startRate, double endRate, Instrument instrument)
    {
        // Deposit rate is approximately the forward rate
        var startYears = GetTenorYears(instrument.Start);
        var endYears = GetTenorYears(instrument.End);
        var period = endYears - startYears;

        if (period <= 0) return startRate;

        // Simple forward rate calculation
        return ((endRate * endYears) - (startRate * startYears)) / period;
    }

    private double CalculateSwapRate(double startRate, double endRate, Instrument instrument)
    {
        // Par swap rate approximation
        var startYears = GetTenorYears(instrument.Start);
        var endYears = GetTenorYears(instrument.End);

        // Weighted average of rates over the swap period
        return (startRate * 0.3 + endRate * 0.7);
    }

    private double CalculateBasisSwapSpread(double startRate, double endRate, Instrument instrument)
    {
        // Basis swap spread - typically small
        var baseSpread = (endRate - startRate) * 0.1;
        return Math.Max(-0.5, Math.Min(0.5, baseSpread));
    }
}
