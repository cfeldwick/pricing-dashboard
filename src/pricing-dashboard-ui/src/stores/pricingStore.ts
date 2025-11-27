import { create } from 'zustand';
import type { Instrument, InstrumentPrice, ViewMode } from '../types';

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

  // Streaming state
  isStreaming: boolean;
  sequenceNumber: number;
  lastUpdateTime: Date | null;

  // View settings
  viewMode: ViewMode;

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
  isStreaming: false,
  sequenceNumber: 0,
  lastUpdateTime: null,
  viewMode: 'flat',

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
  }),

  updatePrices: (prices, sequenceNumber) => set((state) => {
    const newPrices = new Map(state.prices);
    const newPreviousPrices = new Map(state.previousPrices);

    for (const price of prices) {
      const existing = newPrices.get(price.instrumentId);
      if (existing) {
        newPreviousPrices.set(price.instrumentId, existing.price);
      }
      newPrices.set(price.instrumentId, price);
    }

    return {
      prices: newPrices,
      previousPrices: newPreviousPrices,
      sequenceNumber,
      lastUpdateTime: new Date(),
    };
  }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setViewMode: (mode) => set({ viewMode: mode }),

  reset: () => set({
    instruments: [],
    prices: new Map(),
    previousPrices: new Map(),
    isStreaming: false,
    sequenceNumber: 0,
    lastUpdateTime: null,
  }),
}));
