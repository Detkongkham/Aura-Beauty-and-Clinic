import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Web Admin ▸ staff-directory / queue / services CRUD / settings /
 * notification-templates / audit-logs. Seeded admin 02000000000 / Admin@12345.
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';

describe('web-admin misc modules', () => {
  let app: Express;
  let token: string;
  let branchId: string;
  let categoryId: string;
  let createdServiceId: string;

  beforeAll(async () => {
    app = createApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    token = login.body.data.tokens.accessToken as string;
    const branches = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${token}`);
    branchId = branches.body.data.items[0].id as string;
  });

  afterAll(async () => {
    if (createdServiceId) {
      await prisma.serviceConsumable.deleteMany({ where: { serviceId: createdServiceId } });
      await prisma.service.deleteMany({ where: { id: createdServiceId } });
    }
    await prisma.$disconnect();
  });

  const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

  it('staff directory: ?page= ໃຫ້ admin shape, ບໍ່ມີ page ໃຫ້ array', async () => {
    const paged = await request(app).get('/api/v1/staff?page=1&pageSize=5').set(...auth());
    expect(paged.status).toBe(200);
    expect(paged.body.data).toMatchObject({ page: 1, pageSize: 5 });
    if (paged.body.data.items.length > 0) {
      const s = paged.body.data.items[0];
      expect(s).toHaveProperty('workingHours');
      expect(s).toHaveProperty('jobTitle');
      expect(s).toHaveProperty('commissionRate');
    }
    const arr = await request(app).get('/api/v1/staff').set(...auth());
    expect(Array.isArray(arr.body.data)).toBe(true);
  });

  it('staff time-off list is reachable', async () => {
    const res = await request(app).get('/api/v1/staff/time-off').set(...auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('queue: list + walk-in issues a ticket + advance', async () => {
    const list = await request(app).get(`/api/v1/queue?branchId=${branchId}`).set(...auth());
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data.items)).toBe(true);

    // ໃຊ້ບໍລິການທີ່ຊ່າງ seed ໃຫ້ບໍລິການໄດ້ (ຕັດຜົມ) → walk-in ຈັດຊ່າງໃຫ້ອັດຕະໂນມັດ.
    const serviceId = '33333333-0000-0000-0000-000000000001';

    const walkIn = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...auth())
      .send({ branchId, customerName: 'Walk QA', serviceId });
    expect(walkIn.status).toBe(201);
    const ticket = walkIn.body.data.ticket;
    const appointmentId = walkIn.body.data.appointmentId as string;
    expect(ticket).toMatchObject({ status: 'WAITING', branchId });
    expect(ticket.number).toMatch(/^A\d{3}$/);
    expect(appointmentId).toBeTruthy();
    expect(ticket.staffName).toBeTruthy(); // ຊ່າງທີ່ຈັດໃຫ້ auto

    const advance = await request(app)
      .patch(`/api/v1/queue/${ticket.id}`)
      .set(...auth())
      .send({ status: 'CALLED' });
    expect(advance.status).toBe(200);
    expect(advance.body.data.status).toBe('CALLED');
    expect(advance.body.data.calledAt).not.toBeNull();

    // cleanup: ticket → appointment → guest user
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { customerId: true },
    });
    await prisma.queueTicket.deleteMany({ where: { id: ticket.id } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    if (appt) await prisma.user.deleteMany({ where: { id: appt.customerId } });
  });

  it('services CRUD + stats + categories', async () => {
    const cats = await request(app).get('/api/v1/service-categories').set(...auth());
    expect(cats.status).toBe(200);
    categoryId = cats.body.data.items[0].id as string;
    expect(cats.body.data.items[0]).toHaveProperty('sortOrder');

    const create = await request(app)
      .post('/api/v1/services')
      .set(...auth())
      .send({ categoryId, name: 'QA Facial', price: 250000, durationMinutes: 60 });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ currency: 'LAK', name: 'QA Facial', consumables: [] });
    createdServiceId = create.body.data.id as string;

    const patch = await request(app)
      .patch(`/api/v1/services/${createdServiceId}`)
      .set(...auth())
      .send({ price: 300000, isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data.price).toBe(300000);

    const stats = await request(app).get('/api/v1/services/stats').set(...auth());
    expect(stats.status).toBe(200);
    expect(typeof stats.body.data.total).toBe('number');
    expect(Array.isArray(stats.body.data.byCategory)).toBe(true);

    const del = await request(app).delete(`/api/v1/services/${createdServiceId}`).set(...auth());
    expect(del.status).toBe(204);
  });

  it('settings GET/PUT round-trips', async () => {
    const get = await request(app).get('/api/v1/settings').set(...auth());
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveProperty('bookingLeadHours');

    const put = await request(app)
      .put('/api/v1/settings')
      .set(...auth())
      .send({ bookingLeadHours: 5, ignoredKey: 'x' });
    expect(put.status).toBe(200);
    expect(put.body.data.bookingLeadHours).toBe(5);

    await request(app).put('/api/v1/settings').set(...auth()).send({ bookingLeadHours: 2 });
  });

  it('notification templates list + update', async () => {
    const list = await request(app).get('/api/v1/notification-templates').set(...auth());
    expect(list.status).toBe(200);
    const key = list.body.data.items[0].key as string;
    const put = await request(app)
      .put(`/api/v1/notification-templates/${key}`)
      .set(...auth())
      .send({ enabled: false });
    expect(put.status).toBe(200);
    expect(put.body.data.enabled).toBe(false);
    await request(app).put(`/api/v1/notification-templates/${key}`).set(...auth()).send({ enabled: true });
  });

  it('audit-logs returns paginated shape with facets', async () => {
    const res = await request(app).get('/api/v1/audit-logs?pageSize=10').set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, pageSize: 10 });
    expect(res.body.data.facets).toHaveProperty('categories');
    expect(res.body.data.facets).toHaveProperty('totalAll');
  });

  it('reports/end-of-day returns totals', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/reports/end-of-day?date=${date}&branchId=all`)
      .set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toHaveProperty('revenue');
    expect(Array.isArray(res.body.data.topServices)).toBe(true);
  });
});
