import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema } from './common.schema.js';
import { AppointmentSource, AppointmentStatus, ServiceDeliveryType } from './enums.js';
import type { PaymentMethod, PaymentStatus } from './enums.js';

/** ຄິວຮ້ອງຂໍ slot ວ່າງຂອງມື້ໃດໜຶ່ງ (Booking Slot Engine — Module 04). */
export const availabilityQuerySchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.coerce.date(),
  staffProfileId: z.string().uuid().optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const slotSchema = z.object({
  staffProfileId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
});
export type Slot = z.infer<typeof slotSchema>;

export const availabilityResponseSchema = z.object({
  date: z.string(),
  durationMinutes: z.number().int().positive(),
  slots: z.array(slotSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/** field ຮ່ວມຂອງ create appointment (ບໍ່ມີ .refine ເພື່ອໃຫ້ .omit() ໄດ້). */
export const createAppointmentBaseSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  /** IN_STORE ຕ້ອງລະບຸ; HOME_SERVICE ຫ້າມລະບຸ — ຈັດຊ່າງໃຫ້ອັດຕະໂນມັດ (ໂມດູນ 29). */
  staffProfileId: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  bookingGroupId: z.string().uuid().optional(),
  userPackageItemId: z.string().uuid().optional(),
  startAt: isoDateTimeSchema,
  deliveryType: ServiceDeliveryType.default('IN_STORE'),
  homeAddress: z.string().max(500).optional(),
  destLatitude: z.number().optional(),
  destLongitude: z.number().optional(),
  customerNotes: z.string().max(1000).optional(),
  /** ໂມດູນ 33 — ລະຫັດແນະນຳໝູ່ (ໃຊ້ໄດ້ຄັ້ງດຽວ, ຄິວທຳອິດຂອງຜູ້ຖືກແນະນຳ). */
  referralCode: z.string().trim().min(4).max(32).optional(),
});

/**
 * IN_STORE ຕ້ອງລະບຸຊ່າງເອງ; HOME_SERVICE ຕ້ອງມີທີ່ຢູ່ + ພິກັດປາຍທາງ ແລະ ຫ້າມລະບຸຊ່າງ
 * (ໂມດູນ 29 ຈັດຊ່າງທີ່ໃກ້ທີ່ສຸດໃຫ້ອັດຕະໂນມັດຕອນຈອງ).
 */
const homeServiceRefine = (v: {
  deliveryType: string;
  staffProfileId?: string;
  homeAddress?: string;
  destLatitude?: number;
  destLongitude?: number;
}): boolean =>
  v.deliveryType === 'IN_STORE'
    ? v.staffProfileId != null
    : v.staffProfileId == null &&
      !!v.homeAddress &&
      v.destLatitude != null &&
      v.destLongitude != null;
const homeServiceRefineOpts = {
  message:
    'IN_STORE ຕ້ອງລະບຸຊ່າງ; HOME_SERVICE ຕ້ອງມີທີ່ຢູ່+ພິກັດ ແລະ ຫ້າມລະບຸຊ່າງ (ຈັດອັດຕະໂນມັດ)',
  path: ['staffProfileId'],
};

export const createAppointmentSchema = createAppointmentBaseSchema.refine(
  homeServiceRefine,
  homeServiceRefineOpts,
);
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/** POST /booking/appointments/me — customerId ມາຈາກ JWT, ບໍ່ຮັບຈາກ body. */
export const customerCreateAppointmentSchema = createAppointmentBaseSchema
  .omit({ customerId: true, bookingGroupId: true })
  .refine(homeServiceRefine, homeServiceRefineOpts);
export type CustomerCreateAppointmentInput = z.infer<typeof customerCreateAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: AppointmentStatus,
  staffNotes: z.string().max(1000).optional(),
  /** Wave 11 — true = ບໍ່ຢຶດມັດຈຳເປັນຄ່າປັບ no-show / ຍົກເລີກຊ້າ (ເຊັ່ນ ເຫດສຸດວິໄສ). */
  waiveFee: z.boolean().optional(),
});
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;

