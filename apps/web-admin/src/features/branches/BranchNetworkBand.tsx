import type { BranchInsightsView } from '@abcp/shared-types';
import { ArrowDownRight, ArrowUpRight, ChevronDown, CircleCheck, Minus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { DailyBars, Figure } from '@/features/payments-treasury/banks.parts';
import { SegmentBar, SegmentLegend, type Segment } from '@/features/payroll/payroll.parts';
import type { Tone } from '@/features/payroll/payroll.lib';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { IssueLine } from './branches.parts';
import { deltaPct, type NetworkTotals, type Row, fmtDelta } from './branches.lib';

const SPLIT_TONES: Tone[] = ['primary', 'info', 'accent', 'success'];

/**
 * Band 1 (left) — the network's money for the period: total with delta vs the previous equal
 * window, today's live figures, the split by branch and the daily bars.
 */
export function NetworkHeroCard({
  insights,
  totals,
  rows,
  loading,
}: {
  insights: BranchInsightsView | undefined;
  totals: NetworkTotals | null;
  rows: Row[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading || !insights || !totals) return <Skeleton className="h-[360px] w-full rounded-xl" />;

  const delta = deltaPct(totals.revenue, totals.revenuePrev);
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const ranked = rows
    .filter((r) => (r.insight?.period.revenue ?? 0) > 0)
    .sort((a, z) => (z.insight?.period.revenue ?? 0) - (a.insight?.period.revenue ?? 0));
  const other = ranked.slice(4).reduce((s, r) => s + (r.insight?.period.revenue ?? 0), 0);
  const segments: Segment[] = [
    ...ranked.slice(0, 4).map((r, i) => ({
      key: r.branch.id,
      value: r.insight?.period.revenue ?? 0,
      tone: SPLIT_TONES[i % SPLIT_TONES.length]!,
      label: r.branch.code || r.branch.name,
    })),
    ...(other > 0 ? [{ key: 'other', value: other, tone: 'neutral' as Tone, label: t('branches.hero.other') }] : []),
  ];

  return (
    <section
      aria-labelledby="network-title"
      className="relative h-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="network-title" className="text-sm font-semibold">
            {t('branches.hero.title', { days: insights.days })}
          </h2>
          <p className="text-2xs text-muted-foreground">
            {formatDate(insights.from)} – {formatDate(insights.to)} · {t('branches.hero.basis')}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums',
            delta == null ? 'bg-muted text-muted-foreground' : delta >= 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
          )}
          title={t('branches.hero.prev', { amount: formatCurrency(totals.revenuePrev) })}
        >
          <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          {delta == null ? t('branches.hero.noBaseline') : t('branches.hero.vsPrev', { delta: fmtDelta(delta) })}
        </span>
      </div>

      <p className="relative mt-3 text-3xl font-semibold leading-none tabular-nums sm:text-4xl" title={formatCurrency(totals.revenue)}>
        {formatCurrency(totals.revenue)}
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">
        {t('branches.hero.bookings', { count: totals.bookings, customers: totals.customers })}
      </p>

      <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label={t('branches.hero.todayAppts')} value={totals.todayAppointments} hint={t('branches.hero.inService', { count: totals.todayInProgress })} />
        <Figure label={t('branches.hero.todayRevenue')} value={formatCompactNumber(totals.todayRevenue)} hint={t('branches.hero.completedOnly')} />
        <Figure
          label={t('branches.hero.queue')}
          value={totals.queueWaiting}
          tone={totals.queueWaiting >= 10 ? 'warning' : undefined}
          hint={t('branches.hero.queueHint')}
        />
        <Figure
          label={t('branches.hero.loss')}
          value={totals.lossRate == null ? '—' : `${Math.round(totals.lossRate * 100)}%`}
          tone={totals.lossRate != null && totals.lossRate >= 0.2 ? 'danger' : undefined}
          hint={t('branches.hero.lossHint')}
        />
      </div>

      <div className="relative mt-4 space-y-2">
        <p className="text-2xs font-medium text-muted-foreground">{t('branches.hero.split')}</p>
        <SegmentBar segments={segments} ariaLabel={t('branches.hero.split')} height="h-2.5" />
        {segments.length > 0 ? (
          <SegmentLegend segments={segments} render={(s) => formatCompactNumber(s.value)} />
        ) : (
          <p className="text-2xs text-muted-foreground">{t('branches.hero.nothing')}</p>
        )}
      </div>

      <div className="relative mt-4">
        <DailyBars values={totals.daily} fromKey={insights.from} height={64} />
      </div>
    </section>
  );
}

