import type {
  CampaignListQuery,
  ConsentChannel,
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
import { isChannelConfigured, sendEmail, sendLine, sendSms } from '../../services/channels.js';
import {
  filterCampaignAudience,
  getPolicy,
  inQuietHours,
  makeUnsubscribeToken,
  unsubscribeUrl,
} from './consent.service.js';

/**
 * `MarketingCampaign.triggerRule` (Json) ເກັບທັງ message ແລະ rule:
 *   { message: { title, body }, inactiveDays?, daysBefore? }
 */
type StoredRule = {
  message?: { title: string; body: string };
  inactiveDays?: number;
  daysBefore?: number;
  /** ຂໍ້ຈຳກັດ 10G — ຊ່ອງທາງສົ່ງ (ບໍ່ມີ = PUSH ຢ່າງດຽວ, ແຄມເປນເກົ່າ) */
  channels?: ConsentChannel[];
};

function ruleChannels(rule: StoredRule): ConsentChannel[] {
  return rule.channels && rule.channels.length > 0 ? rule.channels : ['PUSH'];
}

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
    channels: ruleChannels(rule),
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
  channels?: ConsentChannel[];
}): Prisma.InputJsonValue {
  return {
    ...(input.message ? { message: input.message } : {}),
    ...(input.channels ? { channels: [...new Set(input.channels)] } : {}),
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
        channels: input.channels ?? currentRule.channels,
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

  const channels = ruleChannels(rule);
  const empty = { skippedNoConsent: 0, skippedSuppressed: 0, skippedFrequencyCap: 0, byChannel: {} };

  // Wave 10G — ຊ່ວງງຽບ: ບໍ່ສົ່ງ ແລະ ບໍ່ບັນທຶກ recipient ເພື່ອໃຫ້ sweep ຮອບຕໍ່ໄປສົ່ງໄດ້.
  const policy = await getPolicy();
  if (inQuietHours(policy)) {
    return { campaignId: id, matched: audience.length, sent: 0, skippedAlreadySent: 0, ...empty, deferredQuietHours: true };
  }

  const already = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, userId: { in: audience } },
    select: { userId: true },
  });
  const alreadySet = new Set(already.map((a) => a.userId));
  const pending = audience.filter((uid) => !alreadySet.has(uid));

  // Wave 10G — consent + suppression + frequency cap ບັງຄັບຢູ່ນີ້ (ຊັ້ນ service), ບໍ່ແມ່ນ UI. ກັ່ນຕອງແຍກຕໍ່ຊ່ອງ:
  // ລູກຄ້າໄດ້ຮັບສະເພາະຊ່ອງທີ່ຕົນ opt-in ແລະ ບໍ່ຕິດ suppression.
  const eligibleBy = new Map<string, ConsentChannel[]>();
  const suppressedIn = new Map<string, number>();
  let capped = new Set<string>();
  for (const channel of channels) {
    const r = await filterCampaignAudience(pending, policy, channel);
    for (const uid of r.eligible) eligibleBy.set(uid, [...(eligibleBy.get(uid) ?? []), channel]);
    for (const uid of r.suppressedIds ?? []) suppressedIn.set(uid, (suppressedIn.get(uid) ?? 0) + 1);
    if (r.cappedIds) capped = r.cappedIds;
  }
  let skippedNoConsent = 0;
  let skippedSuppressed = 0;
  for (const uid of pending) {
    if (eligibleBy.has(uid) || capped.has(uid)) continue;
    if ((suppressedIn.get(uid) ?? 0) === channels.length) skippedSuppressed += 1;
    else skippedNoConsent += 1;
  }

  const contacts = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...eligibleBy.keys()] } },
        select: { id: true, phone: true, email: true, lineLink: { select: { lineUserId: true } } },
      })
    ).map((u) => [u.id, u]),
  );

  const byChannel: CampaignRunView['byChannel'] = {};
  const stat = (c: ConsentChannel) => (byChannel[c] ??= { sent: 0, failed: 0, noProvider: 0, noContact: 0 });
  for (const c of channels) stat(c);

  let sent = 0;
  const body = campaign.discountCode ? `${message.body} (ໂຄ້ດ: ${campaign.discountCode})` : message.body;
  for (const [userId, userChannels] of eligibleBy) {
    // ຈອງ recipient ກ່ອນສົ່ງ — sweep ພ້ອມກັນ (P2002) ຈະບໍ່ສົ່ງຊ້ຳ.
    try {
      await prisma.campaignRecipient.create({ data: { campaignId: id, userId, status: 'SENT' } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue;
      throw err;
    }
    const contact = contacts.get(userId);
    const delivered: ConsentChannel[] = [];
    for (const channel of userChannels) {
      if (!isChannelConfigured(channel)) {
        stat(channel).noProvider += 1;
        continue;
      }
      const ok = await deliver(channel, {
        userId,
        campaignId: id,
        discountCode: campaign.discountCode,
        title: message.title,
        body,
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        lineUserId: contact?.lineLink?.lineUserId ?? null,
      });
      if (ok === 'no-contact') stat(channel).noContact += 1;
      else if (ok) {
        stat(channel).sent += 1;
        delivered.push(channel);
      } else stat(channel).failed += 1;
    }

    if (delivered.length === 0) {
      // ບໍ່ມີຊ່ອງໃດສົ່ງສຳເລັດ → ຖອນການຈອງ ເພື່ອໃຫ້ sweep ຕໍ່ໄປລອງໃໝ່.
      await prisma.campaignRecipient.deleteMany({ where: { campaignId: id, userId } });
      continue;
    }
    await prisma.campaignRecipient.update({
      where: { campaignId_userId: { campaignId: id, userId } },
      data: { channels: delivered },
    });
    // ເພດານ/ອາທິດ ນັບຈາກ NotificationLog(CAMPAIGN) — ສົ່ງສະເພາະ SMS/ອີເມວ/LINE ກໍຕ້ອງນັບ (+ ຢູ່ໃນ inbox ຂອງແອັບ).
    if (!delivered.includes('PUSH')) {
      await prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'CAMPAIGN',
            title: message.title,
            body,
            data: { campaignId: id, channels: delivered } as Prisma.InputJsonValue,
            dedupeKey: `campaign:${id}:${userId}`,
          },
        })
        .catch((err: { code?: string }) => {
          if (err.code !== 'P2002') throw err;
        });
    }
    sent += 1;
  }

  return {
    campaignId: id,
    matched: audience.length,
    sent,
    skippedAlreadySent: alreadySet.size,
    skippedNoConsent,
    skippedSuppressed,
    skippedFrequencyCap: capped.size,
    deferredQuietHours: false,
    byChannel,
  };
}

