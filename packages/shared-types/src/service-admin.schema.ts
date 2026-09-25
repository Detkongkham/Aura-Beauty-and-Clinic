import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

/** GET /services — ໜ້າ Services ຂອງ Web Admin (admin shape, ບໍ່ຄືກັບ /catalog/services). */
export const adminServiceListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
export type AdminServiceListQuery = z.infer<typeof adminServiceListQuerySchema>;

export const adminServiceConsumableInputSchema = z.object({
  productId: z.string().uuid('BOM ຕ້ອງອ້າງອີງສິນຄ້າຈິງ (Product uuid)'),
  productName: z.string().trim().max(160).optional(),
  /** ຕໍ່ຄັ້ງ ເປັນໜ່ວຍ `uomId` (ບໍ່ໃສ່/null = ໜ່ວຍພື້ນຖານຂອງສິນຄ້າ). */
  qtyPerUse: z.coerce.number().positive(),
  unit: z.string().trim().max(24).optional(),
  /** M1 (inventory 9C) — ໜ່ວຍຂອງ BOM (ເຊັ່ນ ml ໃນຂະນະທີ່ສະຕັອກເປັນຕຸກ) — ຕ້ອງມີອັດຕາແປງຂອງສິນຄ້າ. */
  uomId: z.string().uuid().nullable().optional(),
});

export const adminServiceCreateSchema = z.object({
  categoryId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.coerce.number().nonnegative(),
  compareAtPrice: z.coerce.number().nonnegative().nullable().optional(),
  durationMinutes: z.coerce.number().int().positive().max(1440),
  imageUrl: z.string().trim().url().nullable().optional(),
  highlights: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  /** ຂັ້ນຕອນການບໍລິການ (ສະແດງໃນໜ້າລາຍລະອຽດບໍລິການຂອງແອັບ). [] = ລຶບ. */
  steps: z
    .array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().max(400).default('') }))
    .max(12)
    .optional(),
  requireDeposit: z.boolean().default(false),
  depositAmount: z.coerce.number().nonnegative().nullable().optional(),
  isActive: z.boolean().default(true),
  consumables: z.array(adminServiceConsumableInputSchema).max(50).optional(),
});
export type AdminServiceCreateInput = z.infer<typeof adminServiceCreateSchema>;

export const adminServiceUpdateSchema = adminServiceCreateSchema.partial();
export type AdminServiceUpdateInput = z.infer<typeof adminServiceUpdateSchema>;

/** POST /services/images — ອັບໂຫລດຮູບບໍລິການ (web-admin ຫຍໍ້ຮູບກ່ອນສົ່ງ). ຄືນ `{ url }` ໄປໃສ່ `imageUrl`. */
export const SERVICE_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const serviceImageUploadSchema = z.object({
  contentType: z.enum(SERVICE_IMAGE_CONTENT_TYPES),
  /** base64 (ບໍ່ຕ້ອງມີ data: prefix). ຈຳກັດ 5MB ຫຼັງ decode. */
  dataBase64: z.string().min(1),
});
export type ServiceImageUploadInput = z.infer<typeof serviceImageUploadSchema>;

/** POST /services/images/discard — ຟອມຖືກຍົກເລີກ/ປ່ຽນຮູບ: ລຶບຮູບທີ່ອັບໂຫລດໄວ້ (ຖ້າບໍ່ມີແຖວໃດໃຊ້). */
export const serviceImageDiscardSchema = z.object({ url: z.string().trim().min(1).max(2048) });

export const serviceCategoryWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().url().nullable().optional(),
});
export type ServiceCategoryWriteInput = z.infer<typeof serviceCategoryWriteSchema>;

// ---- response view-models ---------------------------------------------

export type AdminServiceConsumable = {
  productId: string;
  productName: string;
  /** ຕໍ່ຄັ້ງ ເປັນໜ່ວຍ uomId (null = ໜ່ວຍພື້ນຖານ). */
  qtyPerUse: number;
  /** ໜ່ວຍພື້ນຖານ (ຂໍ້ຄວາມ) ຂອງສິນຄ້າ. */
  unit: string;
  /** M1 — ໜ່ວຍຂອງ BOM + ອັດຕາ; baseQtyPerUse = qtyPerUse × factorToBase (ຈຳນວນທີ່ຕັດ/ຈອງຈິງ). */
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  baseQtyPerUse: number;
  stockQty: number;
  lowStock: boolean;
};

export type AdminServiceView = {
  id: string;
  categoryId: string;
  categoryName: string;
  branchId: string | null;
  branchName: string | null;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: 'LAK';
  durationMinutes: number;
  imageUrl: string | null;
  highlights: string[];
  steps: { title: string; body: string }[];
  requireDeposit: boolean;
  depositAmount: number | null;
  isActive: boolean;
  consumables: AdminServiceConsumable[];
  createdAt: string;
  updatedAt: string;
};

export type AdminServiceCategoryView = {
  id: string;
  name: string;
  imageUrl: string | null;
  serviceCount: number;
  sortOrder: number;
};

export type ServiceStatsView = {
  total: number;
  active: number;
  inactive: number;
  withDeposit: number;
  avgPrice: number;
  avgDuration: number;
  byCategory: Array<{ id: string; name: string; count: number }>;
};
