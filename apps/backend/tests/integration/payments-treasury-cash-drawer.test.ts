import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/** Integration — G10 ລິ້ນຊັກເງິນສົດ: ເປີດ/ເຄື່ອນໄຫວ/ນັບປິດ, ຍອດທີ່ຄວນມີ, ສ່ວນຕ່າງ, ຂອບເຂດສາຂາ. */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_NAME = 'ສາຂາທົດສອບລິ້ນຊັກ';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const API = '/api/v1/payments-treasury/cash-drawer';

describe('payments-treasury cash drawer (G10)', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let branchId: string;
  let paymentId: string;

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await prisma.branch.deleteMany({ where: { name: BRANCH_NAME } });
    superToken = await login('02000000000', 'Admin@12345');
    branchAdminToken = await login('02000000001', 'Manager@12345');
    branchId = (await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'x', phone: '02097777702' } })).id;
    paymentId = (await prisma.payment.create({ data: { branchId, totalAmount: 500000 } })).id;
  });

  afterAll(async () => {
    await prisma.cashDrawerSession.deleteMany({ where: { branchId } });
    await prisma.refund.deleteMany({ where: { paymentId } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it('open → sales/refund/movements → expected; one open drawer per branch', async () => {
    const opened = await request(app).post(`${API}/sessions`).set(...bearer(superToken)).send({ branchId, openingFloat: 200000 });
    expect(opened.status).toBe(201);
    const id = opened.body.data.id;
    const dup = await request(app).post(`${API}/sessions`).set(...bearer(superToken)).send({ branchId, openingFloat: 1 });
    expect(dup.status).toBe(409);

    await prisma.paymentTransaction.create({ data: { paymentId, method: 'CASH', amount: 150000, status: 'SUCCESS' } });
    await prisma.paymentTransaction.create({ data: { paymentId, method: 'BANK_QR', amount: 999999, status: 'SUCCESS' } });
    const admin = await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } });
    await prisma.refund.create({
      data: { paymentId, amount: 20000, reason: 'x', method: 'CASH', status: 'PAID', requestedById: admin.id, paidAt: new Date() },
    });
    await request(app).post(`${API}/sessions/${id}/movements`).set(...bearer(superToken)).send({ type: 'DROP', amount: 100000, note: 'to bank' });
    const mv = await request(app).post(`${API}/sessions/${id}/movements`).set(...bearer(superToken)).send({ type: 'PAYIN', amount: 10000 });
    expect(mv.body.data).toMatchObject({ cashSales: 150000, cashSalesCount: 1, cashRefunds: 20000, drops: 100000, payIns: 10000, expectedAmount: 240000 });

    const cur = await request(app).get(`${API}/current`).query({ branchId }).set(...bearer(superToken));
    expect(cur.body.data.id).toBe(id);
  });

  it('close by denominations: variance requires a note; closed drawer is frozen', async () => {
    const cur = await request(app).get(`${API}/current`).query({ branchId }).set(...bearer(superToken));
    const id = cur.body.data.id;
    const noNote = await request(app).post(`${API}/sessions/${id}/close`).set(...bearer(superToken)).send({ denominations: { '100000': 2, '20000': 1, '10000': 1 } });
    expect(noNote.status).toBe(400);
    const badDenom = await request(app).post(`${API}/sessions/${id}/close`).set(...bearer(superToken)).send({ denominations: { '7': 1 }, note: 'x' });
    expect(badDenom.status).toBe(400);
    const closed = await request(app).post(`${API}/sessions/${id}/close`).set(...bearer(superToken))
      .send({ denominations: { '100000': 2, '20000': 1, '10000': 1 }, note: 'short 10k' });
    expect(closed.body.data).toMatchObject({ status: 'CLOSED', countedAmount: 230000, expectedAmount: 240000, variance: -10000, closingNote: 'short 10k' });
    const again = await request(app).post(`${API}/sessions/${id}/movements`).set(...bearer(superToken)).send({ type: 'DROP', amount: 1 });
    expect(again.status).toBe(409);
    const list = await request(app).get(`${API}/sessions`).query({ branchId }).set(...bearer(superToken));
    expect(list.body.data[0]).toMatchObject({ id, status: 'CLOSED' });
    const none = await request(app).get(`${API}/current`).query({ branchId }).set(...bearer(superToken));
    expect(none.body.data).toBeNull();
  });

  it('BRANCH_ADMIN cannot see or open another branch drawer', async () => {
    const cross = await request(app).get(`${API}/current`).query({ branchId }).set(...bearer(branchAdminToken));
    expect(cross.status).toBe(403);
    const own = await request(app).get(`${API}/current`).query({ branchId: HOME_BRANCH_ID }).set(...bearer(branchAdminToken));
    expect(own.status).toBe(200);
  });
});
