import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { hashPassword } from '../../src/utils/password.js';
import { signRefreshToken } from '../../src/utils/token.js';

/**
 * Account console (/auth/me/*) — sessions, revoke, password policy, own quick-login PIN,
 * activity feed. Uses its own STAFF user; only rows for that user are touched.
 *
 * `authLimiter` allows 10 requests / 15 min per IP, so sessions are opened (and most revocation
 * checks done) through the service directly; HTTP is used where the route itself is under test.
 */
const PHONE = '02088800077';
const PASSWORD = 'Passw0rd!';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1';

describe('account console', () => {
  let app: Express;
  let userId: string;

  const login = (ua: string, password = PASSWORD) =>
    authService.login({ phone: PHONE, password }, { userAgent: ua });
  const refreshFails = (refreshToken: string) =>
    expect(authService.refresh(refreshToken)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    const user = await prisma.user.create({
      data: { name: 'Account QA', phone: PHONE, role: 'STAFF', password: await hashPassword(PASSWORD) },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  it('lists sessions per device, marks the current one, and revoking one kills its refresh', async () => {
    const desk = await login(DESKTOP_UA);
    const phone = await login(PHONE_UA);
    const deskAuth = `Bearer ${desk.tokens.accessToken}`;

    const list = await request(app).get('/api/v1/auth/me/sessions').set('Authorization', deskAuth);
    expect(list.status).toBe(200);
    const items = list.body.data.items as Array<{ id: string; isCurrent: boolean; deviceKind: string; deviceLabel: string }>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]!.isCurrent).toBe(true);
    expect(items[0]!.deviceKind).toBe('desktop');
    expect(items[0]!.deviceLabel).toBe('Chrome • macOS');
    const phoneRow = items.find((s) => s.deviceKind === 'mobile')!;
    expect(phoneRow).toBeTruthy();

    const revoke = await request(app).delete(`/api/v1/auth/me/sessions/${phoneRow.id}`).set('Authorization', deskAuth);
    expect(revoke.status).toBe(200);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: phone.tokens.refreshToken });
    expect(refreshed.status).toBe(401);
    expect(refreshed.body.error.code).toBe('TOKEN_INVALID');
    // The surviving device keeps rotating.
    await expect(authService.refresh(desk.tokens.refreshToken)).resolves.toBeTruthy();

    // Another user's session id is not ours to revoke.
    const again = await request(app).delete(`/api/v1/auth/me/sessions/${phoneRow.id}`).set('Authorization', deskAuth);
    expect(again.status).toBe(404);
  });

  it('logout revokes the session behind the refresh token', async () => {
    const s = await login(DESKTOP_UA);
    const refreshToken = s.tokens.refreshToken as string;
    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(out.status).toBe(200);
    await refreshFails(refreshToken);
  });

  it('legacy refresh tokens (no sid) still work and get a LEGACY session row', async () => {
    const { token } = signRefreshToken(userId);
    const res = await authService.refresh(token);
    expect(res.tokens.refreshToken).toBeTruthy();
    const legacy = await prisma.userSession.findFirst({ where: { userId, method: 'LEGACY' } });
    expect(legacy).toBeTruthy();
  });

  it('change-password enforces policy, rejects reuse, and can sign out every other device', async () => {
    const keep = await login(DESKTOP_UA);
    const other = await login(PHONE_UA);
    const auth = `Bearer ${keep.tokens.accessToken}`;

    const tooShort = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(tooShort.status).toBe(400);

    const reuse = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(reuse.status).toBe(400);

    const ok = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: PASSWORD, newPassword: 'Fresh0rd!!', signOutOthers: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.revokedSessions).toBeGreaterThanOrEqual(1);

    await refreshFails(other.tokens.refreshToken);
    await expect(authService.refresh(keep.tokens.refreshToken)).resolves.toBeTruthy();

    const overview = await request(app).get('/api/v1/auth/me/overview').set('Authorization', auth);
    expect(overview.status).toBe(200);
    expect(overview.body.data.passwordChangedAt).toBeTruthy();
    expect(overview.body.data.stats.activeSessions).toBe(1);
    expect(overview.body.data.quickLogin.eligible).toBe(true);
    expect(overview.body.data.policy.minPasswordLength).toBeGreaterThanOrEqual(8);
  });

  it('own quick-login PIN needs the password, then enables PIN login', async () => {
    const s = await login(DESKTOP_UA, 'Fresh0rd!!');
    const auth = `Bearer ${s.tokens.accessToken}`;

    const wrong = await request(app)
      .put('/api/v1/auth/me/quick-login-pin')
      .set('Authorization', auth)
      .send({ currentPassword: 'nope', pin: '4821' });
    expect(wrong.status).toBe(401);

    const set = await request(app)
      .put('/api/v1/auth/me/quick-login-pin')
      .set('Authorization', auth)
      .send({ currentPassword: 'Fresh0rd!!', pin: '4821' });
    expect(set.status).toBe(200);

    const pinLogin = await request(app).post('/api/v1/auth/quick-login').send({ userId, pin: '4821' });
    expect(pinLogin.status).toBe(200);

    const off = await request(app).delete('/api/v1/auth/me/quick-login-pin').set('Authorization', auth);
    expect(off.status).toBe(200);
    const pinAfter = await request(app).post('/api/v1/auth/quick-login').send({ userId, pin: '4821' });
    expect(pinAfter.status).toBe(401);
  });

  it('activity feed returns own auth.* events newest first, with keyset paging', async () => {
    // Audit writes are fire-and-forget — give them a beat to land.
    await new Promise((r) => setTimeout(r, 300));
    const s = await login(DESKTOP_UA, 'Fresh0rd!!');
    const auth = `Bearer ${s.tokens.accessToken}`;

    const first = await request(app).get('/api/v1/auth/me/activity?limit=2').set('Authorization', auth);
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(2);
    expect(first.body.data.nextBefore).toBeTruthy();
    const actions = (await prisma.auditLog.findMany({ where: { userId }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.password_changed', 'auth.session_revoked', 'auth.pin_set', 'auth.pin_removed']));

    const next = await request(app)
      .get(`/api/v1/auth/me/activity?limit=2&before=${encodeURIComponent(first.body.data.nextBefore)}`)
      .set('Authorization', auth);
    expect(next.status).toBe(200);
    expect(next.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
  });

  it('profile update accepts an avatar data URL and echoes it on /me', async () => {
    const s = await login(DESKTOP_UA, 'Fresh0rd!!');
    const auth = `Bearer ${s.tokens.accessToken}`;
    const avatarUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const patch = await request(app).patch('/api/v1/auth/me').set('Authorization', auth).send({ avatarUrl });
    expect(patch.status).toBe(200);
    expect(patch.body.data.avatarUrl).toBe(avatarUrl);

    const bad = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', auth)
      .send({ avatarUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
  });
});
