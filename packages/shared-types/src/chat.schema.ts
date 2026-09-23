import { z } from 'zod';
import type { UserRole } from './enums.js';

/** ໂມດູນ 21 — In-App Chat & Consultation Threads. Thread ຖືກສ້າງແບບ lazy ຕໍ່ນັດໝາຍໜຶ່ງ (ຄືກັນກັບ
 * ReferralCode.ensureCode) — ບໍ່ມີ endpoint ສ້າງ thread ຕົງໆ, ມີແຕ່ "ensure" ຕອນສົ່ງ/ອ່ານຂໍ້ຄວາມຄັ້ງທຳອິດ. */

export const sendChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

/** `messageType` — ຮູບ/ໄຟລ໌ ແລະ ຂໍ້ຄວາມສຽງ (voice note). ຄືກັນກັບ `TreatmentPhotoCreateInput` —
 * client ສົ່ງ base64, backend decode+save ຜ່ານ storage adapter ດຽວກັນ. */
export const chatMediaContentType = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/webm',
]);

export const sendChatMediaSchema = z.object({
  messageType: z.enum(['IMAGE', 'AUDIO']),
  contentType: chatMediaContentType,
  /** ຮູບ/ສຽງ encode ເປັນ base64 (ບໍ່ຕ້ອງມີ data: prefix). ຈຳກັດ ~10MB ຫຼັງ decode. */
  dataBase64: z.string().min(1),
  caption: z.string().trim().max(500).optional(),
});
export type SendChatMediaInput = z.infer<typeof sendChatMediaSchema>;

/** GET /chat/threads/:id/messages — `latest=true` ນັບໜ້າຈາກຂໍ້ຄວາມໃໝ່ສຸດ (page 1 = N ຂໍ້ຄວາມຫຼ້າສຸດ)
 * ແຕ່ items ຍັງຮຽງ ເກົ່າ→ໃໝ່ ຄືເກົ່າ. ບໍ່ໃສ່ = page 1 ເປັນຂໍ້ຄວາມເກົ່າສຸດ (ພຶດຕິກຳເດີມ). */
export const chatMessagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(20),
  latest: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ChatMessagesQuery = z.infer<typeof chatMessagesQuerySchema>;

export type ChatThreadView = {
  id: string;
  appointmentId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  staffProfileId: string | null;
  staffName: string | null;
  staffTitle: string | null;
  staffAvatarUrl: string | null;
  /** ບໍລິບົດນັດໝາຍ — ສະແດງເທິງຫົວແຊັດ. */
  serviceName: string;
  appointmentStartAt: string;
  appointmentStatus: string;
  branchName: string;
  branchPhone: string;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ChatMessageView = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: UserRole;
  senderName: string;
  body: string;
  /** "TEXT" | "IMAGE" | "AUDIO" | "SYSTEM" — ຮູບ/ສຽງ ອ່ານໄດ້ຈາກ `mediaUrl`. */
  messageType: string;
  mediaUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

/** socket.io `chat:message` payload — double ໜ້າທີ່ ເປັນທັງ REST view ແລະ socket shape (ຄືກັນກັບ
 * HomeServiceLocationEvent). */
export type ChatMessageEvent = ChatMessageView;

/** socket.io `chat:read` payload — read-receipt (nice-to-have). */
export type ChatReadEvent = {
  threadId: string;
  readerId: string;
  readAt: string;
};

/** ໂມດູນ 38 — Platform-Wide Messaging (Phase 8, Wave 8B). `POST /conversations {type:'STAFF_INTERNAL'}`. */
export const createStaffConversationSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1),
});
export type CreateStaffConversationInput = z.infer<typeof createStaffConversationSchema>;

