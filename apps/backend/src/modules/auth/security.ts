import jwt from 'jsonwebtoken';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { sendEmail, isChannelConfigured } from '../../services/channels.js';
import { notifyUser } from '../../services/push.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDeviceLabel } from '../../utils/userAgent.js';
import type { AppSettings } from '../settings/settings.service.js';
import type { SessionContext } from './sessions.js';

/**
 * Account-security plumbing shared by login / quick-login / 2FA / password reset:
 * lockout counters, failed-login audit rows, new-device alerts, the short-lived MFA ticket,
 * and an in-process cache of session state for authGuard.
 */

/** Roles Settings ▸ require2fa and ▸ sessionTimeoutMinutes apply to (customers are exempt). */
export const STAFF_ROLES: ReadonlySet<string> = new Set(['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF']);

export function twoFactorRequired(role: string, settings: Pick<AppSettings, 'require2fa'>): boolean {
  return settings.require2fa && STAFF_ROLES.has(role);
}

export type LoginMethod = 'PASSWORD' | 'PIN' | 'MFA';

// --- Audit ------------------------------------------------------------------

/** Security audit row. `userId` = who acted (null for an unknown phone), `entityId` = account concerned. */
export function writeSecurityAudit(params: {
  action: string;
  actorId: string | null;
  targetId: string | null;
  branchId?: string | null;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}): void {
  void prisma.auditLog
    .create({
      data: {
        action: params.action,
        entityName: 'auth',
        entityId: params.targetId,
        userId: params.actorId,
        branchId: params.branchId ?? null,
        newValue: params.newValue,
        ipAddress: params.ipAddress ?? null,
      },
    })
    .catch((err: unknown) => logger.warn({ err, action: params.action }, 'security audit write failed'));
}

/** `02012345678` → `020•••••678` — enough to recognise, not enough to harvest. */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '•'.repeat(phone.length);
  return `${phone.slice(0, 3)}${'•'.repeat(phone.length - 6)}${phone.slice(-3)}`;
}

export function auditLoginFailed(
  user: Pick<User, 'id' | 'branchId'> | null,
  reason: 'unknown_user' | 'inactive' | 'bad_password' | 'bad_pin' | 'bad_code' | 'locked',
  method: LoginMethod,
  ctx: SessionContext,
  phone?: string,
): void {
  writeSecurityAudit({
    action: 'auth.login_failed',
    actorId: user?.id ?? null,
    targetId: user?.id ?? null,
    branchId: user?.branchId ?? null,
    newValue: {
      reason,
      method,
      device: parseDeviceLabel(ctx.userAgent),
      ...(user ? {} : phone ? { phone: maskPhone(phone) } : {}),
    },
    ipAddress: ctx.ipAddress,
  });
}

// --- Lockout ----------------------------------------------------------------

export function lockedError(until: Date): ApiError {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new ApiError(
    423,
    ErrorCode.ACCOUNT_LOCKED,
    `ບັນຊີຖືກລັອກຊົ່ວຄາວ ເພາະເຂົ້າສູ່ລະບົບຜິດຫຼາຍຄັ້ງ — ລອງໃໝ່ໃນ ${minutes} ນາທີ`,
    { lockedUntil: until.toISOString() },
  );
}

/** Throws ACCOUNT_LOCKED while `lockedUntil` is in the future. */
export function assertNotLocked(user: Pick<User, 'id' | 'branchId' | 'lockedUntil'>, method: LoginMethod, ctx: SessionContext): void {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    auditLoginFailed(user, 'locked', method, ctx);
    throw lockedError(user.lockedUntil);
  }
}

/**
 * Counts one failed credential (password, PIN or 2FA code). Crossing Settings ▸ maxLoginAttempts
 * locks the account for ▸ lockoutMinutes, alerts the owner, and returns the lock-out error to throw
 * instead of the generic one (so the person at the keyboard knows to stop guessing).
 */
