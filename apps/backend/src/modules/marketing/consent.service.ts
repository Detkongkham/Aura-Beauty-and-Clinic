import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  ChannelStatusView,
  ConsentChannel,
  ConsentPreferencesView,
  LineLinkCodeView,
  SmsInboundInput,
  ConsentSummaryView,
  CreateSuppressionInput,
  MarketingPolicy,
  Paginated,
  SuppressionListQuery,
  SuppressionView,
} from '@abcp/shared-types';
import { ConsentChannel as ConsentChannelEnum } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { minutesOfDayVientiane } from '../../utils/dateHelpers.js';
import { isChannelConfigured, replyLine } from '../../services/channels.js';

/**
 * Wave 10G — consent (opt-in) + suppression + ນະໂຍບາຍການສົ່ງ.
 * ກົດ: ບໍ່ມີແຖວ consent granted=true → ຫ້າມສົ່ງໂປຣໂມຊັນ. Suppression ຊະນະ consent ສະເໝີ.
 */

export const TRANSACTIONAL_TYPES = ['APPOINTMENT', 'PAYMENT_RECEIPT'] as const;

const POLICY_KEY = 'marketing-policy';
export const DEFAULT_POLICY: MarketingPolicy = {
  quietHoursEnabled: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  weeklyCap: 3,
};

type Actor = { source: string; actorId?: string | null; ipAddress?: string | null; evidence?: Prisma.InputJsonValue };

// ---- consent ---------------------------------------------------

/** ບັນທຶກຄວາມຍິນຍອມ/ຖອນ + event ຫຼັກຖານ ໃນ transaction ດຽວ. ຖອນ → ເຂົ້າ suppression (UNSUBSCRIBE). */
export async function setConsent(
  userId: string,
  channel: ConsentChannel,
  granted: boolean,
  actor: Actor,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const now = new Date();
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.marketingConsent.upsert({
      where: { userId_channel: { userId, channel } },
      create: {
        userId,
        channel,
        granted,
        grantedAt: granted ? now : null,
        revokedAt: granted ? null : now,
        source: actor.source,
        ipAddress: actor.ipAddress ?? null,
        evidence: actor.evidence,
      },
      update: {
        granted,
        ...(granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
        source: actor.source,
        ipAddress: actor.ipAddress ?? null,
        evidence: actor.evidence,
      },
    });
    await tx.marketingConsentEvent.create({
      data: {
        userId,
        channel,
        granted,
        source: actor.source,
        actorId: actor.actorId ?? null,
        ipAddress: actor.ipAddress ?? null,
        evidence: actor.evidence,
      },
    });
    if (granted) {
      // opt-in ໃໝ່ ຈາກຜູ້ໃຊ້ເອງ ລ້າງການຖອນຕົວເກົ່າ; bounce/complaint/manual ຍັງຄົງຢູ່ (admin ລຶບເອງ).
      await tx.suppressionEntry.deleteMany({ where: { identifier: userId, channel, reason: 'UNSUBSCRIBE' } });
    } else {
      await tx.suppressionEntry.upsert({
        where: { identifier_channel: { identifier: userId, channel } },
        create: { identifier: userId, channel, reason: 'UNSUBSCRIBE', createdById: actor.actorId ?? null },
        update: {},
      });
    }
  };
  if ('$transaction' in db) await db.$transaction(run);
  else await run(db);
}

export async function getPreferences(userId: string): Promise<ConsentPreferencesView> {
  const [rows, suppressed, user] = await Promise.all([
    prisma.marketingConsent.findMany({ where: { userId } }),
    prisma.suppressionEntry.findMany({ where: { identifier: userId }, select: { channel: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true, lineLink: { select: { lineUserId: true } } } }),
  ]);
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  const suppressedSet = new Set(suppressed.map((s) => s.channel));
  return {
    channels: ConsentChannelEnum.options.map((channel) => {
      const r = byChannel.get(channel);
      return {
        channel,
        granted: r?.granted === true && !suppressedSet.has(channel),
        updatedAt: (r?.granted ? r.grantedAt : r?.revokedAt)?.toISOString() ?? null,
        suppressed: suppressedSet.has(channel),
      };
    }),
    transactionalTypes: [...TRANSACTIONAL_TYPES],
    contacts: { phone: Boolean(user?.phone), email: Boolean(user?.email), lineLinked: Boolean(user?.lineLink?.lineUserId) },
  };
}

