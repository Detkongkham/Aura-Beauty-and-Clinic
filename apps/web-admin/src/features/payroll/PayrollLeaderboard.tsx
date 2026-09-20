import type { PayrollReport, PayrollRow } from '@abcp/shared-types';
import { Crown, Medal, Star, Target, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText, EmptyState } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { attainmentTone, formatDelta, TONE } from './payroll.lib';
import { AttainmentMeter, PayoutStatePill, SectionCard } from './payroll.parts';

const PODIUM_TONE = ['warning', 'neutral', 'accent'] as const;

/** Podium card for one of the top three. The winner card is taller by order, not by scale. */
function PodiumCard({
  row,
  place,
  onOpen,
}: {
  row: PayrollRow;
  place: 0 | 1 | 2;
  onOpen: (r: PayrollRow) => void;
}) {
  const { t } = useTranslation();
  const tone = TONE[PODIUM_TONE[place]];
  const Icon = place === 0 ? Crown : Medal;

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        'group relative flex min-w-0 flex-col items-center gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 text-center shadow-sm',
        'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        place === 0 && 'border-warning/30 bg-gradient-to-b from-warning-soft/40 to-card sm:-mt-3',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1', tone.bar)} aria-hidden="true" />

      <span className="relative mt-1">
        <PersonAvatar name={row.staffName} size={place === 0 ? 64 : 52} />
        <span
          className={cn(
            'absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-card',
            tone.chip,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{row.staffName}</p>
        <p className="truncate text-2xs text-muted-foreground">{row.branchName}</p>
      </div>

      <p className="text-lg font-bold tabular-nums text-foreground">
        <CurrencyText amount={row.grossRevenue} />
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Badge variant="neutral" className="px-1.5 py-0 text-2xs">
          {t('payroll.jobsCount', { count: row.completedJobs })}
        </Badge>
        {row.targetRevenue > 0 ? (
          <Badge variant={row.targetMet ? 'success' : 'neutral'} className="px-1.5 py-0 text-2xs">
            {row.attainmentPct}%
          </Badge>
        ) : null}
        {row.totalReviews > 0 ? (
          <Badge variant="accent" className="px-1.5 py-0 text-2xs">
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            {row.rating.toFixed(1)}
          </Badge>
        ) : null}
      </div>

      <p className="text-2xs text-muted-foreground">
        {t('payroll.col.payable')}{' '}
        <span className="font-semibold text-foreground">
          <CurrencyText amount={row.payable} />
        </span>
      </p>
    </button>
  );
}

/** One ranked row below the podium — rank, person, revenue bar, attainment, payout state. */
function RankRow({
  row,
  max,
  onOpen,
}: {
  row: PayrollRow;
  max: number;
  onOpen: (r: PayrollRow) => void;
}) {
  const { t } = useTranslation();
  const tone = attainmentTone(row.attainmentPct, row.targetRevenue > 0);
  const share = max > 0 ? row.grossRevenue / max : 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-muted motion-reduce:transition-none"
      >
        <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
          {row.rank}
        </span>
        <PersonAvatar name={row.staffName} size={28} />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{row.staffName}</span>
            <span className="shrink-0 text-sm tabular-nums">
              <CurrencyText amount={row.grossRevenue} />
            </span>
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary/70 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(share * 100)}%` }}
              />
            </span>
            <span
              className={cn(
                'w-10 shrink-0 text-right text-2xs font-semibold tabular-nums',
                row.revenueDeltaPct == null
                  ? 'text-muted-foreground'
                  : row.revenueDeltaPct >= 0
                    ? 'text-success'
                    : 'text-destructive',
              )}
              title={t('payroll.vsPrevMonth')}
            >
              {formatDelta(row.revenueDeltaPct)}
            </span>
          </span>
        </span>

        <span className="hidden w-28 shrink-0 sm:block">
          {row.targetRevenue > 0 ? (
            <>
              <span className={cn('block text-right text-2xs font-semibold tabular-nums', TONE[tone].text)}>
                {row.attainmentPct}%
              </span>
              <span className="mt-1 block">
                <AttainmentMeter pct={row.attainmentPct} tone={tone} />
              </span>
            </>
          ) : (
            <span className="flex items-center justify-end gap-1 text-2xs text-muted-foreground">
              <Target className="h-3 w-3" aria-hidden="true" />
              {t('payroll.noTarget')}
            </span>
          )}
        </span>

        <span className="hidden shrink-0 md:block">
          <PayoutStatePill state={row.payoutState} />
        </span>
      </button>
    </li>
  );
}

/**
 * Leaderboard view — the same month read as a ranking rather than a ledger.
 *
 * Top three get a podium (the one glance a manager takes into a team meeting);
 * everyone else gets a compact ranked row with a revenue bar normalised to the
 * leader, so relative standing is legible without reading the figures.
 */
export function PayrollLeaderboard({
  rows,
  report,
  loading,
  onOpen,
}: {
  rows: PayrollRow[];
  report: PayrollReport | undefined;
  loading: boolean;
  onOpen: (r: PayrollRow) => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[228px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <SectionCard icon={Trophy} title={t('payroll.leaderboardTitle')}>
        <EmptyState
          icon={Trophy}
          title={t('payroll.empty')}
          description={t('payroll.emptyHint')}
        />
      </SectionCard>
    );
  }

  // Podium order is 2nd · 1st · 3rd so the winner sits centre, as on a real one.
  const podium = rows.slice(0, 3);
  const podiumOrder: Array<{ row: PayrollRow; place: 0 | 1 | 2 }> = [
    podium[1] ? { row: podium[1], place: 1 as const } : null,
    podium[0] ? { row: podium[0], place: 0 as const } : null,
    podium[2] ? { row: podium[2], place: 2 as const } : null,
  ].filter(Boolean) as Array<{ row: PayrollRow; place: 0 | 1 | 2 }>;

  const rest = rows.slice(3);
  const max = rows[0]?.grossRevenue ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 pt-3 sm:grid-cols-3">
        {podiumOrder.map(({ row, place }) => (
          <PodiumCard key={row.staffProfileId} row={row} place={place} onOpen={onOpen} />
        ))}
      </div>

      {rest.length > 0 ? (
        <SectionCard
          icon={Trophy}
          title={t('payroll.leaderboardTitle')}
          meta={
            report
              ? t('payroll.targetsMet', {
                  count: report.totals.targetMetCount,
                  total: report.totals.staffWithTarget,
                })
              : undefined
          }
          bodyClassName="p-2"
        >
          <ul className="divide-y divide-border">
            {rest.map((r) => (
              <RankRow key={r.staffProfileId} row={r} max={max} onOpen={onOpen} />
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
