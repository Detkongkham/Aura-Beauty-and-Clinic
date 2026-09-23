import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Module 39 W1: Bank registry + BankAccount CRUD + provider QR-intent.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const BRANCH_ADMIN_PHONE = '02000000001';
const BRANCH_ADMIN_PASSWORD = 'Manager@12345';
const OTHER_BRANCH_NAME = 'ສາຂາທົດສອບການເງິນ';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

describe('payments-treasury: banks + bank accounts', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let bcelId: string;
  let otherBranchId: string;
  let createdAccountId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.bankAccountChangeRequest.deleteMany({ where: { branch: { name: OTHER_BRANCH_NAME } } });
    await prisma.branch.deleteMany({ where: { name: OTHER_BRANCH_NAME } });

    superToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;
    branchAdminToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: BRANCH_ADMIN_PHONE, password: BRANCH_ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;

    const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
    bcelId = bcel.id;

    const otherBranch = await prisma.branch.create({
      data: { name: OTHER_BRANCH_NAME, address: 'ທົດສອບ', phone: '02098888888' },
    });
    otherBranchId = otherBranch.id;
  });

  afterAll(async () => {
    if (createdAccountId) {
      await prisma.bankAccount.deleteMany({ where: { id: createdAccountId } });
    }
    await prisma.bankAccountChangeRequest.deleteMany({ where: { branchId: otherBranchId } });
    await prisma.branch.deleteMany({ where: { id: otherBranchId } });
    await prisma.$disconnect();
  });

  it('401 ໂດຍບໍ່ມີ token', async () => {
    const res = await request(app).get('/api/v1/payments-treasury/banks');
    expect(res.status).toBe(401);
  });

  it('GET /banks — ຄືນລາຍຊື່ທະນາຄານທີ່ seed ໄວ້ (BCEL ຢູ່ໃນນັ້ນ)', async () => {
    const res = await request(app).get('/api/v1/payments-treasury/banks').set(...bearer(superToken));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((b: { code: string }) => b.code);
    expect(codes).toContain('BCEL');
  });

  it('ບັນຊີທຳອິດຂອງສາຂາໃໝ່ ກາຍເປັນ default ໂດຍອັດຕະໂນມັດ', async () => {
    const res = await request(app)
      .post('/api/v1/payments-treasury/bank-accounts')
      .set(...bearer(superToken))
      .send({
        bankId: bcelId,
        branchId: otherBranchId,
        accountName: 'Test Branch Account',
        accountNumber: '999888777',
        currentPassword: ADMIN_PASSWORD,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(true);
    createdAccountId = res.body.data.id;
  });

  it('ຕັ້ງບັນຊີທີ 2 ເປັນ default → ບັນຊີເກົ່າຫຼຸດ default ອັດຕະໂນມັດ', async () => {
    const second = await request(app)
      .post('/api/v1/payments-treasury/bank-accounts')
      .set(...bearer(superToken))
      .send({
        bankId: bcelId,
        branchId: otherBranchId,
        accountName: 'Second Account',
        accountNumber: '111222333',
        isDefault: true,
        currentPassword: ADMIN_PASSWORD,
      });
    expect(second.status).toBe(201);
    expect(second.body.data.isDefault).toBe(true);

    const list = await request(app)
      .get(`/api/v1/payments-treasury/bank-accounts?branchId=${otherBranchId}`)
      .set(...bearer(superToken));
    const defaults = list.body.data.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.data.id);

    await prisma.bankAccount.delete({ where: { id: second.body.data.id } });
    await prisma.bankAccount.update({ where: { id: createdAccountId }, data: { isDefault: true } });
  });

  it('BRANCH_ADMIN ບໍ່ສາມາດເບິ່ງ/ສ້າງບັນຊີສາຂາອື່ນໄດ້', async () => {
    const list = await request(app)
      .get(`/api/v1/payments-treasury/bank-accounts?branchId=${otherBranchId}`)
      .set(...bearer(branchAdminToken));
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/v1/payments-treasury/bank-accounts')
      .set(...bearer(branchAdminToken))
      .send({
        bankId: bcelId,
        branchId: otherBranchId,
        accountName: 'Should Fail',
        accountNumber: '000000000',
      });
    expect(create.status).toBe(403);
  });

  it('ບໍ່ສາມາດລຶບບັນຊີ default ໄດ້', async () => {
    const res = await request(app)
      .delete(`/api/v1/payments-treasury/bank-accounts/${createdAccountId}`)
      .set(...bearer(superToken));
    expect(res.status).toBe(400);
  });

  it('POST /providers/MANUAL_TRANSFER/qr-intent — ໃຊ້ບັນຊີ default ຂອງສາຂາຖ້າບໍ່ໄດ້ລະບຸ', async () => {
    const payment = await prisma.payment.create({
      data: { branchId: HOME_BRANCH_ID, totalAmount: 150000 },
    });

    const res = await request(app)
      .post('/api/v1/payments-treasury/providers/MANUAL_TRANSFER/qr-intent')
      .set(...bearer(superToken))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentId: payment.id, amount: 150000, currency: 'LAK', ttlMinutes: 15 });

    expect(res.status).toBe(201);
    expect(res.body.data.bankAccount).toBeTruthy();
    expect(res.body.data.qrPayload).toContain('MANUAL_TRANSFER');

    await prisma.providerIntent.deleteMany({ where: { paymentId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });
});
