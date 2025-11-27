using System.Text.Json;
using PricingDashboard.Server.Models;

namespace PricingDashboard.Server.Services;

public interface ITemplateService
{
    IReadOnlyList<string> GetAvailableCurrencies();
    CurrencyInfo? GetCurrencyInfo(string currency);
    InjectedTemplate? CreateInjectedTemplate(string currency, IEnumerable<Instrument> instruments);
}

public class TemplateService : ITemplateService
{
    private readonly ILogger<TemplateService> _logger;
    private readonly Dictionary<string, HedgeTemplate> _templates = new();
    private readonly string _templatesPath;

    public TemplateService(ILogger<TemplateService> logger, IWebHostEnvironment env)
    {
        _logger = logger;
        _templatesPath = Path.Combine(env.ContentRootPath, "Templates");
        LoadTemplates();
    }

    private void LoadTemplates()
    {
        if (!Directory.Exists(_templatesPath))
        {
            _logger.LogWarning("Templates directory not found at {Path}, creating with defaults", _templatesPath);
            Directory.CreateDirectory(_templatesPath);
            CreateDefaultTemplates();
        }

        var files = Directory.GetFiles(_templatesPath, "*.json");
        if (files.Length == 0)
        {
            _logger.LogWarning("No template files found, creating defaults");
            CreateDefaultTemplates();
            files = Directory.GetFiles(_templatesPath, "*.json");
        }

        foreach (var file in files)
        {
            try
            {
                var json = File.ReadAllText(file);
                var template = JsonSerializer.Deserialize<HedgeTemplate>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (template != null)
                {
                    _templates[template.Currency] = template;
                    _logger.LogInformation("Loaded template for {Currency}", template.Currency);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load template from {File}", file);
            }
        }
    }

    private void CreateDefaultTemplates()
    {
        var currencies = new[] { "USD", "EUR", "GBP", "JPY", "CHF" };

        foreach (var currency in currencies)
        {
            var template = new HedgeTemplate
            {
                Currency = currency,
                CurveTopicPattern = "MARKET/YIELDCURVE/{currency}",
                InstrumentTypes = new Dictionary<string, InstrumentTypeConfig>
                {
                    ["Deposit"] = new() { Description = "Money market deposits" },
                    ["Swap"] = new() { Description = "Interest rate swaps" },
                    ["BasisSwap"] = new() { Description = "Basis swaps" }
                }
            };

            var json = JsonSerializer.Serialize(template, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            var filePath = Path.Combine(_templatesPath, $"{currency}.json");
            File.WriteAllText(filePath, json);
            _templates[currency] = template;

            _logger.LogInformation("Created default template for {Currency}", currency);
        }
    }

    public IReadOnlyList<string> GetAvailableCurrencies()
    {
        return _templates.Keys.OrderBy(c => c).ToList();
    }

    public CurrencyInfo? GetCurrencyInfo(string currency)
    {
        if (!_templates.TryGetValue(currency, out var template))
            return null;

        return new CurrencyInfo
        {
            Currency = currency,
            InstrumentTypes = template.InstrumentTypes.Keys.ToList()
        };
    }

    public InjectedTemplate? CreateInjectedTemplate(string currency, IEnumerable<Instrument> instruments)
    {
        if (!_templates.TryGetValue(currency, out var template))
            return null;

        var instrumentsByType = instruments
            .GroupBy(i => i.Type)
            .ToDictionary(g => g.Key, g => g.ToList());

        var curveTopic = template.CurveTopicPattern.Replace("{currency}", currency);

        return new InjectedTemplate
        {
            Currency = currency,
            CurveTopic = curveTopic,
            InstrumentsByType = instrumentsByType
        };
    }
}
