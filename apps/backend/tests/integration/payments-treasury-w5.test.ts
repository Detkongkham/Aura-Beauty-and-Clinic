import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { vientianeDateKey } from '../../src/utils/dateHelpers.js';

/**
 * Integration — Module 39 W5 backend: provider config, slip settings, QR upload, reconciliation.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_NAME = 'ສາຂາທົດສອບກະທົບຍອດ';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

describe('payments-treasury W5: providers, settings, QR, reconciliation', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let otherBranchId: string;
  let accountId: string;
  let homeAccountId: string;
  let paymentId: string;
  const today = dateKey(vientianeDateKey(new Date()));

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await prisma.bankAccountChangeRequest.deleteMany({ where: { branch: { name: BRANCH_NAME } } });
    await prisma.branch.deleteMany({ where: { name: BRANCH_NAME } });
    superToken = await login('02000000000', 'Admin@12345');
    branchAdminToken = await login('02000000001', 'Manager@12345');

    const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
    const branch = await prisma.branch.create({
      data: { name: BRANCH_NAME, address: 'ທົດສອບ', phone: '02097777777' },
    });
    otherBranchId = branch.id;
    accountId = (
      await prisma.bankAccount.create({
        data: { bankId: bcel.id, branchId: branch.id, accountName: 'Recon Test', accountNumber: '111222333', isDefault: true },
      })
    ).id;
    homeAccountId = (
      await prisma.bankAccount.findFirstOrThrow({ where: { branchId: HOME_BRANCH_ID, isActive: true } })
    ).id;
    paymentId = (await prisma.payment.create({ data: { branchId: branch.id, totalAmount: 500000 } })).id;
  });

  afterAll(async () => {
    await prisma.bankStatementEntry.deleteMany({ where: { bankAccountId: { in: [accountId, homeAccountId] } } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.bankAccountChangeRequest.deleteMany({ where: { branchId: otherBranchId } });
    await prisma.bankAccount.deleteMany({ where: { id: accountId } });
    await prisma.branch.deleteMany({ where: { id: otherBranchId } });
    await prisma.$disconnect();
  });

  it('GET /providers — ຄືນ 3 provider ພ້ອມ webhookPath + secretConfigured', async () => {
    const res = await request(app).get('/api/v1/payments-treasury/providers').set(...bearer(superToken));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['MOCK_BCEL', 'MOCK_LAO_QR', 'MANUAL_TRANSFER']));
    const bcel = res.body.data.find((p: { code: string }) => p.code === 'MOCK_BCEL');
    expect(bcel.webhookPath).toBe('/api/v1/payments/webhooks/MOCK_BCEL');
    expect(bcel.mode).toBe('MOCK');
    expect(bcel.secretConfigured).toBe(true);
  });

  it('PATCH /providers/:code — SUPER_ADMIN ເທົ່ານັ້ນ, ແລະ ບັນທຶກ audit', async () => {
    const forbidden = await request(app)
      .patch('/api/v1/payments-treasury/providers/MOCK_BCEL')
      .set(...bearer(branchAdminToken))
      .send({ feeRate: 0.01 });
    expect(forbidden.status).toBe(403);

    const before = await prisma.paymentProvider.findUniqueOrThrow({ where: { code: 'MOCK_BCEL' } });
    try {
      const res = await request(app)
        .patch('/api/v1/payments-treasury/providers/MOCK_BCEL')
        .set(...bearer(superToken))
        .send({ feeRate: 0.015, isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ code: 'MOCK_BCEL', feeRate: 0.015, isActive: false });
      const audit = await prisma.auditLog.findFirst({
        where: { entityName: 'PaymentProvider', entityId: before.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.action).toBe('UPDATE');

      const bad = await request(app)
        .patch('/api/v1/payments-treasury/providers/MOCK_BCEL')
        .set(...bearer(superToken))
        .send({ feeRate: 0.9 });
      expect(bad.status).toBe(400);
    } finally {
      await prisma.paymentProvider.update({
        where: { code: 'MOCK_BCEL' },
        data: { feeRate: before.feeRate, isActive: before.isActive },
      });
    }
  });

  it('GET/PUT /settings — ຄ່າເລີ່ມຕົ້ນປິດ auto-approve; PUT ສະເພາະ SUPER_ADMIN', async () => {
    const original = await request(app).get('/api/v1/payments-treasury/settings').set(...bearer(branchAdminToken));
    expect(original.status).toBe(200);
    expect(original.body.data).toEqual({
      autoApprove: expect.any(Boolean),
      amountTolerance: expect.any(Number),
      reviewSlaMinutes: expect.any(Number),
      branchSlaMinutes: expect.any(Object),
      slaAlertEnabled: expect.any(Boolean),
    });

    const denied = await request(app)
      .put('/api/v1/payments-treasury/settings')
      .set(...bearer(branchAdminToken))
      .send({ autoApprove: true });
    expect(denied.status).toBe(403);

    try {
      const res = await request(app)
        .put('/api/v1/payments-treasury/settings')
        .set(...bearer(superToken))
        .send({ autoApprove: true, amountTolerance: 500 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ autoApprove: true, amountTolerance: 500 });
      const reread = await request(app).get('/api/v1/payments-treasury/settings').set(...bearer(superToken));
      expect(reread.body.data).toMatchObject({ autoApprove: true, amountTolerance: 500 });
    } finally {
      await request(app)
        .put('/api/v1/payments-treasury/settings')
        .set(...bearer(superToken))
        .send(original.body.data);
    }
  });

  it('POST /bank-accounts/:id/qr — ອັບໂຫຼດຮູບ QR → qrImageUrl; ຮູບເສຍ → 400; BRANCH_ADMIN ສາຂາອື່ນ → 403', async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000' } }).png().toBuffer();
    const res = await request(app)
      .post(`/api/v1/payments-treasury/bank-accounts/${accountId}/qr`)
      .set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: png.toString('base64'), currentPassword: 'Admin@12345' });
    expect(res.status).toBe(200);
    expect(res.body.data.qrImageKey).toMatch(/^bank-qr\//);
    expect(res.body.data.qrImageUrl).toContain(res.body.data.qrImageKey);

    const list = await request(app)
      .get('/api/v1/payments-treasury/bank-accounts')
      .query({ branchId: otherBranchId })
      .set(...bearer(superToken));
    expect(list.body.data[0].qrImageUrl).toBe(res.body.data.qrImageUrl);

    const bad = await request(app)
      .post(`/api/v1/payments-treasury/bank-accounts/${accountId}/qr`)
      .set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: Buffer.from('not an image').toString('base64'), currentPassword: 'Admin@12345' });
    expect(bad.status).toBe(400);

    const cross = await request(app)
      .post(`/api/v1/payments-treasury/bank-accounts/${accountId}/qr`)
      .set(...bearer(branchAdminToken))
      .send({ contentType: 'image/png', dataBase64: png.toString('base64'), currentPassword: 'Admin@12345' });
    expect(cross.status).toBe(403);
  });

  it('reconciliation — ລະບົບ vs statement: UNRECONCILED → VARIANCE → MATCHED', async () => {
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_TRANSFER', amount: 150000, bankAccountId: accountId, status: 'SUCCESS' },
    });
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_QR', amount: 50000, bankAccountId: accountId, status: 'SUCCESS' },
    });
    // tender ທີ່ບໍ່ຖືກນັບ: FAILED, ແລະ ເງິນສົດ
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_TRANSFER', amount: 99999, bankAccountId: accountId, status: 'FAILED' },
    });
    await prisma.paymentTransaction.create({ data: { paymentId, method: 'CASH', amount: 77777, status: 'SUCCESS' } });

    const q = { from: today, to: today, bankAccountId: accountId };
    const first = await request(app)
      .get('/api/v1/payments-treasury/reconciliation')
      .query(q)
      .set(...bearer(superToken));
    expect(first.status).toBe(200);
    expect(first.body.data.rows).toHaveLength(1);
    expect(first.body.data.rows[0]).toMatchObject({
      date: today,
      systemCredit: 200000,
      systemCreditCount: 2,
      systemDebit: 0,
      statementId: null,
      status: 'UNRECONCILED',
    });
    expect(first.body.data.totals.unreconciled).toBe(1);

    const variance = await request(app)
      .put('/api/v1/payments-treasury/reconciliation/statements')
      .set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: today, statementCredit: 210000, statementDebit: 0, note: 'ເງິນເຂົ້າເກີນ' });
    expect(variance.status).toBe(200);
    expect(variance.body.data).toMatchObject({ status: 'VARIANCE', creditVariance: 10000, debitVariance: 0, note: 'ເງິນເຂົ້າເກີນ' });

    const matched = await request(app)
      .put('/api/v1/payments-treasury/reconciliation/statements')
      .set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: today, statementCredit: 200000, statementDebit: 0 });
    expect(matched.body.data).toMatchObject({ status: 'MATCHED', creditVariance: 0 });
    expect(await prisma.bankStatementEntry.count({ where: { bankAccountId: accountId } })).toBe(1);

    const cleared = await request(app)
      .delete(`/api/v1/payments-treasury/reconciliation/statements/${matched.body.data.statementId}`)
      .set(...bearer(superToken));
    expect(cleared.status).toBe(204);
    const after = await request(app)
      .get('/api/v1/payments-treasury/reconciliation')
      .query(q)
      .set(...bearer(superToken));
    expect(after.body.data.rows[0].status).toBe('UNRECONCILED');
  });

  it('reconciliation — ລາຍຈ່າຍ PAID ຈາກບັນຊີນັບເປັນເງິນອອກ; ຊ່ວງ >62 ມື້ ຫຼື ອະນາຄົດ → 400', async () => {
    const category = await prisma.expenseCategory.findFirstOrThrow();
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } });
    const expense = await prisma.expense.create({
      data: {
        branchId: otherBranchId,
        categoryId: category.id,
        status: 'PAID',
        title: 'recon test',
        amount: 30000,
        expenseDate: new Date(`${today}T00:00:00.000Z`),
        paidFromAccountId: accountId,
        paidAt: new Date(),
        createdById: admin.id,
      },
    });
    try {
      const res = await request(app)
        .get('/api/v1/payments-treasury/reconciliation')
        .query({ from: today, to: today, bankAccountId: accountId })
        .set(...bearer(superToken));
      expect(res.body.data.rows[0]).toMatchObject({ systemDebit: 30000, systemDebitCount: 1 });

      const tooLong = await request(app)
        .get('/api/v1/payments-treasury/reconciliation')
        .query({ from: '2026-01-01', to: '2026-09-01' })
        .set(...bearer(superToken));
      expect(tooLong.status).toBe(400);

      const future = await request(app)
        .put('/api/v1/payments-treasury/reconciliation/statements')
        .set(...bearer(superToken))
        .send({ bankAccountId: accountId, date: '2099-01-01', statementCredit: 1, statementDebit: 0 });
      expect(future.status).toBe(400);
    } finally {
      await prisma.expense.delete({ where: { id: expense.id } });
    }
  });

  it('reconciliation — BRANCH_ADMIN ເຫັນ/ບັນທຶກໄດ້ສະເພາະສາຂາຕົນ', async () => {
    const other = await request(app)
      .get('/api/v1/payments-treasury/reconciliation')
      .query({ from: today, to: today, branchId: otherBranchId })
      .set(...bearer(branchAdminToken));
    expect(other.status).toBe(403);

    const scoped = await request(app)
      .get('/api/v1/payments-treasury/reconciliation')
      .query({ from: today, to: today })
      .set(...bearer(branchAdminToken));
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.rows.every((r: { branchId: string }) => r.branchId !== otherBranchId)).toBe(true);

    const write = await request(app)
      .put('/api/v1/payments-treasury/reconciliation/statements')
      .set(...bearer(branchAdminToken))
      .send({ bankAccountId: accountId, date: today, statementCredit: 1, statementDebit: 0 });
    expect(write.status).toBe(403);
  });

  it('reconciliation/day — ລາຍການ tender + audit ຂອງ statement; accounts ມີ lastStatementDate; ມື້ວ່າງບໍ່ 404', async () => {
    const tx = await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_QR', amount: 120000, bankAccountId: accountId, status: 'SUCCESS', qrReference: 'QR-REF-1' },
    });
    try {
      await request(app)
        .put('/api/v1/payments-treasury/reconciliation/statements')
        .set(...bearer(superToken))
        .send({ bankAccountId: accountId, date: today, statementCredit: 100000, statementDebit: 0 });

      const day = await request(app)
        .get('/api/v1/payments-treasury/reconciliation/day')
        .query({ bankAccountId: accountId, date: today })
        .set(...bearer(superToken));
      expect(day.status).toBe(200);
      const credit = day.body.data.credits.find((c: { id: string }) => c.id === tx.id);
      expect(credit).toMatchObject({ amount: 120000, method: 'BANK_QR', reference: 'QR-REF-1', paymentId });
      expect(day.body.data.row.systemCredit).toBe(
        day.body.data.credits.reduce((n: number, c: { amount: number }) => n + c.amount, 0),
      );
      expect(day.body.data.row.status).toBe('VARIANCE');
      expect(day.body.data.row.enteredByName).toEqual(expect.any(String));
      expect(day.body.data.row.enteredAt).toEqual(expect.any(String));

      const view = await request(app)
        .get('/api/v1/payments-treasury/reconciliation')
        .query({ from: today, to: today, bankAccountId: accountId })
        .set(...bearer(superToken));
      expect(view.body.data.accounts).toHaveLength(1);
      expect(view.body.data.accounts[0]).toMatchObject({ bankAccountId: accountId, lastStatementDate: today, isDefault: true });

      const empty = await request(app)
        .get('/api/v1/payments-treasury/reconciliation/day')
        .query({ bankAccountId: accountId, date: '2026-01-01' })
        .set(...bearer(superToken));
      expect(empty.status).toBe(200);
      expect(empty.body.data).toMatchObject({ credits: [], debits: [], row: { status: 'UNRECONCILED', systemCredit: 0 } });

      const cross = await request(app)
        .get('/api/v1/payments-treasury/reconciliation/day')
        .query({ bankAccountId: accountId, date: today })
        .set(...bearer(branchAdminToken));
      expect(cross.status).toBe(403);
    } finally {
      await prisma.bankStatementEntry.deleteMany({ where: { bankAccountId: accountId } });
      await prisma.paymentTransaction.delete({ where: { id: tx.id } });
    }
  });
});
