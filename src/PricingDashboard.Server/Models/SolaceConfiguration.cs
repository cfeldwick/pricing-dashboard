namespace PricingDashboard.Server.Models;

public class SolaceConfiguration
{
    public const string SectionName = "Solace";

    /// <summary>
    /// Whether to use real Solace or the fake market data service
    /// </summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// Solace broker host (e.g., "tcp://solace-broker:55555")
    /// </summary>
    public string Host { get; set; } = "tcp://localhost:55555";

    /// <summary>
    /// Solace VPN name
    /// </summary>
    public string VpnName { get; set; } = "default";

    /// <summary>
    /// Client username for authentication
    /// </summary>
    public string Username { get; set; } = "";

    /// <summary>
    /// Client password (if not using Kerberos)
    /// </summary>
    public string Password { get; set; } = "";

    /// <summary>
    /// Whether to use Kerberos authentication
    /// </summary>
    public bool UseKerberos { get; set; } = false;

    /// <summary>
    /// Kerberos service name (e.g., "solace")
    /// </summary>
    public string KerberosServiceName { get; set; } = "solace";

    /// <summary>
    /// Connection timeout in milliseconds
    /// </summary>
    public int ConnectTimeoutMs { get; set; } = 10000;

    /// <summary>
    /// Reconnect retry attempts
    /// </summary>
    public int ReconnectRetries { get; set; } = 3;

    /// <summary>
    /// Reconnect retry interval in milliseconds
    /// </summary>
    public int ReconnectRetryIntervalMs { get; set; } = 3000;

    /// <summary>
    /// Whether to request cached/last-value on subscription
    /// </summary>
    public bool RequestCachedMessages { get; set; } = true;
}
