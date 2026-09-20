import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'info' | 'success' | 'accent' | 'violet';

const TONE: Record<
  StatTone,
  { marker: string; icon: string; fill: string; spark: string; stroke: string }
> = {
  primary: {
    marker: 'bg-primary',
    icon: 'bg-primary/10 text-primary',
    fill: 'bg-primary',
    spark: 'text-primary',
    stroke: 'hsl(var(--primary))',
  },
  info: {
    marker: 'bg-info',
    icon: 'bg-info/10 text-info',
    fill: 'bg-info',
    spark: 'text-info',
    stroke: 'hsl(var(--info))',
  },
  success: {
    marker: 'bg-success',
    icon: 'bg-success/10 text-success',
    fill: 'bg-success',
    spark: 'text-success',
    stroke: 'hsl(var(--success))',
  },
  accent: {
    marker: 'bg-accent',
    icon: 'bg-accent/15 text-accent-foreground',
    fill: 'bg-accent',
    spark: 'text-accent',
    stroke: 'hsl(var(--accent))',
  },
  violet: {
    marker: 'bg-[hsl(var(--chart-3))]',
    icon: 'bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))]',
    fill: 'bg-[hsl(var(--chart-3))]',
    spark: 'text-[hsl(var(--chart-3))]',
    stroke: 'hsl(var(--chart-3))',
  },
};

const DELTA: Record<'up' | 'down' | 'flat', { chip: string; Icon: typeof TrendingUp }> = {
  up: { chip: 'bg-success-soft text-success', Icon: TrendingUp },
  down: { chip: 'bg-destructive-soft text-destructive', Icon: TrendingDown },
  flat: { chip: 'bg-muted text-muted-foreground', Icon: Minus },
};

/** Gradient area sparkline with a dot on the latest point. Pure SVG. */
function AreaSpark({ points, stroke }: { points: number[]; stroke: string }) {
  const gid = useId().replace(/:/g, '');
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const step = 100 / (points.length - 1);
  const xy = points.map((p, i) => [i * step, 24 - ((p - min) / span) * 20] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `M0,26 ${xy.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ')} L100,26 Z`;
  const [lx, ly] = xy[xy.length - 1]!;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${gid})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lx} cy={ly} r={2.4} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface Props {
  label: string;
  value: ReactNode;
  valueTitle?: string;
  icon: ReactNode;
  tone?: StatTone;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  /** Muted context line under the label (e.g. the window it covers). */
  sub?: string;
  /** Small comparison caption shown in the foot beside the sparkline. */
  compare?: string;
  /** Optional sparkline (ignored when `progress` is set). */
  spark?: number[];
  /** Optional thin fill rail with a % readout. */
  progress?: { value: number; max: number };
  loading?: boolean;
  /** Position in the grid — staggers the mount animation (0-based). */
  index?: number;
}

/**
 * Reports KPI card — its own identity, apart from the dashboard's tinted-fill KPI:
 * a white "statement" surface, a short rounded tone marker at the top-left edge,
 * a soft tinted icon tile + trend pill, the figure above the label (report style),
 * and a gradient area sparkline / progress rail at the foot. Deliberately compact.
 */
export function ReportStatCard({
  label,
  value,
  valueTitle,
  icon,
  tone = 'primary',
  delta,
  sub,
  compare,
  spark,
  progress,
  loading,
  index = 0,
}: Props) {
  const c = TONE[tone];
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 45}ms` } : undefined;
  const pct =
    progress && progress.max > 0 ? Math.round((progress.value / progress.max) * 100) : 0;

  return (
    <div
      style={style}
      className={cn(
        'relative flex min-h-[112px] flex-col overflow-hidden rounded-xl border border-border bg-card p-3.5 shadow-sm',
        'break-inside-avoid',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('absolute left-0 top-3.5 h-7 w-1 rounded-r-full', c.marker)}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', c.icon)}
        >
          {icon}
        </span>
        {delta && !loading
          ? (() => {
              const d = DELTA[delta.direction];
              return (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                    d.chip,
                  )}
                >
                  <d.Icon className="h-3 w-3" aria-hidden="true" />
                  {delta.value}
                </span>
              );
            })()
          : null}
      </div>

      {loading ? (
        <Skeleton className="mt-2.5 h-6 w-24" />
      ) : (
        <p
          className="mt-2.5 text-[21px] font-bold leading-none tabular-nums text-foreground"
          title={valueTitle}
        >
          {value}
        </p>
      )}

      <p className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground" title={label}>
        {label}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{sub}</p>
      ) : null}

      {!loading && progress ? (
        <div className="mt-auto space-y-1 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full rounded-full', c.fill)}
                style={{ width: `${Math.max(pct, progress.value > 0 ? 4 : 0)}%` }}
              />
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        </div>
      ) : !loading && spark?.length ? (
        <div className="mt-auto border-t border-border/60 pt-1.5">
          <div className={cn('opacity-70', c.spark)}>
            <AreaSpark points={spark} stroke={c.stroke} />
          </div>
          {compare ? (
            <p className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground/70">
              {compare}
            </p>
          ) : null}
        </div>
      ) : compare && !loading ? (
        <p className="mt-auto truncate pt-2 text-[10px] tabular-nums text-muted-foreground/70">
          {compare}
        </p>
      ) : null}
    </div>
  );
}
