import { z } from 'zod';
import { PaymentMethod, PaymentStatus } from './enums.js';
import { moneySchema, paginationQuerySchema } from './common.schema.js';

/**
 * Payments, Split Tender & Deposits — ໂມດູນ 08 (Phase 5).
 * 1 `Payment` → ຫຼາຍ `PaymentTransaction` (ມັດຈຳ + ຄະແນນ + ເງິນສົດ ໃນບິນດຽວ).
 */

/** ອັດຕາເງິນມັດຈຳ — default 20%, ຜູ້ຈັດການປັບໄດ້ 20–50% ກັນ No-Show. */
export const MIN_DEPOSIT_RATE = 0.2;
export const MAX_DEPOSIT_RATE = 0.5;
export const DEFAULT_DEPOSIT_RATE = 0.2;

export const depositRateSchema = z.number().min(MIN_DEPOSIT_RATE).max(MAX_DEPOSIT_RATE);

/** 1 ລາຍການຈ່າຍໃນ split tender. */
export const paymentTenderSchema = z.object({
  method: PaymentMethod,
  amount: moneySchema.refine((n) => n > 0, 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0'),
  /** ໃຊ້ກັບ method = GIFT_CARD */
  giftCardCode: z.string().trim().min(4).max(32).optional(),
  /** ໃຊ້ກັບ method = LOYALTY_POINTS — ຈຳນວນຄະແນນທີ່ຈະຫັກ */
  loyaltyPoints: z.number().int().positive().optional(),
  /** ໃຊ້ກັບ method = PACKAGE_CREDIT */
  userPackageId: z.string().uuid().optional(),
  /** ໃຊ້ກັບ method = BCEL_ONE_QR — reference ຈາກ deposit-intent */
  qrReference: z.string().trim().max(64).optional(),
  /** ໃຊ້ກັບ method = CREDIT_CARD — Stripe (mock) card token */
  cardToken: z.string().trim().max(120).optional(),
});
export type PaymentTenderInput = z.infer<typeof paymentTenderSchema>;

/** POST /payments — ເປີດບິນໃຫ້ appointment ຫຼື booking group. */
export const createPaymentSchema = z
  .object({
    appointmentId: z.string().uuid().optional(),
    bookingGroupId: z.string().uuid().optional(),
    depositRate: depositRateSchema.optional(),
  })
  .refine((v) => Boolean(v.appointmentId) !== Boolean(v.bookingGroupId), {
    message: 'ຕ້ອງລະບຸ appointmentId ຫຼື bookingGroupId ຢ່າງໃດໜຶ່ງ',
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** POST /payments/:id/tenders — ບັນທຶກການຈ່າຍ (ຮອງຮັບຫຼາຍຄັ້ງ = split tender). */
export const addTendersSchema = z.object({
  tenders: z.array(paymentTenderSchema).min(1).max(5),
});
export type AddTendersInput = z.infer<typeof addTendersSchema>;

/** POST /payments/:id/deposit-intent — ສ້າງ QR/charge ມັດຈຳ (mock gateway). */
export const depositIntentSchema = z.object({
  method: z.enum(['BCEL_ONE_QR', 'CREDIT_CARD']).default('BCEL_ONE_QR'),
});
export type DepositIntentInput = z.infer<typeof depositIntentSchema>;

/** POST /payments/:id/settle-mock — demo: mark QR/charge reference ເປັນຈ່າຍແລ້ວ. */
export const settleMockSchema = z.object({
  qrReference: z.string().trim().min(1),
});
export type SettleMockInput = z.infer<typeof settleMockSchema>;

/** GET /payments (web-admin finance) */
export const paymentListQuerySchema = paginationQuerySchema.extend({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  status: PaymentStatus.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().trim().min(1).optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export type PaymentTransactionView = {
  id: string;
  method: z.infer<typeof PaymentMethod>;
  amount: number;
  currency: string;
  status: string;
  qrReference: string | null;
  createdAt: string;
};

export type PaymentView = {
  id: string;
  branchId: string;
  branchName: string;
  appointmentId: string | null;
  bookingGroupId: string | null;
  customerName: string | null;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  balanceAmount: number;
  currency: string;
  paymentStatus: z.infer<typeof PaymentStatus>;
  paidAt: string | null;
  createdAt: string;
  transactions: PaymentTransactionView[];
  /** Wave 10B — ເລກໃບຮັບເງິນ (ອອກຕອນ FULLY_PAID), VAT ທີ່ລວມຢູ່ໃນຍອດ, ຍອດຄືນເງິນສະສົມ, ຂໍ້ມູນ void. */
  invoiceNo: string | null;
  vatRate: number | null;
  /** null = ບໍ່ມີ VAT; EXCLUSIVE = ພາສີບວກເທິງລາຄາ (totalAmount = net + tax) */
  vatMode: 'INCLUSIVE' | 'EXCLUSIVE' | null;
  taxAmount: number | null;
  netAmount: number | null;
  refundedAmount: number;
  voidedAt: string | null;
  voidReason: string | null;
};

/** ຜົນ deposit-intent — QR payload (mock, client render ເປັນ QR). */
export type DepositIntentView = {
  paymentId: string;
  method: z.infer<typeof PaymentMethod>;
  amount: number;
  currency: string;
  qrReference: string;
  qrPayload: string;
  expiresAt: string;
};

export type FinanceSummaryView = {
  from: string;
  to: string;
  grossRevenue: number;
  depositsCollected: number;
  outstandingBalance: number;
  refunded: number;
  byMethod: Array<{ method: z.infer<typeof PaymentMethod>; amount: number; count: number }>;
  paymentCount: number;
};
