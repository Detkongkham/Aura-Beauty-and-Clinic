import { randomBytes } from 'node:crypto';
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
 * ຈຳລອງ QR ມາດຕະຖານກາງ (LAPNet-style) — ໃຊ້ໄດ້ກັບຫຼາຍທະນາຄານທີ່ຮອງຮັບ QR ກາງ.
 * payload ເປັນ JSON opaque string (ຕ່າງຈາກ EMVCo ຂອງ BCEL) — ຈຸດປະສົງແມ່ນສະແດງໃຫ້ເຫັນວ່າ
 * adapter ແຕ່ລະຕົວອາດມີ payload format ຕ່າງກັນໄດ້ ໂດຍບໍ່ກະທົບ contract ຂອງ interface.
 */
export class MockLaoQrProvider implements BankProvider {
  readonly code = 'MOCK_LAO_QR';

  async createQrIntent(params: CreateQrIntentParams): Promise<QrIntentResult> {
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000);
    const qrPayload = JSON.stringify({
      scheme: 'LAO_QR',
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
    });
    return { qrPayload, expiresAt };
  }

  verifyWebhook(rawBody: Buffer | string, signature: string | undefined, secret: string): WebhookVerifyResult {
    return verifyHmacWebhook(rawBody, signature, secret);
  }

  async queryStatus(_reference: string): Promise<ProviderIntentStatus> {
    return 'PENDING';
  }

  async refund(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `RFD_LAOQR_${randomBytes(6).toString('hex')}` };
  }

  async payout(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `PYT_LAOQR_${randomBytes(6).toString('hex')}` };
  }
}
