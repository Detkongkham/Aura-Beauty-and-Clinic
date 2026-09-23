import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';
import { vientianeDateKey } from '../../src/utils/dateHelpers.js';
import { makeUnsubscribeToken } from '../../src/modules/marketing/consent.service.js';

/**
 * Integration — ແກ້ຂໍ້ຈຳກັດຂອງ Wave 10B/10C/10G:
 *   ຄືນເງິນບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ + ຄືນສິດແພັກເກັດ · clawback ຄອມມິດຊັນທີ່ຈ່າຍແລ້ວ · ຄືນເງິນຫຼຸດ tier ·
 *   VAT ແບບ exclusive · ລັອກເອກະສານດ້ວຍ trigger ຖານຂໍ້ມູນ · ສົ່ງແຄມເປນທາງ SMS/ອີເມວ/LINE + STOP/unfollow.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const CUSTOMER_PHONE = '02077760001';
const TIER_PHONE = '02077760002';
const BA_PHONE = '02077760003';
const BA_PASSWORD = 'Branch@12345';
const BRANCH_NAME = 'L-Test Branch';
const CAMPAIGN_NAME = 'limitations-channels-test';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

let app: Express;
let adminToken = '';
let baToken = '';
let customerToken = '';
let customerId = '';
let tierToken = '';
let tierUserId = '';
let staffProfileId = '';
let branchId = '';

// ຄ່າ AppSetting ທີ່ mock ສະເພາະ process ນີ້ (ຫ້າມແກ້ AppSetting ຮ່ວມ — test ໄຟລ໌ອື່ນແລ່ນຂະໜານໃນ DB ດຽວ).
let vatSetting: Record<string, unknown> = { enabled: false, rate: 0.1, mode: 'INCLUSIVE' };
const POLICY = { quietHoursEnabled: false, quietStart: '21:00', quietEnd: '08:00', weeklyCap: 0 };

async function login(phone: string, password: string): Promise<string> {
  const r = await request(app).post('/api/v1/auth/login').send({ phone, password });
  return r.body.data.tokens.accessToken as string;
}

async function payCash(paymentId: string, amount: number) {
  const r = await request(app)
    .post(`/api/v1/payments/${paymentId}/tenders`)
    .set(...bearer(adminToken))
    .set(...idem())
    .send({ tenders: [{ method: 'CASH', amount }] });
  expect(r.status).toBe(200);
  return r.body.data;
}

async function appointment(userId: string, amount: number, extra: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 45 * 86_400_000 + Math.floor(Math.random() * 1e7));
  return prisma.appointment.create({
    data: {
      branchId,
      customerId: userId,
      staffProfileId,
      serviceId: SERVICE_ID,
      startAt: start,
      endAt: new Date(start.getTime() + 45 * 60_000),
      status: 'COMPLETED',
      totalAmount: amount,
      ...extra,
    },
  });
}

async function billFor(appointmentId: string) {
  const r = await request(app).post('/api/v1/payments').set(...bearer(adminToken)).set(...idem()).send({ appointmentId });
  expect(r.status).toBe(201);
  return r.body.data;
}

const refundReq = (paymentId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/payments/${paymentId}/refunds`).set(...bearer(baToken)).send({ reason: 'customer request', ...body });

/** ຂໍ (BA) → ອະນຸມັດ (admin) → ຈ່າຍ. */
async function approveAndPay(refundId: string, expectPay = 200) {
  await request(app).post(`/api/v1/payments/refunds/${refundId}/approve`).set(...bearer(adminToken)).expect(200);
  const r = await request(app).post(`/api/v1/payments/refunds/${refundId}/pay`).set(...bearer(adminToken)).send({});
  expect(r.status).toBe(expectPay);
  return r.body.data;
}

async function makePackage(units: number, price: number) {
  return prisma.package.create({
    data: { branchId, name: 'L-Test Package', totalPrice: price, validityDays: 365, items: { create: [{ serviceId: SERVICE_ID, totalUnits: units }] } },
  });
}

