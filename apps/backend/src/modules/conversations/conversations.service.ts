import type {
  AccessTokenPayload,
  BlockedUserView,
  ChatReportView,
  ConversationListItem,
  ConversationListQuery,
  ConversationMediaSummary,
  ReportConversationInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { authorizeThreadAccess } from '../chat/chat.service.js';

/** ໂມດູນ 38 — Platform-Wide Messaging (Phase 8). ຄົນລະ resource shape ກັບ `chat/`
 * (list/create ຫ້ອງ, ບໍ່ແມ່ນ ensure ຫ້ອງດຽວຕໍ່ນັດໝາຍ). */

const STAFF_ROLES = ['STAFF', 'SUPER_ADMIN', 'BRANCH_ADMIN'] as const;

const CONVERSATION_INCLUDE = {
  participants: { include: { user: { select: { id: true, name: true, role: true } } } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { sender: { select: { name: true } } },
  },
  _count: { select: { messages: { where: { deletedAt: null } } } },
} satisfies Prisma.ChatThreadInclude;

type ConversationRow = Prisma.ChatThreadGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

function toConversationListItem(row: ConversationRow, unreadCount = 0): ConversationListItem {
  const last = row.messages[0];
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    participants: row.participants.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      role: p.user.role,
    })),
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    isLocked: row.isLocked,
    messageCount: row._count.messages,
    unreadCount,
    lastMessage: last
      ? {
          id: last.id,
          senderId: last.senderId,
          senderName: last.sender.name,
          body: last.body,
          messageType: last.messageType,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
  };
}

/** Unread = ຂໍ້ຄວາມຈາກຄົນອື່ນທີ່ມາຫຼັງ read cursor ຂອງ viewer — query ດຽວສຳລັບທຸກຫ້ອງ (ບໍ່ N+1). */
async function unreadCountsFor(userId: string, threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ threadId: string; count: number }[]>`
    SELECT m."threadId", COUNT(*)::int AS count
    FROM "chat_messages" m
    JOIN "conversation_participants" p ON p."threadId" = m."threadId" AND p."userId" = ${userId}
    WHERE m."threadId" = ANY(${threadIds})
      AND m."senderId" <> ${userId}
      AND m."deletedAt" IS NULL
      AND m."createdAt" > COALESCE(p."lastReadAt", p."joinedAt")
    GROUP BY m."threadId"`;
  return new Map(rows.map((r) => [r.threadId, r.count]));
}

