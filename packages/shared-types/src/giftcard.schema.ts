import { z } from 'zod';
import { moneySchema, paginationQuerySchema } from './common.schema.js';

/**
 * E-Gift Cards & Digital Vouchers — ໂມດູນ 13 (Phase 5).
 * ຊື້ບັດຂອງຂວັນສົ່ງໃຫ້ໝູ່, Ledger `GiftCardTransaction` ກວດຍອດຄົງເຫຼືອ.
 */

export const GIFT_CARD_MIN_AMOUNT = 50_000;
export const GIFT_CARD_MAX_AMOUNT = 20_000_000;
export const GIFT_CARD_VALID_MONTHS = 12;

const giftCardAmountSchema = moneySchema.refine(
  (n) => n >= GIFT_CARD_MIN_AMOUNT && n <= GIFT_CARD_MAX_AMOUNT,
  `ຈຳນວນຕ້ອງຢູ່ລະຫວ່າງ ${GIFT_CARD_MIN_AMOUNT}–${GIFT_CARD_MAX_AMOUNT} LAK`,
);

/** POST /gift-cards/purchase — ລູກຄ້າຊື້ບັດຂອງຂວັນເອງ (Wave 10A: ຕ້ອງຈ່າຍຜ່ານ Payment ກ່ອນຈຶ່ງ activate). */
export const purchaseGiftCardSchema = z.object({
  branchId: z.string().uuid(),
  amount: giftCardAmountSchema,
  recipientEmail: z.string().trim().email(),
  recipientName: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().max(500).optional(),
});
export type PurchaseGiftCardInput = z.infer<typeof purchaseGiftCardSchema>;

/** POST /gift-cards/issue — admin ອອກດ້ວຍມື (ບໍ່ເກັບເງິນ), ບັງຄັບໃຫ້ລະບຸເຫດຜົນ + audit. */
export const issueGiftCardSchema = z.object({
  branchId: z.string().uuid(),
  amount: giftCardAmountSchema,
  recipientEmail: z.string().trim().email(),
  recipientName: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().max(500).optional(),
  issueReason: z.string().trim().min(3).max(300),
});
export type IssueGiftCardInput = z.infer<typeof issueGiftCardSchema>;

/** GET /gift-cards/lookup?code= — ກວດຍອດກ່ອນໃຊ້. */
export const giftCardLookupSchema = z.object({
  code: z.string().trim().min(4).max(32),
});
export type GiftCardLookupInput = z.infer<typeof giftCardLookupSchema>;

export const giftCardListQuerySchema = paginationQuerySchema.extend({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  scope: z.enum(['all', 'active', 'redeemed']).default('all'),
  q: z.string().trim().min(1).optional(),
});
export type GiftCardListQuery = z.infer<typeof giftCardListQuerySchema>;

export type GiftCardTransactionView = {
  id: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

export const GIFT_CARD_STATUSES = [
  'PENDING_PAYMENT',
  'ACTIVE',
  'DEPLETED',
  'EXPIRED',
  'VOID',
] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

export type GiftCardView = {
  id: string;
  code: string;
  branchId: string;
  branchName: string;
  initialBalance: number;
  currentBalance: number;
  currency: string;
  buyerId: string | null;
  buyerName: string | null;
  recipientEmail: string;
  expireDate: string;
  isRedeemed: boolean;
  isExpired: boolean;
  status: GiftCardStatus;
  /** ບິນທີ່ຕ້ອງຈ່າຍໃຫ້ຄົບເພື່ອ activate (ສະເພາະ self-purchase, PENDING_PAYMENT). */
  purchasePaymentId: string | null;
  issuedByUserId: string | null;
  issueReason: string | null;
  createdAt: string;
  transactions?: GiftCardTransactionView[];
};