async function cleanup(): Promise<void> {
  const br = await prisma.branch.findMany({ where: { name: BRANCH_NAME }, select: { id: true } });
  const bids = br.map((b) => b.id);
  const users = await prisma.user.findMany({ where: { phone: { in: [CUSTOMER_PHONE, TIER_PHONE, BA_PHONE] } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const pays = await prisma.payment.findMany({ where: { branchId: { in: bids } }, select: { id: true } });
  const pids = pays.map((p) => p.id);
  await prisma.commissionClawback.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.refund.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: pids } } });
  const cards = await prisma.giftCard.findMany({ where: { branchId: { in: bids } }, select: { id: true } });
  await prisma.giftCardTransaction.deleteMany({ where: { giftCardId: { in: cards.map((c) => c.id) } } });
  await prisma.giftCard.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.staffCommission.deleteMany({ where: { appointment: { branchId: { in: bids } } } });
  await prisma.queueTicket.deleteMany({ where: { appointment: { branchId: { in: bids } } } });
  await prisma.appointment.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.userPackage.deleteMany({ where: { package: { branchId: { in: bids } } } });
  await prisma.package.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.payment.deleteMany({ where: { id: { in: pids } } });
  await prisma.cashDrawerSession.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.documentSequence.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.marketingCampaign.deleteMany({ where: { name: CAMPAIGN_NAME } });
  await prisma.branch.deleteMany({ where: { id: { in: bids } } });
  await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccount: { userId: { in: uids } } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: uids } } });
  await prisma.campaignRecipient.deleteMany({ where: { userId: { in: uids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.marketingConsentEvent.deleteMany({ where: { userId: { in: uids } } });
  await prisma.suppressionEntry.deleteMany({ where: { identifier: { in: uids } } });
  await prisma.marketingConsent.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

beforeAll(async () => {
  app = createApp();
  const original = prisma.appSetting.findUnique.bind(prisma.appSetting);
  vi.spyOn(prisma.appSetting, 'findUnique').mockImplementation(((args: { where: { key?: string } }) => {
    if (args.where.key === 'finance-vat') return Promise.resolve({ key: 'finance-vat', value: vatSetting, updatedAt: new Date() });
    if (args.where.key === 'marketing-policy') return Promise.resolve({ key: 'marketing-policy', value: POLICY, updatedAt: new Date() });
    return original(args as never);
  }) as never);

  await cleanup();
  adminToken = await login(ADMIN.phone, ADMIN.password);
  const template = await prisma.branch.findFirstOrThrow();
  const { id: _id, createdAt: _c, updatedAt: _u, name: _n, code: _code, ...rest } = template as Record<string, unknown>;
  branchId = (await prisma.branch.create({ data: { ...(rest as object), name: BRANCH_NAME, code: 'LT' } as never })).id;
  const reg = async (phone: string) =>
    request(app).post('/api/v1/auth/register').send({ name: `Limit ${phone}`, phone, password: 'Passw0rd!x' });
  const c = await reg(CUSTOMER_PHONE);
  customerToken = c.body.data.tokens.accessToken;
  customerId = c.body.data.user.id;
  const t = await reg(TIER_PHONE);
  tierToken = t.body.data.tokens.accessToken;
  tierUserId = t.body.data.user.id;
  await prisma.user.create({
    data: { name: 'BA-L', phone: BA_PHONE, password: await hashPassword(BA_PASSWORD), role: 'BRANCH_ADMIN', branchId },
  });
  baToken = await login(BA_PHONE, BA_PASSWORD);
  staffProfileId = (await prisma.staffProfile.findFirstOrThrow({ where: { deletedAt: null } })).id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('ຄືນເງິນບິນຊື້ບັດຂອງຂວັນ', () => {
  it('ຄືນໄດ້ບໍ່ເກີນຍອດໃນບັດ; ຈ່າຍ → ຫັກຈາກບັດ; ຄືນໝົດ → ບັດ VOID; ບໍ່ຄິດ VAT ໃສ່ບິນ voucher', async () => {
    vatSetting = { enabled: true, rate: 0.1, mode: 'INCLUSIVE' };
    const buy = await request(app)
      .post('/api/v1/gift-cards/purchase')
      .set(...bearer(customerToken))
      .set(...idem())
      .send({ branchId, amount: 200_000, recipientEmail: 'limits@example.com' });
    expect(buy.status).toBe(201);
    const paymentId = buy.body.data.purchasePaymentId as string;
    const view = await payCash(paymentId, 200_000);
    expect(view.paymentStatus).toBe('FULLY_PAID');
    expect(view.vatRate).toBeNull(); // voucher — ພາສີຄິດຕອນນຳບັດໄປໃຊ້
    const card = await prisma.giftCard.findUniqueOrThrow({ where: { purchasePaymentId: paymentId } });
    expect(card.status).toBe('ACTIVE');

    await refundReq(paymentId, { amount: 200_001 }).expect(400);
    const r1 = await refundReq(paymentId, { amount: 80_000 });
    expect(r1.status).toBe(201);
    expect(r1.body.data.billKind).toBe('GIFT_CARD_SALE');
    // ຄຳຂໍທີ່ຍັງບໍ່ຈ່າຍ ຈອງຍອດໃນບັດໄວ້ → ຂໍເພີ່ມເກີນສ່ວນທີ່ເຫຼືອບໍ່ໄດ້
    await refundReq(paymentId, { amount: 120_001 }).expect(400);
    await approveAndPay(r1.body.data.id);
    const c1 = await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(Number(c1.currentBalance)).toBe(120_000);
    expect(c1.status).toBe('ACTIVE');

    // ບັດຖືກໃຊ້ໄປລະຫວ່າງຂໍ → ຈ່າຍ: ຈ່າຍບໍ່ໄດ້ (409)
    const r2 = await refundReq(paymentId, { amount: 120_000 });
    expect(r2.status).toBe(201);
    await prisma.giftCard.update({ where: { id: card.id }, data: { currentBalance: 100_000 } });
    await approveAndPay(r2.body.data.id, 409);
    await prisma.giftCard.update({ where: { id: card.id }, data: { currentBalance: 120_000 } });
    const paid = await request(app).post(`/api/v1/payments/refunds/${r2.body.data.id}/pay`).set(...bearer(adminToken)).send({});
    expect(paid.status).toBe(200);
    const c2 = await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(Number(c2.currentBalance)).toBe(0);
    expect(c2.status).toBe('VOID');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).paymentStatus).toBe('REFUNDED');
    vatSetting = { enabled: false, rate: 0.1, mode: 'INCLUSIVE' };
  });
});

describe('ຄືນເງິນບິນຊື້ແພັກເກັດ + ຄືນສິດແພັກເກັດ', () => {
  it('ຄືນໄດ້ບໍ່ເກີນມູນຄ່າສ່ວນທີ່ຍັງບໍ່ໃຊ້; ຈ່າຍ → ແພັກເກັດ VOID + ສິດເປັນ 0', async () => {
    const pkg = await makePackage(4, 400_000);
    const buy = await request(app).post(`/api/v1/packages/${pkg.id}/purchase`).set(...bearer(customerToken)).set(...idem());
    expect([200, 201]).toContain(buy.status);
    const { paymentId, userPackageId } = buy.body.data as { paymentId: string; userPackageId: string };
    await payCash(paymentId, 400_000);
    expect((await prisma.userPackage.findUniqueOrThrow({ where: { id: userPackageId } })).status).toBe('ACTIVE');
    // ໃຊ້ໄປ 1 ຄັ້ງ → ມູນຄ່າທີ່ຍັງບໍ່ໃຊ້ = 300,000
    await prisma.userPackageItem.updateMany({ where: { userPackageId }, data: { remainingUnits: 3 } });

    await refundReq(paymentId, { amount: 300_001 }).expect(400);
    const r = await refundReq(paymentId, { amount: 300_000 });
    expect(r.status).toBe(201);
    expect(r.body.data.billKind).toBe('PACKAGE_SALE');
    await refundReq(paymentId, { amount: 1_000 }).expect(409); // ຄືນໄດ້ຄຳຂໍດຽວ
    await approveAndPay(r.body.data.id);
    expect((await prisma.userPackage.findUniqueOrThrow({ where: { id: userPackageId } })).status).toBe('VOID');
    const items = await prisma.userPackageItem.findMany({ where: { userPackageId } });
    expect(items.every((i) => i.remainingUnits === 0)).toBe(true);
    expect(Number((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).refundedAmount)).toBe(300_000);
  });

  it('ນັດທີ່ໃຊ້ສິດແພັກເກັດ: returnPackageUnit ຄືນ 1 ຄັ້ງ (ບໍ່ມີເງິນ), ຂໍຊ້ຳບໍ່ໄດ້', async () => {
    const pkg = await makePackage(3, 300_000);
    const buy = await request(app).post(`/api/v1/packages/${pkg.id}/purchase`).set(...bearer(customerToken)).set(...idem());
    const { paymentId, userPackageId } = buy.body.data as { paymentId: string; userPackageId: string };
    await payCash(paymentId, 300_000);
    const item = await prisma.userPackageItem.findFirstOrThrow({ where: { userPackageId } });
    await prisma.userPackageItem.update({ where: { id: item.id }, data: { remainingUnits: 2 } }); // ຈອງໃຊ້ 1 ຄັ້ງ
    const appt = await appointment(customerId, 0, { userPackageItemId: item.id, travelFee: 20_000 });
    const bill = await billFor(appt.id);
    await payCash(bill.id, 20_000);

    await refundReq(bill.id, { amount: 0 }).expect(400); // ບໍ່ມີທັງເງິນ ແລະ ສິດ
    const r = await refundReq(bill.id, { amount: 0, returnPackageUnit: true });
    expect(r.status).toBe(201);
    expect(r.body.data.packageUnitReturned).toBe(true);
    await refundReq(bill.id, { amount: 0, returnPackageUnit: true }).expect(409);
    const paid = await approveAndPay(r.body.data.id);
    expect(paid.creditNoteNo).toMatch(/^CN-/);
    expect((await prisma.userPackageItem.findUniqueOrThrow({ where: { id: item.id } })).remainingUnits).toBe(3);
    // ຍັງຄືນເງິນຄ່າເດີນທາງໄດ້ຕາມປົກກະຕິ
    const money = await refundReq(bill.id, { amount: 20_000 });
    expect(money.status).toBe(201);
  });
});

describe('ຄອມມິດຊັນທີ່ຈ່າຍແລ້ວ + tier', () => {
  it('ຄືນເງິນເຕັມ: ຄອມທີ່ຈ່າຍແລ້ວ → CommissionClawback ເດືອນນີ້, payroll ຫັກ; tier GOLD → SILVER', async () => {
    const appt = await appointment(tierUserId, 5_000_000);
    const bill = await billFor(appt.id);
    await payCash(bill.id, 5_000_000);
    const acc0 = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: tierUserId } });
    expect(acc0.points).toBe(500);
    expect(acc0.tierLevel).toBe('GOLD');
    await prisma.staffCommission.create({
      data: { staffProfileId, appointmentId: appt.id, serviceAmount: 5_000_000, commissionRate: 0.1, payoutAmount: 500_000, isPaid: true },
    });

    const r = await refundReq(bill.id, { amount: 2_500_000 });
    await approveAndPay(r.body.data.id);
    const month = vientianeDateKey(new Date()).toISOString().slice(0, 7);
    const claw1 = await prisma.commissionClawback.findMany({ where: { appointmentId: appt.id } });
    expect(claw1).toHaveLength(1);
    expect(Number(claw1[0]!.amount)).toBe(250_000);
    expect(claw1[0]!.monthYear).toBe(month);
    // ຄອມທີ່ຈ່າຍແລ້ວບໍ່ຖືກແກ້ (ເປັນປະຫວັດ) — ໜີ້ຢູ່ໃນ clawback
    expect(Number((await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId: appt.id } })).payoutAmount)).toBe(500_000);
    const acc1 = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: tierUserId } });
    expect(acc1.points).toBe(250);
    expect(acc1.tierLevel).toBe('SILVER');

    const r2 = await refundReq(bill.id, { amount: 2_500_000 });
    await approveAndPay(r2.body.data.id);
    const total = await prisma.commissionClawback.aggregate({ where: { appointmentId: appt.id }, _sum: { amount: true } });
    expect(Number(total._sum.amount)).toBe(500_000);

    const report = await request(app).get('/api/v1/payroll/kpi').query({ monthYear: month }).set(...bearer(adminToken));
    expect(report.status).toBe(200);
    const row = (report.body.data.rows as Array<{ staffProfileId: string; clawbackTotal: number; clawbackUnsettled: number }>).find(
      (x) => x.staffProfileId === staffProfileId,
    )!;
    expect(row.clawbackTotal).toBeGreaterThanOrEqual(500_000);
    expect(report.body.data.totals.clawbackTotal).toBeGreaterThanOrEqual(500_000);

    // ຈ່າຍຄອມເດືອນນີ້ (ສະເພາະສາຂາທົດສອບ) → clawback ຖືກໝາຍວ່າຫັກແລ້ວ
    await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: true, branchId })
      .expect(200);
    const settled = await prisma.commissionClawback.findMany({ where: { appointmentId: appt.id } });
    expect(settled.every((c) => c.isSettled)).toBe(true);
    void tierToken;
  });
});

