/**
 * ຕົວແປງແຖວ Appointment → view-model ຂອງ admin.
 *
 * ຢູ່ແຍກຈາກ appointments.service.ts ເພື່ອໃຫ້ໂມດູນອື່ນ (customers) ໃຊ້ຮູບຮ່າງດຽວກັນ
 * ໄດ້ໂດຍບໍ່ຕ້ອງ import service ທີ່ລາກ queue/loyalty/inventory ຕາມມາ (circular import).
 */
import type { AdminAppointmentListItem } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { MINUTE_MS } from '../../utils/dateHelpers.js';

const ADMIN_APPOINTMENT_INCLUDE = {
  branch: { select: { name: true } },
  // requireDeposit/depositAmount ມາພ້ອມແຖວ ເພື່ອບໍ່ໃຫ້ web-admin ຕ້ອງດຶງ /services ມາ join ເອງ.
  service: { select: { name: true, requireDeposit: true, depositAmount: true } },
  customer: { select: { name: true, phone: true } },
  staffProfile: { select: { user: { select: { name: true } } } },
  room: { select: { name: true } },
  payment: {
    select: {
      depositAmount: true,
      paymentStatus: true,
      paidAt: true,
      transactions: { where: { status: 'SUCCESS' }, select: { method: true }, orderBy: { createdAt: 'asc' } },
    },
  },
  review: { select: { rating: true, comment: true } },
} satisfies Prisma.AppointmentInclude;

type AdminAppointmentRow = Prisma.AppointmentGetPayload<{
  include: typeof ADMIN_APPOINTMENT_INCLUDE;
}>;

/** ລະຫັດນັດໝາຍທີ່ອ່ານງ່າຍ ຈາກ uuid (ບໍ່ມີ column ຈິງ — synthesize). */
function appointmentCode(id: string): string {
  return `A-${id.slice(0, 8).toUpperCase()}`;
}

function toAdminListItem(a: AdminAppointmentRow): AdminAppointmentListItem {
  return {
    id: a.id,
    code: appointmentCode(a.id),
    status: a.status,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    branchId: a.branchId,
    branchName: a.branch.name,
    customerId: a.customerId,
    customerName: a.customer.name,
    customerPhone: a.customer.phone,
    staffId: a.staffProfileId,
    staffName: a.staffProfile.user.name,
    serviceId: a.serviceId,
    serviceName: a.service.name,
    deliveryType: a.deliveryType,
    price: a.totalAmount.toNumber(),
    depositPaid: a.payment?.depositAmount.toNumber() ?? 0,
    isWalkIn: a.source === 'WALK_IN',
    createdAt: a.createdAt.toISOString(),
    source: a.source,
    durationMin: Math.max(0, Math.round((a.endAt.getTime() - a.startAt.getTime()) / MINUTE_MS)),
    updatedAt: a.updatedAt.toISOString(),
    paymentStatus: a.payment?.paymentStatus ?? null,
    paidAt: a.payment?.paidAt?.toISOString() ?? null,
    paymentMethods: [...new Set(a.payment?.transactions.map((tx) => tx.method) ?? [])],
    depositRequired: a.service.requireDeposit ? (a.service.depositAmount?.toNumber() ?? 0) : 0,
    rating: a.review?.rating ?? null,
    hasCustomerNotes: Boolean(a.customerNotes?.trim()),
    hasStaffNotes: Boolean(a.staffNotes?.trim()),
    roomName: a.room?.name ?? null,
    travelFee: a.travelFee.toNumber(),
  };
}


export { ADMIN_APPOINTMENT_INCLUDE, appointmentCode, toAdminListItem };
export type { AdminAppointmentRow };
