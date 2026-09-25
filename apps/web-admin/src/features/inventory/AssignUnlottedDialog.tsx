import { useState, type FormEvent } from 'react';
import { Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ProductView } from '@abcp/shared-types';

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
import { NormalizedApiError } from '@/services/apiError';

import { LotFields } from './LotFields';
import { EMPTY_LOT, lotPayload, type LotDraft } from './lotDraft';
import { useAssignUnlotted } from './inventory.api';

/**
 * Lot backfill — moves stock that predates lot tracking (stockQty − Σ lots) into a lot at the
 * current WAC. stockQty itself does not change, so no ledger movement is written.
 */
export function AssignUnlottedDialog({ product, onClose }: { product: ProductView | null; onClose: () => void }) {
  const { t } = useTranslation();
  const assign = useAssignUnlotted();
  const [lot, setLot] = useState<LotDraft>(EMPTY_LOT);
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLot(EMPTY_LOT);
    setQty('');
    setError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    const n = Number(qty === '' ? product.unlottedQty : qty);
    if (!lot.lotNumber.trim()) return setError(t('inventory.lot.adjustRequired'));
    if (!Number.isFinite(n) || n <= 0 || n > product.unlottedQty) {
      return setError(t('inventory.unlotted.qtyInvalid', { max: product.unlottedQty }));
    }
    assign.mutate(
      { productId: product.id, qty: n, ...lotPayload(lot) },
      {
        onSuccess: () => {
          toast.success(t('inventory.unlotted.done'));
          reset();
          onClose();
        },
        onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Layers className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{t('inventory.unlotted.title')}</DialogTitle>
            <DialogDescription>{t('inventory.unlotted.subtitle')}</DialogDescription>
          </div>
        </DialogHeader>
        {product ? (
          <form className="space-y-4 px-6 py-5" onSubmit={submit}>
            <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm">
              <p className="font-medium text-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                {t('inventory.unlotted.available', { qty: product.unlottedQty.toLocaleString(), unit: product.unit })}
              </p>
            </div>
            <LotFields value={lot} onChange={setLot} idPrefix="ul" />
            <div className="space-y-1.5">
              <Label htmlFor="ul-qty">{t('inventory.unlotted.qty')}</Label>
              <Input
                id="ul-qty"
                type="number"
                step="0.001"
                min={0}
                inputMode="decimal"
                className="tabular-nums"
                value={qty === '' ? String(product.unlottedQty) : qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setError(null);
                }}
              />
              <p className="text-xs text-muted-foreground">{t('inventory.unlotted.costNote')}</p>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={assign.isPending}>
                {assign.isPending ? t('common.saving') : t('inventory.unlotted.submit')}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
