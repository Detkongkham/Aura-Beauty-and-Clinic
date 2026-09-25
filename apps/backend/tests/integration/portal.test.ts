import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — web-admin /portal: permission-gated summary, announcements (publish → visible →
 * read → manage/delete, branch-admin scoping), daily checklist ticks, system status gating and
 * portal prefs on the synced account preferences. Only touches rows tagged with PREFIX.
 */
const ADMIN = { phone: '02000000000', password: 'Admin@12345' };
const MANAGER = { phone: '02000000001', password: 'Manager@12345' };
const PREFIX = 'TEST_PORTAL_';

describe('portal', () => {
  let app: Express;
  let admin: string;
  let manager: string;
  let managerBranchId: string;
  const as = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  async function login(cred: { phone: string; password: string }) {
    const res = await request(app).post('/api/v1/auth/login').send(cred);
    return res.body.data as { tokens: { accessToken: string }; user: { id: string; branchId: string | null } };
  }

  async function wipe(): Promise<void> {
    await prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await prisma.dailyChecklistTick.deleteMany({ where: { taskKey: { in: ['checkLowStock', 'openDrawer'] } } });
  }

  beforeAll(async () => {
    app = createApp();
    admin = (await login(ADMIN)).tokens.accessToken;
    const m = await login(MANAGER);
    manager = m.tokens.accessToken;
    managerBranchId = m.user.branchId!;
    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await request(app).patch('/api/v1/auth/me/preferences').set(...as(admin)).send({ portal: {} });
    await prisma.$disconnect();
  });

  it('summary returns permission-scoped counts; branch admin is pinned to their branch', async () => {
    const res = await request(app).get('/api/v1/portal/summary?branchId=all').set(...as(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.branchId).toBe('all');
    for (const key of ['appointmentsPending', 'slipsToReview', 'expensesToApprove', 'lowStock', 'notificationsUnread']) {
      expect(typeof res.body.data.counts[key]).toBe('number');
    }
    const mgr = await request(app).get('/api/v1/portal/summary?branchId=all').set(...as(manager));
    expect(mgr.status).toBe(200);
    expect(mgr.body.data.branchId).toBe(managerBranchId);
  });

  it('publishes an announcement that others see unread, then read', async () => {
    const created = await request(app)
      .post('/api/v1/portal/announcements')
      .set(...as(admin))
      .send({ title: `${PREFIX}hello`, body: 'body', severity: 'WARNING', pinned: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ severity: 'WARNING', pinned: true, read: true });
    const id = created.body.data.id as string;

    const list = await request(app).get('/api/v1/portal/announcements').set(...as(manager));
    const mine = (list.body.data as { id: string; read: boolean }[]).find((a) => a.id === id);
    expect(mine).toMatchObject({ read: false });

    const before = await request(app).get('/api/v1/portal/summary').set(...as(manager));
    expect(before.body.data.counts.announcementsUnread).toBeGreaterThanOrEqual(1);

    expect((await request(app).post(`/api/v1/portal/announcements/${id}/read`).set(...as(manager))).status).toBe(200);
    const after = await request(app).get('/api/v1/portal/announcements').set(...as(manager));
    expect((after.body.data as { id: string; read: boolean }[]).find((a) => a.id === id)?.read).toBe(true);

    const manage = await request(app).get('/api/v1/portal/announcements/manage').set(...as(admin));
    expect((manage.body.data as { id: string; readCount: number }[]).find((a) => a.id === id)?.readCount).toBe(2);
  });

  it('hides scheduled, expired and other-audience announcements', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const mk = (extra: object) =>
      request(app).post('/api/v1/portal/announcements').set(...as(admin)).send({ title: `${PREFIX}x`, ...extra });
    const scheduled = (await mk({ publishedAt: future })).body.data.id;
    const expired = (await mk({ expiresAt: past })).body.data.id;
    const staffOnly = (await mk({ audienceRoles: ['STAFF'] })).body.data.id;
    const ids = ((await request(app).get('/api/v1/portal/announcements').set(...as(manager))).body.data as { id: string }[]).map(
      (a) => a.id,
    );
    expect(ids).not.toContain(scheduled);
    expect(ids).not.toContain(expired);
    expect(ids).not.toContain(staffOnly);
  });

  it('branch admin can only post to their own branch and cannot touch company-wide posts', async () => {
    const own = await request(app)
      .post('/api/v1/portal/announcements')
      .set(...as(manager))
      .send({ title: `${PREFIX}branch`, branchId: null });
    expect(own.status).toBe(201);
    expect(own.body.data.branchId).toBe(managerBranchId);
    const edited = await request(app)
      .patch(`/api/v1/portal/announcements/${own.body.data.id}`)
      .set(...as(manager))
      .send({ title: `${PREFIX}branch2`, branchId: null });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ title: `${PREFIX}branch2`, branchId: managerBranchId });

    const companyWide = await request(app)
      .post('/api/v1/portal/announcements')
      .set(...as(admin))
      .send({ title: `${PREFIX}company` });
    const del = await request(app).delete(`/api/v1/portal/announcements/${companyWide.body.data.id}`).set(...as(manager));
    expect(del.status).toBe(403);
    expect((await request(app).delete(`/api/v1/portal/announcements/${companyWide.body.data.id}`).set(...as(admin))).status).toBe(
      200,
    );
  });

  it('checklist ticks are shared per branch scope and can be undone', async () => {
    const list = await request(app).get('/api/v1/portal/checklist').set(...as(manager));
    expect(list.status).toBe(200);
    const keys = (list.body.data.tasks as { key: string }[]).map((x) => x.key);
    expect(keys).toContain('checkLowStock');
    expect(keys).not.toContain('verifyBackup'); // super admin only

    const ticked = await request(app).post('/api/v1/portal/checklist/checkLowStock').set(...as(manager)).send({ done: true });
    const task = (ticked.body.data.tasks as { key: string; ticked: boolean; doneBy: string | null }[]).find(
      (x) => x.key === 'checkLowStock',
    );
    expect(task).toMatchObject({ ticked: true });
    expect(task?.doneBy).toBeTruthy();

    // Same branch scope seen by the super admin picking that branch.
    const seen = await request(app).get(`/api/v1/portal/checklist?branchId=${managerBranchId}`).set(...as(admin));
    expect((seen.body.data.tasks as { key: string; ticked: boolean }[]).find((x) => x.key === 'checkLowStock')?.ticked).toBe(true);

    const undone = await request(app).post('/api/v1/portal/checklist/checkLowStock').set(...as(manager)).send({ done: false });
    expect((undone.body.data.tasks as { key: string; ticked: boolean }[]).find((x) => x.key === 'checkLowStock')?.ticked).toBe(false);
  });

  it('system status is super-admin only and reports probes', async () => {
    expect((await request(app).get('/api/v1/portal/system-status').set(...as(manager))).status).toBe(403);
    const res = await request(app).get('/api/v1/portal/system-status').set(...as(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.database.state).toBe('ok');
    expect(Array.isArray(res.body.data.queues)).toBe(true);
    expect(res.body.data.backup).toHaveProperty('configured');
  });

  it('stores portal prefs (ordered pins, view, recent) on the account', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set(...as(admin))
      .send({ portal: { pins: ['/queue', '/finance'], view: 'list', recent: [{ path: '/queue', at: 1 }] } });
    expect(res.status).toBe(200);
    expect(res.body.data.preferences.portal).toEqual({
      pins: ['/queue', '/finance'],
      view: 'list',
      recent: [{ path: '/queue', at: 1 }],
    });
    const bad = await request(app).patch('/api/v1/auth/me/preferences').set(...as(admin)).send({ portal: { view: 'tiles' } });
    expect(bad.status).toBe(400);
  });
});
