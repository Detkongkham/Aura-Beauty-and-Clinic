import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 6 / Module 34 Staff KPI, Leaderboard & Payroll.
 *   complete a job → payroll report row (rank, gross, commission) ·
 *   PUT KPI goal → bonus auto-computed on excess · commissions/pay → unpaid clears ·
 *   CSV export · RBAC CUSTOMER → 403.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const MASSAGE_ID = '33333333-0000-0000-0000-000000000005';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const CUST_PHONE = '02090002888';
const CUST_PASSWORD = 'Cust@12345';
const WI_PHONE = '02088840088';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

function thisMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function wipe(): Promise<void> {
  const appts = await prisma.appointment.findMany({
    where: { customer: { phone: WI_PHONE } },
    select: { id: true },
  });
  const ids = appts.map((a) => a.id);
  if (ids.length) {
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { refId: { in: ids.map((id) => `appt:${id}`) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { phone: WI_PHONE } });
}

describe('Phase 6 — Staff KPI & Payroll (Module 34)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;
  let staffProfileId: string;
  const month = thisMonth();

  beforeAll(async () => {
    app = createApp();
    await wipe();
    adminToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;

    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'ລູກຄ້າ payroll', phone: CUST_PHONE, password: CUST_PASSWORD });
    custToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: CUST_PHONE, password: CUST_PASSWORD })
    ).body.data.tokens.accessToken;

    const staffList = await request(app)
      .get(`/api/v1/staff?branchId=${BRANCH_ID}&serviceId=${MASSAGE_ID}`)
      .set(...bearer(adminToken));
    staffProfileId = (staffList.body.data as Array<{ id: string }>)[0]!.id;

    // one completed massage this month for that staff
    const wi = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        customerName: 'ລູກຄ້າ payroll',
        customerPhone: WI_PHONE,
        serviceId: MASSAGE_ID,
        staffId: staffProfileId,
      });
    await request(app)
      .patch(`/api/v1/appointments/${wi.body.data.appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('RBAC — CUSTOMER cannot read the payroll report', async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/kpi?monthYear=${month}`)
      .set(...bearer(custToken));
    expect(res.status).toBe(403);
  });

  it('payroll report has a ranked row for the staff with commission computed', async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const row = (res.body.data.rows as Array<{ staffProfileId: string; grossRevenue: number; commissionTotal: number; rank: number }>).find(
      (r) => r.staffProfileId === staffProfileId,
    );
    expect(row).toBeTruthy();
    expect(row!.grossRevenue).toBeGreaterThanOrEqual(250000);
    expect(row!.commissionTotal).toBeGreaterThan(0);
    expect(row!.rank).toBeGreaterThanOrEqual(1);
  });

  it('setting a KPI goal auto-computes a bonus on revenue above target', async () => {
    const res = await request(app)
      .put(`/api/v1/payroll/kpi/${staffProfileId}`)
      .set(...bearer(adminToken))
      .send({ monthYear: month, targetRevenue: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.data.targetMet).toBe(true);
    expect(res.body.data.bonusAmount).toBeGreaterThan(0); // (actual - 100000) * bonusRate

    // recompute endpoint keeps it consistent
    const rc = await request(app)
      .post('/api/v1/payroll/kpi/recompute')
      .set(...bearer(adminToken))
      .send({ monthYear: month, branchId: BRANCH_ID });
    expect(rc.status).toBe(200);
    expect(rc.body.data.updated).toBeGreaterThanOrEqual(1);
  });

  it('paying commissions clears the unpaid balance; bonus-paid flips', async () => {
    const pay = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: true });
    expect(pay.status).toBe(200);
    expect(pay.body.data.affected).toBeGreaterThanOrEqual(1);

    const bonus = await request(app)
      .patch(`/api/v1/payroll/kpi/${staffProfileId}/bonus-paid`)
      .set(...bearer(adminToken))
      .send({ monthYear: month, isBonusPaid: true });
    expect(bonus.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    const row = (after.body.data.rows as Array<{ staffProfileId: string; commissionUnpaid: number; bonusPaid: boolean; outstanding: number }>).find(
      (r) => r.staffProfileId === staffProfileId,
    )!;
    expect(row.commissionUnpaid).toBe(0);
    expect(row.bonusPaid).toBe(true);
    expect(row.outstanding).toBe(0);
  });

  it('CSV export returns a text/csv attachment with a BOM and the staff name', async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/export?monthYear=${month}&branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`payroll-${month}.csv`);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('rank,staff,branch');
  });
});
