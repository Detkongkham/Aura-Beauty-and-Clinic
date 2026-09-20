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
  qtyPerUse: z.coerce.number().positive(),
  unit: z.string().trim().max(24).optional(),
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
  requireDeposit: z.boolean().default(false),
  depositAmount: z.coerce.number().nonnegative().nullable().optional(),
  isActive: z.boolean().default(true),
  consumables: z.array(adminServiceConsumableInputSchema).max(50).optional(),
});
export type AdminServiceCreateInput = z.infer<typeof adminServiceCreateSchema>;

export const adminServiceUpdateSchema = adminServiceCreateSchema.partial();
export type AdminServiceUpdateInput = z.infer<typeof adminServiceUpdateSchema>;

export const serviceCategoryWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().url().nullable().optional(),
});
export type ServiceCategoryWriteInput = z.infer<typeof serviceCategoryWriteSchema>;

// ---- response view-models ---------------------------------------------

export type AdminServiceConsumable = {
  productId: string;
  productName: string;
  qtyPerUse: number;
  unit: string;
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
