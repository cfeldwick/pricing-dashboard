import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  StatusPanelDef,
  GetContextMenuItemsParams,
  MenuItemDef,
  ValueFormatterParams,
  ICellRendererParams,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import 'ag-grid-enterprise';
import { usePricingStore } from '../stores/pricingStore';
import { formatPrice } from './PriceCellRenderer';
import type { GridRow, PivotRow, ComparisonType } from '../types';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// For PoC evaluation - in production, use a real license key
LicenseManager.setLicenseKey('');

// Tenor sorting comparator
const tenorComparator = (a: string, b: string): number => {
  const tenorOrder = (t: string) => {
    const num = parseInt(t) || 0;
    const unit = t.slice(-1);
    const multiplier = unit === 'D' ? 1 : unit === 'W' ? 7 : unit === 'M' ? 30 : unit === 'Y' ? 365 : 1;
    return num * multiplier;
  };
  return tenorOrder(a) - tenorOrder(b);
};

// Diff cell renderer with up/down arrow and color
function DiffCellRenderer(params: ICellRendererParams) {
  const value = params.value as number | undefined;

  if (value === undefined || value === null || isNaN(value)) {
    return <span className="text-trader-muted">-</span>;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const arrow = isPositive ? '\u25B2' : isNegative ? '\u25BC' : '';
  const colorClass = isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-trader-muted';

  // Format as basis points for small values
  const absValue = Math.abs(value);
  let displayValue: string;
  if (absValue < 0.01) {
    displayValue = `${(value * 10000).toFixed(1)} bps`;
  } else {
    displayValue = `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
  }

  return (
    <span className={`font-mono ${colorClass}`}>
      {arrow} {displayValue}
    </span>
  );
}

export function PricingGrid() {
  const gridRef = useRef<AgGridReact>(null);
  const prevInstrumentCountRef = useRef(0);
  const {
    instruments,
    prices,
    viewMode,
    pivotOrientation,
    sequenceNumber,
    lastUpdateTime,
    priceFormat,
    enabledComparisons,
    historicalPrices,
  } = usePricingStore();

  // Flat view rows - includes diff calculations for comparison columns
  const flatRows = useMemo((): GridRow[] => {
    return instruments.map((inst) => {
      const priceData = prices.get(inst.id);
      const currentPrice = priceData?.price ?? 0;

      // Calculate diffs for each enabled comparison type
      const ytdHistorical = historicalPrices.ytd.get(inst.id);
      const mtdHistorical = historicalPrices.mtd.get(inst.id);
      const codHistorical = historicalPrices.cod.get(inst.id);

      return {
        id: inst.id,
        type: inst.type,
        start: inst.start,
        end: inst.end,
        price: currentPrice,
        ytdDiff: ytdHistorical !== undefined ? currentPrice - ytdHistorical : undefined,
        mtdDiff: mtdHistorical !== undefined ? currentPrice - mtdHistorical : undefined,
        codDiff: codHistorical !== undefined ? currentPrice - codHistorical : undefined,
      };
    });
  }, [instruments, prices, historicalPrices]);

  // Pivot view data - build pivot rows based on orientation
  const pivotData = useMemo(() => {
    const starts = [...new Set(instruments.map((i) => i.start))];
    const ends = [...new Set(instruments.map((i) => i.end))];
    const types = [...new Set(instruments.map((i) => i.type))];

    starts.sort(tenorComparator);
    ends.sort(tenorComparator);

    const rows: PivotRow[] = [];

    if (viewMode === 'pivot') {
      if (pivotOrientation === 'startByEnd') {
        // Rows: Type + Start, Columns: End tenors
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
            if (Object.keys(row).some((k) => k !== 'start' && k !== 'type' && row[k] !== undefined)) {
              rows.push(row);
            }
          }
        }
      } else {
        // endByStart: Rows: Type + End, Columns: Start tenors
        for (const type of types) {
          for (const end of ends) {
            const row: PivotRow = { start: end, type }; // Using 'start' field for the row key
            for (const start of starts) {
              const inst = instruments.find(
                (i) => i.type === type && i.start === start && i.end === end
              );
              if (inst) {
                const priceData = prices.get(inst.id);
                row[start] = priceData?.price;
              }
            }
            if (Object.keys(row).some((k) => k !== 'start' && k !== 'type' && row[k] !== undefined)) {
              rows.push(row);
            }
          }
        }
      }
    }

    return {
      rows,
      columnTenors: pivotOrientation === 'startByEnd' ? ends : starts,
    };
  }, [viewMode, pivotOrientation, instruments, prices]);

  // Price value formatter
  const priceValueFormatter = useCallback((params: ValueFormatterParams) => {
    return formatPrice(params.value, priceFormat);
  }, [priceFormat]);

  // Comparison column definitions
  const comparisonColumnDefs: Record<ComparisonType, ColDef> = useMemo(() => ({
    ytd: {
      field: 'ytdDiff',
      headerName: 'YtD',
      width: 110,
      type: 'numericColumn',
      cellRenderer: DiffCellRenderer,
      cellClass: 'text-right',
      filter: 'agNumberColumnFilter',
      enableCellChangeFlash: true,
    },
    mtd: {
      field: 'mtdDiff',
      headerName: 'MtD',
      width: 110,
      type: 'numericColumn',
      cellRenderer: DiffCellRenderer,
      cellClass: 'text-right',
      filter: 'agNumberColumnFilter',
      enableCellChangeFlash: true,
    },
    cod: {
      field: 'codDiff',
      headerName: 'CoD',
      width: 110,
      type: 'numericColumn',
      cellRenderer: DiffCellRenderer,
      cellClass: 'text-right',
      filter: 'agNumberColumnFilter',
      enableCellChangeFlash: true,
    },
  }), []);

  // Flat view columns - includes comparison columns when enabled
  const flatColumns = useMemo((): ColDef[] => {
    const baseColumns: ColDef[] = [
      {
        field: 'type',
        headerName: 'Type',
        width: 100,
        cellClass: 'font-medium',
        filter: 'agSetColumnFilter',
      },
      {
        field: 'start',
        headerName: 'Start',
        width: 80,
        filter: 'agSetColumnFilter',
        comparator: tenorComparator,
      },
      {
        field: 'end',
        headerName: 'End',
        width: 80,
        filter: 'agSetColumnFilter',
        comparator: tenorComparator,
      },
      {
        field: 'price',
        headerName: 'Price',
        width: 120,
        type: 'numericColumn',
        valueFormatter: priceValueFormatter,
        cellClass: 'text-right font-mono',
        filter: 'agNumberColumnFilter',
        enableCellChangeFlash: true,
      },
    ];

    // Add comparison columns in order: YtD, MtD, CoD
    const comparisonOrder: ComparisonType[] = ['ytd', 'mtd', 'cod'];
    for (const type of comparisonOrder) {
      if (enabledComparisons.has(type)) {
        baseColumns.push(comparisonColumnDefs[type]);
      }
    }

    return baseColumns;
  }, [priceValueFormatter, enabledComparisons, comparisonColumnDefs]);

  // Pivot view columns - depends on orientation and tenors
  const pivotColumns = useMemo((): ColDef[] => {
    const rowLabel = pivotOrientation === 'startByEnd' ? 'Start' : 'End';
    return [
      {
        field: 'type',
        headerName: 'Type',
        pinned: 'left',
        width: 90,
        cellClass: 'font-medium',
      },
      {
        field: 'start',
        headerName: rowLabel,
        pinned: 'left',
        width: 70,
        cellClass: 'font-medium',
        comparator: tenorComparator,
      },
      ...pivotData.columnTenors.map((tenor) => ({
        field: tenor,
        headerName: tenor,
        width: 90,
        type: 'numericColumn',
        valueFormatter: priceValueFormatter,
        cellClass: 'text-right font-mono',
        enableCellChangeFlash: true,
      })),
    ];
  }, [pivotOrientation, pivotData.columnTenors, priceValueFormatter]);

  const getRowId = useCallback((params: { data: GridRow | PivotRow }): string => {
    const data = params.data;
    if ('id' in data) {
      return (data as GridRow).id;
    }
    return `${data.type}-${data.start}`;
  }, []);

  // Update row data without changing columns
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const rowData = viewMode === 'flat' ? flatRows : pivotData.rows;
    api.setGridOption('rowData', rowData);
  }, [viewMode, flatRows, pivotData.rows]);

  // Update columns when view mode or pivot orientation changes
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const columns = viewMode === 'flat' ? flatColumns : pivotColumns;
    api.setGridOption('columnDefs', columns);
    // Auto-fit after column change
    setTimeout(() => api.autoSizeAllColumns(), 0);
  }, [viewMode, pivotOrientation, flatColumns, pivotColumns]);

  // Auto-fit columns when instruments are added
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    if (instruments.length > prevInstrumentCountRef.current) {
      // New instruments added - auto-fit columns
      setTimeout(() => api.autoSizeAllColumns(), 100);
    }
    prevInstrumentCountRef.current = instruments.length;
  }, [instruments.length]);

  // Refresh cells when format changes
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.refreshCells({ force: true });
  }, [priceFormat]);

  const defaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: false,
  }), []);

  // Enterprise: Status bar with aggregations
  const statusBar = useMemo((): { statusPanels: StatusPanelDef[] } => ({
    statusPanels: [
      {
        statusPanel: 'agTotalAndFilteredRowCountComponent',
        align: 'left',
      },
      {
        statusPanel: 'agAggregationComponent',
        align: 'right',
        statusPanelParams: {
          aggFuncs: ['count', 'sum', 'min', 'max', 'avg'],
        },
      },
    ],
  }), []);

  // Enterprise: Context menu
  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
    return [
      'copy',
      'copyWithHeaders',
      'separator',
      {
        name: 'Export to Excel',
        action: () => {
          params.api.exportDataAsExcel({
            fileName: `pricing-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`,
          });
        },
        icon: '<span class="ag-icon ag-icon-excel"></span>',
      },
      {
        name: 'Export to CSV',
        action: () => {
          params.api.exportDataAsCsv({
            fileName: `pricing-dashboard-${new Date().toISOString().slice(0, 10)}.csv`,
          });
        },
        icon: '<span class="ag-icon ag-icon-csv"></span>',
      },
      'separator',
      'autoSizeAll',
      'resetColumns',
    ];
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-trader-panel border-b border-trader-border">
        <div className="flex items-center gap-3">
          <span className="text-xs text-trader-muted">
            {instruments.length} instrument{instruments.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xxs text-trader-accent bg-trader-bg px-1.5 py-0.5 rounded">
            Enterprise
          </span>
        </div>
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
          columnDefs={viewMode === 'flat' ? flatColumns : pivotColumns}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          animateRows={false}
          suppressCellFocus={true}
          headerHeight={32}
          rowHeight={28}
          // Enterprise features
          statusBar={statusBar}
          enableRangeSelection={true}
          enableRangeHandle={true}
          allowContextMenuWithControlKey={true}
          getContextMenuItems={getContextMenuItems}
          // Clipboard
          enableCellTextSelection={true}
          ensureDomOrder={true}
          // Maintain column state
          maintainColumnOrder={true}
        />
      </div>
    </div>
  );
}
