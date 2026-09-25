import { prisma } from '../config/database.js';
import { ApiError } from './ApiError.js';

/**
 * E1 / M10 — 1 ໜ່ວຍ `currency` = ? LAK. ໃຊ້ຄ່າທີ່ຜູ້ໃຊ້ໃສ່ ຖ້າມີ; ບໍ່ດັ່ງນັ້ນອັດຕາບັນທຶກບັນຊີ (ExchangeRate,
 * ຕັ້ງໃນການຕັ້ງຄ່າລາຍຈ່າຍ). ໃຊ້ຮ່ວມກັນລະຫວ່າງລາຍຈ່າຍ (Expense) ແລະ ໃບສັ່ງຊື້ (PurchaseOrder).
 */
export async function resolveFxRate(currency: string, override?: number | null): Promise<number> {
  if (currency === 'LAK') return 1;
  if (override != null) return override;
  const r = await prisma.exchangeRate.findUnique({
    where: { baseCurrency_targetCurrency: { baseCurrency: currency, targetCurrency: 'LAK' } },
  });
  if (!r) throw ApiError.badRequest(`ຍັງບໍ່ໄດ້ຕັ້ງອັດຕາ ${currency} → LAK — ໃສ່ອັດຕາເອງ ຫຼື ຕັ້ງໃນການຕັ້ງຄ່າລາຍຈ່າຍ`);
  return r.rate.toNumber();
}
