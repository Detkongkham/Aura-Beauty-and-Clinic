import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';
import { nextDocumentNo } from '../../src/utils/documentNumbers.js';

/**
 * Integration — Wave 10B: refund engine · clawback · void · ເລກໃບຮັບເງິນ/ໃບຄືນເງິນ (gapless) · VAT · ໃບຮັບເງິນ · ລາຍງານ VAT.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const CUSTOMER_PHONE = '02077730001';
const OTHER_PHONE = '02077730002';
const BA_PHONE = '02077730003';
const BA_PASSWORD = 'Branch@12345';
const AMOUNT = 220_000;

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

let app: Express;
let adminToken = '';
let baToken = '';
let customerToken = '';
let otherToken = '';
let customerId = '';
let staffProfileId = '';
const apptIds: string[] = [];

async function login(phone: string, password: string): Promise<string> {
  const r = await request(app).post('/api/v1/auth/login').send({ phone, password });
  return r.body.data.tokens.accessToken as string;
}

/** ສ້າງນັດ + ບິນ (ຜ່ານ API) ແລ້ວຊຳລະເຕັມ (ເງິນສົດ ຫຼື tender ທີ່ລະບຸ). */
async function paidBill(tenders: Array<Record<string, unknown>> = [{ method: 'CASH', amount: AMOUNT }]) {
  const start = new Date(Date.now() + 40 * 86_400_000);
  const appt = await prisma.appointment.create({
    data: {
      branchId: BRANCH_ID,
      customerId,
      staffProfileId,
      serviceId: SERVICE_ID,
      startAt: start,
      endAt: new Date(start.getTime() + 45 * 60_000),
      status: 'COMPLETED',
      totalAmount: AMOUNT,
    },
  });
  apptIds.push(appt.id);
  const created = await request(app).post('/api/v1/payments').set(...bearer(adminToken)).set(...idem()).send({ appointmentId: appt.id });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  const paid = await request(app).post(`/api/v1/payments/${id}/tenders`).set(...bearer(adminToken)).set(...idem()).send({ tenders });
  expect(paid.status).toBe(200);
  return { id, appointmentId: appt.id, view: paid.body.data };
}

