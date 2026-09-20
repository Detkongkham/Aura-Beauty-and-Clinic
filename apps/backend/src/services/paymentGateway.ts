import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Mock payment gateways (Module 08) — ບໍ່ຮຽກ network ຈິງ.
 * BCEL One QR: ສ້າງ payload string ທີ່ client render ເປັນ QR.
 * Stripe: mock charge — token ຂຶ້ນຕົ້ນ "tok_" ຫຼື "pm_" = ສຳເລັດ, "tok_fail" = ລົ້ມເຫຼວ.
 */

export type QrIntent = {
  qrReference: string;
  qrPayload: string;
  expiresAt: Date;
};

export function createBcelQrIntent(params: {
  amount: number;
  currency: string;
  ttlMinutes: number;
  billId: string;
}): QrIntent {
  const qrReference = `BCEL${randomBytes(9).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000);
  // EMVCo-ish opaque payload; demo only.
  const raw = [
    '00020101',
    `26${env.BCEL_MERCHANT_ID}`,
    `54${params.amount.toFixed(2)}`,
    `53${params.currency}`,
    `62${qrReference}`,
    `99${params.billId}`,
  ].join('');
  const checksum = createHash('sha256').update(raw).digest('hex').slice(0, 8).toUpperCase();
  return { qrReference, qrPayload: `${raw}6304${checksum}`, expiresAt };
}

export type StripeChargeResult =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

export function stripeMockCharge(params: {
  amount: number;
  currency: string;
  cardToken: string;
}): StripeChargeResult {
  if (env.STRIPE_SECRET_KEY) {
    logger.info({ amount: params.amount }, '[stripe:mock] charge (live key present, still mocked)');
  }
  if (!params.cardToken || params.cardToken === 'tok_fail') {
    return { ok: false, reason: 'card_declined' };
  }
  if (!/^(tok_|pm_)/.test(params.cardToken)) {
    return { ok: false, reason: 'invalid_token' };
  }
  return { ok: true, reference: `ch_${randomBytes(12).toString('hex')}` };
}
