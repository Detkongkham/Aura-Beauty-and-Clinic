import { Layers, ListChecks, Scale } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { STOCK_AGING_BUCKETS, type AbcView, type StockAgingBucket } from '@abcp/shared-types';

import { StatusPill } from '@/components/shared';
import { formatCurrency } from '@/lib/format';

import { CellBar, LedgerTable } from './LedgerTable';
import { ReportStatCard } from './ReportStatCard';

/**
 * Inventory audit 9C — M3: category grouping (valuation / turnover / aging with groupBy=category) and the
 * ABC analysis report. Kept out of StandardReportsTab so that file only wires queries + controls.
 */

export type CategoryGroupRow = {
  categoryId: string | null;
  categoryName: string | null;
  products?: number;
  qty?: number;
  value?: number;
  cogs?: number;
  avgValue?: number;
  turnover?: number;
  daysOnHand?: number | null;
  byBucket?: Record<StockAgingBucket, number>;
};

type Kind = 'valuation' | 'turnover' | 'aging';

const catName = (t: TFunction, g: CategoryGroupRow) =>
  g.categoryName ?? t('reports.inv.uncategorized');

export function CategoryGroupsTable({
  kind,
  groups,
  t,
}: {
  kind: Kind;
  groups: CategoryGroupRow[];
  t: TFunction;
}) {
  const max = Math.max(
    1,
    ...groups.map((g) => (kind === 'turnover' ? (g.cogs ?? 0) : (g.value ?? 0))),
  );
  const name = {
    key: 'name',
    label: t('reports.inv.category'),
    render: (g: CategoryGroupRow) => <span className="font-medium">{catName(t, g)}</span>,
    sortValue: (g: CategoryGroupRow) => catName(t, g),
  };
  const columns =
    kind === 'valuation'
      ? [
          name,
          {
            key: 'products',
            label: t('reports.inv.products'),
            align: 'right' as const,
            render: (g: CategoryGroupRow) => g.products ?? 0,
            sortValue: (g: CategoryGroupRow) => g.products ?? 0,
          },
          {
            key: 'qty',
            label: t('reports.inv.qty'),
            align: 'right' as const,
            render: (g: CategoryGroupRow) => (g.qty ?? 0).toLocaleString(),
            sortValue: (g: CategoryGroupRow) => g.qty ?? 0,
          },
          {
            key: 'value',
            label: t('reports.inv.value'),
            align: 'right' as const,
            render: (g: CategoryGroupRow) => (
              <span className="inline-flex items-center justify-end">
                {formatCurrency(g.value ?? 0)}
                <CellBar value={Math.max(0, g.value ?? 0)} max={max} />
              </span>
            ),
            sortValue: (g: CategoryGroupRow) => g.value ?? 0,
          },
        ]
      : kind === 'turnover'
        ? [
            name,
            {
              key: 'cogs',
              label: t('reports.fin.cogs'),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => formatCurrency(g.cogs ?? 0),
              sortValue: (g: CategoryGroupRow) => g.cogs ?? 0,
            },
            {
              key: 'avg',
              label: t('reports.inv.avgValue'),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => formatCurrency(g.avgValue ?? 0),
              sortValue: (g: CategoryGroupRow) => g.avgValue ?? 0,
            },
            {
              key: 'turn',
              label: t('reports.inv.turnover'),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => `${g.turnover ?? 0}×`,
              sortValue: (g: CategoryGroupRow) => g.turnover ?? 0,
            },
            {
              key: 'doh',
              label: t('reports.inv.daysOnHand'),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => g.daysOnHand ?? '—',
              sortValue: (g: CategoryGroupRow) => g.daysOnHand ?? Number.MAX_SAFE_INTEGER,
            },
          ]
        : [
            name,
            ...STOCK_AGING_BUCKETS.map((b) => ({
              key: b,
              label: t('reports.inv.bucketDays', { range: b }),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => formatCurrency(g.byBucket?.[b] ?? 0),
              sortValue: (g: CategoryGroupRow) => g.byBucket?.[b] ?? 0,
            })),
            {
              key: 'value',
              label: t('reports.inv.value'),
              align: 'right' as const,
              render: (g: CategoryGroupRow) => formatCurrency(g.value ?? 0),
              sortValue: (g: CategoryGroupRow) => g.value ?? 0,
            },
          ];
  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
        {t('reports.inv.byCategory')}
      </h3>
      <LedgerTable
        rows={groups}
        rowKey={(g) => g.categoryId ?? 'none'}
        columns={columns}
        empty={t('reports.empty')}
      />
    </div>
  );
}

