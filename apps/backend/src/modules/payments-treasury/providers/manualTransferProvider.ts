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

/**
 * ບໍ່ມີ API — ລູກຄ້າໂອນເງິນດ້ວຍເລກບັນຊີ/QR ຄົງທີ່ ແລ້ວອັບສະລິບໃຫ້ພະນັກງານກວດ (Wave 3).
 * ນີ້ຄືເສັ້ນທາງທີ່ **ໃຊ້ໄດ້ຈິງ** ມື້ນີ້ (ບໍ່ມີທະນາຄານໃດຢູ່ລາວເປີດ API ໃຫ້ SME ໃນມາດຕະຖານດຽວກັນ).
 * ບໍ່ມີ webhook ຈິງ — `verifyWebhook`/`queryStatus` ຈຶ່ງບໍ່ມີແຫຼ່ງຂໍ້ມູນ, ຕັດຍອດແມ່ນຜ່ານ
 * `PaymentSlip` review flow ແທນ (Wave 3), ບໍ່ແມ່ນຜ່ານ adapter ນີ້.
 */
export class ManualTransferProvider implements BankProvider {
  readonly code = 'MANUAL_TRANSFER';

  async createQrIntent(params: CreateQrIntentParams): Promise<QrIntentResult> {
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000);
    const qrPayload = JSON.stringify({
      scheme: 'MANUAL_TRANSFER',
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      accountNumber: params.bankAccountNumber ?? null,
      accountName: params.bankAccountName ?? null,
    });
    return { qrPayload, expiresAt };
  }

  verifyWebhook(rawBody: Buffer | string, _signature: string | undefined, _secret: string): WebhookVerifyResult {
    return { ok: false, eventId: '', reference: '', status: 'FAILED', raw: rawBody.toString() };
  }

  async queryStatus(_reference: string): Promise<ProviderIntentStatus> {
    return 'PENDING';
  }

  async refund(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `RFD_MANUAL_${randomBytes(6).toString('hex')}` };
  }

  async payout(_params: RefundParams): Promise<ProviderActionResult> {
    return { ok: true, providerRef: `PYT_MANUAL_${randomBytes(6).toString('hex')}` };
  }
}
