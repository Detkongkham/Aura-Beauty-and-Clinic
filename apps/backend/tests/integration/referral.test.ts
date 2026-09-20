import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 7A Referral & Affiliate (Module 33).
 *   /referral/me ອອກລະຫັດ · ໃຊ້ລະຫັດຄົນອື່ນຕອນຈອງ → ຫັກ 50k, ໃຊ້ຊ້ຳ → 400, ລະຫັດຕົນເອງ → 400 ·
 *   ຄິວ COMPLETED → ຜູ້ແນະນຳໄດ້ຄະແນນ loyalty + (ຖ້າເປັນ affiliate) ຄ່ານາຍໜ້າເຂົ້າ unpaidBalance ·
 *   admin /affiliates CRUD + payout (create ຫັກ balance, PAID ຕັ້ງ paidAt) · /affiliate/me · RBAC 403.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001'; // 120000, 45 ນາທີ
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const REFERRER_PHONE = '02088850001';
const REFEREE_PHONE = '02088850002';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

/** ວັນສຸກ UTC ຂ້າງໜ້າ (dow 5 = ບໍ່ມີ dynamic-pricing rule) — ຫຼີກ Happy Hour / weekend peak. */
function nextFriday(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { in: [REFERRER_PHONE, REFEREE_PHONE] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const appts = await prisma.appointment.findMany({
      where: { customerId: { in: ids } },
      select: { id: true },
    });
    const aids = appts.map((a) => a.id);
    if (aids.length) {
      await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
      await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
      await prisma.stockMovement.deleteMany({
        where: { refId: { in: aids.map((id) => `appt:${id}`) } },
      });
    }
    await prisma.referralUsage.deleteMany({
      where: { OR: [{ referredUserId: { in: ids } }, { referralCode: { userId: { in: ids } } }] },
    });
    await prisma.appointment.deleteMany({ where: { customerId: { in: ids } } });
    const profiles = await prisma.affiliateProfile.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });
    await prisma.affiliatePayout.deleteMany({
      where: { affiliateProfileId: { in: profiles.map((p) => p.id) } },
    });
    await prisma.affiliateProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.referralCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.loyaltyTransaction.deleteMany({
      where: { loyaltyAccount: { userId: { in: ids } } },
    });
    await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

