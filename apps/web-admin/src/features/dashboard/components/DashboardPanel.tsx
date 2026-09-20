import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Grid position — staggers the entrance (0-based). */
  index?: number;
}

/**
 * One framed block for every dashboard section: a single radius / border / shadow,
 * a soft tinted icon tile, and a header row that keeps the action on the right.
 * Fades + rises on mount (cardcount-animation convention), no overshoot on data.
 */
export function DashboardPanel({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  index = 0,
}: Props) {
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 50}ms` } : undefined;
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        className,
      )}
      style={style}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 [&_svg]:h-4 [&_svg]:w-4">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}
