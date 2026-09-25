import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';
import { accrueCommission } from '../../src/modules/payroll/commission.js';

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
const WI2_PHONE = '02088840089';
const BA_PHONE = '02088840090';
const BA_OTHER_PHONE = '02088840091';
const BA_PASSWORD = 'Branch@12345';
const OTHER_BRANCH_NAME = 'ສາຂາທົດສອບ payroll';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

function thisMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function wipe(): Promise<void> {
  const appts = await prisma.appointment.findMany({
    where: { customer: { phone: { in: [WI_PHONE, WI2_PHONE] } } },
    select: { id: true },
  });
  const ids = appts.map((a) => a.id);
  if (ids.length) {
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { refId: { in: ids.map((id) => `appt:${id}`) } } });
    await prisma.stockReservation.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.paymentTransaction.deleteMany({ where: { payment: { appointmentId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { phone: { in: [WI_PHONE, WI2_PHONE, BA_PHONE, BA_OTHER_PHONE] } } });
  await prisma.branch.deleteMany({ where: { name: OTHER_BRANCH_NAME } });
}

/** ສ້າງບິນຂອງນັດ ແລ້ວຊຳລະເງິນສົດເຕັມຈຳນວນ → FULLY_PAID (C2: ຄ່າຄອມຈ່າຍໄດ້). */
async function settleBill(app: Express, token: string, appointmentId: string): Promise<void> {
  const created = await request(app)
    .post('/api/v1/payments')
    .set(...bearer(token))
    .set(...idem())
    .send({ appointmentId });
  expect(created.status).toBe(201);
  const total = Number(created.body.data.totalAmount);
  const paid = await request(app)
    .post(`/api/v1/payments/${created.body.data.id}/tenders`)
    .set(...bearer(token))
    .set(...idem())
    .send({ tenders: [{ method: 'CASH', amount: total }] });
  expect(paid.status).toBe(200);
}

describe('Phase 6 — Staff KPI & Payroll (Module 34)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;
  let staffProfileId: string;
  let walkInId: string;
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
    walkInId = await completeWalkIn(WI_PHONE);
    await settleBill(app, adminToken, walkInId);
  });

  async function completeWalkIn(phone: string): Promise<string> {
    const wi = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        customerName: 'ລູກຄ້າ payroll',
        customerPhone: phone,
        serviceId: MASSAGE_ID,
        staffId: staffProfileId,
      });
    expect(wi.status).toBe(201);
    const id = wi.body.data.appointmentId as string;
    const done = await request(app)
      .patch(`/api/v1/appointments/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);
    return id;
  }

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

  it('breakdown returns the commission lines behind that month\'s figure', async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/kpi/${staffProfileId}/breakdown?monthYear=${month}`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const body = res.body.data as {
      monthYear: string;
      row: { staffProfileId: string; commissionTotal: number };
      lines: Array<{ payoutAmount: number; serviceName: string }>;
      daily: Array<{ date: string; revenue: number }>;
      history: Array<{ monthYear: string }>;
    };
    expect(body.monthYear).toBe(month);
    expect(body.row.staffProfileId).toBe(staffProfileId);
    expect(body.lines.length).toBeGreaterThanOrEqual(1);
    // The lines must add up to the figure the report shows for the same month.
    const lineSum = body.lines.reduce((s, l) => s + l.payoutAmount, 0);
    expect(Math.round(lineSum)).toBe(Math.round(body.row.commissionTotal));
    // A full month of days, and six months of context, are always present.
    expect(body.daily.length).toBeGreaterThanOrEqual(28);
    expect(body.history).toHaveLength(6);
    expect(body.history.at(-1)!.monthYear).toBe(month);
  });

  it('bulk pay settles several staff in one request', async () => {
    const unpay = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: false, reason: 'ກົດຜິດ — ທົດສອບ' });
    expect(unpay.status).toBe(200);

    const res = await request(app)
      .post('/api/v1/payroll/commissions/pay-bulk')
      .set(...bearer(adminToken))
      .send({ staffProfileIds: [staffProfileId], monthYear: month, isPaid: true });
    expect(res.status).toBe(200);
    expect(res.body.data.affected).toBeGreaterThanOrEqual(1);

    const after = await request(app)
      .get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    const row = (after.body.data.rows as Array<{ staffProfileId: string; commissionUnpaid: number; payoutState: string }>).find(
      (r) => r.staffProfileId === staffProfileId,
    )!;
    expect(row.commissionUnpaid).toBe(0);
    expect(row.payoutState).toBe('CLEAR');
  });

  it('report carries the month context the console reads (totals, previous month, daily series)', async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    const body = res.body.data as {
      daysInMonth: number;
      daysElapsed: number;
      daily: unknown[];
      previous: { monthYear: string };
      totals: { payable: number; commissionTotal: number; bonusTotal: number; labourCostRatio: number };
    };
    expect(body.daily).toHaveLength(body.daysInMonth);
    expect(body.daysElapsed).toBeLessThanOrEqual(body.daysInMonth);
    expect(body.previous.monthYear).not.toBe(month);
    expect(body.totals.payable).toBeCloseTo(body.totals.commissionTotal + body.totals.bonusTotal, 2);
    expect(body.totals.labourCostRatio).toBeGreaterThanOrEqual(0);
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

  // ── P1 — docs/payroll-audit.md C1–C4 + G4.1 ────────────────────────────

  it('C3 — pay stamps paidAt/paidById and writes an audit row; un-pay needs a reason', async () => {
    const row = await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId: walkInId } });
    expect(row.isPaid).toBe(true);
    expect(row.paidAt).toBeInstanceOf(Date);
    expect(row.paidById).toBeTruthy();

    const noReason = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: false });
    expect(noReason.status).toBe(400);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'staff.commission_paid', entityId: staffProfileId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect((audit!.newValue as { amount: number }).amount).toBeGreaterThan(0);
    expect(audit!.oldValue).toMatchObject({ isPaid: false });
  });

  it('C2 — commission on an unpaid bill is held until the bill is collected', async () => {
    const apptId = await completeWalkIn(WI2_PHONE);
    const report = async () =>
      (
        await request(app)
          .get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`)
          .set(...bearer(adminToken))
      ).body.data as {
        commissionRequiresCollection: boolean;
        rows: Array<{ staffProfileId: string; commissionHeld: number; commissionUnpaid: number }>;
      };
    const before = await report();
    expect(before.commissionRequiresCollection).toBe(true);
    const held = before.rows.find((r) => r.staffProfileId === staffProfileId)!;
    expect(held.commissionHeld).toBeGreaterThan(0);

    const pay = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: true });
    expect(pay.status).toBe(200);
    expect(pay.body.data.affected).toBe(0);
    expect(pay.body.data.held).toBeGreaterThan(0);
    expect((await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId: apptId } })).isPaid).toBe(false);

    await settleBill(app, adminToken, apptId);
    const pay2 = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: month, isPaid: true });
    expect(pay2.body.data.affected).toBe(1);
    const after = (await report()).rows.find((r) => r.staffProfileId === staffProfileId)!;
    expect(after.commissionHeld).toBe(0);
    expect(after.commissionUnpaid).toBe(0);
  });

  it('C1 — concurrent recomputes keep exactly one KPI goal row per staff per month', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/api/v1/payroll/kpi/recompute').set(...bearer(adminToken)).send({ monthYear: month }),
      ),
    );
    const n = await prisma.staffKpiGoal.count({ where: { staffProfileId, monthYear: month } });
    expect(n).toBe(1);
  });

  it('C4 — BRANCH_ADMIN is pinned to their own branch', async () => {
    const other = await prisma.branch.create({
      data: { name: OTHER_BRANCH_NAME, address: 'test', phone: '02000000999' },
    });
    const pwd = await hashPassword(BA_PASSWORD);
    await prisma.user.create({
      data: { name: 'BA payroll', phone: BA_PHONE, password: pwd, role: 'BRANCH_ADMIN', branchId: BRANCH_ID },
    });
    await prisma.user.create({
      data: { name: 'BA other', phone: BA_OTHER_PHONE, password: pwd, role: 'BRANCH_ADMIN', branchId: other.id },
    });
    const login = async (phone: string) =>
      (await request(app).post('/api/v1/auth/login').send({ phone, password: BA_PASSWORD })).body.data.tokens
        .accessToken as string;
    const own = await login(BA_PHONE);
    const foreign = await login(BA_OTHER_PHONE);

    // Own-branch admin: no branchId → forced to own branch, sees the staff.
    const mine = await request(app).get(`/api/v1/payroll/kpi?monthYear=${month}`).set(...bearer(own));
    expect(mine.status).toBe(200);
    expect((mine.body.data.rows as Array<{ staffProfileId: string }>).some((r) => r.staffProfileId === staffProfileId)).toBe(true);

    // Other-branch admin: asking for branch 1 → 403; default view has none of branch 1's staff.
    const peek = await request(app).get(`/api/v1/payroll/kpi?monthYear=${month}&branchId=${BRANCH_ID}`).set(...bearer(foreign));
    expect(peek.status).toBe(403);
    const theirs = await request(app).get(`/api/v1/payroll/kpi?monthYear=${month}`).set(...bearer(foreign));
    expect(theirs.status).toBe(200);
    expect((theirs.body.data.rows as Array<{ staffProfileId: string }>).some((r) => r.staffProfileId === staffProfileId)).toBe(false);

    // …and cannot pay, set a goal, or open the payslip of branch 1's staff.
    const pay = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(foreign))
      .send({ staffProfileId, monthYear: month, isPaid: false, reason: 'ພະຍາຍາມຂ້າມສາຂາ' });
    expect(pay.status).toBe(403);
    const goal = await request(app)
      .put(`/api/v1/payroll/kpi/${staffProfileId}`)
      .set(...bearer(foreign))
      .send({ monthYear: month, targetRevenue: 1 });
    expect(goal.status).toBe(403);
    const slip = await request(app)
      .get(`/api/v1/payroll/kpi/${staffProfileId}/breakdown?monthYear=${month}`)
      .set(...bearer(foreign));
    expect(slip.status).toBe(403);
    const csv = await request(app).get(`/api/v1/payroll/export?monthYear=${month}&branchId=${BRANCH_ID}`).set(...bearer(foreign));
    expect(csv.status).toBe(403);
  });

  it('G4.1 — commission basis excludes the home-service travel fee', async () => {
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: walkInId } });
    const total = appt.totalAmount.toNumber();
    await prisma.staffCommission.update({ where: { appointmentId: walkInId }, data: { isPaid: false } });
    await prisma.appointment.update({ where: { id: walkInId }, data: { travelFee: 50_000 } });
    await prisma.$transaction((tx) => accrueCommission(tx, walkInId));
    const c = await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId: walkInId } });
    expect(c.serviceAmount.toNumber()).toBe(total - 50_000);
    expect(c.payoutAmount.toNumber()).toBeCloseTo((total - 50_000) * c.commissionRate, 2);
  });
});
