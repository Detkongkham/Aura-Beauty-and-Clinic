import type {
  AccountActivityItem,
  AccountActivityQuery,
  AccountOverview,
  AccountSession,
  AccountSessionMethod,
  SetOwnQuickLoginPinInput,
  UserPreferences,
  UserPreferencesResponse,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { getSettings } from '../settings/settings.service.js';
import { toAuthUser } from './auth.service.js';
import { revokeAllSessions } from './security.js';
import { activeSessionWhere, deviceKind, revokeSessionById, writeAccountAudit } from './sessions.js';
import * as twoFactor from './two-factor.service.js';

/**
 * Web-admin /account — everything a signed-in user can see or change about their *own*
 * account. Nothing here takes a target user id: the caller is always `req.auth.sub`.
 */

const QUICK_LOGIN_ROLES = new Set(['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF']);
const DAY_MS = 24 * 60 * 60 * 1000;

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  return user;
}

/** GET /auth/me/overview — header card, security checklist and policy in one round-trip. */
export async function overview(userId: string, currentSid?: string): Promise<AccountOverview> {
  const user = await loadUser(userId);
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [authUser, branch, role, staff, settings, activeSessions, actions30d, lastAction, twoFactorStatus] = await Promise.all([
    toAuthUser(user),
    user.branchId
      ? prisma.branch.findUnique({ where: { id: user.branchId }, select: { id: true, name: true } })
      : null,
    user.roleRefId
      ? prisma.role.findUnique({ where: { id: user.roleRefId }, select: { name: true, color: true, icon: true } })
      : null,
    prisma.staffProfile.findUnique({ where: { userId }, select: { title: true } }),
    getSettings(),
    prisma.userSession.count({ where: activeSessionWhere(userId) }),
    prisma.auditLog.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.auditLog.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    twoFactor.status(user),
  ]);

  return {
    user: authUser,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lastLoginDevice: user.lastLoginDevice,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    quickLogin: {
      eligible: QUICK_LOGIN_ROLES.has(user.role),
      enabled: user.quickLoginEnabled,
      updatedAt: user.quickLoginUpdatedAt?.toISOString() ?? null,
    },
    branch,
    role,
    staff,
    policy: {
      minPasswordLength: settings.minPasswordLength,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      require2fa: settings.require2fa,
    },
    twoFactor: twoFactorStatus,
    stats: {
      activeSessions,
      actions30d,
      lastActionAt: lastAction?.createdAt.toISOString() ?? null,
    },
    currentSessionId: currentSid ?? null,
  };
}

/** GET /auth/me/sessions — live sessions, current one first, then most recently active. */
export async function listSessions(userId: string, currentSid?: string): Promise<{ items: AccountSession[] }> {
  const rows = await prisma.userSession.findMany({
    where: activeSessionWhere(userId),
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
  });
  const items = rows
    .map<AccountSession>((r) => ({
      id: r.id,
      method: r.method as AccountSessionMethod,
      deviceLabel: r.deviceLabel,
      deviceKind: deviceKind(r.userAgent),
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      isCurrent: r.id === currentSid,
    }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  return { items };
}

/** DELETE /auth/me/sessions/:id — sign one device out (its next refresh is refused). */
export async function revokeSession(
  userId: string,
  sessionId: string,
  ipAddress?: string,
): Promise<{ success: true }> {
  const count = await revokeSessionById(sessionId, 'USER', userId);
  if (count === 0) throw ApiError.notFound('ບໍ່ພົບເຊດຊັນ');
  const user = await loadUser(userId);
  writeAccountAudit(user, 'auth.session_revoked', { sessionId }, ipAddress);
  return { success: true };
}

/** POST /auth/me/sessions/revoke-others — everything except the calling session. */
export async function revokeOtherSessions(
  userId: string,
  currentSid?: string,
  ipAddress?: string,
): Promise<{ revoked: number }> {
  const revoked = await revokeAllSessions(userId, 'OTHERS', currentSid);
  if (revoked > 0) {
    const user = await loadUser(userId);
    writeAccountAudit(user, 'auth.sessions_revoked', { revoked }, ipAddress);
  }
  return { revoked };
}

/** GET /auth/me/activity — the caller's own audit trail, keyset-paged by `createdAt`. */
export async function listActivity(
  userId: string,
  query: AccountActivityQuery,
): Promise<{ items: AccountActivityItem[]; nextBefore: string | null }> {
  const rows = await prisma.auditLog.findMany({
    where: { userId, ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: query.limit + 1,
    select: { id: true, action: true, entityName: true, entityId: true, ipAddress: true, createdAt: true },
  });
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextBefore: rows.length > query.limit ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

function assertQuickLoginEligible(role: string): void {
  if (!QUICK_LOGIN_ROLES.has(role)) throw ApiError.forbidden('Quick Login ໃຊ້ໄດ້ສະເພາະພະນັກງານ');
}

/** PUT /auth/me/quick-login-pin — set / change own PIN; password re-confirmation required. */
export async function setOwnQuickLoginPin(
  userId: string,
  input: SetOwnQuickLoginPinInput,
  ipAddress?: string,
): Promise<{ enabled: true; updatedAt: string }> {
  const user = await loadUser(userId);
  assertQuickLoginEligible(user.role);
  if (!user.password || !(await verifyPassword(input.currentPassword, user.password))) {
    throw ApiError.unauthorized('ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  const updatedAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { quickLoginPin: await hashPassword(input.pin), quickLoginEnabled: true, quickLoginUpdatedAt: updatedAt },
  });
  writeAccountAudit(user, user.quickLoginEnabled ? 'auth.pin_changed' : 'auth.pin_set', undefined, ipAddress);
  return { enabled: true, updatedAt: updatedAt.toISOString() };
}

/** DELETE /auth/me/quick-login-pin */
export async function disableOwnQuickLogin(userId: string, ipAddress?: string): Promise<{ enabled: false }> {
  const user = await loadUser(userId);
  assertQuickLoginEligible(user.role);
  await prisma.user.update({
    where: { id: userId },
    data: { quickLoginPin: null, quickLoginEnabled: false, quickLoginUpdatedAt: null },
  });
  if (user.quickLoginEnabled) writeAccountAudit(user, 'auth.pin_removed', undefined, ipAddress);
  return { enabled: false };
}

// --- Personal preferences (synced across devices) -------------------------------

/** GET /auth/me/preferences — plus the two policy values clients act on (idle logout, 2FA). */
export async function getPreferences(userId: string): Promise<UserPreferencesResponse> {
  const [user, settings] = await Promise.all([loadUser(userId), getSettings()]);
  return {
    preferences: (user.preferences as UserPreferences | null) ?? {},
    policy: { sessionTimeoutMinutes: settings.sessionTimeoutMinutes, require2fa: settings.require2fa },
  };
}

/** PATCH /auth/me/preferences — shallow merge; `notifications` merges per module. */
export async function updatePreferences(userId: string, patch: UserPreferences): Promise<UserPreferencesResponse> {
  const user = await loadUser(userId);
  const current = (user.preferences as UserPreferences | null) ?? {};
  const notifications = patch.notifications
    ? Object.fromEntries(
        Object.entries({ ...current.notifications, ...patch.notifications }).map(([k, v]) => [
          k,
          { ...current.notifications?.[k as keyof typeof current.notifications], ...v },
        ]),
      )
    : current.notifications;
  const next: UserPreferences = { ...current, ...patch, ...(notifications ? { notifications } : {}) };
  await prisma.user.update({ where: { id: userId }, data: { preferences: next as Prisma.InputJsonValue } });
  return getPreferences(userId);
}
