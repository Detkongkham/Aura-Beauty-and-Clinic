import { useState } from 'react';
import { PackagePlus, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ReorderSuggestionGroup } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useCreatePurchaseOrder, useReorderSuggestions } from './inventory.api';

const groupKey = (g: ReorderSuggestionGroup) => `${g.supplierId ?? '-'}|${g.branchId}|${g.currency}`;

function Amount({ value, currency }: { value: number; currency: string }) {
  return currency === 'LAK' ? (
    <CurrencyText amount={value} />
  ) : (
    <span className="tabular-nums">
      {value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
    </span>
  );
}

/**
 * M11 — ຄຳແນະນຳສັ່ງຊື້: ສິນຄ້າທີ່ available + on-order ≤ max(minStockQty, reorderPoint), ຈັດກຸ່ມຕາມຜູ້ສະໜອງຫຼັກ.
 * "ສ້າງ PO ຮ່າງ" = ໜຶ່ງ PO DRAFT ຕໍ່ກຸ່ມ (ຜູ້ສະໜອງ × ສາຂາ × ສະກຸນ) ໃນຄລິກດຽວ; ກຸ່ມທີ່ບໍ່ມີຜູ້ສະໜອງຕ້ອງຕັ້ງລາຍການລາຄາກ່ອນ.
 */
export function ReorderSuggestionsCard({ branchId, onCreated }: { branchId?: string; onCreated?: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useReorderSuggestions(branchId);
  const create = useCreatePurchaseOrder();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="h-[72px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  const groups = data?.groups ?? [];
  const products = data?.totals.products ?? 0;
  const orderable = groups.filter((g) => g.supplierId);

  async function createDrafts() {
    setBusy(true);
    let created = 0;
    try {
      for (const g of orderable) {
        const items = g.items
          // M1 — ຈຳນວນ/ລາຄາເປັນໜ່ວຍຊື້ (suggestedUomQty/uomUnitCost); backend ແປງເປັນໜ່ວຍພື້ນຖານ.
          .map((it) => ({
            productId: it.productId,
            quantity: Number(qty[`${groupKey(g)}|${it.productId}`] ?? it.suggestedUomQty),
            unitCost: it.uomUnitCost,
            uomId: it.uomId,
          }))
          .filter((it) => it.quantity > 0);
        if (!items.length) continue;
        await create.mutateAsync({ branchId: g.branchId, supplierId: g.supplierId!, currency: g.currency as 'LAK' | 'THB' | 'USD', items, status: 'DRAFT' });
        created += 1;
      }
      toast.success(t('inventory.reorder.created', { count: created }));
      setOpen(false);
      setQty({});
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm',
          products > 0 ? 'border-primary/30' : 'border-border',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t('inventory.reorder.title')}</p>
            <p className="text-xs text-muted-foreground">
              {products > 0
                ? t('inventory.reorder.summary', { products, groups: groups.length })
                : t('inventory.reorder.none')}
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" disabled={products === 0} onClick={() => setOpen(true)}>
          <PackagePlus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('inventory.reorder.review')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4 pr-12">
            <DialogTitle>{t('inventory.reorder.title')}</DialogTitle>
            <DialogDescription>{t('inventory.reorder.hint')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto px-6 py-5">
            {groups.map((g) => (
              <div key={groupKey(g)} className="overflow-hidden rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-semibold">{g.supplierName ?? t('inventory.reorder.noSupplier')}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.branchName} · <Amount value={g.total} currency={g.currency} />
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">{t('inventory.col.product')}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t('inventory.reserve.available')}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t('inventory.reserve.onOrder')}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t('inventory.reorder.threshold')}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t('inventory.reorder.qty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => {
                        const k = `${groupKey(g)}|${it.productId}`;
                        return (
                          <tr key={it.productId} className="border-t border-border">
                            <td className="px-3 py-1.5">
                              <p className="font-medium text-foreground">{it.productName}</p>
                              <p className="text-muted-foreground">
                                {it.sku}
                                {it.moq ? ` · MOQ ${it.moq}` : ''} · {t('inventory.reorder.lead', { days: it.leadTimeDays })}
                              </p>
                            </td>
                            <td className={cn('px-3 py-1.5 text-right tabular-nums', it.available < 0 && 'text-destructive')}>
                              {it.available}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{it.onOrder}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{it.threshold}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                className="ml-auto h-8 w-20 text-right"
                                value={qty[k] ?? String(it.suggestedUomQty)}
                                onChange={(e) => setQty((prev) => ({ ...prev, [k]: e.target.value }))}
                                aria-label={t('inventory.reorder.qty')}
                                disabled={!g.supplierId}
                              />
                              {it.uomCode && it.factorToBase !== 1 ? (
                                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                  {it.uomCode} = {(Number(qty[k] ?? it.suggestedUomQty) * it.factorToBase).toLocaleString()} {it.unit}
                                </p>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">
              {groups.length > orderable.length ? t('inventory.reorder.noSupplierHint') : null}
            </p>
            <Button disabled={busy || orderable.length === 0} onClick={createDrafts}>
              {busy ? t('common.saving') : t('inventory.reorder.createDrafts', { count: orderable.length })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
