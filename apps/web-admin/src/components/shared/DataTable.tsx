import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';

import { EmptyState } from './EmptyState';

const SELECT_COLUMN_ID = '__select__';

function selectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: SELECT_COLUMN_ID,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    meta: { align: 'left' },
  };
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: TData) => void;
  enableSelection?: boolean;
  /** Rendered above the table when ≥1 row is selected (design.md §8 bulk action bar). */
  renderBulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Number of skeleton rows to show while loading. */
  skeletonRows?: number;
  /** Tighter row height + cell padding, independent of the global density setting. Opt-in per table. */
  compact?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  loading = false,
  getRowId,
  onRowClick,
  enableSelection = false,
  renderBulkActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  skeletonRows = 8,
  compact = false,
}: DataTableProps<TData>) {
  const { t } = useTranslation();
  const density = useUiStore((s) => s.tableDensity);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns = useMemo(
    () => (enableSelection ? [selectColumn<TData>(), ...columns] : columns),
    [enableSelection, columns],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { rowSelection, sorting },
    enableRowSelection: enableSelection,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const rowHeight = compact ? 'h-9' : density === 'compact' ? 'h-9' : 'h-11';
  const cellPadding = compact ? 'py-1.5' : undefined;

  return (
    <div className="space-y-2">
      {enableSelection && selectedIds.length > 0 && renderBulkActions ? (
        <div
          className="flex items-center justify-between rounded-sm border border-border bg-muted px-3 py-2 text-sm"
          role="region"
          aria-label={t('table.bulkActions')}
        >
          <span className="font-medium">{t('table.selectedCount', { count: selectedIds.length })}</span>
          <div className="flex items-center gap-2">
            {renderBulkActions(selectedIds, () => setRowSelection({}))}
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const align = (
                  header.column.columnDef.meta as { align?: 'left' | 'right' } | undefined
                )?.align;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(align === 'right' && 'text-right', compact && 'h-9')}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          '-mx-1.5 inline-flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors',
                          align === 'right' && 'w-[calc(100%+0.75rem)] justify-end',
                          canSort
                            ? 'cursor-pointer hover:bg-background/70 hover:text-foreground'
                            : 'cursor-default',
                        )}
                        onClick={
                          canSort ? header.column.getToggleSortingHandler() : undefined
                        }
                        disabled={!canSort}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : canSort ? (
                          <ArrowUpDown
                            className="h-3 w-3 shrink-0 opacity-40"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              <TableRow key={`sk-${r}`} className={rowHeight}>
                {tableColumns.map((_c, c) => (
                  <TableCell key={c} className={cellPadding}>
                    <div
                      className={cn(
                        'h-4 w-full animate-pulse rounded-sm bg-muted',
                        ['max-w-[64px]', 'max-w-[150px]', 'max-w-[110px]', 'max-w-[90px]', 'max-w-[120px]', 'max-w-[72px]', 'max-w-[96px]'][
                          c % 7
                        ],
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={tableColumns.length} className="p-0">
                <EmptyState
                  title={emptyTitle ?? t('table.empty')}
                  description={emptyDescription}
                  action={emptyAction}
                  className="border-0"
                />
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(rowHeight, onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cellPadding}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
