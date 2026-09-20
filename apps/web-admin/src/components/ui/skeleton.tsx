import * as React from 'react';

import { cn } from '@/lib/utils';

/** Loading placeholder — design.md §8: skeletons over spinners for content. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
