import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';

/**
 * Integration — Payroll P2/P3/P4 (docs/payroll-audit.md): salary → adjustments → run DRAFT →
 * approve (SUPER_ADMIN only) → locks → reopen → pay → commissions/clawback marked + SALARY expense +
 * staff sees payslip. Runs on its own branch so no seed staff join the run.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const SERVICE_ID = '33333333-0000-0000-0000-000000000005';
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const BRANCH_NAME = 'ສາຂາທົດສອບ payroll-run';
const STAFF_PHONE = '02088850001';
const BA_PHONE = '02088850002';
const CUST_PHONE = '02088850003';
const PWD = 'Staff@12345';
const MONTH = '2024-02';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let adminToken = '';
let baToken = '';
let staffToken = '';
let branchId = '';
let staffProfileId = '';
let commissionId = '';
let clawbackId = '';
let runId = '';

async function login(phone: string, password: string): Promise<string> {
  const r = await request(app).post('/api/v1/auth/login').send({ phone, password });
  return r.body.data.tokens.accessToken as string;
}

async function cleanup(): Promise<void> {
  const branch = await prisma.branch.findFirst({ where: { name: BRANCH_NAME }, select: { id: true } });
  if (branch) {
    const runs = await prisma.payrollRun.findMany({ where: { branchId: branch.id }, select: { expenseId: true } });
    await prisma.payrollRun.deleteMany({ where: { branchId: branch.id } });
    const expenseIds = runs.map((r) => r.expenseId).filter((x): x is string => Boolean(x));
    await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
    const appts = await prisma.appointment.findMany({ where: { branchId: branch.id }, select: { id: true } });
    const ids = appts.map((a) => a.id);
    await prisma.commissionClawback.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  const users = await prisma.user.findMany({ where: { phone: { in: [STAFF_PHONE, BA_PHONE, CUST_PHONE] } }, select: { id: true } });
  const profiles = await prisma.staffProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } });
  const pids = profiles.map((p) => p.id);
  await prisma.payslip.deleteMany({ where: { staffProfileId: { in: pids } } });
  await prisma.staffAttendance.deleteMany({ where: { staffProfileId: { in: pids } } });
  await prisma.staffKpiGoal.deleteMany({ where: { staffProfileId: { in: pids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  if (branch) await prisma.branch.delete({ where: { id: branch.id } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  adminToken = await login(ADMIN.phone, ADMIN.password);

  const branch = await prisma.branch.create({ data: { name: BRANCH_NAME, address: 'test', phone: '02000000998' } });
  branchId = branch.id;
  const pwd = await hashPassword(PWD);
  const staffUser = await prisma.user.create({ data: { name: 'ຊ່າງ payroll-run', phone: STAFF_PHONE, password: pwd, role: 'STAFF', branchId } });
  await prisma.user.create({ data: { name: 'BA payroll-run', phone: BA_PHONE, password: pwd, role: 'BRANCH_ADMIN', branchId } });
  const customer = await prisma.user.create({ data: { name: 'ລູກຄ້າ payroll-run', phone: CUST_PHONE, password: pwd, role: 'CUSTOMER' } });
  const profile = await prisma.staffProfile.create({
    data: {
      userId: staffUser.id,
      title: 'Therapist',
      commissionRate: 0.1,
      staffBranches: { create: { branchId, isPrimary: true } },
    },
  });
  staffProfileId = profile.id;

  // Attendance: 1 normal day, 1 overtime day (10h), 2 absences — all in Feb 2024.
  const at = (d: number, h: number, status: 'ON_TIME' | 'OVERTIME' | 'ABSENT') => ({
    staffProfileId,
    date: new Date(Date.UTC(2024, 1, d)),
    checkIn: new Date(Date.UTC(2024, 1, d, 1)),
    checkOut: status === 'ABSENT' ? null : new Date(Date.UTC(2024, 1, d, 1 + h)),
    status,
  });
  await prisma.staffAttendance.createMany({
    data: [at(5, 8, 'ON_TIME'), at(6, 10, 'OVERTIME'), at(7, 0, 'ABSENT'), at(8, 0, 'ABSENT')],
  });

  // One completed, fully-paid appointment → 300,000 commission; plus an older clawback owed.
  const appt = await prisma.appointment.create({
    data: {
      branchId,
      customerId: customer.id,
      staffProfileId,
      serviceId: SERVICE_ID,
      startAt: new Date(Date.UTC(2024, 1, 10, 3)),
      endAt: new Date(Date.UTC(2024, 1, 10, 4)),
      status: 'COMPLETED',
      totalAmount: 3_000_000,
    },
  });
  await prisma.payment.create({
    data: { branchId, appointmentId: appt.id, totalAmount: 3_000_000, paymentStatus: 'FULLY_PAID', paidAt: new Date() },
  });
  commissionId = (
    await prisma.staffCommission.create({
      data: { staffProfileId, appointmentId: appt.id, serviceAmount: 3_000_000, commissionRate: 0.1, payoutAmount: 300_000 },
    })
  ).id;
  clawbackId = (
    await prisma.commissionClawback.create({
      data: { staffProfileId, appointmentId: appt.id, branchId, refundId: `test-refund-${appt.id}`, amount: 25_000, monthYear: '2024-01' },
    })
  ).id;

  baToken = await login(BA_PHONE, PWD);
  staffToken = await login(STAFF_PHONE, PWD);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Payroll runs — P2/P3/P4', () => {
  it('only SUPER_ADMIN can set a salary; BRANCH_ADMIN can read it', async () => {
    const body = { salaryType: 'MONTHLY', baseSalary: 6_000_000, ssoEnrolled: true };
    await request(app).put(`/api/v1/payroll/staff/${staffProfileId}/salary`).set(...bearer(baToken)).send(body).expect(403);
    await request(app).put(`/api/v1/payroll/staff/${staffProfileId}/salary`).set(...bearer(adminToken)).send(body).expect(200);
    const read = await request(app).get(`/api/v1/payroll/staff/${staffProfileId}/salary`).set(...bearer(baToken)).expect(200);
    expect(read.body.data).toMatchObject(body);
  });

  it('adjustments are added per staff per month', async () => {
    for (const a of [
      { type: 'ALLOWANCE', amount: 200_000, label: 'ຄ່າອາຫານ' },
      { type: 'ADVANCE', amount: 500_000, label: 'ເບີກລ່ວງໜ້າ' },
    ]) {
      await request(app)
        .post('/api/v1/payroll/adjustments')
        .set(...bearer(baToken))
        .send({ staffProfileId, monthYear: MONTH, ...a })
        .expect(201);
    }
    const list = await request(app).get(`/api/v1/payroll/adjustments?monthYear=${MONTH}`).set(...bearer(baToken)).expect(200);
    expect(list.body.data).toHaveLength(2);
  });

  it('a DRAFT run computes the payslip: salary, absence, OT, commission, SSO, tax, advance, clawback', async () => {
    const res = await request(app).post('/api/v1/payroll/runs').set(...bearer(baToken)).send({ branchId, monthYear: MONTH });
    expect(res.status).toBe(200);
    runId = res.body.data.id;
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.payslips).toHaveLength(1);
    const p = res.body.data.payslips[0];
    expect(p.basePay).toBe(6_000_000);
    expect(p.absenceDeduction).toBeCloseTo(461_538.46, 1);
    expect(p.overtimeHours).toBe(2);
    expect(p.commission).toBe(300_000);
    expect(p.allowances).toBe(200_000);
    expect(p.grossPay).toBeCloseTo(6_125_000, 0);
    expect(p.ssoEmployee).toBe(247_500);
    expect(p.ssoEmployer).toBe(270_000);
    expect(p.incomeTax).toBeCloseTo(272_750, 0);
    expect(p.advances).toBe(500_000);
    expect(p.clawback).toBe(25_000);
    expect(p.netPay).toBeCloseTo(6_125_000 - 247_500 - 272_750 - 500_000 - 25_000, 0);

    // Recompute is idempotent (same run, same numbers).
    const again = await request(app).post('/api/v1/payroll/runs').set(...bearer(baToken)).send({ branchId, monthYear: MONTH });
    expect(again.body.data.id).toBe(runId);
    expect(again.body.data.totalNet).toBe(res.body.data.totalNet);
  });

  it('approval is SUPER_ADMIN-only and freezes the month', async () => {
    await request(app).post(`/api/v1/payroll/runs/${runId}/approve`).set(...bearer(baToken)).expect(403);
    const ok = await request(app).post(`/api/v1/payroll/runs/${runId}/approve`).set(...bearer(adminToken)).expect(200);
    expect(ok.body.data.status).toBe('APPROVED');
    expect(ok.body.data.approvedBy).toBeTruthy();

    await request(app)
      .post('/api/v1/payroll/adjustments')
      .set(...bearer(baToken))
      .send({ staffProfileId, monthYear: MONTH, type: 'PENALTY', amount: 1, label: 'late add' })
      .expect(409);
    await request(app).post('/api/v1/payroll/runs').set(...bearer(baToken)).send({ branchId, monthYear: MONTH }).expect(409);
    // Old quick-pay button is blocked while the run holds the commission.
    await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: MONTH, isPaid: true })
      .expect(409);
  });

  it('reopen needs a reason and returns the run to DRAFT', async () => {
    await request(app).post(`/api/v1/payroll/runs/${runId}/reopen`).set(...bearer(adminToken)).send({}).expect(400);
    const r = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/reopen`)
      .set(...bearer(adminToken))
      .send({ reason: 'ແກ້ລາຍການຫັກ' })
      .expect(200);
    expect(r.body.data).toMatchObject({ status: 'DRAFT', reopenCount: 1, lastReopenReason: 'ແກ້ລາຍການຫັກ' });
    await request(app).post(`/api/v1/payroll/runs/${runId}/approve`).set(...bearer(adminToken)).expect(200);
  });

  it('paying the run settles commission/clawback, posts a SALARY expense and shows the payslip to the staff', async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/pay`)
      .set(...bearer(adminToken))
      .send({ method: 'TRANSFER', reference: 'BCEL-123' })
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'PAID', paymentMethod: 'TRANSFER', paymentReference: 'BCEL-123' });

    const c = await prisma.staffCommission.findUniqueOrThrow({ where: { id: commissionId } });
    expect(c.isPaid).toBe(true);
    expect(c.paidAt).toBeInstanceOf(Date);
    expect((await prisma.commissionClawback.findUniqueOrThrow({ where: { id: clawbackId } })).isSettled).toBe(true);

    // Expense = fixed pay (6,000,000 − absence + OT + allowance) + employer SSO; commission excluded.
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: res.body.data.expenseId },
      include: { category: true },
    });
    expect(expense.category.kind).toBe('PAYROLL');
    expect(expense.status).toBe('PAID');
    expect(expense.amount.toNumber()).toBeCloseTo(5_825_000 + 270_000, 0);

    const mine = await request(app).get('/api/v1/staff-portal/payslips').set(...bearer(staffToken)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ monthYear: MONTH, runStatus: 'PAID' });

    // Paid run is final: no re-pay, no reopen, no un-paying its commission.
    await request(app).post(`/api/v1/payroll/runs/${runId}/pay`).set(...bearer(adminToken)).send({ method: 'CASH' }).expect(409);
    await request(app).post(`/api/v1/payroll/runs/${runId}/reopen`).set(...bearer(adminToken)).send({ reason: 'x-test' }).expect(409);
    await request(app)
      .post('/api/v1/payroll/commissions/pay')
      .set(...bearer(adminToken))
      .send({ staffProfileId, monthYear: MONTH, isPaid: false, reason: 'ທົດສອບ' })
      .expect(409);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'staff.payroll_run_paid', entityId: runId } });
    expect(audit).toBeTruthy();
  });

  it('BRANCH_ADMIN of another branch cannot see this run', async () => {
    // Seed BRANCH_ADMIN belongs to the head-office branch.
    const other = await login('02000000001', 'Manager@12345');
    await request(app).get(`/api/v1/payroll/runs/${runId}`).set(...bearer(other)).expect(403);
    const list = await request(app).get('/api/v1/payroll/runs').set(...bearer(other)).expect(200);
    expect((list.body.data as Array<{ id: string }>).some((r) => r.id === runId)).toBe(false);
  });

  it('settings validate the tax table', async () => {
    const cur = (await request(app).get('/api/v1/payroll/settings').set(...bearer(adminToken)).expect(200)).body.data;
    expect(cur.pitBrackets.at(-1).upTo).toBeNull();
    await request(app)
      .put('/api/v1/payroll/settings')
      .set(...bearer(adminToken))
      .send({ ...cur, pitBrackets: [{ upTo: 1000, rate: 0 }] })
      .expect(400);
    await request(app).put('/api/v1/payroll/settings').set(...bearer(baToken)).send(cur).expect(403);
    await request(app).put('/api/v1/payroll/settings').set(...bearer(adminToken)).send(cur).expect(200);
  });
});
