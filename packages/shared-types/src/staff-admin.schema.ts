import { z } from 'zod';
import { paginationQuerySchema, timeStringSchema } from './common.schema.js';

/** GET /staff?page=… — ໜ້າ Staff directory ຂອງ Web Admin (page param = admin shape). */
export const adminStaffListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  branchId: z.string().uuid().optional(),
});
export type AdminStaffListQuery = z.infer<typeof adminStaffListQuerySchema>;

export const workingHourInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  isDayOff: z.boolean().default(false),
});
export type WorkingHourInput = z.infer<typeof workingHourInputSchema>;

/** PATCH /staff/:id — ແກ້ໂປຣຟາຍ / ຊົ່ວໂມງ / ຄ່ານາຍໜ້າ / ບໍລິການທີ່ຮັບຜິດຊອບ. */
export const adminStaffUpdateSchema = z.object({
  jobTitle: z.string().trim().min(1).max(120).optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
  workingHours: z.array(workingHourInputSchema).max(7).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
});
export type AdminStaffUpdateInput = z.infer<typeof adminStaffUpdateSchema>;

export const timeOffDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});
export type TimeOffDecisionInput = z.infer<typeof timeOffDecisionSchema>;

// ---- response view-models ------------------------------------------------

export type AdminWorkingHour = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isDayOff: boolean;
};

export type AdminStaffView = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  jobTitle: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  serviceIds: string[];
  workingHours: AdminWorkingHour[];
  commissionRate: number;
  hiredAt: string;
};

export type TimeOffRequestView = {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
};
