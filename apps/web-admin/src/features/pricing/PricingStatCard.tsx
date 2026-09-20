import { Check, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** Counts up from 0 to `value` once on mount/change — skipped under prefers-reduced-motion. */
function useCountUp(value: number, durationMs = 600) {
  const [display, setDisplay] = useState(0);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setDisplay(value);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}

export type PricingStatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const PRICING_STAT_TONE: Record<PricingStatTone, { chip: string; bar: string; ring: string }> = {
  primary: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', ring: 'border-primary/50 ring-primary/30' },
  success: { chip: 'bg-success-soft text-success', bar: 'bg-success', ring: 'border-success/50 ring-success/30' },
  warning: { chip: 'bg-warning-soft text-warning', bar: 'bg-warning', ring: 'border-warning/50 ring-warning/30' },
  danger: {
    chip: 'bg-destructive-soft text-destructive',
    bar: 'bg-destructive',
    ring: 'border-destructive/50 ring-destructive/30',
  },
  neutral: { chip: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40', ring: 'border-border ring-border' },
};

function CountUpValue({ value }: { value: ReactNode }) {
  const numeric = typeof value === 'number' ? value : null;
  const animated = useCountUp(numeric ?? 0);
  if (numeric === null) return <>{value}</>;
  return <>{animated.toLocaleString()}</>;
}

interface PricingStatCardProps {
  icon: LucideIcon;
  tone: PricingStatTone;
  label: string;
  value: ReactNode;
  hint?: string;
  /** Grid position — staggers the entrance (0-based). */
  index?: number;
  /** Turns the tile into a filter toggle (e.g. "live now only"). */
  onClick?: () => void;
  active?: boolean;
  /** Pulsing dot on the icon chip — used for "a rule is running right now". */
  pulse?: boolean;
}

/**
 * Dynamic-pricing overview tile — same anatomy as `InventoryStatCard` /
 * `ResourceStatCard` (tone-tinted icon chip + left accent bar) so the pricing
 * module reads as part of the same admin, per the CardCount motion convention:
 * every tile fades + rises on mount staggered by `index`, interactive tiles
 * lift on hover and dip on press, all suppressed under `prefers-reduced-motion`.
 */
export function PricingStatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  index = 0,
  onClick,
  active = false,
  pulse = false,
}: PricingStatCardProps) {
  const c = PRICING_STAT_TONE[tone];
  const className = cn(
    'group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border bg-card py-2.5 pl-3.5 pr-2.5 text-left shadow-sm',
    'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    onClick &&
      'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active ? cn('ring-1', c.ring) : 'border-border',
  );
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 45}ms` } : undefined;

  const body = (
    <>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', c.bar)} />

      <span
        className={cn(
          'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-transform duration-200',
          c.chip,
          onClick && 'group-hover:scale-110 motion-reduce:group-hover:scale-100',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {pulse ? (
          <span
            className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full motion-safe:animate-pulse', c.bar)}
            aria-hidden="true"
          />
        ) : null}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold leading-tight tabular-nums">
          <CountUpValue value={value} />
        </p>
        {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
      </div>

      {onClick ? (
        active ? (
          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.chip)}>
            <Check className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : (
          <SlidersHorizontal
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
            aria-hidden="true"
          />
        )
      ) : null}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
