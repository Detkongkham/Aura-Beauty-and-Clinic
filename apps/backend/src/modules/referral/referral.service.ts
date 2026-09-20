import { randomBytes } from 'node:crypto';
import type {
  MyReferralView,
  Paginated,
  PaginationQuery,
  ReferralUsageView,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { earnPoints } from '../loyalty/loyalty.service.js';

type Db = Prisma.TransactionClient | typeof prisma;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ບໍ່ມີ O/0/I/1
const CURRENCY = 'LAK';

function randomCode(): string {
  const bytes = randomBytes(6);
  let out = 'AURA-';
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

/** ຮັບປະກັນວ່າ user ມີ ReferralCode — ສ້າງໃຫ້ຄັ້ງທຳອິດ (retry ເມື່ອ code ຊ້ຳ). */
export async function ensureCode(
  db: Db,
  userId: string,
): Promise<{ id: string; code: string; discountAmount: number }> {
  const existing = await db.referralCode.findUnique({
    where: { userId },
    select: { id: true, code: true, discountAmount: true },
  });
  if (existing) return { ...existing, discountAmount: existing.discountAmount.toNumber() };

  for (let attempt = 1; ; attempt += 1) {
    try {
      const row = await db.referralCode.create({
        data: { userId, code: randomCode() },
        select: { id: true, code: true, discountAmount: true },
      });
      return { ...row, discountAmount: row.discountAmount.toNumber() };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002' && attempt < 5) continue;
      throw err;
    }
  }
}

// ---- customer views ------------------------------------------------

export async function getMyReferral(userId: string): Promise<MyReferralView> {
  const code = await ensureCode(prisma, userId);
  const [totalReferred, totalRewarded, affiliate] = await Promise.all([
    prisma.referralUsage.count({ where: { referralCodeId: code.id } }),
    prisma.referralUsage.count({ where: { referralCodeId: code.id, rewardClaimed: true } }),
    prisma.affiliateProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return {
    code: code.code,
    discountAmount: code.discountAmount,
    currency: CURRENCY,
    totalReferred,
    totalRewarded,
    isAffiliate: affiliate != null,
  };
}

export async function getMyUsages(
  userId: string,
  query: PaginationQuery,
): Promise<Paginated<ReferralUsageView>> {
  const code = await ensureCode(prisma, userId);
  const where = { referralCodeId: code.id };
  const [rows, total] = await Promise.all([
    prisma.referralUsage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { referredUser: { select: { name: true } } },
    }),
    prisma.referralUsage.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      referredUserName: r.referredUser.name,
      appointmentId: r.appointmentId,
      rewardClaimed: r.rewardClaimed,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---- hooks used by booking / completion --------------------------

/**
 * ນຳໃຊ້ລະຫັດແນະນຳຕອນຈອງຄິວ. ຄືນຄ່າສ່ວນຫຼຸດ (LAK) ທີ່ຕ້ອງຫັກອອກຈາກ totalAmount, ຫຼື 0.
 * ໃຊ້ໄດ້ຄັ້ງດຽວຕໍ່ຜູ້ຖືກແນະນຳ ແລະ ຫ້າມໃຊ້ລະຫັດຂອງຕົນເອງ.
 */
export async function applyReferralAtBooking(
  tx: Prisma.TransactionClient,
  params: { referredUserId: string; code: string; appointmentId: string },
): Promise<number> {
  const codeRow = await tx.referralCode.findUnique({
    where: { code: params.code.toUpperCase() },
    select: { id: true, userId: true, discountAmount: true },
  });
  if (!codeRow) throw ApiError.badRequest('ບໍ່ພົບລະຫັດແນະນຳ');
  if (codeRow.userId === params.referredUserId) {
    throw ApiError.badRequest('ໃຊ້ລະຫັດແນະນຳຂອງຕົນເອງບໍ່ໄດ້');
  }

  const prior = await tx.referralUsage.findFirst({
    where: { referredUserId: params.referredUserId },
    select: { id: true },
  });
  if (prior) throw ApiError.badRequest('ບັນຊີນີ້ໃຊ້ລະຫັດແນະນຳໄປແລ້ວ');

  await tx.referralUsage.create({
    data: {
      referralCodeId: codeRow.id,
      referredUserId: params.referredUserId,
      appointmentId: params.appointmentId,
      rewardClaimed: false,
    },
  });
  return codeRow.discountAmount.toNumber();
}

/**
 * ຕອນຄິວ COMPLETED — ໃຫ້ລາງວັນຜູ້ແນະນຳ: ຄະແນນ loyalty (ມູນຄ່າ = discountAmount) +
 * ຖ້າຜູ້ແນະນຳເປັນ affiliate → ບວກຄ່ານາຍໜ້າ % ຂອງ totalAmount ເຂົ້າ unpaidBalance.
 * idempotent — ຂ້າມຖ້າ rewardClaimed ແລ້ວ.
 */
export async function rewardReferralOnComplete(
  tx: Prisma.TransactionClient,
  appointmentId: string,
): Promise<void> {
  const usage = await tx.referralUsage.findFirst({
    where: { appointmentId, rewardClaimed: false },
    include: {
      referralCode: { select: { userId: true, discountAmount: true } },
    },
  });
  if (!usage) return;

  const appt = await tx.appointment.findUnique({
    where: { id: appointmentId },
    select: { totalAmount: true },
  });
  if (!appt) return;

  const referrerId = usage.referralCode.userId;
  await earnPoints(tx, {
    userId: referrerId,
    amountLak: usage.referralCode.discountAmount.toNumber(),
    refId: `referral:${usage.id}`,
    notes: 'ລາງວັນແນະນຳໝູ່',
  });

  const affiliate = await tx.affiliateProfile.findUnique({
    where: { userId: referrerId },
    select: { id: true, commissionRate: true },
  });
  if (affiliate) {
    const commission =
      Math.round(appt.totalAmount.toNumber() * affiliate.commissionRate * 100) / 100;
    if (commission > 0) {
      await tx.affiliateProfile.update({
        where: { id: affiliate.id },
        data: {
          totalEarnings: { increment: commission },
          unpaidBalance: { increment: commission },
        },
      });
    }
  }

  await tx.referralUsage.update({ where: { id: usage.id }, data: { rewardClaimed: true } });
}
