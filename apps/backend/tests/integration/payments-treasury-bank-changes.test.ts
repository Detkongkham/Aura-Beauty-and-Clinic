import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — ກັນການສັບປ່ຽນບັນຊີຮັບເງິນ (ຄຳຂໍປ່ຽນ + ຢືນຢັນລະຫັດຜ່ານ) ແລະ ການຜູກບັນຊີໃຫ້ເງິນໂອນ
 * (ອະນຸມັດສະລິບ / ລາຍການທີ່ບໍ່ມີບັນຊີ). ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const HOME = '11111111-1111-1111-1111-111111111111';
const ADMIN_PW = 'Admin@12345';
const MANAGER_PW = 'Manager@12345';
const API = '/api/v1/payments-treasury';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

describe('payments-treasury: bank-account change control + transfer account', () => {
  let app: Express;
  let superToken: string;
  let managerToken: string;
  let superId: string;
  let managerId: string;
  let bcelId: string;
  let acctA: string; // HOME, non-default, used for change requests
  let acctB: string; // HOME, second test account (so a slip can't be auto-resolved)
  const createdAccounts: string[] = [];
  const paymentIds: string[] = [];

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    superToken = await login('02000000000', ADMIN_PW);
    managerToken = await login('02000000001', MANAGER_PW);
    superId = (await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } })).id;
    managerId = (await prisma.user.findFirstOrThrow({ where: { phone: '02000000001' } })).id;
    bcelId = (await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } })).id;
    const mk = (name: string, number: string) =>
      prisma.bankAccount.create({ data: { bankId: bcelId, branchId: HOME, accountName: name, accountNumber: number } });
    acctA = (await mk('Change Test A', '5550001111')).id;
    acctB = (await mk('Change Test B', '5550002222')).id;
    createdAccounts.push(acctA, acctB);
  });

  afterAll(async () => {
    const created = await prisma.bankAccountChangeRequest.findMany({
      where: { OR: [{ bankAccountId: { in: createdAccounts } }, { payload: { path: ['accountName'], string_starts_with: 'Change Test' } }] },
      select: { id: true, bankAccountId: true },
    });
    const ids = created.map((c) => c.id);
    for (const c of created) if (c.bankAccountId) createdAccounts.push(c.bankAccountId);
    await prisma.notificationLog.deleteMany({ where: { OR: ids.map((id) => ({ dedupeKey: { contains: id } })) } });
    await prisma.bankAccountChangeRequest.deleteMany({ where: { id: { in: ids } } });
    await prisma.paymentSlip.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.bankAccount.deleteMany({ where: { id: { in: [...new Set(createdAccounts)] } } });
    await prisma.$disconnect();
  });

  it('ປ່ຽນເລກບັນຊີ ຕ້ອງຢືນຢັນລະຫັດຜ່ານ: ບໍ່ມີ → REAUTH_REQUIRED, ຜິດ → REAUTH_FAILED', async () => {
    const none = await request(app).patch(`${API}/bank-accounts/${acctA}`).set(...bearer(superToken)).send({ accountNumber: '5550009999' });
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('REAUTH_REQUIRED');
    const wrong = await request(app)
      .patch(`${API}/bank-accounts/${acctA}`)
      .set(...bearer(superToken))
      .send({ accountNumber: '5550009999', currentPassword: 'nope' });
    expect(wrong.body.error.code).toBe('REAUTH_FAILED');
    const unchanged = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acctA } });
    expect(unchanged.accountNumber).toBe('5550001111');

    // ບໍ່ແມ່ນ field ຜູ້ຮັບເງິນ (ສົ່ງເລກເດີມ + isActive) → ບໍ່ຕ້ອງໃຊ້ລະຫັດຜ່ານ
    const plain = await request(app)
      .patch(`${API}/bank-accounts/${acctA}`)
      .set(...bearer(managerToken))
      .send({ accountNumber: '5550001111', isActive: true });
    expect(plain.status).toBe(200);
  });

  it('BRANCH_ADMIN ປ່ຽນເລກບັນຊີ → 202 ລໍອະນຸມັດ, ບັນຊີຍັງບໍ່ປ່ຽນ, ແຈ້ງເຈົ້າຂອງ; ຍື່ນຊ້ຳ → 409', async () => {
    const res = await request(app)
      .patch(`${API}/bank-accounts/${acctA}`)
      .set(...bearer(managerToken))
      .send({ accountNumber: '5550007777', currentPassword: MANAGER_PW });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ kind: 'UPDATE', status: 'PENDING', bankAccountId: acctA });
    expect(res.body.data.changes).toEqual([{ field: 'accountNumber', before: '5550001111', after: '5550007777' }]);

    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: acctA } })).accountNumber).toBe('5550001111');
    const list = await request(app).get(`${API}/bank-accounts`).set(...bearer(managerToken));
    const row = list.body.data.find((a: { id: string }) => a.id === acctA);
    expect(row.pendingChange).toMatchObject({ id: res.body.data.id, kind: 'UPDATE' });

    const note = await prisma.notificationLog.findFirst({
      where: { userId: superId, type: 'BANK_ACCOUNT_CHANGE_REQUEST', dedupeKey: { contains: res.body.data.id } },
    });
    expect(note?.body).toContain('···1111 → ···7777');
    expect(note?.body).not.toContain('5550007777');

    const again = await request(app)
      .post(`${API}/bank-accounts/${acctA}/qr`)
      .set(...bearer(managerToken))
      .send({ contentType: 'image/png', dataBase64: 'AAAA', currentPassword: MANAGER_PW });
    expect(again.status).toBe(409);
  });

  it('ອະນຸມັດ: BRANCH_ADMIN ບໍ່ໄດ້; SUPER_ADMIN ຕ້ອງມີລະຫັດຜ່ານ → ນຳໃຊ້ ແລະ ແຈ້ງຜູ້ຍື່ນ', async () => {
    const pending = await prisma.bankAccountChangeRequest.findFirstOrThrow({ where: { bankAccountId: acctA, status: 'PENDING' } });
    const byManager = await request(app)
      .post(`${API}/bank-account-changes/${pending.id}/approve`)
      .set(...bearer(managerToken))
      .send({ currentPassword: MANAGER_PW });
    expect(byManager.status).toBe(403);
    const noPw = await request(app).post(`${API}/bank-account-changes/${pending.id}/approve`).set(...bearer(superToken)).send({});
    expect(noPw.status).toBe(400);

    const ok = await request(app)
      .post(`${API}/bank-account-changes/${pending.id}/approve`)
      .set(...bearer(superToken))
      .send({ currentPassword: ADMIN_PW, note: 'confirmed by phone' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'APPROVED', reviewNote: 'confirmed by phone' });
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: acctA } })).accountNumber).toBe('5550007777');
    const told = await prisma.notificationLog.findFirst({
      where: { userId: managerId, type: 'BANK_ACCOUNT_CHANGE_APPROVED', dedupeKey: { contains: pending.id } },
    });
    expect(told).not.toBeNull();

    const twice = await request(app)
      .post(`${API}/bank-account-changes/${pending.id}/approve`)
      .set(...bearer(superToken))
      .send({ currentPassword: ADMIN_PW });
    expect(twice.status).toBe(409);
  });

  it('ຄຳຂໍທີ່ລ້າສະໄໝ (ບັນຊີຖືກແກ້ຫຼັງຍື່ນ) ອະນຸມັດບໍ່ໄດ້; ປະຕິເສດໄດ້ ແລະ ແຈ້ງຜູ້ຍື່ນ', async () => {
    const req1 = await request(app)
      .patch(`${API}/bank-accounts/${acctA}`)
      .set(...bearer(managerToken))
      .send({ accountName: 'Change Test A (renamed)', currentPassword: MANAGER_PW });
    expect(req1.status).toBe(202);

    // ເຈົ້າຂອງແກ້ໂດຍກົງ → ນຳໃຊ້ທັນທີ + ບັນທຶກ APPROVED + ແຈ້ງ admin ສາຂາ
    const direct = await request(app)
      .patch(`${API}/bank-accounts/${acctA}`)
      .set(...bearer(superToken))
      .send({ accountNumber: '5550008888', currentPassword: ADMIN_PW });
    expect(direct.status).toBe(200);
    expect(direct.body.data.accountNumber).toBe('5550008888');
    const history = await prisma.bankAccountChangeRequest.findFirst({
      where: { bankAccountId: acctA, status: 'APPROVED', requestedById: superId },
      orderBy: { createdAt: 'desc' },
    });
    expect(history?.reviewedById).toBe(superId);
    const warned = await prisma.notificationLog.findFirst({
      where: { userId: managerId, type: 'BANK_ACCOUNT_CHANGED', dedupeKey: { contains: history!.id } },
    });
    expect(warned).not.toBeNull();

    const stale = await request(app)
      .post(`${API}/bank-account-changes/${req1.body.data.id}/approve`)
      .set(...bearer(superToken))
      .send({ currentPassword: ADMIN_PW });
    expect(stale.status).toBe(409);

    const noNote = await request(app).post(`${API}/bank-account-changes/${req1.body.data.id}/reject`).set(...bearer(superToken)).send({});
    expect(noNote.status).toBe(400);
    const rejected = await request(app)
      .post(`${API}/bank-account-changes/${req1.body.data.id}/reject`)
      .set(...bearer(superToken))
      .send({ note: 'resubmit against the new number' });
    expect(rejected.body.data.status).toBe('REJECTED');
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: acctA } })).accountName).toBe('Change Test A');
  });

  it('BRANCH_ADMIN ເພີ່ມບັນຊີ → 202 (ຍັງບໍ່ສ້າງ); ຍົກເລີກເອງໄດ້, ເຈົ້າຂອງຍົກເລີກແທນບໍ່ໄດ້', async () => {
    const before = await prisma.bankAccount.count({ where: { branchId: HOME } });
    const res = await request(app)
      .post(`${API}/bank-accounts`)
      .set(...bearer(managerToken))
      .send({ bankId: bcelId, branchId: HOME, accountName: 'Change Test New', accountNumber: '5550003333', currentPassword: MANAGER_PW });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ kind: 'CREATE', status: 'PENDING', bankAccountId: null, bankCode: 'BCEL' });
    expect(await prisma.bankAccount.count({ where: { branchId: HOME } })).toBe(before);

    const bySuper = await request(app).post(`${API}/bank-account-changes/${res.body.data.id}/cancel`).set(...bearer(superToken));
    expect(bySuper.status).toBe(403);
    const cancelled = await request(app).post(`${API}/bank-account-changes/${res.body.data.id}/cancel`).set(...bearer(managerToken));
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const queue = await request(app).get(`${API}/bank-account-changes`).query({ status: 'PENDING' }).set(...bearer(superToken));
    expect(queue.body.data.some((c: { id: string }) => c.id === res.body.data.id)).toBe(false);
  });

  it('ອະນຸມັດສະລິບທີ່ບໍ່ຮູ້ບັນຊີ (ສາຂາມີຫຼາຍບັນຊີ) → 400 ໃຫ້ເລືອກ; ເລືອກແລ້ວ tx ຜູກບັນຊີ', async () => {
    const payment = await prisma.payment.create({ data: { branchId: HOME, totalAmount: 120000 } });
    paymentIds.push(payment.id);
    const slip = await prisma.paymentSlip.create({
      data: {
        paymentId: payment.id,
        branchId: HOME,
        uploadedById: managerId,
        imageKey: `test/${randomUUID()}.jpg`,
        imageUrl: 'http://localhost/x.jpg',
        imageHash: randomUUID(),
        contentType: 'image/jpeg',
        sizeBytes: 10,
        ocrStatus: 'DONE',
        verdict: 'NEEDS_REVIEW',
        amount: 120000,
        currency: 'LAK',
        txnRef: `REF${Date.now()}`,
        mismatchFields: ['receiverAccount'],
      },
    });
    const review = (body: object) =>
      request(app)
        .post(`${API}/slips/${slip.id}/review`)
        .set(...bearer(superToken))
        .set('Idempotency-Key', randomUUID())
        .send(body);

    const blocked = await review({ action: 'APPROVE' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toContain('ເລືອກບັນຊີ');

    const ok = await review({ action: 'APPROVE', correctedFields: { bankAccountId: acctB } });
    expect(ok.status).toBe(200);
    const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(tx.bankAccountId).toBe(acctB);
    expect(ok.body.data.bankAccount.id).toBe(acctB);
  });

  it('ເງິນໂອນທີ່ບໍ່ມີບັນຊີ: ລາຍການ + ຜູກບັນຊີ (ເທື່ອດຽວ; ບັນຊີສາຂາອື່ນ → 400)', async () => {
    const payment = await prisma.payment.create({ data: { branchId: HOME, totalAmount: 50000 } });
    paymentIds.push(payment.id);
    const tx = await prisma.paymentTransaction.create({
      data: { paymentId: payment.id, method: 'BANK_TRANSFER', amount: 50000, qrReference: 'LEGACY1' },
    });

    const list = await request(app).get(`${API}/unassigned-transfers`).set(...bearer(managerToken));
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: { id: string }) => r.id === tx.id);
    expect(row).toMatchObject({ amount: 50000, branchId: HOME, reference: 'LEGACY1' });

    const other = await prisma.bankAccount.findFirst({ where: { branchId: { not: HOME } } });
    if (other) {
      const cross = await request(app)
        .patch(`${API}/transactions/${tx.id}/bank-account`)
        .set(...bearer(superToken))
        .send({ bankAccountId: other.id });
      expect(cross.status).toBe(400);
    }
    const ok = await request(app)
      .patch(`${API}/transactions/${tx.id}/bank-account`)
      .set(...bearer(managerToken))
      .send({ bankAccountId: acctB });
    expect(ok.status).toBe(204);
    expect((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).bankAccountId).toBe(acctB);
    const again = await request(app)
      .patch(`${API}/transactions/${tx.id}/bank-account`)
      .set(...bearer(managerToken))
      .send({ bankAccountId: acctA });
    expect(again.status).toBe(409);
  });
});