const refundReq = (paymentId: string, tk: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/payments/${paymentId}/refunds`).set(...bearer(tk)).send({ reason: 'customer request', ...body });

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { phone: { in: [CUSTOMER_PHONE, OTHER_PHONE, BA_PHONE] } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const appts = await prisma.appointment.findMany({ where: { customerId: { in: uids } }, select: { id: true } });
  const aids = appts.map((a) => a.id);
  const pays = await prisma.payment.findMany({ where: { appointmentId: { in: aids } }, select: { id: true } });
  const pids = pays.map((p) => p.id);
  await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccount: { userId: { in: uids } } } });
  await prisma.giftCardTransaction.deleteMany({ where: { giftCard: { recipientEmail: 'refund-test@example.com' } } });
  await prisma.refund.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.payment.deleteMany({ where: { id: { in: pids } } });
  await prisma.giftCard.deleteMany({ where: { recipientEmail: 'refund-test@example.com' } });
  await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
  await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
  await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.appSetting.deleteMany({ where: { key: 'finance-vat' } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  adminToken = await login(ADMIN.phone, ADMIN.password);
  const reg = async (phone: string) => request(app).post('/api/v1/auth/register').send({ name: `Refund ${phone}`, phone, password: 'Passw0rd!x' });
  const c = await reg(CUSTOMER_PHONE);
  customerToken = c.body.data.tokens.accessToken;
  customerId = c.body.data.user.id;
  otherToken = (await reg(OTHER_PHONE)).body.data.tokens.accessToken;
  await prisma.user.create({
    data: { name: 'BA', phone: BA_PHONE, password: await hashPassword(BA_PASSWORD), role: 'BRANCH_ADMIN', branchId: BRANCH_ID },
  });
  baToken = await login(BA_PHONE, BA_PASSWORD);
  staffProfileId = (await prisma.staffProfile.findFirstOrThrow({ where: { user: { branchId: BRANCH_ID } } })).id;
  const vat = await request(app).put('/api/v1/payments/vat-settings').set(...bearer(adminToken)).send({ enabled: true, rate: 0.1 });
  expect(vat.status).toBe(200);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Wave 10B — invoice numbers + VAT', () => {
  it('FULLY_PAID ອອກເລກໃບຮັບເງິນ + ຢຸດ VAT (inclusive 10%)', async () => {
    const { view } = await paidBill();
    expect(view.paymentStatus).toBe('FULLY_PAID');
    expect(view.invoiceNo).toMatch(/^INV-.+-\d{4}-\d{6}$/);
    expect(view.vatRate).toBe(0.1);
    expect(view.taxAmount).toBe(20_000);
    expect(view.netAmount).toBe(200_000);
  });

  it('ເລກຕໍ່ເນື່ອງ ບໍ່ຊ້ຳ ເຖິງເອີ້ນພ້ອມກັນ (50 ຄັ້ງ ຂະໜານ) ແລະ rollback ບໍ່ເຮັດໃຫ້ເລກຂາດ', async () => {
    const nums = await Promise.all(
      Array.from({ length: 50 }, () => prisma.$transaction((tx) => nextDocumentNo(tx, BRANCH_ID, 'CN', new Date('2031-06-01T00:00:00Z')))),
    );
    const seqs = nums.map((n) => Number(n.split('-').pop())).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(50);
    expect(seqs[49]! - seqs[0]!).toBe(49);
    const before = await prisma.documentSequence.findUniqueOrThrow({ where: { branchId_docType_year: { branchId: BRANCH_ID, docType: 'CN', year: 2031 } } });
    await expect(
      prisma.$transaction(async (tx) => {
        await nextDocumentNo(tx, BRANCH_ID, 'CN', new Date('2031-06-01T00:00:00Z'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = await prisma.documentSequence.findUniqueOrThrow({ where: { branchId_docType_year: { branchId: BRANCH_ID, docType: 'CN', year: 2031 } } });
    expect(after.lastNo).toBe(before.lastNo);
    await prisma.documentSequence.deleteMany({ where: { year: 2031 } });
  });
});

describe('Wave 10B — refund: ເງິນສົດ ບາງສ່ວນ → ເຕັມ + clawback', () => {
  it('ຄຳຂໍ → ອະນຸມັດ (ແຍກໜ້າທີ່) → ຈ່າຍ → credit note + clawback ຄະແນນ/ຄອມມິດຊັນ', async () => {
    const { id, appointmentId } = await paidBill();
    const pointsBefore = (await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: customerId } })).points;
    expect(pointsBefore).toBeGreaterThan(0);
    await prisma.staffCommission.create({
      data: { staffProfileId, appointmentId, serviceAmount: AMOUNT, commissionRate: 0.1, payoutAmount: 22_000 },
    });

    // ບໍ່ມີສິດ (ລູກຄ້າ) → 403
    await refundReq(id, customerToken, { amount: 1000 }).expect(403);
    // ເກີນຍອດ → 400
    await refundReq(id, adminToken, { amount: AMOUNT + 1 }).expect(400);

    const req1 = await refundReq(id, baToken, { amount: 110_000 });
    expect(req1.status).toBe(201);
    expect(req1.body.data).toMatchObject({ status: 'PENDING', amount: 110_000, storeCreditAmount: 0, method: 'CASH', taxAmount: 10_000 });
    const rid = req1.body.data.id as string;

    // ຜູ້ຂໍອະນຸມັດເອງບໍ່ໄດ້; ຈ່າຍກ່ອນອະນຸມັດບໍ່ໄດ້
    await request(app).post(`/api/v1/payments/refunds/${rid}/approve`).set(...bearer(baToken)).expect(403);
    await request(app).post(`/api/v1/payments/refunds/${rid}/pay`).set(...bearer(baToken)).send({}).expect(409);
    await request(app).post(`/api/v1/payments/refunds/${rid}/approve`).set(...bearer(adminToken)).expect(200);

    const paid = await request(app).post(`/api/v1/payments/refunds/${rid}/pay`).set(...bearer(baToken)).send({});
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.creditNoteNo).toMatch(/^CN-.+-\d{4}-\d{6}$/);
    // ຈ່າຍຊ້ຳ → 409
    await request(app).post(`/api/v1/payments/refunds/${rid}/pay`).set(...bearer(baToken)).send({}).expect(409);

    const p1 = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(Number(p1.refundedAmount)).toBe(110_000);
    expect(p1.paymentStatus).toBe('FULLY_PAID');
    const pointsHalf = (await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: customerId } })).points;
    const earned = AMOUNT / 10_000; // EARN ຂອງບິນນີ້ (ຄະແນນຈາກບິນອື່ນໃນ test ກ່ອນໜ້າ ບໍ່ຖືກແຕະ)
    expect(pointsHalf).toBe(pointsBefore - earned / 2);
    const comm1 = await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId } });
    expect(Number(comm1.payoutAmount)).toBe(11_000);

    // ຄືນສ່ວນທີ່ເຫຼືອ → REFUNDED, ຄະແນນ/ຄອມມິດຊັນ ຖືກດຶງຄົບ
    const r2 = await refundReq(id, adminToken, { amount: 110_000 });
    await request(app).post(`/api/v1/payments/refunds/${r2.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    await request(app).post(`/api/v1/payments/refunds/${r2.body.data.id}/pay`).set(...bearer(adminToken)).send({}).expect(200);
    const p2 = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p2.paymentStatus).toBe('REFUNDED');
    expect((await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: customerId } })).points).toBe(pointsBefore - earned);
    expect(Number((await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId } })).payoutAmount)).toBe(0);
    await refundReq(id, adminToken, { amount: 1000 }).expect(400); // ບໍ່ເຫຼືອໃຫ້ຄືນ
  });

  it('ຈອງ tender ຊ້ຳບໍ່ໄດ້: 2 ຄຳຂໍ PENDING ລວມກັນເກີນຍອດ → ຄົນທີ 2 ຖືກປະຕິເສດ', async () => {
    const { id } = await paidBill();
    await refundReq(id, adminToken, { amount: 150_000 }).expect(201);
    await refundReq(id, adminToken, { amount: 100_000 }).expect(400);
    await refundReq(id, adminToken, { amount: 70_000 }).expect(201);
  });

  it('reject ຄຳຂໍ → ຍອດຈອງຄືນ', async () => {
    const { id } = await paidBill();
    const r = await refundReq(id, adminToken, { amount: AMOUNT });
    const rej = await request(app).post(`/api/v1/payments/refunds/${r.body.data.id}/reject`).set(...bearer(adminToken)).send({ reason: 'not eligible' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('REJECTED');
    await request(app).post(`/api/v1/payments/refunds/${r.body.data.id}/approve`).set(...bearer(adminToken)).expect(409);
    await refundReq(id, adminToken, { amount: AMOUNT }).expect(201);
  });
});

