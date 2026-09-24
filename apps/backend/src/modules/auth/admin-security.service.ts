import type { AccountSessionMethod, IssuedResetCode, UserSecurityView } from '@abcp/shared-types';
import type { User } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { Actor } from '../../middlewares/permissionGuard.js';
import { ApiError } from '../../utils/ApiError.js';
import { issueAdminResetCode } from './password-reset.service.js';
import { revokeAllSessions, writeSecurityAudit } from './security.js';
import { deviceKind, revokeSessionById } from './sessions.js';

/**
 * Web-admin ▸ Users / Staff ▸ "Security" — an admin looking after *someone else's* account:
 * live sessions (and sign them out, e.g. when a staff member leaves), lockout, 2FA reset and
 * a one-time password-reset code. Every action is audited against the actor.
 *
 * Scope: SUPER_ADMIN → anyone. Others → accounts in their own branch, never a SUPER_ADMIN,
 * and only with users:manage (admins) or staff:manage / users:manage (staff) or
 * customers:manage (customers).
 */

const RECENT_REVOKED_DAYS = 7;

/** Staff are tied to branches through StaffBranch; User.branchId is often empty for them. */
async function inActorBranch(actor: Actor, target: Pick<User, 'id' | 'role' | 'branchId'>): Promise<boolean> {
  if (!actor.branchId) return false;
  if (target.branchId === actor.branchId) return true;
  if (target.role !== 'STAFF') return false;
  const link = await prisma.staffBranch.findFirst({
    where: { branchId: actor.branchId, staffProfile: { userId: target.id } },
    select: { staffProfileId: true },
  });
  return Boolean(link);
}

async function assertCanManage(actor: Actor, target: Pick<User, 'id' | 'role' | 'branchId'>): Promise<void> {
  if (actor.isSuperAdmin) return;
  if (target.role === 'SUPER_ADMIN') throw ApiError.forbidden('ສະເພາະ SUPER_ADMIN ເທົ່ານັ້ນທີ່ຈັດການບັນຊີ SUPER_ADMIN ໄດ້');
  if (!(await inActorBranch(actor, target))) {
    throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະບັນຊີໃນສາຂາຂອງທ່ານ');
  }
  const p = actor.permissions;
  const allowed =
    target.role === 'STAFF'
      ? p.has('staff:manage') || p.has('users:manage')
      : target.role === 'CUSTOMER'
        ? p.has('customers:manage') || p.has('users:manage')
        : p.has('users:manage');
  if (!allowed) throw ApiError.forbidden('ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້');
}

async function loadTarget(id: string, actor: Actor): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  await assertCanManage(actor, user);
  return user;
}

function audit(actor: Actor, target: User, action: string, newValue?: Record<string, unknown>, ip?: string) {
  writeSecurityAudit({
    action,
    actorId: actor.id,
    targetId: target.id,
    branchId: target.branchId,
    newValue: { targetName: target.name, ...newValue },
    ipAddress: ip,
  });
}

/** GET /users/:id/security */
export async function getUserSecurity(id: string, actor: Actor): Promise<UserSecurityView> {
  const user = await loadTarget(id, actor);
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_REVOKED_DAYS * 86_400_000);
  const [sessions, failures] = await Promise.all([
    prisma.userSession.findMany({
      where: {
        userId: id,
        OR: [{ revokedAt: null, expiresAt: { gt: now } }, { revokedAt: { gte: since } }],
      },
      orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
      take: 40,
    }),
    prisma.auditLog.findMany({
      where: { entityName: 'auth', entityId: id, action: 'auth.login_failed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, createdAt: true, ipAddress: true, newValue: true },
    }),
  ]);
  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    lockedUntil: user.lockedUntil && user.lockedUntil > now ? user.lockedUntil.toISOString() : null,
    failedLoginCount: user.failedLoginCount,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    sessions: sessions.map((s) => ({
      id: s.id,
      method: s.method as AccountSessionMethod,
      deviceLabel: s.deviceLabel,
      deviceKind: deviceKind(s.userAgent),
      ipAddress: s.ipAddress,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt?.toISOString() ?? null,
      revokedReason: s.revokedReason,
    })),
    recentFailures: failures.map((f) => {
      const v = (f.newValue ?? {}) as { reason?: string; device?: string };
      return {
        id: f.id,
        createdAt: f.createdAt.toISOString(),
        ipAddress: f.ipAddress,
        reason: v.reason ?? null,
        device: v.device ?? null,
      };
    }),
  };
}

/** DELETE /users/:id/sessions/:sid */
export async function revokeUserSession(id: string, sid: string, actor: Actor, ip?: string): Promise<{ success: true }> {
  const user = await loadTarget(id, actor);
  const count = await revokeSessionById(sid, 'ADMIN', id);
  if (count === 0) throw ApiError.notFound('ບໍ່ພົບເຊດຊັນ');
  audit(actor, user, 'auth.admin_session_revoked', { sessionId: sid }, ip);
  return { success: true };
}

/** POST /users/:id/sessions/revoke-all */
export async function revokeAllUserSessions(
  id: string,
  actor: Actor,
  actorSid?: string,
  ip?: string,
): Promise<{ revoked: number }> {
  const user = await loadTarget(id, actor);
  // Never sign the admin out of the session they're clicking from.
  const revoked = await revokeAllSessions(id, 'ADMIN', actor.id === id ? actorSid : undefined);
  audit(actor, user, 'auth.admin_sessions_revoked', { revoked }, ip);
  return { revoked };
}

/** POST /users/:id/unlock */
export async function unlockUser(id: string, actor: Actor, ip?: string): Promise<{ success: true }> {
  const user = await loadTarget(id, actor);
  await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  audit(actor, user, 'auth.admin_unlocked', undefined, ip);
  return { success: true };
}

/** DELETE /users/:id/2fa — lost phone. The person enrols again at next login (if required) or in /account. */
export async function resetUserTwoFactor(id: string, actor: Actor, ip?: string): Promise<{ success: true }> {
  const user = await loadTarget(id, actor);
  if (actor.id === id) throw ApiError.forbidden('ປິດ 2FA ຂອງຕົນເອງໄດ້ທີ່ໜ້າບັນຊີ');
  await prisma.user.update({
    where: { id },
    data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: [] },
  });
  const revoked = await revokeAllSessions(id, 'ADMIN');
  audit(actor, user, 'auth.admin_2fa_reset', { revoked }, ip);
  return { success: true };
}

/** POST /users/:id/password-reset — one-time 8-digit code, valid 24 h, shown to the admin once. */
export async function issueResetCode(id: string, actor: Actor, ip?: string): Promise<IssuedResetCode> {
  const user = await loadTarget(id, actor);
  if (actor.id === id) throw ApiError.forbidden('ປ່ຽນລະຫັດຜ່ານຂອງຕົນເອງໄດ້ທີ່ໜ້າບັນຊີ');
  return issueAdminResetCode(user, actor.id, ip);
}
