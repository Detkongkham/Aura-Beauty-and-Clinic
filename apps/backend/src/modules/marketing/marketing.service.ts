import type {
  CampaignListQuery,
  CampaignRunView,
  CampaignView,
  CreateCampaignInput,
  Paginated,
  UpdateCampaignInput,
} from '@abcp/shared-types';
import type { CampaignType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { notifyUser } from '../../services/push.js';

/**
 * `MarketingCampaign.triggerRule` (Json) ເກັບທັງ message ແລະ rule:
 *   { message: { title, body }, inactiveDays?, daysBefore? }
 */
type StoredRule = {
  message?: { title: string; body: string };
  inactiveDays?: number;
  daysBefore?: number;
};

const CAMPAIGN_INCLUDE = {
  branch: { select: { name: true } },
  _count: { select: { recipients: true } },
} satisfies Prisma.MarketingCampaignInclude;

type CampaignRow = Prisma.MarketingCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

async function toView(c: CampaignRow): Promise<CampaignView> {
  const rule = (c.triggerRule ?? {}) as StoredRule;
  const converted = await prisma.campaignRecipient.count({
    where: { campaignId: c.id, convertedAt: { not: null } },
  });
  return {
    id: c.id,
    branchId: c.branchId,
    branchName: c.branch.name,
    name: c.name,
    type: c.type,
    discountCode: c.discountCode,
    message: rule.message ?? null,
    triggerRule:
      rule.inactiveDays != null || rule.daysBefore != null
        ? { inactiveDays: rule.inactiveDays, daysBefore: rule.daysBefore }
        : null,
    isActive: c.isActive,
    recipientCount: c._count.recipients,
    convertedCount: converted,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function buildRule(input: {
  message?: { title: string; body: string };
  triggerRule?: { inactiveDays?: number; daysBefore?: number };
}): Prisma.InputJsonValue {
  return {
    ...(input.message ? { message: input.message } : {}),
    ...(input.triggerRule?.inactiveDays != null ? { inactiveDays: input.triggerRule.inactiveDays } : {}),
    ...(input.triggerRule?.daysBefore != null ? { daysBefore: input.triggerRule.daysBefore } : {}),
  };
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignView> {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  const row = await prisma.marketingCampaign.create({
    data: {
      branchId: input.branchId,
      name: input.name,
      type: input.type,
      discountCode: input.discountCode ?? null,
      isActive: input.isActive,
      triggerRule: buildRule(input),
    },
    include: CAMPAIGN_INCLUDE,
  });
  return toView(row);
}

export async function updateCampaign(id: string, input: UpdateCampaignInput): Promise<CampaignView> {
  const current = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('ບໍ່ພົບແຄມເປນ');
  const currentRule = (current.triggerRule ?? {}) as StoredRule;
  const row = await prisma.marketingCampaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.discountCode !== undefined ? { discountCode: input.discountCode ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      triggerRule: buildRule({
        message: input.message ?? currentRule.message,
        triggerRule: {
          inactiveDays: input.triggerRule?.inactiveDays ?? currentRule.inactiveDays,
          daysBefore: input.triggerRule?.daysBefore ?? currentRule.daysBefore,
        },
      }),
    },
    include: CAMPAIGN_INCLUDE,
  });
  return toView(row);
}

export async function deleteCampaign(id: string): Promise<{ id: string }> {
  const row = await prisma.marketingCampaign.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບແຄມເປນ');
  await prisma.marketingCampaign.delete({ where: { id } });
  return { id };
}

export async function listCampaigns(query: CampaignListQuery): Promise<Paginated<CampaignView>> {
  const where: Prisma.MarketingCampaignWhereInput = {
    ...(query.branchId !== 'all' ? { branchId: query.branchId } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.marketingCampaign.findMany({
      where,
      include: CAMPAIGN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.marketingCampaign.count({ where }),
  ]);
  return {
    items: await Promise.all(rows.map(toView)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getRecipients(id: string): Promise<{ items: Array<{
  id: string;
  userId: string;
  userName: string;
  status: string;
  sentAt: string;
  convertedAt: string | null;
}> }> {
  const rows = await prisma.campaignRecipient.findMany({
    where: { campaignId: id },
    orderBy: { sentAt: 'desc' },
    take: 500,
    select: {
      id: true,
      userId: true,
      status: true,
      sentAt: true,
      convertedAt: true,
      user: { select: { name: true } },
    },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
    })),
  };
}

// ---- audience resolution ---------------------------------------

async function birthdayAudience(branchId: string, daysBefore: number): Promise<string[]> {
  const target = new Date();
  target.setDate(target.getDate() + daysBefore);
  const mm = target.getMonth() + 1;
  const dd = target.getDate();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users
    WHERE role = 'CUSTOMER' AND "deletedAt" IS NULL AND "dateOfBirth" IS NOT NULL
      AND EXTRACT(MONTH FROM "dateOfBirth") = ${mm}
      AND EXTRACT(DAY FROM "dateOfBirth") = ${dd}
      AND ("branchId" = ${branchId} OR "branchId" IS NULL)
  `;
  return rows.map((r) => r.id);
}

async function winBackAudience(branchId: string, inactiveDays: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - inactiveDays * 86_400_000);
  const customers = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      deletedAt: null,
      appointments: { some: { branchId } },
      NOT: { appointments: { some: { branchId, startAt: { gte: cutoff } } } },
    },
    select: { id: true },
    take: 2000,
  });
  return customers.map((c) => c.id);
}

export async function runCampaign(id: string): Promise<CampaignRunView> {
  const campaign = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!campaign) throw ApiError.notFound('ບໍ່ພົບແຄມເປນ');
  const rule = (campaign.triggerRule ?? {}) as StoredRule;
  const message = rule.message ?? {
    title: campaign.name,
    body: 'ມີໂປຣໂມຊັນພິເສດສຳລັບທ່ານ!',
  };

  let audience: string[] = [];
  if (campaign.type === ('BIRTHDAY' as CampaignType)) {
    audience = await birthdayAudience(campaign.branchId, rule.daysBefore ?? 0);
  } else if (campaign.type === ('WIN_BACK' as CampaignType)) {
    audience = await winBackAudience(campaign.branchId, rule.inactiveDays ?? 90);
  } else {
    // FESTIVAL_PROMO / CUSTOM — ທຸກລູກຄ້າຂອງສາຂາ
    const rows = await prisma.user.findMany({
      where: { role: 'CUSTOMER', deletedAt: null, appointments: { some: { branchId: campaign.branchId } } },
      select: { id: true },
      take: 5000,
    });
    audience = rows.map((r) => r.id);
  }

  const already = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, userId: { in: audience } },
    select: { userId: true },
  });
  const alreadySet = new Set(already.map((a) => a.userId));
  const toSend = audience.filter((uid) => !alreadySet.has(uid));

  let sent = 0;
  const body = campaign.discountCode ? `${message.body} (ໂຄ້ດ: ${campaign.discountCode})` : message.body;
  for (const userId of toSend) {
    try {
      await prisma.campaignRecipient.create({
        data: { campaignId: id, userId, status: 'SENT' },
      });
      await notifyUser({
        userId,
        type: 'CAMPAIGN',
        title: message.title,
        body,
        data: { campaignId: id, discountCode: campaign.discountCode ?? undefined },
        dedupeKey: `campaign:${id}:${userId}`,
      });
      sent += 1;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }

  return {
    campaignId: id,
    matched: audience.length,
    sent,
    skippedAlreadySent: audience.length - toSend.length,
  };
}

/** ໃຊ້ໂດຍ marketing.job.ts — ຣັນທຸກແຄມເປນ active. */
export async function runAllActiveCampaigns(): Promise<CampaignRunView[]> {
  const active = await prisma.marketingCampaign.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const results: CampaignRunView[] = [];
  for (const c of active) {
    results.push(await runCampaign(c.id));
  }
  return results;
}
