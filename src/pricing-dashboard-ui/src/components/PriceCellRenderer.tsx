import type { PriceFormat } from '../types';

export function formatPrice(value: number | undefined | null, format: PriceFormat): string {
  if (value === undefined || value === null) return '-';

  switch (format) {
    case 'percent2':
      return `${value.toFixed(2)}%`;
    case 'percent3':
      return `${value.toFixed(3)}%`;
    case 'percent4':
      return `${value.toFixed(4)}%`;
    case 'decimal4':
      return value.toFixed(4);
    case 'decimal6':
      return value.toFixed(6);
    case 'bps':
      return `${(value * 100).toFixed(1)} bps`;
    default:
      return `${value.toFixed(3)}%`;
  }
}
