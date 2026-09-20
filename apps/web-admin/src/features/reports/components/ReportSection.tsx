import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  /** Chapter number shown as a tinted index chip (e.g. 2 → "02"). Omit for sub-blocks. */
  index?: number;
  title: string;
  desc?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** One-line takeaway shown as an editorial callout at the top of the body. */
  insight?: ReactNode;
  /** Remove body padding — for a table that should meet the frame edge. */
  flush?: boolean;
  className?: string;
}

/**
 * A section of the report — framed like a page of a printed statement:
 * a ruled header band with a numbered chapter index + serif title, a hairline primary
 * underline, then the body. This is the reports feature's own block style
 * (intentionally not the dashboard's floating card).
 */
export function ReportSection({
  index,
  title,
  desc,
  actions,
  children,
  insight,
  flush,
  className,
}: Props) {
  return (
    <section
      className={cn(
        'break-inside-avoid overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <header className="relative flex items-center gap-2.5 border-b border-border bg-muted px-4 py-2.5">
        {index != null ? (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-primary/15 px-1 text-[11px] font-bold leading-none tabular-nums text-primary">
            {String(index).padStart(2, '0')}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold leading-tight text-foreground">
            {title}
          </h2>
          {desc ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{desc}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/60 via-primary/20 to-transparent"
        />
      </header>
      <div className={cn(flush ? '' : 'p-4')}>
        {insight ? (
          <p className={cn('border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground', flush ? 'mx-4 mt-3' : 'mb-3')}>
            {insight}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