export const conversationListQuerySchema = z.object({
  type: z.enum(['CONSULTATION', 'STAFF_INTERNAL', 'DIRECT']).optional(),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

/** ໂມດູນ 38 Wave 8C — `PATCH /conversations/:id/lock` (admin-only moderation, ໃຊ້ໄດ້ທຸກ type). */
export const setThreadLockSchema = z.object({ isLocked: z.boolean() });
export type SetThreadLockInput = z.infer<typeof setThreadLockSchema>;

/** ລາຍການ "ຫ້ອງແຊັດຂອງຂ້ອຍ" ແບບທົ່ວໄປ (ບໍ່ຜູກ appointment ຄືກັນກັບ `ChatThreadView`) — ໃຊ້ໂດຍ
 * `GET /conversations` ສຳລັບ STAFF_INTERNAL ແລະ DIRECT. */
export type ConversationListItem = {
  id: string;
  type: 'CONSULTATION' | 'STAFF_INTERNAL' | 'DIRECT';
  title: string | null;
  participants: { id: string; name: string; role: UserRole }[];
  lastMessageAt: string | null;
  createdAt: string;
  /** admin/auto-lock — ອ່ານໄດ້ ແຕ່ສົ່ງບໍ່ໄດ້. */
  isLocked: boolean;
  /** ຂໍ້ຄວາມທີ່ຍັງບໍ່ຖືກລຶບ ທັງໝົດໃນຫ້ອງ. */
  messageCount: number;
  /** ຂໍ້ຄວາມຈາກຄົນອື່ນ ທີ່ມາຫຼັງ `lastReadAt` ຂອງ viewer. */
  unreadCount: number;
  /** ຂໍ້ຄວາມລ່າສຸດ (ບໍ່ລວມທີ່ຖືກລຶບ) ສຳລັບ preview ໃນ inbox. */
  lastMessage: {
    id: string;
    senderId: string;
    senderName: string;
    body: string;
    messageType: string;
    createdAt: string;
  } | null;
};

/** `GET /conversations/:id/media` — ສະຫຼຸບ media ທັງຫ້ອງ (ບໍ່ຈຳກັດແຕ່ 100 ຂໍ້ຄວາມລ່າສຸດທີ່ໂຫຼດມາ). */
export type ConversationMediaSummary = {
  photoCount: number;
  voiceCount: number;
  /** ຮູບລ່າສຸດກ່ອນ, ສູງສຸດ `limit`. */
  photos: { id: string; mediaUrl: string; senderName: string; createdAt: string }[];
};

/** ໂມດູນ 38 Wave 8D — `POST /conversations {type:'DIRECT', targetUserId}` (customer↔customer 1-ຕໍ່-1,
 * ຝ່າຍເປົ້າໝາຍຕ້ອງເປີດ `allowDirectMessages` ໄວ້ກ່ອນ — opt-in). */
export const createDirectConversationSchema = z.object({
  targetUserId: z.string().uuid(),
});
export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;

/** `POST /conversations` body — discriminated ຕາມ `type` (STAFF_INTERNAL ຈາກ Wave 8B, DIRECT ຈາກ 8D). */
export const createConversationSchema = z.discriminatedUnion('type', [
  createStaffConversationSchema.extend({ type: z.literal('STAFF_INTERNAL') }),
  createDirectConversationSchema.extend({ type: z.literal('DIRECT') }),
]);
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/** `POST /conversations/:id/report` — DIRECT only, ລູກຄ້າ report ຫ້ອງ/ຂໍ້ຄວາມ ໃຫ້ admin ທົບທວນ. */
export const reportConversationSchema = z.object({
  messageId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(500),
});
export type ReportConversationInput = z.infer<typeof reportConversationSchema>;

export const reviewChatReportSchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED']),
});
export type ReviewChatReportInput = z.infer<typeof reviewChatReportSchema>;

/** `GET /conversations/blocks` — ຄົນທີ່ viewer ບລັອກໄວ້ (ສະເພາະທິດທາງຂອງ viewer; ບໍ່ເປີດເຜີຍວ່າໃຜບລັອກ viewer). */
export type BlockedUserView = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  blockedAt: string;
};

export type ChatReportView = {
  id: string;
  conversationId: string;
  messageId: string | null;
  reportedById: string;
  reportedByName: string;
  reason: string;
  status: 'PENDING' | 'REVIEWED' | 'ACTIONED';
  createdAt: string;
};
