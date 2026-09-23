import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Wave 10C: ເງິນສົດຕ້ອງຜູກກັບກະລິ້ນຊັກ · Z-report (ເລກ Z ຕໍ່ເນື່ອງ + snapshot) · ລາຍງານ over/short.
 * ໃຊ້ສາຂາຊົ່ວຄາວຂອງໄຟລ໌ນີ້ເອງ (ກະລິ້ນຊັກມີໄດ້ 1 ກະເປີດ/ສາຂາ) ແລະ mock ນະໂຍບາຍ 'finance-cash' ສະເພາະ process ນີ້
 * (test ຮັນແບບ fork ແຍກໄຟລ໌ — ບໍ່ກະທົບໄຟລ໌ອື່ນທີ່ຮັບເງິນສົດຂະໜານກັນ).
 */
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const CUSTOMER_PHONE = '02077740001';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const AMOUNT = 220_000;

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

let app: Express;
let adminToken = '';
let customerId = '';
let staffProfileId = '';
let branchId = '';
let adminName = '';

async function newBill(): Promise<string> {
  const start = new Date(Date.now() + 45 * 86_400_000);
  const appt = await prisma.appointment.create({
    data: { branchId, customerId, staffProfileId, serviceId: SERVICE_ID, startAt: start, endAt: new Date(start.getTime() + 45 * 60_000), status: 'COMPLETED', totalAmount: AMOUNT },
  });
  const created = await request(app).post('/api/v1/payments').set(...bearer(adminToken)).set(...idem()).send({ appointmentId: appt.id });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
}
const payCash = (id: string, amount = AMOUNT) =>
  request(app).post(`/api/v1/payments/${id}/tenders`).set(...bearer(adminToken)).set(...idem()).send({ tenders: [{ method: 'CASH', amount }] });
const openDrawer = (float: number) =>
  request(app).post('/api/v1/payments-treasury/cash-drawer/sessions').set(...bearer(adminToken)).send({ branchId, openingFloat: float });
