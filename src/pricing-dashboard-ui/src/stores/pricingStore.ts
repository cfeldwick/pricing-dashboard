import { create } from 'zustand';
import type { Instrument, InstrumentPrice, InstrumentTypeInfo, ViewMode, PivotOrientation, PriceFormat, ComparisonType } from '../types';

// Helper to generate unique IDs
let idCounter = 0;
export const generateInstrumentId = () => `inst-${Date.now()}-${++idCounter}`;

// Create an empty instrument row
export const createEmptyInstrument = (copyFrom?: Instrument): Instrument => ({
  id: generateInstrumentId(),
  type: copyFrom?.type ?? '',
  group: copyFrom?.group ?? '',
  start: '',
  end: '',
});

interface PricingState {
  // Configuration
  currencies: string[];
  selectedCurrency: string | null;
  instrumentTypes: InstrumentTypeInfo[];

  // Instruments in dashboard (editable rows)
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

  // Error handling
  error: string | null;

  // Actions
  setCurrencies: (currencies: string[]) => void;
  setSelectedCurrency: (currency: string | null) => void;
  setInstrumentTypes: (types: InstrumentTypeInfo[]) => void;
  addInstrument: (copyFromIndex?: number) => void;
  removeInstrument: (id: string) => void;
  updateInstrument: (id: string, updates: Partial<Omit<Instrument, 'id'>>) => void;
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
  setError: (error: string | null) => void;
  reset: () => void;
}

export const usePricingStore = create<PricingState>((set) => ({
  currencies: [],
  selectedCurrency: null,
  instrumentTypes: [],
  instruments: [createEmptyInstrument()], // Start with one empty row
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
  error: null,

  setCurrencies: (currencies) => set({ currencies }),

  setSelectedCurrency: (currency) => set({
    selectedCurrency: currency,
    instrumentTypes: [],
    error: null,
  }),

  setInstrumentTypes: (types) => set({ instrumentTypes: types }),

  addInstrument: (copyFromIndex?: number) => set((state) => {
    const copyFrom = copyFromIndex !== undefined && copyFromIndex >= 0
      ? state.instruments[copyFromIndex]
      : state.instruments[state.instruments.length - 1];
    return {
      instruments: [...state.instruments, createEmptyInstrument(copyFrom)],
    };
  }),

  removeInstrument: (id) => set((state) => {
    const newInstruments = state.instruments.filter((i) => i.id !== id);
    // Ensure at least one row remains
    if (newInstruments.length === 0) {
      newInstruments.push(createEmptyInstrument());
    }
    const newPrices = new Map(state.prices);
    newPrices.delete(id);
    return {
      instruments: newInstruments,
      prices: newPrices,
    };
  }),

  updateInstrument: (id, updates) => set((state) => ({
    instruments: state.instruments.map((inst) =>
      inst.id === id ? { ...inst, ...updates } : inst
    ),
  })),

  clearInstruments: () => set({
    instruments: [createEmptyInstrument()],
    prices: new Map(),
    previousPrices: new Map(),
    updateTimestamps: new Map(),
    historicalPrices: {
      ytd: new Map(),
      mtd: new Map(),
      cod: new Map(),
    },
    error: null,
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
      error: null, // Clear error on successful update
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

  setError: (error) => set({ error }),

  reset: () => set({
    instruments: [createEmptyInstrument()],
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
    error: null,
  }),
}));
