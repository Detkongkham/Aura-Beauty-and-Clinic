import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface LedgerColumn<Row> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  width?: string;
  render: (row: Row, index: number) => ReactNode;
  /** Provide to make the column header a sort toggle. */
  sortValue?: (row: Row) => number | string;
}

interface Props<Row> {
  columns: LedgerColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  /** Footing row — rendered with a rule + emphasis. Cells map 1:1 to columns. */
  total?: ReactNode[];
  caption?: string;
  empty?: string;
  /** Default sort on mount: column key + direction. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
}

/**
 * Ruled ledger — the reports feature's table style. Hairline rules, a compact
 * micro header, right-aligned figures, an emphasised TOTAL row, optional
 * click/keyboard column sorting with `aria-sort`, and a quiet row hover.
 */
export function LedgerTable<Row>({
  columns,
  rows,
  rowKey,
  total,
  caption,
  empty,
  defaultSort,
}: Props<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    defaultSort ?? null,
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const val = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((cur) =>
      cur?.key === key
        ? cur.dir === 'desc'
          ? { key, dir: 'asc' }
          : null
        : { key, dir: 'desc' },
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortValue ? ariaSort : undefined}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'bg-muted px-2 py-2 text-[11px] font-semibold text-foreground first:rounded-l-md last:rounded-r-md',
                    col.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm px-0.5 -mx-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        col.align === 'right' && 'flex-row-reverse',
                        active && 'text-foreground',
                      )}
                    >
                      {col.label}
                      {active ? (
                        sort!.dir === 'asc' ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                {empty ?? '—'}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-2 py-2 align-middle',
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                    )}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {total && sorted.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50">
              {total.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-2 py-2 text-[13px] font-bold text-foreground',
                    columns[i]?.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Single-hue in-cell bar (azure) — keeps category tables from turning into a rainbow. */
export function CellBar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <span className="ml-3 hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-primary/15 align-middle sm:inline-block">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
    </span>
  );
}
