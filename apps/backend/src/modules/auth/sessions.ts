import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDeviceLabel } from '../../utils/userAgent.js';
import { getCachedSettings } from '../settings/settings.service.js';
import { SESSION_CACHE_MS, forgetSession, idleError, isIdle, notifySessionsRevoked, sessionCache } from './security.js';

/** Request context captured when a session is opened (login / quick-login / register). */
export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export type SessionMethod = 'PASSWORD' | 'PIN' | 'REGISTER' | 'LEGACY';

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.JWT_REFRESH_TTL * 1000);
}

/** Opens a UserSession row; its id is embedded as `sid` in both tokens. */
export async function openSession(
  userId: string,
  method: SessionMethod,
  ctx: SessionContext = {},
  tx: Prisma.TransactionClient = prisma,
  mfa = false,
): Promise<string> {
  const session = await tx.userSession.create({
    data: {
      userId,
      method,
      mfa,
      deviceLabel: parseDeviceLabel(ctx.userAgent),
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 400) : null,
      ipAddress: ctx.ipAddress ?? null,
      expiresAt: sessionExpiry(),
    },
    select: { id: true },
  });
  return session.id;
}

/** Revokes one session (if still live) and drops it from the authGuard cache. */
export async function revokeSessionById(sid: string, reason: string, userId?: string): Promise<number> {
  const res = await prisma.userSession.updateMany({
    where: { id: sid, revokedAt: null, ...(userId ? { userId } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  forgetSession(sid);
  if (res.count) notifySessionsRevoked({ sid });
  return res.count;
}

/** Only rows that can still mint tokens. */
export function activeSessionWhere(userId: string, now = new Date()): Prisma.UserSessionWhereInput {
  return { userId, revokedAt: null, expiresAt: { gt: now } };
}

const TOUCH_EVERY_MS = 60_000;

/**
 * authGuard's per-request session check for tokens that carry a `sid`: refuses revoked sessions
 * (so "sign out this device" / admin revoke bite within SESSION_CACHE_MS instead of the 15-min access
 * TTL), enforces Settings ▸ sessionTimeoutMinutes, and keeps `lastSeenAt` fresh (≤ 1 write/min).
 */
export async function assertLiveSession(sid: string, userId: string, role: string): Promise<void> {
  const now = Date.now();
  let entry = sessionCache.get(sid);
  if (!entry || now - entry.checkedAt > SESSION_CACHE_MS) {
    const row = await prisma.userSession.findUnique({
      where: { id: sid },
      select: { userId: true, revokedAt: true, expiresAt: true, lastSeenAt: true },
    });
    if (!row) throw ApiError.unauthorized('ເຊດຊັນນີ້ຖືກອອກຈາກລະບົບແລ້ວ', ErrorCode.TOKEN_INVALID);
    if (sessionCache.size > 5_000) {
      for (const [k, v] of sessionCache) if (now - v.checkedAt > SESSION_CACHE_MS) sessionCache.delete(k);
    }
    entry = {
      checkedAt: now,
      userId: row.userId,
      revoked: Boolean(row.revokedAt),
      expiresAt: +row.expiresAt,
      lastSeenAt: +row.lastSeenAt,
    };
    sessionCache.set(sid, entry);
    if (!entry.revoked) {
      if (isIdle(entry.lastSeenAt, role, await getCachedSettings(), now)) {
        await revokeSessionById(sid, 'IDLE');
        throw idleError();
      }
      if (now - entry.lastSeenAt > TOUCH_EVERY_MS) {
        entry.lastSeenAt = now;
        void prisma.userSession
          .update({ where: { id: sid }, data: { lastSeenAt: new Date(now) } })
          .catch(() => {});
      }
    }
  }
  if (entry.revoked || entry.userId !== userId) {
    throw ApiError.unauthorized('ເຊດຊັນນີ້ຖືກອອກຈາກລະບົບແລ້ວ', ErrorCode.TOKEN_INVALID);
  }
}

/** Coarse form factor from a User-Agent — picks the icon in the session list. */
export function deviceKind(ua?: string | null): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (!ua) return 'unknown';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android|okhttp|Expo|CFNetwork|Dart/i.test(ua)) return 'mobile';
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'unknown';
}

/**
 * Self-service security events. The global auditLog middleware skips `/auth/*` (login noise),
 * so account changes write their own `auth.*` rows — they feed /audit-log and /account ▸ Activity.
 * Fire-and-forget: an audit failure never fails the user's action.
 */
export function writeAccountAudit(
  user: { id: string; branchId: string | null },
  action: string,
  newValue?: Prisma.InputJsonValue,
  ipAddress?: string | null,
): void {
  void prisma.auditLog
    .create({
      data: {
        action,
        entityName: 'auth',
        entityId: user.id,
        userId: user.id,
        branchId: user.branchId,
        newValue,
        ipAddress: ipAddress ?? null,
      },
    })
    .catch((err: unknown) => logger.warn({ err, action }, 'account audit write failed'));
}
