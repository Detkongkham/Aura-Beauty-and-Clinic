import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reminderQueue, waitlistQueue } from '../../src/jobs/queues.js';

/** Wave 10A (ອຸດ C3) — ທຸກ POST ການເງິນຕ້ອງມີ header ນີ້ (ໜຶ່ງ key ຕໍ່ 1 ການຮ້ອງຂໍ). */
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

/**
 * Integration — Phase 5 (Finance & Marketing):
 *   book → open bill → deposit QR intent → settle-mock → split tender (cash + gift card)
 *   → FULLY_PAID → appointment CONFIRMED → loyalty points earned
 *   + gift card issue/lookup + waitlist join + push device register + QR check-in.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const PHONE = '02088890777';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('phase 5 — finance, loyalty, waitlist', () => {
  let app: Express;
  let token: string;
  let adminToken: string;
  let appointmentId: string;

  const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];
  /** ເງິນສົດ/QR ແບບ tender ບັນທຶກໄດ້ສະເພາະພະນັກງານ (ລູກຄ້າ → 403 TENDER_NOT_ALLOWED). */
  const adminAuth = (): [string, string] => ['Authorization', `Bearer ${adminToken}`];

  async function wipe(): Promise<void> {
    const cards = await prisma.giftCard.findMany({
      where: { buyer: { phone: PHONE } },
      select: { id: true, purchasePaymentId: true },
    });
    if (cards.length) {
      await prisma.giftCardTransaction.deleteMany({
        where: { giftCardId: { in: cards.map((c) => c.id) } },
      });
      await prisma.giftCard.deleteMany({ where: { id: { in: cards.map((c) => c.id) } } });
      // Wave 10A — self-purchase creates a standalone Payment (no appointmentId) per card.
      const purchasePaymentIds = cards.map((c) => c.purchasePaymentId).filter((id): id is string => !!id);
      if (purchasePaymentIds.length) {
        await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: purchasePaymentIds } } });
        await prisma.payment.deleteMany({ where: { id: { in: purchasePaymentIds } } });
      }
    }
    const appts = await prisma.appointment.findMany({
      where: { customer: { phone: PHONE } },
      select: { id: true },
    });
    const ids = appts.map((a) => a.id);
    if (ids.length) {
      await prisma.paymentTransaction.deleteMany({ where: { payment: { appointmentId: { in: ids } } } });
      await prisma.payment.deleteMany({ where: { appointmentId: { in: ids } } });
      await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
      await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: ids } } });
      await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
    }
    const u = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
    if (u) {
      const acc = await prisma.loyaltyAccount.findUnique({ where: { userId: u.id } });
      if (acc) {
        await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccountId: acc.id } });
        await prisma.loyaltyAccount.delete({ where: { id: acc.id } });
      }
      await prisma.pushDevice.deleteMany({ where: { userId: u.id } });
      await prisma.waitlist.deleteMany({ where: { customerId: u.id } });
      await prisma.notificationLog.deleteMany({ where: { userId: u.id } });
    }
    await prisma.user.deleteMany({ where: { phone: PHONE } });
  }

  beforeAll(async () => {
    app = createApp();
    vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'job' } as never);
    vi.spyOn(waitlistQueue, 'add').mockResolvedValue({ id: 'job' } as never);
    await wipe();
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Finance QA', phone: PHONE, password: 'Passw0rd!' });
    token = reg.body.data.tokens.accessToken as string;
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  it('deposit + split tender → FULLY_PAID → loyalty earned', async () => {
    const date = futureWorkingDate(38);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...auth());
    const slot = avail.body.data.slots[0] as { staffProfileId: string; startAt: string };

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: slot.staffProfileId, startAt: slot.startAt });
    expect(booked.status).toBe(201);
    appointmentId = booked.body.data.id as string;

    // open the bill
    const bill = await request(app)
      .post('/api/v1/payments')
      .set(...auth())
      .set(...idem())
      .send({ appointmentId });
    expect(bill.status).toBe(201);
    const paymentId = bill.body.data.id as string;
    const total = bill.body.data.totalAmount as number;
    expect(total).toBeGreaterThan(0);
    expect(bill.body.data.depositAmount).toBeCloseTo(Math.round(total * 0.2 * 100) / 100, 1);

    // idempotent: second create returns same bill
    const bill2 = await request(app)
      .post('/api/v1/payments')
      .set(...auth())
      .set(...idem())
      .send({ appointmentId });
    expect(bill2.body.data.id).toBe(paymentId);

    // deposit QR intent (mock BCEL One)
    const intent = await request(app)
      .post(`/api/v1/payments/${paymentId}/deposit-intent`)
      .set(...auth())
      .set(...idem())
      .send({ method: 'BCEL_ONE_QR' });
    expect(intent.status).toBe(200);
    expect(intent.body.data.qrPayload).toContain('0002');
    const qrRef = intent.body.data.qrReference as string;

    // settle the deposit
    const settled = await request(app)
      .post(`/api/v1/payments/${paymentId}/settle-mock`)
      .set(...auth())
      .set(...idem())
      .send({ qrReference: qrRef });
    expect(settled.status).toBe(200);
    expect(['DEPOSIT_PAID', 'FULLY_PAID']).toContain(settled.body.data.paymentStatus);

    // deposit paid → appointment auto-confirmed
    const apptAfterDeposit = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    });
    expect(apptAfterDeposit?.status).toBe('CONFIRMED');

    // pay the remaining balance with cash — a customer cannot self-record cash
    const balance = settled.body.data.balanceAmount as number;
    const selfCash = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount: balance }] });
    expect(selfCash.status).toBe(403);
    expect(selfCash.body.error.code).toBe('TENDER_NOT_ALLOWED');

    const selfQr = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders: [{ method: 'BCEL_ONE_QR', amount: balance, qrReference: 'FAKE-REF' }] });
    expect(selfQr.status).toBe(403);

    // staff at the counter records the cash
    const paid = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...adminAuth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount: balance }] });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('FULLY_PAID');
    expect(paid.body.data.balanceAmount).toBe(0);

    // overpay is rejected
    const over = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...adminAuth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount: 1000 }] });
    expect(over.status).toBe(400);

    // loyalty points earned (1 pt / 10,000 LAK of total)
    const loyalty = await request(app).get('/api/v1/loyalty/me').set(...auth());
    expect(loyalty.status).toBe(200);
    expect(loyalty.body.data.points).toBe(Math.floor(total / 10_000));
    expect(loyalty.body.data.tierLevel).toBe('SILVER');

    const ledger = await request(app).get('/api/v1/loyalty/me/ledger').set(...auth());
    expect(ledger.body.data.items.some((t: { type: string }) => t.type === 'EARN')).toBe(true);
  });

  /**
   * Wave 10A (ອຸດ C1) — ບໍ່ມີ endpoint ອອກບັດໃຫ້ຟຣີອີກຕໍ່ໄປສຳລັບ customer role: ຕ້ອງຊື້ (purchase)
   * ແລ້ວຈ່າຍຄົບ (FULLY_PAID) ບັດຈຶ່ງ ACTIVE. ຄືນລະຫັດບັດ.
   */
  async function purchaseAndActivateGiftCard(amount: number, recipientEmail: string): Promise<string> {
    const purchased = await request(app)
      .post('/api/v1/gift-cards/purchase')
      .set(...auth())
      .set(...idem())
      .send({ branchId: BRANCH_ID, amount, recipientEmail });
    expect(purchased.status).toBe(201);
    expect(purchased.body.data.status).toBe('PENDING_PAYMENT');
    const code = purchased.body.data.code as string;
    const purchasePaymentId = purchased.body.data.purchasePaymentId as string;

    // a customer cannot activate their own card by claiming cash
    const selfCash = await request(app)
      .post(`/api/v1/payments/${purchasePaymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount }] });
    expect(selfCash.status).toBe(403);

    const paid = await request(app)
      .post(`/api/v1/payments/${purchasePaymentId}/tenders`)
      .set(...adminAuth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount }] });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('FULLY_PAID');
    return code;
  }

  it('gift card self-purchase (PENDING_PAYMENT → pay → ACTIVE) → lookup by code', async () => {
    const code = await purchaseAndActivateGiftCard(200_000, 'friend@example.com');

    const lookup = await request(app)
      .get(`/api/v1/gift-cards/lookup?code=${encodeURIComponent(code)}`)
      .set(...auth());
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.status).toBe('ACTIVE');
    expect(lookup.body.data.currentBalance).toBe(200_000);
    expect(lookup.body.data.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('gift card purchase cannot be redeemed before payment (still PENDING_PAYMENT)', async () => {
    const purchased = await request(app)
      .post('/api/v1/gift-cards/purchase')
      .set(...auth())
      .set(...idem())
      .send({ branchId: BRANCH_ID, amount: 60_000, recipientEmail: 'unpaid@example.com' });
    expect(purchased.status).toBe(201);
    const code = purchased.body.data.code as string;

    const date = futureWorkingDate(46);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...auth());
    const slot = avail.body.data.slots[0] as { staffProfileId: string; startAt: string };
    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: slot.staffProfileId, startAt: slot.startAt });
    const bill = await request(app)
      .post('/api/v1/payments')
      .set(...auth())
      .set(...idem())
      .send({ appointmentId: booked.body.data.id });
    const paymentId = bill.body.data.id as string;

    const attempt = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders: [{ method: 'GIFT_CARD', amount: 1, giftCardCode: code }] });
    expect(attempt.status).toBe(400);
  });

  it('split tender: gift card + loyalty points + cash → FULLY_PAID', async () => {
    // a fresh appointment + bill
    const date = futureWorkingDate(44);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...auth());
    const slot = avail.body.data.slots[0] as { staffProfileId: string; startAt: string };
    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: slot.staffProfileId, startAt: slot.startAt });
    const apptId = booked.body.data.id as string;

    const bill = await request(app)
      .post('/api/v1/payments')
      .set(...auth())
      .set(...idem())
      .send({ appointmentId: apptId });
    const paymentId = bill.body.data.id as string;
    const total = bill.body.data.totalAmount as number;

    // gift card to spend from — must be purchased + paid (ACTIVE) first (Wave 10A ອຸດ C1)
    const gcCode = await purchaseAndActivateGiftCard(100_000, 'split@example.com');

    // loyalty points available (earned by the first test's completed payment)
    const acc = await request(app).get('/api/v1/loyalty/me').set(...auth());
    const availablePoints = acc.body.data.points as number;
    const usePoints = Math.min(availablePoints, 3);
    const loyaltyValue = usePoints * 1_000;
    const giftValue = Math.min(50_000, total - loyaltyValue);
    const cashValue = Math.round((total - loyaltyValue - giftValue) * 100) / 100;

    const tenders: Array<Record<string, unknown>> = [];
    if (loyaltyValue > 0) tenders.push({ method: 'LOYALTY_POINTS', amount: loyaltyValue, loyaltyPoints: usePoints });
    tenders.push({ method: 'GIFT_CARD', amount: giftValue, giftCardCode: gcCode });

    // customer applies their own points + gift card from the app
    const wallet = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders });
    expect(wallet.status).toBe(200);

    // staff collects the remaining cash at the counter
    const paid =
      cashValue > 0
        ? await request(app)
            .post(`/api/v1/payments/${paymentId}/tenders`)
            .set(...adminAuth())
            .set(...idem())
            .send({ tenders: [{ method: 'CASH', amount: cashValue }] })
        : wallet;
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('FULLY_PAID');
    expect(paid.body.data.balanceAmount).toBe(0);

    // gift card balance dropped by giftValue
    const gcAfter = await request(app)
      .get(`/api/v1/gift-cards/lookup?code=${encodeURIComponent(gcCode)}`)
      .set(...auth());
    expect(gcAfter.body.data.currentBalance).toBe(100_000 - giftValue);

    // loyalty points dropped by usePoints (minus any re-earn on this bill's total)
    if (usePoints > 0) {
      const accAfter = await request(app).get('/api/v1/loyalty/me').set(...auth());
      expect(accAfter.body.data.points).toBeLessThanOrEqual(availablePoints - usePoints + Math.floor(total / 10_000));
    }
  });

  it('waitlist join / my / leave', async () => {
    const date = futureWorkingDate(50);
    const joined = await request(app)
      .post('/api/v1/waitlist')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, preferredDate: date });
    expect(joined.status).toBe(201);
    const entryId = joined.body.data.id as string;

    const mine = await request(app).get('/api/v1/waitlist/me').set(...auth());
    expect(mine.body.data.items.some((e: { id: string }) => e.id === entryId)).toBe(true);

    const left = await request(app).delete(`/api/v1/waitlist/${entryId}`).set(...auth());
    expect(left.status).toBe(200);
  });

  it('push device register + unregister', async () => {
    const reg = await request(app)
      .post('/api/v1/notifications/devices')
      .set(...auth())
      .send({ token: 'ExponentPushToken[phase5-test-xyz]', platform: 'ios', deviceName: 'QA iPhone' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.platform).toBe('ios');

    const del = await request(app)
      .delete('/api/v1/notifications/devices')
      .set(...auth())
      .send({ token: 'ExponentPushToken[phase5-test-xyz]' });
    expect(del.status).toBe(200);
  });

  it('QR check-in issues a queue ticket', async () => {
    // move the (already-booked) appointment to now so check-in window passes
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { startAt: new Date(Date.now() + 30 * 60_000), endAt: new Date(Date.now() + 75 * 60_000) },
    });
    const res = await request(app)
      .post('/api/v1/queue/check-in')
      .set(...auth())
      .send({ appointmentId, branchId: BRANCH_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WAITING');
    expect(res.body.data.ticket.number).toMatch(/^A\d{3}$/);

    // ສະແກນຊ້ຳຫຼັງຖືກເອີ້ນ → ຄືນບັດເດີມ, ບໍ່ reset ກັບເປັນ WAITING
    await prisma.queueTicket.update({ where: { id: res.body.data.ticket.id }, data: { status: 'CALLED' } });
    const again = await request(app)
      .post('/api/v1/queue/check-in')
      .set(...auth())
      .send({ appointmentId, branchId: BRANCH_ID });
    expect(again.status).toBe(200);
    expect(again.body.data.ticket.id).toBe(res.body.data.ticket.id);
    expect(again.body.data.status).toBe('CALLED');

    // ລາຍລະອຽດນັດສະແດງບັດຄິວ
    const detail = await request(app).get(`/api/v1/booking/appointments/${appointmentId}`).set(...auth());
    expect(detail.body.data.queueTicket).toMatchObject({ number: res.body.data.ticket.number, status: 'CALLED' });

    // QR ຂອງສາຂາອື່ນ → 400
    const wrongBranch = await request(app)
      .post('/api/v1/queue/check-in')
      .set(...auth())
      .send({ appointmentId, branchId: '99999999-9999-4999-8999-999999999999' });
    expect(wrongBranch.status).toBe(400);
  });

  it('QR check-in ນອກຊ່ວງເວລາ → 400', async () => {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { startAt: new Date(Date.now() - 6 * 3_600_000), endAt: new Date(Date.now() - 5 * 3_600_000) },
    });
    const late = await request(app)
      .post('/api/v1/queue/check-in')
      .set(...auth())
      .send({ appointmentId, branchId: BRANCH_ID });
    expect(late.status).toBe(400);
  });
});
