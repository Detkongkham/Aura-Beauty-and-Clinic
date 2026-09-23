import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderIntentStatus, WebhookVerifyResult } from './types.js';

export const WEBHOOK_SIGNATURE_HEADER = 'x-signature';

export function signWebhookBody(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * ກວດ HMAC-SHA256 (hex) ກ່ອນ parse ສະເໝີ — signature ຜິດ = ບໍ່ແຕະ payload ເລີຍ.
 * ໃຊ້ຮ່ວມກັນທຸກ mock provider; provider LIVE ທີ່ signature ຕ່າງກັນ override ໃນ class ຕົວເອງ.
 */
export function verifyHmacWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string,
): WebhookVerifyResult {
  const failed: WebhookVerifyResult = { ok: false, eventId: '', reference: '', status: 'FAILED', raw: null };
  if (!signature) return failed;
  const expected = Buffer.from(signWebhookBody(rawBody, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return failed;

  try {
    const p = JSON.parse(rawBody.toString()) as {
      eventId?: string;
      reference?: string;
      status?: ProviderIntentStatus;
      amount?: number;
    };
    return {
      ok: true,
      eventId: p.eventId ?? '',
      reference: p.reference ?? '',
      status: p.status ?? 'FAILED',
      amount: typeof p.amount === 'number' ? p.amount : undefined,
      raw: p,
    };
  } catch {
    return failed;
  }
}
