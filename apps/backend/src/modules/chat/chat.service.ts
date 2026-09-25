import { randomUUID } from 'node:crypto';
import type {
  AccessTokenPayload,
  ChatMessagesQuery,
  ChatMessageView,
  ChatThreadView,
  Paginated,
  SendChatMediaInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { pushOnly } from '../../services/push.js';
import { storage } from '../../storage/index.js';
import { ApiError } from '../../utils/ApiError.js';

/** ຮູບ ~8MB, ສຽງ ~10MB ຫຼັງ decode — ກັນ payload ໃຫຍ່ເກີນໄປ. */
const MAX_MEDIA_BYTES: Record<'IMAGE' | 'AUDIO', number> = {
  IMAGE: 8 * 1024 * 1024,
  AUDIO: 10 * 1024 * 1024,
};

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
};

const DEFAULT_CAPTION: Record<'IMAGE' | 'AUDIO', string> = {
  IMAGE: '📷 ຮູບພາບ',
  AUDIO: '🎤 ຂໍ້ຄວາມສຽງ',
};

/** ໂມດູນ 21 — In-App Chat & Consultation Threads. Thread ຜູກກັບນັດໝາຍໜຶ່ງໆ (appointmentId unique) ແລະ
 * ຖືກສ້າງແບບ lazy ຄັ້ງທຳອິດທີ່ຝ່າຍໃດຝ່າຍໜຶ່ງເປີດ/ສົ່ງຂໍ້ຄວາມ (ຄືກັນກັບ ReferralCode.ensureCode). Authorization
 * ໃຊ້ shape ດຽວກັນກັບ home-service.getTripView — ອະນຸຍາດສະເພາະລູກຄ້າເຈົ້າຂອງ, ຊ່າງທີ່ຖືກຈັບຄູ່ ຫຼື admin. */

const APPOINTMENT_INCLUDE = {
  customer: { select: { id: true, name: true } },
  staffProfile: {
    select: {
      id: true,
      userId: true,
      title: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  },
  service: { select: { name: true } },
  branch: { select: { name: true, phone: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

function isAdmin(actor: AccessTokenPayload): boolean {
  return actor.role === 'SUPER_ADMIN' || actor.role === 'BRANCH_ADMIN';
}

function assertAppointmentAccess(actor: AccessTokenPayload, appt: AppointmentRow): void {
  const isCustomer = actor.sub === appt.customerId;
  const isMatchedStaff = appt.staffProfile.userId === actor.sub;
  if (!isAdmin(actor) && !isCustomer && !isMatchedStaff) throw ApiError.forbidden();
}

async function loadAppointment(appointmentId: string): Promise<AppointmentRow> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: APPOINTMENT_INCLUDE,
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍນີ້');
  return appt;
}

function toThreadView(
  thread: { id: string; appointmentId: string | null; branchId: string | null; lastMessageAt: Date | null; createdAt: Date },
  appt: AppointmentRow,
): ChatThreadView {
  return {
    id: thread.id,
    appointmentId: thread.appointmentId ?? appt.id,
    branchId: thread.branchId ?? appt.branchId,
    customerId: appt.customerId,
    customerName: appt.customer.name,
    staffProfileId: appt.staffProfile.id,
    staffName: appt.staffProfile.user.name,
    staffTitle: appt.staffProfile.title,
    staffAvatarUrl: appt.staffProfile.user.avatarUrl,
    serviceName: appt.service.name,
    appointmentStartAt: appt.startAt.toISOString(),
    appointmentStatus: appt.status,
    branchName: appt.branch.name,
    branchPhone: appt.branch.phone,
    lastMessageAt: thread.lastMessageAt ? thread.lastMessageAt.toISOString() : null,
    createdAt: thread.createdAt.toISOString(),
  };
}

function toMessageView(row: {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: string;
  body: string;
  messageType: string;
  mediaUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
  sender: { name: string };
}): ChatMessageView {
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    senderRole: row.senderRole as ChatMessageView['senderRole'],
    senderName: row.sender.name,
    body: row.body,
    messageType: row.messageType,
    mediaUrl: row.mediaUrl,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** ຮັບປະກັນວ່ານັດໝາຍນີ້ມີ ChatThread — ສ້າງໃຫ້ຄັ້ງທຳອິດ (ຄືກັນກັບ referral.ensureCode). */
export async function ensureThread(
  appointmentId: string,
  actor: AccessTokenPayload,
): Promise<ChatThreadView> {
  const appt = await loadAppointment(appointmentId);
  assertAppointmentAccess(actor, appt);

  const existing = await prisma.chatThread.findUnique({ where: { appointmentId } });
  if (existing) return toThreadView(existing, appt);

  const created = await prisma.chatThread.create({
    data: { appointmentId, branchId: appt.branchId },
  });
  return toThreadView(created, appt);
}

/** ໂຫຼດ thread + ກວດ authorization (ໃຊ້ຮ່ວມກັນລະຫວ່າງ REST + socket join-chat), ແຍກຕາມ
 * `thread.type` — ໂມດູນ 38 Wave 8B ຂະຫຍາຍໃຫ້ຮອງຮັບ STAFF_INTERNAL/DIRECT ໂດຍບໍ່ກະທົບ CONSULTATION (ໂມດູນ 21). */
export async function authorizeThreadAccess(
  threadId: string,
  actor: AccessTokenPayload,
): Promise<{ threadId: string; appointmentId: string | null }> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, appointmentId: true, type: true },
  });
  if (!thread) throw ApiError.notFound('ບໍ່ພົບຫົວຂໍ້ສົນທະນານີ້');

  if (thread.type === 'STAFF_INTERNAL' || thread.type === 'DIRECT') {
    if (isAdmin(actor)) return { threadId: thread.id, appointmentId: null };
    const isParticipant = await prisma.conversationParticipant.findUnique({
      where: { threadId_userId: { threadId: thread.id, userId: actor.sub } },
      select: { id: true },
    });
    if (!isParticipant) throw ApiError.forbidden();
    return { threadId: thread.id, appointmentId: null };
  }

  if (!thread.appointmentId) throw ApiError.notFound('ບໍ່ພົບຫົວຂໍ້ສົນທະນານີ້');
  const appt = await loadAppointment(thread.appointmentId);
  assertAppointmentAccess(actor, appt);
  return { threadId: thread.id, appointmentId: thread.appointmentId };
}

