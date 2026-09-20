import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reminderQueue } from '../../src/jobs/queues.js';

/**
 * Integration — cross-app E2E (Phase 3 verification):
 *   ລູກຄ້າຈອງຜ່ານ Customer App endpoint  →  ນັດໝາຍ persist + reminder job enqueue
 *   →  Web Admin ເຫັນທັນທີໃນ GET /appointments + /appointments/calendar
 *   →  admin ປ່ຽນສະຖານະໄດ້ ; customer role ຖືກ 403.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (branch/service/staff/working-hours/admin).
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001'; // ຕັດຜົມ + ສະຜົມ (45 ນາທີ)
const CUSTOMER_PHONE = '02088820044';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('cross-app: mobile booking → web-admin appointments', () => {
  let app: Express;
  let customerToken: string;
  let adminToken: string;
  let appointmentId: string;
  const addSpy = vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'test-job' } as never);

  beforeAll(async () => {
    app = createApp();
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUSTOMER_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Cross App QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = reg.body.data.tokens.accessToken as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    addSpy.mockRestore();
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUSTOMER_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.$disconnect();
  });

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  it('books on mobile and the appointment shows up on the admin side', async () => {
    // 1) customer picks a slot + books via the Customer App endpoint
    const date = futureWorkingDate(44);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...bearer(customerToken));
    expect(avail.status).toBe(200);
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0];
    if (!slot) throw new Error('no slot available for test date');

    addSpy.mockClear();
    const book = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(customerToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        staffProfileId: slot.staffProfileId,
        startAt: slot.startAt,
      });
    expect(book.status).toBe(201);
    appointmentId = book.body.data.id as string;

    // 2) reminder job enqueued (24h / 1h — Module 23)
    expect(addSpy).toHaveBeenCalledWith('schedule', { appointmentId });

    // 3) admin list — the fresh appointment is there, searchable by phone
    const list = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&pageSize=50`)
      .set(...bearer(adminToken));
    expect(list.status).toBe(200);
    const found = (list.body.data.items as Array<{ id: string; customerPhone: string; code: string }>).find(
      (a) => a.id === appointmentId,
    );
    expect(found).toBeDefined();
    expect(found?.customerPhone).toBe(CUSTOMER_PHONE);
    expect(found?.code).toMatch(/^A-/);

    // 3b) staffId filter (param name matches web-admin + AdminAppointmentListItem.staffId)
    const byStaff = await request(app)
      .get(`/api/v1/appointments?staffId=${slot.staffProfileId}&pageSize=50`)
      .set(...bearer(adminToken));
    expect(byStaff.status).toBe(200);
    const staffItems = byStaff.body.data.items as Array<{ id: string; staffId: string }>;
    expect(staffItems.some((a) => a.id === appointmentId)).toBe(true);
    expect(staffItems.every((a) => a.staffId === slot.staffProfileId)).toBe(true);

    // 4) admin calendar — same window contains it
    const cal = await request(app)
      .get(`/api/v1/appointments/calendar?from=${date}T00:00:00.000Z&to=${date}T23:59:59.999Z`)
      .set(...bearer(adminToken));
    expect(cal.status).toBe(200);
    expect((cal.body.data.items as Array<{ id: string }>).some((a) => a.id === appointmentId)).toBe(true);

    // 5) admin detail — timeline seeded with BOOKED
    const detail = await request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set(...bearer(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.timeline[0].label).toBe('BOOKED');

    // 6) admin changes status
    const patch = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'CONFIRMED' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.status).toBe('CONFIRMED');
  });

  it('rejects a non-admin (CUSTOMER) hitting the admin list', async () => {
    const res = await request(app)
      .get('/api/v1/appointments')
      .set(...bearer(customerToken));
    expect(res.status).toBe(403);
  });
});
