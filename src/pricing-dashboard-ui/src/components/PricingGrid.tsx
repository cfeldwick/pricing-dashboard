import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  SideBarDef,
  StatusPanelDef,
  GetContextMenuItemsParams,
  MenuItemDef,
  ICellRendererParams,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import 'ag-grid-enterprise';
import { usePricingStore } from '../stores/pricingStore';
import { formatPrice, PriceCellRenderer } from './PriceCellRenderer';
import type { GridRow, PivotRow, PriceFormat } from '../types';

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

// Custom cell renderer wrapper for flat view price column
function FlatPriceCellRenderer(params: ICellRendererParams) {
  const data = params.data as GridRow;
  const context = params.context as { priceFormat: PriceFormat };

  return (
    <PriceCellRenderer
      {...params}
      priceFormat={context?.priceFormat || 'percent3'}
      priceChange={data?.priceChange}
      updateTimestamp={data?.updateTimestamp}
    />
  );
}

export function PricingGrid() {
  const gridRef = useRef<AgGridReact>(null);
  const {
    instruments,
    prices,
    previousPrices,
    updateTimestamps,
    viewMode,
    sequenceNumber,
    lastUpdateTime,
    priceFormat,
  } = usePricingStore();

  // Track previous ends to detect when pivot columns need updating
  const prevEndsRef = useRef<string>('');
  const prevViewModeRef = useRef(viewMode);

  // Flat view rows with update timestamps
  const flatRows = useMemo((): GridRow[] => {
    return instruments.map((inst) => {
      const priceData = prices.get(inst.id);
      const prevPrice = previousPrices.get(inst.id);
      const currentPrice = priceData?.price;
      const updateTs = updateTimestamps.get(inst.id);

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
        updateTimestamp: updateTs,
      };
    });
  }, [instruments, prices, previousPrices, updateTimestamps]);

  // Pivot view data - separate rows and column structure
  const pivotData = useMemo(() => {
    const starts = [...new Set(instruments.map((i) => i.start))];
    const ends = [...new Set(instruments.map((i) => i.end))];
    const types = [...new Set(instruments.map((i) => i.type))];

    starts.sort(tenorComparator);
    ends.sort(tenorComparator);

    const rows: PivotRow[] = [];
    if (viewMode === 'pivot') {
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
    }

    return { rows, ends };
  }, [viewMode, instruments, prices]);

  // Create pivot value formatter that uses current format
  const pivotValueFormatter = useCallback((params: { value: number | undefined | null }) => {
    return formatPrice(params.value, priceFormat);
  }, [priceFormat]);

  // Flat view columns - stable reference, only depends on priceFormat
  const flatColumns = useMemo((): ColDef[] => [
    {
      field: 'type',
      headerName: 'Type',
      width: 100,
      cellClass: 'font-medium',
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
    },
    {
      field: 'start',
      headerName: 'Start',
      width: 80,
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
      comparator: tenorComparator,
    },
    {
      field: 'end',
      headerName: 'End',
      width: 80,
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
      comparator: tenorComparator,
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 130,
      cellRenderer: FlatPriceCellRenderer,
      aggFunc: 'avg',
      enableValue: true,
      filter: 'agNumberColumnFilter',
    },
  ], []);

  // Pivot columns - depends on ends list and format
  const pivotColumns = useMemo((): ColDef[] => {
    return [
      {
        field: 'type',
        headerName: 'Type',
        pinned: 'left',
        width: 90,
        cellClass: 'font-medium',
        enableRowGroup: true,
      },
      {
        field: 'start',
        headerName: 'Start',
        pinned: 'left',
        width: 70,
        cellClass: 'font-medium',
        comparator: tenorComparator,
      },
      ...pivotData.ends.map((end) => ({
        field: end,
        headerName: end,
        width: 95,
        type: 'numericColumn',
        valueFormatter: pivotValueFormatter,
        cellClass: 'text-right font-mono',
        aggFunc: 'avg' as const,
      })),
    ];
  }, [pivotData.ends, pivotValueFormatter]);

  const getRowId = useCallback((params: { data: GridRow | PivotRow }): string => {
    const data = params.data;
    if ('id' in data && 'end' in data) {
      return (data as GridRow).id;
    }
    return `${data.type}-${data.start}`;
  }, []);

  // Only update row data, not columns, on each tick
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const rowData = viewMode === 'flat' ? flatRows : pivotData.rows;
    api.setGridOption('rowData', rowData);
  }, [viewMode, flatRows, pivotData.rows]);

  // Update columns only when view mode changes
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    if (viewMode !== prevViewModeRef.current) {
      prevViewModeRef.current = viewMode;
      if (viewMode === 'flat') {
        api.setGridOption('columnDefs', flatColumns);
      } else {
        api.setGridOption('columnDefs', pivotColumns);
        prevEndsRef.current = pivotData.ends.join(',');
      }
    }
  }, [viewMode, flatColumns, pivotColumns, pivotData.ends]);

  // Update pivot columns only when End tenors change (new instruments added)
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || viewMode !== 'pivot') return;

    const currentEnds = pivotData.ends.join(',');
    if (currentEnds !== prevEndsRef.current) {
      prevEndsRef.current = currentEnds;
      api.setGridOption('columnDefs', pivotColumns);
    }
  }, [viewMode, pivotData.ends, pivotColumns]);

  // Refresh cells when format changes
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    api.setGridOption('context', { priceFormat });
    api.refreshCells({ force: true });
  }, [priceFormat]);

  const defaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: false,
  }), []);

  // Enterprise: Side bar configuration
  const sideBar = useMemo((): SideBarDef => ({
    toolPanels: [
      {
        id: 'columns',
        labelDefault: 'Columns',
        labelKey: 'columns',
        iconKey: 'columns',
        toolPanel: 'agColumnsToolPanel',
        toolPanelParams: {
          suppressRowGroups: false,
          suppressValues: false,
          suppressPivots: false,
          suppressPivotMode: false,
        },
      },
      {
        id: 'filters',
        labelDefault: 'Filters',
        labelKey: 'filters',
        iconKey: 'filter',
        toolPanel: 'agFiltersToolPanel',
      },
    ],
    defaultToolPanel: '',
    hiddenByDefault: true,
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
          context={{ priceFormat }}
          animateRows={false}
          suppressCellFocus={true}
          headerHeight={32}
          rowHeight={28}
          // Enterprise features
          sideBar={sideBar}
          statusBar={statusBar}
          enableRangeSelection={true}
          enableRangeHandle={true}
          allowContextMenuWithControlKey={true}
          getContextMenuItems={getContextMenuItems}
          enableCharts={true}
          rowGroupPanelShow="onlyWhenGrouping"
          groupDisplayType="groupRows"
          suppressAggFuncInHeader={false}
          // Clipboard
          enableCellTextSelection={true}
          ensureDomOrder={true}
          // Row grouping & aggregation
          groupDefaultExpanded={1}
          autoGroupColumnDef={{
            minWidth: 200,
            cellRendererParams: {
              suppressCount: false,
            },
          }}
          // Maintain column state
          maintainColumnOrder={true}
        />
      </div>
    </div>
  );
}
