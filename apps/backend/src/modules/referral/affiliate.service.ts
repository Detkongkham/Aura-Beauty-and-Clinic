import type {
  AffiliateListQuery,
  AffiliatePayoutView,
  AffiliateView,
  CreateAffiliatePayoutInput,
  EnrollAffiliateInput,
  MyAffiliateView,
  Paginated,
  UpdateAffiliateInput,
  UpdateAffiliatePayoutStatusInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const CURRENCY = 'LAK';

const PROFILE_INCLUDE = {
  user: { select: { name: true, phone: true } },
  _count: { select: { payouts: true } },
} satisfies Prisma.AffiliateProfileInclude;

type ProfileRow = Prisma.AffiliateProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

async function toView(row: ProfileRow): Promise<AffiliateView> {
  const referredCount = await prisma.referralUsage.count({
    where: { referralCode: { userId: row.userId } },
  });
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    userPhone: row.user.phone,
    commissionRate: row.commissionRate,
    totalEarnings: row.totalEarnings.toNumber(),
    unpaidBalance: row.unpaidBalance.toNumber(),
    referredCount,
    currency: CURRENCY,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPayoutView(p: {
  id: string;
  affiliateProfileId: string;
  amount: Prisma.Decimal;
  status: string;
  payoutMethod: string;
  accountDetails: string;
  paidAt: Date | null;
  createdAt: Date;
}): AffiliatePayoutView {
  return {
    id: p.id,
    affiliateProfileId: p.affiliateProfileId,
    amount: p.amount.toNumber(),
    status: p.status as AffiliatePayoutView['status'],
    payoutMethod: p.payoutMethod,
    accountDetails: p.accountDetails,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

// ---- admin ------------------------------------------------------

export async function listAffiliates(
  query: AffiliateListQuery,
): Promise<Paginated<AffiliateView>> {
  const where: Prisma.AffiliateProfileWhereInput = query.q
    ? {
        user: {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ],
        },
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.affiliateProfile.findMany({
      where,
      orderBy: { unpaidBalance: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: PROFILE_INCLUDE,
    }),
    prisma.affiliateProfile.count({ where }),
  ]);
  return {
    items: await Promise.all(rows.map(toView)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function enrollAffiliate(input: EnrollAffiliateInput): Promise<AffiliateView> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw ApiError.badRequest('ບໍ່ພົບຜູ້ໃຊ້');
  const dup = await prisma.affiliateProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (dup) throw ApiError.conflict('ຜູ້ໃຊ້ນີ້ເປັນ affiliate ຢູ່ແລ້ວ');

  const row = await prisma.affiliateProfile.create({
    data: { userId: input.userId, commissionRate: input.commissionRate },
    include: PROFILE_INCLUDE,
  });
  return toView(row);
}

export async function updateAffiliate(
  id: string,
  input: UpdateAffiliateInput,
): Promise<AffiliateView> {
  const existing = await prisma.affiliateProfile.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບ affiliate');
  const row = await prisma.affiliateProfile.update({
    where: { id },
    data: { commissionRate: input.commissionRate },
    include: PROFILE_INCLUDE,
  });
  return toView(row);
}

export async function removeAffiliate(id: string): Promise<{ id: string }> {
  const existing = await prisma.affiliateProfile.findUnique({
    where: { id },
    select: { id: true, unpaidBalance: true },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບ affiliate');
  if (existing.unpaidBalance.toNumber() > 0) {
    throw ApiError.conflict('ຍັງມີຍອດຄ້າງຈ່າຍ — ຈ່າຍ payout ກ່ອນຈຶ່ງລົບໄດ້');
  }
  await prisma.affiliateProfile.delete({ where: { id } });
  return { id };
}

export async function listPayouts(affiliateProfileId: string): Promise<AffiliatePayoutView[]> {
  const rows = await prisma.affiliatePayout.findMany({
    where: { affiliateProfileId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toPayoutView);
}

export async function createPayout(
  affiliateProfileId: string,
  input: CreateAffiliatePayoutInput,
): Promise<AffiliatePayoutView> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.affiliateProfile.findUnique({
      where: { id: affiliateProfileId },
      select: { id: true, unpaidBalance: true },
    });
    if (!profile) throw ApiError.notFound('ບໍ່ພົບ affiliate');
    if (input.amount > profile.unpaidBalance.toNumber()) {
      throw ApiError.badRequest('ຈຳນວນເກີນຍອດຄ້າງຈ່າຍ');
    }
    const payout = await tx.affiliatePayout.create({
      data: {
        affiliateProfileId,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        payoutMethod: input.payoutMethod,
        accountDetails: input.accountDetails,
        status: 'PENDING',
      },
    });
    await tx.affiliateProfile.update({
      where: { id: affiliateProfileId },
      data: { unpaidBalance: { decrement: input.amount } },
    });
    return toPayoutView(payout);
  });
}

export async function setPayoutStatus(
  payoutId: string,
  input: UpdateAffiliatePayoutStatusInput,
): Promise<AffiliatePayoutView> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.affiliatePayout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, amount: true, affiliateProfileId: true },
    });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບ payout');

    // ຄືນຍອດເຂົ້າ unpaidBalance ເມື່ອຖືກ REJECTED (ຈາກສະຖານະທີ່ຍັງບໍ່ REJECTED).
    if (input.status === 'REJECTED' && existing.status !== 'REJECTED') {
      await tx.affiliateProfile.update({
        where: { id: existing.affiliateProfileId },
        data: { unpaidBalance: { increment: existing.amount.toNumber() } },
      });
    }
    const row = await tx.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: input.status,
        paidAt: input.status === 'PAID' ? new Date() : null,
      },
    });
    return toPayoutView(row);
  });
}

// ---- affiliate self ------------------------------------------------

export async function getMyAffiliate(userId: string): Promise<MyAffiliateView> {
  const profile = await prisma.affiliateProfile.findUnique({
    where: { userId },
    include: { payouts: { orderBy: { createdAt: 'desc' } } },
  });
  if (!profile) throw ApiError.notFound('ບັນຊີນີ້ຍັງບໍ່ແມ່ນ affiliate');
  return {
    commissionRate: profile.commissionRate,
    totalEarnings: profile.totalEarnings.toNumber(),
    unpaidBalance: profile.unpaidBalance.toNumber(),
    currency: CURRENCY,
    payouts: profile.payouts.map(toPayoutView),
  };
}