/** ສະຖານະການຈ່າຍທີ່ຄິດຈາກ depositPaid ທຽບກັບ price (ໃຊ້ຮ່ວມກັນ BE/FE). */
export const AppointmentPaymentState = z.enum(['unpaid', 'partial', 'paid']);
export type AppointmentPaymentState = z.infer<typeof AppointmentPaymentState>;

/**
 * ທຸງ "ຕ້ອງຈັດການ" ໜຶ່ງອັນ (ໜ້າ /appointments ໃຊ້ເປັນຕົວກອງດ່ວນ):
 * - `overdue`      — ເວລານັດຜ່ານໄປແລ້ວ ແຕ່ຍັງ PENDING/CONFIRMED
 * - `unconfirmed`  — ຍັງ PENDING ແລະ ນັດພາຍໃນ 24 ຊົ່ວໂມງຂ້າງໜ້າ
 * - `needsDeposit` — ບໍລິການບັງຄັບມັດຈຳ ແຕ່ຍັງບໍ່ມີການຈ່າຍ
 * - `unrated`      — COMPLETED ແລ້ວ ແຕ່ຍັງບໍ່ມີຣີວິວ
 * - `conflict`     — ຊ້ອນເວລາກັບນັດອື່ນຂອງຊ່າງ/ຫ້ອງ/ອຸປະກອນດຽວກັນ
 */
export const AppointmentFlag = z.enum([
  'overdue',
  'unconfirmed',
  'needsDeposit',
  'unrated',
  'conflict',
]);
export type AppointmentFlag = z.infer<typeof AppointmentFlag>;

export const AppointmentSortField = z.enum(['startAt', 'createdAt', 'price', 'customer', 'status']);
export type AppointmentSortField = z.infer<typeof AppointmentSortField>;

/** "a,b,c" → ['a','b','c'] — ຮັບທັງ repeated query param ແລະ comma list. */
const csvEnum = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(inner));

/** ຕົວກອງທີ່ໃຊ້ຮ່ວມກັນລະຫວ່າງ GET /appointments ແລະ GET /appointments/summary. */
export const adminAppointmentFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: AppointmentStatus.optional(),
  /** ຫຼາຍສະຖານະພ້ອມກັນ — ຖ້າມີ, `status` ຈະຖືກມອງຂ້າມ. */
  statuses: csvEnum(AppointmentStatus).optional(),
  branchId: z.string().uuid().optional(),
  /** = StaffProfile.id — ຊື່ນີ້ໃຫ້ກົງກັບ `AdminAppointmentListItem.staffId` + web-admin. */
  staffId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  deliveryType: ServiceDeliveryType.optional(),
  source: AppointmentSource.optional(),
  payment: AppointmentPaymentState.optional(),
  flag: AppointmentFlag.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AdminAppointmentFilters = z.infer<typeof adminAppointmentFiltersSchema>;

/** GET /appointments — admin/front-desk ລາຍການນັດໝາຍທັງໝົດ (Module 03 – Master Calendar). */
export const adminAppointmentsQuerySchema = paginationQuerySchema
  .extend({
    sort: AppointmentSortField.default('startAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .merge(adminAppointmentFiltersSchema);
export type AdminAppointmentsQuery = z.infer<typeof adminAppointmentsQuerySchema>;

/** GET /appointments/summary — ຕົວກອງຊຸດດຽວກັນ, ບໍ່ມີ pagination. */
export const adminAppointmentSummaryQuerySchema = adminAppointmentFiltersSchema;
export type AdminAppointmentSummaryQuery = z.infer<typeof adminAppointmentSummaryQuerySchema>;

/** POST /appointments/bulk-status — ປ່ຽນສະຖານະຫຼາຍນັດພ້ອມກັນຈາກໜ້າລາຍການ. */
export const bulkAppointmentStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  status: AppointmentStatus,
});
export type BulkAppointmentStatusInput = z.infer<typeof bulkAppointmentStatusSchema>;

export type BulkAppointmentStatusResult = {
  updated: string[];
  failed: { id: string; message: string }[];
};

/** GET /appointments/calendar — ຊ່ວງວັນທີ (day/week) ສຳລັບ Master Calendar. */
export const adminCalendarQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  branchId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
});
export type AdminCalendarQuery = z.infer<typeof adminCalendarQuerySchema>;

