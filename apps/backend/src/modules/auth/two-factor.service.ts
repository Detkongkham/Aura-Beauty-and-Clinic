import type {
  AuthResponse,
  DisableTwoFactorInput,
  MfaActivateResult,
  TwoFactorSetup,
  TwoFactorStatus,
} from '@abcp/shared-types';
import type { User } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { verifyPassword } from '../../utils/password.js';
import { open, seal, sha256 } from '../../utils/secretBox.js';
import { generateRecoveryCodes, generateTotpSecret, otpauthUrl, verifyTotp } from '../../utils/totp.js';
import { getCachedSettings } from '../settings/settings.service.js';
import { completeLogin } from './auth.service.js';
import {
  assertNotLocked,
  registerFailure,
  securityAlert,
  twoFactorRequired,
  verifyMfaTicket,
  writeSecurityAudit,
} from './security.js';
import type { SessionContext } from './sessions.js';

/**
 * Authenticator-app 2FA (TOTP). Enrolment stores the sealed secret with `twoFactorEnabledAt = null`
 * (pending) until the first valid code confirms the phone has it; recovery codes are kept as sha256.
 */

const invalidCode = () => ApiError.unauthorized('ລະຫັດຢືນຢັນບໍ່ຖືກຕ້ອງ', ErrorCode.MFA_INVALID);

async function loadUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || !user.isActive) throw ApiError.unauthorized('ບໍ່ພົບຜູ້ໃຊ້', ErrorCode.MFA_INVALID);
  return user;
}

const normalizeCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
const hashRecovery = (userId: string, code: string) => sha256(`${userId}:${normalizeCode(code)}`);

/** Checks a TOTP or (consuming it) a recovery code (`XXXX-XXXX`, any case, dash optional). */
async function checkCode(user: User, raw: string, allowPending = false): Promise<'totp' | 'recovery' | null> {
  const code = normalizeCode(raw);
  if (!user.twoFactorSecret || (!user.twoFactorEnabledAt && !allowPending)) return null;
  if (/^\d{6}$/.test(code)) return verifyTotp(open(user.twoFactorSecret), code) ? 'totp' : null;
  if (!user.twoFactorEnabledAt) return null;
  const hash = hashRecovery(user.id, code);
  if (!user.twoFactorRecoveryCodes.includes(hash)) return null;
  // Conditional update: two concurrent uses of one code can't both succeed.
  const res = await prisma.user.updateMany({
    where: { id: user.id, twoFactorRecoveryCodes: { has: hash } },
    data: { twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((h) => h !== hash) },
  });
  return res.count === 1 ? 'recovery' : null;
}

async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorRecoveryCodes: codes.map((c) => hashRecovery(userId, c)) },
  });
  return codes;
}

async function startEnrolment(user: User): Promise<TwoFactorSetup> {
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: seal(secret), twoFactorEnabledAt: null, twoFactorRecoveryCodes: [] },
  });
  return { secret, otpauthUrl: otpauthUrl(secret, user.phone, env.TWO_FACTOR_ISSUER) };
}

/** Confirms a pending enrolment with the first code; returns fresh recovery codes. */
async function finishEnrolment(user: User, code: string, ctx: SessionContext): Promise<string[]> {
  if (!user.twoFactorSecret || user.twoFactorEnabledAt) {
    throw ApiError.badRequest('ຍັງບໍ່ໄດ້ເລີ່ມຕັ້ງຄ່າ 2FA', { reason: 'NO_PENDING_SETUP' });
  }
  if ((await checkCode(user, code, true)) !== 'totp') throw invalidCode();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: new Date() } });
  const codes = await issueRecoveryCodes(user.id);
  writeSecurityAudit({
    action: 'auth.2fa_enabled',
    actorId: user.id,
    targetId: user.id,
    branchId: user.branchId,
    ipAddress: ctx.ipAddress,
  });
  return codes;
}

// --- Login flow (public, carries an mfaToken) ---------------------------------

/** POST /auth/2fa/verify — second step of a password login. */
export async function verifyLogin(mfaToken: string, code: string, ctx: SessionContext): Promise<AuthResponse> {
  const ticket = verifyMfaTicket(mfaToken, 'verify');
  const user = await loadUser(ticket.sub);
  assertNotLocked(user, 'MFA', ctx);
  const kind = await checkCode(user, code);
  if (!kind) {
    const settings = await getCachedSettings();
    throw (await registerFailure(user, settings, 'bad_code', 'MFA', ctx)) ?? invalidCode();
  }
  if (kind === 'recovery') {
    writeSecurityAudit({
      action: 'auth.2fa_recovery_used',
      actorId: user.id,
      targetId: user.id,
      branchId: user.branchId,
      newValue: { left: Math.max(0, user.twoFactorRecoveryCodes.length - 1) },
      ipAddress: ctx.ipAddress,
    });
    void securityAlert(user.id, 'SECURITY_RECOVERY_CODE_USED', {
      title: 'ມີການໃຊ້ລະຫັດກູ້ຄືນ 2FA',
      body: 'ລະຫັດກູ້ຄືນ 1 ລະຫັດຖືກໃຊ້ເຂົ້າສູ່ລະບົບ. ຖ້າບໍ່ແມ່ນທ່ານ ກະລຸນາປ່ຽນລະຫັດຜ່ານທັນທີ.',
    });
  }
  return completeLogin(user, ticket.method, ctx, true);
}

