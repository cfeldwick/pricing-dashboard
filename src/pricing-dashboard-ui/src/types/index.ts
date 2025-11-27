export interface Instrument {
  id: string;
  type: string;
  start: string;
  end: string;
}

export interface InstrumentPrice {
  instrumentId: string;
  type: string;
  start: string;
  end: string;
  price: number;
  timestamp: string;
}

export interface PriceUpdate {
  currency: string;
  prices: InstrumentPrice[];
  curveTimestamp: string;
  sequenceNumber: number;
}

export interface CurrencyInfo {
  currency: string;
  instrumentTypes: string[];
}

export interface StreamRequest {
  currency: string;
  instruments: Instrument[];
}

export type ViewMode = 'flat' | 'pivot';

export interface GridRow {
  id: string;
  type: string;
  start: string;
  end: string;
  price: number;
  prevPrice?: number;
  priceChange?: 'up' | 'down' | 'unchanged';
}

export interface PivotRow {
  start: string;
  type: string;
  [endTenor: string]: string | number | undefined;
}
