import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  MapPin,
  Minus,
  Phone,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { Sparkline } from './KpiCard';
import { type BranchRow, type Change, changeOf, pct } from './provinceMap.model';

export function DeltaBadge({ change, className }: { change: Change | null; className?: string }) {
  const { t } = useTranslation();
  if (!change) return null;
  const Icon =
    change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        change.direction === 'up' && 'bg-success/10 text-success',
        change.direction === 'down' && 'bg-destructive/10 text-destructive',
        change.direction === 'flat' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {change.label === 'new' ? t('dashboard.provinceMap.new') : change.label}
    </span>
  );
}

/** Headline tile in the network strip. */
export function StripStat({
  icon,
  label,
  value,
  foot,
  delta,
  ring,
  index = 0,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  delta?: Change | null;
  /** 0–100 — renders a small progress ring beside the value. */
  ring?: number;
  index?: number;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-muted/40 px-3 py-3 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none motion-reduce:hover:translate-y-0"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-xl font-semibold leading-none tabular-nums">{value}</span>
            {delta !== undefined ? <DeltaBadge change={delta} /> : null}
          </div>
          {foot ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{foot}</p> : null}
        </div>
        {ring !== undefined ? <Ring value={ring} /> : null}
      </div>
    </div>
  );
}

export function Ring({ value, size = 34 }: { value: number; size?: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle cx="17" cy="17" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(value, 0), 100) / 100)}
        className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

export function Stars({ value, count }: { value: number; count: number }) {
  const { t } = useTranslation();
  if (!count)
    return <span className="text-muted-foreground">{t('dashboard.provinceMap.noRating')}</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Star className="h-3 w-3 fill-accent text-accent" aria-hidden="true" />
      <span className="font-semibold text-foreground">{value.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

/** Completed / lost / still-open split of the window's bookings. */
export function OutcomeBar({
  bookings,
  completed,
  lost,
}: {
  bookings: number;
  completed: number;
  lost: number;
}) {
  const { t } = useTranslation();
  const other = Math.max(bookings - completed - lost, 0);
  const segs = [
    { key: 'completed', n: completed, cls: 'bg-success' },
    { key: 'open', n: other, cls: 'bg-info/60' },
    { key: 'lost', n: lost, cls: 'bg-destructive/70' },
  ];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {bookings > 0
          ? segs.map((s) =>
              s.n ? (
                <div
                  key={s.key}
                  className={cn('h-full transition-[width] duration-500 ease-out', s.cls)}
                  style={{ width: `${(s.n / bookings) * 100}%` }}
                />
              ) : null,
            )
          : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 tabular-nums">
            <span className={cn('size-2 rounded-full', s.cls)} aria-hidden="true" />
            {t(`dashboard.provinceMap.outcome.${s.key}`)} {s.n}
            <span className="text-muted-foreground/70">({pct(s.n, bookings)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Fact({
  label,
  value,
  foot,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-2.5 py-2">
      <dt className="truncate text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-1 text-sm font-semibold tabular-nums">
        {value}
      </dd>
      {foot ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{foot}</p> : null}
    </div>
  );
}

/** One branch inside the province drill-down. */
export function BranchCard({
  row,
  active,
  maxRevenue,
  onPick,
  index,
}: {
  row: BranchRow;
  active: boolean;
  maxRevenue: number;
  onPick: () => void;
  index: number;
}) {
  const { t } = useTranslation();
  const { branch: b, perf: p, openNow } = row;
  const settled = p.completed + p.lost;
  const avgTicket = p.completed ? Math.round(p.revenue / p.completed) : 0;

  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={cn(
          'w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-primary/50 bg-primary/[0.04] shadow-md'
            : 'border-border bg-card hover:border-primary/30 hover:shadow-sm',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{b.name}</span>
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {b.code}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium',
                  !b.isActive
                    ? 'bg-muted text-muted-foreground'
                    : openNow
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    !b.isActive ? 'bg-muted-foreground/50' : openNow ? 'bg-success' : 'bg-warning',
                  )}
                  aria-hidden="true"
                />
                {!b.isActive
                  ? t('dashboard.provinceMap.inactive')
                  : openNow
                    ? t('dashboard.provinceMap.openNow')
                    : t('dashboard.provinceMap.closedNow')}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                {b.openTime}–{b.closeTime}
              </span>
              <Stars value={p.ratingAvg} count={p.ratingCount} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(p.revenue)}</p>
            <DeltaBadge change={changeOf(p.revenue, p.prevRevenue)} className="mt-0.5" />
          </div>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-700 ease-out"
            style={{ width: `${p.revenue ? Math.max((p.revenue / maxRevenue) * 100, 3) : 0}%` }}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-[1fr_88px] items-end gap-3">
          <dl className="grid grid-cols-4 gap-1.5 text-[10px]">
            <MiniFact label={t('dashboard.provinceMap.metric.bookings')} value={p.bookings} />
            <MiniFact label={t('dashboard.provinceMap.today')} value={p.todayBookings} />
            <MiniFact
              label={t('dashboard.provinceMap.completion')}
              value={settled ? `${pct(p.completed, settled)}%` : '—'}
            />
            <MiniFact
              label={t('dashboard.provinceMap.avgTicket')}
              value={avgTicket ? formatCompactNumber(avgTicket) : '—'}
            />
          </dl>
          <div className="text-primary" title={t('dashboard.provinceMap.spark7d')}>
            <Sparkline points={p.spark?.length ? p.spark : [0, 0]} className="h-8" />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {t('dashboard.provinceMap.staffCustomers', {
              staff: p.staffCount,
              customers: p.customers,
            })}
          </span>
          {p.topService ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{p.topService}</span>
            </span>
          ) : null}
          {p.upcoming7d ? (
            <span className="tabular-nums">
              {t('dashboard.provinceMap.upcomingShort', { count: p.upcoming7d })}
            </span>
          ) : null}
        </div>

        {active ? (
          <div className="mt-2 space-y-1 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground animate-in fade-in duration-200">
            {b.address ? (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{b.address}</span>
              </p>
            ) : null}
            {b.phone ? (
              <p className="flex items-center gap-1.5 tabular-nums">
                <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                {b.phone}
              </p>
            ) : null}
            <p className="tabular-nums">
              {t('dashboard.provinceMap.channelSplit', {
                walkins: p.walkins,
                home: p.homeService,
                today: formatCurrency(p.todayRevenue),
              })}
            </p>
          </div>
        ) : null}
      </button>
    </li>
  );
}

function MiniFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="text-xs font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
