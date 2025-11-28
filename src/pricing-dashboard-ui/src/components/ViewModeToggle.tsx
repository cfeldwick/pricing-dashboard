import { usePricingStore } from '../stores/pricingStore';
import type { ViewMode, PivotOrientation } from '../types';

export function ViewModeToggle() {
  const { viewMode, setViewMode, pivotOrientation, setPivotOrientation } = usePricingStore();

  const modes: { value: ViewMode; label: string }[] = [
    { value: 'flat', label: 'Flat' },
    { value: 'pivot', label: 'Pivot' },
  ];

  const orientations: { value: PivotOrientation; label: string }[] = [
    { value: 'startByEnd', label: 'Start × End' },
    { value: 'endByStart', label: 'End × Start' },
  ];

  return (
    <div className="flex items-center gap-4">
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

      {viewMode === 'pivot' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-trader-muted uppercase tracking-wide">Pivot</label>
          <div className="flex rounded overflow-hidden border border-trader-border">
            {orientations.map((orientation) => (
              <button
                key={orientation.value}
                onClick={() => setPivotOrientation(orientation.value)}
                className={`px-2 py-1 text-xs transition-colors
                            ${pivotOrientation === orientation.value
                              ? 'bg-trader-accent text-white'
                              : 'bg-trader-panel text-trader-muted hover:text-trader-text'
                            }`}
              >
                {orientation.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
