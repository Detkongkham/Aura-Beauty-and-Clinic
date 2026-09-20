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

async function toAuthUser(user: User): Promise<AuthUser> {
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
  };
}

function issueTokens(user: User): AuthResponse['tokens'] {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, branchId: user.branchId });
  const { token: refreshToken } = signRefreshToken(user.id);
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

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
  });
  if (existing) throw ApiError.conflict('ເບີໂທ ຫຼື ອີເມວນີ້ຖືກໃຊ້ແລ້ວ');

  const user = await prisma.user.create({
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

  return { user: await toAuthUser(user), tokens: issueTokens(user) };
}

export async function login(input: LoginInput, userAgent?: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.password || user.deletedAt || !user.isActive) {
    throw ApiError.unauthorized('ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  const ok = await verifyPassword(input.password, user.password);
  if (!ok) {
    throw ApiError.unauthorized('ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  recordLogin(user.id, userAgent);
  return { user: await toAuthUser(user), tokens: issueTokens(user) };
}

export async function refresh(refreshToken: string): Promise<AuthResponse> {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt || !user.isActive) {
    throw ApiError.unauthorized('ບໍ່ພົບຜູ້ໃຊ້', ErrorCode.TOKEN_INVALID);
  }
  return { user: await toAuthUser(user), tokens: issueTokens(user) };
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  return toAuthUser(user);
}

/** PATCH /auth/me — ອັບເດດຊື່ / ອີເມວຂອງຕົນເອງ. */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
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
      ...(input.allowDirectMessages !== undefined
        ? { allowDirectMessages: input.allowDirectMessages }
        : {}),
    },
  });
  return toAuthUser(user);
}

/** POST /auth/change-password — ຢືນຢັນລະຫັດປັດຈຸບັນ ແລ້ວປ່ຽນ. */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<{ success: true }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  const ok = await verifyPassword(input.currentPassword, user.password);
  if (!ok) {
    throw ApiError.unauthorized('ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(input.newPassword) },
  });
  return { success: true };
}

/** PIN-based login for admin/staff terminals — set up via Settings ▸ Quick Login. */
export async function quickLogin(userId: string, pin: string, userAgent?: string): Promise<AuthResponse> {
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
  recordLogin(user.id, userAgent);
  return { user: await toAuthUser(user), tokens: issueTokens(user) };
}
