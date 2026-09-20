import { z } from 'zod';
import { PayoutStatus } from './enums.js';
import { moneySchema, paginationQuerySchema, uuidSchema } from './common.schema.js';

/**
 * Customer Referral & Affiliate Partner Program — ໂມດູນ 33 (Phase 7A).
 * Referral: ລູກຄ້າແນະນຳໝູ່ → ຜູ້ຖືກແນະນຳໄດ້ສ່ວນຫຼຸດຄິວທຳອິດ, ຜູ້ແນະນຳໄດ້ຄະແນນ loyalty ຕອນຄິວນັ້ນ COMPLETED.
 * Affiliate: KOL/influencer ທີ່ admin ຮັບເຂົ້າ — ໄດ້ຄ່ານາຍໜ້າ % ຂອງບິນທີ່ມາຈາກ referral ຂອງຕົນ + payout.
 */

// ---- Referral (customer-facing) ------------------------------------

export type MyReferralView = {
  code: string;
  /** ສ່ວນຫຼຸດ (LAK) ທີ່ຜູ້ຖືກແນະນຳໄດ້ຕອນຈອງຄິວທຳອິດ. */
  discountAmount: number;
  currency: string;
  /** ຈຳນວນຄົນທີ່ໃຊ້ລະຫັດນີ້ແລ້ວ. */
  totalReferred: number;
  /** ຈຳນວນທີ່ຄິວ COMPLETED ແລ້ວ (ຜູ້ແນະນຳໄດ້ລາງວັນ). */
  totalRewarded: number;
  isAffiliate: boolean;
};

export type ReferralUsageView = {
  id: string;
  referredUserName: string;
  appointmentId: string | null;
  rewardClaimed: boolean;
  createdAt: string;
};

// ---- Affiliate (admin) -------------------------------------------

export const affiliateListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type AffiliateListQuery = z.infer<typeof affiliateListQuerySchema>;

export const enrollAffiliateSchema = z.object({
  userId: uuidSchema,
  /** ຄ່ານາຍໜ້າ 0–0.5 (0.10 = 10%). */
  commissionRate: z.number().min(0).max(0.5).default(0.1),
});
export type EnrollAffiliateInput = z.infer<typeof enrollAffiliateSchema>;

export const updateAffiliateSchema = z.object({
  commissionRate: z.number().min(0).max(0.5),
});
export type UpdateAffiliateInput = z.infer<typeof updateAffiliateSchema>;

export const createAffiliatePayoutSchema = z.object({
  amount: moneySchema.refine((n) => n > 0, 'amount ຕ້ອງ > 0'),
  payoutMethod: z.string().trim().min(1).max(60),
  accountDetails: z.string().trim().min(1).max(200),
});
export type CreateAffiliatePayoutInput = z.infer<typeof createAffiliatePayoutSchema>;

export const updateAffiliatePayoutStatusSchema = z.object({
  status: PayoutStatus,
});
export type UpdateAffiliatePayoutStatusInput = z.infer<typeof updateAffiliatePayoutStatusSchema>;

export type AffiliateView = {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  commissionRate: number;
  totalEarnings: number;
  unpaidBalance: number;
  /** ຈຳນວນ referral usage ທີ່ຜູກກັບ affiliate ນີ້. */
  referredCount: number;
  currency: string;
  createdAt: string;
};

export type AffiliatePayoutView = {
  id: string;
  affiliateProfileId: string;
  amount: number;
  status: z.infer<typeof PayoutStatus>;
  payoutMethod: string;
  accountDetails: string;
  paidAt: string | null;
  createdAt: string;
};

export type MyAffiliateView = {
  commissionRate: number;
  totalEarnings: number;
  unpaidBalance: number;
  currency: string;
  payouts: AffiliatePayoutView[];
};
