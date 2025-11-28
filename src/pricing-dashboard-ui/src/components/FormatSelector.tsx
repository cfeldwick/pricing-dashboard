import { usePricingStore } from '../stores/pricingStore';
import type { PriceFormat } from '../types';

const FORMAT_OPTIONS: { value: PriceFormat; label: string }[] = [
  { value: 'percent2', label: '% (2dp)' },
  { value: 'percent3', label: '% (3dp)' },
  { value: 'percent4', label: '% (4dp)' },
  { value: 'decimal4', label: 'Dec (4dp)' },
  { value: 'decimal6', label: 'Dec (6dp)' },
  { value: 'bps', label: 'Bps' },
];

export function FormatSelector() {
  const { priceFormat, setPriceFormat } = usePricingStore();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-trader-muted uppercase tracking-wide">Format</label>
      <select
        value={priceFormat}
        onChange={(e) => setPriceFormat(e.target.value as PriceFormat)}
        className="bg-trader-panel border border-trader-border rounded px-2 py-1 text-sm
                   text-trader-text focus:border-trader-accent focus:outline-none
                   min-w-[90px]"
      >
        {FORMAT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
