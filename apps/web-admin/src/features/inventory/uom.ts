import type { ProductUomConversionInput, ProductUomConversionView } from '@abcp/shared-types';

/**
 * M1 (inventory 9C) — ໜ່ວຍຂອງສິນຄ້າໜຶ່ງ: ໜ່ວຍພື້ນຖານ (value '' = uomId null/base, factor 1) + ອັດຕາແປງ.
 * ຈຳນວນທີ່ເກັບໃນລະບົບເປັນໜ່ວຍພື້ນຖານສະເໝີ — UI ແປງສະເພາະຕອນປ້ອນ/ສະແດງ.
 */
export type UomProductLike = {
  unit: string;
  baseUomId?: string | null;
  conversions?: ProductUomConversionView[];
};

export type UnitChoice = { value: string; code: string; factor: number; label: string };

const fmt = (n: number) =>
  Number(n.toFixed(6)).toLocaleString(undefined, { maximumFractionDigits: 6 });

/** ລາຍການໜ່ວຍໃຫ້ເລືອກ: ພື້ນຖານກ່ອນ ແລ້ວອັດຕາແປງ ("box (= 12 ຕຸກ)"). */
export function unitChoices(p: UomProductLike | null | undefined): UnitChoice[] {
  if (!p) return [];
  const base: UnitChoice = { value: '', code: p.unit, factor: 1, label: p.unit };
  const rest = (p.conversions ?? []).map((c) => ({
    value: c.uomId,
    code: c.code,
    factor: c.factorToBase,
    label: `${c.nameLo || c.name} (= ${fmt(c.factorToBase)} ${p.unit})`,
  }));
  return [base, ...rest];
}

/** ອັດຕາຂອງໜ່ວຍທີ່ເລືອກ ('' / null / baseUomId = 1). */
export function factorOf(
  p: UomProductLike | null | undefined,
  uomId: string | null | undefined,
): number {
  if (!p || !uomId || uomId === p.baseUomId) return 1;
  return p.conversions?.find((c) => c.uomId === uomId)?.factorToBase ?? 1;
}

/** ໜ່ວຍເລີ່ມຕົ້ນຕອນສັ່ງຊື້ / ຂຽນ BOM ('' = ພື້ນຖານ). */
export function defaultUomId(
  p: UomProductLike | null | undefined,
  kind: 'purchase' | 'consume',
): string {
  const c = p?.conversions?.find((x) =>
    kind === 'purchase' ? x.isPurchaseDefault : x.isConsumeDefault,
  );
  return c?.uomId ?? '';
}

/** ຂໍ້ຄວາມ "= N ໜ່ວຍພື້ນຖານ" ຂອງຈຳນວນທີ່ປ້ອນ. */
export function baseEquivalent(qty: number, factor: number, baseUnit: string): string {
  return `= ${fmt(qty * factor)} ${baseUnit}`;
}

export type ConversionDraft = {
  uomId: string;
  factorToBase: string;
  isPurchaseDefault: boolean;
  isConsumeDefault: boolean;
};

export function conversionsPayload(rows: ConversionDraft[]): ProductUomConversionInput[] {
  return rows
    .filter((r) => r.uomId && Number(r.factorToBase) > 0)
    .map((r) => ({
      uomId: r.uomId,
      factorToBase: Number(r.factorToBase),
      isPurchaseDefault: r.isPurchaseDefault,
      isConsumeDefault: r.isConsumeDefault,
    }));
}

export { fmt as fmtQty };