/** POST /auth/2fa/setup — Settings ▸ require2fa forced enrolment during login. */
export async function setupDuringLogin(mfaToken: string): Promise<TwoFactorSetup> {
  const ticket = verifyMfaTicket(mfaToken, 'setup');
  const user = await loadUser(ticket.sub);
  if (user.twoFactorEnabledAt) throw ApiError.conflict('2FA ເປີດໃຊ້ແລ້ວ');
  return startEnrolment(user);
}

/** POST /auth/2fa/activate — confirms the forced enrolment and signs in. */
export async function activateDuringLogin(
  mfaToken: string,
  code: string,
  ctx: SessionContext,
): Promise<MfaActivateResult> {
  const ticket = verifyMfaTicket(mfaToken, 'setup');
  const user = await loadUser(ticket.sub);
  const recoveryCodes = await finishEnrolment(user, code, ctx);
  const auth = await completeLogin(user, ticket.method, ctx, true);
  return { ...auth, recoveryCodes };
}

// --- Self-service (/auth/me/2fa/*) ---------------------------------------------

async function assertPassword(user: User, password: string): Promise<void> {
  if (!user.password || !(await verifyPassword(password, user.password))) {
    throw ApiError.unauthorized('ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ', ErrorCode.INVALID_CREDENTIALS);
  }
}

export async function status(user: User): Promise<TwoFactorStatus> {
  const settings = await getCachedSettings();
  return {
    enabled: Boolean(user.twoFactorEnabledAt),
    enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
    recoveryCodesLeft: user.twoFactorEnabledAt ? user.twoFactorRecoveryCodes.length : 0,
    required: twoFactorRequired(user.role, settings),
  };
}

export async function startSelfSetup(userId: string, currentPassword: string): Promise<TwoFactorSetup> {
  const user = await loadUser(userId);
  await assertPassword(user, currentPassword);
  if (user.twoFactorEnabledAt) throw ApiError.conflict('2FA ເປີດໃຊ້ແລ້ວ');
  return startEnrolment(user);
}

export async function enableSelf(userId: string, code: string, ipAddress?: string): Promise<{ recoveryCodes: string[] }> {
  const user = await loadUser(userId);
  const recoveryCodes = await finishEnrolment(user, code, { ipAddress });
  void securityAlert(userId, 'SECURITY_2FA_ENABLED', {
    title: 'ເປີດການຢືນຢັນ 2 ຂັ້ນຕອນແລ້ວ',
    body: 'ບັນຊີຂອງທ່ານຕ້ອງໃຊ້ລະຫັດຈາກແອັບ authenticator ທຸກຄັ້ງທີ່ເຂົ້າສູ່ລະບົບ.',
  });
  return { recoveryCodes };
}

export async function disableSelf(userId: string, input: DisableTwoFactorInput, ipAddress?: string): Promise<{ enabled: false }> {
  const user = await loadUser(userId);
  if (twoFactorRequired(user.role, await getCachedSettings())) {
    throw new ApiError(403, ErrorCode.MFA_REQUIRED, 'ນະໂຍບາຍຂອງຮ້ານບັງຄັບໃຊ້ 2FA — ປິດບໍ່ໄດ້');
  }
  await assertPassword(user, input.currentPassword);
  if (!(await checkCode(user, input.code))) throw invalidCode();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: [] },
  });
  writeSecurityAudit({ action: 'auth.2fa_disabled', actorId: userId, targetId: userId, branchId: user.branchId, ipAddress });
  void securityAlert(userId, 'SECURITY_2FA_DISABLED', {
    title: 'ປິດການຢືນຢັນ 2 ຂັ້ນຕອນແລ້ວ',
    body: 'ຖ້າບໍ່ແມ່ນທ່ານ ກະລຸນາປ່ຽນລະຫັດຜ່ານ ແລະ ເປີດ 2FA ຄືນທັນທີ.',
  });
  return { enabled: false };
}

export async function regenerateRecoveryCodes(
  userId: string,
  input: DisableTwoFactorInput,
  ipAddress?: string,
): Promise<{ recoveryCodes: string[] }> {
  const user = await loadUser(userId);
  if (!user.twoFactorEnabledAt) throw ApiError.badRequest('ຍັງບໍ່ໄດ້ເປີດ 2FA');
  await assertPassword(user, input.currentPassword);
  if ((await checkCode(user, input.code)) !== 'totp') throw invalidCode();
  const recoveryCodes = await issueRecoveryCodes(userId);
  writeSecurityAudit({ action: 'auth.2fa_codes_regenerated', actorId: userId, targetId: userId, branchId: user.branchId, ipAddress });
  return { recoveryCodes };
}
