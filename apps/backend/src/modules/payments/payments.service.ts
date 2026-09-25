import type {
  AddTendersInput,
  CreatePaymentInput,
  DepositIntentInput,
  DepositIntentView,
  FinanceSummaryView,
  Paginated,
  PaymentListQuery,
  PaymentTenderInput,
  PaymentTransactionView,
  PaymentView,
  SettleMockInput,
} from '@abcp/shared-types';
import type { AccessTokenPayload } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { syncAppointmentReservations } from '../inventory/reservation.service.js';
import { onRetailPaymentSettled } from '../inventory/retail-stock.service.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { tsParam } from '../../utils/dateHelpers.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import { dec, round2, toNum } from '../../utils/money.js';
import {
  DEPOSIT_INTENT_TTL_MINUTES,
  DEPOSIT_RATE_SETTING_KEY,
} from '../../constants/phase5.js';
import { createBcelQrIntent, stripeMockCharge } from '../../services/paymentGateway.js';
import { notifyUser } from '../../services/push.js';
import { activatePurchasedGiftCard, redeemGiftCard } from '../gift-cards/gift-cards.service.js';
import { earnPoints, redeemPoints } from '../loyalty/loyalty.service.js';
import { activatePurchasedPackage } from '../packages/packages.service.js';
import { assertCashDrawerOpen } from '../payments-treasury/cash-drawer/cash-policy.js';
import { exclusiveBillVat, getVatSettings, splitVat } from './vat.js';
import { runSerializable } from '../../utils/serializable.js';
import { getFinancePolicy } from '../finance-ledger/policy.js';

// ---- deposit rate ---------------------------------------------------

export async function getDepositRate(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: DEPOSIT_RATE_SETTING_KEY } });
  const raw = typeof row?.value === 'number' ? row.value : Number((row?.value as { rate?: number })?.rate);
  const rate = Number.isFinite(raw) ? Number(raw) : env.DEPOSIT_RATE_DEFAULT;
  return Math.min(0.5, Math.max(0.2, rate));
}

// ---- bill resolution ----------------------------------------------

type BillContext = {
  branchId: string;
  appointmentId: string | null;
  bookingGroupId: string | null;
  total: number;
  customerId: string | null;
};

async function resolveBill(input: CreatePaymentInput): Promise<BillContext> {
  if (input.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, deletedAt: null },
      select: { id: true, branchId: true, customerId: true, totalAmount: true, travelFee: true },
    });
    if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
    return {
      branchId: appt.branchId,
      appointmentId: appt.id,
      bookingGroupId: null,
      total: toNum(appt.totalAmount) + toNum(appt.travelFee),
      customerId: appt.customerId,
    };
  }
  const group = await prisma.bookingGroup.findUnique({
    where: { id: input.bookingGroupId! },
    select: { id: true, branchId: true, payerId: true, totalAmount: true },
  });
  if (!group) throw ApiError.notFound('ບໍ່ພົບການຈອງກຸ່ມ');
  return {
    branchId: group.branchId,
    appointmentId: null,
    bookingGroupId: group.id,
    total: toNum(group.totalAmount),
    customerId: group.payerId,
  };
}

// ---- views -------------------------------------------------------

