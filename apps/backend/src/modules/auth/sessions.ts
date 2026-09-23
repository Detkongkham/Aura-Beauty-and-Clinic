import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { parseDeviceLabel } from '../../utils/userAgent.js';

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
): Promise<string> {
  const session = await tx.userSession.create({
    data: {
      userId,
      method,
      deviceLabel: parseDeviceLabel(ctx.userAgent),
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 400) : null,
      ipAddress: ctx.ipAddress ?? null,
      expiresAt: sessionExpiry(),
    },
    select: { id: true },
  });
  return session.id;
}

/** Only rows that can still mint tokens. */
export function activeSessionWhere(userId: string, now = new Date()): Prisma.UserSessionWhereInput {
  return { userId, revokedAt: null, expiresAt: { gt: now } };
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