describe('Wave 10B — refund: split tender (ບັດຂອງຂວັນ + ເງິນສົດ)', () => {
  it('ສ່ວນບັດຂອງຂວັນຄືນເຂົ້າບັດ, ສ່ວນເງິນສົດຈ່າຍອອກ', async () => {
    const issue = await request(app)
      .post('/api/v1/gift-cards/issue')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, amount: 200_000, recipientEmail: 'refund-test@example.com', issueReason: 'refund test' });
    expect(issue.status).toBe(201);
    const code = issue.body.data.code as string;

    const { id } = await paidBill([
      { method: 'GIFT_CARD', amount: 100_000, giftCardCode: code },
      { method: 'CASH', amount: 120_000 },
    ]);
    const card0 = await prisma.giftCard.findUniqueOrThrow({ where: { code } });
    expect(Number(card0.currentBalance)).toBe(100_000);

    // ໃໝ່ສຸດກ່ອນ: ເງິນສົດ 120,000 ກ່ອນ, ແລ້ວບັດ 30,000
    const r = await refundReq(id, adminToken, { amount: 150_000 });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ amount: 120_000, storeCreditAmount: 30_000, method: 'CASH' });
    await request(app).post(`/api/v1/payments/refunds/${r.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    await request(app).post(`/api/v1/payments/refunds/${r.body.data.id}/pay`).set(...bearer(adminToken)).send({}).expect(200);
    const card1 = await prisma.giftCard.findUniqueOrThrow({ where: { code } });
    expect(Number(card1.currentBalance)).toBe(130_000);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).paymentStatus).toBe('FULLY_PAID');
  });
});

describe('Wave 10B — void', () => {
  it('void ບິນທີ່ຍັງບໍ່ຈ່າຍ; ບິນທີ່ຈ່າຍແລ້ວ void ບໍ່ໄດ້; ຮັບຊຳລະບິນ void ບໍ່ໄດ້', async () => {
    const start = new Date(Date.now() + 41 * 86_400_000);
    const appt = await prisma.appointment.create({
      data: { branchId: BRANCH_ID, customerId, staffProfileId, serviceId: SERVICE_ID, startAt: start, endAt: new Date(start.getTime() + 45 * 60_000), totalAmount: AMOUNT },
    });
    const created = await request(app).post('/api/v1/payments').set(...bearer(adminToken)).set(...idem()).send({ appointmentId: appt.id });
    const pid = created.body.data.id as string;
    await request(app).post(`/api/v1/payments/${pid}/void`).set(...bearer(adminToken)).send({ reason: 'x' }).expect(400); // reason ສັ້ນ
    const v = await request(app).post(`/api/v1/payments/${pid}/void`).set(...bearer(adminToken)).send({ reason: 'duplicate bill' });
    expect(v.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).toBe('VOIDED');
    await request(app).post(`/api/v1/payments/${pid}/void`).set(...bearer(adminToken)).send({ reason: 'duplicate bill' }).expect(409);
    await request(app).post(`/api/v1/payments/${pid}/tenders`).set(...bearer(adminToken)).set(...idem()).send({ tenders: [{ method: 'CASH', amount: 1000 }] }).expect(400);

    const { id: paidId } = await paidBill();
    await request(app).post(`/api/v1/payments/${paidId}/void`).set(...bearer(adminToken)).send({ reason: 'oops wrong' }).expect(400);
    await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => undefined);
  });
});

describe('Wave 10B — ໃບຮັບເງິນ + ລາຍງານ VAT', () => {
  it('ໃບຮັບເງິນ: ເຈົ້າຂອງ/ພະນັກງານເຫັນໄດ້, ລູກຄ້າຄົນອື່ນ 403; ມີ verifyCode', async () => {
    const { id, view } = await paidBill();
    const r = await request(app).get(`/api/v1/payments/${id}/receipt`).set(...bearer(customerToken));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ invoiceNo: view.invoiceNo, total: AMOUNT, taxAmount: 20_000, netAmount: 200_000 });
    expect(r.body.data.lines[0].amount).toBe(AMOUNT);
    expect(r.body.data.verifyCode).toMatch(/^[0-9A-F]{16}$/);
    await request(app).get(`/api/v1/payments/${id}/receipt`).set(...bearer(otherToken)).expect(403);
    await request(app).get(`/api/v1/payments/${id}/receipt`).set(...bearer(adminToken)).expect(200);
  });

  it('ລາຍງານ VAT ປະຈຳເດືອນ: ພາສີຂາອອກ − ໃບຄືນເງິນ', async () => {
    const now = new Date(Date.now() + 7 * 3_600_000);
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const rep = await request(app).get(`/api/v1/payments/vat-report?month=${month}&branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    expect(rep.status).toBe(200);
    const d = rep.body.data;
    expect(d.vat).toMatchObject({ enabled: true, rate: 0.1 });
    expect(d.outputTax).toBeGreaterThanOrEqual(20_000);
    expect(d.creditNotes).toBeGreaterThanOrEqual(1);
    expect(d.netTaxPayable).toBe(d.outputTax - d.creditTax);
    expect(d.days.length).toBeGreaterThan(0);
    await request(app).get(`/api/v1/payments/vat-report?month=2026-13`).set(...bearer(adminToken)).expect(400);
    await request(app).get(`/api/v1/payments/vat-report?month=${month}`).set(...bearer(customerToken)).expect(403);
  });
});
