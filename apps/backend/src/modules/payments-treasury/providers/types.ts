/**
 * ໂມດູນ 39 W1 — Bank provider adapter contract. ທຸກ provider (mock ຫຼືຂອງຈິງໃນອະນາຄົດ) ຜ່ານ
 * interface ດຽວກັນ ເພື່ອວ່າ route/service layer ບໍ່ຕ້ອງຮູ້ວ່າແມ່ນ mock ຫຼືຂອງຈິງ
 * (pattern ດຽວກັບ `skin-analysis/analyze.ts`). ອ້າງອີງ docs/payments-treasury-plan.md §2.2.
 */

export type ProviderIntentStatus = 'PENDING' | 'SUCCESS' | 'EXPIRED' | 'FAILED';

export interface CreateQrIntentParams {
  amount: number;
  currency: string;
  ttlMinutes: number;
  reference: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}

export interface QrIntentResult {
  qrPayload: string;
  expiresAt: Date;
}

export interface WebhookVerifyResult {
  ok: boolean;
  eventId: string;
  reference: string;
  status: ProviderIntentStatus;
  /** ຈຳນວນເງິນທີ່ provider ລາຍງານ (ຖ້າມີ) — ໃຊ້ປຽບທຽບກັບ intent ກ່ອນຕັດຍອດ. */
  amount?: number;
  raw: unknown;
}

export interface RefundParams {
  reference: string;
  amount: number;
  currency: string;
}

export interface ProviderActionResult {
  ok: boolean;
  providerRef?: string;
  reason?: string;
}

export interface BankProvider {
  readonly code: string;
  createQrIntent(params: CreateQrIntentParams): Promise<QrIntentResult>;
  /** ກວດ signature ຂອງ webhook payload ດິບ — ຕ້ອງເອີ້ນກ່ອນ parse payload ສະເໝີ (§2.2). */
  verifyWebhook(rawBody: Buffer | string, signature: string | undefined, secret: string): WebhookVerifyResult;
  queryStatus(reference: string): Promise<ProviderIntentStatus>;
  refund(params: RefundParams): Promise<ProviderActionResult>;
  payout(params: RefundParams): Promise<ProviderActionResult>;
}
