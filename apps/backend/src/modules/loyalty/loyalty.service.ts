import type {
  LoyaltyAccountListQuery,
  LoyaltyAccountView,
  LoyaltyAdjustInput,
  LoyaltyLedgerQuery,
  LoyaltyTransactionView,
  Paginated,
} from '@abcp/shared-types';
import {
  LOYALTY_EARN_DIVISOR_LAK,
  LOYALTY_POINT_VALUE_LAK,
  LOYALTY_TIER_THRESHOLDS,
  tierForLifetimePoints,
} from '@abcp/shared-types';
import type { LoyaltyTier, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

type Db = Prisma.TransactionClient | typeof prisma;

const TIER_ORDER: LoyaltyTier[] = ['SILVER', 'GOLD', 'PLATINUM'];

async function ensureAccount(db: Db, userId: string): Promise<{ id: string }> {
  return db.loyaltyAccount.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { id: true },
  });
}

/** ຄະແນນສະສົມທັງໝົດ (lifetime earned) = ຜົນລວມຂອງ tx ທີ່ບວກ. */
async function lifetimePoints(db: Db, loyaltyAccountId: string): Promise<number> {
  const agg = await db.loyaltyTransaction.aggregate({
    where: { loyaltyAccountId, points: { gt: 0 } },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

async function recomputeTier(db: Db, loyaltyAccountId: string): Promise<LoyaltyTier> {
  const lifetime = await lifetimePoints(db, loyaltyAccountId);
  const tier = tierForLifetimePoints(lifetime) as LoyaltyTier;
  await db.loyaltyAccount.update({ where: { id: loyaltyAccountId }, data: { tierLevel: tier } });
  return tier;
}

// ---- hooks used by other modules -------------------------------------

/**
 * ໃຫ້ຄະແນນເມື່ອບິນຖືກຈ່າຍ/ນັດ COMPLETED. idempotent ຕໍ່ refId (paymentId ຫຼື appointmentId).
 */
export async function earnPoints(
  db: Db,
  params: { userId: string; amountLak: number; refId: string; notes?: string },
): Promise<number> {
  const points = Math.floor(params.amountLak / LOYALTY_EARN_DIVISOR_LAK);
  if (points <= 0) return 0;

  const account = await ensureAccount(db, params.userId);

  // Wave 10A (ອຸດ H5) — earnPoints() ຖືກເອີ້ນຈາກ 3 ບ່ອນ (payments/appointments/staff-portal) ດ້ວຍ
  // refId ດຽວກັນ (`appt:<id>`) ເປັນ safety-net ຕໍ່ກັນ. ບໍ່ໃຊ້ findFirst-then-create (race ໄດ້) —
  // ອາໄສ partial unique index (loyaltyAccountId, refId) WHERE type='EARN' + catch P2002 ແທນ, ອັນນີ້
  // atomic ຕໍ່ concurrent call ຈິງ.
  try {
    await db.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: account.id,
        type: 'EARN',
        points,
        refId: params.refId,
        notes: params.notes ?? 'ໄດ້ຄະແນນຈາກການໃຊ້ບໍລິການ',
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return 0;
    throw err;
  }

  await db.loyaltyAccount.update({
    where: { id: account.id },
    data: { points: { increment: points } },
  });
  await recomputeTier(db, account.id);
  return points;
}

/** ຫັກຄະແນນເປັນສ່ວນຫຼຸດ (ໃຊ້ໃນ payment tender LOYALTY_POINTS). ຄືນມູນຄ່າ LAK. */
export async function redeemPoints(
  db: Db,
  params: { userId: string; points: number; refId: string; paymentTransactionId?: string },
): Promise<number> {
  if (params.points <= 0) throw ApiError.badRequest('ຈຳນວນຄະແນນບໍ່ຖືກຕ້ອງ');
  // Wave 10A (ອຸດ C2) — ລັອກແຖວ loyalty_accounts ໄວ້ຈົນຈົບ transaction ເພື່ອກັນ 2 tender ພ້ອມກັນ
  // ອ່ານຍອດເກົ່າດຽວກັນແລ້ວແລກຄະແນນເກີນຍອດ (ຕ້ອງເອີ້ນພາຍໃນ $transaction ຂອງຜູ້ຮຽກ).
  const rows = await db.$queryRaw<
    { id: string; points: number }[]
  >`SELECT "id", "points" FROM "loyalty_accounts" WHERE "userId" = ${params.userId} FOR UPDATE`;
  const account = rows[0];
  if (!account || account.points < params.points) {
    throw ApiError.badRequest('ຄະແນນສະສົມບໍ່ພຽງພໍ');
  }
  await db.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: account.id,
      type: 'REDEEM',
      points: -params.points,
      refId: params.refId,
      paymentTransactionId: params.paymentTransactionId ?? null,
      notes: 'ແລກຄະແນນເປັນສ່ວນຫຼຸດ',
    },
  });
  await db.loyaltyAccount.update({
    where: { id: account.id },
    data: { points: { decrement: params.points } },
  });
  return params.points * LOYALTY_POINT_VALUE_LAK;
}

// ---- views ----------------------------------------------------------

function nextTierInfo(tier: LoyaltyTier, lifetime: number): {
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number | null;
} {
  const idx = TIER_ORDER.indexOf(tier);
  const next = TIER_ORDER[idx + 1];
  if (!next) return { nextTier: null, pointsToNextTier: null };
  return { nextTier: next, pointsToNextTier: Math.max(0, LOYALTY_TIER_THRESHOLDS[next] - lifetime) };
}

const ACCOUNT_SELECT = {
  id: true,
  userId: true,
  points: true,
  tierLevel: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, phone: true } },
} satisfies Prisma.LoyaltyAccountSelect;

