import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { vientianeDateKey } from '../../src/utils/dateHelpers.js';
import { runReconciliationReminders } from '../../src/modules/payments-treasury/reconciliation/reconciliation.service.js';

/**
 * Integration — ຊ່ອງວ່າງການກະທົບຍອດ G1–G12: ນຳເຂົ້າ statement + ຈັບຄູ່, ຄ່າທຳນຽມສຸດທິ, ການອະທິບາຍສ່ວນຕ່າງ
 * (maker ≠ checker), opening/closing, ປິດງວດ, refund, ປະຫວັດ, ການເຕືອນ.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_NAME = 'ສາຂາທົດສອບ recon G';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const API = '/api/v1/payments-treasury/reconciliation';

/** ເວລາ UTC ຂອງ HH:MM ເວລາວຽງຈັນ ໃນມື້ key. */
const vt = (key: string, hh: number, mm = 0) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), hh - 7, mm));
const shift = (key: string, days: number) => dateKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000));

describe('payments-treasury reconciliation gaps (G1–G12)', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let branchId: string;
  let accountId: string;
  let homeAccountId: string;
  let paymentId: string;
  let homePaymentId: string;
  const today = dateKey(vientianeDateKey(new Date()));
  // ມື້ໃນເດືອນກ່ອນ (ສຳລັບທົດສອບປິດງວດ) — ວັນທີ 10 ຂອງເດືອນກ່ອນ
  const prevMonthDay = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${dateKey(d).slice(0, 7)}-10`;
  })();
  const d1 = shift(today, -3);
  const d2 = shift(today, -2);

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await prisma.branch.deleteMany({ where: { name: BRANCH_NAME } });
    superToken = await login('02000000000', 'Admin@12345');
    branchAdminToken = await login('02000000001', 'Manager@12345');
    const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
    branchId = (await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'x', phone: '02097777701' } })).id;
    accountId = (
      await prisma.bankAccount.create({ data: { bankId: bcel.id, branchId, accountName: 'Recon G', accountNumber: '9990001' } })
    ).id;
    homeAccountId = (
      await prisma.bankAccount.create({
        data: { bankId: bcel.id, branchId: HOME_BRANCH_ID, accountName: 'Recon G home', accountNumber: '9990002' },
      })
    ).id;
    paymentId = (await prisma.payment.create({ data: { branchId, totalAmount: 900000 } })).id;
    homePaymentId = (await prisma.payment.create({ data: { branchId: HOME_BRANCH_ID, totalAmount: 900000 } })).id;
  });

  afterAll(async () => {
    const accts = { in: [accountId, homeAccountId] };
    await prisma.reconciliationPeriod.deleteMany({ where: { branchId } });
    await prisma.bankStatementImport.deleteMany({ where: { bankAccountId: accts } });
    await prisma.bankStatementEntry.deleteMany({ where: { bankAccountId: accts } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: [paymentId, homePaymentId] } } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: [paymentId, homePaymentId] } } });
    await prisma.providerIntent.deleteMany({ where: { paymentId: { in: [paymentId, homePaymentId] } } });
    await prisma.payment.deleteMany({ where: { id: { in: [paymentId, homePaymentId] } } });
    await prisma.notificationLog.deleteMany({ where: { type: { startsWith: 'reconciliation_' } } });
    await prisma.bankAccount.deleteMany({ where: { id: accts } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it('G1 — CSV preview detects columns; import aggregates the day, dedupes a re-import and auto-matches by reference', async () => {
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_TRANSFER', amount: 150000, bankAccountId: accountId, status: 'SUCCESS', qrReference: 'FT26REF001', createdAt: vt(d1, 10) },
    });
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_QR', amount: 80000, bankAccountId: accountId, status: 'SUCCESS', createdAt: vt(d1, 15) },
    });
    const dd = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
    const csv = [
      'Account statement,,,,,',
      'Date,Time,Description,Reference,Debit,Credit,Balance',
      `${dd(d1)},10:02,Transfer from customer,FT26REF001,,"150,000.00","1,150,000.00"`,
      `${dd(d1)},15:10,QR payment,QR7788,,"80,000.00","1,230,000.00"`,
      `${dd(d1)},18:00,Bank fee,,"5,000.00",,"1,225,000.00"`,
      'Total,,,,5000,230000,',
    ].join('\n');

    const preview = await request(app).post(`${API}/imports`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, fileName: 's.csv', csv, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ detected: true, count: 3, creditTotal: 230000, debitTotal: 5000, fromDate: d1, toDate: d1 });
    expect(preview.body.data.mapping).toMatchObject({ headerRow: 1, date: 0, credit: 5, debit: 4, balance: 6, dateFormat: 'DMY' });

    const commit = await request(app).post(`${API}/imports`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, fileName: 's.csv', csv, dryRun: false });
    expect(commit.status).toBe(200);
    expect(commit.body.data).toMatchObject({ inserted: 3, days: 1, matched: 2, unmatched: 1 });

    const again = await request(app).post(`${API}/imports`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, fileName: 's.csv', csv, dryRun: true });
    expect(again.body.data.duplicates).toBe(3);

    const day = await request(app).get(`${API}/day`).query({ bankAccountId: accountId, date: d1 }).set(...bearer(superToken));
    expect(day.body.data.row).toMatchObject({
      source: 'IMPORT', statementCredit: 230000, statementDebit: 5000, openingBalance: 1000000, closingBalance: 1225000,
      balanceGap: 0, lineCount: 3, unmatchedLines: 1, status: 'VARIANCE', debitVariance: 5000,
    });
    const refLine = day.body.data.lines.find((l: { reference: string }) => l.reference === 'FT26REF001');
    expect(refLine).toMatchObject({ matchStatus: 'MATCHED', matchedKind: 'TX', autoMatched: true });
    expect(day.body.data.credits.every((c: { matchedLineId: string | null }) => c.matchedLineId)).toBe(true);
  });

  it('G1 — manual line actions: candidates, ignore, unmatch, match', async () => {
    const day = await request(app).get(`${API}/day`).query({ bankAccountId: accountId, date: d1 }).set(...bearer(superToken));
    const fee = day.body.data.lines.find((l: { direction: string }) => l.direction === 'DEBIT');
    const ign = await request(app).post(`${API}/lines/${fee.id}/ignore`).set(...bearer(superToken));
    expect(ign.status).toBe(204);

    const qr = day.body.data.lines.find((l: { reference: string }) => l.reference === 'QR7788');
    expect((await request(app).post(`${API}/lines/${qr.id}/unmatch`).set(...bearer(superToken))).status).toBe(204);
    const cands = await request(app).get(`${API}/lines/${qr.id}/candidates`).set(...bearer(superToken));
    expect(cands.body.data[0]).toMatchObject({ kind: 'TX', amount: 80000, amountDiff: 0 });
    const bad = await request(app).post(`${API}/lines/${qr.id}/match`).set(...bearer(superToken)).send({ kind: 'EXPENSE', id: cands.body.data[0].id });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`${API}/lines/${qr.id}/match`).set(...bearer(superToken)).send({ kind: 'TX', id: cands.body.data[0].id });
    expect(ok.status).toBe(204);
    const after = await request(app).get(`${API}/day`).query({ bankAccountId: accountId, date: d1 }).set(...bearer(superToken));
    expect(after.body.data.row.unmatchedLines).toBe(0);
    expect(after.body.data.lines.find((l: { id: string }) => l.id === qr.id)).toMatchObject({ matchStatus: 'MATCHED', autoMatched: false });
  });

  it('G2 — provider that settles net: expected credit = gross − fee', async () => {
    await prisma.paymentProvider.update({ where: { code: 'MOCK_LAO_QR' }, data: { feeRate: 0.01, settlesNet: true } });
    try {
      const intent = await prisma.providerIntent.create({
        data: { paymentId, providerCode: 'MOCK_LAO_QR', bankAccountId: accountId, amount: 200000, reference: `RG-${Date.now()}`, status: 'SUCCESS', expiresAt: new Date() },
      });
      await prisma.paymentTransaction.create({
        data: { paymentId, method: 'BANK_QR', amount: 200000, bankAccountId: accountId, status: 'SUCCESS', providerIntentId: intent.id, createdAt: vt(d2, 11) },
      });
      await request(app).put(`${API}/statements`).set(...bearer(superToken))
        .send({ bankAccountId: accountId, date: d2, statementCredit: 198000, statementDebit: 0 });
      const view = await request(app).get(API).query({ from: d2, to: d2, bankAccountId: accountId }).set(...bearer(superToken));
      expect(view.body.data.rows[0]).toMatchObject({ systemCredit: 200000, systemFee: 2000, expectedCredit: 198000, creditVariance: 0, status: 'MATCHED' });
      expect(view.body.data.totalsByCurrency.LAK).toMatchObject({ systemFee: 2000, matched: 1 });
    } finally {
      await prisma.paymentProvider.update({ where: { code: 'MOCK_LAO_QR' }, data: { feeRate: 0, settlesNet: false } });
    }
  });

  it('G3/G11 — maker ≠ checker, resolution → RESOLVED, changed totals reopen it, history recorded', async () => {
    await prisma.paymentTransaction.create({
      data: { paymentId: homePaymentId, method: 'BANK_TRANSFER', amount: 100000, bankAccountId: homeAccountId, status: 'SUCCESS', createdAt: vt(d1, 9) },
    });
    const entered = await request(app).put(`${API}/statements`).set(...bearer(branchAdminToken))
      .send({ bankAccountId: homeAccountId, date: d1, statementCredit: 95000, statementDebit: 0 });
    expect(entered.body.data.status).toBe('VARIANCE');
    const id = entered.body.data.statementId;

    const self = await request(app).post(`${API}/statements/${id}/resolve`).set(...bearer(branchAdminToken)).send({ resolution: 'BANK_FEE' });
    expect(self.status).toBe(403);
    const otherNoNote = await request(app).post(`${API}/statements/${id}/resolve`).set(...bearer(superToken)).send({ resolution: 'OTHER' });
    expect(otherNoNote.status).toBe(400);
    const ok = await request(app).post(`${API}/statements/${id}/resolve`).set(...bearer(superToken)).send({ resolution: 'BANK_FEE', note: 'fee 5k' });
    expect(ok.body.data).toMatchObject({ status: 'RESOLVED', resolution: 'BANK_FEE', resolutionNote: 'fee 5k', resolvedByName: expect.any(String) });

    const changed = await request(app).put(`${API}/statements`).set(...bearer(superToken))
      .send({ bankAccountId: homeAccountId, date: d1, statementCredit: 94000, statementDebit: 0 });
    expect(changed.body.data).toMatchObject({ status: 'VARIANCE', resolution: null });

    const bulk = await request(app).post(`${API}/statements/resolve-bulk`).set(...bearer(superToken))
      .send({ statementIds: [id], resolution: 'TIMING' });
    expect(bulk.body.data.resolved).toBe(1);
    const reopen = await request(app).delete(`${API}/statements/${id}/resolve`).set(...bearer(superToken));
    expect(reopen.body.data.status).toBe('VARIANCE');

    const hist = await request(app).get(`${API}/statements/${id}/history`).set(...bearer(superToken));
    expect(hist.body.data.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'RESOLVE', 'REOPEN']));
  });

  it('G4 — opening/closing: internal gap and continuity with the previous day', async () => {
    const a = shift(today, -6);
    const b = shift(today, -5);
    await request(app).put(`${API}/statements`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: a, statementCredit: 0, statementDebit: 0, openingBalance: 500, closingBalance: 500 });
    const res = await request(app).put(`${API}/statements`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: b, statementCredit: 0, statementDebit: 0, openingBalance: 600, closingBalance: 650 });
    expect(res.body.data).toMatchObject({ balanceGap: 50, openingGap: 100 });
  });

  it('G7 — a paid bank refund counts as money out', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } });
    await prisma.refund.create({
      data: { paymentId, amount: 30000, reason: 'test', method: 'BANK_TRANSFER', status: 'PAID', requestedById: admin.id, bankAccountId: accountId, paidAt: vt(d2, 16) },
    });
    const day = await request(app).get(`${API}/day`).query({ bankAccountId: accountId, date: d2 }).set(...bearer(superToken));
    expect(day.body.data.row).toMatchObject({ systemDebit: 30000, systemDebitCount: 1 });
    expect(day.body.data.debits[0]).toMatchObject({ kind: 'REFUND', amount: 30000 });
  });

  it('G5 — period close needs a clean month, then locks edits; only SUPER_ADMIN reopens', async () => {
    const month = prevMonthDay.slice(0, 7);
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_TRANSFER', amount: 70000, bankAccountId: accountId, status: 'SUCCESS', createdAt: vt(prevMonthDay, 12) },
    });
    const notReady = await request(app).get(`${API}/periods/readiness`).query({ branchId, month }).set(...bearer(superToken));
    expect(notReady.body.data).toMatchObject({ unreconciled: 1, canClose: false, monthOpen: false });
    const refused = await request(app).post(`${API}/periods`).set(...bearer(superToken)).send({ branchId, month });
    expect(refused.status).toBe(409);

    await request(app).put(`${API}/statements`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: prevMonthDay, statementCredit: 70000, statementDebit: 0 });
    const closed = await request(app).post(`${API}/periods`).set(...bearer(superToken)).send({ branchId, month, note: 'ok' });
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({ month, branchName: BRANCH_NAME });

    const locked = await request(app).put(`${API}/statements`).set(...bearer(superToken))
      .send({ bankAccountId: accountId, date: prevMonthDay, statementCredit: 1, statementDebit: 0 });
    expect(locked.status).toBe(409);
    const view = await request(app).get(API).query({ from: prevMonthDay, to: prevMonthDay, bankAccountId: accountId }).set(...bearer(superToken));
    expect(view.body.data.rows[0].locked).toBe(true);
    expect(view.body.data.periods).toHaveLength(1);

    const thisMonth = await request(app).post(`${API}/periods`).set(...bearer(superToken)).send({ branchId, month: today.slice(0, 7) });
    expect(thisMonth.status).toBe(400);

    const reopened = await request(app).delete(`${API}/periods/${closed.body.data.id}`).set(...bearer(superToken)).send({ reason: 'fix' });
    expect(reopened.status).toBe(204);
  });

  it('G9 — settings + morning reminder notifies admins about yesterday and large differences', async () => {
    const put = await request(app).put(`${API}/settings`).set(...bearer(superToken)).send({ varianceAlertThreshold: 1000 });
    expect(put.body.data).toMatchObject({ reminderEnabled: true, varianceAlertThreshold: 1000 });
    const denied = await request(app).put(`${API}/settings`).set(...bearer(branchAdminToken)).send({ reminderEnabled: false });
    expect(denied.status).toBe(403);

    const yesterday = shift(today, -1);
    await prisma.paymentTransaction.create({
      data: { paymentId, method: 'BANK_TRANSFER', amount: 12345, bankAccountId: accountId, status: 'SUCCESS', createdAt: vt(yesterday, 12) },
    });
    const out = await runReconciliationReminders();
    expect(out.missing).toBeGreaterThanOrEqual(1);
    const logs = await prisma.notificationLog.findMany({ where: { type: { in: ['reconciliation_missing', 'reconciliation_variance'] } } });
    expect(logs.some((l) => l.type === 'reconciliation_missing')).toBe(true);
    // ແລ່ນຊ້ຳ = dedupe, ບໍ່ສົ່ງຊ້ຳ
    const again = await runReconciliationReminders();
    expect(again.notified).toBe(0);
    await request(app).put(`${API}/settings`).set(...bearer(superToken)).send({ varianceAlertThreshold: 100000 });
  });

  it('G12 — BRANCH_ADMIN is scoped and has payments:reconcile via its role', async () => {
    const cross = await request(app).post(`${API}/imports`).set(...bearer(branchAdminToken))
      .send({ bankAccountId: accountId, fileName: 'x.csv', csv: 'Date,Amount\n01/01/2026,5', dryRun: true });
    expect(cross.status).toBe(403);
    const own = await request(app).post(`${API}/imports`).set(...bearer(branchAdminToken))
      .send({ bankAccountId: homeAccountId, fileName: 'x.csv', csv: 'Date,Amount\n01/01/2026,5', dryRun: true });
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ count: 1, creditTotal: 5 });
  });
});
