import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { listPromotions } from '../../src/modules/pricing/pricing.service.js';

/**
 * Integration — Phase 7A Dynamic Pricing (Module 28).
 *   /pricing-rules admin CRUD + RBAC (CUSTOMER → 403) ·
 *   /pricing/quote: Happy-Hour window ຫຼຸດ 20% · ນອກຊ່ວງ = ລາຄາເຕັມ · weekend peak ×1.1 (ຕັດຜົມ) ·
 *   ຈອງໃນຊ່ວງ Happy Hour → appointment.totalAmount = ລາຄາຫຼັງຫຼຸດ.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001'; // ລາຄາ 120000, 45 ນາທີ
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const CUST_PHONE = '02088830042';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

/** ວັນທີ UTC N ມື້ຂ້າງໜ້າ ບັງຄັບໃຫ້ເປັນ ຈັນ–ພະຫັດ (Happy-Hour = dow 1–4). */
function futureWeekday(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() < 1 || d.getUTCDay() > 4) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** ວັນເສົາ UTC ຖັດໄປ (weekend peak = dow 6). */
function nextSaturday(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

describe('Phase 7A — Dynamic Pricing (rules + quote + booking hook)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;
  let createdRuleId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUST_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
    await prisma.dynamicPricingRule.deleteMany({ where: { ruleName: 'QA temp rule' } });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Pricing QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUST_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
    await prisma.dynamicPricingRule.deleteMany({ where: { ruleName: 'QA temp rule' } });
    await prisma.$disconnect();
  });

  it('CUSTOMER ບໍ່ມີສິດ /pricing-rules → 403', async () => {
    const res = await request(app).get('/api/v1/pricing-rules').set(...bearer(custToken));
    expect(res.status).toBe(403);
  });

  it('admin CRUD ຮອບເຕັມເທິງ /pricing-rules', async () => {
    const create = await request(app)
      .post('/api/v1/pricing-rules')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        ruleName: 'QA temp rule',
        dayOfWeek: 5,
        startTime: '08:00',
        endTime: '10:00',
        discountPercent: 15,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.priceMultiplier).toBe(1);
    expect(create.body.data.serviceName).toBeNull();
    createdRuleId = create.body.data.id as string;

    const bad = await request(app)
      .post('/api/v1/pricing-rules')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, ruleName: 'QA temp rule', dayOfWeek: 5, startTime: '10:00', endTime: '08:00' });
    expect(bad.status).toBe(400);

    const list = await request(app)
      .get(`/api/v1/pricing-rules?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((r: { id: string }) => r.id === createdRuleId)).toBe(true);

    const patch = await request(app)
      .patch(`/api/v1/pricing-rules/${createdRuleId}`)
      .set(...bearer(adminToken))
      .send({ isActive: false, discountPercent: 25 });
    expect(patch.status).toBe(200);
    expect(patch.body.data.isActive).toBe(false);
    expect(patch.body.data.discountPercent).toBe(25);

    const del = await request(app)
      .delete(`/api/v1/pricing-rules/${createdRuleId}`)
      .set(...bearer(adminToken));
    expect(del.status).toBe(200);
  });

  it('quote: ໃນຊ່ວງ Happy Hour ຫຼຸດ 20%', async () => {
    const at = futureWeekday(10);
    at.setUTCHours(14 - 7, 0, 0, 0); // 14:00 ວຽງຈັນ ໃນຊ່ວງ 13:00–16:00
    const res = await request(app)
      .get(`/api/v1/pricing/quote?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&at=${at.toISOString()}`)
      .set(...bearer(custToken));
    expect(res.status).toBe(200);
    expect(res.body.data.basePrice).toBe(120000);
    expect(res.body.data.finalPrice).toBe(96000);
    expect(res.body.data.savings).toBe(24000);
    expect(res.body.data.discountPercent).toBe(20);
    expect(res.body.data.appliedRule).not.toBeNull();
  });

  it('quote: ນອກທຸກຊ່ວງ = ລາຄາເຕັມ', async () => {
    const at = futureWeekday(10);
    at.setUTCHours(19 - 7, 30, 0, 0);
    const res = await request(app)
      .get(`/api/v1/pricing/quote?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&at=${at.toISOString()}`)
      .set(...bearer(custToken));
    expect(res.status).toBe(200);
    expect(res.body.data.finalPrice).toBe(120000);
    expect(res.body.data.savings).toBe(0);
    expect(res.body.data.appliedRule).toBeNull();
  });

  it('quote: weekend peak ×1.1 ສະເພາະ ຕັດຜົມ', async () => {
    const at = nextSaturday(3);
    at.setUTCHours(11 - 7, 0, 0, 0); // 11:00 ວຽງຈັນ ໃນຊ່ວງ 10:00–12:00
    const res = await request(app)
      .get(`/api/v1/pricing/quote?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&at=${at.toISOString()}`)
      .set(...bearer(custToken));
    expect(res.status).toBe(200);
    expect(res.body.data.finalPrice).toBe(132000);
    expect(res.body.data.discountPercent).toBe(0);
  });

  it('ຈອງໃນຊ່ວງ Happy Hour → totalAmount = ລາຄາຫຼັງຫຼຸດ', async () => {
    const date = futureWeekday(12).toISOString().slice(0, 10);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${date}`)
      .set(...bearer(custToken));
    expect(avail.status).toBe(200);
    const slots = avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>;
    const hh = slots.find((s) => {
      const h = (new Date(s.startAt).getUTCHours() + 7) % 24; // ຊົ່ວໂມງວຽງຈັນ
      return h >= 13 && h <= 14;
    });
    expect(hh, 'ຄວນມີ slot ໃນຊ່ວງ 13:00–15:00').toBeTruthy();

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(custToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: hh!.staffProfileId,
        startAt: hh!.startAt,
      });
    expect(booked.status).toBe(201);

    const row = await prisma.appointment.findUnique({
      where: { id: booked.body.data.id as string },
      select: { totalAmount: true },
    });
    expect(row?.totalAmount.toNumber()).toBe(96000);
  });
  it('promotions: ຕ້ອງ login + ຄືນສະເພາະສ່ວນຫຼຸດແທ້ (ບໍ່ມີ surge)', async () => {
    const anon = await request(app).get(`/api/v1/pricing/promotions?branchId=${BRANCH_ID}`);
    expect(anon.status).toBe(401);

    const res = await request(app)
      .get(`/api/v1/pricing/promotions?branchId=${BRANCH_ID}`)
      .set(...bearer(custToken));
    expect(res.status).toBe(200);
    const items = res.body.data as Array<{ kind: string; discountPercent: number; liveNow: boolean }>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((p) => p.discountPercent > 0)).toBe(true);
    // ລຽງ: liveNow ກ່ອນ
    const firstNotLive = items.findIndex((p) => !p.liveNow);
    if (firstNotLive >= 0) expect(items.slice(firstNotLive).every((p) => !p.liveNow)).toBe(true);
  });

  it('promotions: ຈັດກຸ່ມຫຼາຍວັນ, liveNow/endsAt/nextStartAt ຕາມເວລາວຽງຈັນ', async () => {
    await prisma.dynamicPricingRule.createMany({
      data: [2, 3].map((dow) => ({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        ruleName: 'QA temp rule',
        dayOfWeek: dow,
        startTime: '09:00',
        endTime: '11:00',
        discountPercent: 50,
      })),
    });
    const tuesday = new Date('2030-01-01T10:00:00+07:00'); // ວັນອັງຄານ 10:00 ວຽງຈັນ

    const live = (await listPromotions({ branchId: BRANCH_ID, limit: 20 }, tuesday)).find(
      (p) => p.title === 'QA temp rule',
    );
    expect(live).toBeDefined();
    expect(live!.daysOfWeek).toEqual([2, 3]);
    expect(live!.discountPercent).toBe(50);
    expect(live!.liveNow).toBe(true);
    expect(live!.endsAt).toBe(new Date('2030-01-01T11:00:00+07:00').toISOString());
    expect(live!.price).toBe(60000);
    expect(live!.compareAtPrice).toBe(120000);

    const after = new Date('2030-01-01T12:00:00+07:00');
    const next = (await listPromotions({ branchId: BRANCH_ID, limit: 20 }, after)).find(
      (p) => p.title === 'QA temp rule',
    );
    expect(next!.liveNow).toBe(false);
    expect(next!.nextStartAt).toBe(new Date('2030-01-02T09:00:00+07:00').toISOString());

    await prisma.dynamicPricingRule.deleteMany({ where: { ruleName: 'QA temp rule' } });
  });
});
