import { z } from 'zod';
import { moneySchema } from './common.schema.js';

export const serviceConsumableInputSchema = z.object({
  productId: z.string().uuid(),
  qtyPerUse: z.number().positive(),
});

export const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(),
  price: moneySchema,
  durationMinutes: z
    .number()
    .int()
    .positive()
    .refine((n) => n % 5 === 0, 'ໄລຍະເວລາຕ້ອງເປັນຕົວຄູນຂອງ 5 ນາທີ'),
  imageUrl: z.string().url().optional(),
  requireDeposit: z.boolean().default(false),
  depositAmount: moneySchema.optional(),
  consumables: z.array(serviceConsumableInputSchema).default([]),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial();
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createServiceCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().url().optional(),
});
export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;
