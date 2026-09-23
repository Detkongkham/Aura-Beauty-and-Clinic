import { z } from 'zod';

/**
 * Wave 10G — ຄວາມຍິນຍອມການຕະຫຼາດ & ລາຍຊື່ຫ້າມສົ່ງ.
 * Opt-in ເທົ່ານັ້ນ: ບໍ່ມີແຖວ consent = ຫ້າມສົ່ງໂປຣໂມຊັນ. ຂໍ້ຄວາມ transactional (ນັດໝາຍ / ໃບຮັບເງິນ) ປິດບໍ່ໄດ້.
 */

export const ConsentChannel = z.enum(['PUSH', 'SMS', 'EMAIL', 'LINE']);
export type ConsentChannel = z.infer<typeof ConsentChannel>;

export const SuppressionReason = z.enum(['UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL']);
export type SuppressionReason = z.infer<typeof SuppressionReason>;

export const CONSENT_SOURCES = ['register', 'profile', 'admin', 'unsubscribe-link', 'stop-reply'] as const;

/** PUT /consent/me */
export const updateConsentSchema = z.object({
  channel: ConsentChannel,
  granted: z.boolean(),
});
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;

/** POST /consent/unsubscribe (public, ຕ້ອງມີ token ລາຍເຊັນ) */
export const unsubscribeSchema = z.object({
  token: z.string().min(20).max(500),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

export type ConsentChannelView = {
  channel: ConsentChannel;
  granted: boolean;
  /** ວັນທີໃຫ້/ຖອນຫຼ້າສຸດ; null = ບໍ່ເຄີຍຕັດສິນໃຈ */
  updatedAt: string | null;
  /** ຢູ່ໃນລາຍຊື່ຫ້າມສົ່ງ (ຖອນຕົວ/bounce/ຮ້ອງທຸກ) — ເປີດຄືນເອງບໍ່ໄດ້ຈົນກວ່າຈະ opt-in ໃໝ່ */
  suppressed: boolean;
};

export type ConsentPreferencesView = {
  channels: ConsentChannelView[];
  /** ປະເພດທີ່ປິດບໍ່ໄດ້ (ການແຈ້ງເຕືອນນັດໝາຍ, ໃບຮັບເງິນ) — ສະແດງໃນ UI ເປັນ locked. */
  transactionalTypes: string[];
  /** ຂໍ້ຈຳກັດ 10G — ມີຂໍ້ມູນຕິດຕໍ່ຂອງແຕ່ລະຊ່ອງບໍ່ (ບໍ່ມີ = ຍິນຍອມແລ້ວກໍສົ່ງບໍ່ໄດ້). */
  contacts: { phone: boolean; email: boolean; lineLinked: boolean };
};

export const suppressionListQuerySchema = z.object({
  channel: ConsentChannel.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SuppressionListQuery = z.infer<typeof suppressionListQuerySchema>;

export const createSuppressionSchema = z.object({
  identifier: z.string().trim().min(1).max(200),
  channel: ConsentChannel,
  reason: SuppressionReason.default('MANUAL'),
  note: z.string().trim().max(300).optional(),
});
export type CreateSuppressionInput = z.infer<typeof createSuppressionSchema>;

export type SuppressionView = {
  id: string;
  identifier: string;
  channel: ConsentChannel;
  reason: SuppressionReason;
  note: string | null;
  createdAt: string;
};

export type ConsentSummaryView = {
  totalCustomers: number;
  channels: Array<{ channel: ConsentChannel; granted: number; revoked: number; suppressed: number }>;
};

/** ນະໂຍບາຍການສົ່ງ (ບັງຄັບຢູ່ runCampaign): ຊ່ວງງຽບ (ເວລາ Vientiane) + ເພດານຈຳນວນ/ອາທິດ. */
export const marketingPolicySchema = z.object({
  quietHoursEnabled: z.boolean(),
  /** HH:mm — ອະນຸຍາດຂ້າມທ່ຽງຄືນ (21:00 → 08:00) */
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** ຈຳນວນສູງສຸດຂອງຂໍ້ຄວາມແຄມເປນຕໍ່ລູກຄ້າໃນ 7 ມື້; 0 = ບໍ່ຈຳກັດ */
  weeklyCap: z.number().int().min(0).max(50),
});
export type MarketingPolicy = z.infer<typeof marketingPolicySchema>;

// ---- ຂໍ້ຈຳກັດ 10G: ຊ່ອງທາງນອກຈາກ push --------------------------

/** GET /consent/channels — ຊ່ອງໃດຕັ້ງຄ່າຜູ້ໃຫ້ບໍລິການແລ້ວ (ສົ່ງຈິງໄດ້). */
export type ChannelStatusView = {
  channels: Array<{ channel: ConsentChannel; configured: boolean }>;
  /** ລິ້ງເພີ່ມໝູ່ LINE OA (null = ບໍ່ໄດ້ຕັ້ງ) */
  lineAddFriendUrl: string | null;
};

/** POST /consent/me/line-link — ລະຫັດຜູກ LINE (ສົ່ງລະຫັດນີ້ເປັນຂໍ້ຄວາມໃຫ້ OA). */
export type LineLinkCodeView = {
  code: string;
  expiresAt: string;
  addFriendUrl: string | null;
  linked: boolean;
};

/** POST /consent/sms/inbound — gateway forward ຂໍ້ຄວາມຕອບກັບ. */
export const smsInboundSchema = z.object({
  from: z.string().trim().min(6).max(32),
  text: z.string().max(1000),
});
export type SmsInboundInput = z.infer<typeof smsInboundSchema>;