describe('Phase 7A — Referral & Affiliate (Module 33)', () => {
  let app: Express;
  let adminToken: string;
  let referrerToken: string;
  let referrerId: string;
  let refereeToken: string;
  let referralCode: string;
  let affiliateId: string;
  let appointmentId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const r = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Referrer QA', phone: REFERRER_PHONE, password: 'Passw0rd!' });
    referrerToken = r.body.data.tokens.accessToken as string;
    referrerId = r.body.data.user.id as string;

    const e = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Referee QA', phone: REFEREE_PHONE, password: 'Passw0rd!' });
    refereeToken = e.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('GET /referral/me ອອກລະຫັດໃໝ່ + ຄ່າເລີ່ມຕົ້ນ', async () => {
    const res = await request(app).get('/api/v1/referral/me').set(...bearer(referrerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.code).toMatch(/^AURA-[A-Z2-9]{6}$/);
    expect(res.body.data.discountAmount).toBe(50000);
    expect(res.body.data.totalReferred).toBe(0);
    expect(res.body.data.isAffiliate).toBe(false);
    referralCode = res.body.data.code as string;
  });

  it('ໃຊ້ລະຫັດຕົນເອງ → 400', async () => {
    const at = nextFriday(9);
    at.setUTCHours(10 - 7, 0, 0, 0); // 10:00 ວຽງຈັນ
    const own = await request(app).get('/api/v1/referral/me').set(...bearer(referrerToken));
    const date = at.toISOString().slice(0, 10);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${date}`)
      .set(...bearer(referrerToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>).find(
      (s) => new Date(s.startAt).getUTCHours() === 10 - 7,
    );
    const res = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(referrerToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot!.staffProfileId,
        startAt: slot!.startAt,
        referralCode: own.body.data.code,
      });
    expect(res.status).toBe(400);
  });

  it('referee ຈອງດ້วยລະຫັດ referrer → ຫັກ 50,000', async () => {
    // referrer ເປັນ affiliate ກ່ອນ complete → ຈະໄດ້ຄ່ານາຍໜ້າ
    const enroll = await request(app)
      .post('/api/v1/affiliates')
      .set(...bearer(adminToken))
      .send({ userId: referrerId, commissionRate: 0.1 });
    expect(enroll.status).toBe(201);
    affiliateId = enroll.body.data.id as string;

    const at = nextFriday(9);
    at.setUTCHours(11 - 7, 0, 0, 0); // 11:00 ວຽງຈັນ
    const date = at.toISOString().slice(0, 10);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${date}`)
      .set(...bearer(refereeToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>).find(
      (s) => new Date(s.startAt).getUTCHours() === 11 - 7,
    );
    expect(slot).toBeTruthy();

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(refereeToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot!.staffProfileId,
        startAt: slot!.startAt,
        referralCode,
      });
    expect(booked.status).toBe(201);
    appointmentId = booked.body.data.id as string;

    const row = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { totalAmount: true },
    });
    expect(row?.totalAmount.toNumber()).toBe(70000); // 120000 − 50000

    // referrer ເຫັນ totalReferred = 1
    const me = await request(app).get('/api/v1/referral/me').set(...bearer(referrerToken));
    expect(me.body.data.totalReferred).toBe(1);
    expect(me.body.data.isAffiliate).toBe(true);
  });

  it('ໃຊ້ລະຫັດຄັ້ງທີສອງ → 400', async () => {
    const at = nextFriday(16);
    at.setUTCHours(11 - 7, 0, 0, 0); // 11:00 ວຽງຈັນ
    const date = at.toISOString().slice(0, 10);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${date}`)
      .set(...bearer(refereeToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>).find(
      (s) => new Date(s.startAt).getUTCHours() === 11 - 7,
    );
    const res = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(refereeToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot!.staffProfileId,
        startAt: slot!.startAt,
        referralCode,
      });
    expect(res.status).toBe(400);
  });

  it('ຄິວ COMPLETED → loyalty ໃຫ້ referrer + ຄ່ານາຍໜ້າ affiliate', async () => {
    const done = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);

    // loyalty: 50000 / 10000 = 5 ຄະແນນ
    const loyalty = await request(app).get('/api/v1/loyalty/me').set(...bearer(referrerToken));
    expect(loyalty.body.data.points).toBe(5);

    const usage = await prisma.referralUsage.findFirst({ where: { appointmentId } });
    expect(usage?.rewardClaimed).toBe(true);

    // affiliate: 0.1 × 70000 = 7000
    const mine = await request(app).get('/api/v1/affiliate/me').set(...bearer(referrerToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.unpaidBalance).toBe(7000);
    expect(mine.body.data.totalEarnings).toBe(7000);

    // idempotent — complete ຊ້ຳບໍ່ເພີ່ມ
    await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
    const again = await request(app).get('/api/v1/affiliate/me').set(...bearer(referrerToken));
    expect(again.body.data.unpaidBalance).toBe(7000);
  });

  it('admin payout: create ຫັກ balance, PAID ຕັ້ງ paidAt', async () => {
    const created = await request(app)
      .post(`/api/v1/affiliates/${affiliateId}/payouts`)
      .set(...bearer(adminToken))
      .send({ amount: 7000, payoutMethod: 'BCEL', accountDetails: '040-12-00-123' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING');
    const payoutId = created.body.data.id as string;

    const over = await request(app)
      .post(`/api/v1/affiliates/${affiliateId}/payouts`)
      .set(...bearer(adminToken))
      .send({ amount: 1000, payoutMethod: 'BCEL', accountDetails: 'x' });
    expect(over.status).toBe(400); // balance ໝົດແລ້ວ

    const paid = await request(app)
      .patch(`/api/v1/affiliates/payouts/${payoutId}`)
      .set(...bearer(adminToken))
      .send({ status: 'PAID' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paidAt).not.toBeNull();

    const list = await request(app)
      .get(`/api/v1/affiliates?q=${REFERRER_PHONE}`)
      .set(...bearer(adminToken));
    expect(list.body.data.items[0].unpaidBalance).toBe(0);
    expect(list.body.data.items[0].referredCount).toBe(1);
  });

  it('CUSTOMER → /affiliates = 403', async () => {
    const res = await request(app).get('/api/v1/affiliates').set(...bearer(refereeToken));
    expect(res.status).toBe(403);
  });
});
