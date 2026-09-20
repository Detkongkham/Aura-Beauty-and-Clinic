import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reminderQueue } from '../../src/jobs/queues.js';

/**
 * Wave 11 — the /appointments admin console contract.
 *
 * Covers what the redesigned page actually depends on and what the old page got
 * wrong: rollups computed over the **whole** filtered set (not the first 200
 * rows the browser happened to fetch), the new list fields, the server-side
 * filters behind the quick-filter tiles, and the bulk status endpoint.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const CUSTOMER_PHONE = '02088820055';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface SummaryBody {
  total: number;
  sampled: number;
  truncated: boolean;
  byStatus: Record<string, number>;
  money: { expected: number; realized: number; outstanding: number; lost: number; avgTicket: number };
  ops: Record<string, number>;
  byStaff: { id: string; name: string; count: number; revenue: number }[];
  byDay: { date: string; count: number }[];
  byHour: { hour: number; count: number }[];
}

describe('admin appointments console', () => {
  let app: Express;
  let adminToken: string;
  let customerToken: string;
  const created: string[] = [];
  const addSpy = vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'test-job' } as never);

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    app = createApp();
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUSTOMER_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Console QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = reg.body.data.tokens.accessToken as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    // Two real bookings so the rollups have something of ours to count.
    for (const offset of [51, 52]) {
      const date = futureWorkingDate(offset);
      const avail = await request(app)
        .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
        .set(...bearer(customerToken));
      const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0];
      if (!slot) throw new Error(`no slot available for ${date}`);
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
      created.push(book.body.data.id as string);
    }
  });

  afterAll(async () => {
    addSpy.mockRestore();
    await prisma.appointment.deleteMany({ where: { customer: { phone: CUSTOMER_PHONE } } });
    await prisma.user.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.$disconnect();
  });

  it('serves the extra list fields the console renders', async () => {
    const res = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&pageSize=50`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const row = (res.body.data.items as Record<string, unknown>[]).find((a) => a.id === created[0]);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      source: 'ONLINE',
      hasCustomerNotes: false,
      hasStaffNotes: false,
      travelFee: 0,
      rating: null,
    });
    expect(row!.durationMin).toBeGreaterThan(0);
    expect(Array.isArray(row!.paymentMethods)).toBe(true);
    expect(typeof row!.depositRequired).toBe('number');
    expect(typeof row!.updatedAt).toBe('string');
  });

  it('sorts server-side and respects the order flag', async () => {
    const asc = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&sort=startAt&order=asc&pageSize=50`)
      .set(...bearer(adminToken));
    const desc = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&sort=startAt&order=desc&pageSize=50`)
      .set(...bearer(adminToken));
    const first = (b: typeof asc.body) => (b.data.items as { startAt: string }[])[0]!.startAt;
    expect(new Date(first(asc.body)).getTime()).toBeLessThanOrEqual(new Date(first(desc.body)).getTime());
  });

  it('finds an appointment by its synthesized code', async () => {
    const code = `A-${created[0]!.slice(0, 8).toUpperCase()}`;
    const res = await request(app)
      .get(`/api/v1/appointments?q=${code}&pageSize=10`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect((res.body.data.items as { id: string }[]).some((a) => a.id === created[0])).toBe(true);
  });

  it('rolls up the whole filtered set, not just one page', async () => {
    const summary = await request(app)
      .get(`/api/v1/appointments/summary?q=${CUSTOMER_PHONE}`)
      .set(...bearer(adminToken));
    expect(summary.status).toBe(200);
    const body = summary.body.data as SummaryBody;

    expect(body.total).toBe(created.length);
    expect(body.truncated).toBe(false);
    expect((body.byStatus.PENDING ?? 0) + (body.byStatus.CONFIRMED ?? 0)).toBeGreaterThan(0);
    expect(body.money.expected).toBeGreaterThan(0);
    expect(body.byHour).toHaveLength(24);
    expect(body.byDay.length).toBeGreaterThan(0);
    expect(body.byStaff.length).toBeGreaterThan(0);
    expect(body.ops.distinctCustomers).toBe(1);

    // The page's own list total must agree with the summary total.
    const list = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&pageSize=1`)
      .set(...bearer(adminToken));
    expect(list.body.data.total).toBe(body.total);
  });

  it('ignores the status filter when counting byStatus', async () => {
    const res = await request(app)
      .get(`/api/v1/appointments/summary?q=${CUSTOMER_PHONE}&status=COMPLETED`)
      .set(...bearer(adminToken));
    const body = res.body.data as SummaryBody;
    // Our bookings are not COMPLETED, but the rail must still show them so it
    // stays clickable while a status filter is on.
    expect(body.total).toBe(created.length);
  });

  it('filters by the quick-filter flags', async () => {
    const upcoming = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&flag=overdue&pageSize=50`)
      .set(...bearer(adminToken));
    expect(upcoming.status).toBe(200);
    // Both bookings are ~50 days out, so none can be overdue.
    expect((upcoming.body.data.items as { id: string }[]).some((a) => created.includes(a.id))).toBe(false);

    const unrated = await request(app)
      .get(`/api/v1/appointments?flag=unrated&pageSize=5`)
      .set(...bearer(adminToken));
    expect(unrated.status).toBe(200);
    expect((unrated.body.data.items as { status: string }[]).every((a) => a.status === 'COMPLETED')).toBe(true);
  });

  it('filters by payment state', async () => {
    const res = await request(app)
      .get(`/api/v1/appointments?payment=paid&pageSize=10`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(
      (res.body.data.items as { paymentStatus: string | null }[]).every((a) => a.paymentStatus === 'FULLY_PAID'),
    ).toBe(true);
  });

  it('moves several appointments at once', async () => {
    const res = await request(app)
      .post('/api/v1/appointments/bulk-status')
      .set(...bearer(adminToken))
      .send({ ids: created, status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toHaveLength(created.length);
    expect(res.body.data.failed).toHaveLength(0);

    const after = await request(app)
      .get(`/api/v1/appointments?q=${CUSTOMER_PHONE}&pageSize=50`)
      .set(...bearer(adminToken));
    expect(
      (after.body.data.items as { id: string; status: string }[])
        .filter((a) => created.includes(a.id))
        .every((a) => a.status === 'CONFIRMED'),
    ).toBe(true);
  });

  it('reports unknown ids in a bulk move instead of failing the batch', async () => {
    const res = await request(app)
      .post('/api/v1/appointments/bulk-status')
      .set(...bearer(adminToken))
      .send({ ids: [created[0]!, '00000000-0000-0000-0000-0000000000ff'], status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toEqual([created[0]]);
    expect(res.body.data.failed).toHaveLength(1);
  });

  it('keeps the summary behind the same role guard as the list', async () => {
    const res = await request(app)
      .get('/api/v1/appointments/summary')
      .set(...bearer(customerToken));
    expect(res.status).toBe(403);
  });
});

describe('admin appointments — conflicts, audit timeline, reschedule', () => {
  let app: Express;
  let adminToken: string;
  let customerToken: string;
  let staffProfileId: string;
  const ids: string[] = [];
  const PHONE = '02088820066';
  const addSpy = vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'test-job' } as never);

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    app = createApp();
    await prisma.appointment.deleteMany({ where: { customer: { phone: PHONE } } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Clash QA', phone: PHONE, password: 'Passw0rd!' });
    customerToken = reg.body.data.tokens.accessToken as string;
    const customerId = reg.body.data.user.id as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const date = futureWorkingDate(61);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...bearer(customerToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;
    staffProfileId = slot.staffProfileId;

    const book = await request(app)
      .post('/api/v1/booking/appointments')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, customerId, serviceId: SERVICE_ID, staffProfileId, startAt: slot.startAt });
    expect(book.status).toBe(201);
    ids.push(book.body.data.id as string);

    // A deliberate double-booking, written straight to the DB so it bypasses the
    // slot engine — exactly the state the console has to be able to surface.
    const first = await prisma.appointment.findUniqueOrThrow({ where: { id: ids[0]! } });
    const clash = await prisma.appointment.create({
      data: {
        branchId: first.branchId,
        customerId: first.customerId,
        staffProfileId: first.staffProfileId,
        serviceId: first.serviceId,
        startAt: first.startAt,
        endAt: first.endAt,
        status: 'CONFIRMED',
        totalAmount: first.totalAmount,
      },
    });
    ids.push(clash.id);
  });

  afterAll(async () => {
    addSpy.mockRestore();
    await prisma.appointment.deleteMany({ where: { customer: { phone: PHONE } } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  it('flags a double-booked appointment on the list row', async () => {
    const res = await request(app)
      .get(`/api/v1/appointments?q=${PHONE}&pageSize=50`)
      .set(...bearer(adminToken));
    const rows = res.body.data.items as { id: string; hasConflict: boolean }[];
    expect(rows.filter((r) => ids.includes(r.id)).every((r) => r.hasConflict)).toBe(true);
  });

  it('filters down to conflicts and counts them in the summary', async () => {
    const list = await request(app)
      .get(`/api/v1/appointments?q=${PHONE}&flag=conflict&pageSize=50`)
      .set(...bearer(adminToken));
    expect(list.status).toBe(200);
    const found = (list.body.data.items as { id: string }[]).map((r) => r.id);
    expect(found).toEqual(expect.arrayContaining(ids));

    const summary = await request(app)
      .get(`/api/v1/appointments/summary?q=${PHONE}`)
      .set(...bearer(adminToken));
    expect((summary.body.data as SummaryBody).ops.conflicts).toBeGreaterThanOrEqual(2);
  });

  it('names the other side of the clash on the detail view', async () => {
    const res = await request(app)
      .get(`/api/v1/appointments/${ids[0]}`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const conflicts = res.body.data.conflicts as { id: string; reason: string; code: string }[];
    expect(conflicts.some((c) => c.id === ids[1])).toBe(true);
    expect(conflicts[0]!.reason).toBe('staff');
    expect(conflicts[0]!.code).toMatch(/^A-/);
  });

  it('builds the timeline from real audit rows, naming who acted', async () => {
    await request(app)
      .patch(`/api/v1/appointments/${ids[0]}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'CONFIRMED' });

    const res = await request(app)
      .get(`/api/v1/appointments/${ids[0]}`)
      .set(...bearer(adminToken));
    const timeline = res.body.data.timeline as { label: string; by: string; audited: boolean }[];

    expect(timeline[0]!.label).toBe('BOOKED');
    const confirmed = timeline.find((e) => e.label === 'CONFIRMED');
    expect(confirmed).toBeDefined();
    expect(confirmed!.audited).toBe(true);
    // The acting admin, not "system" — the whole point of reading AuditLog.
    expect(confirmed!.by).not.toBe('system');
  });

  it('refuses an admin reschedule onto an occupied slot, and honours force', async () => {
    const first = await prisma.appointment.findUniqueOrThrow({ where: { id: ids[0]! } });
    const target = new Date(first.startAt.getTime() + 24 * 3_600_000).toISOString();

    // Park a blocker on the target slot.
    const blocker = await prisma.appointment.create({
      data: {
        branchId: first.branchId,
        customerId: first.customerId,
        staffProfileId: first.staffProfileId,
        serviceId: first.serviceId,
        startAt: new Date(target),
        endAt: new Date(new Date(target).getTime() + 45 * 60_000),
        status: 'CONFIRMED',
        totalAmount: first.totalAmount,
      },
    });
    ids.push(blocker.id);

    const blocked = await request(app)
      .patch(`/api/v1/appointments/${ids[0]}/reschedule`)
      .set(...bearer(adminToken))
      .send({ startAt: target });
    expect(blocked.status).toBe(409);

    const forced = await request(app)
      .patch(`/api/v1/appointments/${ids[0]}/reschedule`)
      .set(...bearer(adminToken))
      .send({ startAt: target, force: true });
    expect(forced.status).toBe(200);
    expect(new Date(forced.body.data.startAt).toISOString()).toBe(target);
    // Status survives an admin reschedule (unlike the customer-side flow).
    expect(forced.body.data.status).toBe('CONFIRMED');
    expect((forced.body.data.conflicts as unknown[]).length).toBeGreaterThan(0);
  });

  it('will not reschedule a closed appointment', async () => {
    await prisma.appointment.update({ where: { id: ids[1]! }, data: { status: 'COMPLETED' } });
    const res = await request(app)
      .patch(`/api/v1/appointments/${ids[1]}/reschedule`)
      .set(...bearer(adminToken))
      .send({ startAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(res.status).toBe(400);
  });

  it('keeps admin booking-on-behalf behind a role guard', async () => {
    const res = await request(app)
      .post('/api/v1/booking/appointments')
      .set(...bearer(customerToken))
      .send({ branchId: BRANCH_ID, customerId: 'x', serviceId: SERVICE_ID, startAt: new Date().toISOString() });
    expect(res.status).toBe(403);
  });
});
