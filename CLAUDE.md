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
- `GetHistoricalCurveAsync(currency, asOfDate)` - One-off historical curve lookup
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
- `POST /api/historical-prices` - One-off historical price lookup for comparison columns

### SignalR Hub (`/hubs/pricing`)
- `GetCurrencies()` - Get available currencies
- `GetCurrencyInfo(currency)` - Get currency details
- `StreamPrices(StreamRequest)` - Stream real-time prices
- `StopStream()` - Stop streaming

## Comparison Columns (YtD, MtD, CoD)

Toggle-able columns showing price diff from historical dates:
- **YtD** (Year to Date): Diff from Jan 1st of current year
- **MtD** (Month to Date): Diff from 1st of current month
- **CoD** (Change on Day): Diff from previous day

### How it works:
1. User toggles column via `ComparisonSelector` component
2. Frontend calls `POST /api/historical-prices` with date
3. Backend loads historical curve via `GetHistoricalCurveAsync()`
4. Diff calculated as: `currentPrice - historicalPrice`
5. Display: Colored (green/red) with up/down arrows

### Key files:
- `components/ComparisonSelector.tsx` - Toggle UI
- `stores/pricingStore.ts` - `historicalPrices`, `enabledComparisons` state
- `components/PricingGrid.tsx` - `DiffCellRenderer` for styled display

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