const closeDrawer = (id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/payments-treasury/cash-drawer/sessions/${id}/close`).set(...bearer(adminToken)).send(body);

async function cleanup(): Promise<void> {
  const br = await prisma.branch.findMany({ where: { name: 'Z-Test Branch' }, select: { id: true } });
  const bids = br.map((b) => b.id);
  const pays = await prisma.payment.findMany({ where: { branchId: { in: bids } }, select: { id: true, appointmentId: true } });
  const pids = pays.map((p) => p.id);
  await prisma.refund.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.payment.deleteMany({ where: { id: { in: pids } } });
  await prisma.staffCommission.deleteMany({ where: { appointment: { branchId: { in: bids } } } });
  await prisma.queueTicket.deleteMany({ where: { appointment: { branchId: { in: bids } } } });
  await prisma.appointment.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.cashDrawerSession.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.documentSequence.deleteMany({ where: { branchId: { in: bids } } });
  await prisma.branch.deleteMany({ where: { id: { in: bids } } });
  const users = await prisma.user.findMany({ where: { phone: CUSTOMER_PHONE }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccount: { userId: { in: uids } } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  // ບັງຄັບນະໂຍບາຍ requireOpenDrawer=true ສະເພາະ process ນີ້ (ໄຟລ໌ອື່ນໃຊ້ຄ່າ env ຂອງ .env.test = false)
  const original = prisma.appSetting.findUnique.bind(prisma.appSetting);
  vi.spyOn(prisma.appSetting, 'findUnique').mockImplementation(((args: { where: { key?: string } }) =>
    args?.where?.key === 'finance-cash'
      ? Promise.resolve({ key: 'finance-cash', value: { requireOpenDrawer: true } })
      : original(args as never)) as never);

  adminToken = (await request(app).post('/api/v1/auth/login').send(ADMIN)).body.data.tokens.accessToken;
  adminName = (await prisma.user.findUniqueOrThrow({ where: { phone: ADMIN.phone } })).name;
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Z Customer', phone: CUSTOMER_PHONE, password: 'Passw0rd!x' });
  customerId = reg.body.data.user.id;
  staffProfileId = (await prisma.staffProfile.findFirstOrThrow()).id;
  const template = await prisma.branch.findFirstOrThrow();
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = template as Record<string, unknown> & { id: string };
  branchId = (await prisma.branch.create({ data: { ...(rest as object), name: 'Z-Test Branch', code: 'ZT' } as never })).id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

describe('Wave 10C — ເງິນສົດຕ້ອງມີກະລິ້ນຊັກເປີດຢູ່', () => {
  it('ຮັບເງິນສົດ/ຈ່າຍຄືນເງິນສົດ ໂດຍບໍ່ມີກະເປີດ → 409 CASH_DRAWER_REQUIRED', async () => {
    const id = await newBill();
    const r = await payCash(id);
    expect(r.status).toBe(409);
    expect(r.body.error?.code ?? r.body.code).toBe('CASH_DRAWER_REQUIRED');
  });

  it('policy endpoint: ອ່ານໄດ້, ແກ້ໄດ້ສະເພາະ SUPER_ADMIN', async () => {
    const g = await request(app).get('/api/v1/payments-treasury/cash-drawer/policy').set(...bearer(adminToken));
    expect(g.status).toBe(200);
    expect(g.body.data.requireOpenDrawer).toBe(true);
    await request(app).get('/api/v1/payments-treasury/cash-drawer/policy').expect(401);
  });
});

describe('Wave 10C — Z-report', () => {
  let sessionId = '';
  let zNo = '';
  let invoiceNo = '';

  it('ເປີດກະ → ຮັບເງິນສົດໄດ້ → ຄືນເງິນສົດບາງສ່ວນ → PAYIN → Z-report ເບິ່ງລ່ວງໜ້າ (live)', async () => {
    const open = await openDrawer(500_000);
    expect(open.status).toBe(201);
    sessionId = open.body.data.id;

    const id = await newBill();
    const paid = await payCash(id);
    expect(paid.status).toBe(200);
    invoiceNo = paid.body.data.invoiceNo;

    const rf = await request(app).post(`/api/v1/payments/${id}/refunds`).set(...bearer(adminToken)).send({ amount: 100_000, reason: 'z test refund' });
    expect(rf.status).toBe(201);
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({}).expect(200);

    await request(app).post(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/movements`).set(...bearer(adminToken)).send({ type: 'PAYIN', amount: 20_000 }).expect(200);

    const live = await request(app).get(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/z-report`).set(...bearer(adminToken));
    expect(live.status).toBe(200);
    expect(live.body.data.isLive).toBe(true);
    expect(live.body.data.zNo).toBeNull();
    expect(live.body.data.cash.expected).toBe(500_000 + AMOUNT - 100_000 + 20_000);
  });

  it('ປິດກະ → ອອກເລກ Z + snapshot; ຫຼັງປິດ ບໍ່ປ່ຽນເຖິງຈະມີໃບຄືນເງິນໃໝ່', async () => {
    const expected = 500_000 + AMOUNT - 100_000 + 20_000;
    const closed = await closeDrawer(sessionId, { countedAmount: expected });
    expect(closed.status).toBe(200);
    const row = await prisma.cashDrawerSession.findUniqueOrThrow({ where: { id: sessionId } });
    zNo = row.zNo ?? '';
    expect(zNo).toMatch(/^Z-ZT-\d{4}-\d{6}$/);

    const z = await request(app).get(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/z-report`).set(...bearer(adminToken));
    const d = z.body.data;
    expect(d).toMatchObject({ zNo, isLive: false, branchName: 'Z-Test Branch' });
    expect(d.sales).toEqual([{ method: 'CASH', count: 1, amount: AMOUNT }]);
    expect(d.invoices).toMatchObject({ count: 1, first: invoiceNo, last: invoiceNo, gross: AMOUNT });
    expect(d.refunds).toMatchObject({ count: 1, total: 100_000, payout: 100_000, storeCredit: 0 });
    expect(d.cash).toMatchObject({ openingFloat: 500_000, cashSales: AMOUNT, cashRefunds: 100_000, payIns: 20_000, expected, counted: expected, variance: 0 });

    // ຫຼັງປິດກະ: ຄືນເງິນຕໍ່ (ຕ້ອງເປີດກະໃໝ່ກ່ອນ ຈຶ່ງຈ່າຍເງິນສົດໄດ້) — snapshot ຂອງກະເກົ່າຕ້ອງຄືເກົ່າ
    const again = await request(app).get(`/api/v1/payments-treasury/cash-drawer/sessions/${sessionId}/z-report`).set(...bearer(adminToken));
    expect(again.body.data.generatedAt).toBe(d.generatedAt);
  });

  it('ຈ່າຍຄືນເງິນສົດຫຼັງປິດກະ (ບໍ່ມີກະເປີດ) → 409; ເປີດກະໃໝ່ແລ້ວຈຶ່ງຈ່າຍໄດ້ ແລະ ຢູ່ໃນກະໃໝ່', async () => {
    const pay = await prisma.payment.findFirstOrThrow({ where: { branchId, invoiceNo } });
    const rf = await request(app).post(`/api/v1/payments/${pay.id}/refunds`).set(...bearer(adminToken)).send({ amount: 50_000, reason: 'late refund' });
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    const blocked = await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({});
    expect(blocked.status).toBe(409);
    const s2 = await openDrawer(100_000);
    expect(s2.status).toBe(201);
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({}).expect(200);
    const live = await request(app).get(`/api/v1/payments-treasury/cash-drawer/sessions/${s2.body.data.id}/z-report`).set(...bearer(adminToken));
    expect(live.body.data.refunds.total).toBe(50_000);
    // ປິດກະນີ້ດ້ວຍຍອດຂາດ 5,000 (ຕ້ອງມີໝາຍເຫດ) — ໃຊ້ໃນ test ລາຍງານ over/short
    const expected = 100_000 - 50_000;
    await closeDrawer(s2.body.data.id, { countedAmount: expected - 5_000 }).expect(400); // ບໍ່ມີໝາຍເຫດ
    await closeDrawer(s2.body.data.id, { countedAmount: expected - 5_000, note: 'short 5k' }).expect(200);
  });

  it('ລາຍງານ over/short ຕາມພະນັກງານ + ສາຂາ', async () => {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const rep = await request(app).get(`/api/v1/payments-treasury/cash-drawer/variance-report?from=${today}&to=${today}&branchId=${branchId}`).set(...bearer(adminToken));
    expect(rep.status).toBe(200);
    const d = rep.body.data;
    expect(d).toMatchObject({ totalSessions: 2, net: -5_000, over: 0, short: 5_000 });
    expect(d.byStaff[0]).toMatchObject({ name: adminName, sessions: 2, sessionsWithVariance: 1, short: 5_000, worst: -5_000 });
    expect(d.byBranch[0]).toMatchObject({ name: 'Z-Test Branch', net: -5_000 });
    await request(app).get(`/api/v1/payments-treasury/cash-drawer/variance-report?from=bad&to=${today}`).set(...bearer(adminToken)).expect(400);
  });
});
