import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConsentChannel } from '@abcp/shared-types';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * ຂໍ້ຈຳກັດ 10G — adapter ສົ່ງຂໍ້ຄວາມແຄມເປນທາງ SMS / ອີເມວ / LINE ດ້ວຍ global fetch (ບໍ່ເພິ່ງ SDK ໃໝ່,
 * ຄືກັນກັບ `telegram.ts` / Expo push). ຊ່ອງທີ່ບໍ່ໄດ້ຕັ້ງຄ່າ env → `isChannelConfigured` = false ແລະ ແຄມເປນຂ້າມ
 * (ບໍ່ "ທຳທ່າ" ວ່າສົ່ງແລ້ວ). ຜົນ `ok: false` = ສົ່ງບໍ່ສຳເລັດ (ບໍ່ບັນທຶກວ່າສົ່ງ).
 */

export type SendResult = { ok: boolean; error?: string };

export function isChannelConfigured(channel: ConsentChannel): boolean {
  switch (channel) {
    case 'PUSH':
      return true;
    case 'SMS':
      return Boolean(env.SMS_GATEWAY_URL && env.SMS_GATEWAY_TOKEN);
    case 'EMAIL':
      return Boolean(env.EMAIL_PROVIDER && env.EMAIL_API_KEY && env.EMAIL_FROM);
    case 'LINE':
      return Boolean(env.LINE_CHANNEL_ACCESS_TOKEN);
    default:
      return false;
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: text.slice(0, 500) }, `${label} send failed`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, `${label} send failed`);
    return { ok: false, error: (err as Error).message };
  }
}

/** ເບີລາວ 020xxxxxxxx / 20xxxxxxxx → E.164 +85620xxxxxxxx. */
export function toE164Lao(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('856')) return `+${digits}`;
  if (digits.startsWith('0')) return `+856${digits.slice(1)}`;
  return `+856${digits}`;
}

export async function sendSms(to: string, message: string): Promise<SendResult> {
  if (!env.SMS_GATEWAY_URL || !env.SMS_GATEWAY_TOKEN) return { ok: false, error: 'SMS not configured' };
  return post(
    env.SMS_GATEWAY_URL,
    { Authorization: `Bearer ${env.SMS_GATEWAY_TOKEN}` },
    { to: toE164Lao(to), from: env.SMS_SENDER_ID, message },
    'SMS',
  );
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<SendResult> {
  if (!env.EMAIL_PROVIDER || !env.EMAIL_API_KEY || !env.EMAIL_FROM) return { ok: false, error: 'Email not configured' };
  if (env.EMAIL_PROVIDER === 'resend') {
    return post(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${env.EMAIL_API_KEY}` },
      { from: env.EMAIL_FROM, to: [to], subject, text, html },
      'Email(resend)',
    );
  }
  return post(
    'https://api.sendgrid.com/v3/mail/send',
    { Authorization: `Bearer ${env.EMAIL_API_KEY}` },
    {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env.EMAIL_FROM },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    },
    'Email(sendgrid)',
  );
}

export async function sendLine(lineUserId: string, text: string): Promise<SendResult> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { ok: false, error: 'LINE not configured' };
  return post(
    'https://api.line.me/v2/bot/message/push',
    { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    { to: lineUserId, messages: [{ type: 'text', text: text.slice(0, 5000) }] },
    'LINE',
  );
}

export async function replyLine(replyToken: string, text: string): Promise<SendResult> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { ok: false, error: 'LINE not configured' };
  return post(
    'https://api.line.me/v2/bot/message/reply',
    { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    { replyToken, messages: [{ type: 'text', text }] },
    'LINE reply',
  );
}

/** ກວດ `X-Line-Signature` = base64(HMAC-SHA256(channelSecret, rawBody)). */
export function verifyLineSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!env.LINE_CHANNEL_SECRET || !rawBody || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', env.LINE_CHANNEL_SECRET).update(rawBody).digest('base64'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
