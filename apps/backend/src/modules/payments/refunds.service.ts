import type {
  AccessTokenPayload,
  CreateRefundInput,
  Paginated,
  PayRefundInput,
  RefundAllocation,
  RefundBillKind,
  RefundListQuery,
  RefundMethod,
  RefundView,
} from '@abcp/shared-types';
import { LOYALTY_POINT_VALUE_LAK } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import { dec, round2, toNum } from '../../utils/money.js';
import { notifyUser } from '../../services/push.js';
import { vientianeDateKey } from '../../utils/dateHelpers.js';
import { deductGiftCardForRefund, restoreGiftCardBalance } from '../gift-cards/gift-cards.service.js';
import { clawbackEarnedPoints, restoreRedeemedPoints } from '../loyalty/loyalty.service.js';
import { assertCashDrawerOpen } from '../payments-treasury/cash-drawer/cash-policy.js';
import { inclusiveTax } from './vat.js';
import { runSerializable } from '../../utils/serializable.js';

/**
 * Wave 10B (H4) — Refund engine.
 *
 *   ຄຳຂໍ (PENDING) → ອະນຸມັດ (APPROVED, ຄົນລະຄົນກັບຜູ້ຂໍ ເວັ້ນ SUPER_ADMIN) → ຈ່າຍອອກ (PAID: ອອກ credit note + ຄືນບັດ/ຄະແນນ
 *   + clawback ຄະແນນ/ຄອມມິດຊັນ). REJECTED ໄດ້ກ່ອນ PAID.
 *
 * ການແຈກຍອດ: ຄືນໄປຕາມ tender ເດີມແບບ "ໃໝ່ສຸດກ່ອນ". ສ່ວນຂອງບັດຂອງຂວັນ/ຄະແນນ ຄືນເຂົ້າ store value ສະເໝີ (ບໍ່ຈ່າຍເປັນເງິນສົດ —
 * ກັນຊ່ອງ cash-out ຂອງມູນຄ່າ store); ສ່ວນເງິນສົດ/QR/ບັດ ຈ່າຍອອກຕາມ `method`.
 *
 * ປະເພດບິນ (`RefundBillKind`):
 *  - SERVICE: ນັດ/ກຸ່ມ. ຄອສ (PACKAGE_CREDIT / ນັດທີ່ໃຊ້ສິດແພັກເກັດ) ຄືນເປັນ "ສິດ 1 ຄັ້ງ" ເຂົ້າແພັກເກັດ (`returnPackageUnit`), ບໍ່ແມ່ນເງິນ.
 *  - GIFT_CARD_SALE: ຄືນໄດ້ບໍ່ເກີນຍອດຄົງເຫຼືອໃນບັດ; ຕອນຈ່າຍ ຫັກອອກຈາກບັດ (ເຫຼືອ 0 → VOID).
 *  - PACKAGE_SALE: ຄືນໄດ້ບໍ່ເກີນມູນຄ່າສ່ວນທີ່ຍັງບໍ່ໄດ້ໃຊ້ (ລາຄາ × ຄັ້ງທີ່ເຫຼືອ/ຄັ້ງທັງໝົດ); ຕອນຈ່າຍ ແພັກເກັດຖືກ VOID.
 * ຄອມມິດຊັນ: ຍັງບໍ່ຈ່າຍ → ຫຼຸດ payoutAmount; ຈ່າຍແລ້ວ → ສ້າງ CommissionClawback ຫັກໃນຮອບເງິນເດືອນເດືອນນີ້.
 */

const REFUND_INCLUDE = {
  payment: {
    select: {
      invoiceNo: true,
      currency: true,
      branchId: true,
      branch: { select: { name: true } },
      appointment: { select: { customer: { select: { name: true } } } },
      bookingGroup: { select: { payer: { select: { name: true } } } },
      giftCardPurchase: { select: { buyer: { select: { name: true } } } },
      packagePurchase: { select: { user: { select: { name: true } } } },
    },
  },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} satisfies Prisma.RefundInclude;
type RefundRow = Prisma.RefundGetPayload<{ include: typeof REFUND_INCLUDE }>;

