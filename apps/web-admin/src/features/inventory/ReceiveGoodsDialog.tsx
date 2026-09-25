import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GoodsReceiptCreateInput, PurchaseOrderView } from '@abcp/shared-types';

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
import { Select } from '@/components/ui/select';
import { NormalizedApiError } from '@/services/apiError';

import { LotFields } from './LotFields';
import { ScanInput } from './ScanInput';
import { baseEquivalent } from './uom';
import { lotPayload, type LotDraft } from './lotDraft';
import { useReceiveGoods } from './inventory.api';

/** M1 — unit 'order' = ໜ່ວຍທີ່ສັ່ງ (ເຊັ່ນ ກ່ອງ), 'base' = ໜ່ວຍພື້ນຖານ; ຈຳນວນ/ຕົ້ນທຶນ ເປັນຕໍ່ໜ່ວຍທີ່ເລືອກ. */
type LineDraft = {
  received: string;
  rejected: string;
  rejectReason: string;
  unitCost: string;
  unit: 'order' | 'base';
  lot: LotDraft;
};
type PoItem = NonNullable<PurchaseOrderView['items']>[number];
const hasOrderUnit = (it: PoItem) => Boolean(it.uomId) && it.factorToBase !== 1;
const unitFactor = (it: PoItem, unit: LineDraft['unit']) => (unit === 'order' && hasOrderUnit(it) ? it.factorToBase : 1);
const round = (n: number, dp: number) => String(Number(n.toFixed(dp)));

/**
 * H4 — Goods receipt (GRN): per-line quantity received / rejected (+ reason), actual unit cost and, for
 * lot-tracked products, the lot of *this* delivery. Defaults to the outstanding quantity of every line.
 */
