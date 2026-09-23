import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { signWebhookBody } from '../../src/modules/payments-treasury/providers/webhookUtil.js';
import { replayStaleEvents } from '../../src/modules/payments-treasury/payments-treasury.webhook.js';

/**
 * Integration — Module 39 W2: webhook (HMAC, idempotent event log, intent state machine) + simulate-paid.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const EVENT_PREFIX = 'w2test_';

describe('payments-treasury: webhook + simulate-paid', () => {
  let app: Express;
  let superToken: string;
  const paymentIds: string[] = [];

  const newPayment = async (total = 200000): Promise<string> => {
    const p = await prisma.payment.create({ data: { branchId: HOME_BRANCH_ID, totalAmount: total } });
    paymentIds.push(p.id);
    return p.id;
  };
  const newIntent = async (paymentId: string, amount = 100000, providerCode = 'MOCK_LAO_QR') => {
    const res = await request(app)
      .post(`/api/v1/payments-treasury/providers/${providerCode}/qr-intent`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentId, amount, currency: 'LAK', ttlMinutes: 15 });
    expect(res.status).toBe(201);
    return { id: res.body.data.intentId as string, reference: res.body.data.reference as string };
  };
  const signedPost = (
    body: object,
    opts: { code?: string; secret?: string; signature?: string | null } = {},
  ) => {
    const raw = JSON.stringify(body);
    const sig = opts.signature === undefined ? signWebhookBody(raw, opts.secret ?? env.PAYMENT_WEBHOOK_SECRET) : opts.signature;
    const r = request(app)
      .post(`/api/v1/payments/webhooks/${opts.code ?? 'MOCK_LAO_QR'}`)
      .set('Content-Type', 'application/json');
    if (sig) r.set('X-Signature', sig);
    return r.send(raw);
  };
  const okTxCount = (paymentId: string) =>
    prisma.paymentTransaction.count({ where: { paymentId, status: 'SUCCESS' } });

  beforeAll(async () => {
    app = createApp();
    superToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })
    ).body.data.tokens.accessToken;
  });

  afterAll(async () => {
    const intents = await prisma.providerIntent.findMany({
      where: { paymentId: { in: paymentIds } },
      select: { id: true },
    });
    const ids = intents.map((i) => i.id);
    await prisma.providerEvent.deleteMany({
      where: { OR: [{ providerIntentId: { in: ids } }, { eventId: { startsWith: EVENT_PREFIX } }] },
    });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.providerIntent.deleteMany({ where: { id: { in: ids } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.$disconnect();
  });

  it('signature ຜິດ ຫຼື ບໍ່ມີ → 401 ແລະ ບໍ່ບັນທຶກ event', async () => {
    const pid = await newPayment();
    const { reference } = await newIntent(pid);
    const body = { eventId: `${EVENT_PREFIX}bad`, reference, status: 'SUCCESS', amount: 100000 };
    expect((await signedPost(body, { secret: 'wrong-secret-value' })).status).toBe(401);
    expect((await signedPost(body, { signature: null })).status).toBe(401);
    expect(await prisma.providerEvent.count({ where: { eventId: `${EVENT_PREFIX}bad` } })).toBe(0);
    expect(await okTxCount(pid)).toBe(0);
  });

  it('webhook ຖືກຕ້ອງ → ຕັດຍອດ; event ຊ້ຳ → ຕັດເທື່ອດຽວ; ຕ່າງ eventId → ignored', async () => {
    const pid = await newPayment();
    const { id, reference } = await newIntent(pid);
    const body = { eventId: `${EVENT_PREFIX}ok`, reference, status: 'SUCCESS', amount: 100000 };

    const first = await signedPost(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ duplicate: false, result: 'SETTLED' });
    expect(await okTxCount(pid)).toBe(1);
    const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: pid } });
    expect(tx).toMatchObject({ method: 'BANK_QR', providerIntentId: id });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).not.toBe('PENDING');

    const dup = await signedPost(body);
    expect(dup.body.data).toMatchObject({ duplicate: true, result: 'SETTLED' });

    const other = await signedPost({ ...body, eventId: `${EVENT_PREFIX}ok2` });
    expect(other.body.data.result).toBe('IGNORED_NOT_PENDING');
    expect(await okTxCount(pid)).toBe(1);
  });

  it('intent ໝົດອາຍຸ → ຕັດບໍ່ໄດ້ (EXPIRED)', async () => {
    const pid = await newPayment();
    const { id, reference } = await newIntent(pid);
    await prisma.providerIntent.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const res = await signedPost({ eventId: `${EVENT_PREFIX}exp`, reference, status: 'SUCCESS', amount: 100000 });
    expect(res.body.data.result).toBe('EXPIRED');
    expect(await okTxCount(pid)).toBe(0);
    expect((await prisma.providerIntent.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it('ຈຳນວນເງິນບໍ່ກົງ → AMOUNT_MISMATCH, intent ຍັງ PENDING; ເກີນຍອດບິນ → OVERPAY', async () => {
    const pid = await newPayment(100000);
    const { id, reference } = await newIntent(pid, 100000);
    const mismatch = await signedPost({ eventId: `${EVENT_PREFIX}mm`, reference, status: 'SUCCESS', amount: 90000 });
    expect(mismatch.body.data.result).toBe('AMOUNT_MISMATCH');
    expect((await prisma.providerIntent.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');

    await prisma.paymentTransaction.create({
      data: { paymentId: pid, method: 'CASH', amount: 50000, status: 'SUCCESS' },
    });
    const over = await signedPost({ eventId: `${EVENT_PREFIX}ov`, reference, status: 'SUCCESS', amount: 100000 });
    expect(over.body.data.result).toBe('OVERPAY');
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid, method: 'BANK_QR' } })).toBe(0);
  });

  it('reference ທີ່ບໍ່ຮູ້ຈັກ → UNKNOWN_INTENT (ຍັງ 200 ເພື່ອບໍ່ໃຫ້ provider retry ຊ້ຳ)', async () => {
    const res = await signedPost({ eventId: `${EVENT_PREFIX}unk`, reference: 'NOPE', status: 'SUCCESS' });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('UNKNOWN_INTENT');
  });

  it('simulate-paid ຍິງເຂົ້າເສັ້ນທາງ webhook ຈິງ → SUCCESS; FAILED → intent FAILED', async () => {
    const pid = await newPayment();
    const a = await newIntent(pid);
    const ok = await request(app)
      .post(`/api/v1/payments-treasury/intents/${a.id}/simulate-paid`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ result: 'SETTLED', intentStatus: 'SUCCESS' });
    expect(await okTxCount(pid)).toBe(1);

    const b = await newIntent(pid);
    const fail = await request(app)
      .post(`/api/v1/payments-treasury/intents/${b.id}/simulate-paid`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'FAILED' });
    expect(fail.body.data).toMatchObject({ result: 'FAILED', intentStatus: 'FAILED' });
    expect(await okTxCount(pid)).toBe(1);
  });

  it('simulate-paid ກັບ MANUAL_TRANSFER (ບໍ່ມີ webhook) → 400', async () => {
    const pid = await newPayment();
    const { id } = await newIntent(pid, 50000, 'MANUAL_TRANSFER');
    const res = await request(app)
      .post(`/api/v1/payments-treasury/intents/${id}/simulate-paid`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(res.status).toBe(400);
  });

  it('production: simulate-paid ແລະ webhook ຂອງ provider MOCK ຖືກປິດ (403)', async () => {
    const pid = await newPayment();
    const { id, reference } = await newIntent(pid);
    const mutableEnv = env as { isProd: boolean };
    mutableEnv.isProd = true;
    try {
      const sim = await request(app)
        .post(`/api/v1/payments-treasury/intents/${id}/simulate-paid`)
        .set(...bearer(superToken))
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(sim.status).toBe(403);
      const hook = await signedPost({ eventId: `${EVENT_PREFIX}prod`, reference, status: 'SUCCESS', amount: 100000 });
      expect(hook.status).toBe(403);
    } finally {
      mutableEnv.isProd = false;
    }
    expect(await okTxCount(pid)).toBe(0);
  });

  it('replayStaleEvents ຮັບ event ທີ່ຄ້າງ (processedAt=null) ມາຕັດຍອດຊ້ຳໄດ້', async () => {
    const pid = await newPayment();
    const { reference } = await newIntent(pid);
    await prisma.providerEvent.create({
      data: {
        providerCode: 'MOCK_LAO_QR',
        eventId: `${EVENT_PREFIX}stale`,
        payload: { eventId: `${EVENT_PREFIX}stale`, reference, status: 'SUCCESS', amount: 100000 },
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    const out = await replayStaleEvents();
    expect(out.failed).toBe(0);
    expect(await okTxCount(pid)).toBe(1);
    const ev = await prisma.providerEvent.findFirstOrThrow({ where: { eventId: `${EVENT_PREFIX}stale` } });
    expect(ev.result).toBe('SETTLED');
  });
});