export async function registerFailure(
  user: Pick<User, 'id' | 'branchId' | 'failedLoginCount'>,
  settings: Pick<AppSettings, 'maxLoginAttempts' | 'lockoutMinutes'>,
  reason: 'bad_password' | 'bad_pin' | 'bad_code',
  method: LoginMethod,
  ctx: SessionContext,
): Promise<ApiError | null> {
  auditLoginFailed(user, reason, method, ctx);
  const max = Math.floor(settings.maxLoginAttempts);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (max <= 0 || updated.failedLoginCount < max) return null;

  const until = new Date(Date.now() + Math.max(1, settings.lockoutMinutes) * 60_000);
  await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: until, failedLoginCount: 0 } });
  writeSecurityAudit({
    action: 'auth.account_locked',
    actorId: user.id,
    targetId: user.id,
    branchId: user.branchId,
    newValue: { attempts: updated.failedLoginCount, until: until.toISOString(), device: parseDeviceLabel(ctx.userAgent) },
    ipAddress: ctx.ipAddress,
  });
  void securityAlert(user.id, 'SECURITY_ACCOUNT_LOCKED', {
    title: 'ບັນຊີຖືກລັອກຊົ່ວຄາວ',
    body: `ມີການເຂົ້າສູ່ລະບົບຜິດ ${updated.failedLoginCount} ຄັ້ງ${ctx.ipAddress ? ` ຈາກ IP ${ctx.ipAddress}` : ''}. ຖ້າບໍ່ແມ່ນທ່ານ ກະລຸນາປ່ຽນລະຫັດຜ່ານ.`,
    data: { until: until.toISOString() },
  });
  return lockedError(until);
}

export async function clearFailures(user: Pick<User, 'id' | 'failedLoginCount' | 'lockedUntil'>): Promise<void> {
  if (user.failedLoginCount === 0 && !user.lockedUntil) return;
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
}

// --- Alerts -----------------------------------------------------------------

/**
 * In-app + push notification (type SECURITY_* — never muted by personal preferences) and, when an
 * e-mail provider is configured and the user has an address, an e-mail copy. Best effort.
 */
export async function securityAlert(
  userId: string,
  type: string,
  msg: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    await notifyUser({ userId, type, title: msg.title, body: msg.body, data: msg.data, severity: 'warning' });
    if (isChannelConfigured('EMAIL')) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email) {
        const html = `<p><strong>${msg.title}</strong></p><p>${msg.body}</p>`;
        await sendEmail(user.email, msg.title, msg.body, html);
      }
    }
  } catch (err) {
    logger.warn({ err, type }, 'security alert failed');
  }
}

/**
 * Alerts the owner when a login comes from a device label never seen on this account.
 * The very first login (no earlier sessions at all) is not "new". Call *before* opening the session.
 */
export async function alertIfNewDevice(
  user: Pick<User, 'id'>,
  ctx: SessionContext,
  settings: Pick<AppSettings, 'newDeviceAlerts'>,
): Promise<void> {
  if (!settings.newDeviceAlerts) return;
  const label = parseDeviceLabel(ctx.userAgent);
  if (!label) return;
  const [anyEarlier, sameDevice] = await Promise.all([
    prisma.userSession.findFirst({ where: { userId: user.id }, select: { id: true } }),
    prisma.userSession.findFirst({ where: { userId: user.id, deviceLabel: label }, select: { id: true } }),
  ]);
  if (!anyEarlier || sameDevice) return;
  void securityAlert(user.id, 'SECURITY_NEW_DEVICE', {
    title: 'ມີອຸປະກອນໃໝ່ເຂົ້າສູ່ລະບົບ',
    body: `${label}${ctx.ipAddress ? ` · IP ${ctx.ipAddress}` : ''}. ຖ້າບໍ່ແມ່ນທ່ານ ໃຫ້ອອກຈາກລະບົບອຸປະກອນນັ້ນ ແລະ ປ່ຽນລະຫັດຜ່ານທັນທີ.`,
    data: { device: label, ipAddress: ctx.ipAddress ?? null },
  });
}