/** Media ທັງໝົດໃນຫ້ອງ — count ຈາກ DB ໂດຍກົງ, ບໍ່ອີງໃສ່ page ຂໍ້ຄວາມທີ່ client ໂຫຼດ. */
export async function getConversationMedia(threadId: string, limit: number): Promise<ConversationMediaSummary> {
  const base = { threadId, deletedAt: null, mediaUrl: { not: null } } satisfies Prisma.ChatMessageWhereInput;
  const [photoCount, voiceCount, photos] = await prisma.$transaction([
    prisma.chatMessage.count({ where: { ...base, messageType: 'IMAGE' } }),
    prisma.chatMessage.count({ where: { ...base, messageType: 'AUDIO' } }),
    prisma.chatMessage.findMany({
      where: { ...base, messageType: 'IMAGE' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { name: true } } },
    }),
  ]);
  return {
    photoCount,
    voiceCount,
    photos: photos.map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl!,
      senderName: m.sender.name,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** ເລື່ອນ read cursor ຂອງ participant ມາເປັນຕອນນີ້. ບໍ່ແມ່ນ participant (ເຊັ່ນ admin oversight) → no-op. */
export async function markConversationRead(threadId: string, userId: string): Promise<void> {
  await prisma.conversationParticipant.updateMany({
    where: { threadId, userId },
    data: { lastReadAt: new Date() },
  });
}

export async function createStaffConversation(
  participantIds: string[],
  actor: AccessTokenPayload,
): Promise<ConversationListItem> {
  if (!STAFF_ROLES.includes(actor.role as (typeof STAFF_ROLES)[number])) throw ApiError.forbidden();

  const targetIds = Array.from(new Set([...participantIds, actor.sub]));
  const targets = await prisma.user.findMany({
    where: { id: { in: targetIds }, isActive: true },
    select: { id: true, role: true },
  });
  if (targets.length !== targetIds.length) throw ApiError.badRequest('ບໍ່ພົບຜູ້ຮ່ວມສົນທະນາບາງຄົນ');
  if (targets.some((t) => !STAFF_ROLES.includes(t.role as (typeof STAFF_ROLES)[number]))) {
    throw ApiError.badRequest('ອະນຸຍາດສະເພາະພະນັກງານ/admin ເທົ່ານັ້ນ');
  }

  // Idempotent — ຄືກັນກັບ createDirectConversation: ຖ້າມີຫ້ອງ STAFF_INTERNAL ທີ່ມີ participant
  // set ດຽວກັນເປະຢູ່ແລ້ວ ຄືນຫ້ອງເກົ່າ, ບໍ່ດັ່ງນັ້ນທຸກຄັ້ງທີ່ກົດ "ສົນທະນາໃໝ່" ຫາຄົນດຽວກັນຈະໄດ້ຫ້ອງ
  // ວ່າງເປົ່າໃໝ່ຊ້ຳໆ (ໜ້າ list ຈະເຫັນຊື່ດຽວກັນຫຼາຍແຖວ, ແຕ່ລະແຖວບໍ່ມີຂໍ້ຄວາມ).
  const existing = await prisma.chatThread.findFirst({
    where: {
      type: 'STAFF_INTERNAL',
      AND: targetIds.map((userId) => ({ participants: { some: { userId } } })),
    },
    include: CONVERSATION_INCLUDE,
  });
  if (existing && existing.participants.length === targetIds.length) {
    return toConversationListItem(existing);
  }

  const created = await prisma.chatThread.create({
    data: {
      type: 'STAFF_INTERNAL',
      participants: { create: targetIds.map((userId) => ({ userId })) },
    },
    include: CONVERSATION_INCLUDE,
  });
  return toConversationListItem(created);
}

export async function listConversations(
  actor: AccessTokenPayload,
  query: ConversationListQuery,
): Promise<ConversationListItem[]> {
  const rows = await prisma.chatThread.findMany({
    where: {
      participants: { some: { userId: actor.sub } },
      ...(query.type ? { type: query.type } : {}),
    },
    include: CONVERSATION_INCLUDE,
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  const unread = await unreadCountsFor(
    actor.sub,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toConversationListItem(r, unread.get(r.id) ?? 0));
}

/** ໂມດູນ 38 Wave 8C — admin lock/unlock ຫ້ອງແຊັດໃດກໍ່ໄດ້ (moderation). ຍັງອ່ານໄດ້ ພຽງແຕ່ສົ່ງບໍ່ໄດ້
 * ຕອນ locked (ບັງຄັບຢູ່ `chat.service.postMessage`). */
export async function setThreadLock(threadId: string, isLocked: boolean, actor?: AccessTokenPayload): Promise<void> {
  const existing = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, branchId: true, type: true, participants: { select: { user: { select: { branchId: true } } } } },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບຫົວຂໍ້ສົນທະນານີ້');
  // BRANCH_ADMIN ລັອກ/ປົດໄດ້ສະເພາະຫ້ອງຂອງສາຂາຕົນ: ຫ້ອງນັດ = branchId ຂອງຫ້ອງ; ຫ້ອງພາຍໃນ (ບໍ່ມີສາຂາ) =
  // ມີສະມາຊິກຈາກສາຂາຕົນ; DIRECT (ລູກຄ້າ↔ລູກຄ້າ) = SUPER_ADMIN ເທົ່ານັ້ນ.
  if (actor?.role === 'BRANCH_ADMIN') {
    const allowed =
      existing.type === 'DIRECT'
        ? false
        : existing.branchId
          ? existing.branchId === actor.branchId
          : existing.participants.some((p) => p.user.branchId === actor.branchId);
    if (!allowed) throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະຫ້ອງສົນທະນາຂອງສາຂາທ່ານ');
  }
  await prisma.chatThread.update({ where: { id: threadId }, data: { isLocked } });
}

/** ໂມດູນ 38 Wave 8D — DIRECT (ລູກຄ້າ↔ລູກຄ້າ, 1-ຕໍ່-1). ຝ່າຍເປົ້າໝາຍຕ້ອງເປີດ `allowDirectMessages`
 * ໄວ້ກ່ອນ (opt-in) ແລະ ບໍ່ໄດ້ block ກັນ. Idempotent — ຖ້າມີຫ້ອງລະຫວ່າງສອງຄົນນີ້ຢູ່ແລ້ວ ຄືນຫ້ອງເກົ່າ. */
export async function createDirectConversation(
  targetUserId: string,
  actor: AccessTokenPayload,
): Promise<ConversationListItem> {
  if (actor.role !== 'CUSTOMER') throw ApiError.forbidden();
  if (targetUserId === actor.sub) throw ApiError.badRequest('ບໍ່ສາມາດແຊັດກັບຕົນເອງໄດ້');

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, isActive: true, allowDirectMessages: true },
  });
  if (!target || !target.isActive || target.role !== 'CUSTOMER') {
    throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້ນີ້');
  }
  if (!target.allowDirectMessages) {
    throw ApiError.badRequest('ຜູ້ໃຊ້ນີ້ຍັງບໍ່ໄດ້ເປີດຮັບຂໍ້ຄວາມຈາກລູກຄ້າອື່ນ');
  }

  const blocked = await prisma.chatBlock.findFirst({
    where: {
      OR: [
        { blockerId: actor.sub, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: actor.sub },
      ],
    },
    select: { id: true },
  });
  if (blocked) throw ApiError.forbidden();

  const existing = await prisma.chatThread.findFirst({
    where: {
      type: 'DIRECT',
      participants: { some: { userId: actor.sub } },
      AND: { participants: { some: { userId: targetUserId } } },
    },
    include: CONVERSATION_INCLUDE,
  });
  if (existing) return toConversationListItem(existing);

  const created = await prisma.chatThread.create({
    data: {
      type: 'DIRECT',
      participants: { create: [{ userId: actor.sub }, { userId: targetUserId }] },
    },
    include: CONVERSATION_INCLUDE,
  });
  return toConversationListItem(created);
}

