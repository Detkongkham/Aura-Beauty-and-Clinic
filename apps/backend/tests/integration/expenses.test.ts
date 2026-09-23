import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { storage } from '../../src/storage/index.js';
import { vientianeDateKey } from '../../src/utils/dateHelpers.js';
import { generateDueRecurringExpenses } from '../../src/modules/expenses/expenses.service.js';

/**
 * Integration — Module 39 W4: Expenses workflow, attachments, summary, P&L, recurring.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (ໝວດລາຍຈ່າຍມາດຕະຖານ).
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const BRANCH_ADMIN_PHONE = '02000000001';
const BRANCH_ADMIN_PASSWORD = 'Manager@12345';
const TEST_BRANCH_NAME = 'ສາຂາທົດສອບລາຍຈ່າຍ';
const TITLE_TAG = '[w4-test]';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];
const todayKey = (): string => vientianeDateKey(new Date()).toISOString().slice(0, 10);
const fakeFile = (): string => Buffer.from(`receipt-${randomUUID()}`).toString('base64');

describe('expenses: workflow + attachments + summary + P&L + recurring', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let testBranchId: string;
  let testAccountId: string;
  let homeAccountId: string;
  const cat: Record<string, string> = {};

  async function create(
    token: string,
    body: Partial<{ branchId: string; categoryId: string; title: string; amount: number; expenseDate: string }> = {},
  ) {
    return request(app)
      .post('/api/v1/expenses')
      .set(...bearer(token))
      .set(...idem())
      .send({
        branchId: testBranchId,
        categoryId: cat.UTILITIES,
        title: `${TITLE_TAG} ຄ່າໄຟ`,
        amount: 100_000,
        expenseDate: todayKey(),
        ...body,
      });
  }
  const act = (token: string, id: string, action: string, body: object = {}) =>
    request(app)
      .post(`/api/v1/expenses/${id}/${action}`)
      .set(...bearer(token))
      .set(...idem())
      .send(body);

  async function cleanup() {
    const branches = [testBranchId, HOME_BRANCH_ID].filter(Boolean);
    const att = await prisma.expenseAttachment.findMany({
      where: { expense: { title: { startsWith: TITLE_TAG } } },
      select: { imageKey: true },
    });
    await Promise.all(att.map((a) => storage.delete(a.imageKey).catch(() => undefined)));
    await prisma.expense.deleteMany({ where: { title: { startsWith: TITLE_TAG } } });
    if (testBranchId) {
      await prisma.recurringExpense.deleteMany({ where: { branchId: testBranchId } });
      await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
      await prisma.payment.deleteMany({ where: { branchId: testBranchId } });
      await prisma.stockMovement.deleteMany({ where: { branchId: testBranchId } });
      await prisma.product.deleteMany({ where: { branchId: testBranchId } });
      await prisma.bankStatementImport.deleteMany({ where: { bankAccount: { branchId: testBranchId } } });
      await prisma.reconciliationPeriod.deleteMany({ where: { branchId: testBranchId } });
      await prisma.cashFund.deleteMany({ where: { branchId: testBranchId } });
      await prisma.bankAccount.deleteMany({ where: { branchId: testBranchId } });
      await prisma.auditLog.deleteMany({ where: { branchId: testBranchId } });
      await prisma.branch.deleteMany({ where: { id: testBranchId } });
    }
    await prisma.auditLog.deleteMany({
      where: { branchId: { in: branches }, entityName: 'Expense', newValue: { path: ['title'], string_starts_with: TITLE_TAG } },
    });
    await prisma.bankAccount.deleteMany({ where: { id: homeAccountId } });
  }

  beforeAll(async () => {
    app = createApp();
    await prisma.branch.deleteMany({ where: { name: TEST_BRANCH_NAME } });

    superToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;
    branchAdminToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: BRANCH_ADMIN_PHONE, password: BRANCH_ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;

    for (const c of await prisma.expenseCategory.findMany()) cat[c.code] = c.id;

    const branch = await prisma.branch.create({
      data: { name: TEST_BRANCH_NAME, address: 'ທົດສອບ', phone: '02097777777' },
    });
    testBranchId = branch.id;

    const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
    testAccountId = (
      await prisma.bankAccount.create({
        data: { bankId: bcel.id, branchId: testBranchId, accountName: 'Test Pay', accountNumber: '9990001112223', isDefault: true },
      })
    ).id;
    homeAccountId = (
      await prisma.bankAccount.create({
        data: { bankId: bcel.id, branchId: HOME_BRANCH_ID, accountName: 'Home Pay', accountNumber: '9990001112224' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.appSetting.deleteMany({ where: { key: 'expenses.approvalLimit' } });
    await prisma.notificationLog.deleteMany({ where: { type: { startsWith: 'EXPENSE_' } } });
    await cleanup();
    await prisma.$disconnect();
  });

  it('401 ໂດຍບໍ່ມີ token; 403 ສຳລັບ CUSTOMER', async () => {
    expect((await request(app).get('/api/v1/expenses')).status).toBe(401);
    const login = await request(app).post('/api/v1/auth/login').send({ phone: '02055555555', password: 'Customer@12345' });
    if (login.status === 200) {
      const res = await request(app).get('/api/v1/expenses').set(...bearer(login.body.data.tokens.accessToken));
      expect(res.status).toBe(403);
    }
  });

  it('GET /categories — ມີໝວດມາດຕະຖານ + kind ຖືກຕ້ອງ', async () => {
    const res = await request(app).get('/api/v1/expenses/categories').set(...bearer(branchAdminToken));
    expect(res.status).toBe(200);
    const byCode = Object.fromEntries(res.body.data.map((c: { code: string; kind: string }) => [c.code, c.kind]));
    expect(byCode).toMatchObject({ RENT: 'OPERATING', SALARY: 'PAYROLL', MATERIALS: 'INVENTORY', OTHER: 'OPERATING' });
  });

  it('ໝວດ: BRANCH_ADMIN ສ້າງບໍ່ໄດ້ (403), SUPER_ADMIN ສ້າງໄດ້ + ລະຫັດຊ້ຳ 409', async () => {
    const body = { code: 'W4_TEST_CAT', nameLo: 'ທົດສອບ', nameEn: 'Test' };
    expect((await request(app).post('/api/v1/expenses/categories').set(...bearer(branchAdminToken)).send(body)).status).toBe(403);
    await prisma.expenseCategory.deleteMany({ where: { code: 'W4_TEST_CAT' } });
    const ok = await request(app).post('/api/v1/expenses/categories').set(...bearer(superToken)).send(body);
    expect(ok.status).toBe(201);
    expect((await request(app).post('/api/v1/expenses/categories').set(...bearer(superToken)).send(body)).status).toBe(409);
    await prisma.expenseCategory.delete({ where: { id: ok.body.data.id } });
  });

  it('ສ້າງລາຍຈ່າຍ: ຕ້ອງມີ Idempotency-Key; BRANCH_ADMIN ສ້າງຂ້າມສາຂາບໍ່ໄດ້', async () => {
    const noKey = await request(app)
      .post('/api/v1/expenses')
      .set(...bearer(superToken))
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} x`, amount: 1, expenseDate: todayKey() });
    expect(noKey.status).toBe(400);

    const cross = await create(branchAdminToken, { branchId: testBranchId });
    expect(cross.status).toBe(403);

    const own = await create(branchAdminToken, { branchId: HOME_BRANCH_ID });
    expect(own.status).toBe(201);
    expect(own.body.data.status).toBe('DRAFT');
    expect(own.body.data.createdBy.id).toBeTruthy();
  });

  it('workflow ເຕັມ: DRAFT → SUBMITTED → APPROVED → PAID (+ ກົດ transition ຜິດ = 409)', async () => {
    const created = await create(superToken);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    expect((await act(superToken, id, 'approve')).status).toBe(409); // DRAFT ອະນຸມັດບໍ່ໄດ້
    expect((await act(superToken, id, 'pay')).status).toBe(409);

    const submitted = await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken));
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('SUBMITTED');
    expect((await request(app).patch(`/api/v1/expenses/${id}`).set(...bearer(superToken)).send({ title: 'x' })).status).toBe(409);
    expect((await act(superToken, id, 'pay')).status).toBe(409); // ຍັງບໍ່ອະນຸມັດ

    const approved = await act(superToken, id, 'approve');
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.approvedBy.id).toBeTruthy();

    // ບັນຊີຂອງສາຂາອື່ນ → 400
    expect((await act(superToken, id, 'pay', { paidFromAccountId: homeAccountId })).status).toBe(400);

    const paid = await act(superToken, id, 'pay', { paidFromAccountId: testAccountId, paidReference: 'TRX-1' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.paidFromAccount.id).toBe(testAccountId);
    expect(paid.body.data.paidReference).toBe('TRX-1');

    // PAID ແລ້ວ: ແກ້/ລຶບ/ຈ່າຍຊ້ຳ ບໍ່ໄດ້
    expect((await request(app).patch(`/api/v1/expenses/${id}`).set(...bearer(superToken)).send({ title: 'x' })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/expenses/${id}`).set(...bearer(superToken))).status).toBe(409);
    expect((await act(superToken, id, 'pay')).status).toBe(409);

    const audit = await prisma.auditLog.findMany({ where: { entityName: 'Expense', entityId: id }, select: { action: true } });
    expect(audit.map((a) => a.action).sort()).toEqual(['APPROVE', 'CREATE', 'PAY', 'SUBMIT']);
  });

  it('ແຍກໜ້າທີ່: BRANCH_ADMIN ອະນຸມັດລາຍຈ່າຍທີ່ຕົນສ້າງບໍ່ໄດ້ (403) — SUPER_ADMIN ອະນຸມັດໄດ້', async () => {
    const id = (await create(branchAdminToken, { branchId: HOME_BRANCH_ID })).body.data.id as string;
    await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(branchAdminToken));
    expect((await act(branchAdminToken, id, 'approve')).status).toBe(403);
    expect((await act(superToken, id, 'approve')).status).toBe(200);
  });

  it('ປະຕິເສດຕ້ອງມີເຫດຜົນ → ແກ້ໄຂ = ກັບເປັນ DRAFT → ສົ່ງໃໝ່ໄດ້', async () => {
    const id = (await create(superToken)).body.data.id as string;
    await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken));

    expect((await act(superToken, id, 'reject', {})).status).toBe(400);
    const rej = await act(superToken, id, 'reject', { reason: 'ບໍ່ມີໃບຮັບເງິນ' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('REJECTED');
    expect(rej.body.data.rejectedReason).toBe('ບໍ່ມີໃບຮັບເງິນ');

    const edited = await request(app).patch(`/api/v1/expenses/${id}`).set(...bearer(superToken)).send({ amount: 90_000 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.status).toBe('DRAFT');
    expect(edited.body.data.rejectedReason).toBeNull();
    expect(edited.body.data.amount).toBe(90_000);

    expect((await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken))).body.data.status).toBe('SUBMITTED');
  });

  it('ອະນຸມັດພ້ອມກັນສອງຄັ້ງ → ສຳເລັດເທື່ອດຽວ (atomic transition)', async () => {
    const id = (await create(superToken)).body.data.id as string;
    await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken));
    const [a, b] = await Promise.all([act(superToken, id, 'approve'), act(superToken, id, 'approve')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('ລຶບໄດ້ສະເພາະ DRAFT/REJECTED; ໝວດທີ່ປິດໃຊ້ງານຮັບບໍ່ໄດ້', async () => {
    const id = (await create(superToken)).body.data.id as string;
    expect((await request(app).delete(`/api/v1/expenses/${id}`).set(...bearer(superToken))).status).toBe(204);
    expect((await request(app).get(`/api/v1/expenses/${id}`).set(...bearer(superToken))).status).toBe(404);

    const tmp = await prisma.expenseCategory.create({ data: { code: 'W4_OFF', nameLo: 'ປິດ', nameEn: 'Off', isActive: false } });
    expect((await create(superToken, { categoryId: tmp.id })).status).toBe(400);
    await prisma.expenseCategory.delete({ where: { id: tmp.id } });
  });

  it('ເອກະສານແນບ: ອັບໄດ້, ໃບຮັບເງິນຊ້ຳ = 409 (ແມ່ນແຕ່ຕ່າງລາຍຈ່າຍ), ລຶບຫຼັງ PAID ບໍ່ໄດ້', async () => {
    const a = (await create(superToken)).body.data.id as string;
    const b = (await create(superToken)).body.data.id as string;
    const file = fakeFile();
    const up = await request(app)
      .post(`/api/v1/expenses/${a}/attachments`)
      .set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: file });
    expect(up.status).toBe(201);
    expect(up.body.data.attachments).toHaveLength(1);
    const attId = up.body.data.attachments[0].id as string;

    const dupOther = await request(app)
      .post(`/api/v1/expenses/${b}/attachments`)
      .set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: file });
    expect(dupOther.status).toBe(409);

    // ປະເພດໄຟລ໌ທີ່ບໍ່ອະນຸຍາດ
    const bad = await request(app)
      .post(`/api/v1/expenses/${b}/attachments`)
      .set(...bearer(superToken))
      .send({ contentType: 'application/zip', dataBase64: fakeFile() });
    expect(bad.status).toBe(400);

    await request(app).post(`/api/v1/expenses/${a}/submit`).set(...bearer(superToken));
    await act(superToken, a, 'approve');
    await act(superToken, a, 'pay');
    const del = await request(app).delete(`/api/v1/expenses/${a}/attachments/${attId}`).set(...bearer(superToken));
    expect(del.status).toBe(409);
  });

  it('summary: ນັບ APPROVED+PAID ເປັນລາຍຈ່າຍຈິງ; DRAFT/SUBMITTED ແຍກເປັນ pending', async () => {
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
    const mk = async (amount: number, status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID', code = 'UTILITIES') => {
      const id = (await create(superToken, { amount, categoryId: cat[code] })).body.data.id as string;
      if (status !== 'DRAFT') await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken));
      if (status === 'APPROVED' || status === 'PAID') await act(superToken, id, 'approve');
      if (status === 'PAID') await act(superToken, id, 'pay');
    };
    await mk(1_000, 'DRAFT');
    await mk(2_000, 'SUBMITTED');
    await mk(4_000, 'APPROVED');
    await mk(8_000, 'PAID', 'RENT');

    const res = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}`).set(...bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data.recognisedTotal).toBe(12_000);
    expect(res.body.data.pendingApproval).toEqual({ count: 1, amount: 2_000 });
    expect(res.body.data.awaitingPayment).toEqual({ count: 1, amount: 4_000 });
    expect(res.body.data.byCategory[0]).toMatchObject({ code: 'RENT', amount: 8_000 });
    expect(res.body.data.byMonth).toEqual([{ month: todayKey().slice(0, 7), amount: 12_000 }]);

    const list = await request(app)
      .get(`/api/v1/expenses?branchId=${testBranchId}&status=SUBMITTED`)
      .set(...bearer(superToken));
    expect(list.body.data.total).toBe(1);
  });

  it('BRANCH_ADMIN ເບິ່ງສາຂາອື່ນບໍ່ໄດ້ (list/summary/P&L = 403)', async () => {
    for (const path of ['/expenses', '/expenses/summary', '/expenses/profit-loss']) {
      const res = await request(app).get(`/api/v1${path}?branchId=${testBranchId}`).set(...bearer(branchAdminToken));
      expect(res.status).toBe(403);
    }
  });

  it('P&L: ລາຍຮັບ − COGS − ລາຍຈ່າຍ (INVENTORY ບໍ່ນັບ, PAYROLL ເຂົ້າ labour) — ຕົວເລກກົງ', async () => {
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });

    const payment = await prisma.payment.create({ data: { branchId: testBranchId, totalAmount: 1_000_000 } });
    await prisma.paymentTransaction.createMany({
      data: [
        { paymentId: payment.id, method: 'CASH', amount: 600_000, status: 'SUCCESS' },
        { paymentId: payment.id, method: 'BANK_QR', amount: 400_000, status: 'SUCCESS' },
        { paymentId: payment.id, method: 'CASH', amount: 999_999, status: 'PENDING' }, // ບໍ່ນັບ
      ],
    });

    const product = await prisma.product.create({
      data: { branchId: testBranchId, name: 'W4 cream', sku: 'W4-COGS', costPrice: 20_000, unit: 'ຕຸກ', stockQty: 100 },
    });
    await prisma.stockMovement.create({
      data: { branchId: testBranchId, productId: product.id, type: 'SERVICE_CONSUMED', qty: 2.5, balanceAfter: 97.5 },
    });
    // COGS = 2.5 × 20,000 = 50,000

    const paid = async (amount: number, code: string) => {
      const id = (await create(superToken, { amount, categoryId: cat[code] })).body.data.id as string;
      await request(app).post(`/api/v1/expenses/${id}/submit`).set(...bearer(superToken));
      await act(superToken, id, 'approve');
      await act(superToken, id, 'pay');
    };
    await paid(100_000, 'RENT'); // operating
    await paid(50_000, 'UTILITIES'); // operating
    await paid(200_000, 'SALARY'); // payroll → labour
    await paid(300_000, 'MATERIALS'); // inventory → memo only
    const draft = (await create(superToken, { amount: 777_777 })).body.data.id as string; // DRAFT ບໍ່ນັບ
    expect(draft).toBeTruthy();

    const res = await request(app).get(`/api/v1/expenses/profit-loss?branchId=${testBranchId}`).set(...bearer(superToken));
    expect(res.status).toBe(200);
    const pl = res.body.data;
    expect(pl.revenue).toBe(1_000_000);
    expect(pl.cogs).toBe(50_000);
    expect(pl.grossProfit).toBe(950_000);
    expect(pl.labour).toEqual({ commissionAndBonus: 0, otherPayroll: 200_000, total: 200_000 });
    expect(pl.operating.total).toBe(150_000);
    expect(pl.operating.byCategory.map((c: { code: string }) => c.code)).toEqual(['RENT', 'UTILITIES']);
    expect(pl.inventoryPurchasesMemo).toBe(300_000);
    expect(pl.netProfit).toBe(600_000); // 1,000,000 − 50,000 − 200,000 − 150,000
    expect(pl.netMargin).toBe(0.6);
    expect(pl.months).toHaveLength(1);
    expect(pl.months[0].netProfit).toBe(600_000);

    // ຊ່ວງເດືອນຜິດ → 400
    const bad = await request(app).get('/api/v1/expenses/profit-loss?from=2026-09&to=2026-01').set(...bearer(superToken));
    expect(bad.status).toBe(400);
  });

  it('ລາຍຈ່າຍຊ້ຳ: job ສ້າງ DRAFT ເດືອນລະຄັ້ງ (idempotent), ຂ້າມກົດທີ່ປິດ/ຍັງບໍ່ເຖິງວັນ', async () => {
    await prisma.recurringExpense.deleteMany({ where: { branchId: testBranchId } });
    const rule = await request(app)
      .post('/api/v1/expenses/recurring')
      .set(...bearer(superToken))
      .send({ branchId: testBranchId, categoryId: cat.RENT, title: `${TITLE_TAG} ຄ່າເຊົ່າ`, amount: 5_000_000, dayOfMonth: 5 });
    expect(rule.status).toBe(201);
    const ruleId = rule.body.data.id as string;
    const off = await request(app)
      .post('/api/v1/expenses/recurring')
      .set(...bearer(superToken))
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} ປິດ`, amount: 1, dayOfMonth: 1 });
    await request(app)
      .patch(`/api/v1/expenses/recurring/${off.body.data.id}`)
      .set(...bearer(superToken))
      .send({ isActive: false });

    const forBranch = () => prisma.expense.findMany({ where: { branchId: testBranchId, recurringExpenseId: ruleId } });

    // ວັນທີ 3 (ຕາມເວລາວຽງຈັນ) — ຍັງບໍ່ເຖິງວັນທີ 5
    await generateDueRecurringExpenses(new Date('2031-03-03T05:00:00Z'));
    expect(await forBranch()).toHaveLength(0);

    // ວັນທີ 6 — ສ້າງ; ຮຽກຊ້ຳບໍ່ສ້າງຊ້ຳ
    await generateDueRecurringExpenses(new Date('2031-03-06T05:00:00Z'));
    await generateDueRecurringExpenses(new Date('2031-03-07T05:00:00Z'));
    let rows = await forBranch();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'DRAFT', recurringPeriod: '2031-03' });
    expect(rows[0]!.expenseDate.toISOString().slice(0, 10)).toBe('2031-03-05');
    expect(rows[0]!.amount.toNumber()).toBe(5_000_000);

    // ເດືອນຖັດໄປ — ສ້າງອີກ 1
    await generateDueRecurringExpenses(new Date('2031-04-05T05:00:00Z'));
    rows = await forBranch();
    expect(rows.map((r) => r.recurringPeriod).sort()).toEqual(['2031-03', '2031-04']);

    // ກົດທີ່ປິດໃຊ້ງານ ບໍ່ຖືກສ້າງ
    expect(await prisma.expense.count({ where: { recurringExpenseId: off.body.data.id } })).toBe(0);
    // ຕໍ່ໄປຍັງເຂົ້າ workflow ປົກກະຕິ
    const submit = await request(app).post(`/api/v1/expenses/${rows[0]!.id}/submit`).set(...bearer(superToken));
    expect(submit.status).toBe(200);
  });

  it('bulk: ຜ່ານກົດດຽວກັບ endpoint ດ່ຽວ — ລາຍການທີ່ຜິດກົດຖືກລາຍງານ, ບໍ່ລົ້ມທັງຊຸດ', async () => {
    const a = (await create(superToken, { title: `${TITLE_TAG} bulk A`, amount: 10_000 })).body.data.id as string;
    const b = (await create(superToken, { title: `${TITLE_TAG} bulk B`, amount: 20_000 })).body.data.id as string;

    // ບໍ່ມີ Idempotency-Key = 400
    const noKey = await request(app).post('/api/v1/expenses/bulk').set(...bearer(superToken)).send({ action: 'submit', ids: [a] });
    expect(noKey.status).toBe(400);

    const bulk = (body: object) =>
      request(app).post('/api/v1/expenses/bulk').set(...bearer(superToken)).set(...idem()).send(body);

    const submitted = await bulk({ action: 'submit', ids: [a, b] });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.succeeded.sort()).toEqual([a, b].sort());

    // ຈ່າຍກ່ອນອະນຸມັດ = ລົ້ມທຸກລາຍການ ແຕ່ HTTP 200 ພ້ອມເຫດຜົນ
    const early = await bulk({ action: 'pay', ids: [a, b] });
    expect(early.body.data.succeeded).toEqual([]);
    expect(early.body.data.failed).toHaveLength(2);

    const approved = await bulk({ action: 'approve', ids: [a, b, a] });
    expect(approved.body.data.succeeded.sort()).toEqual([a, b].sort());

    // ບັນຊີຂອງສາຂາອື່ນ = ລົ້ມ (ກົດສາຂາດຽວກັນ), ບັນຊີສາຂາດຽວກັນ = ຜ່ານ
    const wrongAcct = await bulk({ action: 'pay', ids: [a], paidFromAccountId: homeAccountId });
    expect(wrongAcct.body.data.failed[0].id).toBe(a);
    const paid = await bulk({ action: 'pay', ids: [a, b], paidFromAccountId: testAccountId, paidReference: 'BULK-1' });
    expect(paid.body.data.succeeded).toHaveLength(2);
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: b } });
    expect(row).toMatchObject({ status: 'PAID', paidFromAccountId: testAccountId, paidReference: 'BULK-1' });
  });

  it('bulk: BRANCH_ADMIN ອະນຸມັດລາຍການທີ່ຕົນສ້າງບໍ່ໄດ້ + ລາຍການສາຂາອື່ນຖືກປະຕິເສດ', async () => {
    const mine = (
      await create(branchAdminToken, { branchId: HOME_BRANCH_ID, title: `${TITLE_TAG} bulk mine`, amount: 5_000 })
    ).body.data.id as string;
    const other = (await create(superToken, { title: `${TITLE_TAG} bulk other`, amount: 5_000 })).body.data.id as string;
    await act(branchAdminToken, mine, 'submit');
    await act(superToken, other, 'submit');
    const res = await request(app)
      .post('/api/v1/expenses/bulk')
      .set(...bearer(branchAdminToken))
      .set(...idem())
      .send({ action: 'approve', ids: [mine, other] });
    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toEqual([]);
    expect(res.body.data.failed.map((f: { id: string }) => f.id).sort()).toEqual([mine, other].sort());
  });

  it('list: flag missingReceipt / mine / recurring + sort amount + ຄົ້ນຫາຊື່ໝວດ', async () => {
    const small = (await create(superToken, { title: `${TITLE_TAG} flag small`, amount: 1_000 })).body.data.id as string;
    const big = (await create(superToken, { title: `${TITLE_TAG} flag big`, amount: 9_000_000 })).body.data.id as string;
    await act(superToken, small, 'submit');
    await act(superToken, big, 'submit');
    await request(app)
      .post(`/api/v1/expenses/${big}/attachments`)
      .set(...bearer(superToken))
      .send({ contentType: 'image/jpeg', dataBase64: fakeFile() });

    const list = (q: string) =>
      request(app).get(`/api/v1/expenses?branchId=${testBranchId}&q=${encodeURIComponent('flag')}&${q}`).set(...bearer(superToken));

    const missing = await list('flag=missingReceipt');
    expect(missing.body.data.items.map((e: { id: string }) => e.id)).toEqual([small]);

    const sorted = await list('sort=amountDesc');
    expect(sorted.body.data.items.map((e: { id: string }) => e.id)).toEqual([big, small]);

    const mineAdmin = await request(app)
      .get(`/api/v1/expenses?flag=mine&q=${encodeURIComponent('flag')}`)
      .set(...bearer(branchAdminToken));
    expect(mineAdmin.body.data.items).toHaveLength(0);

    const recurring = await list('flag=recurring');
    expect(recurring.body.data.items).toHaveLength(0);

    const byCategory = await request(app)
      .get(`/api/v1/expenses?branchId=${testBranchId}&q=${encodeURIComponent('Utilities')}`)
      .set(...bearer(superToken));
    expect(byCategory.status).toBe(200);
    expect(byCategory.body.data.items.some((e: { id: string }) => e.id === small)).toBe(true);
  });

  it('summary: byDay/previous/byCurrency/missingReceipts/oldestPendingAt ຄົບ', async () => {
    const res = await request(app)
      .get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-06-01&to=2031-06-10`)
      .set(...bearer(superToken));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.byDay).toHaveLength(10);
    expect(d.byDay[0]).toEqual({ date: '2031-06-01', amount: 0 });
    // ຊ່ວງເລີ່ມວັນທີ 1 ຂອງເດືອນ → ປຽບທຽບວັນທີດຽວກັນຂອງເດືອນກ່ອນ
    expect(d.previous).toMatchObject({ from: '2031-05-01', to: '2031-05-10', recognisedTotal: 0 });
    expect(d.previous.byDay).toHaveLength(10);
    expect(d).toMatchObject({ missingReceipts: { count: 0, amount: 0 }, oldestPendingAt: null, recurring: { count: 0, amount: 0 } });
    expect(Array.isArray(d.byCurrency)).toBe(true);

    const odd = await request(app)
      .get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-06-05&to=2031-06-11`)
      .set(...bearer(superToken));
    expect(odd.body.data.previous).toMatchObject({ from: '2031-05-29', to: '2031-06-04' });

    const today = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=${todayKey()}&to=${todayKey()}`).set(...bearer(superToken));
    expect(today.body.data.missingReceipts.count).toBeGreaterThan(0);
    expect(today.body.data.oldestPendingAt).not.toBeNull();

    const bad = await request(app).get('/api/v1/expenses/summary?from=2031-06-10&to=2031-06-01').set(...bearer(superToken));
    expect(bad.status).toBe(400);
  });

  it('recurring: nextDueDate ເປັນເດືອນນີ້ຖ້າຍັງບໍ່ສ້າງ', async () => {
    const res = await request(app)
      .post('/api/v1/expenses/recurring')
      .set(...bearer(superToken))
      .send({ branchId: testBranchId, categoryId: cat.RENT, title: `${TITLE_TAG} next due`, amount: 1_000, dayOfMonth: 15 });
    expect(res.status).toBe(201);
    expect(res.body.data.nextDueDate).toBe(`${todayKey().slice(0, 7)}-15`);
  });

  // ── expenses audit E1–E12 ─────────────────────────────────────────
  const put = (token: string, path: string, body: object) =>
    request(app).put(`/api/v1/expenses${path}`).set(...bearer(token)).send(body);

  it('E1: ສະກຸນຕ່າງປະເທດ snapshot ອັດຕາ → amountBase ເປັນ LAK; ຍອດລວມໃຊ້ amountBase', async () => {
    await put(superToken, '/settings', { rates: [{ currency: 'THB', rate: 600 }] });
    const thb = await create(superToken, { title: `${TITLE_TAG} fx thb`, amount: 1_000, expenseDate: '2031-07-02' });
    expect(thb.status).toBe(201);
    const body = thb.body.data;
    expect(body).toMatchObject({ currency: 'LAK' });

    const res = await request(app)
      .post('/api/v1/expenses')
      .set(...bearer(superToken))
      .set(...idem())
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} fx thb2`, amount: 1_000, currency: 'THB', expenseDate: '2031-07-02' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ currency: 'THB', fxRate: 600, amountBase: 600_000 });

    const manual = await request(app)
      .post('/api/v1/expenses')
      .set(...bearer(superToken))
      .set(...idem())
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} fx manual`, amount: 10, currency: 'USD', fxRate: 22_000, expenseDate: '2031-07-02' });
    expect(manual.body.data).toMatchObject({ fxRate: 22_000, amountBase: 220_000 });

    for (const id of [res.body.data.id, manual.body.data.id]) {
      await act(superToken, id, 'submit');
      await act(superToken, id, 'approve');
    }
    const sum = await request(app)
      .get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-07-01&to=2031-07-31`)
      .set(...bearer(superToken));
    expect(sum.body.data.recognisedTotal).toBe(820_000);
    expect(sum.body.data.byCurrency.find((c: { currency: string }) => c.currency === 'USD').amount).toBe(10);

    // ແກ້ amount ໃນຮ່າງ → amountBase ຄິດໃໝ່ດ້ວຍອັດຕາເດີມ
    const upd = await request(app).patch(`/api/v1/expenses/${body.id}`).set(...bearer(superToken)).send({ currency: 'THB', amount: 2_000 });
    expect(upd.body.data).toMatchObject({ fxRate: 600, amountBase: 1_200_000 });
  });

  it('E3: ເກີນເພດານ → BRANCH_ADMIN ອະນຸມັດບໍ່ໄດ້, SUPER_ADMIN ໄດ້; needsOwnerApproval ຢູ່ໃນ view', async () => {
    expect((await put(branchAdminToken, '/settings', { approvalLimit: 1 })).status).toBe(403);
    expect((await put(superToken, '/settings', { approvalLimit: 1_000_000 })).body.data.approvalLimit).toBe(1_000_000);

    const big = (await create(superToken, { branchId: HOME_BRANCH_ID, title: `${TITLE_TAG} over limit`, amount: 2_000_000 })).body.data.id as string;
    await act(superToken, big, 'submit');
    const view = await request(app).get(`/api/v1/expenses/${big}`).set(...bearer(superToken));
    expect(view.body.data.needsOwnerApproval).toBe(true);
    expect((await act(branchAdminToken, big, 'approve')).status).toBe(403);
    expect((await act(superToken, big, 'approve')).status).toBe(200);

    expect((await put(superToken, '/settings', { approvalLimit: null })).body.data.approvalLimit).toBeNull();
  });

  it('E4: ສົ່ງອະນຸມັດ → ແຈ້ງຜູ້ອະນຸມັດ; ປະຕິເສດ → ແຈ້ງຜູ້ສ້າງ', async () => {
    const id = (await create(branchAdminToken, { branchId: HOME_BRANCH_ID, title: `${TITLE_TAG} notify`, amount: 5_000 })).body.data.id as string;
    await act(branchAdminToken, id, 'submit');
    await new Promise((r) => setTimeout(r, 150));
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: ADMIN_PHONE } });
    const toApprover = await prisma.notificationLog.findMany({ where: { userId: admin.id, type: 'EXPENSE_SUBMITTED', data: { path: ['expenseId'], equals: id } } });
    expect(toApprover).toHaveLength(1);

    await act(superToken, id, 'reject', { reason: 'ບໍ່ມີບິນ' });
    await new Promise((r) => setTimeout(r, 150));
    const author = await prisma.user.findFirstOrThrow({ where: { phone: BRANCH_ADMIN_PHONE } });
    const toAuthor = await prisma.notificationLog.findMany({ where: { userId: author.id, type: 'EXPENSE_REJECTED', data: { path: ['expenseId'], equals: id } } });
    expect(toAuthor).toHaveLength(1);
    expect(toAuthor[0]!.severity).toBe('warning');
  });

  it('E5: ຍົກເລີກ PAID → VOIDED + ອອກຈາກຍອດ; ຮ່າງຍົກເລີກບໍ່ໄດ້', async () => {
    const id = (await create(superToken, { title: `${TITLE_TAG} void`, amount: 77_000, expenseDate: '2031-08-03' })).body.data.id as string;
    expect((await act(superToken, id, 'void', { reason: 'x' })).status).toBe(409);
    await act(superToken, id, 'submit');
    await act(superToken, id, 'approve');
    await act(superToken, id, 'pay', {});
    const before = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-08-01&to=2031-08-31`).set(...bearer(superToken));
    expect(before.body.data.recognisedTotal).toBe(77_000);

    expect((await act(superToken, id, 'void', {})).status).toBe(400);
    const voided = await act(superToken, id, 'void', { reason: 'ບັນທຶກຊ້ຳ' });
    expect(voided.body.data).toMatchObject({ status: 'VOIDED', voidReason: 'ບັນທຶກຊ້ຳ' });
    expect(voided.body.data.voidedBy.id).toBeTruthy();
    const after = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-08-01&to=2031-08-31`).set(...bearer(superToken));
    expect(after.body.data.recognisedTotal).toBe(0);
  });

  it('E8: dueDate/invoice/VAT + overdue flag + summary.overdue; ພາສີເກີນຈຳນວນ = 400', async () => {
    const bad = await request(app).post('/api/v1/expenses').set(...bearer(superToken)).set(...idem())
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} tax`, amount: 100, taxAmount: 200, expenseDate: todayKey() });
    expect(bad.status).toBe(400);

    const res = await request(app).post('/api/v1/expenses').set(...bearer(superToken)).set(...idem())
      .send({ branchId: testBranchId, categoryId: cat.UTILITIES, title: `${TITLE_TAG} overdue`, amount: 1_100, taxAmount: 100, invoiceNumber: 'INV-9', dueDate: '2020-01-01', expenseDate: todayKey() });
    expect(res.body.data).toMatchObject({ taxAmount: 100, invoiceNumber: 'INV-9', dueDate: '2020-01-01', isOverdue: false });
    await act(superToken, res.body.data.id, 'submit');
    const one = await request(app).get(`/api/v1/expenses/${res.body.data.id}`).set(...bearer(superToken));
    expect(one.body.data.isOverdue).toBe(true);

    const list = await request(app).get(`/api/v1/expenses?branchId=${testBranchId}&flag=overdue`).set(...bearer(superToken));
    expect(list.body.data.items.map((e: { id: string }) => e.id)).toContain(res.body.data.id);
    const sum = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}`).set(...bearer(superToken));
    expect(sum.body.data.overdue.count).toBeGreaterThanOrEqual(1);
  });

  it('E11: ປະຫວັດ — ທຸກ action + ຊ່ອງທີ່ປ່ຽນ', async () => {
    const id = (await create(superToken, { title: `${TITLE_TAG} history`, amount: 1_000 })).body.data.id as string;
    await request(app).patch(`/api/v1/expenses/${id}`).set(...bearer(superToken)).send({ amount: 2_500, title: `${TITLE_TAG} history 2` });
    await act(superToken, id, 'submit');
    const res = await request(app).get(`/api/v1/expenses/${id}/history`).set(...bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { action: string }) => h.action)).toEqual(['CREATE', 'UPDATE', 'SUBMIT']);
    const upd = res.body.data[1];
    expect(upd.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'amount', from: 1_000, to: 2_500 })]));
    expect(upd.user.name).toBeTruthy();
  });

  it('E12: status-counts ຕາມຕົວກອງດຽວກັບລາຍການ', async () => {
    const res = await request(app)
      .get(`/api/v1/expenses/status-counts?branchId=${testBranchId}&q=${encodeURIComponent('history')}`)
      .set(...bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ SUBMITTED: 1, DRAFT: 0, VOIDED: 0 });
  });

  it('E2: ງົບປະມານ upsert/delete + summary.budget ທຽບກັບຕົວຈິງ; BRANCH_ADMIN ຕັ້ງສາຂາອື່ນບໍ່ໄດ້', async () => {
    const month = '2031-09';
    const denied = await put(branchAdminToken, '/budgets', { branchId: testBranchId, month, items: [] });
    expect(denied.status).toBe(403);

    const saved = await put(superToken, '/budgets', {
      branchId: testBranchId,
      month,
      items: [
        { categoryId: cat.UTILITIES, amount: 100_000 },
        { categoryId: cat.RENT, amount: 5_000_000 },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.items).toHaveLength(2);

    const id = (await create(superToken, { title: `${TITLE_TAG} budget`, amount: 150_000, expenseDate: '2031-09-04' })).body.data.id as string;
    await act(superToken, id, 'submit');
    await act(superToken, id, 'approve');
    const sum = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-09-01&to=2031-09-30`).set(...bearer(superToken));
    expect(sum.body.data.budget.total).toBe(5_100_000);
    expect(sum.body.data.budget.byCategory).toEqual(
      expect.arrayContaining([{ categoryId: cat.UTILITIES, budget: 100_000, actual: 150_000 }]),
    );

    const removed = await put(superToken, '/budgets', { branchId: testBranchId, month, items: [{ categoryId: cat.RENT, amount: 0 }] });
    expect(removed.body.data.items).toHaveLength(1);
    const got = await request(app).get(`/api/v1/expenses/budgets?branchId=${testBranchId}&month=${month}`).set(...bearer(superToken));
    expect(got.body.data.actual).toEqual([{ categoryId: cat.UTILITIES, amount: 150_000 }]);

    const none = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=2031-10-01&to=2031-10-31`).set(...bearer(superToken));
    expect(none.body.data.budget).toBeNull();
  });

  // ── E6 / E7 / E9 / E10 ───────────────────────────────────────────
  const approvePaid = async (id: string, pay: object = {}) => {
    await act(superToken, id, 'submit');
    await act(superToken, id, 'approve');
    return act(superToken, id, 'pay', pay);
  };

  it('E10: ແບ່ງຄ່າໃຊ້ຈ່າຍ — ສ່ວນແບ່ງເຂົ້າ summary ຂອງແຕ່ລະສາຂາ; BRANCH_ADMIN ແບ່ງບໍ່ໄດ້; % ລວມ ≠ 100 = 400', async () => {
    const body = (allocations: object) => ({
      branchId: testBranchId,
      categoryId: cat.RENT,
      title: `${TITLE_TAG} shared rent`,
      amount: 1_000_000,
      expenseDate: '2031-11-03',
      allocations,
    });
    const bad = await request(app).post('/api/v1/expenses').set(...bearer(superToken)).set(...idem())
      .send(body([{ branchId: testBranchId, percent: 60 }, { branchId: HOME_BRANCH_ID, percent: 30 }]));
    expect(bad.status).toBe(400);
    const denied = await request(app).post('/api/v1/expenses').set(...bearer(branchAdminToken)).set(...idem())
      .send({ ...body([{ branchId: HOME_BRANCH_ID, percent: 50 }, { branchId: testBranchId, percent: 50 }]), branchId: HOME_BRANCH_ID });
    expect(denied.status).toBe(403);

    const res = await request(app).post('/api/v1/expenses').set(...bearer(superToken)).set(...idem())
      .send(body([{ branchId: testBranchId, percent: 60 }, { branchId: HOME_BRANCH_ID, percent: 40 }]));
    expect(res.status).toBe(201);
    expect(res.body.data.allocations.map((a: { amountBase: number }) => a.amountBase).sort()).toEqual([400_000, 600_000]);

    // ແກ້ຈຳນວນ → ສ່ວນແບ່ງຄິດໃໝ່
    const upd = await request(app).patch(`/api/v1/expenses/${res.body.data.id}`).set(...bearer(superToken)).send({ amount: 2_000_000 });
    expect(upd.body.data.allocations.find((a: { branchId: string }) => a.branchId === HOME_BRANCH_ID).amountBase).toBe(800_000);
    await act(superToken, res.body.data.id, 'submit');
    await act(superToken, res.body.data.id, 'approve');

    const sum = (branch: string) =>
      request(app).get(`/api/v1/expenses/summary?branchId=${branch}&from=2031-11-01&to=2031-11-30`).set(...bearer(superToken));
    expect((await sum(testBranchId)).body.data.recognisedTotal).toBe(1_200_000);
    expect((await sum(HOME_BRANCH_ID)).body.data.recognisedTotal).toBeGreaterThanOrEqual(800_000);
    const all = await request(app).get('/api/v1/expenses/summary?from=2031-11-01&to=2031-11-30').set(...bearer(superToken));
    const byBranch = Object.fromEntries(all.body.data.byBranch.map((b: { branchId: string; amount: number }) => [b.branchId, b.amount]));
    expect(byBranch[testBranchId]).toBe(1_200_000);
    expect(byBranch[HOME_BRANCH_ID]).toBeGreaterThanOrEqual(800_000);

    const pnl = await request(app).get(`/api/v1/expenses/profit-loss?branchId=${HOME_BRANCH_ID}&from=2031-11&to=2031-11`).set(...bearer(superToken));
    expect(pnl.body.data.operating.total).toBeGreaterThanOrEqual(800_000);

    // [] ລຶບການແບ່ງໄດ້ໃນຮ່າງ
    const d = (await create(superToken, { title: `${TITLE_TAG} alloc clear`, amount: 1_000 })).body.data.id as string;
    await request(app).patch(`/api/v1/expenses/${d}`).set(...bearer(superToken)).send({ allocations: [{ branchId: testBranchId, percent: 50 }, { branchId: HOME_BRANCH_ID, percent: 50 }] });
    const cleared = await request(app).patch(`/api/v1/expenses/${d}`).set(...bearer(superToken)).send({ allocations: [] });
    expect(cleared.body.data.allocations).toEqual([]);
  });

  it('E9: ກ່ອງເງິນສົດ — ເຕີມ/ຈ່າຍ/ບໍ່ພໍ/ຍົກເລີກຄືນເງິນ/ນັບ/ຖອນເກີນ', async () => {
    const created = await request(app).post('/api/v1/expenses/cash-funds').set(...bearer(superToken))
      .send({ branchId: testBranchId, name: 'Front desk', openingBalance: 100_000, floatAmount: 200_000 });
    expect(created.status).toBe(201);
    const fundId = created.body.data.id as string;
    expect(created.body.data.balance).toBe(100_000);
    expect((await request(app).post('/api/v1/expenses/cash-funds').set(...bearer(superToken)).send({ branchId: testBranchId, name: 'Front desk' })).status).toBe(409);

    const a = (await create(superToken, { title: `${TITLE_TAG} cash a`, amount: 30_000 })).body.data.id as string;
    const paid = await approvePaid(a, { cashFundId: fundId });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paidFromCashFund).toEqual({ id: fundId, name: 'Front desk' });

    const b = (await create(superToken, { title: `${TITLE_TAG} cash b`, amount: 200_000 })).body.data.id as string;
    const short = await approvePaid(b, { cashFundId: fundId });
    expect(short.status).toBe(400);
    expect((await approvePaid(b, { cashFundId: fundId, paidFromAccountId: testAccountId })).status).toBe(400);

    const list = () => request(app).get(`/api/v1/expenses/cash-funds?branchId=${testBranchId}`).set(...bearer(superToken));
    expect((await list()).body.data[0]).toMatchObject({ balance: 70_000, spent30d: 30_000 });

    await act(superToken, a, 'void', { reason: 'ຄືນເງິນ' });
    expect((await list()).body.data[0].balance).toBe(100_000);

    const counted = await request(app).post(`/api/v1/expenses/cash-funds/${fundId}/count`).set(...bearer(superToken)).send({ countedAmount: 95_000 });
    expect(counted.body.data).toMatchObject({ balance: 95_000, lastCount: { counted: 95_000, difference: -5_000 } });

    const move = (body: object) =>
      request(app).post(`/api/v1/expenses/cash-funds/${fundId}/movements`).set(...bearer(superToken)).set(...idem()).send(body);
    expect((await move({ type: 'WITHDRAW', amount: 500_000 })).status).toBe(400);
    expect((await move({ type: 'TOPUP', amount: 105_000, note: 'top up' })).body.data.balance).toBe(200_000);

    const entries = await request(app).get(`/api/v1/expenses/cash-funds/${fundId}/entries`).set(...bearer(superToken));
    expect(entries.body.data.map((e: { type: string }) => e.type)).toEqual(['TOPUP', 'COUNT', 'REVERSAL', 'EXPENSE', 'TOPUP']);
    expect(entries.body.data[0].balanceAfter).toBe(200_000);

    // BRANCH_ADMIN ຂອງສາຂາອື່ນ ເບິ່ງ/ໃຊ້ກ່ອງນີ້ບໍ່ໄດ້
    expect((await request(app).get(`/api/v1/expenses/cash-funds/${fundId}/entries`).set(...bearer(branchAdminToken))).status).toBe(403);
  });

  it('E6: ລາຍຈ່າຍທີ່ຈັບຄູ່ກັບໃບແຈ້ງຍອດ → bankMatch; ຍົກເລີກ → ແຖວກັບເປັນ UNMATCHED; ງວດປິດແລ້ວ → ຍົກເລີກບໍ່ໄດ້', async () => {
    const id = (await create(superToken, { title: `${TITLE_TAG} bank match`, amount: 55_000 })).body.data.id as string;
    await approvePaid(id, { paidFromAccountId: testAccountId, paidReference: 'FT-E6' });
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: ADMIN_PHONE } });
    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: testAccountId, fileName: 'e6.csv', mapping: {}, rowCount: 1, creditTotal: 0, debitTotal: 55_000,
        fromDate: new Date(`${todayKey()}T00:00:00Z`), toDate: new Date(`${todayKey()}T00:00:00Z`), importedById: admin.id,
      },
    });
    const line = await prisma.bankStatementLine.create({
      data: {
        importId: imp.id, bankAccountId: testAccountId, statementDate: new Date(`${todayKey()}T00:00:00Z`), direction: 'DEBIT',
        amount: 55_000, reference: 'FT-E6', seq: 1, dedupeHash: `e6-${randomUUID()}`, matchStatus: 'MATCHED', matchedExpenseId: id, matchedAt: new Date(),
      },
    });
    const view = await request(app).get(`/api/v1/expenses/${id}`).set(...bearer(superToken));
    expect(view.body.data.bankMatch).toMatchObject({ reference: 'FT-E6', auto: true });
    const sum = await request(app).get(`/api/v1/expenses/summary?branchId=${testBranchId}&from=${todayKey()}&to=${todayKey()}`).set(...bearer(superToken));
    expect(sum.body.data.bankPaid.matched).toBeGreaterThanOrEqual(1);

    const period = await prisma.reconciliationPeriod.create({
      data: { branchId: testBranchId, month: todayKey().slice(0, 7), closedById: admin.id, summary: {} },
    });
    expect((await act(superToken, id, 'void', { reason: 'x' })).status).toBe(409);
    await prisma.reconciliationPeriod.delete({ where: { id: period.id } });

    expect((await act(superToken, id, 'void', { reason: 'ຈ່າຍຜິດ' })).status).toBe(200);
    const after = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(after).toMatchObject({ matchStatus: 'UNMATCHED', matchedExpenseId: null });
  });

  it('E7: receipt-scan ອ່ານຍອດລວມ/ວັນທີ/ເລກໃບແຈ້ງໜີ້ຈາກຮູບ + ບອກໃບຊ້ຳ', async () => {
    const sharp = (await import('sharp')).default;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="420"><rect width="100%" height="100%" fill="white"/>
      <g font-family="Arial" font-size="30" fill="black">
      <text x="30" y="50">SAKURA SUPPLY CO</text>
      <text x="30" y="110">Invoice No: INV-20488</text>
      <text x="30" y="160">Date: 12/03/2026</text>
      <text x="30" y="230">Subtotal 136,364</text>
      <text x="30" y="280">VAT 10% 13,636</text>
      <text x="30" y="340">TOTAL 150,000 LAK</text></g></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const res = await request(app).post('/api/v1/expenses/receipt-scan').set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: png.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 150_000, taxAmount: 13_636, date: '2026-03-12', invoiceNumber: 'INV-20488', currency: 'LAK' });
    expect(res.body.data.vendor).toMatch(/SAKURA/);
    expect(res.body.data.duplicateOf).toBeNull();

    const id = (await create(superToken, { title: `${TITLE_TAG} scanned`, amount: 150_000 })).body.data.id as string;
    await request(app).post(`/api/v1/expenses/${id}/attachments`).set(...bearer(superToken)).send({ contentType: 'image/png', dataBase64: png.toString('base64') });
    const again = await request(app).post('/api/v1/expenses/receipt-scan').set(...bearer(superToken))
      .send({ contentType: 'image/png', dataBase64: png.toString('base64') });
    expect(again.body.data.duplicateOf).toEqual({ expenseId: id, title: `${TITLE_TAG} scanned` });
  }, 60_000);
});
