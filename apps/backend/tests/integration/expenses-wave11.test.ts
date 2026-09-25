import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { vientianeDateKey } from '../../src/utils/dateHelpers.js';
import { generateDueRecurringExpenses } from '../../src/modules/expenses/expenses.service.js';
import { autoMatch } from '../../src/modules/payments-treasury/reconciliation/matcher.js';

/**
 * Integration — Wave 11 expenses leftovers: PDF receipt text, petty-cash top-up from a bank account
 * (reconciliation debit + matching), recurring allocation templates.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const BRANCH_NAME = 'ສາຂາທົດສອບ W11 ລາຍຈ່າຍ';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];
const todayKey = (): string => vientianeDateKey(new Date()).toISOString().slice(0, 10);

/** Minimal one-page PDF with a text layer (Helvetica, one line per Tj). */
function makePdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 50 750 Td ${lines.map((l, i) => `${i ? '0 -16 Td ' : ''}(${l}) Tj`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let app: Express;
let token = '';
let branchId = '';
let accountId = '';
let categoryId = '';

async function cleanup(): Promise<void> {
  const b = await prisma.branch.findFirst({ where: { name: BRANCH_NAME }, select: { id: true } });
  if (!b) return;
  await prisma.expense.deleteMany({ where: { OR: [{ branchId: b.id }, { allocations: { some: { branchId: b.id } } }] } });
  await prisma.recurringExpense.deleteMany({ where: { branchId: b.id } });
  await prisma.bankStatementImport.deleteMany({ where: { bankAccount: { branchId: b.id } } });
  await prisma.cashFund.deleteMany({ where: { branchId: b.id } });
  await prisma.bankAccount.deleteMany({ where: { branchId: b.id } });
  await prisma.auditLog.deleteMany({ where: { branchId: b.id } });
  await prisma.branch.delete({ where: { id: b.id } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  token = (await request(app).post('/api/v1/auth/login').send(ADMIN)).body.data.tokens.accessToken;
  branchId = (await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'ທົດສອບ', phone: '02097777701' } })).id;
  const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
  accountId = (
    await prisma.bankAccount.create({ data: { bankId: bcel.id, branchId, accountName: 'W11 Pay', accountNumber: '9990001119991' } })
  ).id;
  categoryId = (await prisma.expenseCategory.findFirstOrThrow({ where: { isActive: true } })).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Wave 11 — PDF receipt scan', () => {
  it('ອ່ານ text layer ຂອງ PDF', async () => {
    const pdf = makePdf(['ACME Supplies Co', 'Invoice No: INV-7781', 'Date 12/09/2026', 'Total 150,000 LAK']);
    const r = await request(app)
      .post('/api/v1/expenses/receipt-scan')
      .set(...bearer(token))
      .send({ contentType: 'application/pdf', dataBase64: pdf.toString('base64') });
    expect(r.status).toBe(200);
    expect(r.body.data.engine).toBe('pdf-text');
    expect(r.body.data.total).toBe(150_000);
    expect(r.body.data.invoiceNumber).toBe('INV-7781');
  });

  it('PDF ທີ່ບໍ່ມີຂໍ້ຄວາມ ແລະ ໄຟລ໌ປອມ → 400', async () => {
    const blank = makePdf([]);
    const r1 = await request(app).post('/api/v1/expenses/receipt-scan').set(...bearer(token)).send({ contentType: 'application/pdf', dataBase64: blank.toString('base64') });
    expect(r1.status).toBe(400);
    const r2 = await request(app).post('/api/v1/expenses/receipt-scan').set(...bearer(token)).send({ contentType: 'application/pdf', dataBase64: Buffer.from('not a pdf').toString('base64') });
    expect(r2.status).toBe(400);
  });
});

