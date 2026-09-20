import type { PayoutState } from '@abcp/shared-types';
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { PAYOUT_STATE_TONE, TONE, formatDelta, payoutStateKey, type Tone } from './payroll.lib';

/**
 * Compact KPI tile — tone bar on the left edge, icon chip, label, figure and an
 * optional month-over-month delta. Clickable tiles act as filters and expose
 * `aria-pressed`, so the same element reads as a control to assistive tech.
 *
 * Motion follows the house count-card convention (MASTER §6): fade + rise on
 * mount staggered by `index`, lift on hover, dip on press, all suppressed under
 * `prefers-reduced-motion`.
 */
export function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  delta,
  index = 0,
  onClick,
  active = false,
  loading = false,
  title,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** `good` drives colour; `null` = neutral (no baseline to compare against). */
  delta?: { pct: number | null; good: boolean | null } | null;
  index?: number;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  title?: string;
}) {
  const c = TONE[tone];
  const className = cn(
    'group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border bg-card py-2.5 pl-3.5 pr-2.5 text-left shadow-sm',
    'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    onClick &&
      'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active ? cn('ring-1', c.ring) : 'border-border',
  );
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 45}ms` } : undefined;

  const DeltaIcon =
    delta?.pct == null ? Minus : delta.pct > 0 ? TrendingUp : delta.pct < 0 ? TrendingDown : Minus;

  const body = (
    <>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', c.bar)} />
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', c.chip)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <>
            <div className="mt-1 h-5 w-20 animate-pulse rounded-sm bg-muted" />
            <div className="mt-1 h-2.5 w-14 animate-pulse rounded-sm bg-muted" />
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="truncate text-lg font-semibold leading-tight tabular-nums">
                {value}
              </span>
              {delta ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold tabular-nums',
                    delta.good == null
                      ? 'text-muted-foreground'
                      : delta.good
                        ? 'text-success'
                        : 'text-destructive',
                  )}
                >
                  <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                  {formatDelta(delta.pct)}
                </span>
              ) : null}
            </p>
            {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
          </>
        )}
      </div>
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={className}
      style={style}
    >
      {body}
    </button>
  ) : (
    <div className={className} style={style} title={title}>
      {body}
    </div>
  );
}

/** Paid / partly paid / due pill. Leading dot + text, never colour alone. */
export function PayoutStatePill({ state, className }: { state: PayoutState; className?: string }) {
  const { t } = useTranslation();
  const tone = PAYOUT_STATE_TONE[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium',
        TONE[tone].chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE[tone].bar)} aria-hidden="true" />
      {t(payoutStateKey(state))}
    </span>
  );
}

export type Segment = { key: string; value: number; tone: Tone; label: string };

/**
 * Horizontal composition bar — one track, several tone-coded segments. Used for
 * the payout split (paid · unpaid · bonus due) so the shape of the money is
 * readable before any figure is.
 */
export function SegmentBar({
  segments,
  ariaLabel,
  className,
  height = 'h-2',
}: {
  segments: Segment[];
  ariaLabel: string;
  className?: string;
  height?: string;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return <div className={cn('rounded-full bg-muted', height, className)} aria-hidden="true" />;
  }
  return (
    <div
      className={cn('flex overflow-hidden rounded-full bg-muted', height, className)}
      role="img"
      aria-label={ariaLabel}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.key}
            className={cn(
              'h-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
              TONE[s.tone].bar,
            )}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label} · ${Math.round((s.value / total) * 100)}%`}
          />
        ))}
    </div>
  );
}

/** Legend row for a {@link SegmentBar} — dot + label + figure, never colour alone. */
export function SegmentLegend({ segments, render }: { segments: Segment[]; render: (s: Segment) => ReactNode }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {segments.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE[s.tone].bar)} aria-hidden="true" />
          <span>{s.label}</span>
          <span className="font-semibold text-foreground">{render(s)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bullet-style attainment meter (chart guidance: bullet chart beats a gauge when
 * several KPIs sit side by side). The target is a fixed 100% tick; the fill is
 * capped at 100% so over-attainment doesn't overflow, and the surplus is shown
 * as a second, lighter segment beyond the tick.
 */
export function AttainmentMeter({
  pct,
  tone,
  width = 'w-full',
  /** Straight-line expectation for an unfinished month, as a % of target. */
  paceMarkPct,
  paceLabel,
}: {
  pct: number;
  tone: Tone;
  width?: string;
  paceMarkPct?: number | null;
  paceLabel?: string;
}) {
  const fill = Math.min(100, Math.max(0, pct));
  const over = Math.min(30, Math.max(0, pct - 100));
  return (
    <span className={cn('relative block h-1.5 overflow-hidden rounded-full bg-muted', width)}>
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
          TONE[tone].bar,
        )}
        style={{ width: `${fill}%` }}
      />
      {over > 0 ? (
        <span
          className="absolute inset-y-0 right-0 rounded-full bg-success/40"
          style={{ width: `${over}%` }}
          aria-hidden="true"
        />
      ) : null}
      {paceMarkPct != null && paceMarkPct > 0 && paceMarkPct < 100 ? (
        <span
          className="absolute inset-y-0 w-px bg-foreground/45"
          style={{ left: `${paceMarkPct}%` }}
          title={paceLabel}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

/** 1/2/3 get a medal chip; everyone else gets a quiet number. */
export function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? 'bg-warning-soft text-warning ring-1 ring-warning/30'
      : rank === 2
        ? 'bg-muted text-foreground ring-1 ring-border'
        : rank === 3
          ? 'bg-accent-soft text-accent-foreground ring-1 ring-accent/30'
          : null;
  if (!medal) {
    return <span className="pl-2 text-xs tabular-nums text-muted-foreground">{rank}</span>;
  }
  return (
    <span
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
        medal,
      )}
    >
      {rank}
    </span>
  );
}

/**
 * Dependency-free sparkline. Recharts is overkill for a 30-point decoration
 * inside a table cell or drawer header, and a plain polyline keeps the drawer
 * from pulling the chart bundle in.
 */
export function Sparkline({
  values,
  className,
  ariaLabel,
}: {
  values: number[];
  className?: string;
  ariaLabel: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = 100 / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(24 - (v / max) * 22).toFixed(2)}`);
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn('h-6 w-full', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={`0,24 ${points.join(' ')} 100,24`}
        fill="hsl(var(--primary) / 0.10)"
        stroke="none"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Card shell with a titled header row — the house panel used by every view. */
export function SectionCard({
  icon: Icon,
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: LucideIcon;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
        </div>
        {action}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label / value pair used across the payslip drawer. */
export function DetailRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'text-sm font-semibold' : 'text-sm',
          tone ? TONE[tone].text : undefined,
        )}
      >
        {value}
      </span>
    </div>
  );
}
