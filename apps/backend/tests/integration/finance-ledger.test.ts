import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';
import { expireLoyaltyPoints, recognizeGiftCardBreakage, refreshFxRates } from '../../src/modules/finance-ledger/maintenance.js';
import { splitEvenly } from '../../src/modules/finance-ledger/gratuity.service.js';

/**
 * Integration — Wave 11: service charge · no-show / late-cancel fee · ທິບ · ຄະແນນໝົດອາຍຸ · breakage ·
 * FX feed · ໜີ້ສິນ (IFRS 15) · journal export. ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const CUSTOMER_PHONE = '02077740001';
const POINTS_PHONE = '02077740002';
const BA_PHONE = '02077740003';
const BA_PASSWORD = 'Branch@12345';
const GC_EMAIL = 'wave11-test@example.com';
const AMOUNT = 220_000;

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

let app: Express;
let adminToken = '';
let baToken = '';
let customerId = '';
let pointsUserId = '';
let staffProfileId = '';
let savedRates: { baseCurrency: string; rate: unknown; source: string; locked: boolean }[] = [];

async function login(phone: string, password: string): Promise<string> {
  const r = await request(app).post('/api/v1/auth/login').send({ phone, password });
  return r.body.data.tokens.accessToken as string;
}

async function appointment(opts: { startInMs: number; status?: 'CONFIRMED' | 'COMPLETED' }) {
  const start = new Date(Date.now() + opts.startInMs);
  return prisma.appointment.create({
    data: {
      branchId: BRANCH_ID,
      customerId,
      staffProfileId,
      serviceId: SERVICE_ID,
      startAt: start,
      endAt: new Date(start.getTime() + 45 * 60_000),
      status: opts.status ?? 'CONFIRMED',
      totalAmount: AMOUNT,
    },
  });
}

async function bill(appointmentId: string, tenders?: Array<Record<string, unknown>>) {
  const created = await request(app).post('/api/v1/payments').set(...bearer(adminToken)).set(...idem()).send({ appointmentId });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  if (!tenders) return created.body.data;
  const paid = await request(app).post(`/api/v1/payments/${id}/tenders`).set(...bearer(adminToken)).set(...idem()).send({ tenders });
  expect(paid.status).toBe(200);
  return paid.body.data;
}

const setPolicy = (body: Record<string, unknown>) =>
  request(app).put('/api/v1/finance-ledger/policy').set(...bearer(adminToken)).send(body);

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { phone: { in: [CUSTOMER_PHONE, POINTS_PHONE, BA_PHONE] } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const appts = await prisma.appointment.findMany({ where: { customerId: { in: uids } }, select: { id: true } });
  const aids = appts.map((a) => a.id);
  const pids = (await prisma.payment.findMany({ where: { appointmentId: { in: aids } }, select: { id: true } })).map((p) => p.id);
  await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccount: { userId: { in: uids } } } });
  await prisma.refund.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.gratuity.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: pids } } });
  await prisma.payment.deleteMany({ where: { id: { in: pids } } });
  await prisma.giftCardTransaction.deleteMany({ where: { giftCard: { recipientEmail: GC_EMAIL } } });
  await prisma.giftCard.deleteMany({ where: { recipientEmail: GC_EMAIL } });
  await prisma.stockReservation.deleteMany({ where: { appointmentId: { in: aids } } }).catch(() => undefined);
  await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
  await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
  await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.appSetting.deleteMany({ where: { key: { in: ['finance.policy', 'finance.accounts'] } } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  adminToken = await login(ADMIN.phone, ADMIN.password);
  const reg = async (phone: string) =>
    request(app).post('/api/v1/auth/register').send({ name: `W11 ${phone}`, phone, password: 'Passw0rd!x' });
  customerId = (await reg(CUSTOMER_PHONE)).body.data.user.id;
  pointsUserId = (await reg(POINTS_PHONE)).body.data.user.id;
  await prisma.user.create({
    data: { name: 'BA', phone: BA_PHONE, password: await hashPassword(BA_PASSWORD), role: 'BRANCH_ADMIN', branchId: BRANCH_ID },
  });
  baToken = await login(BA_PHONE, BA_PASSWORD);
  staffProfileId = (await prisma.staffProfile.findFirstOrThrow({ where: { user: { branchId: BRANCH_ID } } })).id;
  savedRates = await prisma.exchangeRate.findMany({ where: { baseCurrency: { in: ['USD', 'THB'] }, targetCurrency: 'LAK' } });
});

afterAll(async () => {
  await cleanup();
  await prisma.exchangeRate.deleteMany({ where: { baseCurrency: { in: ['USD', 'THB'] }, targetCurrency: 'LAK' } });
  for (const r of savedRates) {
    await prisma.exchangeRate.create({ data: { baseCurrency: r.baseCurrency, targetCurrency: 'LAK', rate: r.rate as never, source: r.source, locked: r.locked } });
  }
  await prisma.$disconnect();
});

describe('Wave 11 — policy & permissions', () => {
  it('ຄ່າ default + BRANCH_ADMIN ປ່ຽນນະໂຍບາຍບໍ່ໄດ້', async () => {
    const r = await request(app).get('/api/v1/finance-ledger/policy').set(...bearer(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.data.noShowFeePercent).toBe(100);
    const ba = await request(app).put('/api/v1/finance-ledger/policy').set(...bearer(baToken)).send({ serviceChargePercent: 5 });
    expect(ba.status).toBe(403);
    const bad = await setPolicy({ serviceChargePercent: 50 });
    expect(bad.status).toBe(400);
  });

  it('ຜັງບັນຊີ merge ກັບ default', async () => {
    const r = await request(app).put('/api/v1/finance-ledger/accounts').set(...bearer(adminToken)).send({ cash: { code: '1111' } });
    expect(r.status).toBe(200);
    expect(r.body.data.cash).toEqual({ code: '1111', name: 'Cash on hand' });
    expect(r.body.data.bank.code).toBe('1010');
  });
});

describe('Wave 11 — service charge (F-19)', () => {
  it('ບວກ % ຄ່າບໍລິການເທິງບິນ ແລະ ຢຸດອັດຕາໄວ້', async () => {
    expect((await setPolicy({ serviceChargePercent: 10 })).status).toBe(200);
    const a = await appointment({ startInMs: 20 * 86_400_000, status: 'COMPLETED' });
    const view = await bill(a.id);
    expect(view.serviceChargeAmount).toBe(22_000);
    expect(view.serviceChargeRate).toBe(0.1);
    expect(view.totalAmount).toBe(242_000);
    await setPolicy({ serviceChargePercent: 0 });
  });
});

describe('Wave 11 — cancellation fees (F-20)', () => {
  it('NO_SHOW ຢຶດມັດຈຳ 100% ແລະ ຈຳກັດຍອດທີ່ຄືນໄດ້', async () => {
    const a = await appointment({ startInMs: 3 * 86_400_000 });
    const created = await bill(a.id);
    const deposit = created.depositAmount as number;
    const paid = await bill(a.id, [{ method: 'CASH', amount: deposit + 6_000 }]);
    expect(paid.paymentStatus).toBe('DEPOSIT_PAID');

    const st = await request(app).patch(`/api/v1/appointments/${a.id}/status`).set(...bearer(adminToken)).send({ status: 'NO_SHOW' });
    expect(st.status).toBe(200);
    const p = await prisma.payment.findUniqueOrThrow({ where: { appointmentId: a.id } });
    expect(p.forfeitKind).toBe('NO_SHOW');
    expect(p.forfeitedAmount.toNumber()).toBe(deposit);

    const over = await request(app).post(`/api/v1/payments/${p.id}/refunds`).set(...bearer(adminToken)).send({ amount: 10_000, reason: 'refund rest' });
    expect(over.status).toBe(400);
    const ok = await request(app).post(`/api/v1/payments/${p.id}/refunds`).set(...bearer(adminToken)).send({ amount: 6_000, reason: 'refund rest' });
    expect(ok.status).toBe(201);
  });

  it('ຍົກເລີກພາຍໃນ window → LATE_CANCEL 50%; waiveFee → ບໍ່ຢຶດ; ຍົກເລີກກ່ອນ window → ບໍ່ຢຶດ', async () => {
    const late = await appointment({ startInMs: 60 * 60_000 });
    const lb = await bill(late.id);
    await bill(late.id, [{ method: 'CASH', amount: lb.depositAmount }]);
    await request(app).patch(`/api/v1/appointments/${late.id}/status`).set(...bearer(adminToken)).send({ status: 'CANCELLED' }).expect(200);
    const lp = await prisma.payment.findUniqueOrThrow({ where: { appointmentId: late.id } });
    expect(lp.forfeitKind).toBe('LATE_CANCEL');
    expect(lp.forfeitedAmount.toNumber()).toBe(Math.round(lb.depositAmount * 50) / 100);

    const waived = await appointment({ startInMs: 60 * 60_000 });
    const wb = await bill(waived.id);
    await bill(waived.id, [{ method: 'CASH', amount: wb.depositAmount }]);
    await request(app).patch(`/api/v1/appointments/${waived.id}/status`).set(...bearer(adminToken)).send({ status: 'CANCELLED', waiveFee: true }).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { appointmentId: waived.id } })).forfeitedAmount.toNumber()).toBe(0);

    const early = await appointment({ startInMs: 5 * 86_400_000 });
    const eb = await bill(early.id);
    await bill(early.id, [{ method: 'CASH', amount: eb.depositAmount }]);
    await request(app).patch(`/api/v1/appointments/${early.id}/status`).set(...bearer(adminToken)).send({ status: 'CANCELLED' }).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { appointmentId: early.id } })).forfeitKind).toBeNull();
  });
});

describe('Wave 11 — gratuities (F-19)', () => {
  it('splitEvenly ລວມໄດ້ພໍດີ', () => {
    expect(splitEvenly(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitEvenly(100_000, 3).reduce((s, x) => s + x, 0)).toBe(100_000);
  });

  it('ບັນທຶກທິບ → ຊ່າງຂອງນັດໄດ້ສ່ວນແບ່ງ; ບໍ່ກະທົບຍອດບິນ; ຈ່າຍອອກ', async () => {
    const a = await appointment({ startInMs: 21 * 86_400_000, status: 'COMPLETED' });
    const view = await bill(a.id, [{ method: 'CASH', amount: AMOUNT }]);
    expect(view.paymentStatus).toBe('FULLY_PAID');
    const tip = await request(app)
      .post(`/api/v1/finance-ledger/payments/${view.id}/gratuities`)
      .set(...bearer(adminToken))
      .send({ method: 'CASH', amount: 30_000 });
    expect(tip.status).toBe(201);
    expect(tip.body.data.shares).toHaveLength(1);
    expect(tip.body.data.shares[0].staffProfileId).toBe(staffProfileId);

    const pay = await request(app).get(`/api/v1/payments/${view.id}`).set(...bearer(adminToken));
    expect(pay.body.data.totalAmount).toBe(AMOUNT);
    expect(pay.body.data.gratuityAmount).toBe(30_000);

    const bad = await request(app)
      .post(`/api/v1/finance-ledger/payments/${view.id}/gratuities`)
      .set(...bearer(adminToken))
      .send({ method: 'CASH', amount: 10_000, shares: [{ staffProfileId, amount: 5_000 }] });
    expect(bad.status).toBe(400);

    const list = await request(app).get('/api/v1/finance-ledger/gratuities?status=unpaid').set(...bearer(adminToken));
    const mine = list.body.data.byStaff.find((s: { staffProfileId: string }) => s.staffProfileId === staffProfileId);
    expect(mine.unpaid).toBeGreaterThanOrEqual(30_000);

    const out = await request(app).post('/api/v1/finance-ledger/gratuities/payout').set(...bearer(adminToken)).send({ staffProfileId, method: 'PAYROLL' });
    expect(out.status).toBe(200);
    expect(out.body.data.amount).toBeGreaterThanOrEqual(30_000);
    const again = await request(app).post('/api/v1/finance-ledger/gratuities/payout').set(...bearer(adminToken)).send({ staffProfileId, method: 'PAYROLL' });
    expect(again.status).toBe(400);
  });
});

describe('Wave 11 — points expiry (F-13) & gift card breakage (F-12)', () => {
  it('ຄະແນນເກົ່າກວ່າ N ເດືອນ ທີ່ຍັງບໍ່ໃຊ້ ໝົດອາຍຸແບບ FIFO + idempotent', async () => {
    const acc = await prisma.loyaltyAccount.upsert({
      where: { userId: pointsUserId },
      create: { userId: pointsUserId, points: 120 },
      update: { points: 120 },
    });
    const old = new Date(Date.now() - 800 * 86_400_000);
    await prisma.loyaltyTransaction.createMany({
      data: [
        { loyaltyAccountId: acc.id, type: 'EARN', points: 100, refId: 'w11-old', createdAt: old },
        { loyaltyAccountId: acc.id, type: 'REDEEM', points: -30, refId: 'w11-redeem' },
        { loyaltyAccountId: acc.id, type: 'EARN', points: 50, refId: 'w11-new' },
      ],
    });
    await expireLoyaltyPoints();
    const after = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(after.points).toBe(50);
    const exp = await prisma.loyaltyTransaction.findFirstOrThrow({ where: { loyaltyAccountId: acc.id, type: 'EXPIRE' } });
    expect(exp.points).toBe(-70);
    await expireLoyaltyPoints();
    expect((await prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: acc.id } })).points).toBe(50);
  });

  it('ບັດໝົດອາຍຸ → EXPIRED + breakage ຮັບຮູ້ຍອດຄົງເຫຼືອ', async () => {
    const card = await prisma.giftCard.create({
      data: {
        branchId: BRANCH_ID,
        code: `W11-${Date.now()}`,
        initialBalance: 100_000,
        currentBalance: 40_000,
        recipientEmail: GC_EMAIL,
        expireDate: new Date(Date.now() - 86_400_000),
      },
    });
    await recognizeGiftCardBreakage();
    const after = await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.status).toBe('EXPIRED');
    expect(after.breakageAmount.toNumber()).toBe(40_000);
    expect(after.currentBalance.toNumber()).toBe(0);
    const tx = await prisma.giftCardTransaction.findFirstOrThrow({ where: { giftCardId: card.id, isBreakage: true } });
    expect(tx.amount.toNumber()).toBe(-40_000);
  });
});

describe('Wave 11 — FX feed (F-10)', () => {
  it('ອັບເດດສະກຸນທີ່ບໍ່ລັອກ, ຂ້າມອັດຕາທີ່ລັອກ', async () => {
    await setPolicy({ fxCurrencies: ['USD', 'THB'] });
    await request(app).put('/api/v1/finance-ledger/fx').set(...bearer(adminToken)).send({ currency: 'THB', rate: 650, locked: true }).expect(200);
    await prisma.exchangeRate.updateMany({ where: { baseCurrency: 'USD', targetCurrency: 'LAK' }, data: { locked: false } });
    const out = await refreshFxRates({ force: true, fetcher: async () => ({ USD: 1 / 21_500, THB: 1 / 600 }) });
    expect(out.updated).toEqual(['USD']);
    expect(out.skippedLocked).toEqual(['THB']);
    const usd = await prisma.exchangeRate.findUniqueOrThrow({ where: { baseCurrency_targetCurrency: { baseCurrency: 'USD', targetCurrency: 'LAK' } } });
    expect(usd.rate.toNumber()).toBeCloseTo(21_500, 2);
    expect(usd.source).toBe('FEED');
    const thb = await prisma.exchangeRate.findUniqueOrThrow({ where: { baseCurrency_targetCurrency: { baseCurrency: 'THB', targetCurrency: 'LAK' } } });
    expect(thb.rate.toNumber()).toBe(650);

    const off = await refreshFxRates({ fetcher: async () => ({}) });
    expect(off.updated).toEqual([]);
    const failed = await refreshFxRates({ force: true, fetcher: async () => { throw new Error('offline'); } });
    expect(failed.failed).toBe('offline');
  });
});

describe('Wave 11 — liabilities & journal (F-09/F-11/F-17)', () => {
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  it('ລາຍງານໜີ້ສິນ', async () => {
    const r = await request(app).get('/api/v1/finance-ledger/liabilities').set(...bearer(adminToken));
    expect(r.status).toBe(200);
    const v = r.body.data;
    expect(v.recognized.cancellationFees).toBeGreaterThan(0);
    expect(v.recognized.breakage).toBeGreaterThanOrEqual(40_000);
    expect(v.total).toBeCloseTo(
      v.customerDeposits.amount + v.giftCards.amount + v.packages.amount + v.loyaltyPoints.amount + v.tipsPayable.amount,
      2,
    );
  });

  it('journal ສົມດຸນ ແລະ ມີທຸກປະເພດທີ່ເກີດມື້ນີ້; CSV ດາວໂຫຼດໄດ້', async () => {
    const r = await request(app).get(`/api/v1/finance-ledger/journal?from=${today}&to=${today}`).set(...bearer(adminToken));
    expect(r.status).toBe(200);
    const j = r.body.data;
    expect(j.balanced).toBe(true);
    for (const e of j.entries) {
      const dr = e.lines.reduce((s: number, l: { debit: number }) => s + l.debit, 0);
      const cr = e.lines.reduce((s: number, l: { credit: number }) => s + l.credit, 0);
      expect(Math.abs(dr - cr)).toBeLessThan(0.01);
    }
    const sources = new Set(j.entries.map((e: { source: string }) => e.source));
    for (const s of ['RECEIPT', 'REVENUE', 'FORFEIT', 'GRATUITY', 'GRATUITY_PAYOUT', 'BREAKAGE']) expect([s, sources.has(s)]).toEqual([s, true]);

    const csv = await request(app).get(`/api/v1/finance-ledger/journal?from=${today}&to=${today}&format=csv`).set(...bearer(adminToken));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('date,entry_no,source,ref,branch,account,account_name,debit,credit,memo');

    const bad = await request(app).get('/api/v1/finance-ledger/journal?from=2025-01-01&to=2026-12-31').set(...bearer(adminToken));
    expect(bad.status).toBe(400);
  });
});
