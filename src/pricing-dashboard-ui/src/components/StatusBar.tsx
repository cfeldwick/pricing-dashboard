import { usePricingStore } from '../stores/pricingStore';

export function StatusBar() {
  const { isStreaming, sequenceNumber, selectedCurrency, instruments } = usePricingStore();

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-trader-panel border-t border-trader-border text-xs">
      <div className="flex items-center gap-4">
        <span className="text-trader-muted">
          Currency: <span className="text-trader-text">{selectedCurrency || '-'}</span>
        </span>
        <span className="text-trader-muted">
          Instruments: <span className="text-trader-text">{instruments.length}</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-500">Streaming</span>
          </span>
        )}
        <span className="text-trader-muted">
          Updates: <span className="text-trader-text">{sequenceNumber}</span>
        </span>
      </div>
    </div>
  );
}
