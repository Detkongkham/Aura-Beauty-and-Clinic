import { useState } from 'react';
import { Check, CheckCircle2, ClipboardList, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PurchaseOrderView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { InventorySettingsDialog } from './AdjustApprovalsCard';
import { useAdjustSettings, usePoAction, usePurchaseOrders } from './inventory.api';

/**
 * M6 — purchase orders waiting for SUPER_ADMIN approval (total above `inventory.poApprovalThresholdLak`).
 * Same shape as the H2 AdjustApprovalsCard; BRANCH_ADMIN sees the queue read-only.
 */
export function PoApprovalsCard({
  branchId,
  canApprove,
  onOpen,
}: {
  branchId?: string;
  canApprove: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = usePurchaseOrders({ status: 'PENDING_APPROVAL', branchId, page: 1, pageSize: 20 });
  const { data: settings } = useAdjustSettings();
  const action = usePoAction();
  const [rejecting, setRejecting] = useState<PurchaseOrderView | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="h-[100px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  const items = data?.items ?? [];
  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-card p-3 shadow-sm',
        items.length > 0 ? 'border-warning/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
            <ClipboardList className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('inventory.poApprovals.title')}</p>
          {items.length > 0 ? (
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-warning">
              {data?.total ?? items.length}
            </span>
          ) : null}
        </div>
        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
          {t('inventory.settings.poLimit')}{' '}
          <CurrencyText amount={settings?.poApprovalThresholdLak ?? 0} className="font-medium text-foreground" />
          {canApprove ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('inventory.settings.title')}
            >
              <Settings2 className="h-3 w-3" />
            </button>
          ) : null}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center gap-1.5 py-3 text-center">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('inventory.poApprovals.empty')}</p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {items.map((po) => (
            <li key={po.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(po.id)}>
                <p className="truncate text-xs font-medium text-foreground">
                  {po.poNumber} · {po.supplierName}
                </p>
                <p className="truncate text-2xs text-muted-foreground">
                  {po.orderedByUserName ?? '—'} · {po.branchName} · {formatDate(po.updatedAt)}
                </p>
              </button>
              <CurrencyText amount={po.totalAmount} className="shrink-0 text-xs font-semibold" />
              {canApprove ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={action.isPending}
                    onClick={() => setRejecting(po)}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    {t('inventory.approvals.reject')}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(
                        { id: po.id, action: 'approve' },
                        { onSuccess: () => toast.success(t('inventory.poApprovals.approved')), onError },
                      )
                    }
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {t('inventory.approvals.approve')}
                  </Button>
                </div>
              ) : (
                <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning">
                  {t('inventory.approvals.waiting')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => {
          if (!o) {
            setRejecting(null);
            setReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('inventory.poApprovals.rejectTitle')}</DialogTitle>
            <DialogDescription>{rejecting?.poNumber}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejecting || !reason.trim()) return;
              action.mutate(
                { id: rejecting.id, action: 'reject', reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(t('inventory.poApprovals.rejected'));
                    setRejecting(null);
                    setReason('');
                  },
                  onError,
                },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="po-rej-reason">{t('inventory.approvals.rejectReason')}</Label>
              <Input id="po-rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="danger" disabled={action.isPending || !reason.trim()}>
                {t('inventory.approvals.reject')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {canApprove ? <InventorySettingsDialog open={editing} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
