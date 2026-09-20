import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Web Admin ▸ Dashboard Overview.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (seeded admin 02000000000 / Admin@12345).
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const CUSTOMER_PHONE = '02088830077';
const MANAGER_PHONE = '02000000001'; // seeded BRANCH_ADMIN
const MANAGER_PASSWORD = 'Manager@12345';

describe('dashboard stats API', () => {
  let app: Express;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Dash QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.$disconnect();
  });

  it('401 ໂດຍບໍ່ມີ token, 403 ສຳລັບ customer', async () => {
    expect((await request(app).get('/api/v1/dashboard/stats')).status).toBe(401);
    const forbidden = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('ຄືນ stats ຄົບທຸກ field ທີ່ web-admin ຕ້ອງການ', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats?branchId=all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const s = res.body.data;
    for (const key of [
      'bookingsToday',
      'revenueToday',
      'queueWaiting',
      'completedToday',
      'avgTicket14d',
      'totalCustomers',
      'pendingApprovals',
      'confirmedToday',
      'queueInService',
    ]) {
      expect(typeof s[key], key).toBe('number');
    }
    expect(s.range).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    expect(s.revenueSeries).toHaveLength(14);
    expect(s.upcoming7dSeries).toHaveLength(7);
    expect(s.hoursToday).toHaveLength(11);
    expect(Array.isArray(s.upcoming)).toBe(true);
    expect(Array.isArray(s.serviceMix)).toBe(true);
    expect(Array.isArray(s.staffLeaderboard)).toBe(true);
    expect(s.queueNextNumber === null || typeof s.queueNextNumber === 'string').toBe(true);
    // walk-in rate is a 0..1 ratio (web-admin multiplies by 100)
    expect(s.walkinRate14d).toBeGreaterThanOrEqual(0);
    expect(s.walkinRate14d).toBeLessThanOrEqual(1);
    // business-health layer
    expect(s.periodDays).toBe(14);
    expect(s.prevSeries).toHaveLength(14);
    expect(typeof s.period.revenue).toBe('number');
    expect(typeof s.period.prevRevenue).toBe('number');
    expect(s.period.returningCustomers).toBeLessThanOrEqual(s.period.activeCustomers);
    expect(typeof s.collectedToday).toBe('number');
    for (const key of ['lowStock', 'unpaidBills', 'outstandingBalance', 'waitlist', 'lowRatings']) {
      expect(typeof s.attention[key], key).toBe('number');
    }
    expect(s.rating.distribution).toHaveLength(5);
    expect(Array.isArray(s.todayAgenda)).toBe(true);
    expect(Array.isArray(s.lowStockItems)).toBe(true);
    expect(Array.isArray(s.recentReviews)).toBe(true);
  });

  it('days=7|30 ປ່ຽນຄວາມຍາວ series, ຄ່າອື່ນ → 400', async () => {
    for (const days of [7, 30]) {
      const res = await request(app)
        .get(`/api/v1/dashboard/stats?branchId=all&days=${days}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.periodDays).toBe(days);
      expect(res.body.data.revenueSeries).toHaveLength(days);
      expect(res.body.data.prevSeries).toHaveLength(days);
    }
    const bad = await request(app)
      .get('/api/v1/dashboard/stats?days=9')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);
  });

  it('ຮັບ branchId ທີ່ເປັນ uuid ໄດ້', async () => {
    const branches = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`);
    const id = branches.body.data.items[0].id as string;
    const res = await request(app)
      .get(`/api/v1/dashboard/stats?branchId=${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.branchId).toBe(id);
  });

  it('BRANCH_ADMIN ຖືກບັງຄັບເປັນສາຂາຕົນ: all → ສາຂາຕົນ, ສາຂາອື່ນ → 403', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: MANAGER_PHONE, password: MANAGER_PASSWORD });
    const token = login.body.data.tokens.accessToken as string;
    const ownBranchId = login.body.data.user.branchId as string;

    const all = await request(app)
      .get('/api/v1/dashboard/stats?branchId=all')
      .set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.data.branchId).toBe(ownBranchId);

    const branches = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`);
    const other = (branches.body.data.items as Array<{ id: string }>).find(
      (b) => b.id !== ownBranchId,
    );
    if (other) {
      const res = await request(app)
        .get(`/api/v1/dashboard/stats?branchId=${other.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('ຕົວເລກລູກຄ້າ/ລາພັກ ຂອງສາຂາດຽວ ບໍ່ເກີນຍອດລວມທຸກສາຂາ', async () => {
    const branches = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`);
    const id = branches.body.data.items[0].id as string;
    const [all, one] = await Promise.all(
      ['all', id].map((b) =>
        request(app)
          .get(`/api/v1/dashboard/stats?branchId=${b}`)
          .set('Authorization', `Bearer ${adminToken}`),
      ),
    );
    for (const key of ['totalCustomers', 'vipCustomers', 'timeOffTotal', 'pendingApprovals']) {
      expect(one!.body.data[key], key).toBeLessThanOrEqual(all!.body.data[key]);
    }
    expect(all!.body.data.pendingApprovals).toBeLessThanOrEqual(all!.body.data.timeOffTotal);
  });
});
