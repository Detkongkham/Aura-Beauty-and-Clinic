import { Check, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type HomeServiceStatTone = 'warning' | 'info' | 'primary' | 'success' | 'danger' | 'neutral' | 'accent';

const TONE: Record<HomeServiceStatTone, { chip: string; bar: string; ring: string }> = {
  warning: { chip: 'bg-warning-soft text-warning', bar: 'bg-warning', ring: 'border-warning/50 ring-warning/30' },
  info: { chip: 'bg-info-soft text-info', bar: 'bg-info', ring: 'border-info/50 ring-info/30' },
  primary: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', ring: 'border-primary/50 ring-primary/30' },
  accent: { chip: 'bg-accent-soft text-accent-foreground', bar: 'bg-accent', ring: 'border-accent/50 ring-accent/30' },
  success: { chip: 'bg-success-soft text-success', bar: 'bg-success', ring: 'border-success/50 ring-success/30' },
  danger: { chip: 'bg-destructive-soft text-destructive', bar: 'bg-destructive', ring: 'border-destructive/50 ring-destructive/30' },
  neutral: { chip: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40', ring: 'border-border ring-border' },
};

interface HomeServiceStatCardProps {
  icon: LucideIcon;
  tone: HomeServiceStatTone;
  label: string;
  value: ReactNode;
  hint?: string;
  /** Grid position — staggers the entrance (0-based). */
  index?: number;
  /** Turns the card into a filter toggle button. */
  onClick?: () => void;
  active?: boolean;
}

/**
 * Dispatch-console stat tile — mirrors `QueueStatCard` (tone-tinted icon chip +
 * label/figure + accent bar). Motion is baked in per the CardCount convention:
 * fade + rise on mount (staggered by `index`), lift on hover for clickable
 * tiles, all suppressed under `prefers-reduced-motion`.
 */
export function HomeServiceStatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  index = 0,
  onClick,
  active = false,
}: HomeServiceStatCardProps) {
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

  const body = (
    <>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', c.bar)} />

      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', c.chip)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold leading-tight tabular-nums">{value}</p>
        {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
      </div>

      {onClick && active ? (
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.chip)}>
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
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
