import { CurrencySelector } from './components/CurrencySelector';
import { ComparisonSelector } from './components/ComparisonSelector';
import { FormatSelector } from './components/FormatSelector';
import { InstrumentBuilder } from './components/InstrumentBuilder';
import { InstrumentList } from './components/InstrumentList';
import { StreamControls } from './components/StreamControls';
import { ViewModeToggle } from './components/ViewModeToggle';
import { PricingGrid } from './components/PricingGrid';
import { StatusBar } from './components/StatusBar';
import { useSignalR } from './hooks/useSignalR';

function App() {
  // Initialize SignalR connection
  useSignalR();

  return (
    <div className="h-screen flex flex-col bg-trader-bg text-trader-text">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-trader-panel border-b border-trader-border">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-trader-text">Pricing Dashboard</h1>
          <span className="text-xs text-trader-muted px-2 py-0.5 bg-trader-bg rounded">PoC</span>
        </div>
        <StreamControls />
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-trader-panel border-b border-trader-border">
        <CurrencySelector />
        <div className="w-px h-6 bg-trader-border" />
        <InstrumentBuilder />
        <div className="flex-1" />
        <ComparisonSelector />
        <div className="w-px h-6 bg-trader-border" />
        <FormatSelector />
        <div className="w-px h-6 bg-trader-border" />
        <ViewModeToggle />
      </div>

      {/* Instrument List */}
      <div className="px-4 py-2">
        <InstrumentList />
      </div>

      {/* Main Grid */}
      <div className="flex-1 px-4 pb-2 min-h-0">
        <div className="h-full border border-trader-border rounded overflow-hidden flex flex-col">
          <PricingGrid />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
