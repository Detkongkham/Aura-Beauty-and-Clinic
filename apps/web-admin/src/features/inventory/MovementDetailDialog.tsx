import { type ReactNode, useEffect, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Copy,
  Hash,
  Link2,
  MessageSquare,
  Store,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { StockMovementView } from '@abcp/shared-types';

import { DateTimeText, StatusPill } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { INVENTORY_STAT_TONE } from './inventoryStatTone';
import { decodeRefId, MOVEMENT_TYPE_ICON, MOVEMENT_TYPE_TONE, MOVEMENT_TYPE_VARIANT, signedQty } from './movementTypes';

function copy(text: string, message: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(message))
    .catch(() => undefined);
}

function Fact({ icon: Icon, label, children }: { icon: typeof Calendar; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function MovementDetailDialog({
  movement,
  onClose,
}: {
  movement: StockMovementView | null;
  onClose: () => void;
}) {
  // Keep rendering the last movement while the dialog plays its close transition,
  // so the content doesn't flash blank the instant the parent clears selection.
  const [cached, setCached] = useState<StockMovementView | null>(null);
  useEffect(() => {
    if (movement) setCached(movement);
  }, [movement]);
  const shown = movement ?? cached;

  return (
    <Dialog open={Boolean(movement)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {shown ? (
          <MovementDetailBody movement={shown} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MovementDetailBody({ movement, onClose }: { movement: StockMovementView; onClose: () => void }) {
  const { t } = useTranslation();
  const Icon = MOVEMENT_TYPE_ICON[movement.type];
  const tone = INVENTORY_STAT_TONE[MOVEMENT_TYPE_TONE[movement.type]];
  const qty = signedQty(movement);
  const outbound = qty < 0;
  const before = movement.balanceAfter - qty;
  const ref = decodeRefId(movement.refId);

  return (
    <>
      <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
        <span
          className={cn('mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone.chip)}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <DialogTitle className="truncate text-xl">{movement.productName}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <StatusPill
                status={movement.type}
                variant={MOVEMENT_TYPE_VARIANT[movement.type]}
                label={t(`inventory.movement.${movement.type}`)}
              />
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {movement.branchName}
              </span>
            </div>
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="max-h-[calc(100vh-9rem)] space-y-6 overflow-y-auto px-7 py-6">
        {/* Quantity hero — before → after */}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">{t('inventory.ledger.detail.before')}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{before.toLocaleString()}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 px-2">
            {outbound ? (
              <TrendingDown className="h-4 w-4 text-warning" aria-hidden="true" />
            ) : (
              <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
            )}
            <span className={cn('text-base font-bold tabular-nums', outbound ? 'text-warning' : 'text-success')}>
              {outbound ? '−' : '+'}
              {Math.abs(qty).toLocaleString()}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">{t('inventory.ledger.detail.after')}</p>
            <p
              className={cn(
                'mt-0.5 text-lg font-semibold tabular-nums',
                movement.balanceAfter < 0 && 'text-destructive',
              )}
            >
              {movement.balanceAfter.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Facts grid */}
        <div className="grid grid-cols-2 gap-4">
          <Fact icon={Calendar} label={t('inventory.ledger.when')}>
            <DateTimeText value={movement.createdAt} mode="datetime" />
            <p className="mt-0.5 text-xs font-normal text-muted-foreground">
              <DateTimeText value={movement.createdAt} mode="relative" />
            </p>
          </Fact>
          <Fact icon={User} label={t('inventory.ledger.by')}>
            {movement.createdByUserName ?? t('inventory.ledger.system')}
          </Fact>
          <Fact icon={Link2} label={t('inventory.ledger.detail.reference')}>
            {ref ? (
              <button
                type="button"
                onClick={() => copy(ref.id, t('inventory.ledger.detail.copied'))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted"
                title={ref.id}
              >
                {t(`inventory.ledger.detail.ref.${ref.kind}`)}
                <Copy className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Fact>
          <Fact icon={Hash} label={t('inventory.ledger.detail.movementId')}>
            <button
              type="button"
              onClick={() => copy(movement.id, t('inventory.ledger.detail.copied'))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted"
              title={movement.id}
            >
              {movement.id.slice(0, 8)}
              <Copy className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </Fact>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('inventory.ledger.note')}
          </p>
          <p className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground">
            {movement.reasonCode ? (
              <span className="mr-1.5 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium">
                {t(`inventory.adjReason.${movement.reasonCode}`)}
              </span>
            ) : null}
            {movement.notes || t('inventory.ledger.detail.noNotes')}
          </p>
          {movement.attachmentUrl ? (
            <a href={movement.attachmentUrl} target="_blank" rel="noreferrer" className="block">
              <img
                src={movement.attachmentUrl}
                alt={t('inventory.adjustPhoto')}
                className="max-h-48 rounded-lg border border-border object-contain"
              />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end border-t border-border bg-card px-7 py-4">
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </>
  );
}
