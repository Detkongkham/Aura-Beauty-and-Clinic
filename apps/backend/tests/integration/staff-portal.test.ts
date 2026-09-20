import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reminderQueue } from '../../src/jobs/queues.js';

/**
 * Integration — Staff Mobile Portal (Phase 4 / Module 06):
 *   ລູກຄ້າຈອງ → ຊ່າງເຫັນຄິວໃນ schedule → ເລີ່ມ/ສຳເລັດ ບໍລິການ → ຄ່າຄອມມິດຊັນ persist
 *   → GPS check-in ນອກລັດສະໝີ 400 / ໃນລັດສະໝີ 201 → check-out
 *   → Treatment record + ຮູບ Before → CUSTOMER role ຖືກ 403.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001'; // ຕັດຜົມ + ສະຜົມ
const BRANCH_LAT = 17.9757;
const BRANCH_LNG = 102.6331;
const STAFF_PHONE = '02055500001';
const STAFF_PASSWORD = 'Staff@12345';
const CUSTOMER_PHONE = '02088830055';

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function wipe(): Promise<void> {
  const appts = await prisma.appointment.findMany({
    where: { customer: { phone: CUSTOMER_PHONE } },
    select: { id: true },
  });
  const ids = appts.map((a) => a.id);
  if (ids.length) {
    await prisma.treatmentPhoto.deleteMany({
      where: { treatmentRecord: { appointmentId: { in: ids } } },
    });
    await prisma.treatmentRecord.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });
  await prisma.staffAttendance.deleteMany({
    where: { staffProfile: { user: { phone: STAFF_PHONE } } },
  });
}

describe('staff mobile portal', () => {
  let app: Express;
  let staffToken: string;
  let customerToken: string;
  let appointmentId: string;
  let apptDate: string;
  const addSpy = vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'test-job' } as never);

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Staff Portal QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = reg.body.data.tokens.accessToken as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: STAFF_PHONE, password: STAFF_PASSWORD });
    staffToken = login.body.data.tokens.accessToken as string;

    // ຊ່າງທີ່ໃຫ້ບໍລິການ SERVICE_ID ຢູ່ສາຂານີ້
    const staffList = await request(app)
      .get(`/api/v1/staff?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`)
      .set(...bearer(customerToken));
    const staffProfileId = (staffList.body.data as Array<{ id: string }>)[0]!.id;

    // ລູກຄ້າຈອງຄິວກັບຊ່າງຄົນນັ້ນ
    apptDate = futureWorkingDate(40);
    const avail = await request(app)
      .get(
        `/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${apptDate}&staffProfileId=${staffProfileId}`,
      )
      .set(...bearer(customerToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0];
    if (!slot) throw new Error('no slot for staff-portal test');

    const book = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(customerToken))
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId, startAt: slot.startAt });
    expect(book.status).toBe(201);
    appointmentId = book.body.data.id as string;
  });

  afterAll(async () => {
    addSpy.mockRestore();
    await wipe();
    await prisma.$disconnect();
  });

  it('shows the booked appointment in the staff daily schedule', async () => {
    const res = await request(app)
      .get(`/api/v1/staff-portal/schedule?date=${apptDate}`)
      .set(...bearer(staffToken));
    expect(res.status).toBe(200);
    const item = (res.body.data.items as Array<{ id: string; code: string }>).find(
      (a) => a.id === appointmentId,
    );
    expect(item).toBeDefined();
    expect(item?.code).toMatch(/^A-/);
  });

  it('lets the staff start then complete, and records commission', async () => {
    const start = await request(app)
      .patch(`/api/v1/staff-portal/appointments/${appointmentId}/status`)
      .set(...bearer(staffToken))
      .send({ status: 'IN_PROGRESS' });
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('IN_PROGRESS');

    // ຂ້າມຂັ້ນ (IN_PROGRESS → IN_PROGRESS) ບໍ່ໄດ້
    const bad = await request(app)
      .patch(`/api/v1/staff-portal/appointments/${appointmentId}/status`)
      .set(...bearer(staffToken))
      .send({ status: 'IN_PROGRESS' });
    expect(bad.status).toBe(409);

    const done = await request(app)
      .patch(`/api/v1/staff-portal/appointments/${appointmentId}/status`)
      .set(...bearer(staffToken))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('COMPLETED');

    const commission = await prisma.staffCommission.findUnique({ where: { appointmentId } });
    expect(commission).not.toBeNull();
    expect(commission!.payoutAmount.toNumber()).toBeGreaterThan(0);

    const month = apptDate.slice(0, 7);
    const summary = await request(app)
      .get(`/api/v1/staff-portal/commission?month=${month}`)
      .set(...bearer(staffToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.appointmentsCompleted).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.totalPayout).toBeGreaterThan(0);
    expect(summary.body.data.services.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces the branch geofence on GPS attendance', async () => {
    const far = await request(app)
      .post('/api/v1/staff-portal/attendance/check-in')
      .set(...bearer(staffToken))
      .send({ latitude: 18.5, longitude: 103.5 });
    expect(far.status).toBe(400);

    const near = await request(app)
      .post('/api/v1/staff-portal/attendance/check-in')
      .set(...bearer(staffToken))
      .send({ latitude: BRANCH_LAT, longitude: BRANCH_LNG });
    expect(near.status).toBe(201);
    expect(near.body.data.checkOut).toBeNull();

    const dup = await request(app)
      .post('/api/v1/staff-portal/attendance/check-in')
      .set(...bearer(staffToken))
      .send({ latitude: BRANCH_LAT, longitude: BRANCH_LNG });
    expect(dup.status).toBe(409);

    const state = await request(app)
      .get('/api/v1/staff-portal/attendance')
      .set(...bearer(staffToken));
    expect(state.status).toBe(200);
    expect(state.body.data.today).not.toBeNull();
    expect(state.body.data.branch.radiusMeters).toBeGreaterThan(0);

    const out = await request(app)
      .post('/api/v1/staff-portal/attendance/check-out')
      .set(...bearer(staffToken))
      .send({ latitude: BRANCH_LAT, longitude: BRANCH_LNG });
    expect(out.status).toBe(200);
    expect(out.body.data.checkOut).not.toBeNull();
    expect(out.body.data.workedMinutes).toBeGreaterThanOrEqual(0);
  });

  it('stores a treatment record and a Before photo', async () => {
    const put = await request(app)
      .put(`/api/v1/staff-portal/appointments/${appointmentId}/treatment`)
      .set(...bearer(staffToken))
      .send({ medicalNotes: 'ຜິວແຫ້ງເລັກນ້ອຍ, ແນະນຳບຳລຸງຄວາມຊຸ່ມ' });
    expect(put.status).toBe(200);
    expect(put.body.data.id).toBeTruthy();

    const photo = await request(app)
      .post(`/api/v1/staff-portal/appointments/${appointmentId}/treatment/photos`)
      .set(...bearer(staffToken))
      .send({ type: 'BEFORE', contentType: 'image/png', dataBase64: TINY_PNG });
    expect(photo.status).toBe(201);
    expect(photo.body.data.photoUrl).toContain('/uploads/treatments/');

    const get = await request(app)
      .get(`/api/v1/staff-portal/appointments/${appointmentId}/treatment`)
      .set(...bearer(staffToken));
    expect(get.status).toBe(200);
    expect(get.body.data.photos).toHaveLength(1);
    expect(get.body.data.photos[0].type).toBe('BEFORE');
  });

  it('rejects a non-staff (CUSTOMER) hitting the staff portal', async () => {
    const res = await request(app)
      .get(`/api/v1/staff-portal/schedule?date=${apptDate}`)
      .set(...bearer(customerToken));
    expect(res.status).toBe(403);
  });
});
