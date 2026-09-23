import { createHash, randomBytes } from 'node:crypto';
import type {
  BankProvider,
  CreateQrIntentParams,
  ProviderActionResult,
  ProviderIntentStatus,
  QrIntentResult,
  RefundParams,
  WebhookVerifyResult,
} from './types.js';
import { verifyHmacWebhook } from './webhookUtil.js';

/**
 * ຈຳລອງ BCEL One QR — ບໍ່ຮຽກ network ຈິງ. Payload ເປັນ EMVCo-ish opaque string ຄືກັບ
 * `services/paymentGateway.ts` ເກົ່າ, ແຕ່ຫໍ່ຢູ່ໃນ interface `BankProvider` ໃໝ່.
 */
export class MockBcelProvider implements BankProvider {
  readonly code = 'MOCK_BCEL';

  async createQrIntent(params: CreateQrIntentParams): Promise<QrIntentResult> {
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000);
    const raw = [
      '00020101',
      `54${params.amount.toFixed(2)}`,
      `53${params.currency}`,
      `62${params.reference}`,
    ].join('');
    const checksum = createHash('sha256').update(raw).digest('hex').slice(0, 8).toUpperCase();
    return { qrPayload: `${raw}6304${checksum}`, expiresAt };
  }

  verifyWebhook(rawBody: Buffer | string, signature: string | undefined, secret: string): WebhookVerifyResult {
    return verifyHmacWebhook(rawBody, signature, secret);
  }

  async queryStatus(_reference: string): Promise<ProviderIntentStatus> {
    return 'PENDING';
  }

  async refund(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `RFD_MOCKBCEL_${randomBytes(6).toString('hex')}` };
  }

  async payout(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `PYT_MOCKBCEL_${randomBytes(6).toString('hex')}` };
  }
}