export function ReceiveGoodsDialog({
  po,
  open,
  onClose,
}: {
  po: PurchaseOrderView;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const receive = useReceiveGoods();
  const items = po.items ?? [];
  const initial = (): Record<string, LineDraft> =>
    Object.fromEntries(
      items.map((it) => [
        it.id,
        {
          received: hasOrderUnit(it) ? round(it.qtyOutstanding / it.factorToBase, 3) : String(it.qtyOutstanding),
          rejected: '0',
          rejectReason: '',
          unitCost: hasOrderUnit(it) ? String(it.uomUnitCost) : String(it.unitCost),
          unit: hasOrderUnit(it) ? 'order' : 'base',
          lot: { lotNumber: it.qtyReceived > 0 ? '' : (it.lotNumber ?? ''), expiryDate: '', mfgDate: '' },
        },
      ]),
    );
  const [lines, setLines] = useState<Record<string, LineDraft>>(initial);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [notes, setNotes] = useState('');

  const patch = (id: string, p: Partial<LineDraft>) => setLines((prev) => ({ ...prev, [id]: { ...prev[id]!, ...p } }));
  const total = items.reduce((s, it) => {
    const l = lines[it.id];
    return s + (Number(l?.received) || 0) * (Number(l?.unitCost) || 0);
  }, 0);

  function reset() {
    setLines(initial());
    setDeliveryNote('');
    setNotes('');
  }

  function submit() {
    const payload: GoodsReceiptCreateInput['lines'] = [];
    for (const it of items) {
      const l = lines[it.id];
      if (!l) continue;
      const qtyReceived = Number(l.received) || 0;
      const qtyRejected = Number(l.rejected) || 0;
      if (qtyReceived < 0 || qtyRejected < 0) {
        toast.error(t('inventory.grn.invalidQty'));
        return;
      }
      if (qtyReceived === 0 && qtyRejected === 0) continue;
      if (qtyRejected > 0 && !l.rejectReason.trim()) {
        toast.error(t('inventory.grn.rejectReasonRequired'));
        return;
      }
      if (it.trackLot && qtyReceived > 0 && !l.lot.lotNumber.trim()) {
        toast.error(t('inventory.lot.receiveRequired'));
        return;
      }
      const defaultCost = l.unit === 'order' && hasOrderUnit(it) ? it.uomUnitCost : it.unitCost;
      payload.push({
        poItemId: it.id,
        // M1 — ຈຳນວນ/ຕົ້ນທຶນເປັນໜ່ວຍທີ່ເລືອກ; backend ແປງເປັນໜ່ວຍພື້ນຖານ.
        uomId: l.unit === 'order' && hasOrderUnit(it) ? it.uomId : null,
        qtyReceived,
        qtyRejected,
        ...(qtyRejected > 0 ? { rejectReason: l.rejectReason.trim() } : {}),
        ...(Number(l.unitCost) !== defaultCost && l.unitCost !== '' ? { unitCost: Number(l.unitCost) } : {}),
        ...(it.trackLot && qtyReceived > 0 ? lotPayload(l.lot) : {}),
      });
    }
    if (!payload.length) {
      toast.error(t('inventory.grn.nothing'));
      return;
    }
    receive.mutate(
      {
        id: po.id,
        input: {
          lines: payload,
          ...(deliveryNote.trim() ? { supplierDeliveryNote: deliveryNote.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      {
        onSuccess: (r) => {
          toast.success(t('inventory.grn.saved', { number: r.receipt.grnNumber }));
          reset();
          onClose();
        },
        onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setLines(initial());
        else {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <PackageCheck className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <DialogTitle>{t('inventory.grn.title', { number: po.poNumber })}</DialogTitle>
            <DialogDescription>{t('inventory.grn.subtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto px-6 py-5">
          {/* M2 — ສະແກນ barcode/GTIN → ໄປທີ່ແຖວຂອງສິນຄ້ານັ້ນ ແລະ focus ຈຳນວນ */}
          <ScanInput
            branchId={po.branchId}
            accept={(r) => (items.some((it) => it.productId === r.product.id) ? true : t('inventory.scan.notInDocument', { name: r.product.name }))}
            onFound={(r) => {
              const it = items.find((x) => x.productId === r.product.id);
              const el = it ? (document.getElementById(`grn-rcv-${it.id}`) as HTMLInputElement | null) : null;
              el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              el?.focus();
              el?.select();
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="grn-dn">{t('inventory.grn.deliveryNote')}</Label>
              <Input id="grn-dn" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-notes">{t('inventory.grn.notes')}</Label>
              <Input id="grn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {items.map((it) => {
            const l = lines[it.id];
            if (!l) return null;
            const rejected = Number(l.rejected) || 0;
            const f = unitFactor(it, l.unit);
            const switchUnit = (unit: LineDraft['unit']) => {
              const nf = unitFactor(it, unit);
              if (nf === f) return;
              patch(it.id, {
                unit,
                received: round(((Number(l.received) || 0) * f) / nf, 3),
                rejected: round(((Number(l.rejected) || 0) * f) / nf, 3),
                unitCost: round(((Number(l.unitCost) || 0) / f) * nf, 4),
              });
            };
            return (
              <div key={it.id} className="space-y-3 rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {it.productName} <span className="text-xs text-muted-foreground">{it.sku}</span>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('inventory.grn.progress', {
                      received: it.qtyReceived.toLocaleString(),
                      ordered: it.quantity.toLocaleString(),
                      unit: it.unit,
                    })}
                  </p>
                </div>
                {hasOrderUnit(it) ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Select
                      className="h-8 min-w-[150px]"
                      value={l.unit}
                      onChange={(e) => switchUnit(e.target.value as LineDraft['unit'])}
                      options={[
                        { value: 'order', label: `${it.uomCode} (= ${it.factorToBase.toLocaleString()} ${it.unit})` },
                        { value: 'base', label: it.unit },
                      ]}
                      aria-label={t('inventory.uom.unit')}
                    />
                    <span className="tabular-nums">{baseEquivalent(Number(l.received) || 0, f, it.unit)}</span>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`grn-rcv-${it.id}`}>{t('inventory.grn.qtyReceived')}</Label>
                    <Input
                      id={`grn-rcv-${it.id}`}
                      type="number"
                      min="0"
                      step="0.001"
                      className="tabular-nums"
                      value={l.received}
                      onChange={(e) => patch(it.id, { received: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`grn-rej-${it.id}`}>{t('inventory.grn.qtyRejected')}</Label>
                    <Input
                      id={`grn-rej-${it.id}`}
                      type="number"
                      min="0"
                      step="0.001"
                      className="tabular-nums"
                      value={l.rejected}
                      onChange={(e) => patch(it.id, { rejected: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`grn-cost-${it.id}`}>{t('inventory.po.unitCost')}</Label>
                    <Input
                      id={`grn-cost-${it.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      className="tabular-nums"
                      value={l.unitCost}
                      onChange={(e) => patch(it.id, { unitCost: e.target.value })}
                    />
                  </div>
                </div>
                {rejected > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`grn-reason-${it.id}`}>{t('inventory.grn.rejectReason')}</Label>
                    <Input
                      id={`grn-reason-${it.id}`}
                      value={l.rejectReason}
                      onChange={(e) => patch(it.id, { rejectReason: e.target.value })}
                    />
                  </div>
                ) : null}
                {it.trackLot && (Number(l.received) || 0) > 0 ? (
                  <LotFields idPrefix={`grn-${it.id}`} value={l.lot} onChange={(lot) => patch(it.id, { lot })} />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
          <span className="text-sm text-muted-foreground">
            {t('inventory.grn.value')}: <CurrencyText amount={total} className="font-medium text-foreground" />
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={receive.isPending}>
              <PackageCheck className="mr-1 h-4 w-4" />
              {receive.isPending ? t('common.saving') : t('inventory.grn.post')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
