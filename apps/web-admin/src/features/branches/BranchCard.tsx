import { ArrowDownRight, ArrowUpRight, DoorOpen, Minus, Star, Users, Wrench } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { TonePill } from '@/features/payments-treasury/banks.parts';
import { Sparkline } from '@/features/payroll/payroll.parts';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BranchMonogram, IssueLine, OpenPill, UtilMeter } from './branches.parts';
import { HEALTH_TONE, deltaPct, healthOf, openState, type Row, fmtDelta } from './branches.lib';
import { provinceName } from './lao-provinces';

/**
 * Grid tile for one branch — identity, live open state, the period's money + a revenue
 * sparkline, utilisation, resources and the single most important issue. The whole tile
 * is one button (opens the detail sheet); nothing inside it is separately interactive.
 */
export function BranchCard({
  row,
  nowHhmm,
  index,
  insightsLoading,
  active,
  onOpen,
}: {
  row: Row;
  nowHhmm: string;
  index: number;
  insightsLoading: boolean;
  active: boolean;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { branch: b, insight: i, issues } = row;
  const { isOpen, boundary } = openState(b.openTime, b.closeTime, nowHhmm);
  const health = healthOf(issues);
  const delta = i ? deltaPct(i.period.revenue, i.period.revenuePrev) : null;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const style: CSSProperties = { animationDelay: `${Math.min(index, 12) * 45}ms` };

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      data-testid={`branch-card-${b.id}`}
      style={style}
      className={cn(
        'group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm [&>*]:w-full',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
        !b.isActive && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <BranchMonogram code={b.code} name={b.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{b.name}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {b.code ? <span className="font-mono">{b.code} · </span> : null}
            {provinceName(b.province, i18n.language)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <OpenPill isOpen={isOpen} boundary={boundary} inactive={!b.isActive} />
            {i ? <TonePill tone={HEALTH_TONE[health]}>{t(`branches.health.${health}`)}</TonePill> : null}
          </div>
        </div>
      </div>

      {insightsLoading ? (
        <div className="space-y-2 px-4 pb-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : i ? (
        <>
          <div className="px-4">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xs text-muted-foreground">{t('branches.card.revenue')}</p>
                <p className="truncate text-lg font-semibold leading-tight tabular-nums">
                  {formatCompactNumber(i.period.revenue)}
                  <span className="ml-1 text-2xs font-normal text-muted-foreground">₭</span>
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold tabular-nums',
                  delta == null || delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-success' : 'text-destructive',
                )}
              >
                <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                {delta == null ? t('branches.card.new') : fmtDelta(delta)}
              </span>
            </div>
            <Sparkline values={i.period.daily} className="mt-1 h-8" ariaLabel={t('branches.card.trendAria', { name: b.name })} />
          </div>

          <div className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border">
            <Metric label={t('branches.card.today')} value={i.today.appointments} hint={t('branches.card.inService', { count: i.today.inProgress })} />
            <Metric label={t('branches.card.bookings')} value={i.period.bookings} hint={t('branches.card.customers', { count: i.period.customers })} />
            <Metric
              label={t('branches.card.rating')}
              value={
                i.rating.avg != null ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
                    {i.rating.avg.toFixed(1)}
                  </span>
                ) : (
                  '—'
                )
              }
              hint={t('branches.card.reviews', { count: i.rating.count })}
            />
          </div>

          <div className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-2xs text-muted-foreground">{t('branches.util.label')}</span>
              <UtilMeter value={i.period.utilization} className="flex-1" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
              <Resource icon={Users} value={i.staffCount} label={t('branches.res.staff')} />
              <Resource icon={DoorOpen} value={i.roomCount} label={t('branches.res.rooms')} />
              <Resource icon={Wrench} value={i.equipmentCount} label={t('branches.res.equipment')} />
            </div>
          </div>

          <div className="mt-auto border-t border-border bg-muted/30 px-4 py-2">
            {issues[0] ? (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 [&_p]:truncate">
                  <IssueLine issue={issues[0]} compact />
                </div>
                {issues.length > 1 ? (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    +{issues.length - 1}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="py-0.5 text-xs text-muted-foreground">{t('branches.card.allGood')}</p>
            )}
          </div>
        </>
      ) : (
        <p className="px-4 pb-4 text-xs text-muted-foreground">{t('branches.card.noInsights')}</p>
      )}
    </button>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-2xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Resource({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      {label}
    </span>
  );
}
