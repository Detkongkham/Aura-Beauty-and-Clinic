import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface HeaderFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * The framed card every page title sits in — same treatment as the Dashboard
 * header: rounded card, hairline border, soft shadow and two blurred brand
 * glows in the corner. Also normalises the h1 inside it to the Dashboard's
 * title style so pages that still carry older size/weight classes match.
 */
export function HeaderFrame({ children, className }: HeaderFrameProps) {
  return (
    <header
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6 sm:py-5',
        '[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-foreground',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-40 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
      />
      <div className={cn('relative', className)}>{children}</div>
    </header>
  );
}
