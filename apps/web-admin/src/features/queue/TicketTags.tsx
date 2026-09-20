import { CalendarClock, Crown, History, Repeat, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

const base =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-2xs font-medium';

/** Customer/ticket context chips: VIP, booked, first visit vs regular, carried over. */
export function TicketTags({ ticket, className }: { ticket: QueueTicket; className?: string }) {
  const { t } = useTranslation();
  const visits = ticket.visitCount ?? 0;
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {ticket.priority === 'VIP' ? (
        <span className={cn(base, 'bg-accent-soft text-accent-foreground')}>
          <Crown className="h-3 w-3" aria-hidden="true" />
          {t('queue.priorityVip')}
        </span>
      ) : ticket.priority === 'APPOINTMENT' ? (
        <span className={cn(base, 'bg-primary/10 text-primary')}>
          <CalendarClock className="h-3 w-3" aria-hidden="true" />
          {t('queue.priorityAppointment')}
        </span>
      ) : null}
      {ticket.customerId ? (
        visits === 0 ? (
          <span className={cn(base, 'bg-info-soft text-info')}>
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t('queue.tag.NEW')}
          </span>
        ) : visits >= 3 ? (
          <span className={cn(base, 'bg-success-soft text-success')} title={t('queue.visitsTitle', { n: visits })}>
            <Repeat className="h-3 w-3" aria-hidden="true" />
            {t('queue.regular', { n: visits })}
          </span>
        ) : null
      ) : null}
      {ticket.carriedOver ? (
        <span className={cn(base, 'bg-warning-soft text-warning')}>
          <History className="h-3 w-3" aria-hidden="true" />
          {t('queue.carriedOver')}
        </span>
      ) : null}
    </span>
  );
}
