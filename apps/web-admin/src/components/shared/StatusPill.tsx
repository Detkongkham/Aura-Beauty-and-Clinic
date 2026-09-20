import type { AppointmentStatus, QueueTicketStatus } from '@abcp/shared-types';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type KnownStatus = AppointmentStatus | QueueTicketStatus;

const STATUS_VARIANT: Record<KnownStatus, NonNullable<BadgeProps['variant']>> = {
  // AppointmentStatus
  PENDING: 'warning',
  CONFIRMED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
  // QueueTicketStatus — the queue board's own palette: WAITING neutral (queued,
  // not yet actioned), CALLED primary (system blue), IN_SERVICE success (green =
  // being served). Amber/red are reserved for that board's ageing / SLA signals.
  WAITING: 'neutral',
  CALLED: 'primary',
  IN_SERVICE: 'success',
};

const DOT_CLASS: Record<NonNullable<BadgeProps['variant']>, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
};

interface StatusPillProps {
  status: KnownStatus | string;
  /** Localised label; falls back to the raw status. */
  label?: string;
  className?: string;
  /** Skip the AppointmentStatus/QueueTicketStatus lookup and force this variant — for
   *  pages with their own status vocabulary (e.g. inventory stock levels / movement types). */
  variant?: NonNullable<BadgeProps['variant']>;
}

/** design.md §1.3 / §8 — soft-bg pill + leading dot so status is not colour-only. */
export function StatusPill({ status, label, className, variant: variantOverride }: StatusPillProps) {
  const variant = variantOverride ?? STATUS_VARIANT[status as KnownStatus] ?? 'neutral';
  return (
    <Badge variant={variant} className={className}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[variant])} aria-hidden="true" />
      {label ?? status}
    </Badge>
  );
}