/** DIRECT ເທົ່ານັ້ນ — ຖ້າອີກຝ່າຍໃນຫ້ອງ block ຫຼືຖືກ block ຢູ່ (ບໍ່ວ່າທິດໃດ) ຫ້າມສົ່ງຂໍ້ຄວາມ. ກວດຕອນສົ່ງ
 * ບໍ່ແມ່ນສະເພາະຕອນສ້າງຫ້ອງ ຍ້ອນ block ອາດເກີດຫຼັງຈາກຫ້ອງມີແລ້ວ (Module 38 Wave 8D). */
async function assertNotBlocked(threadId: string, senderId: string): Promise<void> {
  const participants = await prisma.conversationParticipant.findMany({
    where: { threadId },
    select: { userId: true },
  });
  const otherId = participants.map((p) => p.userId).find((id) => id !== senderId);
  if (!otherId) return;
  const blocked = await prisma.chatBlock.findFirst({
    where: {
      OR: [
        { blockerId: senderId, blockedId: otherId },
        { blockerId: otherId, blockedId: senderId },
      ],
    },
    select: { id: true },
  });
  if (blocked) throw ApiError.conflict('ບໍ່ສາມາດສົ່ງຂໍ້ຄວາມໄດ້ — ຖືກບລັອກ');
}

/** ໃຊ້ຮ່ວມກັນລະຫວ່າງ `postMessage`/`postMediaMessage` — ກວດ authorization + lock + block ກ່ອນ
 * ອະນຸຍາດໃຫ້ສ້າງຂໍ້ຄວາມໃໝ່ (ບໍ່ວ່າ TEXT/IMAGE/AUDIO). */
async function assertCanSend(threadId: string, actor: AccessTokenPayload): Promise<void> {
  await authorizeThreadAccess(threadId, actor);
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { isLocked: true, type: true },
  });
  if (thread?.isLocked) throw ApiError.conflict('ຫ້ອງສົນທະນານີ້ຖືກປິດແລ້ວ');
  if (thread?.type === 'DIRECT') await assertNotBlocked(threadId, actor.sub);
}

/** ບໍ່ push ຊ້ຳເມື່ອຜູ້ສົ່ງດຽວກັນສົ່ງຕໍ່ເນື່ອງພາຍໃນຊ່ວງນີ້ (ຂໍ້ຄວາມທຳອິດແຈ້ງແລ້ວ). */
const CHAT_PUSH_QUIET_MS = 60_000;

/**
 * Push ແຈ້ງຂໍ້ຄວາມໃໝ່ໃຫ້ຜູ້ຮັບທຸກຄົນໃນຫ້ອງ (ບໍ່ລວມຜູ້ສົ່ງ) — ປິດ debt ຂອງ 7C.2/8B:
 * ເມື່ອກ່ອນຜູ້ຮັບຮູ້ສະເພາະຕອນເຊື່ອມ socket ຢູ່. Fire-and-forget; ລົ້ມບໍ່ກະທົບການສົ່ງ.
 */
