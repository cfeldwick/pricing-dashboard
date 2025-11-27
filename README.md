# Pricing Dashboard

A full-stack financial analytics dashboard for visualizing streaming vanilla interest rate instrument prices on a pivotable grid.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + TypeScript + Vite                               │
│  AG Grid Community (streaming updates, flat/pivot views)    │
│  Zustand (state management)                                 │
│  @microsoft/signalr (real-time communication)               │
│  Tailwind CSS (trader-style dark theme)                     │
└─────────────────────────────────────────────────────────────┘
                            │
                        SignalR (WebSocket)
                            │
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  ASP.NET Core 8.0                                           │
│  SignalR Hub (IAsyncEnumerable streaming)                   │
│  Solace Market Data (real or fake, configurable)            │
│  Shared Subscription Manager (ref-counted)                  │
│  JSON Hedge Templates                                       │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Currency Selection**: Choose from USD, EUR, GBP, JPY, CHF
- **Instrument Types**: Deposit, Swap, BasisSwap
- **Flexible Instrument Builder**: Add individual instruments with custom Start/End tenors
- **Quick Grid Builder**: Add a matrix of common tenor combinations
- **Real-time Streaming**: Prices update ~1-2 times per second
- **Pivotable Grid**:
  - Flat view: Traditional rows with Type, Start, End, Price
  - Pivot view: Start vs End matrix
- **Price Flash**: Visual indicators for price up/down movements
- **Backpressure Handling**: Slow calculations don't cause message backup

## Prerequisites

- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/)

## Running Locally

### Terminal 1 - Backend

```bash
cd src/PricingDashboard.Server
dotnet run
```

The backend will start on http://localhost:5000

### Terminal 2 - Frontend

```bash
cd src/pricing-dashboard-ui
npm install
npm run dev
```

The frontend will start on http://localhost:5173

## Usage

1. Open http://localhost:5173 in your browser
2. Select a currency from the dropdown (e.g., USD)
3. Select an instrument type (e.g., Swap)
4. Either:
   - Add individual instruments by selecting Start/End tenors and clicking "Add"
   - Click "Add Grid" to add a matrix of common instruments
5. Click "Start" to begin streaming prices
6. Toggle between "Flat" and "Pivot" views
7. Click "Stop" to end streaming

## Project Structure

```
pricing-dashboard/
├── PricingDashboard.sln
├── README.md
└── src/
    ├── PricingDashboard.Server/       # ASP.NET Core 8.0 backend
    │   ├── Hubs/
    │   │   └── PricingHub.cs          # SignalR hub for streaming
    │   ├── Models/
    │   │   ├── Instrument.cs          # Instrument and price models
    │   │   ├── HedgeTemplate.cs       # Template configuration
    │   │   ├── StreamRequest.cs       # API request/response DTOs
    │   │   └── YieldCurve.cs          # Market data models
    │   ├── Services/
    │   │   ├── FakeSolaceMarketDataService.cs  # Simulated market data (demo)
    │   │   ├── SolaceMarketDataService.cs      # Real Solace integration
    │   │   ├── IMarketDataService.cs           # Market data interface
    │   │   ├── PricingService.cs               # Price calculation
    │   │   ├── SubscriptionManager.cs          # Shared subscriptions
    │   │   └── TemplateService.cs              # Hedge template management
    │   ├── Templates/                 # JSON hedge templates (auto-created)
    │   ├── Program.cs
    │   └── appsettings.json
    │
    └── pricing-dashboard-ui/          # React frontend
        ├── src/
        │   ├── components/
        │   │   ├── CurrencySelector.tsx
        │   │   ├── InstrumentBuilder.tsx
        │   │   ├── InstrumentList.tsx
        │   │   ├── PricingGrid.tsx
        │   │   ├── StatusBar.tsx
        │   │   ├── StreamControls.tsx
        │   │   └── ViewModeToggle.tsx
        │   ├── hooks/
        │   │   └── useSignalR.ts       # SignalR connection hook
        │   ├── stores/
        │   │   └── pricingStore.ts     # Zustand state store
        │   ├── types/
        │   │   └── index.ts            # TypeScript types
        │   ├── App.tsx
        │   ├── main.tsx
        │   └── index.css
        ├── package.json
        ├── vite.config.ts
        └── tailwind.config.js
```

## Technical Details

### Fake Solace Market Data Service

The demo uses a simulated Solace service that:
- Generates realistic yield curves for each currency
- Publishes curve updates every 500-1000ms
- Maintains reference-counted shared subscriptions
- Provides cached curves to new subscribers

### Subscription Management

- Multiple frontend sessions can share the same Solace subscription
- Reference counting ensures cleanup when last session disconnects
- Bounded channels with DropOldest policy prevent backpressure

### Pricing Calculation

Stubbed pricing logic derives prices from yield curve points:
- **Deposit**: Forward rate approximation
- **Swap**: Par swap rate approximation
- **BasisSwap**: Spread calculation

## Solace Configuration

The application supports both a fake (demo) and real Solace market data service. Configure via `appsettings.json`:

### Demo Mode (Default)

```json
{
  "Solace": {
    "Enabled": false
  }
}
```

When `Enabled` is `false`, the application uses `FakeSolaceMarketDataService` which generates realistic yield curves every 500-1000ms.

### Production Mode (Real Solace)

```json
{
  "Solace": {
    "Enabled": true,
    "Host": "tcp://solace-broker:55555",
    "VpnName": "production",
    "UseKerberos": true,
    "KerberosServiceName": "solace",
    "ConnectTimeoutMs": 10000,
    "ReconnectRetries": 5,
    "ReconnectRetryIntervalMs": 5000,
    "RequestCachedMessages": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `Enabled` | bool | `false` | Use real Solace (`true`) or fake service (`false`) |
| `Host` | string | `tcp://localhost:55555` | Solace broker connection string |
| `VpnName` | string | `default` | Solace VPN name |
| `Username` | string | `""` | Username for basic auth |
| `Password` | string | `""` | Password for basic auth |
| `UseKerberos` | bool | `false` | Use Kerberos authentication |
| `KerberosServiceName` | string | `solace` | Kerberos service principal name |
| `ConnectTimeoutMs` | int | `10000` | Connection timeout in ms |
| `ReconnectRetries` | int | `3` | Number of reconnection attempts |
| `ReconnectRetryIntervalMs` | int | `3000` | Delay between reconnection attempts |
| `RequestCachedMessages` | bool | `true` | Request cached/last-value on subscribe |

### Yield Curve Message Format

The real Solace service expects yield curve messages in JSON format:

```json
{
  "currency": "USD",
  "timestamp": "2024-01-15T10:30:00Z",
  "sequenceNumber": 12345,
  "points": {
    "1M": 4.5123,
    "3M": 4.5456,
    "6M": 4.5789,
    "1Y": 4.6123,
    "2Y": 4.7456,
    "5Y": 4.8789,
    "10Y": 5.0123
  }
}
```

### Topic Pattern

Yield curve topics follow the pattern configured in hedge templates:
- Default: `MARKET/YIELDCURVE/{currency}` (e.g., `MARKET/YIELDCURVE/USD`)

## License

MIT
