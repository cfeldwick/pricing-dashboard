import { useCallback } from 'react';
import { usePricingStore } from '../stores/pricingStore';
import type { ComparisonType, HistoricalPriceResponse } from '../types';

const COMPARISON_OPTIONS: { type: ComparisonType; label: string; description: string }[] = [
  { type: 'ytd', label: 'YtD', description: 'Year to Date' },
  { type: 'mtd', label: 'MtD', description: 'Month to Date' },
  { type: 'cod', label: 'CoD', description: 'Change on Day' },
];

function getComparisonDate(type: ComparisonType): Date {
  const now = new Date();
  switch (type) {
    case 'ytd':
      // Start of current year
      return new Date(now.getFullYear(), 0, 1);
    case 'mtd':
      // Start of current month
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'cod':
      // Yesterday (previous business day approximation)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
  }
}

export function ComparisonSelector() {
  const {
    enabledComparisons,
    loadingComparisons,
    toggleComparison,
    setHistoricalPrices,
    setLoadingComparison,
    clearHistoricalPrices,
    selectedCurrency,
    instruments,
  } = usePricingStore();

  const fetchHistoricalPrices = useCallback(async (type: ComparisonType) => {
    if (!selectedCurrency || instruments.length === 0) {
      console.warn('Cannot fetch historical prices: no currency or instruments');
      return;
    }

    setLoadingComparison(type, true);

    try {
      const asOfDate = getComparisonDate(type);
      const response = await fetch('/api/historical-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currency: selectedCurrency,
          instruments: instruments,
          asOfDate: asOfDate.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch historical prices: ${response.statusText}`);
      }

      const data: HistoricalPriceResponse = await response.json();

      // Convert prices array to Map keyed by instrumentId
      const pricesMap = new Map<string, number>();
      for (const price of data.prices) {
        pricesMap.set(price.instrumentId, price.price);
      }

      setHistoricalPrices(type, pricesMap);
    } catch (error) {
      console.error(`Failed to fetch ${type} prices:`, error);
      clearHistoricalPrices(type);
    } finally {
      setLoadingComparison(type, false);
    }
  }, [selectedCurrency, instruments, setHistoricalPrices, setLoadingComparison, clearHistoricalPrices]);

  const handleToggle = useCallback((type: ComparisonType) => {
    const isEnabled = enabledComparisons.has(type);
    toggleComparison(type);

    if (!isEnabled) {
      // Enabling - fetch historical data
      fetchHistoricalPrices(type);
    } else {
      // Disabling - clear historical data
      clearHistoricalPrices(type);
    }
  }, [enabledComparisons, toggleComparison, fetchHistoricalPrices, clearHistoricalPrices]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-trader-muted uppercase tracking-wide">Compare</label>
      <div className="flex items-center gap-1">
        {COMPARISON_OPTIONS.map((opt) => {
          const isEnabled = enabledComparisons.has(opt.type);
          const isLoading = loadingComparisons.has(opt.type);

          return (
            <button
              key={opt.type}
              onClick={() => handleToggle(opt.type)}
              disabled={isLoading}
              title={opt.description}
              className={`
                px-2 py-1 text-xs rounded border transition-colors
                ${isEnabled
                  ? 'bg-trader-accent text-white border-trader-accent'
                  : 'bg-trader-panel text-trader-muted border-trader-border hover:border-trader-accent'
                }
                ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              `}
            >
              {isLoading ? '...' : opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