function toView(r: RefundRow): RefundView {
  const store = toNum(r.storeCreditAmount);
  const allocations = (r.allocations as RefundAllocation[] | null) ?? [];
  return {
    id: r.id,
    paymentId: r.paymentId,
    invoiceNo: r.payment.invoiceNo,
    branchId: r.payment.branchId,
    branchName: r.payment.branch.name,
    customerName:
      r.payment.appointment?.customer.name ??
      r.payment.bookingGroup?.payer.name ??
      r.payment.giftCardPurchase?.buyer?.name ??
      r.payment.packagePurchase?.user?.name ??
      null,
    currency: r.payment.currency,
    amount: toNum(r.amount),
    storeCreditAmount: store,
    totalAmount: toNum(r.amount) + store,
    taxAmount: toNum(r.taxAmount),
    reason: r.reason,
    method: r.method,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy.name,
    approvedById: r.approvedById,
    approvedByName: r.approvedBy?.name ?? null,
    rejectedReason: r.rejectedReason,
    creditNoteNo: r.creditNoteNo,
    providerRef: r.providerRef,
    bankAccountId: r.bankAccountId,
    allocations,
    billKind: r.payment.giftCardPurchase ? 'GIFT_CARD_SALE' : r.payment.packagePurchase ? 'PACKAGE_SALE' : 'SERVICE',
    packageUnitReturned: allocations.some((a) => a.kind === 'PACKAGE'),
    paidAt: r.paidAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function assertBranchScope(auth: AccessTokenPayload, branchId: string): void {
  if (auth.role === 'BRANCH_ADMIN' && auth.branchId !== branchId) {
    throw ApiError.forbidden('ບໍ່ມີສິດຈັດການບິນຂອງສາຂາອື່ນ');
  }
}

async function loadRefund(id: string): Promise<RefundRow> {
  const row = await prisma.refund.findUnique({ where: { id }, include: REFUND_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບຄຳຮ້ອງຄືນເງິນ');
  return row;
}

// ---- allocation ---------------------------------------------------

type TenderRow = { id: string; method: string; amount: Prisma.Decimal; giftCardId: string | null };

/** ຍອດ tender ທີ່ຍັງຄືນໄດ້ = amount − ສ່ວນທີ່ refund ອື່ນ (PENDING/APPROVED/PAID) ຈອງໄວ້ແລ້ວ. */
function remainingByTender(tenders: TenderRow[], reserved: RefundAllocation[]): Map<string, number> {
  const map = new Map(tenders.map((t) => [t.id, toNum(t.amount)]));
  for (const a of reserved) map.set(a.tenderId, (map.get(a.tenderId) ?? 0) - a.amount);
  return map;
}

export function allocateRefund(tenders: TenderRow[], remaining: Map<string, number>, amount: number): RefundAllocation[] {
  let left = amount;
  const out: RefundAllocation[] = [];
  // ໃໝ່ສຸດກ່ອນ; ຂ້າມຄອສ.
  for (const t of [...tenders].reverse()) {
    if (left <= 0) break;
    if (t.method === 'PACKAGE_CREDIT') continue;
    const avail = remaining.get(t.id) ?? 0;
    if (avail <= 0) continue;
    let take = Math.min(left, avail);
    const isPoints = t.method === 'LOYALTY_POINTS';
    if (isPoints) take = Math.floor(take / LOYALTY_POINT_VALUE_LAK) * LOYALTY_POINT_VALUE_LAK;
    if (take <= 0) continue;
    const isStore = isPoints || t.method === 'GIFT_CARD';
    out.push({ tenderId: t.id, method: t.method as RefundAllocation['method'], amount: take, kind: isStore ? 'STORE' : 'PAYOUT' });
    left -= take;
  }
  if (left > 0) {
    throw ApiError.badRequest(
      `ຍອດຄືນ ${left.toLocaleString()} ບໍ່ສາມາດແຈກໄປຕາມວິທີຈ່າຍເດີມໄດ້ (ຄະແນນຄືນເປັນຫຼາຍເທົ່າຂອງ ${LOYALTY_POINT_VALUE_LAK.toLocaleString()} / ຄອສໃຊ້ "ຄືນສິດແພັກເກັດ")`,
    );
  }
  return out;
}

const OPEN_STATUSES = ['PENDING', 'APPROVED', 'PAID'] as const;

function billKindOf(p: { giftCardPurchase: unknown; packagePurchase: unknown }): RefundBillKind {
  return p.giftCardPurchase ? 'GIFT_CARD_SALE' : p.packagePurchase ? 'PACKAGE_SALE' : 'SERVICE';
}

function allocTotal(refunds: Array<{ allocations: Prisma.JsonValue }>, kinds: RefundAllocation['kind'][]): number {
  return round2(
    refunds
      .flatMap((r) => (r.allocations as RefundAllocation[] | null) ?? [])
      .filter((a) => kinds.includes(a.kind))
      .reduce((n, a) => n + a.amount, 0),
  );
}

/** ມູນຄ່າສ່ວນທີ່ຍັງບໍ່ໄດ້ໃຊ້ຂອງແພັກເກັດ = ຍອດບິນ × ຄັ້ງທີ່ເຫຼືອ / ຄັ້ງທັງໝົດ. */
async function unusedPackageValue(db: Prisma.TransactionClient, userPackageId: string, billTotal: number): Promise<number> {
  const items = await db.userPackageItem.findMany({
    where: { userPackageId },
    select: { totalUnits: true, remainingUnits: true },
  });
  const total = items.reduce((n, i) => n + i.totalUnits, 0);
  const remaining = items.reduce((n, i) => n + i.remainingUnits, 0);
  if (total <= 0) return 0;
  return round2((billTotal * remaining) / total);
}

/** `YYYY-MM` ຂອງເດືອນວຽງຈັນປັດຈຸບັນ — ຮອບເງິນເດືອນທີ່ຫັກ CommissionClawback. */
function currentPayrollMonth(): string {
  return vientianeDateKey(new Date()).toISOString().slice(0, 7);
}

// ---- request ------------------------------------------------------

export async function createRefund(auth: AccessTokenPayload, paymentId: string, input: CreateRefundInput): Promise<RefundView> {
  const id = await runSerializable(
    async (tx) => {
      // ລັອກບິນ → 2 ຄຳຂໍພ້ອມກັນ ບໍ່ຈອງ tender ດຽວກັນຊ້ຳ
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          transactions: { where: { status: 'SUCCESS' }, orderBy: { createdAt: 'asc' } },
          refunds: { where: { status: { in: [...OPEN_STATUSES] } } },
          appointment: { select: { id: true, userPackageItemId: true } },
          giftCardPurchase: { select: { id: true, status: true, currentBalance: true } },
          packagePurchase: { select: { id: true, status: true } },
        },
      });
      if (!payment) throw ApiError.notFound('ບໍ່ພົບບິນ');
      assertBranchScope(auth, payment.branchId);
      if (!['FULLY_PAID', 'DEPOSIT_PAID'].includes(payment.paymentStatus)) {
        throw ApiError.badRequest('ຄືນເງິນໄດ້ສະເພາະບິນທີ່ຮັບຊຳລະແລ້ວ');
      }
      const kind = billKindOf(payment);
      const amount = round2(input.amount);

      const reserved = payment.refunds.flatMap((r) => (r.allocations as RefundAllocation[] | null) ?? []);
      const remaining = remainingByTender(payment.transactions, reserved);
      let refundable = round2(
        payment.transactions
          .filter((t) => t.method !== 'PACKAGE_CREDIT')
          .reduce((s, t) => s + Math.max(0, remaining.get(t.id) ?? 0), 0),
      );

      // ບິນຊື້ບັດຂອງຂວັນ: ບໍ່ເກີນຍອດຄົງເຫຼືອໃນບັດ ລົບຄຳຂໍທີ່ຍັງບໍ່ຈ່າຍ (ທີ່ PAID ຖືກຫັກອອກຈາກບັດແລ້ວ).
      if (kind === 'GIFT_CARD_SALE') {
        const card = payment.giftCardPurchase!;
        if (card.status !== 'ACTIVE') throw ApiError.badRequest('ບັດຂອງຂວັນນີ້ບໍ່ໄດ້ໃຊ້ງານຢູ່ (ໃຊ້ໝົດ/ໝົດອາຍຸ/ຍົກເລີກ) — ຄືນເງິນບໍ່ໄດ້');
        const pendingOnCard = allocTotal(payment.refunds.filter((r) => r.status !== 'PAID'), ['STORE', 'PAYOUT']);
        refundable = Math.min(refundable, round2(toNum(card.currentBalance) - pendingOnCard));
      }
      // ບິນຊື້ແພັກເກັດ: ບໍ່ເກີນມູນຄ່າສ່ວນທີ່ຍັງບໍ່ໄດ້ໃຊ້; ຄືນໄດ້ຄັ້ງດຽວ (ແພັກເກັດຖືກຍົກເລີກຕອນຈ່າຍ).
      if (kind === 'PACKAGE_SALE') {
        const pkg = payment.packagePurchase!;
        if (pkg.status !== 'ACTIVE') throw ApiError.badRequest('ແພັກເກັດນີ້ບໍ່ໄດ້ໃຊ້ງານຢູ່ — ຄືນເງິນບໍ່ໄດ້');
        if (payment.refunds.length > 0) throw ApiError.conflict('ບິນແພັກເກັດນີ້ມີຄຳຮ້ອງຄືນເງິນຢູ່ແລ້ວ');
        refundable = Math.min(refundable, await unusedPackageValue(tx, pkg.id, toNum(payment.totalAmount)));
      }
      refundable = Math.max(0, refundable);
      if (amount > refundable + 0.01) {
        throw ApiError.badRequest(`ຄືນໄດ້ສູງສຸດ ${refundable.toLocaleString()} ${payment.currency}`);
      }

      const allocations = amount > 0 ? allocateRefund(payment.transactions, remaining, amount) : [];

      // ຄືນສິດແພັກເກັດ 1 ຄັ້ງ (ບໍ່ແມ່ນເງິນ) — ນັດທີ່ໃຊ້ສິດແພັກເກັດ ຫຼື ມີ tender PACKAGE_CREDIT.
      if (input.returnPackageUnit) {
        if (kind !== 'SERVICE') throw ApiError.badRequest('ຄືນສິດແພັກເກັດໄດ້ສະເພາະບິນຄ່າບໍລິການ');
        const pkgTender = payment.transactions.find((t) => t.method === 'PACKAGE_CREDIT');
        if (!pkgTender && !payment.appointment?.userPackageItemId) {
          throw ApiError.badRequest('ບິນນີ້ບໍ່ໄດ້ໃຊ້ສິດແພັກເກັດ');
        }
        if (reserved.some((a) => a.kind === 'PACKAGE')) throw ApiError.conflict('ສິດແພັກເກັດຂອງບິນນີ້ຖືກຄືນ/ຂໍຄືນໄປແລ້ວ');
        allocations.push({
          tenderId: pkgTender?.id ?? `appt:${payment.appointment!.id}`,
          method: 'PACKAGE_CREDIT',
          amount: pkgTender ? toNum(pkgTender.amount) : 0,
          kind: 'PACKAGE',
        });
      }

      const storeCredit = round2(allocations.filter((a) => a.kind === 'STORE').reduce((s, a) => s + a.amount, 0));
      const payout = round2(allocations.filter((a) => a.kind === 'PAYOUT').reduce((s, a) => s + a.amount, 0));

      // ORIGINAL_TENDER → ເງິນສົດລ້ວນ = CASH, ມີ QR/ບັດ = ໂອນຄືນ; ບໍ່ມີສ່ວນຈ່າຍອອກ = ຄົງ ORIGINAL_TENDER.
      let method: RefundMethod = input.method;
      if (input.method === 'ORIGINAL_TENDER' && payout > 0) {
        method = allocations.filter((a) => a.kind === 'PAYOUT').every((a) => a.method === 'CASH') ? 'CASH' : 'BANK_TRANSFER';
      }

      const taxRate = payment.vatRate ? payment.vatRate.toNumber() : 0;
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount: dec(payout),
          storeCreditAmount: dec(storeCredit),
          taxAmount: dec(inclusiveTax(amount, taxRate)),
          reason: input.reason,
          method,
          status: 'PENDING',
          requestedById: auth.sub,
          allocations: allocations as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return refund.id;
    },
  );
  return toView(await loadRefund(id));
}

// ---- approve / reject --------------------------------------------

export async function approveRefund(auth: AccessTokenPayload, id: string): Promise<RefundView> {
  const row = await loadRefund(id);
  assertBranchScope(auth, row.payment.branchId);
  if (row.requestedById === auth.sub && auth.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('ຜູ້ຂໍຄືນເງິນອະນຸມັດເອງບໍ່ໄດ້ (ແຍກໜ້າທີ່) — ຕ້ອງໃຫ້ຄົນອື່ນ ຫຼື SUPER_ADMIN');
  }
  const claimed = await prisma.refund.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: auth.sub, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw ApiError.conflict('ຄຳຮ້ອງນີ້ບໍ່ຢູ່ໃນສະຖານະລໍອະນຸມັດ');
  return toView(await loadRefund(id));
}

export async function rejectRefund(auth: AccessTokenPayload, id: string, reason: string): Promise<RefundView> {
  const row = await loadRefund(id);
  assertBranchScope(auth, row.payment.branchId);
  const claimed = await prisma.refund.updateMany({
    where: { id, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'REJECTED', rejectedReason: reason, approvedById: auth.sub, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw ApiError.conflict('ຄຳຮ້ອງນີ້ຖືກຈ່າຍ ຫຼື ປະຕິເສດໄປແລ້ວ');
  return toView(await loadRefund(id));
}

// ---- pay ----------------------------------------------------------

export async function payRefund(auth: AccessTokenPayload, id: string, input: PayRefundInput): Promise<RefundView> {
  const pre = await loadRefund(id);
  assertBranchScope(auth, pre.payment.branchId);
  if (toNum(pre.amount) > 0 && pre.method === 'BANK_TRANSFER') {
    if (!input.bankAccountId) throw ApiError.badRequest('ຕ້ອງລະບຸບັນຊີທະນາຄານທີ່ໂອນຄືນອອກ');
    const acct = await prisma.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: { id: true } });
    if (!acct) throw ApiError.notFound('ບໍ່ພົບບັນຊີທະນາຄານ');
  }

  // Wave 10C — ຈ່າຍຄືນເປັນເງິນສົດ ຕ້ອງມີກະລິ້ນຊັກເປີດຢູ່ (ເງິນອອກຈາກລິ້ນຊັກ)
  if (pre.method === 'CASH' && toNum(pre.amount) > 0) await assertCashDrawerOpen(pre.payment.branchId);

  const result = await runSerializable(
    async (tx) => {
      const claimed = await tx.refund.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'PAID', paidAt: new Date(), bankAccountId: input.bankAccountId ?? null, providerRef: input.providerRef ?? null },
      });
      if (claimed.count === 0) throw ApiError.conflict('ຄຳຮ້ອງນີ້ຍັງບໍ່ໄດ້ອະນຸມັດ ຫຼື ຖືກຈ່າຍໄປແລ້ວ');

      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${pre.paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: pre.paymentId },
        include: {
          transactions: { where: { status: 'SUCCESS' } },
          appointment: { select: { id: true, customerId: true, serviceId: true, userPackageItemId: true } },
          bookingGroup: { select: { payerId: true } },
          giftCardPurchase: { select: { id: true, buyerId: true } },
          packagePurchase: { select: { id: true, userId: true } },
        },
      });
      const allocations = (pre.allocations as RefundAllocation[] | null) ?? [];
      const customerId =
        payment.appointment?.customerId ??
        payment.bookingGroup?.payerId ??
        payment.giftCardPurchase?.buyerId ??
        payment.packagePurchase?.userId ??
        null;
      const total = toNum(pre.amount) + toNum(pre.storeCreditAmount);

      // ຄືນເຂົ້າ store value
      for (const a of allocations.filter((x) => x.kind === 'STORE')) {
        const tender = payment.transactions.find((t) => t.id === a.tenderId);
        if (a.method === 'GIFT_CARD') {
          if (!tender?.giftCardId) throw ApiError.badRequest('ບໍ່ພົບບັດຂອງຂວັນຂອງ tender ນີ້');
          await restoreGiftCardBalance(tx, { giftCardId: tender.giftCardId, amount: a.amount, paymentTransactionId: tender.id });
        } else if (a.method === 'LOYALTY_POINTS') {
          if (!customerId) throw ApiError.badRequest('ບິນນີ້ບໍ່ຜູກກັບລູກຄ້າ — ຄືນຄະແນນບໍ່ໄດ້');
          await restoreRedeemedPoints(tx, { userId: customerId, points: Math.round(a.amount / LOYALTY_POINT_VALUE_LAK), refId: `refund:${id}` });
        }
      }

      // ຄືນສິດແພັກເກັດ 1 ຄັ້ງ
      let packageUnitReturned = false;
      if (allocations.some((a) => a.kind === 'PACKAGE')) {
        const itemId = await resolvePackageItemForReturn(tx, payment, allocations);
        const count = await tx.$executeRaw`
          UPDATE "user_package_items" SET "remainingUnits" = "remainingUnits" + 1, "updatedAt" = NOW()
          WHERE "id" = ${itemId} AND "remainingUnits" < "totalUnits"
            AND EXISTS (SELECT 1 FROM "user_packages" up WHERE up."id" = "userPackageId" AND up."status" = 'ACTIVE')`;
        if (count === 0) throw ApiError.conflict('ຄືນສິດແພັກເກັດບໍ່ໄດ້ (ແພັກເກັດຖືກຍົກເລີກ ຫຼື ສິດເຕັມແລ້ວ)');
        packageUnitReturned = true;
      }

      // ບິນຊື້ບັດຂອງຂວັນ → ຫັກມູນຄ່າທີ່ຄືນອອກຈາກບັດ. ບິນຊື້ແພັກເກັດ → ກວດມູນຄ່າທີ່ຍັງບໍ່ໃຊ້ຄືນ ແລ້ວ VOID ແພັກເກັດ.
      if (payment.giftCardPurchase) {
        await deductGiftCardForRefund(tx, { giftCardId: payment.giftCardPurchase.id, amount: total });
      }
      if (payment.packagePurchase) {
        const unused = await unusedPackageValue(tx, payment.packagePurchase.id, toNum(payment.totalAmount));
        if (total > unused + 0.01) {
          throw ApiError.conflict(`ແພັກເກັດຖືກໃຊ້ໄປຕັ້ງແຕ່ຂໍຄືນ — ມູນຄ່າທີ່ຍັງບໍ່ໃຊ້ເຫຼືອ ${unused.toLocaleString()}; ປະຕິເສດແລ້ວຂໍໃໝ່`);
        }
        const voided = await tx.userPackage.updateMany({
          where: { id: payment.packagePurchase.id, status: 'ACTIVE' },
          data: { status: 'VOID' },
        });
        if (voided.count === 0) throw ApiError.conflict('ແພັກເກັດນີ້ບໍ່ໄດ້ໃຊ້ງານຢູ່ແລ້ວ');
        await tx.userPackageItem.updateMany({ where: { userPackageId: payment.packagePurchase.id }, data: { remainingUnits: 0 } });
      }

      const refundedAfter = toNum(payment.refundedAmount) + total;
      const paidTotal = round2(payment.transactions.reduce((s, t) => s + toNum(t.amount), 0));
      const packageTotal = round2(payment.transactions.filter((t) => t.method === 'PACKAGE_CREDIT').reduce((s, t) => s + toNum(t.amount), 0));
      const fully = refundedAfter >= paidTotal - packageTotal - 0.01;

      const creditNoteNo = await nextDocumentNo(tx, payment.branchId, 'CN');
      await tx.refund.update({ where: { id }, data: { creditNoteNo } });
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundedAmount: dec(refundedAfter), ...(fully ? { paymentStatus: 'REFUNDED' as const } : {}) },
      });

      // Clawback: ຄະແນນ EARN + ຄອມມິດຊັນ (ຕາມສັດສ່ວນຍອດຄືນສະສົມ ຕໍ່ຍອດບິນ). ຄືນສິດແພັກເກັດ = ບໍລິການຖືກຍົກເລີກທັງໝົດ.
      const moneyRatio = Math.min(1, refundedAfter / Math.max(1, toNum(payment.totalAmount)));
      if (payment.appointment) {
        await clawbackEarnedPoints(tx, {
          userId: payment.appointment.customerId,
          earnRefId: `appt:${payment.appointment.id}`,
          paymentId: payment.id,
          refundedRatio: moneyRatio,
        });
        const serviceRatio = packageUnitReturned ? 1 : moneyRatio;
        await clawbackCommission(tx, { appointmentId: payment.appointment.id, refundId: id, branchId: payment.branchId, ratio: serviceRatio });
      }
      return { customerId, total, creditNoteNo, currency: payment.currency, packageUnitReturned };
    },
  );

  if (result.customerId) {
    await notifyUser({
      userId: result.customerId,
      type: 'PAYMENT_REFUND',
      title: 'ຄືນເງິນແລ້ວ',
      body:
        result.total > 0
          ? `ຄືນເງິນ ${result.total.toLocaleString()} ${result.currency} (ໃບຄືນເງິນ ${result.creditNoteNo})${result.packageUnitReturned ? ' + ຄືນສິດແພັກເກັດ 1 ຄັ້ງ' : ''}`
          : `ຄືນສິດແພັກເກັດ 1 ຄັ້ງ (ໃບຄືນເງິນ ${result.creditNoteNo})`,
      data: { paymentId: pre.paymentId, refundId: id },
      dedupeKey: `refund:${id}`,
    }).catch(() => undefined);
  }
  return toView(await loadRefund(id));
}

