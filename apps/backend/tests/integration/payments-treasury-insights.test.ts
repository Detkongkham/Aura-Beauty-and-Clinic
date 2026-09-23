import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { vientianeDateKey, vientianeDayStart } from '../../src/utils/dateHelpers.js';

/**
 * Integration — GET /payments-treasury/bank-accounts/insights (ໜ້າ /payments/banks).
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_NAME = 'ສາຂາທົດສອບ insights ບັນຊີ';
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const DAY_MS = 24 * 60 * 60_000;
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

describe('payments-treasury: bank-account insights', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let branchId: string;
  let accountId: string;
  let paymentId: string;
  const todayKey = vientianeDateKey(new Date());
  // 10:00 ວຽງຈັນ ຂອງ n ມື້ກ່ອນ
  const at = (daysAgo: number) =>
    new Date(vientianeDayStart(new Date(todayKey.getTime() - daysAgo * DAY_MS)).getTime() + 3 * 60 * 60_000);

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await prisma.branch.deleteMany({ where: { name: BRANCH_NAME } });
    superToken = await login('02000000000', 'Admin@12345');
    branchAdminToken = await login('02000000001', 'Manager@12345');

    const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
    branchId = (await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'ທົດສອບ', phone: '02096666666' } })).id;
    accountId = (
      await prisma.bankAccount.create({
        data: { bankId: bcel.id, branchId, accountName: 'Insights Test', accountNumber: '999888777', isDefault: true },
      })
    ).id;
    paymentId = (await prisma.payment.create({ data: { branchId, totalAmount: 900000 } })).id;

    const tx = (amount: number, daysAgo: number, extra: Record<string, unknown> = {}) =>
      prisma.paymentTransaction.create({
        data: { paymentId, method: 'BANK_TRANSFER', amount, bankAccountId: accountId, createdAt: at(daysAgo), ...extra },
      });
    await tx(100000, 0); // ມື້ນີ້
    await tx(50000, 2); // ໃນຊ່ວງ 7 ມື້
    await tx(70000, 9); // ຊ່ວງກ່ອນໜ້າ (8–14 ມື້ກ່ອນ)
    await tx(999999, 1, { status: 'FAILED' }); // ບໍ່ນັບ
    await tx(20000, 1, { bankAccountId: null }); // ບໍ່ຜູກບັນຊີ → unassigned

    // statement ຂອງ 2 ມື້ກ່ອນ ກົງກັນ; ມື້ນີ້ຍັງບໍ່ປ້ອນ → unreconciled 1
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } });
    await prisma.bankStatementEntry.create({
      data: {
        bankAccountId: accountId,
        statementDate: new Date(todayKey.getTime() - 2 * DAY_MS),
        statementCredit: 50000,
        statementDebit: 0,
        enteredById: admin.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.bankStatementEntry.deleteMany({ where: { bankAccountId: accountId } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.bankAccount.deleteMany({ where: { id: accountId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it('ເງິນເຂົ້າມື້ນີ້/ຊ່ວງ/ຊ່ວງກ່ອນ, ເສັ້ນລາຍວັນ, ກະທົບຍອດ ແລະ ເງິນບໍ່ຜູກບັນຊີ', async () => {
    const res = await request(app)
      .get('/api/v1/payments-treasury/bank-accounts/insights')
      .query({ days: 7, branchId })
      .set(...bearer(superToken));
    expect(res.status).toBe(200);
    const view = res.body.data;
    expect(view.days).toBe(7);
    expect(view.to).toBe(dateKey(todayKey));
    expect(view.from).toBe(dateKey(new Date(todayKey.getTime() - 6 * DAY_MS)));
    expect(view.accounts).toHaveLength(1);

    const a = view.accounts[0];
    expect(a).toMatchObject({
      bankAccountId: accountId,
      receivedToday: 100000,
      receivedTodayCount: 1,
      receivedPeriod: 150000,
      receivedPeriodCount: 2,
      receivedPrevPeriod: 70000,
      paidOutPeriod: 0,
      openSlips: 0,
      pendingIntents: 0,
      lastStatementDate: dateKey(new Date(todayKey.getTime() - 2 * DAY_MS)),
      unreconciledDays: 1,
      varianceDays: 0,
    });
    expect(a.daily).toHaveLength(7);
    expect(a.daily[6]).toBe(100000);
    expect(a.daily[4]).toBe(50000);
    expect(new Date(a.lastReceivedAt).getTime()).toBe(at(0).getTime());

    expect(view.totals).toMatchObject({ receivedPeriod: 150000, receivedToday: 100000, unreconciledDays: 1 });
    expect(view.unassigned).toEqual({ amount: 20000, count: 1 });
  });

  it('statement ບໍ່ກົງກັບລະບົບ → varianceDays; days ບໍ່ຖືກ → 400', async () => {
    await prisma.bankStatementEntry.updateMany({ where: { bankAccountId: accountId }, data: { statementCredit: 40000 } });
    const res = await request(app)
      .get('/api/v1/payments-treasury/bank-accounts/insights')
      .query({ days: 7, branchId })
      .set(...bearer(superToken));
    expect(res.body.data.accounts[0]).toMatchObject({ varianceDays: 1, unreconciledDays: 1 });

    const bad = await request(app)
      .get('/api/v1/payments-treasury/bank-accounts/insights')
      .query({ days: 12 })
      .set(...bearer(superToken));
    expect(bad.status).toBe(400);
  });

  it('BRANCH_ADMIN ເຫັນສະເພາະສາຂາຕົນ; ຂໍສາຂາອື່ນ → 403', async () => {
    const own = await request(app).get('/api/v1/payments-treasury/bank-accounts/insights').set(...bearer(branchAdminToken));
    expect(own.status).toBe(200);
    const ownIds: string[] = own.body.data.accounts.map((a: { bankAccountId: string }) => a.bankAccountId);
    expect(ownIds).not.toContain(accountId);
    const homeIds = (await prisma.bankAccount.findMany({ where: { branchId: HOME_BRANCH_ID }, select: { id: true } })).map((a) => a.id);
    expect(ownIds.every((id) => homeIds.includes(id))).toBe(true);

    const other = await request(app)
      .get('/api/v1/payments-treasury/bank-accounts/insights')
      .query({ branchId })
      .set(...bearer(branchAdminToken));
    expect(other.status).toBe(403);
  });
});
