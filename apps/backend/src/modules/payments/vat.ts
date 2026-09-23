import type { VatSettings } from '@abcp/shared-types';
import { prisma } from '../../config/database.js';
import { round2 } from '../../utils/money.js';

/**
 * Wave 10B — VAT. ສອງແບບ (`VatSettings.mode`):
 *  - INCLUSIVE: ລາຄາລວມ VAT ແລ້ວ: ພາສີ = total × r/(1+r), ມູນຄ່າກ່ອນພາສີ = total − ພາສີ. ຢຸດໄວ້ຕອນອອກເລກ INV.
 *  - EXCLUSIVE: ລາຄາບໍ່ລວມ VAT: ພາສີ = net × r ບວກເທິງລາຄາ ຕອນສ້າງບິນ (`exclusiveBillVat`), ຢຸດໄວ້ໃນບິນທັນທີ.
 * ປ່ຽນອັດຕາ/ແບບ ພາຍຫຼັງ ບໍ່ກະທົບບິນເກົ່າ.
 */
const VAT_KEY = 'finance-vat';
export const DEFAULT_VAT: VatSettings = { enabled: false, rate: 0.1, mode: 'INCLUSIVE' };

export async function getVatSettings(): Promise<VatSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: VAT_KEY } });
  return { ...DEFAULT_VAT, ...((row?.value as Partial<VatSettings> | undefined) ?? {}) };
}

export async function updateVatSettings(input: VatSettings): Promise<VatSettings> {
  await prisma.appSetting.upsert({
    where: { key: VAT_KEY },
    create: { key: VAT_KEY, value: input },
    update: { value: input },
  });
  return input;
}

/** ພາສີທີ່ລວມຢູ່ໃນຍອດ `gross` (ຈຳນວນເຕັມ LAK). */
export function inclusiveTax(gross: number, rate: number): number {
  if (rate <= 0) return 0;
  return round2((gross * rate) / (1 + rate));
}

export function splitVat(gross: number, rate: number): { tax: number; net: number } {
  const tax = inclusiveTax(gross, rate);
  return { tax, net: round2(gross - tax) };
}

/** ພາສີທີ່ບວກເທິງ `net` (ແບບ EXCLUSIVE). */
export function exclusiveTax(net: number, rate: number): number {
  if (rate <= 0) return 0;
  return round2(net * rate);
}

export type FrozenBillVat = {
  total: number;
  vat: { vatRate: number; vatMode: 'EXCLUSIVE'; taxAmount: number; netAmount: number } | null;
};

/**
 * ຕອນສ້າງບິນ: ຖ້າ VAT ເປີດ + ແບບ EXCLUSIVE → ບວກພາສີເທິງລາຄາ ແລະ ຢຸດ rate/tax/net ໄວ້ໃນບິນ.
 * ແບບ INCLUSIVE / ປິດ → ຍອດເທົ່າເດີມ (INCLUSIVE ຈະແຍກພາສີຕອນອອກເລກ INV).
 */
export async function exclusiveBillVat(net: number): Promise<FrozenBillVat> {
  const vat = await getVatSettings();
  if (!vat.enabled || vat.mode !== 'EXCLUSIVE' || vat.rate <= 0 || net <= 0) return { total: net, vat: null };
  const tax = exclusiveTax(net, vat.rate);
  return { total: round2(net + tax), vat: { vatRate: vat.rate, vatMode: 'EXCLUSIVE', taxAmount: tax, netAmount: round2(net) } };
}