describe('Wave 11 — petty-cash top-up from bank → reconciliation', () => {
  it('TOPUP ຈາກບັນຊີ = DEBIT ຝັ່ງລະບົບ, ຈັບຄູ່ກັບແຖວ statement ໄດ້', async () => {
    const fund = await request(app).post('/api/v1/expenses/cash-funds').set(...bearer(token)).send({ branchId, name: 'Desk W11' });
    expect(fund.status).toBe(201);
    const fundId = fund.body.data.id as string;
    const move = (body: object) =>
      request(app).post(`/api/v1/expenses/cash-funds/${fundId}/movements`).set(...bearer(token)).set(...idem()).send(body);

    expect((await move({ type: 'WITHDRAW', amount: 1, bankAccountId: accountId })).status).toBe(400);
    const top = await move({ type: 'TOPUP', amount: 300_000, bankAccountId: accountId, note: 'float' });
    expect(top.status).toBe(200);

    const entries = await request(app).get(`/api/v1/expenses/cash-funds/${fundId}/entries`).set(...bearer(token));
    expect(entries.body.data[0].bankAccount.id).toBe(accountId);

    const date = todayKey();
    const day = await request(app).get('/api/v1/payments-treasury/reconciliation/day').query({ bankAccountId: accountId, date }).set(...bearer(token));
    expect(day.status).toBe(200);
    const debit = day.body.data.debits.find((d: { kind: string }) => d.kind === 'CASH_FUND');
    expect(debit.amount).toBe(300_000);
    expect(day.body.data.row.systemDebit).toBe(300_000);

    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: accountId,
        fileName: 'w11.csv',
        mapping: {},
        rowCount: 1,
        creditTotal: 0,
        debitTotal: 300_000,
        fromDate: new Date(`${date}T00:00:00Z`),
        toDate: new Date(`${date}T00:00:00Z`),
        importedById: (await prisma.user.findFirstOrThrow({ where: { phone: ADMIN.phone } })).id,
      },
    });
    const line = await prisma.bankStatementLine.create({
      data: {
        importId: imp.id,
        bankAccountId: accountId,
        statementDate: new Date(`${date}T00:00:00Z`),
        direction: 'DEBIT',
        amount: 300_000,
        description: 'ATM withdrawal',
        seq: 1,
        dedupeHash: randomUUID(),
      },
    });
    expect(await autoMatch(accountId, date, date)).toBe(1);
    const matched = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(matched.matchedCashFundEntryId).toBe(debit.id);

    const after = await request(app).get('/api/v1/payments-treasury/reconciliation/day').query({ bankAccountId: accountId, date }).set(...bearer(token));
    expect(after.body.data.lines[0].matchedKind).toBe('CASH_FUND');
    expect(after.body.data.debits.find((d: { kind: string }) => d.kind === 'CASH_FUND').matchedLineId).toBe(line.id);
  });
});

describe('Wave 11 — recurring allocation template', () => {
  it('template ຕິດໄປກັບລາຍຈ່າຍທີ່ສ້າງ; [] ລຶບ template', async () => {
    const r = await request(app)
      .post('/api/v1/expenses/recurring')
      .set(...bearer(token))
      .send({
        branchId,
        categoryId,
        title: 'W11 shared rent',
        amount: 1_000_000,
        dayOfMonth: 1,
        allocations: [
          { branchId, percent: 60 },
          { branchId: HOME_BRANCH_ID, percent: 40 },
        ],
      });
    expect(r.status).toBe(201);
    expect(r.body.data.allocations).toHaveLength(2);
    expect(r.body.data.allocations[1].branchName).not.toBe('—');

    const bad = await request(app)
      .post('/api/v1/expenses/recurring')
      .set(...bearer(token))
      .send({ branchId, categoryId, title: 'W11 bad', amount: 1, dayOfMonth: 1, allocations: [{ branchId, percent: 50 }] });
    expect(bad.status).toBe(400);

    await generateDueRecurringExpenses(new Date('2031-05-02T03:00:00Z'));
    const exp = await prisma.expense.findFirstOrThrow({
      where: { recurringExpenseId: r.body.data.id },
      include: { allocations: true },
    });
    const byBranch = Object.fromEntries(exp.allocations.map((a) => [a.branchId, a.amountBase.toNumber()]));
    expect(byBranch[branchId]).toBe(600_000);
    expect(byBranch[HOME_BRANCH_ID]).toBe(400_000);

    const cleared = await request(app).patch(`/api/v1/expenses/recurring/${r.body.data.id}`).set(...bearer(token)).send({ allocations: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.allocations).toEqual([]);
  });
});