async function notifyRecipients(
  threadId: string,
  messageId: string,
  actor: AccessTokenPayload,
  preview: string,
): Promise<void> {
  const [thread, sender, recent] = await Promise.all([
    prisma.chatThread.findUnique({ where: { id: threadId }, select: { type: true, appointmentId: true } }),
    prisma.user.findUnique({ where: { id: actor.sub }, select: { name: true } }),
    prisma.chatMessage.count({
      where: {
        threadId,
        senderId: actor.sub,
        id: { not: messageId },
        createdAt: { gte: new Date(Date.now() - CHAT_PUSH_QUIET_MS) },
      },
    }),
  ]);
  if (!thread || recent > 0) return;

  let recipients: string[] = [];
  if (thread.type === 'STAFF_INTERNAL' || thread.type === 'DIRECT') {
    const parts = await prisma.conversationParticipant.findMany({ where: { threadId }, select: { userId: true } });
    recipients = parts.map((p) => p.userId);
  } else if (thread.appointmentId) {
    const appt = await prisma.appointment.findUnique({
      where: { id: thread.appointmentId },
      select: { customerId: true, staffProfile: { select: { userId: true } } },
    });
    if (appt) recipients = [appt.customerId, appt.staffProfile.userId];
  }
  const text = preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
  await Promise.all(
    [...new Set(recipients)]
      .filter((id) => id !== actor.sub)
      .map((userId) =>
        pushOnly({
          userId,
          type: 'CHAT_MESSAGE',
          title: sender?.name ?? 'Aura',
          body: text,
          data: { threadId, threadType: thread.type, appointmentId: thread.appointmentId },
        }),
      ),
  );
}

function notifyRecipientsLater(threadId: string, messageId: string, actor: AccessTokenPayload, preview: string): void {
  notifyRecipients(threadId, messageId, actor, preview).catch((err: unknown) =>
    logger.warn({ err, threadId }, 'chat push failed'),
  );
}

export async function postMessage(
  threadId: string,
  actor: AccessTokenPayload,
  body: string,
): Promise<ChatMessageView> {
  await assertCanSend(threadId, actor);

  const [row] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { threadId, senderId: actor.sub, senderRole: actor.role, body },
      include: { sender: { select: { name: true } } },
    }),
    prisma.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
  ]);
  notifyRecipientsLater(threadId, row.id, actor, body);
  return toMessageView(row);
}

/** ຮູບ/ຂໍ້ຄວາມສຽງ — decode base64, ບັນທຶກຜ່ານ storage adapter (pattern ດຽວກັນກັບ
 * `staff-portal.addTreatmentPhoto`), ແລ້ວສ້າງ `ChatMessage` ຜູກ `mediaUrl`. */
export async function postMediaMessage(
  threadId: string,
  actor: AccessTokenPayload,
  input: SendChatMediaInput,
): Promise<ChatMessageView> {
  await assertCanSend(threadId, actor);

  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ໄຟລ໌ບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_MEDIA_BYTES[input.messageType]) {
    throw ApiError.badRequest(input.messageType === 'IMAGE' ? 'ຮູບໃຫຍ່ເກີນ 8MB' : 'ໄຟລ໌ສຽງໃຫຍ່ເກີນ 10MB');
  }

  const ext = EXT_BY_CONTENT_TYPE[input.contentType] ?? 'bin';
  const key = `chat/${threadId}/${randomUUID()}.${ext}`;
  const { url } = await storage.save(key, buffer, input.contentType);

  const [row] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        threadId,
        senderId: actor.sub,
        senderRole: actor.role,
        body: input.caption ?? DEFAULT_CAPTION[input.messageType],
        messageType: input.messageType,
        mediaUrl: url,
      },
      include: { sender: { select: { name: true } } },
    }),
    prisma.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
  ]);
  notifyRecipientsLater(threadId, row.id, actor, row.body);
  return toMessageView(row);
}

export async function listMessages(
  threadId: string,
  actor: AccessTokenPayload,
  query: ChatMessagesQuery,
): Promise<Paginated<ChatMessageView>> {
  await authorizeThreadAccess(threadId, actor);

  const where = { threadId };
  const [rows, total, participants] = await Promise.all([
    prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: query.latest ? 'desc' : 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sender: { select: { name: true } } },
    }),
    prisma.chatMessage.count({ where }),
    prisma.conversationParticipant.findMany({
      where: { threadId, lastReadAt: { not: null } },
      select: { userId: true, lastReadAt: true },
    }),
  ]);
  // STAFF_INTERNAL/DIRECT ບໍ່ຂຽນ `ChatMessage.readAt` — ສະຖານະອ່ານຢູ່ທີ່ read cursor ຂອງ participant.
  // ຂໍ້ຄວາມຖືວ່າ "ອ່ານແລ້ວ" ເມື່ອ participant ອື່ນ (ບໍ່ແມ່ນຜູ້ສົ່ງ) ອ່ານເຖິງ createdAt ຂອງມັນ.
  const withReadCursor = (row: (typeof rows)[number]): ChatMessageView => {
    const view = toMessageView(row);
    if (view.readAt || participants.length === 0) return view;
    const reader = participants.find(
      (p) => p.userId !== row.senderId && p.lastReadAt && p.lastReadAt >= row.createdAt,
    );
    return reader?.lastReadAt ? { ...view, readAt: reader.lastReadAt.toISOString() } : view;
  };
  return {
    // latest: ດຶງແບບ desc ເພື່ອໃຫ້ໄດ້ຂໍ້ຄວາມໃໝ່ສຸດ ແລ້ວກັບຄືນເປັນ ເກົ່າ→ໃໝ່ ໃຫ້ client ໃຊ້ຄືເກົ່າ.
    items: (query.latest ? [...rows].reverse() : rows).map(withReadCursor),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
