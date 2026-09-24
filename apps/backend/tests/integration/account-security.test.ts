import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { AuthResponse, LoginResult, MfaChallenge } from '@abcp/shared-types';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as passwordReset from '../../src/modules/auth/password-reset.service.js';
import { forgetSession, sessionCache } from '../../src/modules/auth/security.js';
import * as twoFactor from '../../src/modules/auth/two-factor.service.js';
import { clearSettingsCache } from '../../src/modules/settings/settings.service.js';
import { updateAdminStaff } from '../../src/modules/staff/staff-admin.service.js';
import { notifyUser } from '../../src/services/push.js';
import { hashPassword } from '../../src/utils/password.js';
import { totpAt } from '../../src/utils/totp.js';

/**
 * Account security (2026-09-24): lockout + failed-login audit, new-device alerts, TOTP 2FA (opt-in and
 * Settings ▸ require2fa), idle timeout, immediate revocation, password reset, admin view of another
 * user's security, staff deactivation, per-user notification preferences.
 *
 * Settings are stubbed in-process (never written) because test files share one DB and run in parallel.
 * authLimiter allows 10 req / 15 min per file, so most flows go through the services directly.
 */
const P = '0209924';
const ADMIN_PHONE = `${P}0001`;
const STAFF_PHONE = `${P}0002`;
const MFA_PHONE = `${P}0003`;
const RESET_PHONE = `${P}0004`;
const PASSWORD = 'Passw0rd!';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1';

let app: Express;
let overrides: Record<string, unknown> = {};
const ids = { admin: '', staff: '', mfa: '', reset: '' };

const asAuth = (r: LoginResult) => r as AuthResponse;
const bearer = (r: LoginResult) => `Bearer ${asAuth(r).tokens.accessToken}`;
const setPolicy = (o: Record<string, unknown>) => {
  overrides = o;
  clearSettingsCache();
};

async function mkUser(phone: string, role: 'SUPER_ADMIN' | 'STAFF' | 'CUSTOMER', branchId: string | null = null) {
  const u = await prisma.user.create({
    data: { name: `Sec ${phone.slice(-2)}`, phone, role, branchId, password: await hashPassword(PASSWORD) },
  });
  return u.id;
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: P } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: uids } }, { entityId: { in: uids } }] } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.staffProfile.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  const original = prisma.appSetting.findUnique.bind(prisma.appSetting);
  vi.spyOn(prisma.appSetting, 'findUnique').mockImplementation((async (args: { where: { key?: string } }) => {
    const row = await original(args as never);
    if (args?.where?.key !== 'app') return row;
    return { key: 'app', value: { ...((row?.value as object) ?? {}), ...overrides } };
  }) as never);
  ids.admin = await mkUser(ADMIN_PHONE, 'SUPER_ADMIN');
  ids.staff = await mkUser(STAFF_PHONE, 'STAFF');
  ids.mfa = await mkUser(MFA_PHONE, 'STAFF');
  ids.reset = await mkUser(RESET_PHONE, 'CUSTOMER');
});

afterEach(() => setPolicy({}));

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

