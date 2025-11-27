import { useEffect } from 'react';
import { usePricingStore } from '../stores/pricingStore';
import { useSignalR } from '../hooks/useSignalR';

export function CurrencySelector() {
  const { currencies, selectedCurrency, setSelectedCurrency, isStreaming } = usePricingStore();
  const { loadCurrencyInfo } = useSignalR();

  useEffect(() => {
    if (selectedCurrency) {
      loadCurrencyInfo(selectedCurrency);
    }
  }, [selectedCurrency, loadCurrencyInfo]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-trader-muted uppercase tracking-wide">Currency</label>
      <select
        value={selectedCurrency || ''}
        onChange={(e) => setSelectedCurrency(e.target.value || null)}
        disabled={isStreaming}
        className="bg-trader-panel border border-trader-border rounded px-2 py-1 text-sm
                   text-trader-text focus:border-trader-accent focus:outline-none
                   disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px]"
      >
        <option value="">Select...</option>
        {currencies.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </div>
  );
}
