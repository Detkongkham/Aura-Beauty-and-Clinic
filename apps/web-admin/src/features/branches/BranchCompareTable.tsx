import { ArrowDown, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TonePill } from '@/features/payments-treasury/banks.parts';
import { RankBadge, Sparkline } from '@/features/payroll/payroll.parts';
import { formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BranchMonogram, UtilMeter } from './branches.parts';
import { HEALTH_TONE, deltaPct, healthOf, lossRate, type Row, type SortKey, fmtDelta } from './branches.lib';
import { provinceName } from './lao-provinces';

const SORTABLE: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'revenue', label: 'branches.col.revenue', align: 'right' },
  { key: 'bookings', label: 'branches.col.bookings', align: 'right' },
  { key: 'utilization', label: 'branches.col.utilization' },
  { key: 'rating', label: 'branches.col.rating', align: 'right' },
];

/**
 * Side-by-side league table. Rank follows the active sort; header buttons re-sort (desc).
 * Money is compact in cells with the exact figure in the tooltip. Scrolls horizontally inside
 * its own card on narrow screens so the page never does.
 */
export function BranchCompareTable({
  rows,
  sort,
  onSort,
  activeId,
  onOpen,
  days,
}: {
  rows: Row[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
  activeId: string | null;
  onOpen: (id: string) => void;
  days: number;
}) {
  const { t, i18n } = useTranslation();
  const maxRevenue = Math.max(1, ...rows.map((r) => r.insight?.period.revenue ?? 0));

  const th = 'whitespace-nowrap px-3 py-2 text-2xs font-medium text-muted-foreground';
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">{t('branches.compare.caption', { days })}</caption>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className={cn(th, 'w-10 text-left')}>#</th>
              <th scope="col" className={cn(th, 'text-left')}>{t('branches.col.branch')}</th>
              {SORTABLE.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort === c.key ? 'descending' : 'none'} className={cn(th, c.align === 'right' ? 'text-right' : 'text-left')}>
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      sort === c.key && 'font-semibold text-foreground',
                    )}
                  >
                    {t(c.label)}
                    <ArrowDown className={cn('h-3 w-3', sort === c.key ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  </button>
                </th>
              ))}
              <th scope="col" className={cn(th, 'text-right')}>{t('branches.col.avgTicket')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('branches.col.loss')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('branches.col.staff')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('branches.col.unpaid')}</th>
              <th scope="col" className={cn(th, 'text-left')}>{t('branches.col.health')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, idx) => {
              const { branch: b, insight: i } = r;
              const delta = i ? deltaPct(i.period.revenue, i.period.revenuePrev) : null;
              const loss = i ? lossRate(i) : null;
              const health = healthOf(r.issues);
              return (
                <tr
                  key={b.id}
                  onClick={() => onOpen(b.id)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/40 motion-reduce:transition-none',
                    activeId === b.id && 'bg-primary/5',
                  )}
                >
                  <td className="px-3 py-2.5">{sort === 'name' ? <span className="pl-2 text-xs text-muted-foreground">{idx + 1}</span> : <RankBadge rank={idx + 1} />}</td>
                  <td className="max-w-[240px] px-3 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(b.id);
                      }}
                      className="flex w-full min-w-0 items-center gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <BranchMonogram code={b.code} name={b.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{b.name}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {b.code ? `${b.code} · ` : ''}
                          {provinceName(b.province, i18n.language)}
                          {!b.isActive ? ` · ${t('branches.inactive')}` : ''}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right" title={i ? formatCurrency(i.period.revenue) : undefined}>
                    {i ? (
                      <div className="ml-auto w-32">
                        <p className="font-semibold tabular-nums">{formatCompactNumber(i.period.revenue)}</p>
                        <p className={cn('text-2xs tabular-nums', delta == null ? 'text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-destructive')}>
                          {delta == null ? t('branches.card.new') : fmtDelta(delta)}
                        </p>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(i.period.revenue / maxRevenue) * 100}%` }} />
                        </span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {i ? (
                      <>
                        <p className="font-medium">{i.period.bookings}</p>
                        <div className="ml-auto w-20">
                          <Sparkline values={i.period.daily} className="h-4" ariaLabel={t('branches.card.trendAria', { name: b.name })} />
                        </div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="w-40 px-3 py-2.5">{i ? <UtilMeter value={i.period.utilization} /> : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {i?.rating.avg != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
                        {i.rating.avg.toFixed(1)}
                        <span className="text-2xs text-muted-foreground">({i.rating.count})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{i ? formatCompactNumber(i.period.avgTicket) : '—'}</td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums', loss != null && loss >= 0.2 && 'font-semibold text-destructive')}>
                    {loss == null ? '—' : `${Math.round(loss * 100)}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{i?.staffCount ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={i ? formatCurrency(i.outstandingAmount) : undefined}>
                    {i && i.outstandingBills > 0 ? (
                      <span className="text-warning">{i.outstandingBills} · {formatCompactNumber(i.outstandingAmount)}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {i ? (
                      <TonePill tone={HEALTH_TONE[health]}>
                        {t(`branches.health.${health}`)}
                        {r.issues.length ? ` · ${r.issues.length}` : ''}
                      </TonePill>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