// ---- unsubscribe token (deep-link ໃນຂໍ້ຄວາມ) ---------------------

function sign(payload: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`unsub:${payload}`).digest('base64url');
}

export function makeUnsubscribeToken(userId: string, channel: ConsentChannel): string {
  const payload = Buffer.from(`${userId}|${channel}`).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export async function unsubscribeByToken(token: string): Promise<{ channel: ConsentChannel }> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw ApiError.badRequest('ລິ້ງຖອນຕົວບໍ່ຖືກຕ້ອງ');
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw ApiError.badRequest('ລິ້ງຖອນຕົວບໍ່ຖືກຕ້ອງ');
  }
  const [userId, channel] = Buffer.from(payload, 'base64url').toString().split('|');
  const parsed = ConsentChannelEnum.safeParse(channel);
  if (!userId || !parsed.success) throw ApiError.badRequest('ລິ້ງຖອນຕົວບໍ່ຖືກຕ້ອງ');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  await setConsent(userId, parsed.data, false, { source: 'unsubscribe-link', actorId: userId });
  return { channel: parsed.data };
}

// ---- suppression (admin) --------------------------------------

function toSuppressionView(r: Prisma.SuppressionEntryGetPayload<object>): SuppressionView {
  return {
    id: r.id,
    identifier: r.identifier,
    channel: r.channel,
    reason: r.reason,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listSuppressions(query: SuppressionListQuery): Promise<Paginated<SuppressionView>> {
  const where: Prisma.SuppressionEntryWhereInput = {
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.q ? { identifier: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.suppressionEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.suppressionEntry.count({ where }),
  ]);
  return {
    items: rows.map(toSuppressionView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function addSuppression(input: CreateSuppressionInput, actorId: string): Promise<SuppressionView> {
  const row = await prisma.suppressionEntry.upsert({
    where: { identifier_channel: { identifier: input.identifier, channel: input.channel } },
    create: { ...input, note: input.note ?? null, createdById: actorId },
    update: { reason: input.reason, note: input.note ?? null },
  });
  return toSuppressionView(row);
}

export async function removeSuppression(id: string): Promise<{ id: string }> {
  const row = await prisma.suppressionEntry.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການ');
  await prisma.suppressionEntry.delete({ where: { id } });
  return { id };
}

export async function consentSummary(): Promise<ConsentSummaryView> {
  const [totalCustomers, consents, suppressions] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
    prisma.marketingConsent.groupBy({ by: ['channel', 'granted'], _count: { _all: true } }),
    prisma.suppressionEntry.groupBy({ by: ['channel'], _count: { _all: true } }),
  ]);
  return {
    totalCustomers,
    channels: ConsentChannelEnum.options.map((channel) => ({
      channel,
      granted: consents.find((c) => c.channel === channel && c.granted)?._count._all ?? 0,
      revoked: consents.find((c) => c.channel === channel && !c.granted)?._count._all ?? 0,
      suppressed: suppressions.find((s) => s.channel === channel)?._count._all ?? 0,
    })),
  };
}

// ---- policy ----------------------------------------------------

export async function getPolicy(): Promise<MarketingPolicy> {
  const row = await prisma.appSetting.findUnique({ where: { key: POLICY_KEY } });
  return { ...DEFAULT_POLICY, ...((row?.value as Partial<MarketingPolicy> | undefined) ?? {}) };
}

export async function updatePolicy(policy: MarketingPolicy): Promise<MarketingPolicy> {
  await prisma.appSetting.upsert({
    where: { key: POLICY_KEY },
    create: { key: POLICY_KEY, value: policy },
    update: { value: policy },
  });
  return policy;
}

function hhmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** ຢູ່ໃນຊ່ວງງຽບ (ເວລາ Vientiane) ບໍ? ຮອງຮັບຊ່ວງຂ້າມທ່ຽງຄືນ. */
export function inQuietHours(policy: MarketingPolicy, at: Date = new Date()): boolean {
  if (!policy.quietHoursEnabled) return false;
  const now = minutesOfDayVientiane(at);
  const start = hhmm(policy.quietStart);
  const end = hhmm(policy.quietEnd);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

// ---- audience filter (ບັງຄັບຢູ່ຊັ້ນ service) ------------------

export type AudienceFilterResult = {
  eligible: string[];
  noConsent: number;
  suppressed: number;
  frequencyCapped: number;
  /** ລາຍຊື່ id ທີ່ຖືກກັ່ນອອກ (ໃຊ້ລວມຜົນຫຼາຍຊ່ອງທາງ) */
  suppressedIds?: Set<string>;
  cappedIds?: Set<string>;
};

/** ກັ່ນຕອງຜູ້ຮັບແຄມເປນຊ່ອງ PUSH: consent ✔ → ບໍ່ຕິດ suppression → ບໍ່ເກີນເພດານ/ອາທິດ. */
export async function filterCampaignAudience(
  userIds: string[],
  policy: MarketingPolicy,
  channel: ConsentChannel = 'PUSH',
): Promise<AudienceFilterResult> {
  if (userIds.length === 0) return { eligible: [], noConsent: 0, suppressed: 0, frequencyCapped: 0 };
  const [consents, suppressions] = await Promise.all([
    prisma.marketingConsent.findMany({
      where: { userId: { in: userIds }, channel, granted: true },
      select: { userId: true },
    }),
    prisma.suppressionEntry.findMany({
      where: { identifier: { in: userIds }, channel },
      select: { identifier: true },
    }),
  ]);
  const consented = new Set(consents.map((c) => c.userId));
  const suppressedSet = new Set(suppressions.map((s) => s.identifier));

  let noConsent = 0;
  let suppressed = 0;
  let passing: string[] = [];
  for (const id of userIds) {
    if (suppressedSet.has(id)) suppressed += 1;
    else if (!consented.has(id)) noConsent += 1;
    else passing.push(id);
  }

  let frequencyCapped = 0;
  let capped = new Set<string>();
  if (policy.weeklyCap > 0 && passing.length > 0) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const counts = await prisma.notificationLog.groupBy({
      by: ['userId'],
      where: { userId: { in: passing }, type: 'CAMPAIGN', sentAt: { gte: since } },
      _count: { _all: true },
    });
    capped = new Set(counts.filter((c) => c._count._all >= policy.weeklyCap).map((c) => c.userId));
    frequencyCapped = capped.size;
    passing = passing.filter((id) => !capped.has(id));
  }
  return { eligible: passing, noConsent, suppressed, frequencyCapped, suppressedIds: suppressedSet, cappedIds: capped };
}

// ---- ຂໍ້ຈຳກັດ 10G: SMS / ອີເມວ / LINE ------------------------------

export function channelStatus(): ChannelStatusView {
  return {
    channels: ConsentChannelEnum.options.map((channel) => ({ channel, configured: isChannelConfigured(channel) })),
    lineAddFriendUrl: lineAddFriendUrl(),
  };
}

function lineAddFriendUrl(): string | null {
  return env.LINE_OA_ID ? `https://line.me/R/ti/p/${encodeURIComponent(env.LINE_OA_ID)}` : null;
}

/** ລິ້ງຖອນຕົວ (GET) ສຳລັບໃສ່ທ້າຍ SMS/ອີເມວ. */
export function unsubscribeUrl(userId: string, channel: ConsentChannel): string {
  return `${env.PUBLIC_API_URL}/consent/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(userId, channel))}`;
}

const LINE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINE_CODE_TTL_MS = 15 * 60 * 1000;

function randomLineCode(): string {
  const bytes = randomBytes(6);
  let out = 'L';
  for (let i = 0; i < 6; i += 1) out += LINE_CODE_ALPHABET[bytes[i]! % LINE_CODE_ALPHABET.length];
  return out;
}

/** ອອກລະຫັດຜູກ LINE — ລູກຄ້າສົ່ງລະຫັດນີ້ເປັນຂໍ້ຄວາມໃຫ້ LINE OA ພາຍໃນ 15 ນາທີ. */
export async function generateLineLinkCode(userId: string): Promise<LineLinkCodeView> {
  const expiresAt = new Date(Date.now() + LINE_CODE_TTL_MS);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const row = await prisma.lineLink.upsert({
        where: { userId },
        update: { linkCode: randomLineCode(), linkCodeExpiresAt: expiresAt },
        create: { userId, linkCode: randomLineCode(), linkCodeExpiresAt: expiresAt },
      });
      return { code: row.linkCode!, expiresAt: expiresAt.toISOString(), addFriendUrl: lineAddFriendUrl(), linked: Boolean(row.lineUserId) };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002' && attempt < 5) continue;
      throw err;
    }
  }
}

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

/**
 * LINE webhook: ຂໍ້ຄວາມທີ່ເປັນລະຫັດຜູກ → ຜູກ lineUserId ກັບບັນຊີ; "STOP" → ຖອນ consent LINE;
 * unfollow (block OA) → ຖອນ consent LINE ອັດຕະໂນມັດ. ຜູ້ຮຽກຕ້ອງກວດລາຍເຊັນກ່ອນ.
 */
export async function handleLineEvents(events: LineEvent[]): Promise<{ handled: number }> {
  let handled = 0;
  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;
    if (ev.type === 'unfollow') {
      const link = await prisma.lineLink.findUnique({ where: { lineUserId }, select: { userId: true } });
      if (link) {
        await setConsent(link.userId, 'LINE', false, { source: 'stop-reply', evidence: { event: 'unfollow' } });
        handled += 1;
      }
      continue;
    }
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
    const text = (ev.message.text ?? '').trim().toUpperCase();
    if (STOP_WORDS.has(text)) {
      const link = await prisma.lineLink.findUnique({ where: { lineUserId }, select: { userId: true } });
      if (link) {
        await setConsent(link.userId, 'LINE', false, { source: 'stop-reply', evidence: { text } });
        if (ev.replyToken) await replyLine(ev.replyToken, 'ຍົກເລີກຮັບໂປຣໂມຊັນທາງ LINE ແລ້ວ.');
        handled += 1;
      }
      continue;
    }
    const link = await prisma.lineLink.findUnique({ where: { linkCode: text } });
    if (!link) continue;
    if (!link.linkCodeExpiresAt || link.linkCodeExpiresAt.getTime() < Date.now()) {
      if (ev.replyToken) await replyLine(ev.replyToken, 'ລະຫັດໝົດອາຍຸແລ້ວ — ຂໍລະຫັດໃໝ່ຈາກແອັບ.');
      continue;
    }
    // lineUserId ນີ້ເຄີຍຜູກກັບບັນຊີອື່ນ → ຍ້າຍມາບັນຊີໃໝ່ (ຄົນດຽວກັນປ່ຽນບັນຊີ).
    await prisma.$transaction(async (tx) => {
      await tx.lineLink.updateMany({ where: { lineUserId, NOT: { id: link.id } }, data: { lineUserId: null, linkedAt: null } });
      await tx.lineLink.update({
        where: { id: link.id },
        data: { lineUserId, linkedAt: new Date(), linkCode: null, linkCodeExpiresAt: null },
      });
    });
    if (ev.replyToken) await replyLine(ev.replyToken, 'ຜູກບັນຊີສຳເລັດ! ເປີດຮັບໂປຣໂມຊັນທາງ LINE ໄດ້ໃນແອັບ ▸ ການແຈ້ງເຕືອນ.');
    handled += 1;
  }
  return { handled };
}

