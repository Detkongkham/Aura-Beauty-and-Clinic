import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  inferNotificationSeverity,
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
