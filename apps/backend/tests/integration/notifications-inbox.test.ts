import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { notifyUser } from '../../src/services/push.js';

/**
 * Integration — admin notification inbox: severity/data persistence, triage actions
 * (read/unread/resolve/reopen/delete), bulk + read-all, unread badge count, summary.
 * Only touches rows tagged with TEST_TYPE_PREFIX, so the admin's other notifications survive.
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const PREFIX = 'TEST_INBOX_';

describe('notifications inbox', () => {
  let app: Express;
  let token: string;
  let adminId: string;
  const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

  async function wipe(): Promise<void> {
    await prisma.notificationLog.deleteMany({ where: { type: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    app = createApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    token = login.body.data.tokens.accessToken as string;
    adminId = login.body.data.user.id as string;
    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('persists inferred severity + data payload and exposes them in the list', async () => {
    await notifyUser({
      userId: adminId,
      type: `${PREFIX}STOCK_RECONCILIATION_MISMATCH`,
      title: 'recon',
      body: 'line 1\nline 2',
      data: { mismatchCount: 3 },
    });
    await notifyUser({
      userId: adminId,
      type: `${PREFIX}APPOINTMENT_REMINDER`,
      title: 'reminder',
      body: 'soon',
      data: { appointmentId: 'abc' },
      severity: 'warning',
    });

    const res = await request(app).get('/api/v1/notifications?limit=500').set(...auth());
    expect(res.status).toBe(200);
    const mine = (res.body.data.items as { type: string }[]).filter((n) => n.type.startsWith(PREFIX));
    const recon = mine.find((n) => n.type.endsWith('MISMATCH')) as Record<string, unknown>;
    const reminder = mine.find((n) => n.type.endsWith('REMINDER')) as Record<string, unknown>;
    expect(recon).toMatchObject({
      severity: 'critical',
      category: 'inventory',
      module: 'inventory',
      data: { mismatchCount: 3 },
      read: false,
      resolved: false,
    });
    expect(reminder).toMatchObject({ severity: 'warning', module: 'appointments', category: 'booking' });
    expect(res.body.data.daily).toHaveLength(14);
    expect(res.body.data.summary.critical).toBeGreaterThanOrEqual(1);
  });

  it('runs single triage actions and records who resolved', async () => {
    const row = await prisma.notificationLog.findFirstOrThrow({
      where: { type: `${PREFIX}STOCK_RECONCILIATION_MISMATCH` },
    });

    const resolved = await request(app).patch(`/api/v1/notifications/${row.id}/resolve`).set(...auth());
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({ resolved: true, read: true, resolvedBy: { id: adminId } });
    expect(resolved.body.data.readAt).not.toBeNull();

    const unread = await request(app).patch(`/api/v1/notifications/${row.id}/unread`).set(...auth());
    expect(unread.body.data).toMatchObject({ read: false, readAt: null, resolved: true });

    const reopened = await request(app).patch(`/api/v1/notifications/${row.id}/reopen`).set(...auth());
    expect(reopened.body.data).toMatchObject({ resolved: false, resolvedAt: null, resolvedBy: null });

    const bad = await request(app).patch(`/api/v1/notifications/${row.id}/explode`).set(...auth());
    expect(bad.status).toBe(400);
  });

  it('bulk actions, read-all and unread-count stay scoped to the caller', async () => {
    const rows = await prisma.notificationLog.findMany({
      where: { type: { startsWith: PREFIX } },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);

    const bulk = await request(app)
      .post('/api/v1/notifications/bulk')
      .set(...auth())
      .send({ ids, action: 'resolve' });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(2);

    const readAll = await request(app).post('/api/v1/notifications/read-all').set(...auth());
    expect(readAll.status).toBe(200);
    const count = await request(app).get('/api/v1/notifications/unread-count').set(...auth());
    expect(count.body.data).toEqual({ unread: 0, critical: 0 });

    // Someone else's id must not be affected.
    const other = await prisma.user.findFirstOrThrow({ where: { id: { not: adminId } } });
    const foreign = await prisma.notificationLog.create({
      data: { userId: other.id, type: `${PREFIX}FOREIGN`, title: 'x', body: 'y' },
    });
    const del = await request(app)
      .post('/api/v1/notifications/bulk')
      .set(...auth())
      .send({ ids: [foreign.id], action: 'delete' });
    expect(del.body.data.updated).toBe(0);
    const single = await request(app).delete(`/api/v1/notifications/${foreign.id}`).set(...auth());
    expect(single.status).toBe(404);

    const own = await request(app).delete(`/api/v1/notifications/${ids[0]}`).set(...auth());
    expect(own.status).toBe(200);
    expect(await prisma.notificationLog.count({ where: { id: ids[0] } })).toBe(0);
  });
});
