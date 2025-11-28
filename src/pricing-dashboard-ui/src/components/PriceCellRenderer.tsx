import { useEffect, useState, useRef } from 'react';
import type { ICellRendererParams } from 'ag-grid-community';
import type { PriceFormat } from '../types';

interface PriceCellProps extends ICellRendererParams {
  priceFormat: PriceFormat;
  priceChange?: 'up' | 'down' | 'unchanged';
  updateTimestamp?: number;
}

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

export function PriceCellRenderer(props: PriceCellProps) {
  const { value, priceFormat, priceChange, updateTimestamp } = props;
  const [isFlashing, setIsFlashing] = useState(false);
  const prevTimestampRef = useRef<number | undefined>(undefined);

  // Flash on update
  useEffect(() => {
    if (updateTimestamp && updateTimestamp !== prevTimestampRef.current) {
      prevTimestampRef.current = updateTimestamp;
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 300);
      return () => clearTimeout(timer);
    }
  }, [updateTimestamp]);

  const formattedValue = formatPrice(value, priceFormat);

  const getDirectionIndicator = () => {
    if (!priceChange || priceChange === 'unchanged') return null;

    if (priceChange === 'up') {
      return <span className="price-arrow price-arrow-up">▲</span>;
    } else {
      return <span className="price-arrow price-arrow-down">▼</span>;
    }
  };

  const containerClass = `price-cell ${isFlashing ? 'price-flash' : ''} ${
    priceChange === 'up' ? 'price-direction-up' :
    priceChange === 'down' ? 'price-direction-down' : ''
  }`;

  return (
    <div className={containerClass}>
      <span className="price-value">{formattedValue}</span>
      {getDirectionIndicator()}
    </div>
  );
}
