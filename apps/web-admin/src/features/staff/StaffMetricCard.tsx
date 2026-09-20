import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Accent = 'primary' | 'gold';

interface StaffMetricCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** Small unit shown next to the figure (e.g. "ຊມ", "%"). */
  unit?: string;
  accent?: Accent;
  /** Bespoke mini-visual under the figure — WeekRibbon / WeekBars / SegmentMeter. */
  footer?: ReactNode;
  /** Grid position — staggers the entrance (0-based). */
  index?: number;
}

/**
 * Staff working-hours overview tile — bespoke to `/staff/:id`, not the generic
 * `CardCount`. A tinted icon tile, a soft corner sheen, and a slot for a
 * per-metric mini-visual (week ribbon / day-shape bars / segmented meter).
 * Compact by design; the figure uses the UI sans + tabular-nums per MASTER §2
 * (serif display is for headings only, never numeric figures).
 *
 * Motion is baked in (CardCount convention): fades + rises on mount, staggered
 * by `index`; lifts on hover, dips on press. All suppressed under
 * `prefers-reduced-motion`.
 */
export function StaffMetricCard({
  icon: Icon,
  label,
  value,
  unit,
  accent = 'primary',
  footer,
  index = 0,
}: StaffMetricCardProps) {
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 60}ms` } : undefined;

  return (
    <div
      style={style}
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-md border border-border bg-card p-3 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-80',
          accent === 'gold' ? 'bg-accent/25' : 'bg-primary/15',
        )}
      />

      <div className="relative flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm',
            accent === 'gold'
              ? 'bg-accent/20 text-accent-foreground'
              : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      <p className="relative flex items-baseline gap-1">
        <span className="text-2xl font-semibold leading-none tabular-nums">{value}</span>
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </p>

      {footer ? <div className="relative">{footer}</div> : null}
    </div>
  );
}

/** 7 weekday pills (Mon→Sun); worked days filled, days off hollow. */
export function WeekRibbon({
  worked,
  labels,
  ariaLabel,
}: {
  worked: boolean[];
  labels: string[];
  ariaLabel: string;
}) {
  return (
    <div className="flex items-end gap-1" role="img" aria-label={ariaLabel}>
      {worked.map((on, i) => (
        <span
          key={i}
          title={labels[i]}
          className={cn(
            'h-4 flex-1 rounded-[3px] transition-colors duration-200',
            on ? 'bg-primary' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}

/** Segmented dial — `segments` ticks, filled proportional to `ratio` (0–1). */
export function SegmentMeter({
  ratio,
  segments = 16,
  ariaLabel,
}: {
  ratio: number;
  segments?: number;
  ariaLabel: string;
}) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * segments);
  return (
    <div className="flex items-center gap-[3px]" role="img" aria-label={ariaLabel}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn('h-3 flex-1 rounded-[2px]', i < filled ? 'bg-accent' : 'bg-muted')}
        />
      ))}
    </div>
  );
}
