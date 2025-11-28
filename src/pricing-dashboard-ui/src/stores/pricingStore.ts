import { create } from 'zustand';
import type { Instrument, InstrumentPrice, ViewMode, PivotOrientation, PriceFormat } from '../types';

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

  reset: () => set({
    instruments: [],
    prices: new Map(),
    previousPrices: new Map(),
    updateTimestamps: new Map(),
    isStreaming: false,
    sequenceNumber: 0,
    lastUpdateTime: null,
  }),
}));