describe('lockout + failed-login audit', () => {
  it('locks after maxLoginAttempts, refuses the right password while locked, admin unlock clears it', async () => {
    setPolicy({ maxLoginAttempts: 3, lockoutMinutes: 10 });
    const bad = () => authService.login({ phone: STAFF_PHONE, password: 'wrong-one' }, { userAgent: DESKTOP_UA, ipAddress: '10.0.0.9' });
    await expect(bad()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(bad()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(bad()).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 423 });
    await expect(authService.login({ phone: STAFF_PHONE, password: PASSWORD })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });

    await vi.waitFor(async () => {
      const failures = await prisma.auditLog.count({ where: { entityId: ids.staff, action: 'auth.login_failed' } });
      expect(failures).toBe(4); // 3 bad passwords + 1 attempt while locked
    });
    await vi.waitFor(async () =>
      expect(await prisma.notificationLog.count({ where: { userId: ids.staff, type: 'SECURITY_ACCOUNT_LOCKED' } })).toBe(1),
    );

    const admin = await authService.login({ phone: ADMIN_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA });
    const view = await request(app).get(`/api/v1/users/${ids.staff}/security`).set('Authorization', bearer(admin));
    expect(view.status).toBe(200);
    expect(view.body.data.lockedUntil).toBeTruthy();
    expect(view.body.data.recentFailures[0].reason).toBe('locked');

    const unlock = await request(app).post(`/api/v1/users/${ids.staff}/unlock`).set('Authorization', bearer(admin));
    expect(unlock.status).toBe(200);
    await expect(authService.login({ phone: STAFF_PHONE, password: PASSWORD })).resolves.toHaveProperty('tokens');
  });

  it('records unknown phones without a user id', async () => {
    await expect(authService.login({ phone: `${P}9999`, password: 'x' }, { ipAddress: '10.9.9.9' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await vi.waitFor(async () => {
      const row = await prisma.auditLog.findFirst({ where: { action: 'auth.login_failed', ipAddress: '10.9.9.9' } });
      expect(row?.userId).toBeNull();
      expect((row?.newValue as { phone: string }).phone).toBe('020•••••999');
      await prisma.auditLog.delete({ where: { id: row!.id } });
    });
  });
});

describe('sessions', () => {
  it('alerts once when a new device signs in', async () => {
    const alerts = () => prisma.notificationLog.count({ where: { userId: ids.staff, type: 'SECURITY_NEW_DEVICE' } });
    await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA });
    await new Promise((r) => setTimeout(r, 200));
    const base = await alerts();
    await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: PHONE_UA });
    await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: PHONE_UA });
    await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA });
    await vi.waitFor(async () => expect(await alerts()).toBe(base + 1));
    await new Promise((r) => setTimeout(r, 200));
    expect(await alerts()).toBe(base + 1);
  });

  it('a revoked session stops working at once, not after the access-token TTL', async () => {
    const s = asAuth(await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA }));
    const auth = `Bearer ${s.tokens.accessToken}`;
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', auth)).status).toBe(200);
    const admin = await authService.login({ phone: ADMIN_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA });
    const all = await request(app).post(`/api/v1/users/${ids.staff}/sessions/revoke-all`).set('Authorization', bearer(admin));
    expect(all.body.data.revoked).toBeGreaterThanOrEqual(1);
    const after = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('TOKEN_INVALID');
  });

  it('idle staff sessions expire (guard and refresh); customers are exempt', async () => {
    setPolicy({ sessionTimeoutMinutes: 30 });
    const s = asAuth(await authService.login({ phone: STAFF_PHONE, password: PASSWORD }, { userAgent: DESKTOP_UA }));
    const sid = (await prisma.userSession.findFirstOrThrow({ where: { userId: ids.staff, revokedAt: null }, orderBy: { createdAt: 'desc' } })).id;
    await prisma.userSession.update({ where: { id: sid }, data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) } });
    forgetSession(sid);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${s.tokens.accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_IDLE');
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: sid } })).revokedReason).toBe('IDLE');
    await expect(authService.refresh(s.tokens.refreshToken)).rejects.toMatchObject({ code: 'SESSION_IDLE' });

    const c = asAuth(await authService.login({ phone: RESET_PHONE, password: PASSWORD }));
    await prisma.userSession.updateMany({ where: { userId: ids.reset }, data: { lastSeenAt: new Date(Date.now() - 5 * 3_600_000) } });
    sessionCache.clear();
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${c.tokens.accessToken}`)).status).toBe(200);
  });
});

describe('2FA (TOTP)', () => {
  it('enrols, challenges the next login, accepts TOTP and a single-use recovery code, then disables', async () => {
    const setup = await twoFactor.startSelfSetup(ids.mfa, PASSWORD);
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await expect(twoFactor.enableSelf(ids.mfa, '000000')).rejects.toMatchObject({ code: 'MFA_INVALID' });
    const { recoveryCodes } = await twoFactor.enableSelf(ids.mfa, totpAt(setup.secret));
    expect(recoveryCodes).toHaveLength(10);

    const challenge = (await authService.login({ phone: MFA_PHONE, password: PASSWORD })) as MfaChallenge;
    expect(challenge).toMatchObject({ mfaRequired: true, mode: 'verify' });
    expect(challenge).not.toHaveProperty('tokens');
    await expect(twoFactor.verifyLogin(challenge.mfaToken, '123456', {})).rejects.toMatchObject({ code: 'MFA_INVALID' });

    const ok = await twoFactor.verifyLogin(challenge.mfaToken, totpAt(setup.secret), {});
    expect(ok.tokens.accessToken).toBeTruthy();
    const session = await prisma.userSession.findFirstOrThrow({ where: { userId: ids.mfa }, orderBy: { createdAt: 'desc' } });
    expect(session.mfa).toBe(true);

    const code = recoveryCodes[0]!;
    const c2 = (await authService.login({ phone: MFA_PHONE, password: PASSWORD })) as MfaChallenge;
    await expect(twoFactor.verifyLogin(c2.mfaToken, code.toLowerCase(), {})).resolves.toHaveProperty('tokens');
    const c3 = (await authService.login({ phone: MFA_PHONE, password: PASSWORD })) as MfaChallenge;
    await expect(twoFactor.verifyLogin(c3.mfaToken, code.replace('-', ''), {})).rejects.toMatchObject({ code: 'MFA_INVALID' });

    // A 'verify' ticket can't be used for the enrolment endpoints.
    const setupRes = await request(app).post('/api/v1/auth/2fa/setup').send({ mfaToken: c3.mfaToken });
    expect(setupRes.status).toBe(401);
    expect(setupRes.body.error.code).toBe('TOKEN_EXPIRED');

    await twoFactor.disableSelf(ids.mfa, { currentPassword: PASSWORD, code: totpAt(setup.secret) });
    await expect(authService.login({ phone: MFA_PHONE, password: PASSWORD })).resolves.toHaveProperty('tokens');
  });

  it('require2fa forces enrolment at login, kills unenrolled sessions on refresh, and blocks disabling', async () => {
    const before = asAuth(await authService.login({ phone: STAFF_PHONE, password: PASSWORD }));
    setPolicy({ require2fa: true });

    await expect(authService.refresh(before.tokens.refreshToken)).rejects.toMatchObject({ code: 'MFA_REQUIRED' });

    const challenge = (await authService.login({ phone: STAFF_PHONE, password: PASSWORD })) as MfaChallenge;
    expect(challenge.mode).toBe('setup');
    const setup = await twoFactor.setupDuringLogin(challenge.mfaToken);
    const done = await twoFactor.activateDuringLogin(challenge.mfaToken, totpAt(setup.secret), {});
    expect(done.tokens.accessToken).toBeTruthy();
    expect(done.recoveryCodes).toHaveLength(10);

    await expect(
      twoFactor.disableSelf(ids.staff, { currentPassword: PASSWORD, code: totpAt(setup.secret) }),
    ).rejects.toMatchObject({ code: 'MFA_REQUIRED' });

    // Customers are never asked.
    await expect(authService.login({ phone: RESET_PHONE, password: PASSWORD })).resolves.toHaveProperty('tokens');

    // Admin resets the lost authenticator → back to 'setup' on the next login.
    const admin = asAuth(await authService.login({ phone: ADMIN_PHONE, password: PASSWORD })) as unknown;
    const adminChallenge = admin as MfaChallenge; // the super admin is also a staff role → setup
    expect(adminChallenge.mode).toBe('setup');
    setPolicy({});
    const adminAuth = await authService.login({ phone: ADMIN_PHONE, password: PASSWORD });
    const reset = await request(app).delete(`/api/v1/users/${ids.staff}/2fa`).set('Authorization', bearer(adminAuth));
    expect(reset.status).toBe(200);
    await expect(authService.login({ phone: STAFF_PHONE, password: PASSWORD })).resolves.toHaveProperty('tokens');
  });
});

describe('password reset', () => {
  it('self-service request never reveals the phone and is throttled', async () => {
    await expect(passwordReset.requestReset(`${P}8888`)).resolves.toEqual({ accepted: true, expiresInMinutes: 15 });
    for (let i = 0; i < 4; i++) await passwordReset.requestReset(RESET_PHONE);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: ids.reset } });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.channel).toBe('DEV');
  });

  it('admin-issued code resets the password once and signs out every device', async () => {
    const before = asAuth(await authService.login({ phone: RESET_PHONE, password: PASSWORD }));
    const admin = await authService.login({ phone: ADMIN_PHONE, password: PASSWORD });
    const issued = await request(app).post(`/api/v1/users/${ids.reset}/password-reset`).set('Authorization', bearer(admin));
    expect(issued.status).toBe(200);
    const code = issued.body.data.code as string;
    expect(code).toMatch(/^\d{8}$/);

    await expect(
      passwordReset.resetPassword({ phone: RESET_PHONE, code: '12345678', newPassword: 'N3wPassw0rd!' }),
    ).rejects.toMatchObject({ details: { reason: 'CODE_INVALID' } });
    await passwordReset.resetPassword({ phone: RESET_PHONE, code, newPassword: 'N3wPassw0rd!' });
    await expect(
      passwordReset.resetPassword({ phone: RESET_PHONE, code, newPassword: 'Other0ne!!' }),
    ).rejects.toMatchObject({ details: { reason: 'CODE_INVALID' } });

    await expect(authService.refresh(before.tokens.refreshToken)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await expect(authService.login({ phone: RESET_PHONE, password: 'N3wPassw0rd!' })).resolves.toHaveProperty('tokens');
    await prisma.user.update({ where: { id: ids.reset }, data: { password: await hashPassword(PASSWORD) } });
  });
});

describe('admin scope + staff deactivation', () => {
  it('deactivating a staff profile disables the login and revokes sessions', async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { deletedAt: null } });
    const profile = await prisma.staffProfile.create({ data: { userId: ids.mfa, title: 'QA', staffBranches: { create: { branchId: branch.id, isPrimary: true } } } as never });
    const s = asAuth(await authService.login({ phone: MFA_PHONE, password: PASSWORD }));
    await updateAdminStaff(profile.id, { isActive: false } as never);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.mfa } })).isActive).toBe(false);
    await expect(authService.refresh(s.tokens.refreshToken)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await expect(authService.login({ phone: MFA_PHONE, password: PASSWORD })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await updateAdminStaff(profile.id, { isActive: true } as never);
    await expect(authService.login({ phone: MFA_PHONE, password: PASSWORD })).resolves.toHaveProperty('tokens');
  });
});

describe('notification preferences', () => {
  it('muted modules are dropped, push-only-off keeps the inbox, security always arrives', async () => {
    const s = await authService.login({ phone: RESET_PHONE, password: PASSWORD });
    const patch = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('Authorization', bearer(s))
      .send({ language: 'en', notifications: { appointments: { inbox: false }, marketing: { push: false } } });
    expect(patch.status).toBe(200);
    expect(patch.body.data.preferences).toMatchObject({ language: 'en', notifications: { appointments: { inbox: false } } });
    const again = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('Authorization', bearer(s))
      .send({ notifications: { appointments: { push: false } } });
    expect(again.body.data.preferences.notifications.appointments).toEqual({ inbox: false, push: false });

    await expect(notifyUser({ userId: ids.reset, type: 'APPOINTMENT_REMINDER', title: 't', body: 'b' })).resolves.toEqual({
      delivered: false,
      skipped: true,
    });
    await expect(notifyUser({ userId: ids.reset, type: 'CAMPAIGN_X', title: 't', body: 'b' })).resolves.toMatchObject({ delivered: true });
    await expect(notifyUser({ userId: ids.reset, type: 'SECURITY_TEST', title: 't', body: 'b' })).resolves.toMatchObject({ delivered: true });
    expect(await prisma.notificationLog.count({ where: { userId: ids.reset, type: 'APPOINTMENT_REMINDER' } })).toBe(0);
  });
});
