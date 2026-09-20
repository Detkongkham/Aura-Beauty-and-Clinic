import { z } from 'zod';
import { CampaignType } from './enums.js';
import { paginationQuerySchema } from './common.schema.js';

/**
 * Automated CRM Marketing & Campaigns — ໂມດູນ 24 (Phase 5).
 * ແຄມເປນວັນເກີດ (Birthday) ແລະ ດຶງລູກຄ້າເກົ່າ (Win-back) ພ້ອມ `NotificationLog` ກັນສົ່ງຊ້ຳ.
 */

/** triggerRule (Json) — ຄ່າຄວບຄຸມ auto-sweep ຕໍ່ປະເພດແຄມເປນ. */
export const campaignTriggerRuleSchema = z.object({
  /** WIN_BACK: ລູກຄ້າທີ່ບໍ່ມາເກີນ N ມື້. */
  inactiveDays: z.number().int().positive().max(3650).optional(),
  /** BIRTHDAY: ສົ່ງກ່ອນວັນເກີດ N ມື້ (0 = ມື້ດຽວກັນ). */
  daysBefore: z.number().int().min(0).max(30).optional(),
});
export type CampaignTriggerRule = z.infer<typeof campaignTriggerRuleSchema>;

export const campaignMessageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
});

export const createCampaignSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  type: CampaignType,
  discountCode: z.string().trim().max(32).optional(),
  message: campaignMessageSchema,
  triggerRule: campaignTriggerRuleSchema.optional(),
  isActive: z.boolean().default(true),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial().omit({ branchId: true });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignListQuerySchema = paginationQuerySchema.extend({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  type: CampaignType.optional(),
});
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;

export type CampaignRecipientView = {
  id: string;
  userId: string;
  userName: string;
  status: string;
  sentAt: string;
  convertedAt: string | null;
};

export type CampaignView = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  type: z.infer<typeof CampaignType>;
  discountCode: string | null;
  message: { title: string; body: string } | null;
  triggerRule: CampaignTriggerRule | null;
  isActive: boolean;
  recipientCount: number;
  convertedCount: number;
  createdAt: string;
  updatedAt: string;
};

/** ຜົນ POST /marketing/campaigns/:id/run — manual sweep. */
export type CampaignRunView = {
  campaignId: string;
  matched: number;
  sent: number;
  skippedAlreadySent: number;
};
