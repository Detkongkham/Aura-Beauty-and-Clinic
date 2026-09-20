import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface CardCountProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  className?: string;
  /** Makes the card a button; combine with `active` for a selected look. */
  onClick?: () => void;
  active?: boolean;
  /** Position in a card grid — staggers the mount animation (0-based). */
  index?: number;
}

/**
 * Compact count card — icon + label + figure. Clickable when `onClick` is set.
 *
 * Motion is part of the component, not the caller: every card fades + rises on
 * mount (staggered by `index`), lifts on hover when interactive, and dips on
 * press. Baking it in here means every place a card is used or created gets the
 * same animation for free — keep it that way. All motion is suppressed under
 * `prefers-reduced-motion`.
 */
export function CardCount({
  icon,
  label,
  value,
  className,
  onClick,
  active,
  index = 0,
}: CardCountProps) {
  const cls = cn(
    'rounded-lg border bg-background p-4 text-card-foreground shadow',
    // entrance
    'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out',
    'motion-reduce:animate-none',
    // interaction
    onClick &&
      'cursor-pointer text-left transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-muted/50 hover:shadow-md active:translate-y-0 active:shadow motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active && 'border-primary ring-1 ring-primary',
    className,
  );
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined;

  const inner = (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls} style={style}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
