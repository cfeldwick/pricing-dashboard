import { create } from 'zustand';
import type { Instrument, InstrumentPrice, ViewMode, PivotOrientation, PriceFormat, ComparisonType } from '../types';

interface PricingState {
  // Configuration
  currencies: string[];
  selectedCurrency: string | null;
  instrumentTypes: string[];
  selectedType: string | null;

  // Instruments in dashboard
  instruments: Instrument[];

  // Live prices
  prices: Map<string, InstrumentPrice>;
  previousPrices: Map<string, number>;
  updateTimestamps: Map<string, number>;

  // Historical/comparison prices - keyed by comparison type, then instrument ID
  historicalPrices: {
    ytd: Map<string, number>;
    mtd: Map<string, number>;
    cod: Map<string, number>;
  };

  // Which comparison columns are enabled
  enabledComparisons: Set<ComparisonType>;

  // Loading states for historical data
  loadingComparisons: Set<ComparisonType>;

  // Streaming state
  isStreaming: boolean;
  sequenceNumber: number;
  lastUpdateTime: Date | null;

  // View settings
  viewMode: ViewMode;
  pivotOrientation: PivotOrientation;
  priceFormat: PriceFormat;

  // Actions
  setCurrencies: (currencies: string[]) => void;
  setSelectedCurrency: (currency: string | null) => void;
  setInstrumentTypes: (types: string[]) => void;
  setSelectedType: (type: string | null) => void;
  addInstrument: (instrument: Instrument) => void;
  removeInstrument: (id: string) => void;
  clearInstruments: () => void;
  updatePrices: (prices: InstrumentPrice[], sequenceNumber: number) => void;
  setStreaming: (streaming: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setPivotOrientation: (orientation: PivotOrientation) => void;
  setPriceFormat: (format: PriceFormat) => void;
  toggleComparison: (type: ComparisonType) => void;
  setHistoricalPrices: (type: ComparisonType, prices: Map<string, number>) => void;
  setLoadingComparison: (type: ComparisonType, loading: boolean) => void;
  clearHistoricalPrices: (type: ComparisonType) => void;
  reset: () => void;
}

export const usePricingStore = create<PricingState>((set) => ({
  currencies: [],
  selectedCurrency: null,
  instrumentTypes: [],
  selectedType: null,
  instruments: [],
  prices: new Map(),
  previousPrices: new Map(),
  updateTimestamps: new Map(),
  historicalPrices: {
    ytd: new Map(),
    mtd: new Map(),
    cod: new Map(),
  },
  enabledComparisons: new Set(),
  loadingComparisons: new Set(),
  isStreaming: false,
  sequenceNumber: 0,
  lastUpdateTime: null,
  viewMode: 'flat',
  pivotOrientation: 'startByEnd',
  priceFormat: 'percent3',

  setCurrencies: (currencies) => set({ currencies }),

  setSelectedCurrency: (currency) => set({
    selectedCurrency: currency,
    selectedType: null,
    instrumentTypes: [],
  }),

  setInstrumentTypes: (types) => set({ instrumentTypes: types }),

  setSelectedType: (type) => set({ selectedType: type }),

  addInstrument: (instrument) => set((state) => ({
    instruments: [...state.instruments, instrument],
  })),

  removeInstrument: (id) => set((state) => ({
    instruments: state.instruments.filter((i) => i.id !== id),
    prices: (() => {
      const newPrices = new Map(state.prices);
      newPrices.delete(id);
      return newPrices;
    })(),
  })),

  clearInstruments: () => set({
    instruments: [],
    prices: new Map(),
    previousPrices: new Map(),
    updateTimestamps: new Map(),
    historicalPrices: {
      ytd: new Map(),
      mtd: new Map(),
      cod: new Map(),
    },
  }),

  updatePrices: (prices, sequenceNumber) => set((state) => {
    const newPrices = new Map(state.prices);
    const newPreviousPrices = new Map(state.previousPrices);
    const newUpdateTimestamps = new Map(state.updateTimestamps);
    const now = Date.now();

    for (const price of prices) {
      const existing = newPrices.get(price.instrumentId);
      if (existing) {
        newPreviousPrices.set(price.instrumentId, existing.price);
      }
      newPrices.set(price.instrumentId, price);
      newUpdateTimestamps.set(price.instrumentId, now);
    }

    return {
      prices: newPrices,
      previousPrices: newPreviousPrices,
      updateTimestamps: newUpdateTimestamps,
      sequenceNumber,
      lastUpdateTime: new Date(),
    };
  }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setPivotOrientation: (orientation) => set({ pivotOrientation: orientation }),

  setPriceFormat: (format) => set({ priceFormat: format }),

  toggleComparison: (type) => set((state) => {
    const newEnabled = new Set(state.enabledComparisons);
    if (newEnabled.has(type)) {
      newEnabled.delete(type);
    } else {
      newEnabled.add(type);
    }
    return { enabledComparisons: newEnabled };
  }),

  setHistoricalPrices: (type, prices) => set((state) => ({
    historicalPrices: {
      ...state.historicalPrices,
      [type]: prices,
    },
  })),

  setLoadingComparison: (type, loading) => set((state) => {
    const newLoading = new Set(state.loadingComparisons);
    if (loading) {
      newLoading.add(type);
    } else {
      newLoading.delete(type);
    }
    return { loadingComparisons: newLoading };
  }),

  clearHistoricalPrices: (type) => set((state) => ({
    historicalPrices: {
      ...state.historicalPrices,
      [type]: new Map(),
    },
  })),

  reset: () => set({
    instruments: [],
    prices: new Map(),
    previousPrices: new Map(),
    updateTimestamps: new Map(),
    historicalPrices: {
      ytd: new Map(),
      mtd: new Map(),
      cod: new Map(),
    },
    enabledComparisons: new Set(),
    loadingComparisons: new Set(),
    isStreaming: false,
    sequenceNumber: 0,
    lastUpdateTime: null,
  }),
}));
