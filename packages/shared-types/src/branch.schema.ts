import { z } from 'zod';
import { timeStringSchema } from './common.schema.js';

/**
 * The 18 Lao first-level administrative areas (17 provinces + Vientiane Capital).
 * Kept in sync with web-admin `LaoProvinceId` / `src/features/branches/lao-provinces.ts`.
 */
export const laoProvinceSchema = z.enum([
  'vientiane-capital',
  'vientiane',
  'phongsaly',
  'louangnamtha',
  'oudomxay',
  'bokeo',
  'louangprabang',
  'houaphanh',
  'xayaboury',
  'xiangkhouang',
  'xaisomboun',
  'bolikhamxai',
  'khammouane',
  'savannakhet',
  'salavan',
  'sekong',
  'champasak',
  'attapeu',
]);
export type LaoProvinceId = z.infer<typeof laoProvinceSchema>;

const latitudeSchema = z.coerce.number().min(-90).max(90);
const longitudeSchema = z.coerce.number().min(-180).max(180);

/** POST /branches — ສ້າງສາຂາໃໝ່ (SUPER_ADMIN). */
export const branchCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(24),
  address: z.string().trim().max(240).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  province: laoProvinceSchema.optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  openTime: timeStringSchema.default('09:00'),
  closeTime: timeStringSchema.default('20:00'),
  isActive: z.boolean().default(true),
  /** Inventory audit C2 — ອະນຸຍາດໃຫ້ BOM ຕັດສະຕັອກຕິດລົບໄດ້ (backflush exception) ແທນທີ່ຈະ block ນັດໝາຍ. */
  allowNegativeStock: z.boolean().default(false),
});
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

/** PATCH /branches/:id — ແກ້ໄຂ (ທຸກ field ເປັນ optional). */
export const branchUpdateSchema = branchCreateSchema.partial();
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/** POST /branch-closures — ເພີ່ມວັນປິດຮ້ານ ('all' = ທົ່ວບໍລິສັດ). */
export const branchClosureCreateSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນ YYYY-MM-DD'),
  reason: z.string().trim().min(1).max(200),
});
export type BranchClosureCreateInput = z.infer<typeof branchClosureCreateSchema>;

// ---- response view-models ------------------------------------------------

export type BranchView = {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string | null;
  province: LaoProvinceId;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  openTime: string;
  closeTime: string;
  allowNegativeStock: boolean;
};

export type BranchClosureView = {
  id: string;
  branchId: string;
  branchName: string;
  date: string;
  reason: string;
  createdAt: string;
};
