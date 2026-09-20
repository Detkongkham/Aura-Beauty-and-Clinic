import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'info' | 'success' | 'destructive';

// Light tinted card + a solid tone chip and a thin top accent edge for identity
// without the heavy candy-fill look.
const TONE: Record<
  Tone,
  { wrap: string; edge: string; chip: string; value: string; bar: string; track: string }
> = {
  primary: {
    wrap: 'border-primary/25 bg-primary/[0.07] hover:border-primary/40',
    edge: 'bg-primary/70',
    chip: 'bg-primary text-primary-foreground',
    value: 'text-primary',
    bar: 'bg-primary',
    track: 'bg-primary/20',
  },
  info: {
    wrap: 'border-info/25 bg-info/[0.07] hover:border-info/40',
    edge: 'bg-info/70',
    chip: 'bg-info text-white',
    value: 'text-info',
    bar: 'bg-info',
    track: 'bg-info/20',
  },
  success: {
    wrap: 'border-success/25 bg-success/[0.07] hover:border-success/40',
    edge: 'bg-success/70',
    chip: 'bg-success text-white',
    value: 'text-success',
    bar: 'bg-success',
    track: 'bg-success/20',
  },
  destructive: {
    wrap: 'border-destructive/25 bg-destructive/[0.06] hover:border-destructive/40',
    edge: 'bg-destructive/70',
    chip: 'bg-destructive text-white',
    value: 'text-destructive',
    bar: 'bg-destructive',
    track: 'bg-destructive/20',
  },
};

/** Tiny inline sparkline — no chart lib, scales to the card width. Filled area
 *  under the line (currentColor at low opacity) + a dot on the latest point. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = 100 / (points.length - 1);
  const coords = points.map((p, i) => [i * step, 28 - ((p - min) / span) * 26] as const);
  const line = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,30 ${line} 100,30`;
  const [lastX, lastY] = coords[coords.length - 1]!;
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn('h-7 w-full overflow-visible', className)}
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface Props {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  /** `good` overrides the colour when "down" is the healthy direction (e.g. cancel rate). */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean; caption?: string };
  /** Muted secondary caption under the figure. */
  hint?: string;
  /** Mini progress bar with an inline `value / max` readout. */
  progress?: { value: number; max: number };
  /** Extra label/value rows shown in the card body (fills tall cards). */
  rows?: Array<{ label: string; value: ReactNode }>;
  /** 14-day trend for a sparkline (drawn in the tone colour). */
  spark?: number[];
  /** When set, the whole card becomes a link with hover + focus affordances. */
  to?: string;
  loading?: boolean;
  /** Position in a card grid — staggers the mount animation (0-based). */
  index?: number;
}

/** Secondary KPI — soft tinted card, icon chip, figure + delta, plus optional
 *  sparkline / progress / hint detail. Clickable when `to` is provided. */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'primary',
  delta,
  hint,
  progress,
  rows,
  spark,
  to,
  loading,
  index = 0,
}: Props) {
  const c = TONE[tone];
  const interactive = Boolean(to) && !loading;
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined;
  const pctFill =
    progress && progress.max > 0 ? Math.min((progress.value / progress.max) * 100, 100) : 0;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-[3px] rounded-t-lg', c.edge)}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', c.chip)}
        >
          {icon}
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <p className={cn('mt-1 text-lg font-semibold tabular-nums', c.value)}>{value}</p>
      )}

      {delta && !loading ? (
        <p
          className={cn(
            'mt-1 inline-flex items-center gap-1 text-xs font-medium',
            delta.direction === 'flat'
              ? 'text-muted-foreground'
              : (delta.good ?? delta.direction === 'up')
                ? 'text-success'
                : 'text-destructive',
          )}
        >
          {delta.direction === 'up' ? (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : delta.direction === 'down' ? (
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : null}
          {delta.value}
          {delta.caption ? (
            <span className="font-normal text-muted-foreground">{delta.caption}</span>
          ) : null}
        </p>
      ) : null}

      {!loading && rows?.length ? (
        <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-1.5 text-[11px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{r.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && (spark?.length || progress || hint) ? (
        <div className="mt-auto space-y-1 pt-2">
          {spark?.length ? <Sparkline points={spark} className={c.value} /> : null}

          {progress ? (
            <>
              <div className={cn('h-1 overflow-hidden rounded-full', c.track)}>
                <div
                  className={cn('h-full rounded-full', c.bar)}
                  style={{ width: `${Math.max(pctFill, progress.value > 0 ? 4 : 0)}%` }}
                />
              </div>
              <p className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                <span>{hint}</span>
                <span className="font-medium">
                  {progress.value} / {progress.max}
                </span>
              </p>
            </>
          ) : hint ? (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      ) : null}

      {interactive ? (
        <ArrowRight
          className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const className = cn(
    'group relative flex min-h-[88px] flex-col rounded-lg border p-3',
    c.wrap,
    // entrance — every KPI card fades + rises on mount (see cardcount-animation convention)
    'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    interactive &&
      'cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-md motion-reduce:transform-none',
  );

  return interactive && to ? (
    <Link to={to} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
