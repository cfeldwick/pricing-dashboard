import { usePricingStore } from '../stores/pricingStore';

export function InstrumentList() {
  const { instruments, removeInstrument, clearInstruments, isStreaming } = usePricingStore();

  if (instruments.length === 0) {
    return null;
  }

  // Group by type
  const byType = instruments.reduce((acc, inst) => {
    if (!acc[inst.type]) acc[inst.type] = [];
    acc[inst.type].push(inst);
    return acc;
  }, {} as Record<string, typeof instruments>);

  return (
    <div className="border border-trader-border rounded bg-trader-panel">
      <div className="flex items-center justify-between px-2 py-1 border-b border-trader-border">
        <span className="text-xs text-trader-muted uppercase tracking-wide">
          Instruments ({instruments.length})
        </span>
        <button
          onClick={clearInstruments}
          disabled={isStreaming}
          className="text-xs text-trader-accent hover:underline disabled:opacity-50"
        >
          Clear All
        </button>
      </div>

      <div className="max-h-32 overflow-y-auto p-1">
        {Object.entries(byType).map(([type, items]) => (
          <div key={type} className="mb-1">
            <div className="text-xxs text-trader-muted px-1">{type}</div>
            <div className="flex flex-wrap gap-1">
              {items.map((inst) => (
                <span
                  key={inst.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs
                             bg-trader-bg rounded border border-trader-border"
                >
                  <span className="text-trader-text">
                    {inst.start}→{inst.end}
                  </span>
                  {!isStreaming && (
                    <button
                      onClick={() => removeInstrument(inst.id)}
                      className="text-trader-muted hover:text-trader-accent ml-0.5"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