/** ລາຍການແພັກເກັດທີ່ຈະຄືນສິດ: ນັດທີ່ຈອງດ້ວຍສິດແພັກເກັດ ຫຼື ລາຍການບໍລິການດຽວກັນໃນແພັກເກັດຂອງ tender PACKAGE_CREDIT. */
async function resolvePackageItemForReturn(
  tx: Prisma.TransactionClient,
  payment: {
    appointment: { serviceId: string; userPackageItemId: string | null } | null;
    transactions: Array<{ id: string; userPackageId: string | null }>;
  },
  allocations: RefundAllocation[],
): Promise<string> {
  if (payment.appointment?.userPackageItemId) return payment.appointment.userPackageItemId;
  const alloc = allocations.find((a) => a.kind === 'PACKAGE');
  const tender = payment.transactions.find((t) => t.id === alloc?.tenderId);
  if (!tender?.userPackageId || !payment.appointment) throw ApiError.badRequest('ບໍ່ພົບແພັກເກັດທີ່ຈະຄືນສິດ');
  const item = await tx.userPackageItem.findFirst({
    where: { userPackageId: tender.userPackageId, serviceId: payment.appointment.serviceId },
    select: { id: true },
  });
  if (!item) throw ApiError.badRequest('ແພັກເກັດນີ້ບໍ່ມີບໍລິການຂອງນັດນີ້ — ຄືນສິດບໍ່ໄດ້');
  return item.id;
}

