import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellClassParams, ValueFormatterParams } from 'ag-grid-community';
import { usePricingStore } from '../stores/pricingStore';
import type { GridRow, PivotRow } from '../types';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const formatPrice = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-';
  return value.toFixed(4);
};

const priceFormatter = (params: ValueFormatterParams): string => {
  return formatPrice(params.value);
};

const getPriceClass = (params: CellClassParams): string => {
  const data = params.data as GridRow;
  if (!data?.priceChange) return '';
  return data.priceChange === 'up' ? 'price-up' : data.priceChange === 'down' ? 'price-down' : '';
};

export function PricingGrid() {
  const gridRef = useRef<AgGridReact>(null);
  const { instruments, prices, previousPrices, viewMode, sequenceNumber, lastUpdateTime } =
    usePricingStore();

  // Flat view rows
  const flatRows = useMemo((): GridRow[] => {
    return instruments.map((inst) => {
      const priceData = prices.get(inst.id);
      const prevPrice = previousPrices.get(inst.id);
      const currentPrice = priceData?.price;

      let priceChange: 'up' | 'down' | 'unchanged' | undefined;
      if (currentPrice !== undefined && prevPrice !== undefined) {
        if (currentPrice > prevPrice) priceChange = 'up';
        else if (currentPrice < prevPrice) priceChange = 'down';
        else priceChange = 'unchanged';
      }

      return {
        id: inst.id,
        type: inst.type,
        start: inst.start,
        end: inst.end,
        price: currentPrice ?? 0,
        prevPrice,
        priceChange,
      };
    });
  }, [instruments, prices, previousPrices]);

  // Pivot view rows (Start vs End matrix)
  const pivotData = useMemo(() => {
    if (viewMode !== 'pivot') return { rows: [], columns: [] as ColDef[] };

    // Get unique starts and ends
    const starts = [...new Set(instruments.map((i) => i.start))];
    const ends = [...new Set(instruments.map((i) => i.end))];
    const types = [...new Set(instruments.map((i) => i.type))];

    // Sort by tenor
    const tenorOrder = (t: string) => {
      const num = parseInt(t);
      const unit = t.slice(-1);
      const multiplier = unit === 'D' ? 1 : unit === 'W' ? 7 : unit === 'M' ? 30 : unit === 'Y' ? 365 : 1;
      return num * multiplier;
    };
    starts.sort((a, b) => tenorOrder(a) - tenorOrder(b));
    ends.sort((a, b) => tenorOrder(a) - tenorOrder(b));

    // Build rows
    const rows: PivotRow[] = [];
    for (const type of types) {
      for (const start of starts) {
        const row: PivotRow = { start, type };
        for (const end of ends) {
          const inst = instruments.find(
            (i) => i.type === type && i.start === start && i.end === end
          );
          if (inst) {
            const priceData = prices.get(inst.id);
            row[end] = priceData?.price;
          }
        }
        // Only add row if it has at least one price
        if (Object.keys(row).some((k) => k !== 'start' && k !== 'type' && row[k] !== undefined)) {
          rows.push(row);
        }
      }
    }

    // Build columns
    const columns: ColDef[] = [
      {
        field: 'type',
        headerName: 'Type',
        pinned: 'left',
        width: 90,
        cellClass: 'font-medium',
      },
      {
        field: 'start',
        headerName: 'Start',
        pinned: 'left',
        width: 70,
        cellClass: 'font-medium',
      },
      ...ends.map((end) => ({
        field: end,
        headerName: end,
        width: 85,
        valueFormatter: priceFormatter,
        cellClass: 'text-right font-mono',
      })),
    ];

    return { rows, columns };
  }, [viewMode, instruments, prices]);

  // Flat view columns
  const flatColumns = useMemo((): ColDef[] => [
    {
      field: 'type',
      headerName: 'Type',
      width: 100,
      cellClass: 'font-medium',
    },
    {
      field: 'start',
      headerName: 'Start',
      width: 80,
    },
    {
      field: 'end',
      headerName: 'End',
      width: 80,
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 100,
      valueFormatter: priceFormatter,
      cellClass: (params) => `text-right font-mono ${getPriceClass(params)}`,
    },
  ], []);

  const getRowId = useCallback((params: { data: GridRow | PivotRow }): string => {
    const data = params.data;
    if ('id' in data && 'end' in data) {
      // GridRow has id, type, start, end, price
      return (data as GridRow).id;
    }
    // PivotRow has type and start
    return `${data.type}-${data.start}`;
  }, []);

  // Update grid data efficiently
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    if (viewMode === 'flat') {
      api.setGridOption('rowData', flatRows);
    } else {
      api.setGridOption('rowData', pivotData.rows);
    }
  }, [viewMode, flatRows, pivotData.rows]);

  // Update columns when view mode changes
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    if (viewMode === 'flat') {
      api.setGridOption('columnDefs', flatColumns);
    } else {
      api.setGridOption('columnDefs', pivotData.columns);
    }
  }, [viewMode, flatColumns, pivotData.columns]);

  const defaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
  }), []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-trader-panel border-b border-trader-border">
        <span className="text-xs text-trader-muted">
          {instruments.length} instrument{instruments.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-4 text-xs text-trader-muted">
          {sequenceNumber > 0 && (
            <>
              <span>Seq: {sequenceNumber}</span>
              <span>
                Updated: {lastUpdateTime?.toLocaleTimeString() ?? '-'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 ag-theme-alpine-dark">
        <AgGridReact
          ref={gridRef}
          rowData={viewMode === 'flat' ? flatRows : pivotData.rows}
          columnDefs={viewMode === 'flat' ? flatColumns : pivotData.columns}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          animateRows={false}
          suppressCellFocus={true}
          headerHeight={32}
          rowHeight={28}
        />
      </div>
    </div>
  );
}
