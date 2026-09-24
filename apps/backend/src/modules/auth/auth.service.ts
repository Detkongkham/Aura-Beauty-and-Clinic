import { setConsent } from '../marketing/consent.service.js';
import {
  mergePermissionOverrides,
  rolePermissions,
  type AuthResponse,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResult,
  type MfaChallenge,
  type RegisterInput,
  type UpdateProfileInput,
} from '@abcp/shared-types';
import type { User } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/token.js';
import { parseDeviceLabel } from '../../utils/userAgent.js';
import { getCachedSettings, getSettings, type AppSettings } from '../settings/settings.service.js';
import {
  alertIfNewDevice,
  assertNotLocked,
  auditLoginFailed,
  clearFailures,
  forgetSession,
  idleError,
  isIdle,
  registerFailure,
  revokeAllSessions,
  securityAlert,
  signMfaTicket,
  twoFactorRequired,
  writeSecurityAudit,
} from './security.js';
import {
  openSession,
  revokeSessionById,
  sessionExpiry,
  writeAccountAudit,
  type SessionContext,
  type SessionMethod,
} from './sessions.js';

export async function toAuthUser(user: User): Promise<AuthUser> {
  const [overrides, roleRef] = await Promise.all([
    prisma.userPermissionOverride.findMany({
      where: { userId: user.id },
      select: { permission: true, granted: true },
    }),
    user.roleRefId
      ? prisma.role.findUnique({ where: { id: user.roleRefId }, select: { permissions: true } })
      : null,
  ]);
  const base = roleRef ? roleRef.permissions : rolePermissions(user.role);
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    permissions: mergePermissionOverrides(base, overrides),
    allowDirectMessages: user.allowDirectMessages,
    avatarUrl: user.avatarUrl,
  };
}

function issueTokens(user: User, sid: string): AuthResponse['tokens'] {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, branchId: user.branchId, sid });
  const { token: refreshToken } = signRefreshToken(user.id, sid);
  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

/** Best-effort activity stamp — never blocks or fails the login response. */
function recordLogin(userId: string, userAgent?: string): void {
  void prisma.user
    .update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastLoginDevice: parseDeviceLabel(userAgent) },
    })
    .catch(() => {});
}

export async function register(
  input: RegisterInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthResponse> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
  });
  if (existing) throw ApiError.conflict('ເບີໂທ ຫຼື ອີເມວນີ້ຖືກໃຊ້ແລ້ວ');

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        password: await hashPassword(input.password),
        branchId: input.branchId ?? null,
        role: 'CUSTOMER',
        loyaltyAccount: { create: {} },
      },
    });
    // Wave 10G — opt-in ແບບຊັດເຈນ: ບັນທຶກພຽງເມື່ອລູກຄ້າຕິກເອງ (ບໍ່ຕິກລ່ວງໜ້າ).
    if (input.marketingOptIn === true) {
      await setConsent(created.id, 'PUSH', true, { source: 'register', actorId: created.id, ipAddress }, tx);
    }
    return created;
  });

  const sid = await openSession(user.id, 'REGISTER', { userAgent, ipAddress });
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
}

const invalidCredentials = () =>
  ApiError.unauthorized('ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);

/**
 * Last step of every successful sign-in (password, PIN, 2FA): clears the failure counter, alerts on
 * an unseen device, opens the session and writes an `auth.login` audit row.
 */
export async function completeLogin(
  user: User,
  method: SessionMethod,
  ctx: SessionContext,
  mfa: boolean,
): Promise<AuthResponse> {
  const settings = await getCachedSettings();
  await clearFailures(user);
  recordLogin(user.id, ctx.userAgent ?? undefined);
  await alertIfNewDevice(user, ctx, settings).catch(() => {});
  const sid = await openSession(user.id, method, ctx, prisma, mfa);
  writeSecurityAudit({
    action: 'auth.login',
    actorId: user.id,
    targetId: user.id,
    branchId: user.branchId,
    newValue: { method, mfa, device: parseDeviceLabel(ctx.userAgent), sessionId: sid },
    ipAddress: ctx.ipAddress,
  });
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
}

/** The second step a password login still owes, if any. */
function mfaChallengeFor(user: User, settings: AppSettings): MfaChallenge | null {
  const mode = user.twoFactorEnabledAt && user.twoFactorSecret
    ? 'verify'
    : twoFactorRequired(user.role, settings)
      ? 'setup'
      : null;
  if (!mode) return null;
  return { mfaRequired: true, mode, ...signMfaTicket({ sub: user.id, mode, method: 'PASSWORD' }) };
}

export async function login(input: LoginInput, ctx: SessionContext = {}): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.password || user.deletedAt || !user.isActive) {
    const known = user && !user.deletedAt ? user : null;
    auditLoginFailed(known, known ? 'inactive' : 'unknown_user', 'PASSWORD', ctx, input.phone);
    throw invalidCredentials();
  }
  assertNotLocked(user, 'PASSWORD', ctx);
  const settings = await getCachedSettings();
  const ok = await verifyPassword(input.password, user.password);
  if (!ok) {
    throw (await registerFailure(user, settings, 'bad_password', 'PASSWORD', ctx)) ?? invalidCredentials();
  }
  return mfaChallengeFor(user, settings) ?? completeLogin(user, 'PASSWORD', ctx, false);
}

