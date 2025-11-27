import { usePricingStore } from '../stores/pricingStore';
import type { ViewMode } from '../types';

export function ViewModeToggle() {
  const { viewMode, setViewMode } = usePricingStore();

  const modes: { value: ViewMode; label: string }[] = [
    { value: 'flat', label: 'Flat' },
    { value: 'pivot', label: 'Pivot' },
  ];

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-trader-muted uppercase tracking-wide">View</label>
      <div className="flex rounded overflow-hidden border border-trader-border">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setViewMode(mode.value)}
            className={`px-3 py-1 text-xs transition-colors
                        ${viewMode === mode.value
                          ? 'bg-trader-accent text-white'
                          : 'bg-trader-panel text-trader-muted hover:text-trader-text'
                        }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