describe('VAT ແບບ EXCLUSIVE', () => {
  it('ບວກພາສີເທິງລາຄາຕອນສ້າງບິນ ແລະ ຢຸດໄວ້; ອອກ INV ບໍ່ແຍກຊ້ຳ', async () => {
    vatSetting = { enabled: true, rate: 0.1, mode: 'EXCLUSIVE' };
    const appt = await appointment(customerId, 200_000);
    const bill = await billFor(appt.id);
    expect(bill).toMatchObject({ totalAmount: 220_000, vatMode: 'EXCLUSIVE', vatRate: 0.1, taxAmount: 20_000, netAmount: 200_000 });
    expect(bill.depositAmount).toBeCloseTo(220_000 * 0.2, 0);
    // ປ່ຽນການຕັ້ງຄ່າຫຼັງສ້າງບິນ ບໍ່ກະທົບບິນນີ້
    vatSetting = { enabled: true, rate: 0.07, mode: 'INCLUSIVE' };
    const view = await payCash(bill.id, 220_000);
    expect(view).toMatchObject({ paymentStatus: 'FULLY_PAID', totalAmount: 220_000, vatMode: 'EXCLUSIVE', taxAmount: 20_000, netAmount: 200_000 });
    expect(view.invoiceNo).toMatch(/^INV-/);
    const receipt = await request(app).get(`/api/v1/payments/${bill.id}/receipt`).set(...bearer(adminToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({ vatMode: 'EXCLUSIVE', taxAmount: 20_000, netAmount: 200_000, total: 220_000 });
    vatSetting = { enabled: false, rate: 0.1, mode: 'INCLUSIVE' };
  });
});

describe('ລັອກເອກະສານດ້ວຍ trigger ຖານຂໍ້ມູນ', () => {
  it('ບິນ INV / ລາຍການຮັບເງິນ / CN / ກະທີ່ປິດ ແກ້ໂດຍກົງໃນ DB ບໍ່ໄດ້', async () => {
    const opened = await request(app)
      .post('/api/v1/payments-treasury/cash-drawer/sessions')
      .set(...bearer(adminToken))
      .send({ branchId, openingFloat: 100_000 });
    expect(opened.status).toBe(201);
    const sessionId = opened.body.data.id as string;

    const appt = await appointment(customerId, 150_000);
    const bill = await billFor(appt.id);
    await payCash(bill.id, 150_000);
    const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: bill.id, status: 'SUCCESS' } });

    await expect(prisma.payment.update({ where: { id: bill.id }, data: { totalAmount: 1 } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(prisma.payment.update({ where: { id: bill.id }, data: { invoiceNo: null } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(prisma.payment.update({ where: { id: bill.id }, data: { paymentStatus: 'PENDING' } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(prisma.paymentTransaction.update({ where: { id: tx.id }, data: { amount: 1 } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(prisma.paymentTransaction.update({ where: { id: tx.id }, data: { status: 'FAILED' } })).rejects.toThrow(/LEDGER_LOCKED/);

    const r = await refundReq(bill.id, { amount: 50_000 });
    const paid = await approveAndPay(r.body.data.id);
    await expect(prisma.refund.update({ where: { id: paid.id }, data: { amount: 1 } })).rejects.toThrow(/LEDGER_LOCKED/);

    const closed = await request(app)
      .post(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/close`)
      .set(...bearer(adminToken))
      .send({ countedAmount: 200_000 });
    expect(closed.status).toBe(200);
    const s = await prisma.cashDrawerSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.zNo).toMatch(/^Z-/);
    await expect(prisma.cashDrawerSession.update({ where: { id: sessionId }, data: { countedAmount: 1 } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(prisma.cashDrawerSession.update({ where: { id: sessionId }, data: { status: 'OPEN' } })).rejects.toThrow(/LEDGER_LOCKED/);
    await expect(
      prisma.cashDrawerMovement.create({ data: { sessionId, type: 'DROP', amount: 1, createdById: tx.id } }),
    ).rejects.toThrow(/LEDGER_LOCKED/);
    // back-date ລາຍການຮັບເງິນເຂົ້າໄປໃນກະທີ່ປິດແລ້ວ
    await expect(
      prisma.paymentTransaction.create({
        data: { paymentId: bill.id, method: 'CASH', amount: 1, status: 'SUCCESS', createdAt: new Date((s.openedAt.getTime() + s.closedAt!.getTime()) / 2) },
      }),
    ).rejects.toThrow(/LEDGER_LOCKED/);
    // ຜ່ານ API ກໍຖືກປະຕິເສດ (409)
    const lockedByApi = await request(app).post(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/movements`).set(...bearer(adminToken)).send({ type: 'DROP', amount: 1000 });
    expect(lockedByApi.status).toBe(409);
  });
});

describe('ແຄມເປນທາງ SMS / ອີເມວ / LINE', () => {
  it('ສົ່ງຈິງຜ່ານ adapter ສະເພາະຊ່ອງທີ່ opt-in + ຕັ້ງຄ່າແລ້ວ; STOP / unfollow ຖອນ consent', async () => {
    const saved = { ...env };
    Object.assign(env, {
      SMS_GATEWAY_URL: 'https://sms.example.test/send',
      SMS_GATEWAY_TOKEN: 'sms-token',
      SMS_INBOUND_SECRET: 'inbound-secret',
      EMAIL_PROVIDER: undefined,
      LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
      LINE_CHANNEL_SECRET: 'line-secret',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    try {
      // ລູກຄ້າ: ວັນເກີດມື້ນີ້ ຢູ່ສາຂາທົດສອບ, opt-in SMS + EMAIL + LINE (ບໍ່ opt-in PUSH)
      const now = new Date();
      await prisma.user.update({
        where: { id: customerId },
        data: { branchId, email: 'limits-customer@example.com', dateOfBirth: new Date(Date.UTC(1990, now.getMonth(), now.getDate())) },
      });
      for (const channel of ['SMS', 'EMAIL', 'LINE']) {
        await request(app).put('/api/v1/consent/me').set(...bearer(customerToken)).send({ channel, granted: true }).expect(200);
      }

      // ຜູກ LINE: ລະຫັດ → webhook (ລາຍເຊັນຖືກ)
      const code = (await request(app).post('/api/v1/consent/me/line-link').set(...bearer(customerToken))).body.data.code as string;
      const sign = (body: string) => createHmac('sha256', 'line-secret').update(body).digest('base64');
      const linkBody = JSON.stringify({ events: [{ type: 'message', replyToken: 'rt', source: { userId: 'U-limits' }, message: { type: 'text', text: code } }] });
      await request(app).post('/api/v1/consent/line/webhook').set('Content-Type', 'application/json').set('X-Line-Signature', 'bad').send(linkBody).expect(403);
      await request(app).post('/api/v1/consent/line/webhook').set('Content-Type', 'application/json').set('X-Line-Signature', sign(linkBody)).send(linkBody).expect(200);
      const prefs = (await request(app).get('/api/v1/consent/me').set(...bearer(customerToken))).body.data;
      expect(prefs.contacts).toEqual({ phone: true, email: true, lineLinked: true });

      const channels = (await request(app).get('/api/v1/marketing/channels').set(...bearer(adminToken))).body.data;
      expect(channels.channels).toEqual(expect.arrayContaining([{ channel: 'SMS', configured: true }, { channel: 'EMAIL', configured: false }]));

      const c = await request(app)
        .post('/api/v1/marketing/campaigns')
        .set(...bearer(adminToken))
        .send({ branchId, name: CAMPAIGN_NAME, type: 'BIRTHDAY', message: { title: 'Happy', body: 'Promo' }, triggerRule: { daysBefore: 0 }, channels: ['PUSH', 'SMS', 'EMAIL', 'LINE'] });
      expect(c.status).toBe(201);
      expect(c.body.data.channels).toEqual(['PUSH', 'SMS', 'EMAIL', 'LINE']);
      fetchSpy.mockClear();
      const run = (await request(app).post(`/api/v1/marketing/campaigns/${c.body.data.id}/run`).set(...bearer(adminToken))).body.data;
      expect(run.sent).toBe(1);
      expect(run.byChannel.SMS).toMatchObject({ sent: 1 });
      expect(run.byChannel.LINE).toMatchObject({ sent: 1 });
      expect(run.byChannel.EMAIL).toMatchObject({ sent: 0, noProvider: 1 });
      expect(run.byChannel.PUSH).toMatchObject({ sent: 0 }); // ບໍ່ opt-in push
      const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(urls).toContain('https://sms.example.test/send');
      expect(urls).toContain('https://api.line.me/v2/bot/message/push');
      const smsCall = fetchSpy.mock.calls.find((call) => String(call[0]) === 'https://sms.example.test/send')!;
      expect(JSON.parse(String((smsCall[1] as RequestInit).body))).toMatchObject({ to: '+85620' + CUSTOMER_PHONE.slice(3) });
      const rec = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: c.body.data.id, userId: customerId } });
      expect([...rec.channels].sort()).toEqual(['LINE', 'SMS']);
      // ນັບເພດານ/ອາທິດ ເຖິງບໍ່ໄດ້ສົ່ງ push
      expect(await prisma.notificationLog.count({ where: { userId: customerId, type: 'CAMPAIGN' } })).toBe(1);

      // SMS STOP-reply
      await request(app).post('/api/v1/consent/sms/inbound').send({ from: '+85620' + CUSTOMER_PHONE.slice(3), text: 'STOP' }).expect(403);
      const stop = await request(app)
        .post('/api/v1/consent/sms/inbound')
        .set('X-Sms-Inbound-Secret', 'inbound-secret')
        .send({ from: '+85620' + CUSTOMER_PHONE.slice(3), text: 'stop' });
      expect(stop.body.data.action).toBe('unsubscribed');
      // LINE unfollow
      const unfollow = JSON.stringify({ events: [{ type: 'unfollow', source: { userId: 'U-limits' } }] });
      await request(app).post('/api/v1/consent/line/webhook').set('Content-Type', 'application/json').set('X-Line-Signature', sign(unfollow)).send(unfollow).expect(200);
      const after = (await request(app).get('/api/v1/consent/me').set(...bearer(customerToken))).body.data.channels as Array<{ channel: string; granted: boolean }>;
      expect(after.find((x) => x.channel === 'SMS')!.granted).toBe(false);
      expect(after.find((x) => x.channel === 'LINE')!.granted).toBe(false);
      expect(after.find((x) => x.channel === 'EMAIL')!.granted).toBe(true);

      // ລິ້ງຖອນຕົວ (GET) ໃນອີເມວ
      const unsub = await request(app).get('/api/v1/consent/unsubscribe').query({ token: makeUnsubscribeToken(customerId, 'EMAIL') });
      expect(unsub.status).toBe(200);
      expect(unsub.headers['content-type']).toMatch(/html/);
      const final = (await request(app).get('/api/v1/consent/me').set(...bearer(customerToken))).body.data.channels as Array<{ channel: string; granted: boolean }>;
      expect(final.find((x) => x.channel === 'EMAIL')!.granted).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      Object.assign(env, saved);
    }
  });
});
