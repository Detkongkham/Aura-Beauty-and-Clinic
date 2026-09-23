import { setConsent } from '../marketing/consent.service.js';
import {
  mergePermissionOverrides,
  rolePermissions,
  type AuthResponse,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
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
import { getSettings } from '../settings/settings.service.js';
import { openSession, sessionExpiry, writeAccountAudit, type SessionContext } from './sessions.js';

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

export async function login(input: LoginInput, ctx: SessionContext = {}): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.password || user.deletedAt || !user.isActive) {
    throw ApiError.unauthorized('ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  const ok = await verifyPassword(input.password, user.password);
  if (!ok) {
    throw ApiError.unauthorized('ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  recordLogin(user.id, ctx.userAgent ?? undefined);
  const sid = await openSession(user.id, 'PASSWORD', ctx);
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
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
    if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= now) {
      throw ApiError.unauthorized('ເຊດຊັນນີ້ຖືກອອກຈາກລະບົບແລ້ວ', ErrorCode.TOKEN_INVALID);
    }
    await prisma.userSession.update({
      where: { id: sid },
      data: {
        lastSeenAt: now,
        expiresAt: sessionExpiry(now),
        ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
      },
    });
  } else {
    sid = await openSession(user.id, 'LEGACY', ctx);
  }
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
}

/** POST /auth/logout — revokes the session behind this refresh token. Idempotent, never throws. */
export async function logout(refreshToken: string): Promise<{ success: true }> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.sid) {
      await prisma.userSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
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
    const res = await tx.userSession.updateMany({
      where: { userId, revokedAt: null, ...(currentSid ? { id: { not: currentSid } } : {}) },
      data: { revokedAt: now },
    });
    return res.count;
  });
  writeAccountAudit(user, 'auth.password_changed', { revokedSessions }, ipAddress);
  return { success: true, revokedSessions };
}

/** PIN-based login for admin/staff terminals — set up via Settings ▸ Quick Login. */
export async function quickLogin(userId: string, pin: string, ctx: SessionContext = {}): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !user ||
    !user.quickLoginEnabled ||
    !user.quickLoginPin ||
    user.deletedAt ||
    !user.isActive
  ) {
    throw ApiError.unauthorized('Quick Login ບໍ່ຖືກເປີດໃຊ້ ຫຼື ບໍ່ພົບຜູ້ໃຊ້', ErrorCode.INVALID_CREDENTIALS);
  }
  const ok = await verifyPassword(pin, user.quickLoginPin);
  if (!ok) {
    throw ApiError.unauthorized('ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  recordLogin(user.id, ctx.userAgent ?? undefined);
  const sid = await openSession(user.id, 'PIN', ctx);
  return { user: await toAuthUser(user), tokens: issueTokens(user, sid) };
}
