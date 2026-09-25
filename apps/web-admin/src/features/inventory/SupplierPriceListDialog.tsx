import { useState } from 'react';
import { ListOrdered, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { SupplierView } from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { NormalizedApiError } from '@/services/apiError';
import { cn } from '@/lib/utils';

import { useDeleteSupplierProduct, useProducts, useSaveSupplierProduct, useSupplierProducts } from './inventory.api';
import { defaultUomId, unitChoices } from './uom';

type Currency = 'LAK' | 'THB' | 'USD';

/**
 * M8 — ລາຍການລາຄາຂອງຜູ້ສະໜອງ (SupplierProduct): ລາຄາ/ໜ່ວຍ, ສະກຸນ, MOQ, lead time, ຜູ້ສະໜອງຫຼັກ.
 * ໃຊ້ prefill ລາຄາຕອນສ້າງ PO ແລະ ຈັດກຸ່ມຄຳແນະນຳ PO (M11).
 */
export function SupplierPriceListDialog({
  supplier,
  canManage,
  onClose,
}: {
  supplier: SupplierView | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useSupplierProducts(supplier?.id ?? null);
  const { data: products } = useProducts({
    page: 1,
    pageSize: 500,
    isActive: 'true',
    branchId: supplier?.branchId ?? undefined,
  });
  const save = useSaveSupplierProduct();
  const del = useDeleteSupplierProduct();

  const [productId, setProductId] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [currency, setCurrency] = useState<Currency>('LAK');
  const [moq, setMoq] = useState('');
  const [leadTime, setLeadTime] = useState('');
  const [preferred, setPreferred] = useState(false);
  // M1 — ໜ່ວຍຊື້ຂອງລາຍການລາຄາ ('' = ພື້ນຖານ) — ລາຄາ + MOQ ເປັນຕໍ່ໜ່ວຍນີ້.
  const [uomId, setUomId] = useState('');
  const selectedProduct = products?.items.find((p) => p.id === productId);

  const reset = () => {
    setProductId('');
    setUnitCost('');
    setMoq('');
    setLeadTime('');
    setPreferred(false);
    setUomId('');
  };
  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  function add() {
    if (!supplier || !productId || unitCost === '') return;
    save.mutate(
      {
        supplierId: supplier.id,
        input: {
          productId,
          unitCost: Number(unitCost),
          currency,
          moq: moq === '' ? null : Number(moq),
          leadTimeDays: leadTime === '' ? null : Number(leadTime),
          isPreferred: preferred,
          uomId: uomId || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          reset();
        },
        onError,
      },
    );
  }

  return (
    <Dialog open={Boolean(supplier)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ListOrdered className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>
              {t('inventory.supplier.priceList')} · {supplier?.name}
            </DialogTitle>
            <DialogDescription>{t('inventory.supplier.priceListHint')}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows && rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('inventory.col.product')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('inventory.col.cost')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('inventory.supplier.moq')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('inventory.supplier.leadTime')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {r.isPreferred ? (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label={t('inventory.supplier.preferred')} />
                          ) : null}
                          <span className="font-medium">{r.productName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {r.sku} · {r.branchName}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.unitCost.toLocaleString()} {r.currency}
                        {r.uomCode && r.factorToBase !== 1 ? (
                          <span className="block text-[11px] text-muted-foreground">
                            / {r.uomCode} (= {r.factorToBase.toLocaleString()} {r.unit})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.moq ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.leadTimeDays ?? supplier?.leadTimeDays ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive"
                            aria-label={t('common.delete')}
                            onClick={() =>
                              supplier &&
                              del.mutate({ supplierId: supplier.id, productId: r.productId }, { onError })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {t('inventory.supplier.priceListEmpty')}
            </p>
          )}

          {canManage && supplier && !supplier.deletedAt ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{t('inventory.supplier.priceListAdd')}</p>
              <Combobox
                value={productId}
                onChange={(v) => {
                  setProductId(v);
                  const existing = rows?.find((r) => r.productId === v);
                  if (existing) {
                    setUnitCost(String(existing.unitCost));
                    setCurrency(existing.currency as Currency);
                    setMoq(existing.moq != null ? String(existing.moq) : '');
                    setLeadTime(existing.leadTimeDays != null ? String(existing.leadTimeDays) : '');
                    setPreferred(existing.isPreferred);
                    setUomId(existing.uomId ?? '');
                  } else {
                    setCurrency((supplier.currency as Currency) ?? 'LAK');
                    setUomId(defaultUomId(products?.items.find((p) => p.id === v), 'purchase'));
                  }
                }}
                placeholder={t('inventory.transfer.searchProduct')}
                searchPlaceholder={t('inventory.transfer.searchProduct')}
                emptyText={t('inventory.transfer.noProductMatch')}
                aria-label={t('inventory.col.product')}
                options={(products?.items ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                  description: `${p.sku} · ${p.branchName}`,
                }))}
              />
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="sp-cost">{t('inventory.col.cost')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sp-cost"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                    />
                    <Select
                      aria-label={t('inventory.supplier.currency')}
                      className="w-24"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as Currency)}
                      options={['LAK', 'THB', 'USD'].map((c) => ({ value: c, label: c }))}
                    />
                    {unitChoices(selectedProduct).length > 1 ? (
                      <Select
                        aria-label={t('inventory.uom.unit')}
                        className="min-w-[120px]"
                        value={uomId}
                        onChange={(e) => setUomId(e.target.value)}
                        options={unitChoices(selectedProduct).map((u) => ({ value: u.value, label: `/ ${u.label}` }))}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-moq">{t('inventory.supplier.moq')}</Label>
                  <Input id="sp-moq" type="number" min={0} step="any" value={moq} onChange={(e) => setMoq(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-lead">{t('inventory.supplier.leadTime')}</Label>
                  <Input
                    id="sp-lead"
                    type="number"
                    min={0}
                    value={leadTime}
                    placeholder={supplier.leadTimeDays != null ? String(supplier.leadTimeDays) : undefined}
                    onChange={(e) => setLeadTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={preferred} onCheckedChange={setPreferred} aria-label={t('inventory.supplier.preferred')} />
                  {t('inventory.supplier.preferred')}
                </label>
                <Button
                  size="sm"
                  className={cn(save.isPending && 'opacity-70')}
                  disabled={!productId || unitCost === '' || save.isPending}
                  onClick={add}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
