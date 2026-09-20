import { Check, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type CustomerStatTone = 'primary' | 'success' | 'neutral' | 'info';

const TONE: Record<CustomerStatTone, { chip: string; bar: string; ring: string }> = {
  primary: {
    chip: 'bg-primary/10 text-primary',
    bar: 'bg-primary',
    ring: 'border-primary/50 ring-primary/30',
  },
  success: {
    chip: 'bg-success-soft text-success',
    bar: 'bg-success',
    ring: 'border-success/50 ring-success/30',
  },
  info: { chip: 'bg-info-soft text-info', bar: 'bg-info', ring: 'border-info/50 ring-info/30' },
  neutral: {
    chip: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    ring: 'border-border ring-border',
  },
};

interface CustomerStatCardProps {
  icon: LucideIcon;
  tone: CustomerStatTone;
  label: string;
  value: ReactNode;
  /** Short supporting line under the figure. */
  hint?: string;
  /** Optional richer element under the hint (meter, sparkline, chip). */
  footer?: ReactNode;
  /** Grid position — staggers the entrance (0-based). */
  index?: number;
  /** Turns the card into a filter toggle button. */
  onClick?: () => void;
  active?: boolean;
}

/**
 * Customer overview stat tile — tone-tinted icon chip, label + figure + hint
 * line, and a thin tone accent bar. Mirrors `StaffStatCard` / `QueueStatCard`.
 *
 * Motion is baked in (CardCount convention): every tile fades + rises on mount,
 * staggered by `index`; interactive tiles lift on hover and dip on press. All
 * motion is suppressed under `prefers-reduced-motion`.
 */
export function CustomerStatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  footer,
  index = 0,
  onClick,
  active = false,
}: CustomerStatCardProps) {
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
        {footer ? <div className="mt-1.5">{footer}</div> : null}
      </div>

      {onClick ? (
        active ? (
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              c.chip,
            )}
          >
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
