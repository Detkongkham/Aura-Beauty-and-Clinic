import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — walk-in = real Appointment (Phase 4 follow-up).
 *   ໜ້າຮ້ານອອກ walk-in → ສ້າງ Appointment (source WALK_IN) + ບັດຄິວທີ່ຜູກກັນ
 *   → ຂຶ້ນຕາຕະລາງ "ມື້ນີ້" ຂອງຊ່າງ (isWalkIn) → ຊ່າງເລີ່ມ/ຈົບ → ບັດຄິວ mirror + commission persist
 *   → admin ເຫັນ isWalkIn=true. ຍັງກວດ auto-assign ຊ່າງເມື່ອບໍ່ລະບຸ.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001'; // ຕັດຜົມ — seed staff 1 ໃຫ້ບໍລິການ
const STAFF_PHONE = '02055500001';
const STAFF_PASSWORD = 'Staff@12345';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const WI_PHONE = '02088840066';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function wipe(): Promise<void> {
  const appts = await prisma.appointment.findMany({
    where: { OR: [{ customer: { phone: WI_PHONE } }, { customer: { phone: { startsWith: 'walkin-' } } }] },
    select: { id: true, customerId: true },
  });
  const ids = appts.map((a) => a.id);
  if (ids.length) {
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { OR: [{ phone: WI_PHONE }, { phone: { startsWith: 'walkin-' } }] },
  });
}

describe('walk-in creates a real appointment', () => {
  let app: Express;
  let adminToken: string;
  let staffToken: string;
  let staffProfileId: string;

  const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

  beforeAll(async () => {
    app = createApp();
    await wipe();

    adminToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;
    staffToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: STAFF_PHONE, password: STAFF_PASSWORD })
    ).body.data.tokens.accessToken;

    const list = await request(app)
      .get(`/api/v1/staff?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`)
      .set(...bearer(staffToken));
    staffProfileId = (list.body.data as Array<{ id: string }>)[0]!.id;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('runs the full walk-in lifecycle end to end', async () => {
    // 1) front desk issues a walk-in with an explicit staff
    const wi = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        customerName: 'WalkIn Flow QA',
        customerPhone: WI_PHONE,
        serviceId: SERVICE_ID,
        staffId: staffProfileId,
      });
    expect(wi.status).toBe(201);
    const appointmentId = wi.body.data.appointmentId as string;
    const ticketId = wi.body.data.ticket.id as string;
    expect(appointmentId).toBeTruthy();
    expect(wi.body.data.ticket).toMatchObject({ status: 'WAITING', branchId: BRANCH_ID });

    // 2) it shows on the staff's own "today" schedule, flagged as walk-in
    const sched = await request(app)
      .get(`/api/v1/staff-portal/schedule?date=${todayUtc()}`)
      .set(...bearer(staffToken));
    expect(sched.status).toBe(200);
    const mine = (sched.body.data.items as Array<{ id: string; isWalkIn: boolean; status: string }>).find(
      (a) => a.id === appointmentId,
    );
    expect(mine).toBeDefined();
    expect(mine?.isWalkIn).toBe(true);
    expect(mine?.status).toBe('CONFIRMED');

    // 3) staff starts → linked ticket mirrors to IN_SERVICE
    const start = await request(app)
      .patch(`/api/v1/staff-portal/appointments/${appointmentId}/status`)
      .set(...bearer(staffToken))
      .send({ status: 'IN_PROGRESS' });
    expect(start.status).toBe(200);

    const q1 = await request(app)
      .get(`/api/v1/queue?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    const t1 = (q1.body.data.items as Array<{ id: string; status: string; staffName: string | null }>).find(
      (x) => x.id === ticketId,
    );
    expect(t1?.status).toBe('IN_SERVICE');
    expect(t1?.staffName).toBeTruthy();

    // 4) staff completes → ticket COMPLETED + commission row
    const done = await request(app)
      .patch(`/api/v1/staff-portal/appointments/${appointmentId}/status`)
      .set(...bearer(staffToken))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);

    const commission = await prisma.staffCommission.findUnique({ where: { appointmentId } });
    expect(commission).not.toBeNull();
    expect(commission!.payoutAmount.toNumber()).toBeGreaterThan(0);

    const q2 = await request(app)
      .get(`/api/v1/queue?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    const t2 = (q2.body.data.items as Array<{ id: string; status: string }>).find(
      (x) => x.id === ticketId,
    );
    expect(t2?.status).toBe('COMPLETED');

    // 5) admin appointments list flags it as walk-in
    const adminList = await request(app)
      .get(`/api/v1/appointments?q=${WI_PHONE}&pageSize=50`)
      .set(...bearer(adminToken));
    const row = (adminList.body.data.items as Array<{ id: string; isWalkIn: boolean }>).find(
      (a) => a.id === appointmentId,
    );
    expect(row?.isWalkIn).toBe(true);
  });

  it('auto-assigns an eligible staff when none is given', async () => {
    const wi = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, customerName: 'WalkIn Auto QA', serviceId: SERVICE_ID });
    expect(wi.status).toBe(201);
    expect(wi.body.data.ticket.staffName).toBeTruthy();

    const appointmentId = wi.body.data.appointmentId as string;
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { staffProfileId: true, source: true },
    });
    expect(appt?.source).toBe('WALK_IN');
    expect(appt?.staffProfileId).toBe(staffProfileId); // seed staff 1 = ຄົນດຽວທີ່ຕັດຜົມ
  });
});