// ---- ABC ---------------------------------------------------------------

const CLASS_VARIANT = { A: 'primary', B: 'info', C: 'neutral' } as const;

export function AbcReportBody({ d, t }: { d: AbcView; t: TFunction }): ReactNode {
  const max = Math.max(1, ...d.rows.map((r) => r.value));
  const cls = (c: 'A' | 'B' | 'C') => d.classes.find((x) => x.abcClass === c)!;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(['A', 'B', 'C'] as const).map((c, i) => (
          <ReportStatCard
            key={c}
            index={i}
            label={t('reports.inv.abcClass', { cls: c })}
            value={cls(c).products}
            sub={`${cls(c).sharePct}% · ${formatCurrency(cls(c).value)}`}
            icon={
              c === 'A' ? (
                <Layers className="h-4 w-4" aria-hidden="true" />
              ) : c === 'B' ? (
                <ListChecks className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Scale className="h-4 w-4" aria-hidden="true" />
              )
            }
            tone={c === 'A' ? 'primary' : c === 'B' ? 'info' : 'violet'}
          />
        ))}
        <ReportStatCard
          index={3}
          label={t('reports.inv.abcTotal')}
          value={formatCurrency(d.totals.value)}
          sub={t('reports.inv.abcThresholds', { a: d.thresholds.a, b: d.thresholds.b })}
          icon={<Layers className="h-4 w-4" aria-hidden="true" />}
          tone="success"
        />
      </div>
      <LedgerTable
        rows={d.rows}
        rowKey={(r) => r.productId}
        empty={t('reports.empty')}
        defaultSort={{ key: 'value', dir: 'desc' }}
        columns={[
          {
            key: 'name',
            label: t('reports.inv.product'),
            render: (r) => (
              <span>
                <span className="font-medium">{r.productName}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {r.sku} · {r.branchName}
                  {r.categoryName ? ` · ${r.categoryName}` : ''}
                </span>
              </span>
            ),
            sortValue: (r) => r.productName,
          },
          {
            key: 'class',
            label: t('reports.inv.abc'),
            render: (r) => (
              <StatusPill
                status={`abc-${r.abcClass}`}
                variant={CLASS_VARIANT[r.abcClass]}
                label={r.abcClass}
              />
            ),
            sortValue: (r) => r.abcClass,
          },
          {
            key: 'value',
            label:
              d.basis === 'stockValue' ? t('reports.inv.value') : t('reports.inv.consumptionValue'),
            align: 'right',
            render: (r) => (
              <span className="inline-flex items-center justify-end">
                {formatCurrency(r.value)}
                <CellBar value={r.value} max={max} />
              </span>
            ),
            sortValue: (r) => r.value,
          },
          {
            key: 'share',
            label: t('reports.inv.share'),
            align: 'right',
            render: (r) => `${r.sharePct}%`,
            sortValue: (r) => r.sharePct,
          },
          {
            key: 'cum',
            label: t('reports.inv.cumulative'),
            align: 'right',
            render: (r) => `${r.cumulativePct}%`,
            sortValue: (r) => r.cumulativePct,
          },
        ]}
        total={[t('reports.total'), '', formatCurrency(d.totals.value), '100%', '']}
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('reports.inv.abcNote')}
      </p>
    </div>
  );
}
