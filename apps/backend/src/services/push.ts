import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { UserPreferences } from '@abcp/shared-types';
import {
  inferNotificationSeverity,
  mapModule,
  type NotificationSeverity,
} from '../modules/system/system.service.js';

/**
 * Expo Push adapter (Module 23) — ຮຽກ Expo push API ດ້ວຍ global fetch,
 * ບໍ່ເພິ່ງ `expo-server-sdk`. ຖ້າ EXPO_ACCESS_TOKEN ບໍ່ຕັ້ງ → log ເທົ່ານັ້ນ (dev).
 */

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoTicket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/** ສົ່ງ push ໄປຫາ token list. ຄືນ token ທີ່ຄວນລຶບ (DeviceNotRegistered). */
export async function sendPushToTokens(
  tokens: string[],
  message: PushMessage,
): Promise<{ sent: number; invalidTokens: string[] }> {
  const valid = tokens.filter(isExpoToken);
  if (valid.length === 0) return { sent: 0, invalidTokens: [] };

  if (!env.EXPO_ACCESS_TOKEN) {
    logger.info({ count: valid.length, title: message.title }, '[push:dev] would send Expo push');
    return { sent: valid.length, invalidTokens: [] };
  }

  const payload = valid.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: 'default' as const,
    priority: 'high' as const,
  }));

  try {
    const res = await fetch(env.EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const invalidTokens: string[] = [];
    (json.data ?? []).forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(valid[i]!);
      }
    });
    return { sent: valid.length - invalidTokens.length, invalidTokens };
  } catch (err) {
    logger.error({ err }, 'Expo push failed');
    return { sent: 0, invalidTokens: [] };
  }
}

/**
 * Personal notification preferences (/account, mobile ▸ Notifications): per source module,
 * `inbox: false` drops the notification entirely and `push: false` keeps it in the inbox only.
 * SECURITY_* alerts and `critical` items always land in the inbox.
 */
async function deliveryFor(
  userId: string,
  type: string,
  severity: NotificationSeverity,
): Promise<{ inbox: boolean; push: boolean }> {
  const module = mapModule(type);
  if (module === 'security') return { inbox: true, push: true };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (user?.preferences as UserPreferences | null)?.notifications;
  const pref = prefs?.[module as keyof NonNullable<UserPreferences['notifications']>];
  const inbox = severity === 'critical' ? true : (pref?.inbox ?? true);
  return { inbox, push: inbox && (pref?.push ?? true) };
}

/**
 * ສົ່ງ push ໃຫ້ຜູ້ໃຊ້ 1 ຄົນ (ທຸກອຸປະກອນ) + ບັນທຶກ `NotificationLog`.
 * `dedupeKey` ກັນສົ່ງຊ້ຳ (reminder 24h/1h, campaign sweep) — ຖ້າຊ້ຳ → ຂ້າມ.
 */
export async function notifyUser(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  /** Inbox severity — omitted → inferred from `type`. */
  severity?: NotificationSeverity;
}): Promise<{ delivered: boolean; skipped: boolean }> {
  const { userId, type, title, body, data, dedupeKey } = params;
  const severity = params.severity ?? inferNotificationSeverity(type);

  const delivery = await deliveryFor(userId, type, severity);
  if (!delivery.inbox) return { delivered: false, skipped: true };

  if (dedupeKey) {
    const existing = await prisma.notificationLog.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    if (existing) return { delivered: false, skipped: true };
  }

  try {
    await prisma.notificationLog.create({
      data: {
        userId,
        type,
        title,
        body,
        severity,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        dedupeKey: dedupeKey ?? null,
      },
    });
  } catch (err) {
    // unique race on dedupeKey → treat as already sent
    if ((err as { code?: string }).code === 'P2002') return { delivered: false, skipped: true };
    throw err;
  }

  if (!delivery.push) return { delivered: true, skipped: false };

  const devices = await prisma.pushDevice.findMany({
    where: { userId },
    select: { token: true },
  });
  const { invalidTokens } = await sendPushToTokens(
    devices.map((d) => d.token),
    { title, body, data: { type, ...data } },
  );
  if (invalidTokens.length > 0) {
    await prisma.pushDevice.deleteMany({ where: { token: { in: invalidTokens } } });
  }

  return { delivered: true, skipped: false };
}

/**
 * Push ຢ່າງດຽວ (ບໍ່ບັນທຶກ `NotificationLog`) — ສຳລັບເຫດການຖີ່ເຊັ່ນຂໍ້ຄວາມແຊັດ ທີ່ມີ unread ຂອງຕົນເອງ
 * ຢູ່ໜ້າ messaging ແລ້ວ; ລົງ inbox ທຸກຂໍ້ຄວາມຈະຖ້ວມ inbox. ຍັງເຄົາລົບການຕັ້ງຄ່າ push ຂອງຜູ້ໃຊ້.
 */
export async function pushOnly(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const { userId, type, title, body, data } = params;
  const delivery = await deliveryFor(userId, type, 'info');
  if (!delivery.push) return false;
  const devices = await prisma.pushDevice.findMany({ where: { userId }, select: { token: true } });
  if (devices.length === 0) return false;
  const { invalidTokens } = await sendPushToTokens(
    devices.map((d) => d.token),
    { title, body, data: { type, ...data } },
  );
  if (invalidTokens.length > 0) {
    await prisma.pushDevice.deleteMany({ where: { token: { in: invalidTokens } } });
  }
  return true;
}