/** GET /booking/appointments/me — ຂອບເຂດ upcoming / history / all. */
export const myAppointmentsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'history', 'all']).default('upcoming'),
});
export type MyAppointmentsQuery = z.infer<typeof myAppointmentsQuerySchema>;

/** PATCH /booking/appointments/:id/reschedule */
export const rescheduleAppointmentSchema = z.object({
  startAt: isoDateTimeSchema,
  staffProfileId: z.string().uuid().optional(),
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

/** PATCH /booking/appointments/:id/cancel */
export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

/** POST /booking/appointments/:id/review */
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// ---- response view-models ------------------------------------------------

export type AppointmentReviewView = {
  rating: number;
  comment: string | null;
};

export type AppointmentListItem = {
  id: string;
  status: z.infer<typeof AppointmentStatus>;
  startAt: string;
  endAt: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  staffProfileId: string;
  staffName: string;
  /** ຕຳແໜ່ງຊ່າງ (StaffProfile.title) ເຊັ່ນ 'Senior Stylist'. */
  staffTitle: string;
  staffAvatarUrl: string | null;
  /** ຄະແນນສະເລ່ຍຂອງຊ່າງ 0–5. */
  staffRating: number;
  serviceImageUrl: string | null;
  deliveryType: z.infer<typeof ServiceDeliveryType>;
  totalAmount: number;
  currency: string;
  canCancel: boolean;
  canReschedule: boolean;
  /** ISO — ລູກຄ້າຍົກເລີກ/ເລື່ອນເອງໄດ້ກ່ອນເວລານີ້ (startAt − Settings.cancellationWindowHours). */
  cancelDeadline: string;
  canReview: boolean;
};

/** GET /booking/policy — ນະໂຍບາຍທີ່ລູກຄ້າຕ້ອງເຫັນກ່ອນຈອງ (ມາຈາກ Web Admin ▸ Settings). */
export type BookingPolicyView = {
  /** ຍົກເລີກ/ເລື່ອນນັດເອງໄດ້ກ່ອນເວລານັດ N ຊົ່ວໂມງ (0 = ໄດ້ຈົນຮອດເວລານັດ). */
  cancellationWindowHours: number;
};

export type AppointmentPaymentSummary = {
  status: 'PENDING' | 'DEPOSIT_PAID' | 'FULLY_PAID' | 'REFUNDED' | 'FAILED' | 'VOIDED';
  totalAmount: number;
  depositAmount: number;
  /** ຍອດທີ່ຊຳລະສຳເລັດແລ້ວ (ລວມ PaymentTransaction status SUCCESS). */
  paidAmount: number;
  paidAt: string | null;
};

export type AppointmentDetailView = AppointmentListItem & {
  customerNotes: string | null;
  staffNotes: string | null;
  homeAddress: string | null;
  createdAt: string;
  updatedAt: string;
  review: AppointmentReviewView | null;
  branchAddress: string;
  branchPhone: string;
  branchLatitude: number | null;
  branchLongitude: number | null;
  staffTotalReviews: number;
  roomName: string | null;
  /** ຄ່າເດີນທາງ Home Service (0 ສຳລັບ IN_STORE) — ລວມຢູ່ໃນ totalAmount ແລ້ວ. */
  travelFee: number;
  /** null = ຍັງບໍ່ມີບິນ (ຈ່າຍໜ້າຮ້ານ). */
  payment: AppointmentPaymentSummary | null;
  /** ບັດຄິວ ຫຼັງ QR check-in / ຮັບໜ້າຮ້ານ — null = ຍັງບໍ່ check-in. */
  queueTicket: AppointmentQueueTicketSummary | null;
};

export type AppointmentQueueTicketSummary = {
  number: string;
  /** WAITING | CALLED | IN_SERVICE | COMPLETED | CANCELLED */
  status: string;
  issuedAt: string;
  calledAt: string | null;
};

// ---- admin / front-desk view-models -----------------------------------

/**
 * ນັດໝາຍ 1 ແຖວ ໃນມຸມມອງ admin (Master Calendar / Appointments list).
 * ຮູບຮ່າງກົງກັບ web-admin `AppointmentListItem` (types/models.ts) — drop-in.
 * `staffId` = StaffProfile.id (ໃຊ້ເປັນ lane key ໃນ Calendar).
 */
export type AdminAppointmentListItem = {
  id: string;
  code: string;
  status: z.infer<typeof AppointmentStatus>;
  startAt: string;
  endAt: string;
  branchId: string;
  branchName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  deliveryType: z.infer<typeof ServiceDeliveryType>;
  price: number;
  depositPaid: number;
  isWalkIn: boolean;
  createdAt: string;
  // ---- Wave 11 (admin appointments console) — additive, no migration -------
  /** ONLINE | WALK_IN | ADMIN — `isWalkIn` ຍັງຄົງໄວ້ເພື່ອ backward compat. */
  source: z.infer<typeof AppointmentSource>;
  /** ໄລຍະເວລາຕາມນັດ (ນາທີ) = endAt − startAt. */
  durationMin: number;
  updatedAt: string;
  /** null = ຍັງບໍ່ມີບິນເລີຍ (ຈ່າຍໜ້າຮ້ານ). */
  paymentStatus: PaymentStatus | null;
  paidAt: string | null;
  /** ວິທີຈ່າຍທີ່ສຳເລັດແລ້ວ (distinct, ຕາມລຳດັບທີ່ບັນທຶກ). */
  paymentMethods: PaymentMethod[];
  /** ມັດຈຳທີ່ "ຕ້ອງ" ຈ່າຍຕາມນະໂຍບາຍບໍລິການ (0 = ບໍ່ບັງຄັບ). */
  depositRequired: number;
  /** ດາວຣີວິວຫຼັງໃຊ້ບໍລິການ — null = ຍັງບໍ່ໄດ້ຣີວິວ. */
  rating: number | null;
  hasCustomerNotes: boolean;
  hasStaffNotes: boolean;
  roomName: string | null;
  /** ຄ່າເດີນທາງ Home Service (ລວມຢູ່ໃນ price ແລ້ວ). */
  travelFee: number;
  /** ຊ້ອນເວລາກັບນັດອື່ນ (ຊ່າງ/ຫ້ອງ/ອຸປະກອນ). ມີສະເພາະ GET /appointments. */
  hasConflict?: boolean;
};

export type AdminAppointmentTimelineEntry = {
  at: string;
  /** ສະຖານະ ຫຼື ເຫດການ (BOOKED / CONFIRMED / rescheduled / …) — UI ແປເອງ. */
  label: string;
  by: string;
  /** `appointment.status_changed` ແລະ ອື່ນໆ ຈາກ AuditLog; null = ລາຍການທີ່ derive ເອົາ. */
  action?: string | null;
  /** true = ມາຈາກ AuditLog ຈິງ, false = derive ຈາກ createdAt/updatedAt (ຂໍ້ມູນເກົ່າ). */
  audited?: boolean;
};

/** ນັດອື່ນທີ່ຊ້ອນເວລາກັນ — ຊ່າງ, ຫ້ອງ ຫຼື ອຸປະກອນດຽວກັນ. */
export type AdminAppointmentConflict = {
  id: string;
  code: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  status: z.infer<typeof AppointmentStatus>;
  /** ຊັບພະຍາກອນທີ່ຊ້ອນກັນ. */
  reason: 'staff' | 'room' | 'equipment';
};

export type AdminAppointmentDetailView = AdminAppointmentListItem & {
  customerNotes: string | null;
  staffNotes: string | null;
  homeAddress: string | null;
  review: AppointmentReviewView | null;
  timeline: AdminAppointmentTimelineEntry[];
  /** ວ່າງ = ບໍ່ມີການຈອງຊ້ອນ. */
  conflicts: AdminAppointmentConflict[];
};

/** PATCH /appointments/:id/reschedule — ໜ້າຮ້ານ/ຜູ້ຈັດການເລື່ອນນັດໃຫ້ລູກຄ້າ. */
export const adminRescheduleSchema = z.object({
  startAt: isoDateTimeSchema,
  staffProfileId: z.string().uuid().optional(),
  /** ຂ້າມການກວດການຈອງຊ້ອນ (ຜູ້ຈັດການຢືນຢັນວ່າຮູ້ແລ້ວ). */
  force: z.boolean().default(false),
});
export type AdminRescheduleInput = z.infer<typeof adminRescheduleSchema>;

/** ອັນດັບ 1 ແຖວໃນ summary (ຊ່າງ / ບໍລິການ / ສາຂາ). */
export type AdminAppointmentBreakdownRow = {
  id: string;
  name: string;
  count: number;
  /** ລາຍຮັບທີ່ຄາດໄວ້ຂອງແຖວນີ້ (ບໍ່ນັບ CANCELLED/NO_SHOW). */
  revenue: number;
};

/**
 * GET /appointments/summary — ຕົວເລກລວມ **ຂອງທຸກແຖວທີ່ຕົງກັບຕົວກອງ**
 * (ບໍ່ແມ່ນລວມແຕ່ໜ້າດຽວ ຫຼື 200 ແຖວທຳອິດຄືກ່ອນໜ້ານີ້).
 * ໝາຍເຫດ: `byStatus` ບໍ່ສົນໃຈຕົວກອງ status ເພື່ອໃຫ້ແຖບສະຖານະຍັງກົດສະຫຼັບໄດ້.
 */
export type AdminAppointmentSummary = {
  /** ຈຳນວນທັງໝົດຕາມຕົວກອງ (ບໍ່ນັບຕົວກອງ status). */
  total: number;
  /** ຈຳນວນແຖວທີ່ຖືກນຳມາຄິດ — ໜ້ອຍກວ່າ total ໝາຍວ່າຖືກຕັດທີ່ເພດານ. */
  sampled: number;
  /** true = ຜົນຖືກຕັດທີ່ເພດານ, ຕົວເລກເງິນເປັນຄ່າປະມານ. */
  truncated: boolean;
  byStatus: Record<z.infer<typeof AppointmentStatus>, number>;
  money: {
    expected: number;
    realized: number;
    outstanding: number;
    deposits: number;
    lost: number;
    lostCount: number;
    avgTicket: number;
    travelFees: number;
  };
  ops: {
    today: number;
    todayOpen: number;
    todayValue: number;
    tomorrow: number;
    next7: number;
    next7Value: number;
    overdue: number;
    unconfirmed: number;
    needsDeposit: number;
    needsDepositValue: number;
    unrated: number;
    /** ນັດທີ່ຊ້ອນເວລາກັບນັດອື່ນ (ຊ່າງ/ຫ້ອງ/ອຸປະກອນ). */
    conflicts: number;
    walkIns: number;
    homeService: number;
    online: number;
    /** 0..1 — NO_SHOW ÷ (ນັດທີ່ຈົບແລ້ວທັງໝົດ). */
    noShowRate: number;
    /** 0..1 — COMPLETED ÷ (ນັດທີ່ຈົບແລ້ວທັງໝົດ). */
    completionRate: number;
    /** 0..1 — CANCELLED ÷ (ນັດທີ່ຈົບແລ້ວທັງໝົດ). */
    cancelRate: number;
    avgRating: number;
    ratedCount: number;
    distinctCustomers: number;
    avgDurationMin: number;
    /** ນາທີທີ່ຂາຍໄດ້ຈິງ (COMPLETED + IN_PROGRESS). */
    bookedMinutes: number;
  };
  byStaff: AdminAppointmentBreakdownRow[];
  byService: AdminAppointmentBreakdownRow[];
  byBranch: AdminAppointmentBreakdownRow[];
  /** ໄລ່ຕາມມື້ຂອງເວລາວຽງຈັນ (ສູງສຸດ 92 ຈຸດ) ສຳລັບ sparkline. */
  byDay: { date: string; count: number; revenue: number }[];
  /** 0–23 ຕາມເວລາວຽງຈັນ — ໃຊ້ຊອກຊົ່ວໂມງພີກ. */
  byHour: { hour: number; count: number }[];
};
