import { useState } from 'react';
import { Check, CheckCircle2, ClipboardCheck, Image as ImageIcon, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { StockAdjustRequestView } from '@abcp/shared-types';

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

import {
  useAdjustRequests,
  useAdjustSettings,
  useReviewAdjustRequest,
  useSaveAdjustSettings,
} from './inventory.api';

/**
 * H2 — maker-checker queue. Adjustments whose |delta| × WAC exceeds the threshold (non SUPER_ADMIN)
 * wait here; SUPER_ADMIN approves (posts through the normal adjust path) or rejects with a reason.
 * BRANCH_ADMIN sees its own branch's requests read-only.
 */
export function AdjustApprovalsCard({ branchId, canApprove }: { branchId?: string; canApprove: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading } = useAdjustRequests({ status: 'PENDING', branchId, page: 1, pageSize: 20 });
  const { data: settings } = useAdjustSettings();
  const review = useReviewAdjustRequest();
  const [rejecting, setRejecting] = useState<StockAdjustRequestView | null>(null);
  const [editingThreshold, setEditingThreshold] = useState(false);

  if (isLoading) {
    return <div className="h-[120px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }
  const items = data?.items ?? [];

  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-card p-3 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        items.length > 0 ? 'border-warning/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
            <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('inventory.approvals.title')}</p>
          {items.length > 0 ? (
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-warning">
              {data?.total ?? items.length}
            </span>
          ) : null}
        </div>
        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
          {t('inventory.approvals.threshold')}{' '}
          <CurrencyText amount={settings?.approvalThresholdLak ?? 0} className="font-medium text-foreground" />
          {canApprove ? (
            <button
              type="button"
              onClick={() => setEditingThreshold(true)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('inventory.approvals.editThreshold')}
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center gap-1.5 py-4 text-center">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('inventory.approvals.empty')}</p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {r.productName}{' '}
                  <span className={cn('tabular-nums', r.delta < 0 ? 'text-destructive' : 'text-success')}>
                    {r.delta > 0 ? '+' : ''}
                    {r.delta.toLocaleString()} {r.unit}
                  </span>
                </p>
                <p className="truncate text-2xs text-muted-foreground">
                  {t(`inventory.adjReason.${r.reason}`)}
                  {r.notes ? ` · ${r.notes}` : ''} · {r.requestedByUserName} · {r.branchName} · {formatDate(r.createdAt)}
                </p>
              </div>
              {r.attachmentUrl ? (
                <a
                  href={r.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-2xs text-primary hover:underline"
                >
                  <ImageIcon className="h-3 w-3" aria-hidden="true" />
                  {t('inventory.approvals.photo')}
                </a>
              ) : null}
              <CurrencyText amount={r.estimatedValue} className="shrink-0 text-xs font-semibold" />
              {canApprove ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={review.isPending}
                    onClick={() => setRejecting(r)}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    {t('inventory.approvals.reject')}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { id: r.id, action: 'approve' },
                        { onSuccess: () => toast.success(t('inventory.approvals.approved')), onError },
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

      <RejectDialog
        request={rejecting}
        pending={review.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) =>
          rejecting &&
          review.mutate(
            { id: rejecting.id, action: 'reject', reason },
            {
              onSuccess: () => {
                toast.success(t('inventory.approvals.rejected'));
                setRejecting(null);
              },
              onError,
            },
          )
        }
      />
      {canApprove ? (
        <InventorySettingsDialog open={editingThreshold} onClose={() => setEditingThreshold(false)} />
      ) : null}
    </div>
  );
}

function RejectDialog({
  request,
  pending,
  onClose,
  onSubmit,
}: {
  request: StockAdjustRequestView | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inventory.approvals.rejectTitle')}</DialogTitle>
          <DialogDescription>{request?.productName}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) onSubmit(reason.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rej-reason">{t('inventory.approvals.rejectReason')}</Label>
            <Input id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={pending || !reason.trim()}>
              {t('inventory.approvals.reject')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inventory approval / tolerance settings (AppSetting, SUPER_ADMIN): H2 adjust limit, M6 PO approval limit,
 * H4 over-receipt tolerance and 3-way-match tolerance. Shared by the adjust-approvals and PO-approvals cards.
 */
export function InventorySettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: settings } = useAdjustSettings();
  const save = useSaveAdjustSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fields = [
    { key: 'approvalThresholdLak', label: t('inventory.settings.adjustLimit'), hint: t('inventory.approvals.thresholdHint'), step: '1000' },
    { key: 'poApprovalThresholdLak', label: t('inventory.settings.poLimit'), hint: t('inventory.settings.poLimitHint'), step: '1000' },
    { key: 'overReceiptTolerancePct', label: t('inventory.settings.overReceipt'), hint: t('inventory.settings.overReceiptHint'), step: '0.5' },
    { key: 'invoiceMatchTolerancePct', label: t('inventory.settings.matchTolerance'), hint: t('inventory.settings.matchToleranceHint'), step: '0.5' },
    { key: 'safetyStockDays', label: t('inventory.settings.safetyDays'), hint: t('inventory.settings.safetyDaysHint'), step: '1' },
    { key: 'reorderReviewDays', label: t('inventory.settings.reviewDays'), hint: t('inventory.settings.reviewDaysHint'), step: '1' },
    { key: 'defaultLeadTimeDays', label: t('inventory.settings.leadTime'), hint: t('inventory.settings.leadTimeHint'), step: '1' },
    // 9C — M3 ABC: % ມູນຄ່າສະສົມຂອງກຸ່ມ A / A+B.
    { key: 'abcA', label: t('inventory.settings.abcA'), hint: t('inventory.settings.abcAHint'), step: '1' },
    { key: 'abcB', label: t('inventory.settings.abcB'), hint: t('inventory.settings.abcBHint'), step: '1' },
  ] as const;
  const valueOf = (k: (typeof fields)[number]['key']) => draft[k] ?? String(settings?.[k] ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDraft({});
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('inventory.settings.title')}</DialogTitle>
          <DialogDescription>{t('inventory.settings.subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const input: Record<string, number> = {};
            for (const f of fields) {
              const n = Number(valueOf(f.key));
              if (!Number.isFinite(n) || n < 0) return;
              input[f.key] = n;
            }
            save.mutate(input, {
              onSuccess: () => {
                toast.success(t('common.saved'));
                setDraft({});
                onClose();
              },
              onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
            });
          }}
        >
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`inv-setting-${f.key}`}>{f.label}</Label>
              <Input
                id={`inv-setting-${f.key}`}
                type="number"
                min={0}
                step={f.step}
                inputMode="decimal"
                className="tabular-nums"
                value={valueOf(f.key)}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
              <p className="text-2xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || !settings}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