type DeliverInput = {
  userId: string;
  campaignId: string;
  discountCode: string | null;
  title: string;
  body: string;
  phone: string | null;
  email: string | null;
  lineUserId: string | null;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** ສົ່ງ 1 ຊ່ອງ. ຄືນ true = ສຳເລັດ, false = ຜູ້ໃຫ້ບໍລິການປະຕິເສດ, 'no-contact' = ບໍ່ມີເບີ/ອີເມວ/LINE. */
async function deliver(channel: ConsentChannel, m: DeliverInput): Promise<boolean | 'no-contact'> {
  switch (channel) {
    case 'PUSH': {
      await notifyUser({
        userId: m.userId,
        type: 'CAMPAIGN',
        title: m.title,
        body: m.body,
        data: {
          campaignId: m.campaignId,
          discountCode: m.discountCode ?? undefined,
          unsubscribeToken: makeUnsubscribeToken(m.userId, 'PUSH'),
        },
        dedupeKey: `campaign:${m.campaignId}:${m.userId}`,
      });
      return true;
    }
    case 'SMS': {
      if (!m.phone) return 'no-contact';
      const r = await sendSms(m.phone, `${m.title}: ${m.body}\nຕອບ STOP ເພື່ອຍົກເລີກ`);
      return r.ok;
    }
    case 'EMAIL': {
      if (!m.email) return 'no-contact';
      const link = unsubscribeUrl(m.userId, 'EMAIL');
      const r = await sendEmail(
        m.email,
        m.title,
        `${m.body}\n\nຍົກເລີກຮັບອີເມວໂປຣໂມຊັນ: ${link}`,
        `<p>${escapeHtml(m.body)}</p><hr><p style="font-size:12px;color:#666"><a href="${escapeHtml(link)}">ຍົກເລີກຮັບອີເມວໂປຣໂມຊັນ</a></p>`,
      );
      return r.ok;
    }
    case 'LINE': {
      if (!m.lineUserId) return 'no-contact';
      const r = await sendLine(m.lineUserId, `${m.title}\n${m.body}\n\n(ພິມ STOP ເພື່ອຍົກເລີກ)`);
      return r.ok;
    }
    default:
      return false;
  }
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