const PAYMENT_INCLUDE = {
  branch: { select: { name: true } },
  appointment: { select: { customer: { select: { name: true } } } },
  bookingGroup: { select: { payer: { select: { name: true } } } },
  // ບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ ບໍ່ມີ appointment — ໃຊ້ຊື່ຜູ້ຊື້ ເພື່ອໃຫ້ພະນັກງານຊອກບິນຮັບເງິນສົດໄດ້.
  giftCardPurchase: { select: { buyer: { select: { name: true } } } },
  packagePurchase: { select: { user: { select: { name: true } } } },
  // M13 — ບິນຂາຍສິນຄ້າໜ້າຮ້ານ (ລູກຄ້າບໍ່ບັງຄັບ).
  retailSale: { select: { customer: { select: { name: true } } } },
  transactions: { orderBy: { createdAt: 'asc' } },
  gratuities: { select: { amount: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function toTxView(t: PaymentRow['transactions'][number]): PaymentTransactionView {
  return {
    id: t.id,
    method: t.method,
    amount: toNum(t.amount),
    currency: t.currency,
    status: t.status,
    qrReference: t.qrReference,
    createdAt: t.createdAt.toISOString(),
  };
}

function toView(p: PaymentRow): PaymentView {
  const paidAmount = round2(
    p.transactions.filter((t) => t.status === 'SUCCESS').reduce((s, t) => s + toNum(t.amount), 0),
  );
  const total = toNum(p.totalAmount);
  return {
    id: p.id,
    branchId: p.branchId,
    branchName: p.branch.name,
    appointmentId: p.appointmentId,
    bookingGroupId: p.bookingGroupId,
    customerName:
      p.appointment?.customer.name ??
      p.bookingGroup?.payer.name ??
      p.giftCardPurchase?.buyer?.name ??
      p.packagePurchase?.user?.name ??
      p.retailSale?.customer?.name ??
      null,
    totalAmount: total,
    depositAmount: toNum(p.depositAmount),
    paidAmount,
    balanceAmount: round2(Math.max(0, total - paidAmount)),
    currency: p.currency,
    paymentStatus: p.paymentStatus,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    transactions: p.transactions.map(toTxView),
    invoiceNo: p.invoiceNo,
    vatRate: p.vatRate ? p.vatRate.toNumber() : null,
    vatMode: p.vatMode,
    taxAmount: p.taxAmount ? toNum(p.taxAmount) : null,
    netAmount: p.netAmount ? toNum(p.netAmount) : null,
    refundedAmount: toNum(p.refundedAmount),
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason,
    serviceChargeRate: p.serviceChargeRate ? p.serviceChargeRate.toNumber() : null,
    serviceChargeAmount: toNum(p.serviceChargeAmount),
    forfeitedAmount: toNum(p.forfeitedAmount),
    forfeitKind: p.forfeitKind,
    forfeitedAt: p.forfeitedAt?.toISOString() ?? null,
    gratuityAmount: round2(p.gratuities.reduce((s, g) => s + toNum(g.amount), 0)),
  };
}

async function loadView(id: string): Promise<PaymentView> {
  const row = await prisma.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບບິນ');
  return toView(row);
}

function assertCanAccess(auth: AccessTokenPayload, customerId: string | null): void {
  if (auth.role === 'SUPER_ADMIN' || auth.role === 'BRANCH_ADMIN' || auth.role === 'STAFF') return;
  if (customerId && auth.sub === customerId) return;
  throw ApiError.forbidden('ບໍ່ມີສິດເຂົ້າເຖິງບິນນີ້');
}

// ---- create / get ----------------------------------------------

export async function createPayment(
  auth: AccessTokenPayload,
  input: CreatePaymentInput,
): Promise<PaymentView> {
  const bill = await resolveBill(input);
  assertCanAccess(auth, bill.customerId);

  if (bill.appointmentId) {
    const existing = await prisma.payment.findUnique({
      where: { appointmentId: bill.appointmentId },
      include: PAYMENT_INCLUDE,
    });
    if (existing) return toView(existing);
  }

  // Wave 11 (F-19) — ຄ່າບໍລິການ % (ຖ້າເປີດ) ບວກເທິງລາຄາບໍລິການ ກ່ອນຄິດ VAT; ຢຸດອັດຕາໄວ້ໃນບິນ.
  const scPercent = (await getFinancePolicy()).serviceChargePercent;
  const serviceCharge = scPercent > 0 ? round2((bill.total * scPercent) / 100) : 0;

  // VAT ແບບ EXCLUSIVE: ລາຄາບໍລິການບໍ່ລວມພາສີ → ບວກພາສີເທິງຍອດ ແລະ ຢຸດໄວ້ໃນບິນ; ມັດຈຳຄິດຈາກຍອດລວມພາສີ.
  const { total, vat } = await exclusiveBillVat(round2(bill.total + serviceCharge));
  const rate = input.depositRate ?? (await getDepositRate());
  const deposit = round2(total * rate);

  const created = await prisma.payment.create({
    data: {
      branchId: bill.branchId,
      appointmentId: bill.appointmentId,
      bookingGroupId: bill.bookingGroupId,
      totalAmount: dec(total),
      depositAmount: dec(deposit),
      paymentStatus: 'PENDING',
      ...(serviceCharge > 0 ? { serviceChargeRate: scPercent / 100, serviceChargeAmount: dec(serviceCharge) } : {}),
      ...(vat
        ? { vatRate: vat.vatRate, vatMode: vat.vatMode, taxAmount: dec(vat.taxAmount), netAmount: dec(vat.netAmount) }
        : {}),
    },
    include: PAYMENT_INCLUDE,
  });
  return toView(created);
}

export async function getPayment(id: string, auth: AccessTokenPayload): Promise<PaymentView> {
  const row = await prisma.payment.findUnique({
    where: { id },
    include: {
      ...PAYMENT_INCLUDE,
      appointment: { select: { customerId: true, customer: { select: { name: true } } } },
      bookingGroup: { select: { payerId: true, payer: { select: { name: true } } } },
      // Wave 10A — ບິນຊື້ບັດຂອງຂວັນເອງ (self-purchase) ບໍ່ຜູກ appointment/bookingGroup, ຕ້ອງໃຫ້
      // ຜູ້ຊື້ (buyer) ເຂົ້າເຖິງໄດ້ດ້ວຍ.
      giftCardPurchase: { select: { buyerId: true, buyer: { select: { name: true } } } },
      // ບິນຊື້ແພັກເກັດເອງ — ຜູ້ຊື້ເຂົ້າເຖິງໄດ້.
      packagePurchase: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບບິນ');
  assertCanAccess(
    auth,
    row.appointment?.customerId ??
      row.bookingGroup?.payerId ??
      row.giftCardPurchase?.buyerId ??
      row.packagePurchase?.userId ??
      null,
  );
  return toView(row as unknown as PaymentRow);
}

/** GET /payments/by-appointment/:appointmentId — ໃຫ້ mobile ຫາບິນ. */
export async function getByAppointment(
  appointmentId: string,
  auth: AccessTokenPayload,
): Promise<PaymentView | null> {
  const row = await prisma.payment.findUnique({
    where: { appointmentId },
    include: {
      ...PAYMENT_INCLUDE,
      appointment: { select: { customerId: true, customer: { select: { name: true } } } },
    },
  });
  if (!row) return null;
  assertCanAccess(auth, row.appointment?.customerId ?? null);
  return toView(row as unknown as PaymentRow);
}

// ---- deposit intent (mock gateway) ---------------------------

export async function createDepositIntent(
  id: string,
  auth: AccessTokenPayload,
  input: DepositIntentInput,
): Promise<DepositIntentView> {
  const payment = await getPayment(id, auth);
  const remaining = payment.balanceAmount;
  const amount = Math.min(
    remaining,
    Math.max(payment.depositAmount - payment.paidAmount, 0) || remaining,
  );
  if (amount <= 0) throw ApiError.badRequest('ບິນນີ້ຈ່າຍຄົບແລ້ວ');

  const intent = createBcelQrIntent({
    amount,
    currency: payment.currency,
    ttlMinutes: DEPOSIT_INTENT_TTL_MINUTES,
    billId: payment.id,
  });

  // pending transaction — settle-mock (ຫຼື webhook ຈິງ) ຈະ flip ເປັນ SUCCESS. Wave 10A (ອຸດ H1):
  // ເກັບ expiresAt ໄວ້ໃນ DB ເອງ (ບໍ່ໄວ້ໃຈ client) ເພື່ອໃຫ້ settle ຫຼັງໝົດອາຍຸບໍ່ໄດ້.
  await prisma.paymentTransaction.create({
    data: {
      paymentId: id,
      method: input.method,
      amount: dec(amount),
      currency: payment.currency,
      qrReference: intent.qrReference,
      status: 'PENDING',
      expiresAt: intent.expiresAt,
    },
  });

  return {
    paymentId: id,
    method: input.method,
    amount,
    currency: payment.currency,
    qrReference: intent.qrReference,
    qrPayload: intent.qrPayload,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

/**
 * POST /payments/:id/settle-mock — demo: ຢືນຢັນ QR/charge reference ວ່າຈ່າຍແລ້ວ.
 * Wave 10A (ອຸດ C4): ນີ້ຄືການຢືນຢັນເອງ (ບໍ່ມີ webhook ຈິງຈາກ PSP) — ຫ້າມເປີດໃຫ້ໃຊ້ໃນ production
 * ຈົນກວ່າຈະຕໍ່ webhook ຈິງພ້ອມ HMAC signature verification.
 */
export async function settleMock(
  id: string,
  auth: AccessTokenPayload,
  input: SettleMockInput,
): Promise<PaymentView> {
  if (env.isProd) {
    throw ApiError.forbidden('settle-mock ຖືກປິດໃນ production — ຕ້ອງໃຊ້ webhook ຈິງ');
  }
  await getPayment(id, auth);
  const tx = await prisma.paymentTransaction.findFirst({
    where: { paymentId: id, qrReference: input.qrReference, status: 'PENDING' },
    select: { id: true, expiresAt: true },
  });
  if (!tx) throw ApiError.notFound('ບໍ່ພົບລາຍການທີ່ຄ້າງຢືນຢັນ');
  if (tx.expiresAt && tx.expiresAt.getTime() < Date.now()) {
    await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { status: 'EXPIRED' } });
    throw ApiError.badRequest('QR ນີ້ໝົດອາຍຸແລ້ວ, ກະລຸນາຂໍໃໝ່');
  }
  await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { status: 'SUCCESS' } });
  return recomputeAndSettle(id);
}

// ---- split tender --------------------------------------------

async function applyTender(
  tx: Prisma.TransactionClient,
  ctx: { paymentId: string; currency: string; customerId: string | null },
  tender: PaymentTenderInput,
): Promise<void> {
  const base = {
    paymentId: ctx.paymentId,
    method: tender.method,
    currency: ctx.currency,
    amount: dec(tender.amount),
  };

  switch (tender.method) {
    case 'CASH':
      await tx.paymentTransaction.create({ data: { ...base, status: 'SUCCESS' } });
      return;

    case 'BCEL_ONE_QR':
      await tx.paymentTransaction.create({
        data: { ...base, status: 'SUCCESS', qrReference: tender.qrReference ?? null },
      });
      return;

    case 'CREDIT_CARD': {
      const result = stripeMockCharge({
        amount: tender.amount,
        currency: ctx.currency,
        cardToken: tender.cardToken ?? '',
      });
      if (!result.ok) throw ApiError.badRequest(`ບັດຖືກປະຕິເສດ (${result.reason})`);
      await tx.paymentTransaction.create({
        data: { ...base, status: 'SUCCESS', qrReference: result.reference },
      });
      return;
    }

    case 'GIFT_CARD': {
      if (!tender.giftCardCode) throw ApiError.badRequest('ຕ້ອງລະບຸລະຫັດບັດຂອງຂວັນ');
      const created = await tx.paymentTransaction.create({ data: { ...base, status: 'SUCCESS' } });
      await redeemGiftCard(tx, {
        code: tender.giftCardCode,
        amount: tender.amount,
        redeemedByUserId: ctx.customerId ?? undefined,
        paymentTransactionId: created.id,
      });
      await tx.paymentTransaction.update({
        where: { id: created.id },
        data: { giftCard: { connect: { code: tender.giftCardCode.trim().toUpperCase() } } },
      });
      return;
    }

    case 'LOYALTY_POINTS': {
      if (!ctx.customerId) throw ApiError.badRequest('ບິນນີ້ບໍ່ຜູກກັບລູກຄ້າ');
      if (!tender.loyaltyPoints) throw ApiError.badRequest('ຕ້ອງລະບຸຈຳນວນຄະແນນ');
      const created = await tx.paymentTransaction.create({ data: { ...base, status: 'SUCCESS' } });
      const value = await redeemPoints(tx, {
        userId: ctx.customerId,
        points: tender.loyaltyPoints,
        refId: ctx.paymentId,
        paymentTransactionId: created.id,
      });
      if (round2(value) < tender.amount) {
        throw ApiError.badRequest('ມູນຄ່າຄະແນນທີ່ແລກໜ້ອຍກວ່າຈຳນວນທີ່ລະບຸ');
      }
      return;
    }

    case 'PACKAGE_CREDIT': {
      if (!tender.userPackageId) throw ApiError.badRequest('ຕ້ອງລະບຸ userPackageId');
      const pkg = await tx.userPackage.findFirst({
        where: {
          id: tender.userPackageId,
          status: 'ACTIVE',
          expireDate: { gt: new Date() },
          ...(ctx.customerId ? { userId: ctx.customerId } : {}),
        },
        select: { id: true },
      });
      if (!pkg) throw ApiError.badRequest('ບໍ່ພົບຄອສ (package) ຂອງລູກຄ້າ');
      await tx.paymentTransaction.create({
        data: { ...base, status: 'SUCCESS', userPackageId: pkg.id },
      });
      return;
    }

    default:
      throw ApiError.badRequest('ວິທີຊຳລະບໍ່ຮອງຮັບ');
  }
}

/**
 * ວິທີຈ່າຍທີ່ລູກຄ້າບັນທຶກເອງໄດ້ — ສະເພາະທີ່ server ກວດຍອດໄດ້ຈິງ (ບັດຂອງຂວັນ / ຄະແນນ / ແພັກເກັດ).
 * CASH ແລະ BCEL_ONE_QR ແບບ tender = "ຢືນຢັນເອງ" (ບໍ່ມີຫຼັກຖານຮັບເງິນ) → ພະນັກງານເທົ່ານັ້ນ;
 * QR ຂອງລູກຄ້າຕ້ອງຜ່ານ deposit-intent → settle. CREDIT_CARD ຍັງເປັນ mock gateway ທີ່ຜ່ານທຸກ token
 * `tok_*` → ເປີດໃຫ້ລູກຄ້າສະເພາະນອກ production (ຄືກັບ settle-mock).
 */
const CUSTOMER_TENDER_METHODS: ReadonlySet<string> = new Set([
  'GIFT_CARD',
  'LOYALTY_POINTS',
  'PACKAGE_CREDIT',
]);
const STAFF_ROLES: ReadonlySet<string> = new Set(['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF']);

function assertTenderMethodsAllowed(auth: AccessTokenPayload, input: AddTendersInput): void {
  if (STAFF_ROLES.has(auth.role)) return;
  for (const t of input.tenders) {
    if (CUSTOMER_TENDER_METHODS.has(t.method)) continue;
    if (t.method === 'CREDIT_CARD' && !env.isProd) continue;
    throw new ApiError(
      403,
      ErrorCode.TENDER_NOT_ALLOWED,
      `ລູກຄ້າບັນທຶກການຊຳລະແບບ ${t.method} ເອງບໍ່ໄດ້ — ກະລຸນາຈ່າຍທີ່ໜ້າຮ້ານ ຫຼື ຜ່ານ QR`,
    );
  }
}

export async function addTenders(
  id: string,
  auth: AccessTokenPayload,
  input: AddTendersInput,
): Promise<PaymentView> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      branchId: true,
      currency: true,
      appointment: { select: { customerId: true } },
      bookingGroup: { select: { payerId: true } },
      giftCardPurchase: { select: { buyerId: true } },
      packagePurchase: { select: { userId: true } },
    },
  });
  if (!payment) throw ApiError.notFound('ບໍ່ພົບບິນ');
  const customerId =
    payment.appointment?.customerId ??
    payment.bookingGroup?.payerId ??
    payment.giftCardPurchase?.buyerId ??
    payment.packagePurchase?.userId ??
    null;
  assertCanAccess(auth, customerId);

  assertTenderMethodsAllowed(auth, input);
  // Wave 10C — ເງິນສົດຕ້ອງຜູກກັບກະລິ້ນຊັກທີ່ເປີດຢູ່ (ຕາມນະໂຍບາຍ)
  if (input.tenders.some((t) => t.method === 'CASH')) await assertCashDrawerOpen(payment.branchId);

  // Wave 10A (ອຸດ C2) — ລັອກແຖວ payments ໄວ້ (FOR UPDATE) ແລ້ວອ່ານ+ກວດ+ຂຽນຢູ່ໃນ transaction ດຽວ
  // ເພື່ອກັນ 2 request ພ້ອມກັນ (double-tap/retry) ຕ່າງອ່ານ alreadyPaid ຄ່າເກົ່າແລ້ວຜ່ານດ່ານກວດທັງຄູ່.
  await runSerializable(
    async (tx) => {
      const locked = await tx.$queryRaw<
        { totalAmount: Prisma.Decimal; paymentStatus: string }[]
      >`SELECT "totalAmount", "paymentStatus" FROM "payments" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked[0]) throw ApiError.notFound('ບໍ່ພົບບິນ');
      if (locked[0].paymentStatus === 'VOIDED' || locked[0].paymentStatus === 'REFUNDED') {
        throw ApiError.badRequest('ບິນນີ້ຖືກຍົກເລີກ/ຄືນເງິນແລ້ວ — ຮັບຊຳລະບໍ່ໄດ້');
      }

      const paidRows = await tx.paymentTransaction.findMany({
        where: { paymentId: id, status: 'SUCCESS' },
        select: { amount: true },
      });
      const alreadyPaid = round2(paidRows.reduce((s, t) => s + toNum(t.amount), 0));
      const incoming = round2(input.tenders.reduce((s, t) => s + t.amount, 0));
      const total = toNum(locked[0].totalAmount);
      if (alreadyPaid + incoming > total + 0.01) {
        throw ApiError.badRequest('ຈຳນວນຈ່າຍລວມເກີນຍອດບິນ');
      }

      for (const tender of input.tenders) {
        await applyTender(tx, { paymentId: id, currency: payment.currency, customerId }, tender);
      }
    },
  );

  return recomputeAndSettle(id);
}

// ---- settlement -------------------------------------------------

export async function recomputeAndSettle(id: string): Promise<PaymentView> {
  const row = await prisma.payment.findUniqueOrThrow({
    where: { id },
    include: {
      ...PAYMENT_INCLUDE,
      appointment: { select: { id: true, status: true, customerId: true, customer: { select: { name: true } } } },
    },
  });

  const paid = round2(
    row.transactions.filter((t) => t.status === 'SUCCESS').reduce((s, t) => s + toNum(t.amount), 0),
  );
  const total = toNum(row.totalAmount);
  const deposit = toNum(row.depositAmount);

  // Wave 10B — ບິນທີ່ຖືກ void / ຄືນເງິນເຕັມແລ້ວ ເປັນສະຖານະປາຍທາງ; ຫ້າມ recompute ຍ້ອນກັບ.
  if (row.paymentStatus === 'VOIDED' || row.paymentStatus === 'REFUNDED') return loadView(id);

  const status =
    paid >= total - 0.01 ? 'FULLY_PAID' : paid >= deposit - 0.01 && paid > 0 ? 'DEPOSIT_PAID' : 'PENDING';

  const vat = status === 'FULLY_PAID' ? await getVatSettings() : null;
  await prisma.$transaction(async (tx) => {
    const paidAt = status === 'FULLY_PAID' ? row.paidAt ?? new Date() : null;
    const data: Prisma.PaymentUpdateInput = { paymentStatus: status, paidAt };
    if (status === 'FULLY_PAID') {
      // Wave 10B (M2/M3) — ລັອກແຖວກ່ອນ ແລ້ວອ່ານ invoiceNo ຄືນ: 2 recompute ພ້ອມກັນ ຕ້ອງອອກເລກໃບຮັບເງິນໃບດຽວ
      // (ບໍ່ດັ່ງນັ້ນຄົນທີ 2 ຂຽນທັບ → ເລກຂອງຄົນທີ 1 ຫາຍ = ເລກຂາດຕອນ).
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${id} FOR UPDATE`;
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id }, select: { invoiceNo: true } });
      if (!fresh.invoiceNo) {
        data.invoiceNo = await nextDocumentNo(tx, row.branchId, 'INV', paidAt ?? new Date());
        // EXCLUSIVE ຢຸດ VAT ໄວ້ແລ້ວຕອນສ້າງບິນ (row.vatRate). ບິນຊື້ບັດຂອງຂວັນ = voucher → ບໍ່ຄິດ VAT (ຄິດຕອນນຳບັດໄປໃຊ້,
        // ບໍ່ດັ່ງນັ້ນເສຍພາສີຊ້ຳ 2 ເທື່ອ). ບິນທີ່ສ້າງກ່ອນປ່ຽນເປັນ EXCLUSIVE ຍັງແຍກແບບລວມພາສີ (ລາຄາຕົກລົງກັນແລ້ວ).
        if (vat?.enabled && row.vatRate == null && !row.giftCardPurchase) {
          const { tax, net } = splitVat(total, vat.rate);
          data.vatRate = vat.rate;
          data.vatMode = 'INCLUSIVE';
          data.taxAmount = dec(tax);
          data.netAmount = dec(net);
        }
      }
    }
    await tx.payment.update({ where: { id }, data });
  });

  // ມັດຈຳ/ຈ່າຍຄົບ → ຢືນຢັນນັດ (ກັນ No-Show)
  const appt = row.appointment;
  if (appt && (status === 'DEPOSIT_PAID' || status === 'FULLY_PAID') && appt.status === 'PENDING') {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: appt.id }, data: { status: 'CONFIRMED' } });
      // H7 — ນັດຢືນຢັນແລ້ວ → ຈອງ consumable ຂອງ BOM.
      await syncAppointmentReservations(tx, appt.id);
    });
  }

  // ຈ່າຍຄົບ → ໃຫ້ຄະແນນສະສົມ + ໃບຮັບເງິນ
  if (appt && status === 'FULLY_PAID') {
    await prisma
      .$transaction((tx) =>
        earnPoints(tx, {
          userId: appt.customerId,
          amountLak: total,
          refId: `appt:${appt.id}`,
          notes: 'ໄດ້ຄະແນນຈາກການຊຳລະບິນ',
        }),
      )
      .catch(() => undefined);
    await notifyUser({
      userId: appt.customerId,
      type: 'PAYMENT_RECEIPT',
      title: 'ຊຳລະເງິນສຳເລັດ',
      body: `ຮັບຊຳລະ ${total.toLocaleString()} ${row.currency} ຮຽບຮ້ອຍ. ຂອບໃຈທີ່ໃຊ້ບໍລິການ 🙏`,
      data: { paymentId: id },
      dedupeKey: `receipt:${id}`,
    }).catch(() => undefined);
  }

  // Wave 10A (ອຸດ C1) — ຊື້ບັດຂອງຂວັນເອງໃນແອັບ ບໍ່ຜູກກັບນັດໝາຍ (appt null ໄດ້) → activate ຢູ່ນອກ `if (appt …)`.
  if (status === 'FULLY_PAID') {
    await activatePurchasedGiftCard(id).catch(() => undefined);
    await activatePurchasedPackage(id).catch(() => undefined);
    // M13 — ບິນຂາຍໜ້າຮ້ານ: ຕັດສະຕັອກ SOLD (idempotent) + ຄະແນນສະສົມ. ຕັດບໍ່ໄດ້ → RetailSale.stockError (ບໍ່ throw).
    await onRetailPaymentSettled(id).catch(() => undefined);
  }

  return loadView(id);
}