/**
 * ຄອມມິດຊັນຂອງນັດທີ່ຖືກຄືນເງິນ: ຄວນເຫຼືອ = ຍອດບໍລິການ × ອັດຕາ × (1 − ratio).
 *  - ຍັງບໍ່ຈ່າຍ → ປັບ payoutAmount ລົງ.
 *  - ຈ່າຍແລ້ວ → ສ່ວນເກີນ (ລົບ clawback ເກົ່າຂອງນັດນີ້) ເປັນ CommissionClawback ຫັກໃນຮອບເງິນເດືອນເດືອນນີ້.
 */
async function clawbackCommission(
  tx: Prisma.TransactionClient,
  params: { appointmentId: string; refundId: string; branchId: string; ratio: number },
): Promise<void> {
  const commission = await tx.staffCommission.findUnique({ where: { appointmentId: params.appointmentId } });
  if (!commission) return;
  const shouldBe = round2(toNum(commission.serviceAmount) * commission.commissionRate * (1 - params.ratio));
  if (!commission.isPaid) {
    await tx.staffCommission.update({ where: { id: commission.id }, data: { payoutAmount: dec(Math.max(0, shouldBe)) } });
    return;
  }
  const prior = await tx.commissionClawback.aggregate({
    where: { appointmentId: params.appointmentId },
    _sum: { amount: true },
  });
  const owed = round2(toNum(commission.payoutAmount) - Math.max(0, shouldBe) - toNum(prior._sum.amount ?? 0));
  if (owed <= 0.009) return;
  await tx.commissionClawback.create({
    data: {
      staffProfileId: commission.staffProfileId,
      appointmentId: params.appointmentId,
      refundId: params.refundId,
      branchId: params.branchId,
      amount: dec(owed),
      monthYear: currentPayrollMonth(),
    },
  });
}

// ---- list ---------------------------------------------------------

export async function listRefunds(auth: AccessTokenPayload, query: RefundListQuery): Promise<Paginated<RefundView>> {
  const branchId = auth.role === 'BRANCH_ADMIN' ? auth.branchId : query.branchId !== 'all' ? query.branchId : undefined;
  const where: Prisma.RefundWhereInput = {
    ...(branchId ? { payment: { branchId } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentId ? { paymentId: query.paymentId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: REFUND_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.refund.count({ where }),
  ]);
  return {
    items: rows.map(toView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
