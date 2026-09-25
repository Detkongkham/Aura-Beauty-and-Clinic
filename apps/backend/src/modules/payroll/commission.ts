import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

/**
 * ໂມດູນ 09 — ກົດຄ່າຄອມມິດຊັນທີ່ໃຊ້ຮ່ວມກັນ (docs/payroll-audit.md C2 + G4.1).
 *
 * - ຖານຄ່າຄອມ = ຍອດນັດ − ຄ່າເດີນທາງ (Home Service): ຊ່າງບໍ່ໄດ້ % ຈາກຄ່ານ້ຳມັນ.
 * - ອັດຕາ = `ServiceCommissionRule` ຂອງບໍລິການ (ຖ້າມີ) ບໍ່ດັ່ງນັ້ນ `StaffProfile.commissionRate` (G1.8).
 * - ຄ່າຄອມ "ເກີດ" ຕອນປິດຄິວ (accrued) ແຕ່ **ຈ່າຍໄດ້ສະເພາະເມື່ອເກັບເງິນບິນຄົບແລ້ວ**
 *   (ປິດໄດ້ດ້ວຍ AppSetting `payroll.commissionRequiresCollection` = false).
 */

type Tx = Prisma.TransactionClient;

export const COMMISSION_COLLECTION_SETTING_KEY = 'payroll.commissionRequiresCollection';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function commissionBasis(totalAmount: Prisma.Decimal | number, travelFee: Prisma.Decimal | number): number {
  const total = typeof totalAmount === 'number' ? totalAmount : totalAmount.toNumber();
  const fee = typeof travelFee === 'number' ? travelFee : travelFee.toNumber();
  return round2(Math.max(0, total - fee));
}

/**
 * ບັນທຶກ/ປັບຄ່າຄອມຂອງນັດທີ່ COMPLETED (idempotent ຕໍ່ appointmentId).
 * ແຖວທີ່ຈ່າຍແລ້ວບໍ່ຖືກແກ້ — ການປ່ຽນຍອດຫຼັງຈ່າຍໄປຜ່ານ clawback ຂອງ refund ເທົ່ານັ້ນ.
 */
export async function accrueCommission(tx: Tx, appointmentId: string): Promise<void> {
  const appt = await tx.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      staffProfileId: true,
      serviceId: true,
      totalAmount: true,
      travelFee: true,
      staffProfile: { select: { commissionRate: true } },
      commission: { select: { isPaid: true } },
    },
  });
  if (appt.commission?.isPaid) return;
  // G1.8 — ອັດຕາຕໍ່ບໍລິການ (ຖ້າຕັ້ງໄວ້) ທັບອັດຕາຂອງພະນັກງານ.
  const rule = await tx.serviceCommissionRule.findUnique({ where: { serviceId: appt.serviceId }, select: { rate: true } });
  const rate = rule?.rate ?? appt.staffProfile.commissionRate;
  const basis = commissionBasis(appt.totalAmount, appt.travelFee);
  const data = {
    serviceAmount: new Prisma.Decimal(basis.toFixed(2)),
    commissionRate: rate,
    payoutAmount: new Prisma.Decimal(round2(basis * rate).toFixed(2)),
  };
  await tx.staffCommission.upsert({
    where: { appointmentId },
    update: data,
    create: { appointmentId, staffProfileId: appt.staffProfileId, ...data },
  });
}

export async function commissionRequiresCollection(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: COMMISSION_COLLECTION_SETTING_KEY } });
  if (row == null) return true;
  const v = row.value as unknown;
  if (typeof v === 'boolean') return v;
  if (v && typeof v === 'object' && 'enabled' in v) return Boolean((v as { enabled: unknown }).enabled);
  return true;
}

/** ບິນທີ່ນັບວ່າ "ເກັບເງິນແລ້ວ": ຈ່າຍຄົບ ຫຼື ຈ່າຍຄົບແລ້ວຄືນເງິນ (ຄອມຖືກປັບໂດຍ clawback ແລ້ວ). */
const SETTLED_STATUSES = ['FULLY_PAID', 'REFUNDED'] as const;

/**
 * ເງື່ອນໄຂ Prisma ຂອງນັດທີ່ເກັບເງິນແລ້ວ — ຄູ່ກັບ `isAppointmentCollected` (ຕ້ອງໃຫ້ຜົນດຽວກັນ).
 * ນັດທີ່ໃຊ້ສິດແພັກເກັດ ຫຼື ຍອດ 0 ບໍ່ມີເງິນຕ້ອງເກັບ.
 */
export const COLLECTED_APPOINTMENT_WHERE: Prisma.AppointmentWhereInput = {
  OR: [
    { payment: { paymentStatus: { in: [...SETTLED_STATUSES] } } },
    { bookingGroup: { payments: { some: { paymentStatus: { in: [...SETTLED_STATUSES] } } } } },
    { userPackageItemId: { not: null } },
    { totalAmount: { lte: 0 } },
  ],
};

export const COLLECTION_SELECT = {
  totalAmount: true,
  userPackageItemId: true,
  payment: { select: { paymentStatus: true } },
  bookingGroup: { select: { payments: { select: { paymentStatus: true } } } },
} satisfies Prisma.AppointmentSelect;

type CollectionFields = {
  totalAmount: Prisma.Decimal;
  userPackageItemId: string | null;
  payment: { paymentStatus: string } | null;
  bookingGroup: { payments: Array<{ paymentStatus: string }> } | null;
};

export function isAppointmentCollected(a: CollectionFields): boolean {
  const settled = (s: string) => (SETTLED_STATUSES as readonly string[]).includes(s);
  if (a.payment && settled(a.payment.paymentStatus)) return true;
  if (a.bookingGroup?.payments.some((p) => settled(p.paymentStatus))) return true;
  if (a.userPackageItemId) return true;
  return a.totalAmount.toNumber() <= 0;
}
