import { z } from 'zod';

/** GET /queue — ຂອບເຂດຕາມສາຂາ. */
export const queueListQuerySchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
});
export type QueueListQuery = z.infer<typeof queueListQuerySchema>;

export const queueStatusSchema = z.enum([
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
]);
export type QueueStatus = z.infer<typeof queueStatusSchema>;

/** ເຫດຜົນຍົກເລີກບັດຄິວ — NO_SHOW mirror ໄປ Appointment.NO_SHOW. */
export const queueCancelReasonSchema = z.enum([
  'NO_SHOW',
  'CUSTOMER_LEFT',
  'DUPLICATE',
  'EXPIRED',
  'OTHER',
]);
export type QueueCancelReason = z.infer<typeof queueCancelReasonSchema>;

/** PATCH /queue/:id — ຍ້າຍສະຖານະບັດຄິວ (ກວດ transition ຢູ່ service). */
export const queueSetStatusSchema = z.object({
  status: queueStatusSchema,
  reason: queueCancelReasonSchema.optional(),
});
export type QueueSetStatusInput = z.infer<typeof queueSetStatusSchema>;

/** PATCH /queue/:id/details — priority / ໝາຍເຫດ / ປ່ຽນຊ່າງ. */
export const queueUpdateDetailsSchema = z
  .object({
    priority: z.enum(['NORMAL', 'VIP']).optional(),
    note: z.string().trim().max(500).nullable().optional(),
    staffProfileId: z.string().uuid().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'ບໍ່ມີຂໍ້ມູນໃຫ້ແກ້ໄຂ' });
export type QueueUpdateDetailsInput = z.infer<typeof queueUpdateDetailsSchema>;

/** POST /queue/clear-stale — ປິດບັດຄິວ active ທີ່ຄ້າງມາຈາກມື້ກ່ອນ. */
export const queueClearStaleSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
});
export type QueueClearStaleInput = z.infer<typeof queueClearStaleSchema>;

/**
 * POST /queue/check-in — QR Check-in ໜ້າຮ້ານ (Module 10).
 * ລູກຄ້າສະແກນ QR ຂອງສາຂາ (ບັນຈຸ branchId) ແລ້ວ check-in ນັດຂອງຕົນ.
 */
export const queueCheckInSchema = z.object({
  appointmentId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
});
export type QueueCheckInInput = z.infer<typeof queueCheckInSchema>;

export type QueueCheckInResult = {
  appointmentId: string;
  status: QueueStatus;
  ticket: QueueTicketView;
};

/** POST /appointments/walk-in — ອອກບັດຄິວ walk-in ໜ້າຮ້ານ. */
export const walkInSchema = z.object({
  branchId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().max(40).optional(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  priority: z.enum(['NORMAL', 'VIP']).optional(),
  note: z.string().trim().max(500).optional(),
});
export type WalkInInput = z.infer<typeof walkInSchema>;

export type QueueTicketPriority = 'NORMAL' | 'APPOINTMENT' | 'VIP';

/** ຜົນຂອງ POST /appointments/walk-in — walk-in ສ້າງທັງ Appointment + ບັດຄິວ. */
export type WalkInResult = {
  ticket: QueueTicketView;
  appointmentId: string;
};

/** ຮູບຮ່າງກົງກັບ web-admin `QueueTicket` (types/models.ts). */
export type QueueTicketView = {
  id: string;
  number: string;
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  serviceDurationMin: number | null;
  servicePrice: number | null;
  staffName: string | null;
  staffProfileId: string | null;
  appointmentId: string | null;
  customerId: string | null;
  /** ຈຳນວນຄັ້ງທີ່ລູກຄ້າໃຊ້ບໍລິການສຳເລັດມາກ່ອນ (0 = ລູກຄ້າໃໝ່). */
  visitCount: number;
  priority: QueueTicketPriority;
  status: QueueStatus;
  note: string | null;
  issuedAt: string;
  calledAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: QueueCancelReason | null;
  /** ອອກບັດກ່ອນມື້ນີ້ (ເວລາວຽງຈັນ) ແຕ່ຍັງ active. */
  carriedOver: boolean;
};

/** ສະຫຼຸບຄິວມື້ນີ້ (ເວລາວຽງຈັນ) — ຄຳນວນຢູ່ server. */
export type QueueSummary = {
  dayStart: string;
  issuedToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowToday: number;
  carriedOver: number;
  /** ນາທີ ອອກບັດ → ເອີ້ນ (ບັດມື້ນີ້ທີ່ຖືກເອີ້ນແລ້ວ). */
  avgWaitMin: number | null;
  p90WaitMin: number | null;
  /** ນາທີ ເລີ່ມ → ສຳເລັດ. */
  avgServiceMin: number | null;
  /** ມື້ວານ ຮອດເວລາດຽວກັນນີ້ — ໃຊ້ສະແດງ delta. */
  yesterday: { issued: number; completed: number; avgWaitMin: number | null };
  /** 24 ຊົ່ວໂມງ (ເວລາວຽງຈັນ). */
  hourly: Array<{ hour: number; arrivals: number; completions: number }>;
};

export type QueueListResult = { items: QueueTicketView[]; summary: QueueSummary };
