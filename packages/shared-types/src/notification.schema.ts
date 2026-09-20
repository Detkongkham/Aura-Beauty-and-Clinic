import { z } from 'zod';

/**
 * Push Notifications & Multi-channel Reminders — ໂມດູນ 23 (Phase 5).
 * ແຈ້ງລ່ວງໜ້າ 24h ແລະ 1h ຜ່ານ Expo Push, ບັນທຶກ `NotificationLog`.
 */

export const pushPlatformSchema = z.enum(['ios', 'android', 'web']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

/** POST /notifications/devices — ລົງທະບຽນ Expo push token (ຕອນ login / boot ແອັບ). */
export const registerPushDeviceSchema = z.object({
  /** Expo push token: "ExponentPushToken[xxxx]" ຫຼື FCM/APNs raw. */
  token: z.string().trim().min(10).max(256),
  platform: pushPlatformSchema,
  deviceName: z.string().trim().max(120).optional(),
});
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;

export const unregisterPushDeviceSchema = z.object({
  token: z.string().trim().min(10).max(256),
});
export type UnregisterPushDeviceInput = z.infer<typeof unregisterPushDeviceSchema>;

/** ປະເພດ NotificationLog.type — ໃຊ້ຮ່ວມ client/server. */
export const notificationTypeSchema = z.enum([
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLED',
  'WAITLIST_SLOT_OPEN',
  'PAYMENT_RECEIPT',
  'LOYALTY_EARNED',
  'GIFT_CARD_RECEIVED',
  'CAMPAIGN',
  'GENERAL',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export type PushDeviceView = {
  id: string;
  platform: PushPlatform;
  deviceName: string | null;
  lastSeenAt: string;
  createdAt: string;
};
