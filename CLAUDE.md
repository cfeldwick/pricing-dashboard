# Pricing Dashboard

A real-time financial pricing dashboard with AG Grid Enterprise and SignalR streaming.

## Architecture

### Backend (ASP.NET Core 8.0)
- **Location**: `src/PricingDashboard.Server/`
- **Entry**: `Program.cs` - DI setup, SignalR hub mapping, REST endpoints
- **Hub**: `Hubs/PricingHub.cs` - SignalR streaming hub using `IAsyncEnumerable`

### Frontend (React + TypeScript + Vite)
- **Location**: `src/pricing-dashboard-ui/`
- **State**: Zustand store in `stores/pricingStore.ts`
- **Grid**: AG Grid Enterprise in `components/PricingGrid.tsx`
- **SignalR**: Hook in `hooks/useSignalR.ts`

## Key Models

### Instrument
```typescript
{ id, type, start, end }  // type: "Deposit" | "Swap" | "BasisSwap"
```

### InstrumentPrice
```typescript
{ instrumentId, type, start, end, price, timestamp }
```

### YieldCurve (C#)
```csharp
{ Currency, Timestamp, SequenceNumber, Points: Dictionary<string, double> }
```

## Services

### IMarketDataService
- `Subscribe(topic, callback)` - Subscribe to yield curve updates
- Implementations: `FakeSolaceMarketDataService` (demo), `SolaceMarketDataService` (real)
- Topics: `MARKET/YIELDCURVE/{currency}`

### IPricingService
- `CalculatePrices(template, curve)` - Calculate prices from yield curve

### ITemplateService
- `GetAvailableCurrencies()`, `GetCurrencyInfo(currency)`
- `CreateInjectedTemplate(currency, instruments)`

## Endpoints

### REST
- `GET /health` - Health check
- `GET /api/currencies` - List currencies
- `GET /api/currencies/{currency}` - Currency info

### SignalR Hub (`/hubs/pricing`)
- `GetCurrencies()` - Get available currencies
- `GetCurrencyInfo(currency)` - Get currency details
- `StreamPrices(StreamRequest)` - Stream real-time prices
- `StopStream()` - Stop streaming

## Running

```bash
# Backend (port 5000)
cd src/PricingDashboard.Server
dotnet run

# Frontend (port 5173, proxies to backend)
cd src/pricing-dashboard-ui
npm run dev
```

## Tenors
Standard tenors: 1D, 1W, 2W, 1M, 2M, 3M, 6M, 9M, 1Y, 18M, 2Y, 3Y, 4Y, 5Y, 7Y, 10Y, 15Y, 20Y, 25Y, 30Y

## AG Grid Features
- Enterprise license (PoC evaluation mode)
- Flat view: Type, Start, End, Price columns
- Pivot view: Type + tenor matrix
- Cell flash on price updates
- Excel/CSV export, range selection
