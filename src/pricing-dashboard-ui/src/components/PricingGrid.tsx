import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  SideBarDef,
  StatusPanelDef,
  GetContextMenuItemsParams,
  MenuItemDef,
  ICellRendererParams,
  GridReadyEvent,
  ColumnPivotModeChangedEvent,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import 'ag-grid-enterprise';
import { usePricingStore } from '../stores/pricingStore';
import { formatPrice, PriceCellRenderer } from './PriceCellRenderer';
import type { GridRow, PriceFormat } from '../types';

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

// Custom cell renderer for price column
function PriceColumnRenderer(params: ICellRendererParams) {
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
    setViewMode,
    sequenceNumber,
    lastUpdateTime,
    priceFormat,
  } = usePricingStore();

  // Build row data from instruments and prices
  const rowData = useMemo((): GridRow[] => {
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

  // Price value formatter for pivot mode aggregated values
  const priceValueFormatter = useCallback((params: { value: number | undefined | null }) => {
    return formatPrice(params.value, priceFormat);
  }, [priceFormat]);

  // Column definitions - configured for both flat and pivot modes
  const columnDefs = useMemo((): ColDef[] => [
    {
      field: 'type',
      headerName: 'Type',
      width: 100,
      cellClass: 'font-medium',
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
      // Default: group by type in pivot mode
      rowGroup: viewMode === 'pivot',
      hide: viewMode === 'pivot',
    },
    {
      field: 'start',
      headerName: 'Start',
      width: 80,
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
      comparator: tenorComparator,
      // Default: group by start in pivot mode
      rowGroup: viewMode === 'pivot',
      hide: viewMode === 'pivot',
    },
    {
      field: 'end',
      headerName: 'End',
      width: 80,
      enableRowGroup: true,
      enablePivot: true,
      filter: 'agSetColumnFilter',
      comparator: tenorComparator,
      // Default: pivot on end in pivot mode
      pivot: viewMode === 'pivot',
      hide: viewMode === 'pivot',
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 130,
      cellRenderer: viewMode === 'flat' ? PriceColumnRenderer : undefined,
      valueFormatter: viewMode === 'pivot' ? priceValueFormatter : undefined,
      aggFunc: 'avg',
      enableValue: true,
      filter: 'agNumberColumnFilter',
      cellClass: viewMode === 'pivot' ? 'text-right font-mono' : undefined,
    },
  ], [viewMode, priceValueFormatter]);

  const getRowId = useCallback((params: { data: GridRow }): string => {
    return params.data.id;
  }, []);

  // Handle grid ready - set initial state
  const onGridReady = useCallback((event: GridReadyEvent) => {
    // Open sidebar columns panel when in pivot mode for easier configuration
    if (viewMode === 'pivot') {
      event.api.openToolPanel('columns');
    }
  }, [viewMode]);

  // Sync view mode when pivot mode changes in grid
  const onColumnPivotModeChanged = useCallback((event: ColumnPivotModeChangedEvent) => {
    const isPivotMode = event.api.isPivotMode();
    const currentViewMode = isPivotMode ? 'pivot' : 'flat';
    if (currentViewMode !== viewMode) {
      setViewMode(currentViewMode);
    }
  }, [viewMode, setViewMode]);

  // Toggle pivot mode when viewMode changes from store
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const isPivotMode = api.isPivotMode();
    const shouldBePivot = viewMode === 'pivot';

    if (isPivotMode !== shouldBePivot) {
      api.setGridOption('pivotMode', shouldBePivot);

      // Apply default pivot configuration
      if (shouldBePivot) {
        // Set up default pivot: Type + Start as row groups, End as pivot, Price as value
        api.applyColumnState({
          state: [
            { colId: 'type', rowGroup: true, hide: true },
            { colId: 'start', rowGroup: true, hide: true },
            { colId: 'end', pivot: true, hide: true },
            { colId: 'price', aggFunc: 'avg' },
          ],
          defaultState: { rowGroup: false, pivot: false },
        });
        api.openToolPanel('columns');
      } else {
        // Reset to flat view
        api.applyColumnState({
          state: [
            { colId: 'type', rowGroup: false, hide: false },
            { colId: 'start', rowGroup: false, hide: false },
            { colId: 'end', pivot: false, hide: false },
            { colId: 'price', aggFunc: null },
          ],
        });
        api.closeToolPanel();
      }
    }
  }, [viewMode]);

  // Update row data
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setGridOption('rowData', rowData);
  }, [rowData]);

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

  // Enterprise: Side bar configuration - always visible for pivot controls
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
          suppressColumnFilter: false,
          suppressColumnSelectAll: false,
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
    defaultToolPanel: viewMode === 'pivot' ? 'columns' : '',
    hiddenByDefault: false,
    position: 'right',
  }), [viewMode]);

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

  // Auto-group column configuration for pivot mode
  const autoGroupColumnDef = useMemo((): ColDef => ({
    headerName: 'Group',
    minWidth: 150,
    cellRendererParams: {
      suppressCount: false,
    },
    sortable: true,
    filter: true,
    comparator: tenorComparator,
  }), []);

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
          {viewMode === 'pivot' && (
            <span className="text-xxs text-green-500 bg-trader-bg px-1.5 py-0.5 rounded">
              Pivot Mode
            </span>
          )}
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
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          context={{ priceFormat }}
          onGridReady={onGridReady}
          onColumnPivotModeChanged={onColumnPivotModeChanged}
          animateRows={false}
          suppressCellFocus={true}
          headerHeight={32}
          rowHeight={28}
          // Pivot mode
          pivotMode={viewMode === 'pivot'}
          pivotDefaultExpanded={-1}
          pivotColumnGroupTotals="before"
          // Enterprise features
          sideBar={sideBar}
          statusBar={statusBar}
          enableRangeSelection={true}
          enableRangeHandle={true}
          allowContextMenuWithControlKey={true}
          getContextMenuItems={getContextMenuItems}
          enableCharts={true}
          // Row grouping
          rowGroupPanelShow="always"
          groupDisplayType="multipleColumns"
          suppressAggFuncInHeader={false}
          groupDefaultExpanded={-1}
          autoGroupColumnDef={autoGroupColumnDef}
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
