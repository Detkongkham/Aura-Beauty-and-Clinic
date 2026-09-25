import type { Prisma } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { dec, round2, toNum } from '../../utils/money.js';
import { getFinancePolicy } from './policy.js';

/**
 * Wave 11 (F-20) — ຢຶດມັດຈຳເປັນຄ່າປັບ no-show / ຍົກເລີກຊ້າ.
 *
 * ກ່ອນໜ້ານີ້ມັດຈຳຖືກ "ຢຶດໂດຍປະລິຍາຍ" (ບໍ່ມີໃຜຄືນ ແຕ່ກໍບໍ່ມີບັນທຶກ) → ບັນຊີຍັງຖືເປັນໜີ້ສິນຕໍ່ລູກຄ້າຕະຫຼອດ.
 * ດຽວນີ້ບັນທຶກ `Payment.forfeitedAmount` = % ຂອງມັດຈຳທີ່ຈ່າຍແລ້ວ (ຕາມ `finance.policy`), ຮັບຮູ້ເປັນລາຍຮັບ
 * ຄ່າປັບໃນ journal ແລະ ຫັກອອກຈາກຍອດທີ່ຄືນເງິນໄດ້. ສ່ວນທີ່ເຫຼືອ ພະນັກງານຄືນຜ່ານ refund engine ຕາມປົກກະຕິ.
 *
 * - ໃຊ້ສະເພາະບິນທີ່ຍັງບໍ່ອອກໃບຮັບເງິນ (DEPOSIT_PAID / PENDING ທີ່ມີການຈ່າຍ) — ບິນທີ່ FULLY_PAID ແລ້ວຖືກ
 *   ຮັບຮູ້ເປັນລາຍຮັບໄປແລ້ວ ການຢຶດຈະນັບຊ້ຳ.
 * - Idempotent: ບິນທີ່ມີ forfeitedAmount > 0 ແລ້ວ ຂ້າມ.
 * - ຄືນ 0 ເມື່ອບໍ່ມີຫຍັງຢຶດ.
 */
export async function applyCancellationFee(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  kind: 'NO_SHOW' | 'LATE_CANCEL',
): Promise<number> {
  const payment = await tx.payment.findUnique({
    where: { appointmentId },
    select: {
      id: true,
      invoiceNo: true,
      paymentStatus: true,
      depositAmount: true,
      forfeitedAmount: true,
      refundedAmount: true,
      transactions: { where: { status: 'SUCCESS' }, select: { amount: true, method: true } },
    },
  });
  if (!payment || payment.invoiceNo) return 0;
  if (!['DEPOSIT_PAID', 'PENDING'].includes(payment.paymentStatus)) return 0;
  if (toNum(payment.forfeitedAmount) > 0) return 0;

  const policy = await getFinancePolicy();
  const pct = kind === 'NO_SHOW' ? policy.noShowFeePercent : policy.lateCancelFeePercent;
  if (pct <= 0) return 0;

  // ສິດແພັກເກັດບໍ່ແມ່ນເງິນ → ບໍ່ນັບເປັນມັດຈຳທີ່ຢຶດໄດ້.
  const paid = round2(
    payment.transactions.filter((t) => t.method !== 'PACKAGE_CREDIT').reduce((s, t) => s + toNum(t.amount), 0) -
      toNum(payment.refundedAmount),
  );
  const base = Math.min(paid, toNum(payment.depositAmount) > 0 ? toNum(payment.depositAmount) : paid);
  const fee = round2((Math.max(0, base) * pct) / 100);
  if (fee <= 0) return 0;

  await tx.payment.update({
    where: { id: payment.id },
    data: { forfeitedAmount: dec(fee), forfeitKind: kind, forfeitedAt: new Date() },
  });
  logger.info({ appointmentId, paymentId: payment.id, kind, fee }, 'deposit forfeited as cancellation fee');
  return fee;
}

/** ຍົກເລີກຊ້າ = ຍົກເລີກຫຼັງເສັ້ນຕາຍ (ເວລານັດ − cancellationWindowHours). */
export function isLateCancel(startAt: Date, windowHours: number, now = new Date()): boolean {
  return now.getTime() >= startAt.getTime() - windowHours * 3_600_000;
}