// --- Idle timeout -------------------------------------------------------------

/** Settings ▸ sessionTimeoutMinutes (0 = off) — staff/admin sessions only; customers stay signed in. */
export function isIdle(
  lastSeenAt: Date | number,
  role: string,
  settings: Pick<AppSettings, 'sessionTimeoutMinutes'>,
  now = Date.now(),
): boolean {
  const minutes = Number(settings.sessionTimeoutMinutes);
  if (!STAFF_ROLES.has(role) || !(minutes > 0)) return false;
  return now - +lastSeenAt > minutes * 60_000;
}

export function idleError(): ApiError {
  return ApiError.unauthorized('ອອກຈາກລະບົບອັດຕະໂນມັດ ເພາະບໍ່ມີການເຄື່ອນໄຫວ', ErrorCode.SESSION_IDLE);
}

// --- MFA ticket ---------------------------------------------------------------

const MFA_TTL_SECONDS = 300;
const mfaSecret = () => `${env.JWT_ACCESS_SECRET}:mfa`;

export interface MfaTicket {
  sub: string;
  mode: 'verify' | 'setup';
  method: 'PASSWORD' | 'PIN';
}

export function signMfaTicket(ticket: MfaTicket): { mfaToken: string; expiresIn: number } {
  const mfaToken = jwt.sign({ ...ticket, typ: 'mfa' }, mfaSecret(), { expiresIn: MFA_TTL_SECONDS });
  return { mfaToken, expiresIn: MFA_TTL_SECONDS };
}

export function verifyMfaTicket(token: string, mode: MfaTicket['mode']): MfaTicket {
  try {
    const decoded = jwt.verify(token, mfaSecret()) as MfaTicket & { typ?: string };
    if (decoded.typ !== 'mfa' || decoded.mode !== mode) throw new Error('wrong ticket');
    return { sub: decoded.sub, mode: decoded.mode, method: decoded.method };
  } catch {
    throw ApiError.unauthorized('ການຢືນຢັນໝົດເວລາ ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່', ErrorCode.TOKEN_EXPIRED);
  }
}

// --- Session state cache (authGuard) -----------------------------------------

export interface CachedSession {
  checkedAt: number;
  userId: string;
  revoked: boolean;
  expiresAt: number;
  lastSeenAt: number;
}

/** sid → last DB read. Re-read after SESSION_CACHE_MS; revocations in this process drop entries at once. */
export const sessionCache = new Map<string, CachedSession>();
export const SESSION_CACHE_MS = 30_000;

export function forgetSession(sid: string): void {
  sessionCache.delete(sid);
}

export function forgetUserSessions(userId: string): void {
  for (const [sid, s] of sessionCache) if (s.userId === userId) sessionCache.delete(sid);
}

/** Lets the realtime layer drop live sockets of revoked sessions without importing it here (avoids a cycle). */
type RevokeTarget = { sid?: string; userId?: string; exceptSid?: string };
const revokeListeners = new Set<(t: RevokeTarget) => void>();
export function onSessionsRevoked(fn: (t: RevokeTarget) => void): () => void {
  revokeListeners.add(fn);
  return () => revokeListeners.delete(fn);
}
export function notifySessionsRevoked(t: RevokeTarget): void {
  for (const fn of revokeListeners) {
    try {
      fn(t);
    } catch {
      // A listener must never break a revoke.
    }
  }
}

/**
 * Revokes every live session of a user (admin action, deactivation, password reset).
 * `exceptSid` keeps the caller's own session.
 */
export async function revokeAllSessions(
  userId: string,
  reason: string,
  exceptSid?: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const res = await tx.userSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSid ? { id: { not: exceptSid } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  forgetUserSessions(userId);
  notifySessionsRevoked({ userId, exceptSid });
  return res.count;
}
