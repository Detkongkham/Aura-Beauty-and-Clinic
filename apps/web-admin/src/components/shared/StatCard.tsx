import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Full/precise value for the title attr when `value` is abbreviated. */
  valueTitle?: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** design.md §8 — label / figure / delta chip with glyph AND colour (never colour alone). */
export function StatCard({ label, value, valueTitle, delta, icon, loading, className }: StatCardProps) {
  return (
    <Card className={cn('p-4 transition-shadow hover:shadow-md', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-9 w-28" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tabular-nums" title={valueTitle}>
          {value}
        </p>
      )}

      {delta && !loading ? (
        <p
          className={cn(
            'mt-1 inline-flex items-center gap-1 text-xs font-medium',
            delta.direction === 'up' && 'text-success',
            delta.direction === 'down' && 'text-destructive',
            delta.direction === 'flat' && 'text-muted-foreground',
          )}
        >
          {delta.direction === 'up' ? (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : delta.direction === 'down' ? (
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : null}
          {delta.value}
        </p>
      ) : null}
    </Card>
  );
}
