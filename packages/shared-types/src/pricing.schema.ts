import { z } from 'zod';
import { dayOfWeekSchema, timeStringSchema, uuidSchema } from './common.schema.js';

/**
 * AI Dynamic Pricing & Happy Hours — ໂມດູນ 28 (Phase 7A).
 * ຮຸ່ນທຳອິດ = rules engine ລ້ວນໆ: ຊ່ວງເວລາ (dayOfWeek × HH:MM–HH:MM) × ສ່ວນຫຼຸດ %.
 * ML / demand-based ຄ່ອຍຕໍ່ພາຍຫຼັງເທິງໂຄງຮ່າງດຽວກັນ.
 */

/** ຮ່ວມກັນລະຫວ່າງ create/update — ຄ່າໜຶ່ງໃນ discountPercent / priceMultiplier ຕ້ອງມີຜົນ. */
const pricingRuleBase = z.object({
  branchId: uuidSchema,
  /** null = ທຸກບໍລິການຂອງສາຂາ. */
  serviceId: uuidSchema.nullable().default(null),
  ruleName: z.string().trim().min(1).max(120),
  dayOfWeek: dayOfWeekSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  /** ສ່ວນຫຼຸດເປັນເປີເຊັນ 0–90. 0 = ບໍ່ຫຼຸດ (ໃຊ້ priceMultiplier ແທນ). */
  discountPercent: z.number().min(0).max(90).default(0),
  /** ຄູນລາຄາຫຼັງຫຼຸດ — > 1 = surge (peak), < 1 = ຫຼຸດເພີ່ມ. 0.1–3. */
  priceMultiplier: z.number().min(0.1).max(3).default(1),
  isActive: z.boolean().default(true),
});

const timeOrder = (
  val: { startTime?: string; endTime?: string },
  ctx: z.RefinementCtx,
): void => {
  if (val.startTime && val.endTime && val.startTime >= val.endTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'endTime ຕ້ອງຫຼັງ startTime',
    });
  }
};

export const createPricingRuleSchema = pricingRuleBase.superRefine(timeOrder);
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = pricingRuleBase
  .partial()
  .omit({ branchId: true })
  .superRefine(timeOrder);
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

export const pricingRuleListQuerySchema = z.object({
  branchId: z.union([uuidSchema, z.literal('all')]).default('all'),
  serviceId: uuidSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type PricingRuleListQuery = z.infer<typeof pricingRuleListQuerySchema>;

/** GET /pricing/quote?branchId=&serviceId=&at=ISO — ລາຄາຈິງຫຼັງ dynamic-pricing. */
export const priceQuoteQuerySchema = z.object({
  branchId: uuidSchema,
  serviceId: uuidSchema,
  /** ISO datetime; default = ດຽວນີ້. */
  at: z.coerce.date().optional(),
});
export type PriceQuoteQuery = z.infer<typeof priceQuoteQuerySchema>;

export type PricingRuleView = {
  id: string;
  branchId: string;
  branchName: string;
  serviceId: string | null;
  serviceName: string | null;
  ruleName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  discountPercent: number;
  priceMultiplier: number;
  isActive: boolean;
};

export type PriceQuoteView = {
  serviceId: string;
  branchId: string;
  /** ລາຄາໃນ Service.price. */
  basePrice: number;
  /** ລາຄາຈິງທີ່ຕ້ອງຈ່າຍຕອນນັ້ນ (ຫຼັງປັດເສດໂຕເຕັມ 100 ກີບ). */
  finalPrice: number;
  /** basePrice − finalPrice. */
  savings: number;
  discountPercent: number;
  currency: string;
  /** rule ທີ່ຖືກນຳໃຊ້ (null = ບໍ່ມີຊ່ວງໃດກົງ, finalPrice = basePrice). */
  appliedRule: { id: string; ruleName: string } | null;
};

/** GET /pricing/promotions?branchId= — ໂປຣໂມຊັນທີ່ລູກຄ້າເຫັນ (Home). ສ້າງຈາກຂໍ້ມູນຈິງທີ່ມີຜົນຕອນຈ່າຍ:
 * rule ທີ່ຫຼຸດລາຄາແທ້ (net < 100%) + ບໍລິການທີ່ມີ compareAtPrice > price. ບໍ່ລວມ surge. */
export const promotionListQuerySchema = z.object({
  branchId: uuidSchema,
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>;

export type PromotionView = {
  /** `rule:<ids>` ຫຼື `sale:<serviceId>` — stable key. */
  id: string;
  kind: 'HAPPY_HOUR' | 'SALE';
  /** ruleName (HAPPY_HOUR) ຫຼື ຊື່ບໍລິການ (SALE). */
  title: string;
  /** ສ່ວນຫຼຸດສຸດທິ (ລວມ priceMultiplier) ປັດເປັນ %. */
  discountPercent: number;
  /** null = ທຸກບໍລິການຂອງສາຂາ. */
  serviceId: string | null;
  serviceName: string | null;
  serviceImageUrl: string | null;
  /** SALE: ລາຄາປັດຈຸບັນ / ລາຄາເຕັມ. HAPPY_HOUR ຜູກບໍລິການ: ລາຄາຫຼັງຫຼຸດ / ລາຄາເຕັມ. ທຸກບໍລິການ = null. */
  price: number | null;
  compareAtPrice: number | null;
  /** HAPPY_HOUR: ວັນ (0=ອາທິດ) ທີ່ rule ໃຊ້ໄດ້ ລຽງ 0–6; SALE = []. */
  daysOfWeek: number[];
  /** 'HH:MM' ເວລາວຽງຈັນ. SALE = null. */
  startTime: string | null;
  endTime: string | null;
  /** ກຳລັງມີຜົນຢູ່ຕອນນີ້ (SALE = true ສະເໝີ). */
  liveNow: boolean;
  /** ISO — ເວລາເລີ່ມຮອບຖັດໄປ (null ຖ້າ liveNow ຫຼື SALE). */
  nextStartAt: string | null;
  /** ISO — ເວລາສິ້ນສຸດຮອບປັດຈຸບັນ (liveNow HAPPY_HOUR ເທົ່ານັ້ນ). */
  endsAt: string | null;
};
