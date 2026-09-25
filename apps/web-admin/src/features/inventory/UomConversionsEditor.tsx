import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UomView } from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

import type { ConversionDraft } from './uom';

/**
 * M1 (inventory 9C) — ອັດຕາແປງຂອງສິນຄ້າ: "1 [ໜ່ວຍ] = [factor] [ໜ່ວຍພື້ນຖານ]" + ໜ່ວຍຊື້/ໜ່ວຍ BOM ເລີ່ມຕົ້ນ (ອັນດຽວ).
 * ເຊັ່ນ ກ່ອງ = 12 ຕຸກ (ຊື້), ml = 0.002 ຕຸກ (ຕຸກ 500 ml — ຂຽນ BOM ເປັນ ml).
 */
export function UomConversionsEditor({
  rows,
  onChange,
  uoms,
  baseUomId,
  baseLabel,
}: {
  rows: ConversionDraft[];
  onChange: (rows: ConversionDraft[]) => void;
  uoms: UomView[];
  baseUomId: string;
  baseLabel: string;
}) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<ConversionDraft>) =>
    onChange(
      rows.map((r, j) => {
        if (j === i) return { ...r, ...patch };
        // default flags ເປັນອັນດຽວຕໍ່ສິນຄ້າ
        return {
          ...r,
          ...(patch.isPurchaseDefault ? { isPurchaseDefault: false } : {}),
          ...(patch.isConsumeDefault ? { isConsumeDefault: false } : {}),
        };
      }),
    );
  const used = new Set(rows.map((r) => r.uomId));
  const options = (current: string) =>
    uoms
      .filter((u) => u.id !== baseUomId && (u.id === current || !used.has(u.id)))
      .map((u) => ({ value: u.id, label: u.nameLo ? `${u.name} · ${u.nameLo}` : u.name }));

  return (
    <div className="space-y-2">
      {rows.length ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[auto_1fr_auto_1fr_auto_auto_auto] items-center gap-x-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span />
            <span>{t('inventory.uom.unit')}</span>
            <span />
            <span>{t('inventory.uom.factor')}</span>
            <span title={t('inventory.uom.purchaseDefaultHint')}>
              {t('inventory.uom.purchaseDefault')}
            </span>
            <span title={t('inventory.uom.consumeDefaultHint')}>
              {t('inventory.uom.consumeDefault')}
            </span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto_1fr_auto_auto_auto] items-center gap-x-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="text-sm text-muted-foreground">1</span>
              <Select
                className="h-8"
                value={r.uomId}
                placeholder={t('inventory.uom.pick')}
                onChange={(e) => set(i, { uomId: e.target.value })}
                options={options(r.uomId)}
                aria-label={t('inventory.uom.unit')}
              />
              <span className="text-sm text-muted-foreground">=</span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={r.factorToBase}
                  onChange={(e) => set(i, { factorToBase: e.target.value })}
                  className="h-8 tabular-nums"
                  aria-label={t('inventory.uom.factor')}
                />
                <span className="shrink-0 text-xs text-muted-foreground">{baseLabel}</span>
              </div>
              <input
                type="radio"
                name="uom-purchase-default"
                checked={r.isPurchaseDefault}
                onChange={() => set(i, { isPurchaseDefault: true })}
                className="mx-auto"
                aria-label={t('inventory.uom.purchaseDefault')}
              />
              <input
                type="radio"
                name="uom-consume-default"
                checked={r.isConsumeDefault}
                onChange={() => set(i, { isConsumeDefault: true })}
                className="mx-auto"
                aria-label={t('inventory.uom.consumeDefault')}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={t('common.delete')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('inventory.uom.noConversions')}</p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 gap-1"
        disabled={!baseUomId}
        onClick={() =>
          onChange([
            ...rows,
            { uomId: '', factorToBase: '', isPurchaseDefault: false, isConsumeDefault: false },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('inventory.uom.addConversion')}
      </Button>
    </div>
  );
}