const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'ຍົກເລີກ', 'ຢຸດ']);

/**
 * SMS STOP-reply: gateway forward ຂໍ້ຄວາມຕອບກັບ. STOP/ຍົກເລີກ → ຖອນ consent SMS ຂອງເບີນັ້ນ + suppression.
 * ເບີທີ່ບໍ່ພົບໃນລະບົບ ກໍເພີ່ມ suppression ດ້ວຍເບີ (identifier = ເບີ) ເພື່ອບໍ່ສົ່ງຫາອີກ.
 */
export async function handleSmsInbound(input: SmsInboundInput): Promise<{ action: 'unsubscribed' | 'ignored' }> {
  const word = input.text.trim().toUpperCase();
  if (!STOP_WORDS.has(word)) return { action: 'ignored' };
  const digits = input.from.replace(/\D/g, '');
  const local = digits.startsWith('856') ? `0${digits.slice(3)}` : digits.startsWith('0') ? digits : `0${digits}`;
  const user = await prisma.user.findFirst({
    where: { phone: { in: [local, local.slice(1), `+856${local.slice(1)}`, digits] } },
    select: { id: true },
  });
  if (user) {
    await setConsent(user.id, 'SMS', false, { source: 'stop-reply', evidence: { from: input.from, text: input.text } });
  } else {
    await prisma.suppressionEntry.upsert({
      where: { identifier_channel: { identifier: local, channel: 'SMS' } },
      create: { identifier: local, channel: 'SMS', reason: 'UNSUBSCRIBE', note: 'STOP reply (ເບີບໍ່ພົບໃນລະບົບ)' },
      update: {},
    });
  }
  return { action: 'unsubscribed' };
}
