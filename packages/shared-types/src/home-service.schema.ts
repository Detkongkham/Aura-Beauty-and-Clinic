import { z } from 'zod';
import { HomeServiceJobStatus } from './enums.js';

/** ໂມດູນ 29 — On-Demand Home Service & Live GPS Stylist Tracking. */

export const staffAvailabilityUpdateSchema = z.object({
  isAvailable: z.boolean(),
});
export type StaffAvailabilityUpdateInput = z.infer<typeof staffAvailabilityUpdateSchema>;

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LocationPingInput = z.infer<typeof locationPingSchema>;

/** ການປ່ຽນສະຖານະທີ່ຊ່າງເອງອອກຄຳສັ່ງໄດ້ (ກ່ອນຮອດ — IN_PROGRESS/COMPLETED ໄປຜ່ານ staff-portal ຄິວປົກກະຕິ). */
export const tripStatusUpdateSchema = z.object({
  status: z.enum(['EN_ROUTE', 'ARRIVED', 'CANCELLED']),
  /** ເຫດຜົນຍົກເລີກ — ໃຊ້ສະເພາະຕອນ status === 'CANCELLED'. */
  reason: z.string().max(500).optional(),
});
export type TripStatusUpdateInput = z.infer<typeof tripStatusUpdateSchema>;

export const assignTripSchema = z.object({
  staffProfileId: z.string().uuid(),
});
export type AssignTripInput = z.infer<typeof assignTripSchema>;

export const homeServiceTripListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: HomeServiceJobStatus.optional(),
});
export type HomeServiceTripListQuery = z.infer<typeof homeServiceTripListQuerySchema>;

export type HomeServiceTripView = {
  id: string;
  appointmentId: string;
  status: HomeServiceJobStatus;
  branchId: string;
  branchName: string;
  /** ເບີໂທສາຂາທີ່ສົ່ງຊ່າງມາ — ລູກຄ້າໃຊ້ຕິດຕໍ່ຮ້ານຈາກໜ້າຕິດຕາມ. */
  branchPhone: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  customerNotes: string | null;
  matchedStaffId: string | null;
  matchedStaffName: string | null;
  matchedStaffTitle: string | null;
  matchedStaffAvatarUrl: string | null;
  matchedStaffRating: number | null;
  homeAddress: string | null;
  destLatitude: number | null;
  destLongitude: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastPingAt: string | null;
  etaMinutes: number | null;
  /** ໄລຍະຫ່າງລະຫວ່າງຊ່າງ ແລະ ຈຸດໝາຍຕອນຈັບຄູ່ (ແມັດ) — null ຖ້າບໍ່ຮູ້ຕຳແໜ່ງຊ່າງຕອນຈັບຄູ່. */
  distanceMeters: number | null;
  cancelReason: string | null;
  createdAt: string;
  startAt: string;
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

/** socket.io `trip:location` payload — 1 source of truth ຮ່ວມກັບ backend/mobile. */
export type HomeServiceLocationEvent = {
  appointmentId: string;
  lat: number;
  lng: number;
  etaMinutes: number | null;
  ts: string;
};

/** socket.io `trip:status` payload. */
export type HomeServiceStatusEvent = {
  appointmentId: string;
  status: HomeServiceJobStatus;
  at: string;
};