// ---- admin: list + summary ---------------------------------

function dateRange(from?: string, to?: string): { gte: Date; lt: Date } {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  return { gte: start, lt: end };
}

export async function listPayments(query: PaymentListQuery): Promise<Paginated<PaymentView>> {
  const range = dateRange(query.from, query.to);
  const where: Prisma.PaymentWhereInput = {
    createdAt: range,
    ...(query.branchId !== 'all' ? { branchId: query.branchId } : {}),
    ...(query.status ? { paymentStatus: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { appointment: { customer: { name: { contains: query.q, mode: 'insensitive' } } } },
            { bookingGroup: { payer: { name: { contains: query.q, mode: 'insensitive' } } } },
            { giftCardPurchase: { buyer: { name: { contains: query.q, mode: 'insensitive' } } } },
            { giftCardPurchase: { code: { contains: query.q, mode: 'insensitive' } } },
            { packagePurchase: { user: { name: { contains: query.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);
  return {
    items: rows.map(toView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Wave 10A (ອຸດ H3) — ຂຽນໃໝ່ຈາກ `findMany` ໂຫຼດທຸກບິນ+transaction ເຂົ້າ memory ມາເປັນ SQL
 * aggregate. ຮ້ານທີ່ມີບິນຫຼາຍໝື່ນແຖວ (ຊ່ວງ 1 ປີ) ຈະບໍ່ດຶງທຸກແຖວເຂົ້າ Node ອີກຕໍ່ໄປ.
 */
export async function financeSummary(query: PaymentListQuery): Promise<FinanceSummaryView> {
  const range = dateRange(query.from, query.to);
  const branchId = query.branchId !== 'all' ? query.branchId : null;

  const [totals] = await prisma.$queryRaw<
    { grossrevenue: Prisma.Decimal | null; outstandingbalance: Prisma.Decimal | null; refunded: Prisma.Decimal | null; paymentcount: bigint }[]
  >`
    SELECT
      COALESCE(SUM(paid.amount), 0) AS grossrevenue,
      COALESCE(SUM(CASE WHEN p."paymentStatus" IN ('VOIDED', 'REFUNDED') THEN 0
                        ELSE GREATEST(p."totalAmount" - COALESCE(paid.amount, 0), 0) END), 0) AS outstandingbalance,
      COALESCE(SUM(p."refundedAmount"), 0) AS refunded,
      COUNT(*) AS paymentcount
    FROM "payments" p
    LEFT JOIN LATERAL (
      SELECT SUM(pt."amount") AS amount
      FROM "payment_transactions" pt
      WHERE pt."paymentId" = p."id" AND pt."status" = 'SUCCESS'
    ) paid ON true
    WHERE p."createdAt" >= ${tsParam(range.gte)} AND p."createdAt" < ${tsParam(range.lt)}
      ${branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty}
  `;

  const [depositRow] = await prisma.$queryRaw<{ depositscollected: Prisma.Decimal | null }[]>`
    SELECT COALESCE(SUM(pt."amount"), 0) AS depositscollected
    FROM "payment_transactions" pt
    JOIN "payments" p ON p."id" = pt."paymentId"
    WHERE pt."status" = 'SUCCESS' AND p."paymentStatus" = 'DEPOSIT_PAID'
      AND p."createdAt" >= ${tsParam(range.gte)} AND p."createdAt" < ${tsParam(range.lt)}
      ${branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty}
  `;

  const byMethodRows = await prisma.$queryRaw<
    { method: string; amount: Prisma.Decimal; count: bigint }[]
  >`
    SELECT pt."method" AS method, SUM(pt."amount") AS amount, COUNT(*) AS count
    FROM "payment_transactions" pt
    JOIN "payments" p ON p."id" = pt."paymentId"
    WHERE pt."status" = 'SUCCESS'
      AND p."createdAt" >= ${tsParam(range.gte)} AND p."createdAt" < ${tsParam(range.lt)}
      ${branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty}
    GROUP BY pt."method"
  `;

  return {
    from: range.gte.toISOString(),
    to: range.lt.toISOString(),
    grossRevenue: toNum(totals?.grossrevenue ?? 0),
    depositsCollected: toNum(depositRow?.depositscollected ?? 0),
    outstandingBalance: toNum(totals?.outstandingbalance ?? 0),
    refunded: toNum(totals?.refunded ?? 0),
    byMethod: byMethodRows.map((r) => ({
      method: r.method as FinanceSummaryView['byMethod'][number]['method'],
      amount: toNum(r.amount),
      count: Number(r.count),
    })),
    paymentCount: Number(totals?.paymentcount ?? 0),
  };
}
