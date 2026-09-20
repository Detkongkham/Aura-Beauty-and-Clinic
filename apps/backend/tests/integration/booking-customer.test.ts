import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — E2E loop ຂອງ Customer Mobile App (Phase 3):
 *   availability → book → my appointments → reschedule → cancel → review.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (branch/service/staff/working-hours).
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001'; // ຕັດຜົມ + ສະຜົມ (45 ນາທີ)
const PHONE = '02088820001';

/** ວັນທີໃນອະນາຄົດ (UTC) ທີ່ບໍ່ແມ່ນວັນອາທິດ (ຊ່າງ seed ພັກວັນອາທິດ). */
function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('customer booking flow', () => {
  let app: Express;
  let token: string;
  let customerId: string;
  let appointmentId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.review.deleteMany({ where: { user: { phone: PHONE } } });
    await prisma.appointment.deleteMany({ where: { customer: { phone: PHONE } } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Booking QA', phone: PHONE, password: 'Passw0rd!' });
    token = reg.body.data.tokens.accessToken as string;
    customerId = reg.body.data.user.id as string;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { user: { phone: PHONE } } });
    await prisma.appointment.deleteMany({ where: { customer: { phone: PHONE } } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

  it('ຈອງ → ເລື່ອນ → ຍົກເລີກ → ຣີວິວ', async () => {
    // 1) availability
    const date = futureWorkingDate(40);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...auth());
    expect(avail.status).toBe(200);
    const slots = avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>;
    expect(slots.length).toBeGreaterThan(2);

    // 2) book the first slot as myself
    const first = slots[0]!;
    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: first.staffProfileId, startAt: first.startAt });
    expect(booked.status).toBe(201);
    appointmentId = booked.body.data.id as string;

    // 3) double-booking the same slot is rejected
    const dup = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth())
      .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: first.staffProfileId, startAt: first.startAt });
    expect(dup.status).toBe(409);

    // 4) shows up in my upcoming list
    const mine = await request(app)
      .get('/api/v1/booking/appointments/me?scope=upcoming')
      .set(...auth());
    expect(mine.status).toBe(200);
    const row = mine.body.data.items.find((a: { id: string }) => a.id === appointmentId);
    expect(row).toBeTruthy();
    expect(row.canCancel).toBe(true);
    expect(row.serviceName).toBeTruthy();
    expect(row.staffName).toBeTruthy();

    // 5) reschedule to a later free slot with the same staff
    const other = slots.find(
      (s) => s.staffProfileId === first.staffProfileId && s.startAt !== first.startAt,
    );
    expect(other).toBeTruthy();
    const moved = await request(app)
      .patch(`/api/v1/booking/appointments/${appointmentId}/reschedule`)
      .set(...auth())
      .send({ startAt: other!.startAt });
    expect(moved.status).toBe(200);
    expect(moved.body.data.startAt).toBe(new Date(other!.startAt).toISOString());

    // 6) cancel
    const cancelled = await request(app)
      .patch(`/api/v1/booking/appointments/${appointmentId}/cancel`)
      .set(...auth())
      .send({ reason: 'ຕິດວຽກ' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    // cancelling again is rejected
    const cancelAgain = await request(app)
      .patch(`/api/v1/booking/appointments/${appointmentId}/cancel`)
      .set(...auth())
      .send({});
    expect(cancelAgain.status).toBe(400);

    // 7) review after the visit is marked completed
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED' },
    });
    const review = await request(app)
      .post(`/api/v1/booking/appointments/${appointmentId}/review`)
      .set(...auth())
      .send({ rating: 5, comment: 'ດີຫຼາຍ' });
    expect(review.status).toBe(201);
    expect(review.body.data.rating).toBe(5);

    const detail = await request(app)
      .get(`/api/v1/booking/appointments/${appointmentId}`)
      .set(...auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data.review.rating).toBe(5);
    expect(detail.body.data.canReview).toBe(false);
    // field ເສີມສຳລັບໜ້າລາຍລະອຽດ (mobile redesign 2026-09-17)
    expect(typeof detail.body.data.branchAddress).toBe('string');
    expect(typeof detail.body.data.branchPhone).toBe('string');
    expect(typeof detail.body.data.staffTitle).toBe('string');
    expect(typeof detail.body.data.staffRating).toBe('number');
    expect(typeof detail.body.data.staffTotalReviews).toBe('number');
    expect(detail.body.data.travelFee).toBe(0);
    expect(detail.body.data).toHaveProperty('payment');
    expect(detail.body.data).toHaveProperty('roomName');
    expect(detail.body.data.updatedAt).toEqual(expect.any(String));

    const list = await request(app)
      .get('/api/v1/booking/appointments/me?scope=history')
      .set(...auth());
    const listRow = (list.body.data.items as Array<Record<string, unknown>>).find((i) => i.id === appointmentId);
    expect(listRow).toMatchObject({ staffTitle: expect.any(String), staffRating: expect.any(Number) });
    expect(listRow).toHaveProperty('serviceImageUrl');
  });

  it('ນະໂຍບາຍຍົກເລີກ: GET /policy + ບັງຄັບ cancellationWindowHours ຈາກ Settings', async () => {
    const original = await prisma.appSetting.findUnique({ where: { key: 'app' } });
    const setWindow = async (hours: number): Promise<void> => {
      const base = (original?.value as Record<string, unknown> | undefined) ?? {};
      const value = { ...base, cancellationWindowHours: hours };
      await prisma.appSetting.upsert({
        where: { key: 'app' },
        create: { key: 'app', value },
        update: { value },
      });
    };

    try {
      // window ໃຫຍ່ກວ່າໄລຍະເຖິງນັດ (ນັດອີກ ~41 ມື້) → ກາຍກຳນົດແລ້ວ
      await setWindow(24 * 60);
      const policy = await request(app).get('/api/v1/booking/policy').set(...auth());
      expect(policy.status).toBe(200);
      expect(policy.body.data.cancellationWindowHours).toBe(24 * 60);

      const date = futureWorkingDate(41);
      const avail = await request(app)
        .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
        .set(...auth());
      const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;
      const booked = await request(app)
        .post('/api/v1/booking/appointments/me')
        .set(...auth())
        .send({ branchId: BRANCH_ID, serviceId: SERVICE_ID, staffProfileId: slot.staffProfileId, startAt: slot.startAt });
      expect(booked.status).toBe(201);
      const id = booked.body.data.id as string;

      const detail = await request(app).get(`/api/v1/booking/appointments/${id}`).set(...auth());
      expect(detail.body.data.canCancel).toBe(false);
      expect(detail.body.data.canReschedule).toBe(false);
      expect(new Date(detail.body.data.cancelDeadline).getTime()).toBe(
        new Date(slot.startAt).getTime() - 24 * 60 * 3_600_000,
      );

      const late = await request(app)
        .patch(`/api/v1/booking/appointments/${id}/cancel`)
        .set(...auth())
        .send({});
      expect(late.status).toBe(400);
      expect(late.body.error.code).toBe('CANCEL_WINDOW_PASSED');

      const lateMove = await request(app)
        .patch(`/api/v1/booking/appointments/${id}/reschedule`)
        .set(...auth())
        .send({ startAt: slot.startAt });
      expect(lateMove.status).toBe(400);
      expect(lateMove.body.error.code).toBe('CANCEL_WINDOW_PASSED');

      // window ນ້ອຍ → ຍົກເລີກໄດ້
      await setWindow(4);
      const ok = await request(app)
        .patch(`/api/v1/booking/appointments/${id}/cancel`)
        .set(...auth())
        .send({});
      expect(ok.status).toBe(200);
    } finally {
      if (original) {
        await prisma.appSetting.update({ where: { key: 'app' }, data: { value: original.value as never } });
      } else {
        await prisma.appSetting.deleteMany({ where: { key: 'app' } });
      }
    }
  });

  it('GET /catalog/branches/:id — ຂໍ້ມູນສາຂາສຳລັບແອັບ', async () => {
    const res = await request(app).get(`/api/v1/catalog/branches/${BRANCH_ID}`).set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: BRANCH_ID,
      name: expect.any(String),
      address: expect.any(String),
      phone: expect.any(String),
      openTime: expect.any(String),
      closeTime: expect.any(String),
    });
    const list = await request(app).get('/api/v1/catalog/branches').set(...auth());
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((b) => b.id === BRANCH_ID)).toBe(true);

    const missing = await request(app)
      .get('/api/v1/catalog/branches/00000000-0000-0000-0000-000000000000')
      .set(...auth());
    expect(missing.status).toBe(404);
  });

  it('ຫ້າມເບິ່ງນັດໝາຍຂອງຄົນອື່ນ', async () => {
    const someoneElse = await prisma.appointment.findFirst({
      where: { customerId: { not: customerId }, deletedAt: null },
      select: { id: true },
    });
    if (!someoneElse) return; // ບໍ່ມີຂໍ້ມູນອື່ນ — ຂ້າມ
    const res = await request(app)
      .get(`/api/v1/booking/appointments/${someoneElse.id}`)
      .set(...auth());
    expect(res.status).toBe(404);
  });
});