/**
 * Rotates tokens for a live session. A revoked / expired / foreign `sid` is refused, which is
 * what makes "sign out this device" stick. Tokens minted before sessions existed carry no
 * `sid` — they get a LEGACY row on first refresh so they show up (and can be revoked) too.
 */
export async function refresh(refreshToken: string, ctx: SessionContext = {}): Promise<AuthResponse> {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt || !user.isActive) {
    throw ApiError.unauthorized('ບໍ່ພົບຜູ້ໃຊ້', ErrorCode.TOKEN_INVALID);
  }

  let sid = payload.sid;
  if (sid) {
    const now = new Date();
    const session = await prisma.userSession.findUnique({ where: { id: sid } });
    if (!session || session.userId !== user.id || session.expiresAt <= now) {
      throw ApiError.unauthorized('ເຊດຊັນນີ້ຖືກອອກຈາກລະບົບແລ້ວ', ErrorCode.TOKEN_INVALID);
    }
    if (session.revokedAt) {
      if (session.revokedReason === 'IDLE') throw idleError();
      throw ApiError.unauthorized('ເຊດຊັນນີ້ຖືກອອກຈາກລະບົບແລ້ວ', ErrorCode.TOKEN_INVALID);
    }
    const settings = await getCachedSettings();
    if (isIdle(session.lastSeenAt, user.role, settings, now.getTime())) {
      await revokeSessionById(sid, 'IDLE');
      throw idleError();
    }
    // Settings ▸ require2fa switched on after this session began: sign in again (and enrol).
    if (twoFactorRequired(user.role, settings) && !user.twoFactorEnabledAt) {
      await revokeSessionById(sid, 'MFA_REQUIRED');
      throw ApiError.unauthorized('ຕ້ອງເປີດການຢືນຢັນ 2 ຂັ້ນຕອນ — ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່', ErrorCode.MFA_REQUIRED);
    }
    await prisma.userSession.update({
      where: { id: sid },
      data: {
        lastSeenAt: now,
        expiresAt: sessionExpiry(now),
        ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
      },
    });
    forgetSession(sid);
  } else {
    sid = await openSession(user.id, 'LEGACY', ctx);
  }
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
}

/** POST /auth/logout — revokes the session behind this refresh token. Idempotent, never throws. */
export async function logout(refreshToken: string): Promise<{ success: true }> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.sid) await revokeSessionById(payload.sid, 'LOGOUT', payload.sub);
  } catch {
    // Expired / malformed token: nothing left to revoke.
  }
  return { success: true };
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  return toAuthUser(user);
}

/** PATCH /auth/me — ອັບເດດຊື່ / ອີເມວ / ຮູບຂອງຕົນເອງ. */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  ipAddress?: string,
): Promise<AuthUser> {
  if (input.email) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email, id: { not: userId } },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict('ອີເມວນີ້ຖືກໃຊ້ແລ້ວ');
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.allowDirectMessages !== undefined
        ? { allowDirectMessages: input.allowDirectMessages }
        : {}),
    },
  });
  // Field names only — the avatar data URL would bloat the log.
  const fields = Object.keys(input).filter((k) => input[k as keyof UpdateProfileInput] !== undefined);
  writeAccountAudit(user, 'auth.profile_updated', { fields }, ipAddress);
  return toAuthUser(user);
}

