import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/** Wave 11 — branch weekly hours, manager, photos, monthly targets, archive/restore, history. */
const CODE = 'W11-BR';
let app: Express;
let token = '';
const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

async function cleanup() {
  const b = await prisma.branch.findMany({ where: { code: CODE }, select: { id: true } });
  const ids = b.map((x) => x.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  token = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })).body.data.tokens.accessToken;
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Branches Wave 11', () => {
  it('create → update hours/manager/photos/targets → history → archive/restore', async () => {
    const created = await request(app)
      .post('/api/v1/branches')
      .set(...auth())
      .send({
        name: 'W11 Branch',
        code: CODE,
        weeklyHours: [
          { day: 0, open: '10:00', close: '16:00', closed: true },
          { day: 1, open: '09:00', close: '20:00' },
        ],
        monthlyRevenueTarget: 50_000_000,
        monthlyBookingTarget: 300,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.weeklyHours).toHaveLength(2);
    expect(created.body.data.monthlyRevenueTarget).toBe(50_000_000);

    const badHours = await request(app)
      .patch(`/api/v1/branches/${id}`)
      .set(...auth())
      .send({ weeklyHours: [{ day: 2, open: '18:00', close: '09:00' }] });
    expect(badHours.status).toBe(400);

    const admin = await prisma.user.findFirstOrThrow({ where: { phone: '02000000000' } });
    const upd = await request(app)
      .patch(`/api/v1/branches/${id}`)
      .set(...auth())
      .send({ managerUserId: admin.id, photoUrls: ['https://example.com/a.jpg'], coverImageUrl: 'https://example.com/c.jpg', monthlyBookingTarget: 320 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.managerName).toBe(admin.name);
    expect(upd.body.data.photoUrls).toEqual(['https://example.com/a.jpg']);

    const hist = await request(app).get(`/api/v1/branches/${id}/history`).set(...auth());
    expect(hist.status).toBe(200);
    const actions = hist.body.data.map((h: { action: string }) => h.action);
    expect(actions).toContain('branch.created');
    const upd1 = hist.body.data.find((h: { action: string }) => h.action === 'branch.updated');
    expect(upd1.changes.monthlyBookingTarget).toEqual({ from: 300, to: 320 });

    const insights = await request(app).get('/api/v1/branches/insights?days=7').set(...auth());
    const mine = insights.body.data.items.find((i: { branchId: string }) => i.branchId === id);
    expect(mine.month).toMatchObject({ revenueTarget: 50_000_000, bookingTarget: 320, completed: 0 });

    const arch = await request(app).delete(`/api/v1/branches/${id}`).set(...auth());
    expect(arch.status).toBe(200);
    expect(arch.body.data.archivedAt).not.toBeNull();
    const list = await request(app).get('/api/v1/branches').set(...auth());
    expect(list.body.data.items.some((b: { id: string }) => b.id === id)).toBe(false);
    const all = await request(app).get('/api/v1/branches?includeArchived=true').set(...auth());
    expect(all.body.data.items.some((b: { id: string }) => b.id === id)).toBe(true);

    const restored = await request(app).post(`/api/v1/branches/${id}/restore`).set(...auth());
    expect(restored.status).toBe(200);
    expect(restored.body.data.archivedAt).toBeNull();
    const hist2 = await request(app).get(`/api/v1/branches/${id}/history`).set(...auth());
    expect(hist2.body.data.map((h: { action: string }) => h.action)).toEqual(
      expect.arrayContaining(['branch.archived', 'branch.restored']),
    );
  });
});