/** ໂມດູນ 38 Wave 8D — block/unblock (DIRECT ເທົ່ານັ້ນ). ບໍ່ຮ້ອງຂໍ error ຖ້າ block/unblock ຊ້ຳ
 * (idempotent, ຄືກັນກັບ pattern ອື່ນໆໃນໂປຣເຈັກ). */
export async function blockUser(actor: AccessTokenPayload, blockedId: string): Promise<void> {
  if (blockedId === actor.sub) throw ApiError.badRequest('ບໍ່ສາມາດ block ຕົນເອງໄດ້');
  await prisma.chatBlock.upsert({
    where: { blockerId_blockedId: { blockerId: actor.sub, blockedId } },
    create: { blockerId: actor.sub, blockedId },
    update: {},
  });
}

/** ລາຍຊື່ຄົນທີ່ actor ບລັອກໄວ້ ໃໝ່ສຸດກ່ອນ — ChatBlock ບໍ່ມີ relation ກັບ User ຈຶ່ງດຶງຊື່ແຍກ. */
export async function listBlockedUsers(actor: AccessTokenPayload): Promise<BlockedUserView[]> {
  const blocks = await prisma.chatBlock.findMany({
    where: { blockerId: actor.sub },
    orderBy: { createdAt: 'desc' },
    select: { blockedId: true, createdAt: true },
  });
  if (blocks.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: blocks.map((b) => b.blockedId) } },
    select: { id: true, name: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return blocks.flatMap((b) => {
    const u = byId.get(b.blockedId);
    return u
      ? [{ userId: u.id, name: u.name, avatarUrl: u.avatarUrl, blockedAt: b.createdAt.toISOString() }]
      : [];
  });
}

