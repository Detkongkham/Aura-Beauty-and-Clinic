import { z } from 'zod';
import type { AppointmentStatus, AttendanceStatus, ServiceDeliveryType } from './enums.js';
import { TreatmentPhotoType } from './enums.js';

/**
 * Staff Mobile Portal — ໂມດູນ 06 (Phase 4).
 * ທຸກ endpoint ຢູ່ໃຕ້ `/staff-portal`, ຕ້ອງ role = STAFF; `staffProfileId` ມາຈາກ JWT.
 */

// ---- 1. ຕາຕະລາງງານປະຈຳວັນ -------------------------------------------------

export const staffScheduleQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM-DD'),
});
export type StaffScheduleQuery = z.infer<typeof staffScheduleQuerySchema>;

export type StaffScheduleItem = {
  id: string;
  code: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  serviceDurationMin: number;
  deliveryType: ServiceDeliveryType;
  isWalkIn: boolean;
  homeAddress: string | null;
  customerNotes: string | null;
  staffNotes: string | null;
  hasTreatmentRecord: boolean;
};

// ---- 2. ອັບເດດສະຖານະຄິວ (ຈຳກັດ) ----------------------------------------

/** ພະນັກງານປ່ຽນໄດ້ພຽງ 2 ປາຍທາງນີ້: ເລີ່ມບໍລິການ / ສຳເລັດ. */
export const staffAppointmentStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  staffNotes: z.string().max(5000).optional(),
});
export type StaffAppointmentStatusInput = z.infer<typeof staffAppointmentStatusSchema>;

// ---- 3. GPS Attendance --------------------------------------------------

export const attendanceCheckSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type AttendanceCheckInput = z.infer<typeof attendanceCheckSchema>;

export const attendanceQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM')
    .optional(),
});
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;

export type AttendanceRecordView = {
  id: string;
  date: string; // YYYY-MM-DD
  checkIn: string; // ISO
  checkOut: string | null;
  status: AttendanceStatus;
  latitude: number | null;
  longitude: number | null;
  workedMinutes: number | null;
};

export type AttendanceStateView = {
  today: AttendanceRecordView | null;
  branch: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
  history: AttendanceRecordView[];
};

// ---- 5. ສະຫຼຸບຄ່າຄອມມິດຊັນ --------------------------------------------

export const commissionQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM')
    .optional(),
});
export type CommissionQuery = z.infer<typeof commissionQuerySchema>;

export type CommissionServiceBreakdown = {
  serviceId: string;
  serviceName: string;
  count: number;
  serviceAmount: number;
  payoutAmount: number;
};

export type CommissionSummaryView = {
  month: string; // YYYY-MM
  commissionRate: number;
  appointmentsCompleted: number;
  grossServiceAmount: number;
  totalPayout: number;
  paidPayout: number;
  unpaidPayout: number;
  services: CommissionServiceBreakdown[];
  kpiGoal: {
    targetRevenue: number;
    actualRevenue: number;
    bonusAmount: number;
    isBonusPaid: boolean;
  } | null;
};

// ---- 4. Treatment Records + ຮູບ Before/After/Progress -----------------

export const treatmentRecordUpsertSchema = z.object({
  medicalNotes: z.string().max(5000).nullable().optional(),
});
export type TreatmentRecordUpsertInput = z.infer<typeof treatmentRecordUpsertSchema>;

export const treatmentPhotoCreateSchema = z.object({
  type: TreatmentPhotoType,
  caption: z.string().max(500).optional(),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  /** ຮູບ encode ເປັນ base64 (ບໍ່ຕ້ອງມີ data: prefix). ຈຳກັດ ~6MB ຫຼັງ decode. */
  dataBase64: z.string().min(1),
});
export type TreatmentPhotoCreateInput = z.infer<typeof treatmentPhotoCreateSchema>;

export type TreatmentPhotoView = {
  id: string;
  photoUrl: string;
  type: TreatmentPhotoType;
  caption: string | null;
  createdAt: string;
};

export type TreatmentRecordView = {
  id: string;
  appointmentId: string;
  customerId: string;
  medicalNotes: string | null;
  treatmentDate: string;
  photos: TreatmentPhotoView[];
};
