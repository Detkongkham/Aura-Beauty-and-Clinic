import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { processSlip, runSlipSlaAlerts } from '../../src/modules/payments-treasury/slips/slips.service.js';
import { shutdownOcr } from '../../src/modules/payments-treasury/slips/ocr/tesseractProvider.js';
import {
  SLIP_AUTO_APPROVE_SETTING_KEY,
  SLIP_BRANCH_SLA_SETTING_KEY,
  SLIP_SLA_ALERT_SETTING_KEY,
  SLIP_SLA_SETTING_KEY,
} from '../../src/constants/paymentsTreasury.js';

/**
 * Integration — Module 39 W3: ອັບສະລິບ → OCR (tesseract.js ຈິງ, ບໍ່ mock) → ໃຫ້ຄະແນນ → ກວດ/ອະນຸມັດ → PaymentTransaction.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`. ຮູບສະລິບຖືກສ້າງຈາກ SVG ດ້ວຍ sharp.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HOME_ACCOUNT = '010120001234567';
const CUSTOMER_PHONE = '02077700111';
const OTHER_CUSTOMER_PHONE = '02077700112';
const PASSWORD = 'Slip@12345';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

const pad = (n: number) => String(n).padStart(2, '0');
/** ເວລາວຽງຈັນ (UTC+7) ແບບ dd/mm/yyyy HH:MM ຂອງ "msAgo ມິລິວິນາທີກ່ອນ". */
function vteStamp(msAgo: number): string {
  const d = new Date(Date.now() - msAgo + 7 * 3_600_000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

let refCounter = 0;
const newRef = (): string => `${Date.now()}${String(++refCounter).padStart(3, '0')}`;

async function slipImage(opts: {
  amount?: string;
  account?: string;
  ref?: string;
  minutesAgo?: number;
  qrRef?: string;
  /** ບັນທັດ "From: …" ໃຫ້ parser ອ່ານຊື່ຜູ້ໂອນ (ຈຳເປັນສຳລັບກົດ near-duplicate). */
  sender?: string;
}): Promise<{ png: Buffer; ref: string }> {
  const ref = opts.ref ?? newRef();
  const lines = [
    'BCEL One',
    'Transfer Successful',
    `Amount: ${opts.amount ?? '150,000'} LAK`,
    `To: ${opts.account ?? HOME_ACCOUNT}`,
    `Reference No: ${ref}`,
    `Date: ${vteStamp((opts.minutesAgo ?? 2) * 60_000)}`,
    ...(opts.sender ? [`From: ${opts.sender}`] : []),
  ];
  const text = lines
    .map((l, i) => `<text x="40" y="${90 + i * 80}" font-size="44" font-family="Arial, Helvetica, sans-serif" fill="#000">${l}</text>`)
    .join('');
  const height = 90 + lines.length * 80 + (opts.qrRef ? 360 : 20);
  let img = sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${text}</svg>`,
    ),
  );
  if (opts.qrRef) {
    const qr = await QRCode.toBuffer(`https://verify.example-bank.la/slip?ref=${opts.qrRef}`, { width: 300, margin: 2 });
    img = img.composite([{ input: qr, top: 90 + lines.length * 80, left: 40 }]);
  }
  return { png: await img.png().toBuffer(), ref };
}

describe('payments-treasury: slips + OCR + review', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let staffToken: string;
  let customerToken: string;
  let otherCustomerToken: string;
  let customerId: string;
  const paymentIds: string[] = [];
  const importIds: string[] = [];
  const groupIds: string[] = [];

  const newPayment = async (total = 150000, deposit = 30000): Promise<string> => {
    const group = await prisma.bookingGroup.create({
      data: { branchId: HOME_BRANCH_ID, payerId: customerId, totalAmount: total },
    });
    groupIds.push(group.id);
    const p = await prisma.payment.create({
      data: { branchId: HOME_BRANCH_ID, bookingGroupId: group.id, totalAmount: total, depositAmount: deposit },
    });
    paymentIds.push(p.id);
    return p.id;
  };

  const upload = (token: string, paymentId: string, png: Buffer, extra: object = {}) =>
    request(app)
      .post(`/api/v1/payments-treasury/payments/${paymentId}/slips`)
      .set(...bearer(token))
      .set(...idem())
      .send({ contentType: 'image/png', dataBase64: png.toString('base64'), ...extra });

  /** ອັບ + ແລ່ນ OCR (worker ບໍ່ໄດ້ແລ່ນໃນ test) + ດຶງຜົນ. */
  const uploadAndProcess = async (token: string, paymentId: string, png: Buffer, extra: object = {}) => {
    const up = await upload(token, paymentId, png, extra);
    expect(up.status).toBe(201);
    await processSlip(up.body.data.id);
    const got = await request(app).get(`/api/v1/payments-treasury/slips/${up.body.data.id}`).set(...bearer(token));
    expect(got.status).toBe(200);
    return got.body.data as {
      id: string;
      verdict: string;
      ocrStatus: string;
      amount: number | null;
      txnRef: string | null;
      bankCode: string | null;
      matchScore: number;
      mismatchFields: string[];
      paymentTransactionId: string | null;
    };
  };

  const review = (token: string, slipId: string, body: object) =>
    request(app)
      .post(`/api/v1/payments-treasury/slips/${slipId}/review`)
      .set(...bearer(token))
      .set(...idem())
      .send(body);

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: { in: [CUSTOMER_PHONE, OTHER_CUSTOMER_PHONE] } } });
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const customer = await prisma.user.create({
      data: { name: 'ລູກຄ້າທົດສອບສະລິບ', phone: CUSTOMER_PHONE, password: hash, role: 'CUSTOMER' },
    });
    customerId = customer.id;
    await prisma.user.create({
      data: { name: 'ລູກຄ້າອື່ນ', phone: OTHER_CUSTOMER_PHONE, password: hash, role: 'CUSTOMER' },
    });
    superToken = await login('02000000000', 'Admin@12345');
    branchAdminToken = await login('02000000001', 'Manager@12345');
    staffToken = await login('02055500001', 'Staff@12345');
    customerToken = await login(CUSTOMER_PHONE, PASSWORD);
    otherCustomerToken = await login(OTHER_CUSTOMER_PHONE, PASSWORD);
  });

  afterAll(async () => {
    await prisma.appSetting.deleteMany({
      where: { key: { in: [SLIP_AUTO_APPROVE_SETTING_KEY, SLIP_SLA_SETTING_KEY, SLIP_BRANCH_SLA_SETTING_KEY, SLIP_SLA_ALERT_SETTING_KEY] } },
    });
    await prisma.bankStatementImport.deleteMany({ where: { id: { in: importIds } } });
    await prisma.notificationLog.deleteMany({ where: { type: 'slip_sla_breach' } });
    const slips = await prisma.paymentSlip.findMany({ where: { paymentId: { in: paymentIds } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityName: 'PaymentSlip', entityId: { in: slips.map((s) => s.id) } } });
    await prisma.paymentSlip.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.bookingGroup.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.notificationLog.deleteMany({ where: { userId: customerId } });
    await prisma.user.deleteMany({ where: { phone: { in: [CUSTOMER_PHONE, OTHER_CUSTOMER_PHONE] } } });
    await Promise.all(paymentIds.map((id) => rm(resolve(process.cwd(), 'uploads-test/slips', id), { recursive: true, force: true })));
    await shutdownOcr();
    await prisma.$disconnect();
  });

  it('ສະລິບຖືກຕ້ອງ → OCR ອ່ານໄດ້ → AUTO_MATCHED ແຕ່ຍັງບໍ່ຕັດຍອດຈົນກວ່າພະນັກງານອະນຸມັດ', async () => {
    const pid = await newPayment();
    const { png, ref } = await slipImage({});
    const up = await upload(customerToken, pid, png);
    expect(up.status).toBe(201);
    expect(up.body.data).toMatchObject({ verdict: 'PENDING', ocrStatus: 'PENDING' });

    await processSlip(up.body.data.id);
    const slip = (await request(app).get(`/api/v1/payments-treasury/slips/${up.body.data.id}`).set(...bearer(customerToken))).body.data;
    expect(slip).toMatchObject({
      ocrStatus: 'DONE',
      verdict: 'AUTO_MATCHED',
      matchScore: 100,
      mismatchFields: [],
      amount: 150000,
      currency: 'LAK',
      txnRef: ref,
      bankCode: 'BCEL',
    });
    expect(slip.ocrMs).toBeGreaterThan(0);
    // ລູກຄ້າອັບເອງ ≠ ຕັດຍອດ (ກົດຂໍ້ 1)
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(0);

    const approved = await review(branchAdminToken, slip.id, { action: 'APPROVE' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.verdict).toBe('APPROVED');
    const tx = await prisma.paymentTransaction.findMany({ where: { paymentId: pid } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ method: 'BANK_TRANSFER', status: 'SUCCESS', qrReference: ref });
    expect(Number(tx[0]!.amount)).toBe(150000);
    expect(tx[0]!.bankAccountId).not.toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).toBe('FULLY_PAID');
    expect(await prisma.auditLog.count({ where: { entityName: 'PaymentSlip', entityId: slip.id, action: 'SLIP_APPROVE' } })).toBe(1);
  });

  it('QR ໃນສະລິບ: ໃຊ້ reference ຈາກ QR (ຊັ້ນ 1) ແທນ OCR', async () => {
    const pid = await newPayment();
    // QR ຂອງທະນາຄານແທ້ບັນຈຸເລກອ້າງອີງດຽວກັບທີ່ພິມ (ອາດມີ prefix) — ຕ່າງກັນ = ສັນຍານແກ້ຮູບ (ເບິ່ງ test S3)
    const ref = newRef();
    const qrRef = `QR${ref}`;
    const { png } = await slipImage({ ref, qrRef });
    const slip = await uploadAndProcess(customerToken, pid, png);
    expect(slip.txnRef).toBe(qrRef.toUpperCase());
    expect(slip.verdict).toBe('AUTO_MATCHED');
  });

  it('ຈຳນວນເງິນບໍ່ກົງ → NEEDS_REVIEW ພ້ອມຊີ້ field; ແກ້ຄ່າຕອນອະນຸມັດໄດ້', async () => {
    const pid = await newPayment();
    const { png } = await slipImage({ amount: '140,000' });
    const slip = await uploadAndProcess(customerToken, pid, png);
    expect(slip.verdict).toBe('NEEDS_REVIEW');
    expect(slip.mismatchFields).toEqual(['amount']);
    expect(slip.matchScore).toBe(50);

    // ພະນັກງານເຫັນວ່າຕົວຈິງແມ່ນ 150,000 (OCR ອ່ານຜິດ) → ແກ້ແລ້ວອະນຸມັດ
    const res = await review(superToken, slip.id, { action: 'APPROVE', correctedFields: { amount: 150000 }, note: 'ກວດກັບຮູບແລ້ວ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ verdict: 'APPROVED', amount: 150000, reviewNote: 'ກວດກັບຮູບແລ້ວ' });
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid, status: 'SUCCESS' } })).toBe(1);
  });

  it('ບັນຊີປາຍທາງບໍ່ແມ່ນຂອງສາຂາ → NEEDS_REVIEW (receiverAccount)', async () => {
    const pid = await newPayment();
    const { png } = await slipImage({ account: '999888777666555' });
    const slip = await uploadAndProcess(customerToken, pid, png);
    expect(slip.verdict).toBe('NEEDS_REVIEW');
    expect(slip.mismatchFields).toEqual(['receiverAccount']);
  });

  it('ສະລິບເກົ່າ (ໂອນກ່ອນເປີດບິນຫຼາຍຊົ່ວໂມງ) → NEEDS_REVIEW (transferredAt)', async () => {
    const pid = await newPayment();
    const { png } = await slipImage({ minutesAgo: 60 * 5 });
    const slip = await uploadAndProcess(customerToken, pid, png);
    expect(slip.verdict).toBe('NEEDS_REVIEW');
    expect(slip.mismatchFields).toEqual(['transferredAt']);
  });

  it('ອະນຸມັດ 2 ເທື່ອ → ມີ transaction ດຽວ (ເທື່ອທີ 2 = 409, ເທື່ອຊ້ຳ key ດຽວກັນ = ຜົນເກົ່າ)', async () => {
    const pid = await newPayment();
    const { png } = await slipImage({});
    const slip = await uploadAndProcess(customerToken, pid, png);

    const key = randomUUID();
    const first = await request(app)
      .post(`/api/v1/payments-treasury/slips/${slip.id}/review`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', key)
      .send({ action: 'APPROVE' });
    expect(first.status).toBe(200);
    const replay = await request(app)
      .post(`/api/v1/payments-treasury/slips/${slip.id}/review`)
      .set(...bearer(superToken))
      .set('Idempotency-Key', key)
      .send({ action: 'APPROVE' });
    expect(replay.status).toBe(200);
    expect((await review(superToken, slip.id, { action: 'APPROVE' })).status).toBe(409);
    expect((await review(superToken, slip.id, { action: 'REJECT', note: 'x' })).status).toBe(409);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(1);
  });

  it('ອະນຸມັດພ້ອມກັນ 2 request → tx ດຽວ', async () => {
    const pid = await newPayment();
    const { png } = await slipImage({});
    const slip = await uploadAndProcess(customerToken, pid, png);
    const results = await Promise.all([
      review(superToken, slip.id, { action: 'APPROVE' }),
      review(branchAdminToken, slip.id, { action: 'APPROVE' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(1);
  });

  it('ຮູບດຽວກັນຍື່ນຊ້ຳ: ຄົນເດີມ/ບິນເດີມ → ໄດ້ສະລິບເກົ່າ; ບິນອື່ນ → 409', async () => {
    const pid = await newPayment();
    const other = await newPayment();
    const { png } = await slipImage({});
    const a = await upload(customerToken, pid, png);
    const b = await upload(customerToken, pid, png);
    expect(b.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    const c = await upload(customerToken, other, png);
    expect(c.status).toBe(409);
    expect(await prisma.paymentSlip.count({ where: { paymentId: pid } })).toBe(1);
  });

  it('ເລກອ້າງອີງຊ້ຳ (ຮູບຕ່າງກັນ ແຕ່ txnRef ດຽວກັນ) → DUPLICATE, ອະນຸມັດບໍ່ໄດ້, ປະຕິເສດໄດ້', async () => {
    const ref = newRef();
    const pid1 = await newPayment();
    const pid2 = await newPayment();
    const first = await uploadAndProcess(customerToken, pid1, (await slipImage({ ref })).png);
    expect(first.verdict).toBe('AUTO_MATCHED');
    // ຮູບໃໝ່ (ເວລາຕ່າງ → ໄບຕ໌ຕ່າງ) ແຕ່ເລກອ້າງອີງດຽວກັນ ໃຊ້ກັບບິນອື່ນ
    const second = await uploadAndProcess(customerToken, pid2, (await slipImage({ ref, minutesAgo: 3 })).png);
    expect(second.verdict).toBe('DUPLICATE');
    expect(second.mismatchFields).toContain('txnRef');
    expect((await review(superToken, second.id, { action: 'APPROVE' })).status).toBe(409);
    expect((await review(superToken, second.id, { action: 'REJECT', note: 'ສະລິບຊ້ຳ' })).status).toBe(200);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid2 } })).toBe(0);
  });

  it('ປະຕິເສດ: ຕ້ອງມີເຫດຜົນ; ຫຼັງປະຕິເສດຍື່ນສະລິບຖືກຕ້ອງອັນດຽວກັນໃໝ່ໄດ້', async () => {
    const ref = newRef();
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({ ref, amount: '10,000' })).png);
    expect(slip.verdict).toBe('NEEDS_REVIEW');

    expect((await review(superToken, slip.id, { action: 'REJECT' })).status).toBe(400);
    const rej = await review(superToken, slip.id, { action: 'REJECT', note: 'ຈຳນວນບໍ່ກົງ' });
    expect(rej.status).toBe(200);
    expect(rej.body.data).toMatchObject({ verdict: 'REJECTED', rejectReason: 'ຈຳນວນບໍ່ກົງ' });
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(0);

    const retry = await uploadAndProcess(customerToken, pid, (await slipImage({ ref, minutesAgo: 1 })).png);
    expect(retry.verdict).toBe('AUTO_MATCHED');
    expect(retry.txnRef).toBe(ref);
  });

  it('ອະນຸມັດຈຳນວນເກີນຍອດຄ້າງ → 400 ແລະ ສະລິບຍັງກວດໄດ້', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
    const res = await review(superToken, slip.id, { action: 'APPROVE', correctedFields: { amount: 999000 } });
    expect(res.status).toBe(400);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(0);
    expect((await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).verdict).toBe('AUTO_MATCHED');
  });

  it('ຈ່າຍບາງສ່ວນ: ແຈ້ງຈຳນວນ (declared) ກົງກັບສະລິບ → AUTO_MATCHED; ບິນເປັນ DEPOSIT_PAID', async () => {
    const pid = await newPayment(150000, 30000);
    const { png } = await slipImage({ amount: '30,000' });
    const slip = await uploadAndProcess(customerToken, pid, png, { amount: 30000 });
    expect(slip.verdict).toBe('AUTO_MATCHED');
    expect((await review(superToken, slip.id, { action: 'APPROVE' })).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).toBe('DEPOSIT_PAID');
  });

  it('OCR ອ່ານບໍ່ໄດ້ (ຮູບເປົ່າ) → NEEDS_REVIEW ໃຫ້ພະນັກງານປ້ອນຄ່າເອງ ແລ້ວອະນຸມັດໄດ້', async () => {
    const pid = await newPayment();
    const blank = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const slip = await uploadAndProcess(customerToken, pid, blank);
    expect(slip.verdict).toBe('NEEDS_REVIEW');
    expect(slip.amount).toBeNull();
    expect(slip.mismatchFields).toEqual(expect.arrayContaining(['amount', 'receiverAccount', 'transferredAt', 'txnRef']));

    // ບໍ່ມີເລກອ້າງອີງ → ອະນຸມັດບໍ່ໄດ້ ຈົນກວ່າຈະປ້ອນ
    expect((await review(superToken, slip.id, { action: 'APPROVE', correctedFields: { amount: 150000 } })).status).toBe(400);
    const ref = newRef();
    const ok = await review(superToken, slip.id, { action: 'APPROVE', correctedFields: { amount: 150000, txnRef: ref } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.txnRef).toBe(ref);
  });

  it('processSlip idempotent — ແລ່ນຊ້ຳບໍ່ປ່ຽນຜົນ', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
    const before = await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    await processSlip(slip.id);
    const after = await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('ເປີດ auto-approve ໃນ Settings → ສະລິບ AUTO_MATCHED ຖືກສ້າງ tx ໂດຍລະບົບ (ບໍ່ມີຜູ້ອະນຸມັດ)', async () => {
    await prisma.appSetting.upsert({
      where: { key: SLIP_AUTO_APPROVE_SETTING_KEY },
      update: { value: true },
      create: { key: SLIP_AUTO_APPROVE_SETTING_KEY, value: true },
    });
    try {
      const pid = await newPayment();
      const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
      expect(slip.verdict).toBe('APPROVED');
      expect(slip.paymentTransactionId).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { entityId: slip.id, action: 'SLIP_AUTO_APPROVE' } })).toBe(1);
      // ສະລິບທີ່ບໍ່ຜ່ານເກນ ຍັງຕ້ອງໃຫ້ຄົນກວດ ເຖິງເປີດ auto-approve
      const pid2 = await newPayment();
      const bad = await uploadAndProcess(customerToken, pid2, (await slipImage({ amount: '1,000' })).png);
      expect(bad.verdict).toBe('NEEDS_REVIEW');
    } finally {
      await prisma.appSetting.delete({ where: { key: SLIP_AUTO_APPROVE_SETTING_KEY } });
    }
  });

  it('ສິດ: STAFF ທີ່ບໍ່ມີ payments:review / ລູກຄ້າ → 403 ໃນ inbox + review; ລູກຄ້າອື່ນເຫັນສະລິບບໍ່ໄດ້', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);

    for (const tk of [staffToken, customerToken]) {
      expect((await request(app).get('/api/v1/payments-treasury/slips').set(...bearer(tk))).status).toBe(403);
      expect((await review(tk, slip.id, { action: 'APPROVE' })).status).toBe(403);
    }
    expect((await request(app).get(`/api/v1/payments-treasury/slips/${slip.id}`).set(...bearer(otherCustomerToken))).status).toBe(403);
    expect((await request(app).get(`/api/v1/payments-treasury/payments/${pid}/slips`).set(...bearer(otherCustomerToken))).status).toBe(403);
    expect((await upload(otherCustomerToken, pid, (await slipImage({})).png)).status).toBe(403);
    expect((await request(app).get('/api/v1/payments-treasury/slips')).status).toBe(401);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: pid } })).toBe(0);
  });

  it('inbox: ກັ່ນຕອງ verdict/paymentId ແລະ ລູກຄ້າເຫັນສະລິບຂອງບິນຕົນ', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({ amount: '5,000' })).png);
    const inbox = await request(app)
      .get('/api/v1/payments-treasury/slips')
      .query({ verdict: 'NEEDS_REVIEW', paymentId: pid })
      .set(...bearer(branchAdminToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.items.map((s: { id: string }) => s.id)).toEqual([slip.id]);
    expect(inbox.body.data.items[0]).toMatchObject({ customerName: 'ລູກຄ້າທົດສອບສະລິບ', branchName: expect.any(String) });

    const mine = await request(app).get(`/api/v1/payments-treasury/payments/${pid}/slips`).set(...bearer(customerToken));
    expect(mine.body.data).toHaveLength(1);
  });

  it('ຮູບຈາກກ້ອງມືຖືທີ່ໃຫຍ່ກວ່າ 2MB (base64) ອັບໄດ້ — body limit ສະເພາະ route ສະລິບ', async () => {
    const pid = await newPayment();
    // ຮູບ noise ຂະໜາດໃຫຍ່ → JPEG ~3MB (ບໍ່ຫຍໍ້ໄດ້ຫຼາຍ) — ຈຳລອງຮູບຖ່າຍຈາກກ້ອງ
    const noise = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect(noise.byteLength).toBeGreaterThan(1_600_000);
    const res = await request(app)
      .post(`/api/v1/payments-treasury/payments/${pid}/slips`)
      .set(...bearer(customerToken))
      .set(...idem())
      .send({ contentType: 'image/jpeg', dataBase64: noise.toString('base64') });
    expect(res.status).toBe(201);
  });

  it('ກວດ input: ບໍ່ແມ່ນຮູບ / ເກີນຍອດຄ້າງ / ບິນຈ່າຍຄົບແລ້ວ / ບໍ່ມີ Idempotency-Key', async () => {
    const pid = await newPayment();
    const notImage = Buffer.from('this is not an image');
    expect((await upload(customerToken, pid, notImage)).status).toBe(400);
    const { png } = await slipImage({});
    expect((await upload(customerToken, pid, png, { amount: 999999 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/payments-treasury/payments/${pid}/slips`)
          .set(...bearer(customerToken))
          .send({ contentType: 'image/png', dataBase64: png.toString('base64') })
      ).status,
    ).toBe(400);

    await prisma.paymentTransaction.create({
      data: { paymentId: pid, method: 'CASH', amount: 150000, status: 'SUCCESS' },
    });
    expect((await upload(customerToken, pid, (await slipImage({})).png)).status).toBe(400);
  });
  it('GET /payments/:id/bank-accounts: ລູກຄ້າເຈົ້າຂອງບິນເຫັນສະເພາະບັນຊີ ACTIVE ຂອງສາຂາ (default ກ່ອນ); ລູກຄ້າອື່ນ → 403', async () => {
    const pid = await newPayment();
    const bank = await prisma.bank.findFirstOrThrow({ where: { code: 'LDB' } });
    const inactive = await prisma.bankAccount.create({
      data: { bankId: bank.id, branchId: HOME_BRANCH_ID, accountName: 'ປິດແລ້ວ', accountNumber: '9990000111', isActive: false },
    });
    const withQr = await prisma.bankAccount.create({
      data: { bankId: bank.id, branchId: HOME_BRANCH_ID, accountName: 'ມີ QR', accountNumber: '9990000222', qrImageKey: 'bank-qr/test.png' },
    });
    try {
      const res = await request(app)
        .get(`/api/v1/payments-treasury/payments/${pid}/bank-accounts`)
        .set(...bearer(customerToken));
      expect(res.status).toBe(200);
      const list = res.body.data as Array<{ id: string; accountNumber: string; isDefault: boolean; qrImageUrl: string | null; bank: { code: string } }>;
      expect(list.some((a) => a.id === inactive.id)).toBe(false);
      expect(list[0]!.isDefault).toBe(true);
      expect(list[0]!.accountNumber).toBe(HOME_ACCOUNT);
      const q = list.find((a) => a.id === withQr.id)!;
      expect(q.bank.code).toBe('LDB');
      expect(q.qrImageUrl).toMatch(/bank-qr\/test\.png\?exp=\d+&sig=[\w-]{32}$/);
      expect(list[0]).not.toHaveProperty('branchId');

      const other = await request(app)
        .get(`/api/v1/payments-treasury/payments/${pid}/bank-accounts`)
        .set(...bearer(otherCustomerToken));
      expect(other.status).toBe(403);
    } finally {
      await prisma.bankAccount.deleteMany({ where: { id: { in: [inactive.id, withQr.id] } } });
    }
  });
  it('inbox view/flag/q: ແຖບ + ທຸງ + ຄົ້ນຫາ ກັ່ນຕອງຢູ່ server; detail ມີ bill context + ສະລິບຊ້ຳ + siblings', async () => {
    const pid = await newPayment(150000, 30000);
    const mis = await uploadAndProcess(customerToken, pid, (await slipImage({ amount: '120,000' })).png);
    expect(mis.verdict).toBe('NEEDS_REVIEW');

    const get = (query: object) =>
      request(app).get('/api/v1/payments-treasury/slips').query({ paymentId: pid, ...query }).set(...bearer(branchAdminToken));
    expect((await get({ view: 'action', flag: 'amount' })).body.data.items.map((s: { id: string }) => s.id)).toEqual([mis.id]);
    expect((await get({ view: 'approved' })).body.data.items).toHaveLength(0);
    expect((await get({ flag: 'receiverAccount' })).body.data.items).toHaveLength(0);
    expect((await get({ q: 'ທົດສອບສະລິບ' })).body.data.items).toHaveLength(1);
    expect((await get({ q: 'zzz-no-match' })).body.data.items).toHaveLength(0);
    expect((await get({ q: mis.txnRef })).body.data.items).toHaveLength(1);

    const detail = (await request(app).get(`/api/v1/payments-treasury/slips/${mis.id}`).set(...bearer(branchAdminToken))).body.data;
    expect(detail.payment).toMatchObject({ totalAmount: 150000, paidAmount: 0, depositAmount: 30000, depositRemaining: 30000, status: 'PENDING' });
    expect(detail).toMatchObject({ uploadedByRole: 'CUSTOMER', dateOnly: false, duplicateOf: null, siblings: [] });
    expect(typeof detail.ocrText).toBe('string');
    expect(detail.ocrConfidence).toEqual(expect.any(Number));

    // ສະລິບທີ 2 ຂອງບິນດຽວກັນ ທີ່ໃຊ້ເລກອ້າງອີງຊ້ຳ → ເຫັນວ່າຊ້ຳກັບໃບໃດ ແລະ ເຫັນ sibling
    const dup = await uploadAndProcess(customerToken, pid, (await slipImage({ ref: mis.txnRef!, minutesAgo: 4 })).png);
    expect(dup.verdict).toBe('DUPLICATE');
    const dupDetail = (await request(app).get(`/api/v1/payments-treasury/slips/${dup.id}`).set(...bearer(branchAdminToken))).body.data;
    expect(dupDetail.duplicateOf).toMatchObject({ id: mis.id, txnRef: mis.txnRef });
    expect(dupDetail.siblings.map((s: { id: string }) => s.id)).toEqual([mis.id]);
    expect((await get({ flag: 'duplicate' })).body.data.items.map((s: { id: string }) => s.id)).toEqual([dup.id]);

    // ລູກຄ້າເຈົ້າຂອງບໍ່ເຫັນ OCR ດິບ / ສະລິບອື່ນ
    const own = (await request(app).get(`/api/v1/payments-treasury/slips/${dup.id}`).set(...bearer(customerToken))).body.data;
    expect(own).toMatchObject({ ocrText: null, duplicateOf: null, siblings: [] });
  });

  it('summary: ນັບຄິວ/ມື້ນີ້/7 ມື້ ຢູ່ server; ລູກຄ້າ → 403', async () => {
    const before = (await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(superToken))).body.data;
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
    expect(slip.verdict).toBe('AUTO_MATCHED');

    const mid = await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(branchAdminToken));
    expect(mid.status).toBe(200);
    expect(mid.body.data.slaMinutes).toBe(30);
    expect(mid.body.data.week.daily).toHaveLength(7);
    const midSuper = (await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(superToken))).body.data;
    expect(midSuper.open.autoMatched).toBe(before.open.autoMatched + 1);
    expect(midSuper.today.uploaded).toBe(before.today.uploaded + 1);
    expect(midSuper.open.oldestAt).not.toBeNull();

    expect((await review(superToken, slip.id, { action: 'APPROVE' })).status).toBe(200);
    const after = (await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(superToken))).body.data;
    expect(after.open.autoMatched).toBe(before.open.autoMatched);
    expect(after.today.approved).toBe(before.today.approved + 1);
    expect(after.today.approvedAmount).toBe(before.today.approvedAmount + 150000);
    expect(after.week.medianReviewMinutes).toEqual(expect.any(Number));

    expect((await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(customerToken))).status).toBe(403);
  });

  it('bulk-approve: ຢືນຢັນສະເພາະ AUTO_MATCHED; ໃບທີ່ຕ້ອງກວດເອງຖືກລາຍງານວ່າລົ້ມ ບໍ່ລົ້ມທັງຊຸດ', async () => {
    const good = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({})).png);
    const bad = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ amount: '99,000' })).png);
    expect([good.verdict, bad.verdict]).toEqual(['AUTO_MATCHED', 'NEEDS_REVIEW']);

    const noKey = await request(app).post('/api/v1/payments-treasury/slips/bulk-approve').set(...bearer(superToken)).send({ ids: [good.id] });
    expect(noKey.status).toBe(400);
    const res = await request(app)
      .post('/api/v1/payments-treasury/slips/bulk-approve')
      .set(...bearer(branchAdminToken))
      .set(...idem())
      .send({ ids: [good.id, bad.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.approved).toEqual([good.id]);
    expect(res.body.data.failed).toEqual([{ id: bad.id, message: expect.any(String) }]);
    expect((await prisma.paymentSlip.findUniqueOrThrow({ where: { id: bad.id } })).verdict).toBe('NEEDS_REVIEW');
    const g = await prisma.paymentSlip.findUniqueOrThrow({ where: { id: good.id } });
    expect(g.verdict).toBe('APPROVED');
    expect(g.paymentTransactionId).not.toBeNull();
  });

  it('reprocess: ອ່ານໃໝ່ລ້າງຜົນເກົ່າ → PENDING → ຜົນໃໝ່; ສະລິບທີ່ອະນຸມັດແລ້ວ → 409', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({ account: '999888777666555' })).png);
    expect(slip.verdict).toBe('NEEDS_REVIEW');

    const res = await request(app).post(`/api/v1/payments-treasury/slips/${slip.id}/reprocess`).set(...bearer(branchAdminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ verdict: 'PENDING', ocrStatus: 'PENDING', mismatchFields: [], matchScore: 0 });
    // ກຳລັງອ່ານຢູ່ → ກົດຊ້ຳບໍ່ໄດ້
    expect((await request(app).post(`/api/v1/payments-treasury/slips/${slip.id}/reprocess`).set(...bearer(superToken))).status).toBe(409);
    await processSlip(slip.id);
    const again = await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(again).toMatchObject({ verdict: 'NEEDS_REVIEW', ocrStatus: 'DONE', mismatchFields: ['receiverAccount'] });
    expect(await prisma.auditLog.count({ where: { entityId: slip.id, action: 'SLIP_REPROCESS' } })).toBe(1);

    const ok = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({})).png);
    expect((await review(superToken, ok.id, { action: 'APPROVE' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/payments-treasury/slips/${ok.id}/reprocess`).set(...bearer(superToken))).status).toBe(409);
    expect((await request(app).post(`/api/v1/payments-treasury/slips/${ok.id}/reprocess`).set(...bearer(customerToken))).status).toBe(403);
  });
  // ── S1–S10 (slip review gaps, 2026-09-23) ──────────────────────────────

  it('S3: ເລກອ້າງອີງໃນ QR ≠ ທີ່ພິມ → QR_TEXT_MISMATCH, ບໍ່ຜ່ານອັດຕະໂນມັດ; EXIF ແອັບແກ້ຮູບ → EDITOR_SOFTWARE', async () => {
    const mismatch = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ qrRef: `QR${newRef()}` })).png);
    const d1 = (await request(app).get(`/api/v1/payments-treasury/slips/${mismatch.id}`).set(...bearer(superToken))).body.data;
    expect(d1.riskSignals).toContain('QR_TEXT_MISMATCH');
    expect(d1.verdict).toBe('NEEDS_REVIEW');
    expect(d1.mismatchFields).toEqual([]); // ທຸກເກນຜ່ານ — ຖືກກັກໄວ້ຍ້ອນສັນຍານສ່ຽງເທົ່ານັ້ນ

    const edited = await sharp((await slipImage({})).png).jpeg().withExif({ IFD0: { Software: 'Adobe Photoshop 25.0' } }).toBuffer();
    const up = await request(app)
      .post(`/api/v1/payments-treasury/payments/${await newPayment()}/slips`)
      .set(...bearer(customerToken))
      .set(...idem())
      .send({ contentType: 'image/jpeg', dataBase64: edited.toString('base64') });
    expect(up.status).toBe(201);
    expect(up.body.data.riskSignals).toEqual(['EDITOR_SOFTWARE']);
    await processSlip(up.body.data.id);
    const d2 = (await request(app).get(`/api/v1/payments-treasury/slips/${up.body.data.id}`).set(...bearer(superToken))).body.data;
    expect(d2.riskSignals).toContain('EDITOR_SOFTWARE');
    expect(d2.verdict).toBe('NEEDS_REVIEW');

    const risky = await request(app).get('/api/v1/payments-treasury/slips').query({ flag: 'risk', view: 'action' }).set(...bearer(superToken));
    expect(risky.body.data.items.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([mismatch.id, up.body.data.id]));
  });

  it('S2: ຈຳນວນ + ຜູ້ໂອນ + ນາທີດຽວກັນ ແຕ່ເລກອ້າງອີງຕ່າງ (ບິນອື່ນ) → NEAR_DUPLICATE; ບໍ່ມີຜູ້ໂອນ → ບໍ່ຈັບ', async () => {
    const sender = `NEAR TEST ${newRef().slice(-6)}`;
    const first = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ sender })).png);
    expect(first.verdict).toBe('AUTO_MATCHED');
    const second = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ sender })).png);
    const d = (await request(app).get(`/api/v1/payments-treasury/slips/${second.id}`).set(...bearer(superToken))).body.data;
    expect(d.verdict).toBe('NEEDS_REVIEW');
    expect(d.riskSignals).toContain('NEAR_DUPLICATE');
    expect(d.nearDuplicateOf).toMatchObject({ id: first.id });

    // ສະລິບທົດສອບທີ່ບໍ່ມີຊື່ຜູ້ໂອນ (ຄືທຸກ test ອື່ນ) ຕ້ອງບໍ່ຖືກຈັບ — ຮູບຢ່າງດຽວບໍ່ພໍ
    const plain = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({})).png);
    expect(plain.verdict).toBe('AUTO_MATCHED');
  });

  it('S1: ແຖວເງິນເຂົ້າໃນ statement ທີ່ນຳເຂົ້າ → bankProof FOUND (ພ້ອມເລກອ້າງອີງ) → MATCHED ຫຼັງຈັບຄູ່; ບໍ່ມີ → NOT_FOUND/NO_STATEMENT', async () => {
    const pid = await newPayment();
    const { png, ref } = await slipImage({});
    const slip = await uploadAndProcess(customerToken, pid, png);
    const get = async () => (await request(app).get(`/api/v1/payments-treasury/slips/${slip.id}`).set(...bearer(superToken))).body.data;
    const before = await get();
    const account = await prisma.bankAccount.findFirstOrThrow({ where: { accountNumber: HOME_ACCOUNT } });
    const day = new Date(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`);
    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: account.id,
        fileName: 'test.csv',
        mapping: {},
        rowCount: 1,
        creditTotal: 150000,
        debitTotal: 0,
        fromDate: day,
        toDate: day,
        importedById: customerId,
        lines: {
          create: {
            bankAccountId: account.id,
            statementDate: day,
            direction: 'CREDIT',
            amount: 150000,
            reference: `TRF ${ref}`,
            seq: 1,
            dedupeHash: `test-${ref}`,
          },
        },
      },
      include: { lines: true },
    });
    importIds.push(imp.id);
    expect(['NO_STATEMENT', 'NOT_FOUND', 'FOUND']).toContain(before.bankProof.status);
    const found = await get();
    expect(found.bankProof).toMatchObject({ status: 'FOUND', refMatched: true, line: { id: imp.lines[0]!.id, amount: 150000 } });

    expect((await review(superToken, slip.id, { action: 'APPROVE' })).status).toBe(200);
    const approved = await get();
    await prisma.bankStatementLine.update({
      where: { id: imp.lines[0]!.id },
      data: { matchStatus: 'MATCHED', matchedTxId: approved.paymentTransactionId },
    });
    const matched = await get();
    expect(matched.bankProof.status).toBe('MATCHED');
    expect(matched.reversal).toEqual({ allowed: false, blockedReason: 'BILL_SETTLED' });

    // ສະລິບອື່ນຂອງບັນຊີ/ມື້ດຽວກັນ ທີ່ຈຳນວນບໍ່ມີໃນ statement → NOT_FOUND
    const other = await uploadAndProcess(customerToken, await newPayment(99000), (await slipImage({ amount: '99,000' })).png);
    const o = (await request(app).get(`/api/v1/payments-treasury/slips/${other.id}`).set(...bearer(superToken))).body.data;
    expect(o.bankProof.status).toBe('NOT_FOUND');
  });

  it('S5: ຈອງການກວດ — ຄົນອື່ນ review ບໍ່ໄດ້ (409) ຈົນກວ່າຮັບຊ່ວງ; ປ່ອຍແລ້ວວ່າງ', async () => {
    const slip = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({})).png);
    const claim = (tk: string, body: object = {}) =>
      request(app).post(`/api/v1/payments-treasury/slips/${slip.id}/claim`).set(...bearer(tk)).send(body);
    const mine = await claim(branchAdminToken);
    expect(mine.status).toBe(200);
    expect(mine.body.data.claimedBy).toMatchObject({ name: expect.any(String) });
    const adminName = mine.body.data.claimedBy.name;

    // ຄົນອື່ນເປີດ → ເຫັນວ່າໃຜກວດຢູ່, ບໍ່ໄດ້ lock
    expect((await claim(superToken)).body.data.claimedBy.name).toBe(adminName);
    const blocked = await review(superToken, slip.id, { action: 'APPROVE' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain(adminName);
    const bulk = await request(app).post('/api/v1/payments-treasury/slips/bulk-approve').set(...bearer(superToken)).set(...idem()).send({ ids: [slip.id] });
    expect(bulk.body.data.failed).toHaveLength(1);

    const take = await claim(superToken, { force: true });
    expect(take.body.data.claimedBy.name).not.toBe(adminName);
    expect(await prisma.auditLog.count({ where: { entityId: slip.id, action: 'SLIP_CLAIM_TAKEOVER' } })).toBe(1);
    // ດຽວນີ້ branch admin ຖືກກັກແທນ
    expect((await review(branchAdminToken, slip.id, { action: 'APPROVE' })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/payments-treasury/slips/${slip.id}/claim`).set(...bearer(superToken))).status).toBe(204);
    expect((await review(branchAdminToken, slip.id, { action: 'APPROVE' })).status).toBe(200);
    expect((await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).claimedById).toBeNull();
  });

  it('S6: ຂໍຂໍ້ມູນຈາກລູກຄ້າ → ທຸງ infoRequested + ແຈ້ງລູກຄ້າ; ສະລິບໃໝ່ຂອງບິນດຽວກັນລ້າງທຸງ', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({ amount: '120,000' })).png);
    const res = await request(app)
      .post(`/api/v1/payments-treasury/slips/${slip.id}/request-info`)
      .set(...bearer(branchAdminToken))
      .send({ message: 'ກະລຸນາສົ່ງຮູບທີ່ເຫັນຈຳນວນເງິນຊັດ' });
    expect(res.status).toBe(200);
    expect(res.body.data.slip).toMatchObject({ verdict: 'NEEDS_REVIEW', infoRequestNote: 'ກະລຸນາສົ່ງຮູບທີ່ເຫັນຈຳນວນເງິນຊັດ' });
    expect(res.body.data.viaChat).toBe(false); // ບິນກຸ່ມ — ບໍ່ມີແຊັດຂອງນັດ
    expect(await prisma.notificationLog.count({ where: { userId: customerId, type: 'SLIP_INFO_REQUESTED' } })).toBeGreaterThan(0);
    const flagged = await request(app).get('/api/v1/payments-treasury/slips').query({ flag: 'infoRequested', paymentId: pid }).set(...bearer(superToken));
    expect(flagged.body.data.items.map((x: { id: string }) => x.id)).toEqual([slip.id]);
    expect(
      (await request(app).post(`/api/v1/payments-treasury/slips/${slip.id}/request-info`).set(...bearer(customerToken)).send({ message: 'hey there' })).status,
    ).toBe(403);

    await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
    const after = await request(app).get('/api/v1/payments-treasury/slips').query({ flag: 'infoRequested', paymentId: pid }).set(...bearer(superToken));
    expect(after.body.data.items).toHaveLength(0);
    expect((await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).infoRequestNote).not.toBeNull();
  });

  it('S7: ຍົກເລີກການອະນຸມັດ (ບິນຍັງບໍ່ຄົບ) → tx REVERSED, ບິນຄິດຍອດຄືນ; ບິນຈ່າຍຄົບ → 409; STAFF → 403', async () => {
    const pid = await newPayment(150000, 30000);
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({ amount: '30,000' })).png, { amount: 30000 });
    expect((await review(superToken, slip.id, { action: 'APPROVE' })).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).toBe('DEPOSIT_PAID');
    const view = (await request(app).get(`/api/v1/payments-treasury/slips/${slip.id}`).set(...bearer(superToken))).body.data;
    expect(view.reversal).toEqual({ allowed: true, blockedReason: null });

    const reverse = (tk: string, id: string, reason = 'ເງິນບໍ່ເຂົ້າບັນຊີຕາມ statement') =>
      request(app).post(`/api/v1/payments-treasury/slips/${id}/reverse`).set(...bearer(tk)).set(...idem()).send({ reason });
    expect((await reverse(staffToken, slip.id)).status).toBe(403);
    const res = await reverse(branchAdminToken, slip.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ verdict: 'REVERSED', reverseReason: 'ເງິນບໍ່ເຂົ້າບັນຊີຕາມ statement', reversedByName: expect.any(String) });
    const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: view.paymentTransactionId } });
    expect(tx.status).toBe('REVERSED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).paymentStatus).toBe('PENDING');
    expect(await prisma.auditLog.count({ where: { entityId: slip.id, action: 'SLIP_REVERSE' } })).toBe(1);
    expect((await reverse(branchAdminToken, slip.id)).status).toBe(409);
    const rejectedTab = await request(app).get('/api/v1/payments-treasury/slips').query({ view: 'rejected', paymentId: pid }).set(...bearer(superToken));
    expect(rejectedTab.body.data.items.map((x: { id: string }) => x.id)).toEqual([slip.id]);

    const full = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({})).png);
    expect((await review(superToken, full.id, { action: 'APPROVE' })).status).toBe(200);
    const blocked = await reverse(superToken, full.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain('void');
  });

  it('S8/S9: ລະຫັດເຫດຜົນປະຕິເສດຖືກເກັບ ແລະ ນັບໃນ summary; summary ມີຄວາມແມ່ນຍຳຕໍ່ທະນາຄານ', async () => {
    const before = (await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(superToken))).body.data;
    const slip = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ amount: '10,000' })).png);
    const res = await review(superToken, slip.id, { action: 'REJECT', note: 'ຈຳນວນບໍ່ພໍ', reasonCode: 'AMOUNT_SHORT' });
    expect(res.status).toBe(200);
    expect(res.body.data.rejectCode).toBe('AMOUNT_SHORT');
    const bad = await review(superToken, slip.id, { action: 'REJECT', note: 'x', reasonCode: 'NOPE' });
    expect(bad.status).toBe(400);
    const after = (await request(app).get('/api/v1/payments-treasury/slips/summary').set(...bearer(superToken))).body.data;
    expect(after.week.rejectCodes.AMOUNT_SHORT).toBe((before.week.rejectCodes.AMOUNT_SHORT ?? 0) + 1);
    const bcel = after.week.byBank.find((b: { bankCode: string }) => b.bankCode === 'BCEL');
    expect(bcel).toMatchObject({ processed: expect.any(Number), clean: expect.any(Number), rate: expect.any(Number) });
    expect(bcel.processed).toBeGreaterThan(0);
  });

  it('S10: export CSV — BOM, ຫົວຖັນ, ແຖວຕາມຕົວກັ່ນຕອງ, ກັນ formula injection; ລູກຄ້າ → 403', async () => {
    const pid = await newPayment();
    const slip = await uploadAndProcess(customerToken, pid, (await slipImage({})).png);
    await prisma.paymentSlip.update({ where: { id: slip.id }, data: { senderName: '=HYPERLINK("x")' } });
    const res = await request(app).get('/api/v1/payments-treasury/slips/export').query({ paymentId: pid }).set(...bearer(branchAdminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="slips-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, ...rows] = text.slice(1).split('\n');
    expect(header!.split(',')).toEqual(expect.arrayContaining(['txn_ref', 'verdict', 'bank_proof', 'reject_code', 'wait_minutes']));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(slip.txnRef);
    expect(rows[0]).toContain(`"'=HYPERLINK(""x"")"`);
    expect((await request(app).get('/api/v1/payments-treasury/slips/export').set(...bearer(customerToken))).status).toBe(403);
  });

  it('S4: SLA ຕໍ່ສາຂາ — ສະລິບລໍເກີນ → ແຈ້ງຜູ້ຈັດການຄັ້ງດຽວ; ປິດການແຈ້ງ → ບໍ່ແຈ້ງ', async () => {
    const put = (body: object) => request(app).put('/api/v1/payments-treasury/settings').set(...bearer(superToken)).send(body);
    const bad = await put({ branchSlaMinutes: { [randomUUID()]: 10 } });
    expect(bad.status).toBe(400);
    const saved = await put({ reviewSlaMinutes: 45, branchSlaMinutes: { [HOME_BRANCH_ID]: 5 }, slaAlertEnabled: true });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ reviewSlaMinutes: 45, branchSlaMinutes: { [HOME_BRANCH_ID]: 5 }, slaAlertEnabled: true });

    const slip = await uploadAndProcess(customerToken, await newPayment(), (await slipImage({ amount: '1,000' })).png);
    await prisma.paymentSlip.update({ where: { id: slip.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    const summary = (await request(app).get('/api/v1/payments-treasury/slips/summary').query({ branchId: HOME_BRANCH_ID }).set(...bearer(superToken))).body.data;
    expect(summary.slaMinutes).toBe(5);
    expect(summary.open.overSla).toBeGreaterThan(0);

    const first = await runSlipSlaAlerts();
    expect(first.notified).toBeGreaterThan(0);
    const managerId = (await prisma.user.findFirstOrThrow({ where: { phone: '02000000001' } })).id;
    expect(await prisma.notificationLog.count({ where: { userId: managerId, type: 'slip_sla_breach' } })).toBeGreaterThan(0);
    expect((await runSlipSlaAlerts()).notified).toBe(0); // dedupe

    await put({ slaAlertEnabled: false });
    await prisma.notificationLog.deleteMany({ where: { type: 'slip_sla_breach' } });
    expect(await runSlipSlaAlerts()).toEqual({ branches: 0, notified: 0 });
    await put({ reviewSlaMinutes: 30, branchSlaMinutes: {}, slaAlertEnabled: true });
  });
});