type AccountRow = Prisma.LoyaltyAccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;

/**
 * ສະຖິຕິ ledger ຂອງຫຼາຍບັນຊີໃນ 3 query (ແທນ aggregate ຕໍ່ແຖວ) — ໜ້າ admin ໂຫຼດທັງ roster
 * ເພື່ອສະຫຼຸບ, ຈຶ່ງຕ້ອງບໍ່ເປັນ N+1.
 */
async function ledgerStats(
  accountIds: string[],
): Promise<Map<string, { lifetime: number; redeemed: number; lastActivityAt: Date | null }>> {
  const stats = new Map<string, { lifetime: number; redeemed: number; lastActivityAt: Date | null }>();
  for (const id of accountIds) stats.set(id, { lifetime: 0, redeemed: 0, lastActivityAt: null });
  if (accountIds.length === 0) return stats;

  const where = { loyaltyAccountId: { in: accountIds } };
  const [earned, redeemed, last] = await Promise.all([
    prisma.loyaltyTransaction.groupBy({
      by: ['loyaltyAccountId'],
      where: { ...where, points: { gt: 0 } },
      _sum: { points: true },
    }),
    prisma.loyaltyTransaction.groupBy({
      by: ['loyaltyAccountId'],
      where: { ...where, type: 'REDEEM' },
      _sum: { points: true },
    }),
    prisma.loyaltyTransaction.groupBy({
      by: ['loyaltyAccountId'],
      where,
      _max: { createdAt: true },
    }),
  ]);
  for (const r of earned) stats.get(r.loyaltyAccountId)!.lifetime = r._sum.points ?? 0;
  for (const r of redeemed) stats.get(r.loyaltyAccountId)!.redeemed = Math.abs(r._sum.points ?? 0);
  for (const r of last) stats.get(r.loyaltyAccountId)!.lastActivityAt = r._max.createdAt ?? null;
  return stats;
}

async function toAccountViews(rows: AccountRow[]): Promise<LoyaltyAccountView[]> {
  const stats = await ledgerStats(rows.map((r) => r.id));
  return rows.map((row) => {
    const st = stats.get(row.id)!;
    const { nextTier, pointsToNextTier } = nextTierInfo(row.tierLevel, st.lifetime);
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      userPhone: row.user.phone,
      points: row.points,
      lifetimePoints: st.lifetime,
      redeemedPoints: st.redeemed,
      lastActivityAt: st.lastActivityAt?.toISOString() ?? null,
      memberSince: row.createdAt.toISOString(),
      tierLevel: row.tierLevel,
      nextTier,
      pointsToNextTier,
      pointValueLak: LOYALTY_POINT_VALUE_LAK,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getMyAccount(userId: string): Promise<LoyaltyAccountView> {
  await ensureAccount(prisma, userId);
  const row = await prisma.loyaltyAccount.findUniqueOrThrow({
    where: { userId },
    select: ACCOUNT_SELECT,
  });
  const [view] = await toAccountViews([row]);
  return view!;
}

function toTxView(t: {
  id: string;
  points: number;
  type: string;
  notes: string | null;
  refId: string | null;
  createdAt: Date;
}): LoyaltyTransactionView {
  return {
    id: t.id,
    points: t.points,
    type: t.type as LoyaltyTransactionView['type'],
    notes: t.notes,
    refId: t.refId,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function getMyLedger(
  userId: string,
  query: LoyaltyLedgerQuery,
): Promise<Paginated<LoyaltyTransactionView>> {
  const account = await ensureAccount(prisma, userId);
  const where: Prisma.LoyaltyTransactionWhereInput = {
    loyaltyAccountId: account.id,
    ...(query.type ? { type: query.type } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.loyaltyTransaction.count({ where }),
  ]);
  return {
    items: rows.map(toTxView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Admin — ປະຫວັດຄະແນນຂອງສະມາຊິກຄົນໃດໜຶ່ງ (404 ຖ້າບໍ່ມີ user). */
export async function getMemberLedger(
  userId: string,
  query: LoyaltyLedgerQuery,
): Promise<Paginated<LoyaltyTransactionView>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('ບໍ່ພົບສະມາຊິກ');
  return getMyLedger(userId, query);
}

// ---- admin --------------------------------------------------------

export async function listAccounts(
  query: LoyaltyAccountListQuery,
): Promise<Paginated<LoyaltyAccountView>> {
  const where: Prisma.LoyaltyAccountWhereInput = {
    ...(query.tier ? { tierLevel: query.tier } : {}),
    ...(query.q
      ? {
          user: {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.loyaltyAccount.findMany({
      where,
      orderBy: { points: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ACCOUNT_SELECT,
    }),
    prisma.loyaltyAccount.count({ where }),
  ]);
  return {
    items: await toAccountViews(rows),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function adjustPoints(
  targetUserId: string,
  input: LoyaltyAdjustInput,
): Promise<LoyaltyAccountView> {
  await prisma.$transaction(async (tx) => {
    const account = await tx.loyaltyAccount.upsert({
      where: { userId: targetUserId },
      update: {},
      create: { userId: targetUserId },
      select: { id: true, points: true },
    });
    if (account.points + input.points < 0) {
      throw ApiError.badRequest('ຄະແນນຫຼັງປັບຈະຕິດລົບ');
    }
    await tx.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: account.id,
        type: 'ADJUST',
        points: input.points,
        notes: input.notes,
      },
    });
    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { points: { increment: input.points } },
    });
    await recomputeTier(tx, account.id);
  });
  return getMyAccount(targetUserId);
}
