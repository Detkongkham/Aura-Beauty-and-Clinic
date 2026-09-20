import { z } from 'zod';
import { LoyaltyTier, LoyaltyTxType } from './enums.js';
import { paginationQuerySchema } from './common.schema.js';

/**
 * Loyalty Points Ledger & VIP Tiers — ໂມດູນ 19 (Phase 5).
 * ຄະແນນສະສົມພ້ອມ Ledger (`LoyaltyTransaction`) — ຢ່າອັບເດດ balance ຊື່ໆ.
 */

/** ໄດ້ 1 ຄະແນນ ຕໍ່ການໃຊ້ຈ່າຍ 10,000 LAK (Payment.totalAmount ຕອນ COMPLETED). */
export const LOYALTY_EARN_DIVISOR_LAK = 10_000;

/** 1 ຄະແນນ = 1,000 LAK ຕອນນຳໄປແລກເປັນສ່ວນຫຼຸດ (redeem). */
export const LOYALTY_POINT_VALUE_LAK = 1_000;

/** ຂອບເຂດ tier ອີງ "ຄະແນນສະສົມທັງໝົດ" (lifetime earned). */
export const LOYALTY_TIER_THRESHOLDS: Record<z.infer<typeof LoyaltyTier>, number> = {
  SILVER: 0,
  GOLD: 500,
  PLATINUM: 2_000,
};

export function tierForLifetimePoints(lifetime: number): z.infer<typeof LoyaltyTier> {
  if (lifetime >= LOYALTY_TIER_THRESHOLDS.PLATINUM) return 'PLATINUM';
  if (lifetime >= LOYALTY_TIER_THRESHOLDS.GOLD) return 'GOLD';
  return 'SILVER';
}

/** GET /loyalty/me/ledger · GET /loyalty/accounts/:userId/ledger */
export const loyaltyLedgerQuerySchema = paginationQuerySchema.extend({
  type: LoyaltyTxType.optional(),
});
export type LoyaltyLedgerQuery = z.infer<typeof loyaltyLedgerQuerySchema>;

/** POST /loyalty/redeem — ລູກຄ້າແລກຄະແນນເປັນສ່ວນຫຼຸດ (ອອກ coupon-like credit). */
export const loyaltyRedeemSchema = z.object({
  points: z.number().int().positive(),
  appointmentId: z.string().uuid().optional(),
});
export type LoyaltyRedeemInput = z.infer<typeof loyaltyRedeemSchema>;

/** POST /loyalty/:userId/adjust — ຜູ້ຈັດການປັບຄະແນນ (ບວກ/ລົບ) ພ້ອມເຫດຜົນ. */
export const loyaltyAdjustSchema = z.object({
  points: z.number().int().refine((n) => n !== 0, 'ຕ້ອງບໍ່ແມ່ນ 0'),
  notes: z.string().trim().min(1).max(500),
});
export type LoyaltyAdjustInput = z.infer<typeof loyaltyAdjustSchema>;

export const loyaltyAccountListQuerySchema = paginationQuerySchema.extend({
  tier: LoyaltyTier.optional(),
  q: z.string().trim().min(1).optional(),
});
export type LoyaltyAccountListQuery = z.infer<typeof loyaltyAccountListQuerySchema>;

export type LoyaltyTransactionView = {
  id: string;
  points: number;
  type: z.infer<typeof LoyaltyTxType>;
  notes: string | null;
  refId: string | null;
  createdAt: string;
};

export type LoyaltyAccountView = {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  points: number;
  lifetimePoints: number;
  /** ຄະແນນທີ່ແລກເປັນສ່ວນຫຼຸດແລ້ວທັງໝົດ (ຄ່າບວກ). */
  redeemedPoints: number;
  /** ເວລາຂອງ transaction ລ່າສຸດ — null ຖ້າຍັງບໍ່ເຄີຍມີການເໜັງຕີງ. */
  lastActivityAt: string | null;
  memberSince: string;
  tierLevel: z.infer<typeof LoyaltyTier>;
  nextTier: z.infer<typeof LoyaltyTier> | null;
  pointsToNextTier: number | null;
  pointValueLak: number;
  updatedAt: string;
};

export type LoyaltyRedeemView = {
  pointsRedeemed: number;
  discountAmount: number;
  currency: string;
  balancePoints: number;
};