/**
 * Band 1 (right) — the attention list: every issue across the network, most severe first,
 * each linking to its branch. Empty state is an explicit all-clear, not a blank card.
 */
export function AttentionCard({
  rows,
  loading,
  onOpen,
}: {
  rows: Row[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading) return <Skeleton className="h-[360px] w-full rounded-xl" />;
  const order = { danger: 0, warning: 1, info: 2 } as const;
  const all = rows
    .flatMap((r) => r.issues.map((issue) => ({ issue, row: r })))
    .sort((a, z) => order[a.issue.tone] - order[z.issue.tone]);
  const critical = all.filter((x) => x.issue.tone === 'danger').length;
  // Same issue at several branches collapses into one expandable line (keeps the card scannable).
  const groups: { kind: string; items: typeof all }[] = [];
  for (const x of all) {
    const g = groups.find((y) => y.kind === x.issue.kind);
    if (g) g.items.push(x);
    else groups.push({ kind: x.issue.kind, items: [x] });
  }
  const clean = rows.filter((r) => r.issues.every((x) => x.tone === 'info')).length;

  return (
    <section
      aria-labelledby="attention-title"
      className="flex h-full max-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 [animation-delay:60ms] motion-reduce:animate-none"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="attention-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('branches.attention.title')}
          </h2>
          <p className="text-2xs text-muted-foreground">
            {t('branches.attention.meta', { clean, total: rows.length })}
          </p>
        </div>
        {critical > 0 ? (
          <span className="shrink-0 rounded-full bg-destructive-soft px-2 py-0.5 text-2xs font-semibold text-destructive">
            {t('branches.attention.critical', { count: critical })}
          </span>
        ) : null}
      </header>
      {groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <CircleCheck className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium">{t('branches.attention.clearTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('branches.attention.clearHint')}</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {groups.map(({ kind, items }) => {
            const first = items[0]!;
            if (items.length === 1) {
              return (
                <li key={kind}>
                  <button
                    type="button"
                    onClick={() => onOpen(first.row.branch.id)}
                    className="block w-full rounded-md text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <IssueLine
                      issue={first.issue}
                      action={<BranchTag branch={first.row.branch} />}
                    />
                  </button>
                </li>
              );
            }
            const open = expanded === kind;
            return (
              <li key={kind}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : kind)}
                  className="block w-full rounded-md text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <IssueLine
                    issue={first.issue}
                    group={t('branches.attention.acrossBranches', { count: items.length })}
                    action={
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                        aria-hidden="true"
                      />
                    }
                  />
                </button>
                {open ? (
                  <ul className="mt-1 flex flex-wrap gap-1 pl-7">
                    {items.map(({ row }) => (
                      <li key={row.branch.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(row.branch.id)}
                          className={cn(
                            'max-w-48 truncate rounded-full border border-border bg-card px-2 py-0.5 text-2xs hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            row.branch.code && 'font-mono',
                          )}
                        >
                          {row.branch.code || row.branch.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Branch code in mono when it has one; otherwise the (possibly Lao) name in the body font. */
function BranchTag({ branch }: { branch: Row['branch'] }) {
  return (
    <span className={cn('max-w-40 shrink-0 truncate text-2xs text-muted-foreground', branch.code && 'font-mono')}>
      {branch.code || branch.name}
    </span>
  );
}
