import {
  BellRing,
  Crown,
  Eye,
  MoreVertical,
  Scissors,
  Undo2,
  UserX,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { QueueCancelReason, QueueTicket } from '@/types/models';

/** Every ticket action the board exposes — one object threaded through card, list, sheet. */
export interface TicketHandlers {
  advance: (tk: QueueTicket) => void;
  startNow: (tk: QueueTicket) => void;
  recall: (tk: QueueTicket) => void;
  sendBack: (tk: QueueTicket) => void;
  restore: (tk: QueueTicket) => void;
  toggleVip: (tk: QueueTicket) => void;
  /** Opens the reason picker; `reason` pre-selects one (e.g. NO_SHOW). */
  cancel: (tk: QueueTicket, reason?: QueueCancelReason) => void;
  openDetail: (tk: QueueTicket) => void;
}

interface Props {
  ticket: QueueTicket;
  handlers: TicketHandlers;
  disabled?: boolean;
  className?: string;
}

const itemCls = 'gap-2';

/** Overflow menu for secondary ticket actions — only lists what the ticket's state allows. */
export function TicketActionsMenu({ ticket, handlers, disabled, className }: Props) {
  const { t } = useTranslation();
  const s = ticket.status;
  const vip = ticket.priority === 'VIP';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 shrink-0 p-0 text-muted-foreground', className)}
          aria-label={t('queue.rowActions')}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className={itemCls} onSelect={() => handlers.openDetail(ticket)}>
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('queue.viewDetail')}
        </DropdownMenuItem>

        {s === 'WAITING' ? (
          <DropdownMenuItem className={itemCls} onSelect={() => handlers.startNow(ticket)}>
            <Scissors className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('queue.startNow')}
          </DropdownMenuItem>
        ) : null}
        {s === 'CALLED' ? (
          <>
            <DropdownMenuItem className={itemCls} onSelect={() => handlers.recall(ticket)}>
              <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('queue.recall')}
            </DropdownMenuItem>
            <DropdownMenuItem className={itemCls} onSelect={() => handlers.sendBack(ticket)}>
              <Undo2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('queue.sendBack')}
            </DropdownMenuItem>
          </>
        ) : null}
        {s === 'CANCELLED' ? (
          <DropdownMenuItem className={itemCls} onSelect={() => handlers.restore(ticket)}>
            <Undo2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('queue.restore')}
          </DropdownMenuItem>
        ) : null}

        {s === 'WAITING' || s === 'CALLED' ? (
          <DropdownMenuItem className={itemCls} onSelect={() => handlers.toggleVip(ticket)}>
            <Crown className="h-4 w-4 text-accent" aria-hidden="true" />
            {vip ? t('queue.unmarkVip') : t('queue.markVip')}
          </DropdownMenuItem>
        ) : null}

        {s === 'WAITING' || s === 'CALLED' || s === 'IN_SERVICE' ? (
          <>
            <DropdownMenuSeparator />
            {s !== 'IN_SERVICE' ? (
              <DropdownMenuItem
                className={cn(itemCls, 'text-destructive focus:bg-destructive-soft focus:text-destructive')}
                onSelect={() => handlers.cancel(ticket, 'NO_SHOW')}
              >
                <UserX className="h-4 w-4" aria-hidden="true" />
                {t('queue.markNoShow')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className={cn(itemCls, 'text-destructive focus:bg-destructive-soft focus:text-destructive')}
              onSelect={() => handlers.cancel(ticket)}
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {t('queue.cancelTicket')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
