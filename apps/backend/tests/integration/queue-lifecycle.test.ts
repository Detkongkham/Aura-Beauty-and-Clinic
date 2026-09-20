import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — queue ticket lifecycle (queue redesign 2026-09-17).
 *   call → recall → send back → no-show (appointment NO_SHOW) → restore (CONFIRMED)
 *   → VIP + note → illegal jump rejected → start (IN_PROGRESS, startedAt) → complete (COMPLETED)
 *   → GET /queue carries lifecycle fields + today summary.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const QA_PHONE = '02088840077';

async function wipe(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone: QA_PHONE }, select: { id: true } });
  if (!user) return;
  const appts = await prisma.appointment.findMany({ where: { customerId: user.id }, select: { id: true } });
  const ids = appts.map((a) => a.id);
  if (ids.length) {
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
}

describe('queue ticket lifecycle', () => {
  let app: Express;
  let token: string;
  let ticketId: string;
  let appointmentId: string;
  const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];
  const move = (body: Record<string, unknown>) =>
    request(app).patch(`/api/v1/queue/${ticketId}`).set(...auth()).send(body);
  const apptStatus = async () =>
    (await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { status: true } })).status;

  beforeAll(async () => {
    app = createApp();
    await wipe();
    token = (
      await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })
    ).body.data.tokens.accessToken;
    const res = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...auth())
      .send({ branchId: BRANCH_ID, customerName: 'Queue QA', customerPhone: QA_PHONE, serviceId: SERVICE_ID });
    expect(res.status).toBe(201);
    ticketId = res.body.data.ticket.id;
    appointmentId = res.body.data.appointmentId;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('walks a ticket through call, recall, no-show, restore, VIP, start and complete', async () => {
    const called = await move({ status: 'CALLED' });
    expect(called.status).toBe(200);
    expect(called.body.data).toMatchObject({ status: 'CALLED', callCount: 1, carriedOver: false });

    const recall = await request(app).post(`/api/v1/queue/${ticketId}/recall`).set(...auth());
    expect(recall.body.data.callCount).toBe(2);
    expect(await prisma.notificationLog.count({ where: { type: 'APPOINTMENT_QUEUE_CALLED', data: { path: ['ticketId'], equals: ticketId } } })).toBe(2);

    expect((await move({ status: 'WAITING' })).body.data.status).toBe('WAITING');

    await move({ status: 'CALLED' });
    const noShow = await move({ status: 'CANCELLED', reason: 'NO_SHOW' });
    expect(noShow.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'NO_SHOW' });
    expect(noShow.body.data.cancelledAt).not.toBeNull();
    expect(await apptStatus()).toBe('NO_SHOW');

    const restored = await move({ status: 'WAITING' });
    expect(restored.body.data).toMatchObject({ status: 'WAITING', cancelReason: null });
    expect(await apptStatus()).toBe('CONFIRMED');

    const vip = await request(app)
      .patch(`/api/v1/queue/${ticketId}/details`)
      .set(...auth())
      .send({ priority: 'VIP', note: 'sensitive skin' });
    expect(vip.body.data).toMatchObject({ priority: 'VIP', note: 'sensitive skin' });

    expect((await move({ status: 'COMPLETED' })).status).toBe(409);

    const started = await move({ status: 'IN_SERVICE' });
    expect(started.body.data.startedAt).not.toBeNull();
    expect(await apptStatus()).toBe('IN_PROGRESS');

    const done = await move({ status: 'COMPLETED' });
    expect(done.body.data.status).toBe('COMPLETED');
    expect(await apptStatus()).toBe('COMPLETED');

    const list = await request(app).get(`/api/v1/queue?branchId=${BRANCH_ID}`).set(...auth());
    expect(list.status).toBe(200);
    const mine = list.body.data.items.find((x: { id: string }) => x.id === ticketId);
    expect(mine).toMatchObject({ status: 'COMPLETED', priority: 'VIP', callCount: 3 });
    expect(list.body.data.summary.completedToday).toBeGreaterThanOrEqual(1);
    expect(list.body.data.summary.hourly).toHaveLength(24);
  });
});
