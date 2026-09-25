import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';
import { accrueCommission } from '../../src/modules/payroll/commission.js';

/**
 * Integration — payroll follow-ups: G1.8 per-service commission rate · G3.5 quick-pay limit for
 * BRANCH_ADMIN · G5.5 bulk KPI targets · pay run from a bank account (expense.paidFromAccountId) ·
 * G5.3 year-to-date. Own branch + staff so nothing from the seed joins in.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const SERVICE_ID = '33333333-0000-0000-0000-000000000005';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const BRANCH_NAME = 'ສາຂາທົດສອບ payroll-extras';
const STAFF_PHONE = '02088880101';
const BA_PHONE = '02088880102';
const CUST_PHONE = '02088880103';
const PWD = 'Staff@12345';
const MONTH = '2024-03';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let adminToken = '';
let baToken = '';
let branchId = '';
let staffProfileId = '';
let customerId = '';
let accountId = '';

async function login(phone: string, password: string): Promise<string> {
  const r = await request(app).post('/api/v1/auth/login').send({ phone, password });
  return r.body.data.tokens.accessToken as string;
}

async function appointment(start: Date, amount: number, paid: boolean): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      branchId,
      customerId,
      staffProfileId,
      serviceId: SERVICE_ID,
      startAt: start,
      endAt: new Date(start.getTime() + 3_600_000),
      status: 'COMPLETED',
      totalAmount: amount,
    },
  });
  if (paid) {
    await prisma.payment.create({
      data: { branchId, appointmentId: appt.id, totalAmount: amount, paymentStatus: 'FULLY_PAID', paidAt: new Date() },
    });
  }
  await prisma.$transaction((tx) => accrueCommission(tx, appt.id));
  return appt.id;
}

async function cleanup(): Promise<void> {
  await prisma.serviceCommissionRule.deleteMany({ where: { serviceId: SERVICE_ID } });
  const branch = await prisma.branch.findFirst({ where: { name: BRANCH_NAME }, select: { id: true } });
  if (branch) {
    const runs = await prisma.payrollRun.findMany({ where: { branchId: branch.id }, select: { expenseId: true } });
    await prisma.payrollRun.deleteMany({ where: { branchId: branch.id } });
    await prisma.expense.deleteMany({ where: { id: { in: runs.map((r) => r.expenseId).filter((x): x is string => !!x) } } });
    const ids = (await prisma.appointment.findMany({ where: { branchId: branch.id }, select: { id: true } })).map((a) => a.id);
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
    await prisma.bankAccount.deleteMany({ where: { branchId: branch.id } });
  }
  const users = await prisma.user.findMany({ where: { phone: { in: [STAFF_PHONE, BA_PHONE, CUST_PHONE] } }, select: { id: true } });
  const pids = (await prisma.staffProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } })).map((p) => p.id);
  await prisma.payslip.deleteMany({ where: { staffProfileId: { in: pids } } });
  await prisma.staffKpiGoal.deleteMany({ where: { staffProfileId: { in: pids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  if (branch) await prisma.branch.delete({ where: { id: branch.id } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  adminToken = await login(ADMIN.phone, ADMIN.password);
  branchId = (await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'x', phone: '02000000995' } })).id;
  const pwd = await hashPassword(PWD);
  const staffUser = await prisma.user.create({ data: { name: 'ຊ່າງ extras', phone: STAFF_PHONE, password: pwd, role: 'STAFF', branchId } });
  await prisma.user.create({ data: { name: 'BA extras', phone: BA_PHONE, password: pwd, role: 'BRANCH_ADMIN', branchId } });
  customerId = (await prisma.user.create({ data: { name: 'ລູກຄ້າ extras', phone: CUST_PHONE, password: pwd, role: 'CUSTOMER' } })).id;
  staffProfileId = (
    await prisma.staffProfile.create({
      data: { userId: staffUser.id, title: 'Therapist', commissionRate: 0.1, staffBranches: { create: { branchId, isPrimary: true } } },
    })
  ).id;
  const bank = await prisma.bank.findFirstOrThrow({ where: { code: 'BCEL' } });
  accountId = (
    await prisma.bankAccount.create({ data: { bankId: bank.id, branchId, accountName: 'Aura payroll', accountNumber: '0101000012345678' } })
  ).id;
  baToken = await login(BA_PHONE, PWD);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('payroll follow-ups', () => {
  it('G1.8 — a service rule overrides the staff commission rate for new accruals', async () => {
    await request(app)
      .put(`/api/v1/payroll/service-rules/${SERVICE_ID}`)
      .set(...bearer(baToken))
      .send({ rate: 0.2 })
      .expect(403);
    await request(app).put(`/api/v1/payroll/service-rules/${SERVICE_ID}`).set(...bearer(adminToken)).send({ rate: 0.2 }).expect(200);
    const id = await appointment(new Date(Date.UTC(2024, 2, 5, 3)), 1_000_000, true);
    const c = await prisma.staffCommission.findUniqueOrThrow({ where: { appointmentId: id } });
    expect(c.commissionRate).toBe(0.2);
    expect(c.payoutAmount.toNumber()).toBe(200_000);

    const list = await request(app).get('/api/v1/payroll/service-rules').set(...bearer(baToken)).expect(200);
    expect(list.body.data.some((r: { serviceId: string; rate: number }) => r.serviceId === SERVICE_ID && r.rate === 0.2)).toBe(true);
    await request(app).put(`/api/v1/payroll/service-rules/${SERVICE_ID}`).set(...bearer(adminToken)).send({ rate: null }).expect(200);
    expect(await prisma.serviceCommissionRule.count({ where: { serviceId: SERVICE_ID } })).toBe(0);
  });

  it('G3.5 — BRANCH_ADMIN quick-pay above the limit is refused; the owner can pay it', async () => {
    // A large collected job: 60,000,000 × 10% = 6,000,000 commission > 5,000,000 default limit.
    await appointment(new Date(Date.UTC(2024, 2, 6, 3)), 60_000_000, true);
    const res = await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(baToken))
      .send({ staffProfileId, monthYear: MONTH, isPaid: true });
    expect(res.status).toBe(403);
    await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: MONTH, isPaid: true })
      .expect(200);
  });

  it('G5.5 — bulk targets from last month × %, without overwriting set targets', async () => {
    await appointment(new Date(Date.UTC(2024, 1, 10, 3)), 2_000_000, true); // Feb revenue for the staff
    const res = await request(app)
      .post('/api/v1/payroll/kpi/bulk-targets')
      .set(...bearer(baToken))
      .send({ monthYear: MONTH, mode: 'PREV_MONTH_PCT', value: 110 });
    expect(res.status).toBe(200);
    const goal = await prisma.staffKpiGoal.findUniqueOrThrow({
      where: { staffProfileId_monthYear: { staffProfileId, monthYear: MONTH } },
    });
    expect(goal.targetRevenue.toNumber()).toBe(2_200_000);

    await request(app)
      .post('/api/v1/payroll/kpi/bulk-targets')
      .set(...bearer(baToken))
      .send({ monthYear: MONTH, mode: 'FIXED', value: 9_000_000 })
      .expect(200);
    const kept = await prisma.staffKpiGoal.findUniqueOrThrow({
      where: { staffProfileId_monthYear: { staffProfileId, monthYear: MONTH } },
    });
    expect(kept.targetRevenue.toNumber()).toBe(2_200_000);
  });

  it('pay run from a bank account links the salary expense to it; YTD sums the paid slips', async () => {
    await request(app)
      .put(`/api/v1/payroll/staff/${staffProfileId}/salary`)
      .set(...bearer(adminToken))
      .send({ salaryType: 'MONTHLY', baseSalary: 3_000_000, ssoEnrolled: true })
      .expect(200);
    const prep = await request(app).post('/api/v1/payroll/runs').set(...bearer(baToken)).send({ branchId, monthYear: MONTH }).expect(200);
    const runId = prep.body.data.id as string;
    // KPI bonus refreshed from live revenue before the slip was built (G4.3).
    expect(prep.body.data.payslips[0].bonus).toBeGreaterThan(0);
    await request(app).post(`/api/v1/payroll/runs/${runId}/approve`).set(...bearer(adminToken)).expect(200);
    await request(app)
      .post(`/api/v1/payroll/runs/${runId}/pay`)
      .set(...bearer(adminToken))
      .send({ method: 'CASH', bankAccountId: accountId })
      .expect(400);
    const paid = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/pay`)
      .set(...bearer(adminToken))
      .send({ method: 'TRANSFER', bankAccountId: accountId, reference: 'BCEL-9' })
      .expect(200);
    expect(paid.body.data.bankAccountLabel).toContain('BCEL');
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: paid.body.data.expenseId } });
    expect(expense.paidFromAccountId).toBe(accountId);

    const ytd = await request(app).get('/api/v1/payroll/ytd?year=2024').set(...bearer(baToken)).expect(200);
    const row = ytd.body.data.rows.find((r: { staffProfileId: string }) => r.staffProfileId === staffProfileId);
    expect(row.months).toBe(1);
    expect(row.netPay).toBeCloseTo(paid.body.data.totalNet, 0);
    expect(ytd.body.data.totals.runs).toBe(1);
  });
});