/**
 * POST /auth/change-password — ຢືນຢັນລະຫັດປັດຈຸບັນ ແລ້ວປ່ຽນ. ບັງຄັບ Settings ▸ minPasswordLength,
 * ຫ້າມໃຊ້ລະຫັດເດີມຊ້ຳ, ແລະ (ຖ້າຂໍ) ຖອນເຊດຊັນອື່ນທັງໝົດ ຍົກເວັ້ນເຊດຊັນທີ່ກຳລັງໃຊ້.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentSid?: string,
  ipAddress?: string,
): Promise<{ success: true; revokedSessions: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  const ok = await verifyPassword(input.currentPassword, user.password);
  if (!ok) {
    throw ApiError.unauthorized('ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  const { minPasswordLength } = await getSettings();
  if (input.newPassword.length < minPasswordLength) {
    throw ApiError.badRequest(`ລະຫັດຜ່ານຕ້ອງຍາວຢ່າງໜ້ອຍ ${minPasswordLength} ຕົວອັກສອນ`, {
      field: 'newPassword',
      minPasswordLength,
    });
  }
  if (await verifyPassword(input.newPassword, user.password)) {
    throw ApiError.badRequest('ລະຫັດຜ່ານໃໝ່ຕ້ອງບໍ່ຊ້ຳກັບລະຫັດເດີມ', { field: 'newPassword', reason: 'SAME_AS_CURRENT' });
  }

  const now = new Date();
  const revokedSessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { password: await hashPassword(input.newPassword), passwordChangedAt: now },
    });
    if (!input.signOutOthers) return 0;
    return revokeAllSessions(userId, 'PASSWORD_CHANGED', currentSid, tx);
  });
  writeAccountAudit(user, 'auth.password_changed', { revokedSessions }, ipAddress);
  void securityAlert(userId, 'SECURITY_PASSWORD_CHANGED', {
    title: 'ລະຫັດຜ່ານຖືກປ່ຽນແລ້ວ',
    body: 'ລະຫັດຜ່ານບັນຊີຂອງທ່ານຫາກໍຖືກປ່ຽນ. ຖ້າບໍ່ແມ່ນທ່ານ ກະລຸນາຕິດຕໍ່ຄລີນິກທັນທີ.',
  });
  return { success: true, revokedSessions };
}

/**
 * PIN-based login for admin/staff terminals — set up via Settings ▸ Quick Login. Shares the lockout
 * counter with password logins (a 4-digit PIN is otherwise trivially guessable). The PIN skips the
 * authenticator prompt, but when Settings ▸ require2fa applies the account must already be enrolled.
 */
export async function quickLogin(userId: string, pin: string, ctx: SessionContext = {}): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !user ||
    !user.quickLoginEnabled ||
    !user.quickLoginPin ||
    user.deletedAt ||
    !user.isActive
  ) {
    auditLoginFailed(user && !user.deletedAt ? user : null, 'inactive', 'PIN', ctx);
    throw ApiError.unauthorized('Quick Login ບໍ່ຖືກເປີດໃຊ້ ຫຼື ບໍ່ພົບຜູ້ໃຊ້', ErrorCode.INVALID_CREDENTIALS);
  }
  assertNotLocked(user, 'PIN', ctx);
  const settings = await getCachedSettings();
  const ok = await verifyPassword(pin, user.quickLoginPin);
  if (!ok) {
    throw (
      (await registerFailure(user, settings, 'bad_pin', 'PIN', ctx)) ??
      ApiError.unauthorized('ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS)
    );
  }
  if (twoFactorRequired(user.role, settings) && !user.twoFactorEnabledAt) {
    throw new ApiError(
      403,
      ErrorCode.MFA_REQUIRED,
      'ຕ້ອງເປີດການຢືນຢັນ 2 ຂັ້ນຕອນກ່ອນ — ເຂົ້າສູ່ລະບົບດ້ວຍລະຫັດຜ່ານເພື່ອຕັ້ງຄ່າ',
    );
  }
  return completeLogin(user, 'PIN', ctx, false);
}
