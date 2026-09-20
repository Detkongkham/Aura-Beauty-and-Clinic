import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';
import type { AdminAppointmentListItem } from './appointment.schema.js';

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export type Gender = z.infer<typeof genderSchema>;

export const loyaltyTierSchema = z.enum(['SILVER', 'GOLD', 'PLATINUM']);

/** GET /customers — ຄົ້ນຫາ + filter tier + ແບ່ງໜ້າ. */
export const customerListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  tier: loyaltyTierSchema.optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນ YYYY-MM-DD')
  .optional()
  .or(z.literal('').transform(() => undefined))
  .or(z.null().transform(() => undefined));

/** POST /customers — ເພີ່ມລູກຄ້າ (ໜ້າ CRM / import). */
export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  gender: genderSchema.optional().or(z.null()),
  birthDate,
  notes: z.string().trim().max(2000).optional().or(z.literal('')).or(z.null()),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

/** PATCH /customers/:id — ແກ້ໄຂ (ລວມ notes ຈາກໜ້າ detail). */
export const customerUpdateSchema = customerCreateSchema.partial();
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

// ---- response view-models ------------------------------------------------

export type CustomerView = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  birthDate: string | null;
  loyaltyPoints: number;
  loyaltyTier: z.infer<typeof loyaltyTierSchema> | null;
  totalVisits: number;
  totalSpent: number;
  lastVisitAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type CustomerDetailView = CustomerView & {
  history: AdminAppointmentListItem[];
};
