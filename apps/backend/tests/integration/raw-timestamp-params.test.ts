import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tsParam } from '../../src/utils/dateHelpers.js';

/**
 * Regression — raw-SQL timestamp parameters.
 *
 * Our datetime columns are `timestamp without time zone` holding UTC instants,
 * but Prisma binds a JS `Date` in `$queryRaw` as `timestamptz`. Postgres
 * reconciles the two using the **session** timezone, so on a server initialised
 * with `TimeZone = 'Asia/Vientiane'` every raw date comparison silently landed
 * 7 hours off — no error, just wrong rows. That defeated `assertSlotFree`, i.e.
 * the double-booking guard let real clashes through.
 *
 * Two layers now protect against it, and this file tests both:
 * 1. `config/database.ts` pins every connection's session to UTC.
 * 2. {@link tsParam} binds the value as naive-UTC text and casts it, so each
 *    call site is correct **regardless** of the session timezone.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const PHONE = '02088820077';

describe('raw SQL timestamp parameters', () => {
  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { customer: { phone: PHONE } } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  it('pins the session timezone to UTC', async () => {
    const [row] = await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe('UTC');
  });

  it('binds a naive-UTC timestamp even when the session is not UTC', async () => {
    const d = new Date('2026-11-29T06:51:53.927Z');

    // Simulate the misconfigured server this bug came from. SET LOCAL is scoped
    // to the transaction, so it cannot leak into other tests.
    const [row] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = 'Asia/Vientiane'`);
      return tx.$queryRaw<{ good: Date; bad: Date }[]>`
        SELECT ${tsParam(d)} AS good, ${d}::timestamp AS bad
      `;
    });

    expect(row!.good.toISOString()).toBe(d.toISOString());
    // The unwrapped form is exactly 7 hours out — this is the bug, reproduced.
    expect(row!.bad.getTime() - d.getTime()).toBe(7 * 3_600_000);
  });

  it('matches a stored row that an unwrapped parameter would miss', async () => {
    const user = await prisma.user.create({
      data: { role: 'CUSTOMER', name: 'TZ QA', phone: PHONE, password: 'x' },
    });
    const staff = await prisma.staffService.findFirstOrThrow({ where: { serviceId: SERVICE_ID } });
    const startAt = new Date('2026-12-01T03:30:00.000Z');
    const appt = await prisma.appointment.create({
      data: {
        branchId: BRANCH_ID,
        customerId: user.id,
        staffProfileId: staff.staffProfileId,
        serviceId: SERVICE_ID,
        startAt,
        endAt: new Date('2026-12-01T04:15:00.000Z'),
        status: 'CONFIRMED',
        totalAmount: 100,
      },
    });

    const [withCast, withDate] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = 'Asia/Vientiane'`);
      return Promise.all([
        tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM appointments WHERE id = ${appt.id} AND "startAt" = ${tsParam(startAt)}
        `,
        tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM appointments WHERE id = ${appt.id} AND "startAt" = ${startAt}
        `,
      ]);
    });

    expect(withCast).toHaveLength(1);
    expect(withDate).toHaveLength(0);
  });

  it('rejects a genuinely overlapping booking through the slot engine', async () => {
    const app = createApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '02000000000', password: 'Admin@12345' });
    const token = login.body.data.tokens.accessToken as string;

    const customer = await prisma.user.findFirstOrThrow({ where: { phone: PHONE } });
    const existing = await prisma.appointment.findFirstOrThrow({
      where: { customerId: customer.id },
    });

    // Same staff, same instant → `assertSlotFree` must refuse it.
    const res = await request(app)
      .post('/api/v1/booking/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: existing.branchId,
        customerId: customer.id,
        serviceId: existing.serviceId,
        staffProfileId: existing.staffProfileId,
        startAt: existing.startAt.toISOString(),
      });

    expect(res.status).toBe(409);
  });
});
