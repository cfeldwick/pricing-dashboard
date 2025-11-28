import { useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellClassParams,
  ValueFormatterParams,
  SideBarDef,
  StatusPanelDef,
  GetContextMenuItemsParams,
  MenuItemDef,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import 'ag-grid-enterprise';
import { usePricingStore } from '../stores/pricingStore';
import type { GridRow, PivotRow } from '../types';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// For PoC evaluation - in production, use a real license key
// This will show a watermark but all features work
LicenseManager.setLicenseKey('');

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

    const starts = [...new Set(instruments.map((i) => i.start))];
    const ends = [...new Set(instruments.map((i) => i.end))];
    const types = [...new Set(instruments.map((i) => i.type))];

    starts.sort(tenorComparator);
    ends.sort(tenorComparator);

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
        if (Object.keys(row).some((k) => k !== 'start' && k !== 'type' && row[k] !== undefined)) {
          rows.push(row);
        }
      }
    }

    const columns: ColDef[] = [
      {
        field: 'type',
        headerName: 'Type',
        pinned: 'left',
        width: 90,
        cellClass: 'font-medium',
        enableRowGroup: true,
        rowGroup: false,
      },
      {
        field: 'start',
        headerName: 'Start',
        pinned: 'left',
        width: 70,
        cellClass: 'font-medium',
        comparator: tenorComparator,
      },
      ...ends.map((end) => ({
        field: end,
        headerName: end,
        width: 85,
        type: 'numericColumn',
        valueFormatter: priceFormatter,
        cellClass: 'text-right font-mono',
        aggFunc: 'avg' as const,
      })),
    ];

    return { rows, columns };
  }, [viewMode, instruments, prices]);

  // Flat view columns with enterprise features
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
      width: 110,
      type: 'numericColumn',
      valueFormatter: priceFormatter,
      cellClass: (params) => `text-right font-mono ${getPriceClass(params)}`,
      aggFunc: 'avg',
      enableValue: true,
      filter: 'agNumberColumnFilter',
    },
  ], []);

  const getRowId = useCallback((params: { data: GridRow | PivotRow }): string => {
    const data = params.data;
    if ('id' in data && 'end' in data) {
      return (data as GridRow).id;
    }
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
    filter: true,
    floatingFilter: false,
    enableCellChangeFlash: true,
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
    const result: (string | MenuItemDef)[] = [
      'copy',
      'copyWithHeaders',
      'copyWithGroupHeaders',
      'separator',
      'export',
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
    return result;
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
          columnDefs={viewMode === 'flat' ? flatColumns : pivotData.columns}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
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
        />
      </div>
    </div>
  );
}
