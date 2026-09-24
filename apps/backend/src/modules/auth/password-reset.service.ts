import { randomInt } from 'node:crypto';
import type {
  ForgotPasswordResult,
  IssuedResetCode,
  ResetPasswordInput,
} from '@abcp/shared-types';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isChannelConfigured, sendEmail, sendSms } from '../../services/channels.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword } from '../../utils/password.js';
import { sha256 } from '../../utils/secretBox.js';
import { getSettings } from '../settings/settings.service.js';
import { revokeAllSessions, securityAlert, writeSecurityAudit } from './security.js';
import type { SessionContext } from './sessions.js';

/**
 * Forgot / reset password. A 6-digit code goes out by SMS and/or e-mail (15 min); if neither channel
 * is configured the clinic issues an 8-digit code from web-admin (24 h) and reads it to the person.
 * Both are redeemed by POST /auth/password/reset. Only hashes are stored; each code allows 5 tries.
 */

const SELF_TTL_MIN = 15;
const ADMIN_TTL_HOURS = 24;
const MAX_ATTEMPTS = 5;
/** Self-service requests per phone per SELF_TTL_MIN — beyond it we silently stop sending. */
const MAX_REQUESTS = 3;

const hashCode = (userId: string, code: string) => sha256(`${userId}:${code}`);
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');
const invalidCode = () =>
  ApiError.badRequest('ລະຫັດບໍ່ຖືກຕ້ອງ ຫຼື ໝົດອາຍຸແລ້ວ', { field: 'code', reason: 'CODE_INVALID' });

/** POST /auth/password/forgot — always "accepted", so the endpoint can't be used to probe phones. */
export async function requestReset(phone: string, ctx: SessionContext = {}): Promise<ForgotPasswordResult> {
  const result: ForgotPasswordResult = { accepted: true, expiresInMinutes: SELF_TTL_MIN };
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.deletedAt || !user.isActive) return result;

  const since = new Date(Date.now() - SELF_TTL_MIN * 60_000);
  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: since }, channel: { not: 'ADMIN' } },
  });
  if (recent >= MAX_REQUESTS) return result;

  const code = digits(6);
  const text = `Aura: ລະຫັດຣີເຊັດລະຫັດຜ່ານຂອງທ່ານແມ່ນ ${code} (ໃຊ້ໄດ້ ${SELF_TTL_MIN} ນາທີ). ຢ່າບອກລະຫັດນີ້ກັບໃຜ.`;
  const channels: string[] = [];
  if (isChannelConfigured('SMS') && (await sendSms(user.phone, text)).ok) channels.push('SMS');
  if (user.email && isChannelConfigured('EMAIL')) {
    const sent = await sendEmail(user.email, 'Aura — ລະຫັດຣີເຊັດລະຫັດຜ່ານ', text, `<p>${text}</p>`);
    if (sent.ok) channels.push('EMAIL');
  }
  if (channels.length === 0) {
    if (env.isProd) {
      // Nothing can carry the code — the clinic has to issue one (web-admin ▸ user security).
      writeSecurityAudit({
        action: 'auth.password_reset_undeliverable',
        actorId: null,
        targetId: user.id,
        branchId: user.branchId,
        ipAddress: ctx.ipAddress,
      });
      return result;
    }
    logger.warn({ phone: user.phone, code }, '[password-reset:dev] no SMS/e-mail configured — code logged');
    channels.push('DEV');
  }

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      codeHash: hashCode(user.id, code),
      channel: channels.join('+'),
      expiresAt: new Date(Date.now() + SELF_TTL_MIN * 60_000),
    },
  });
  writeSecurityAudit({
    action: 'auth.password_reset_requested',
    actorId: null,
    targetId: user.id,
    branchId: user.branchId,
    newValue: { channels },
    ipAddress: ctx.ipAddress,
  });
  return result;
}

/** POST /auth/password/reset — redeems a code, sets the password, signs out every device. */
export async function resetPassword(input: ResetPasswordInput, ctx: SessionContext = {}): Promise<{ success: true }> {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || user.deletedAt || !user.isActive) throw invalidCode();

  const now = new Date();
  const live = await prisma.passwordResetToken.findMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const hash = hashCode(user.id, input.code);
  const match = live.find((t) => t.codeHash === hash);
  if (!match) {
    if (live.length > 0) {
      await prisma.passwordResetToken.updateMany({
        where: { id: { in: live.map((t) => t.id) } },
        data: { attempts: { increment: 1 } },
      });
    }
    throw invalidCode();
  }

  const { minPasswordLength } = await getSettings();
  if (input.newPassword.length < minPasswordLength) {
    throw ApiError.badRequest(`ລະຫັດຜ່ານຕ້ອງຍາວຢ່າງໜ້ອຍ ${minPasswordLength} ຕົວອັກສອນ`, {
      field: 'newPassword',
      minPasswordLength,
    });
  }

  const revoked = await prisma.$transaction(async (tx) => {
    // Claim the code atomically — a second concurrent redeem finds usedAt already set.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw invalidCode();
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(input.newPassword),
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    return revokeAllSessions(user.id, 'PASSWORD_RESET', undefined, tx);
  });

  writeSecurityAudit({
    action: 'auth.password_reset',
    actorId: user.id,
    targetId: user.id,
    branchId: user.branchId,
    newValue: { channel: match.channel, revokedSessions: revoked },
    ipAddress: ctx.ipAddress,
  });
  void securityAlert(user.id, 'SECURITY_PASSWORD_RESET', {
    title: 'ລະຫັດຜ່ານຖືກຣີເຊັດແລ້ວ',
    body: 'ລະຫັດຜ່ານຂອງທ່ານຖືກຕັ້ງໃໝ່ ແລະ ທຸກອຸປະກອນຖືກອອກຈາກລະບົບ. ຖ້າບໍ່ແມ່ນທ່ານ ກະລຸນາຕິດຕໍ່ຄລີນິກທັນທີ.',
  });
  return { success: true };
}

/** Admin-issued code (web-admin ▸ user security) for people who can't receive SMS / e-mail. */
export async function issueAdminResetCode(
  target: { id: string; branchId: string | null },
  actorId: string,
  ipAddress?: string,
): Promise<IssuedResetCode> {
  const code = digits(8);
  const expiresAt = new Date(Date.now() + ADMIN_TTL_HOURS * 3_600_000);
  await prisma.passwordResetToken.create({
    data: {
      userId: target.id,
      codeHash: hashCode(target.id, code),
      channel: 'ADMIN',
      expiresAt,
      createdById: actorId,
    },
  });
  writeSecurityAudit({
    action: 'auth.password_reset_issued',
    actorId,
    targetId: target.id,
    branchId: target.branchId,
    ipAddress,
  });
  return { code, expiresAt: expiresAt.toISOString() };
}
