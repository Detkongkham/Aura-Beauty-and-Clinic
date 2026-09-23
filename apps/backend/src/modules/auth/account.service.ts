import type {
  AccountActivityItem,
  AccountActivityQuery,
  AccountOverview,
  AccountSession,
  AccountSessionMethod,
  SetOwnQuickLoginPinInput,
} from '@abcp/shared-types';
import { prisma } from '../../config/database.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { getSettings } from '../settings/settings.service.js';
import { toAuthUser } from './auth.service.js';
import { activeSessionWhere, deviceKind, writeAccountAudit } from './sessions.js';

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
  const [authUser, branch, role, staff, settings, activeSessions, actions30d, lastAction] = await Promise.all([
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
    },
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
  const res = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw ApiError.notFound('ບໍ່ພົບເຊດຊັນ');
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
  const res = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, ...(currentSid ? { id: { not: currentSid } } : {}) },
    data: { revokedAt: new Date() },
  });
  if (res.count > 0) {
    const user = await loadUser(userId);
    writeAccountAudit(user, 'auth.sessions_revoked', { revoked: res.count }, ipAddress);
  }
  return { revoked: res.count };
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
