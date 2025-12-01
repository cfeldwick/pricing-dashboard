import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  StatusPanelDef,
  GetContextMenuItemsParams,
  MenuItemDef,
  ValueFormatterParams,
  ICellEditorParams,
  ICellRendererParams,
  CellValueChangedEvent,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import 'ag-grid-enterprise';
import { usePricingStore } from '../stores/pricingStore';
import { formatPrice } from './PriceCellRenderer';
import type { GridRow, PivotRow, Instrument, ComparisonType } from '../types';

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

// Actions cell renderer with add/delete buttons
interface ActionsCellRendererProps extends ICellRendererParams {
  onAddRow: (rowIndex: number) => void;
  onDeleteRow: (id: string) => void;
  isStreaming: boolean;
}

const ActionsCellRenderer = (props: ActionsCellRendererProps) => {
  const { data, onAddRow, onDeleteRow, isStreaming, node } = props;

  return (
    <div className="flex items-center gap-1 h-full">
      <button
        onClick={() => onAddRow(node.rowIndex ?? 0)}
        disabled={isStreaming}
        className="w-6 h-6 flex items-center justify-center rounded text-green-400 hover:bg-trader-border disabled:opacity-50 disabled:cursor-not-allowed"
        title="Add row below"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
      </button>
      <button
        onClick={() => onDeleteRow(data.id)}
        disabled={isStreaming}
        className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-trader-border disabled:opacity-50 disabled:cursor-not-allowed"
        title="Delete row"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

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
    isStreaming,
    instrumentTypes,
    enabledComparisons,
    historicalPrices,
    addInstrument,
    removeInstrument,
    updateInstrument,
  } = usePricingStore();

  // Get available types
  const availableTypes = useMemo(() => instrumentTypes.map(t => t.type), [instrumentTypes]);

  // Get available groups for a given type
  const getGroupsForType = useCallback((type: string): string[] => {
    const typeInfo = instrumentTypes.find(t => t.type === type);
    return typeInfo?.groups ?? [];
  }, [instrumentTypes]);

  // Handle cell value change
  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;
    const field = colDef.field as keyof Instrument;

    if (field && data?.id) {
      const updates: Partial<Omit<Instrument, 'id'>> = { [field]: newValue };

      // If type changes, reset group
      if (field === 'type') {
        updates.group = '';
      }

      updateInstrument(data.id, updates);
    }
  }, [updateInstrument]);

  // Handle add row
  const handleAddRow = useCallback((rowIndex: number) => {
    addInstrument(rowIndex);
  }, [addInstrument]);

  // Handle delete row
  const handleDeleteRow = useCallback((id: string) => {
    removeInstrument(id);
  }, [removeInstrument]);

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
        group: inst.group,
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
    const starts = [...new Set(instruments.map((i) => i.start).filter(Boolean))];
    const ends = [...new Set(instruments.map((i) => i.end).filter(Boolean))];
    const types = [...new Set(instruments.map((i) => i.type).filter(Boolean))];
    const groups = [...new Set(instruments.map((i) => i.group).filter(Boolean))];

    starts.sort(tenorComparator);
    ends.sort(tenorComparator);

    const rows: PivotRow[] = [];

    if (viewMode === 'pivot') {
      if (pivotOrientation === 'startByEnd') {
        // Rows: Type + Group + Start, Columns: End tenors
        for (const type of types) {
          for (const group of groups) {
            for (const start of starts) {
              const row: PivotRow = { start, type, group };
              for (const end of ends) {
                const inst = instruments.find(
                  (i) => i.type === type && i.group === group && i.start === start && i.end === end
                );
                if (inst) {
                  const priceData = prices.get(inst.id);
                  row[end] = priceData?.price;
                }
              }
              if (Object.keys(row).some((k) => !['start', 'type', 'group'].includes(k) && row[k] !== undefined)) {
                rows.push(row);
              }
            }
          }
        }
      } else {
        // endByStart: Rows: Type + Group + End, Columns: Start tenors
        for (const type of types) {
          for (const group of groups) {
            for (const end of ends) {
              const row: PivotRow = { start: end, type, group }; // Using 'start' field for the row key
              for (const start of starts) {
                const inst = instruments.find(
                  (i) => i.type === type && i.group === group && i.start === start && i.end === end
                );
                if (inst) {
                  const priceData = prices.get(inst.id);
                  row[start] = priceData?.price;
                }
              }
              if (Object.keys(row).some((k) => !['start', 'type', 'group'].includes(k) && row[k] !== undefined)) {
                rows.push(row);
              }
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

  // Flat view columns with inline editing - includes comparison columns when enabled
  const flatColumns = useMemo((): ColDef[] => {
    const baseColumns: ColDef[] = [
      {
        field: 'actions',
        headerName: '',
        width: 70,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: ActionsCellRenderer,
        cellRendererParams: {
          onAddRow: handleAddRow,
          onDeleteRow: handleDeleteRow,
          isStreaming,
        },
      },
      {
        field: 'type',
        headerName: 'Type',
        width: 120,
        editable: !isStreaming,
        cellEditor: 'agRichSelectCellEditor',
        cellEditorParams: {
          values: availableTypes,
          cellHeight: 30,
          searchDebounceDelay: 500,
        },
        cellClass: 'font-medium',
        filter: 'agSetColumnFilter',
      },
      {
        field: 'group',
        headerName: 'Group',
        width: 100,
        editable: !isStreaming,
        cellEditor: 'agRichSelectCellEditor',
        cellEditorParams: (params: ICellEditorParams) => ({
          values: getGroupsForType(params.data?.type || ''),
          cellHeight: 30,
          searchDebounceDelay: 500,
        }),
        cellClass: 'font-medium',
        filter: 'agSetColumnFilter',
      },
      {
        field: 'start',
        headerName: 'Start',
        width: 80,
        editable: !isStreaming,
        filter: 'agSetColumnFilter',
        comparator: tenorComparator,
      },
      {
        field: 'end',
        headerName: 'End',
        width: 80,
        editable: !isStreaming,
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
  }, [priceValueFormatter, isStreaming, availableTypes, getGroupsForType, handleAddRow, handleDeleteRow, enabledComparisons, comparisonColumnDefs]);

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
        field: 'group',
        headerName: 'Group',
        pinned: 'left',
        width: 80,
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
    if ('id' in data && typeof data.id === 'string') {
      return data.id;
    }
    return `${data.type}-${data.group}-${data.start}`;
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
    const items: (string | MenuItemDef)[] = [
      'copy',
      'copyWithHeaders',
      'separator',
    ];

    // Add row option in flat mode when not streaming
    if (viewMode === 'flat' && !isStreaming && params.node) {
      items.push({
        name: 'Add Row Below',
        action: () => handleAddRow(params.node?.rowIndex ?? 0),
        icon: '<span style="color: #00c853;">+</span>',
      });
      items.push({
        name: 'Delete Row',
        action: () => params.node?.data && handleDeleteRow(params.node.data.id),
        icon: '<span style="color: #ff5252;">×</span>',
      });
      items.push('separator');
    }

    items.push(
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
      'resetColumns'
    );

    return items;
  }, [viewMode, isStreaming, handleAddRow, handleDeleteRow]);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-trader-panel border-b border-trader-border">
        <div className="flex items-center gap-3">
          <span className="text-xs text-trader-muted">
            {instruments.length} row{instruments.length !== 1 ? 's' : ''}
            {instruments.filter(i => i.type && i.group).length !== instruments.length && (
              <span className="text-trader-accent ml-2">
                ({instruments.filter(i => i.type && i.group).length} valid)
              </span>
            )}
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
          suppressCellFocus={false}
          headerHeight={32}
          rowHeight={28}
          singleClickEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellValueChanged={onCellValueChanged}
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