export async function unblockUser(actor: AccessTokenPayload, blockedId: string): Promise<void> {
  await prisma.chatBlock.deleteMany({ where: { blockerId: actor.sub, blockedId } });
}

/** ໂມດູນ 38 Wave 8D — `POST /conversations/:id/report` (DIRECT ເທົ່ານັ້ນ, participant ເທົ່ານັ້ນ). */
export async function reportConversation(
  threadId: string,
  actor: AccessTokenPayload,
  input: ReportConversationInput,
): Promise<void> {
  await authorizeThreadAccess(threadId, actor);
  const thread = await prisma.chatThread.findUnique({ where: { id: threadId }, select: { type: true } });
  if (thread?.type !== 'DIRECT') throw ApiError.badRequest('report ໃຊ້ໄດ້ສະເພາະຫ້ອງແຊັດ DIRECT');

  await prisma.chatReport.create({
    data: {
      conversationId: threadId,
      messageId: input.messageId,
      reportedById: actor.sub,
      reason: input.reason,
    },
  });
}

/** admin-only — ໜ້າ moderation queue. */
export async function listChatReports(status?: string): Promise<ChatReportView[]> {
  const rows = await prisma.chatReport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  const reporterIds = Array.from(new Set(rows.map((r) => r.reportedById)));
  const reporters = await prisma.user.findMany({
    where: { id: { in: reporterIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(reporters.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    messageId: r.messageId,
    reportedById: r.reportedById,
    reportedByName: nameById.get(r.reportedById) ?? '',
    reason: r.reason,
    status: r.status as ChatReportView['status'],
    createdAt: r.createdAt.toISOString(),
  }));
}

/** admin-only — `ACTIONED` ຫຼັອກຫ້ອງທີ່ຖືກ report ໄປພ້ອມ (moderation action ຈິງ, ບໍ່ແມ່ນພຽງປ່ຽນ status). */
export async function reviewChatReport(id: string, status: 'REVIEWED' | 'ACTIONED'): Promise<void> {
  const report = await prisma.chatReport.findUnique({ where: { id } });
  if (!report) throw ApiError.notFound('ບໍ່ພົບການ report ນີ້');
  await prisma.chatReport.update({ where: { id }, data: { status } });
  if (status === 'ACTIONED') {
    await prisma.chatThread.update({ where: { id: report.conversationId }, data: { isLocked: true } });
  }
}

/** ໜ້າ moderation — ລາຍການ block ທັງໝົດ (ອ່ານຢ່າງດຽວ: ການ block ເປັນສິດຂອງຜູ້ໃຊ້) + ຈຳນວນຄັ້ງທີ່ຄົນໜຶ່ງຖືກ block. */
export type AdminChatBlockView = {
  id: string;
  blockerId: string;
  blockerName: string;
  blockedId: string;
  blockedName: string;
  /** ຈຳນວນຄົນທີ່ block ຜູ້ໃຊ້ນີ້ທັງໝົດ — ສັນຍານຂອງການລົບກວນ. */
  blockedCount: number;
  createdAt: string;
};

export async function listAllChatBlocks(): Promise<AdminChatBlockView[]> {
  const rows = await prisma.chatBlock.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const ids = [...new Set(rows.flatMap((r) => [r.blockerId, r.blockedId]))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.blockedId, (counts.get(r.blockedId) ?? 0) + 1);
  return rows.map((r) => ({
    id: r.id,
    blockerId: r.blockerId,
    blockerName: name.get(r.blockerId) ?? '—',
    blockedId: r.blockedId,
    blockedName: name.get(r.blockedId) ?? '—',
    blockedCount: counts.get(r.blockedId) ?? 1,
    createdAt: r.createdAt.toISOString(),
  }));
}

