import type { AdminAppointmentSummary, AppointmentFlag, AppointmentStatus } from '@abcp/shared-types';
import {
  AlarmClock,
  BadgeCheck,
  CalendarClock,
  CalendarRange,
  CalendarX2,
  CircleAlert,
  CircleSlash,
  Coins,
  HandCoins,
  ListChecks,
  Star,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { STATUS_COLOR, STATUS_VALUES, TONE, type Tone } from './appointments.lib';
import { DistributionBar, StatTile } from './appointments.parts';

interface Props {
  summary: AdminAppointmentSummary | undefined;
  loading: boolean;
  activeStatus: AppointmentStatus | undefined;
  onPickStatus: (s: AppointmentStatus | undefined) => void;
  activeFlag: AppointmentFlag | undefined;
  onPickFlag: (f: AppointmentFlag | undefined) => void;
}

/**
 * Two-band overview.
 *
 * **Band 1 — the pipeline.** A clickable status rail (each cell filters the page)
 * sitting on one distribution bar, so the shape of the book is readable before
 * any number is.
 *
 * **Band 2 — what needs a human.** Four attention tiles that each map 1:1 to a
 * server-side `flag` filter, then the money line. Attention comes before money
 * on purpose: the front desk acts on the first row and reports on the second.
 *
 * Every figure comes from `GET /appointments/summary`, i.e. from the whole
 * filtered set, not from the rows that happen to be on this page.
 */
export function AppointmentsOverview({
  summary,
  loading,
  activeStatus,
  onPickStatus,
  activeFlag,
  onPickFlag,
}: Props) {
  const { t } = useTranslation();

  if (loading || !summary) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[104px] w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[62px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { byStatus, money, ops } = summary;

  const attention: {
    flag: AppointmentFlag;
    icon: typeof CircleAlert;
    tone: Tone;
    label: string;
    value: number;
    hint: string;
  }[] = [
    {
      flag: 'overdue',
      icon: CircleAlert,
      tone: 'danger',
      label: t('appointments.flagOverdue'),
      value: ops.overdue,
      hint: t('appointments.overdueHint'),
    },
    {
      flag: 'unconfirmed',
      icon: AlarmClock,
      tone: 'warning',
      label: t('appointments.flagUnconfirmed'),
      value: ops.unconfirmed,
      hint: t('appointments.unconfirmedHint'),
    },
    {
      flag: 'needsDeposit',
      icon: TriangleAlert,
      tone: 'warning',
      label: t('appointments.needsDepositShort'),
      value: ops.needsDeposit,
      hint: t('appointments.uncollected', { amount: formatCurrency(ops.needsDepositValue) }),
    },
    {
      flag: 'conflict',
      icon: CalendarX2,
      tone: 'danger',
      label: t('appointments.flagConflict'),
      value: ops.conflicts,
      hint: t('appointments.conflictHint'),
    },
    {
      flag: 'unrated',
      icon: Star,
      tone: 'accent',
      label: t('appointments.flagUnrated'),
      value: ops.unrated,
      hint: ops.ratedCount
        ? t('appointments.avgRatingHint', { value: ops.avgRating, count: ops.ratedCount })
        : t('appointments.noRatingsYet'),
    },
  ];

  const actionTotal = attention.reduce((s, a) => s + a.value, 0);

  const moneyItems = [
    { icon: Coins, label: t('appointments.expectedRevenue'), value: money.expected, tone: 'primary' as Tone },
    { icon: BadgeCheck, label: t('appointments.sumRealized'), value: money.realized, tone: 'success' as Tone },
    { icon: HandCoins, label: t('appointments.sumOutstanding'), value: money.outstanding, tone: 'warning' as Tone },
    { icon: Wallet, label: t('appointments.depositsCollected'), value: money.deposits, tone: 'info' as Tone },
    {
      icon: CircleSlash,
      label: t('appointments.sumLost', { count: money.lostCount }),
      value: money.lost,
      tone: 'danger' as Tone,
    },
    { icon: Users, label: t('appointments.sumAvgTicket'), value: money.avgTicket, tone: 'neutral' as Tone },
  ];

  const collected = money.expected > 0 ? Math.round((money.deposits / money.expected) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* ── pipeline ─────────────────────────────────────────────── */}
      <section
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        )}
      >
        <div className="flex divide-x divide-border overflow-x-auto">
          <StatusCell
            label={t('appointments.summaryTotal')}
            value={summary.total}
            color="hsl(var(--primary))"
            active={activeStatus === undefined}
            onClick={() => onPickStatus(undefined)}
            sub={t('appointments.customersCount', { count: ops.distinctCustomers })}
          />
          {STATUS_VALUES.map((s) => (
            <StatusCell
              key={s}
              label={t(`status.${s}`)}
              value={byStatus[s]}
              color={STATUS_COLOR[s]}
              active={activeStatus === s}
              onClick={() => onPickStatus(activeStatus === s ? undefined : s)}
              sub={
                summary.total
                  ? t('appointments.pctOfAll', { pct: Math.round((byStatus[s] / summary.total) * 100) })
                  : undefined
              }
            />
          ))}
        </div>

        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <DistributionBar
            byStatus={byStatus}
            statusValues={STATUS_VALUES}
            labelOf={(s) => t(`status.${s}`)}
            ariaLabel={t('appointments.distribution')}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            <Metric label={t('appointments.completionRate')} value={pct(ops.completionRate)} good />
            <Metric label={t('appointments.noShowRate')} value={pct(ops.noShowRate)} good={false} />
            <Metric label={t('appointments.cancelRate')} value={pct(ops.cancelRate)} good={false} />
            <Metric label={t('appointments.walkIns')} value={String(ops.walkIns)} />
            <Metric label={t('appointments.homeService')} value={String(ops.homeService)} />
            <Metric label={t('appointments.avgDuration')} value={`${ops.avgDurationMin}m`} />
            {summary.truncated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">
                <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                {t('appointments.approxFigures', { count: summary.sampled })}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── needs a human ────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-0.5">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xs font-semibold">{t('appointments.needsAction')}</h2>
        <span className="text-2xs text-muted-foreground">
          {t('appointments.itemsCount', { count: actionTotal })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {attention.map((a, i) => (
          <StatTile
            key={a.flag}
            icon={a.icon}
            tone={a.value > 0 ? a.tone : 'neutral'}
            label={a.label}
            value={a.value}
            hint={a.hint}
            index={i}
            active={activeFlag === a.flag}
            onClick={() => onPickFlag(activeFlag === a.flag ? undefined : a.flag)}
          />
        ))}
      </div>

      {/* ── horizon + money ──────────────────────────────────────── */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StatTile
          icon={CalendarClock}
          tone="info"
          label={t('appointments.today')}
          value={ops.today}
          hint={`${t('appointments.openCount', { count: ops.todayOpen })} · ${formatCurrency(ops.todayValue)}`}
          index={0}
        />
        <StatTile
          icon={CalendarRange}
          tone="primary"
          label={t('appointments.tomorrow')}
          value={ops.tomorrow}
          hint={t('appointments.next7Hint', { count: ops.next7, amount: formatCurrency(ops.next7Value) })}
          index={1}
        />
        <StatTile
          icon={Wallet}
          tone="success"
          label={t('appointments.collectionRate')}
          value={`${collected}%`}
          hint={t('appointments.collectedOf', {
            paid: formatCurrency(money.deposits),
            total: formatCurrency(money.expected),
          })}
          index={2}
        />
      </div>

      <section className="flex divide-x divide-border overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        {moneyItems.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="flex min-w-[150px] flex-1 items-center gap-2 px-3 py-2.5">
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', TONE[m.tone].chip)}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-2xs text-muted-foreground">{m.label}</p>
                <p className="truncate text-sm font-semibold tabular-nums" title={String(m.value)}>
                  {formatCurrency(m.value)}
                </p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      <span
        className={cn(
          'font-semibold tabular-nums',
          good === undefined ? 'text-foreground' : good ? 'text-success' : 'text-destructive',
        )}
      >
        {value}
      </span>
    </span>
  );
}

function StatusCell({
  label,
  value,
  color,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-w-[112px] flex-1 flex-col gap-1 px-3 py-2.5 text-left',
        'transition-colors duration-150 hover:bg-muted/50 active:bg-muted motion-reduce:transition-none',
        active && 'bg-muted/60',
      )}
      style={active ? { boxShadow: `inset 0 2px 0 0 ${color}` } : undefined}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-2xs font-medium text-muted-foreground">{label}</span>
      </span>
      <span className="text-xl font-semibold leading-none tabular-nums">{value}</span>
      {sub ? <span className="truncate text-2xs text-muted-foreground">{sub}</span> : null}
    </button>
  );
}
