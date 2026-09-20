import { UserX, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { QueueCancelReason, QueueTicket } from '@/types/models';

import { CANCEL_REASONS } from './queue.lib';

interface Props {
  ticket: QueueTicket | null;
  defaultReason?: QueueCancelReason;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (ticket: QueueTicket, reason: QueueCancelReason) => void;
}

/** Cancel with a reason — NO_SHOW also marks the linked appointment as a no-show. */
export function CancelTicketDialog({ ticket, defaultReason, pending, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<QueueCancelReason>(defaultReason ?? 'CUSTOMER_LEFT');

  useEffect(() => {
    if (ticket) setReason(defaultReason ?? (ticket.status === 'CALLED' ? 'NO_SHOW' : 'CUSTOMER_LEFT'));
  }, [ticket, defaultReason]);

  return (
    <Dialog open={ticket != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {ticket ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle>{t('queue.cancelTitle', { number: ticket.number })}</DialogTitle>
                  <DialogDescription>{t('queue.cancelBody', { name: ticket.customerName })}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{t('queue.cancelReason')}</legend>
              {CANCEL_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150',
                    reason === r ? 'border-destructive/40 bg-destructive-soft/40' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--destructive))]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {r === 'NO_SHOW' ? <UserX className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      {t(`queue.reason.${r}`)}
                    </span>
                    <span className="block text-2xs text-muted-foreground">{t(`queue.reasonHint.${r}`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => onConfirm(ticket, reason)}>
                {t('queue.cancelTicket')}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
