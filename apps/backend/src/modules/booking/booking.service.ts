import type {
  AppointmentDetailView,
  AppointmentListItem,
  AvailabilityQuery,
  AvailabilityResponse,
  BookingPolicyView,
  CancelAppointmentInput,
  CreateAppointmentInput,
  CreateReviewInput,
  CustomerCreateAppointmentInput,
  MyAppointmentsQuery,
  Paginated,
  RescheduleAppointmentInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { waitlistQueue } from '../../jobs/queues.js';
import { ApiError } from '../../utils/ApiError.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { getSettings } from '../settings/settings.service.js';
import {
  addMinutes,
  tsParam,
  vientianeDateKey,
  vientianeDayRangeOf,
  vientianeDayStart,
} from '../../utils/dateHelpers.js';
import { computeAvailableSlots, type BusyInterval } from './slotEngine.js';
import { resolvePrice } from '../pricing/pricing.service.js';
import { runSerializable } from '../../utils/serializable.js';
import { applyReferralAtBooking } from '../referral/referral.service.js';
import { computeTravelFee, createTrip, matchNearestStaff } from '../home-service/home-service.service.js';

/** ສະຖານະທີ່ຍັງ "active" (ນັບເປັນຄິວ, ຍົກເລີກ/ເລື່ອນໄດ້). */
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

const MODIFIABLE_STATUSES: ReadonlyArray<string> = ['PENDING', 'CONFIRMED'];

/**
 * ນະໂຍບາຍຍົກເລີກ/ເລື່ອນນັດຂອງລູກຄ້າ — ອ່ານຈາກ Web Admin ▸ Settings (`cancellationWindowHours`).
 * ລູກຄ້າຍົກເລີກ/ເລື່ອນເອງໄດ້ຈົນຮອດ `startAt − window`; ຫຼັງຈາກນັ້ນຕ້ອງຕິດຕໍ່ຮ້ານ (admin ບໍ່ຖືກຈຳກັດ).
 */
export async function getBookingPolicy(): Promise<BookingPolicyView> {
  const settings = await getSettings();
  const hours = Number(settings.cancellationWindowHours);
  return { cancellationWindowHours: Number.isFinite(hours) && hours > 0 ? hours : 0 };
}

function cancelDeadline(startAt: Date, windowHours: number): Date {
  return new Date(startAt.getTime() - windowHours * 3_600_000);
}

/** ກວດວ່າລູກຄ້າຍັງແກ້ໄຂນັດໄດ້ (ສະຖານະ + ກຳນົດເວລາ). */
function assertCustomerCanModify(
  appt: { status: string; startAt: Date },
  windowHours: number,
  action: 'cancel' | 'reschedule',
): void {
  if (!MODIFIABLE_STATUSES.includes(appt.status)) {
    throw ApiError.badRequest(
      action === 'cancel' ? 'ນັດໝາຍນີ້ບໍ່ສາມາດຍົກເລີກໄດ້' : 'ນັດໝາຍນີ້ບໍ່ສາມາດເລື່ອນໄດ້',
    );
  }
  if (appt.startAt.getTime() <= Date.now()) {
    throw ApiError.badRequest(
      action === 'cancel' ? 'ບໍ່ສາມາດຍົກເລີກນັດທີ່ຮອດເວລາແລ້ວ' : 'ບໍ່ສາມາດເລື່ອນນັດທີ່ຮອດເວລາແລ້ວ',
    );
  }
  if (Date.now() >= cancelDeadline(appt.startAt, windowHours).getTime()) {
    throw new ApiError(
      400,
      ErrorCode.CANCEL_WINDOW_PASSED,
      `ຍົກເລີກ ຫຼື ເລື່ອນນັດໄດ້ກ່ອນເວລານັດ ${windowHours} ຊົ່ວໂມງເທົ່ານັ້ນ — ກະລຸນາຕິດຕໍ່ຮ້ານ`,
      { cancellationWindowHours: windowHours },
    );
  }
}

/** ໂຫລດ busy intervals ຂອງຊ່າງ (ຄິວ active + ລາພັກ) ໃນມື້ໃດໜຶ່ງ. */
async function loadBusy(
  tx: Prisma.TransactionClient,
  staffProfileId: string,
  dayStart: Date,
  dayEnd: Date,
  excludeAppointmentId?: string,
): Promise<BusyInterval[]> {
  const [appts, timeOffs] = await Promise.all([
    tx.appointment.findMany({
      where: {
        staffProfileId,
        deletedAt: null,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { startAt: true, endAt: true },
    }),
    tx.staffTimeOff.findMany({
      where: { staffProfileId, isApproved: true, startDate: { lt: dayEnd }, endDate: { gt: dayStart } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  return [
    ...appts.map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
    ...timeOffs.map((t) => ({ startAt: t.startDate, endAt: t.endDate })),
  ];
}

export async function getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
  const service = await prisma.service.findFirst({
    where: { id: query.serviceId, deletedAt: null },
    select: { durationMinutes: true },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  // query.date = ວັນທີປະຕິທິນວຽງຈັນ ('YYYY-MM-DD' → UTC-midnight) → ຊ່ວງ [00:00, 24:00) ວຽງຈັນ.
  const dayStart = vientianeDayStart(query.date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const dayOfWeek = query.date.getUTCDay();

  const staffProfiles = await prisma.staffProfile.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(query.staffProfileId ? { id: query.staffProfileId } : {}),
      staffBranches: { some: { branchId: query.branchId } },
      staffServices: { some: { serviceId: query.serviceId } },
    },
    select: {
      id: true,
      workingHours: {
        where: { dayOfWeek },
        select: {
          startTime: true,
          endTime: true,
          breakStartTime: true,
          breakEndTime: true,
          isDayOff: true,
        },
      },
    },
  });

  const now = new Date();
  const slots: AvailabilityResponse['slots'] = [];

  for (const staff of staffProfiles) {
    const busy = await loadBusy(prisma, staff.id, dayStart, dayEnd);
    const daily = computeAvailableSlots({
      day: dayStart,
      durationMinutes: service.durationMinutes,
      workingHour: staff.workingHours[0] ?? null,
      busy,
      notBefore: now,
    });
    for (const s of daily) {
      slots.push({
        staffProfileId: staff.id,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
      });
    }
  }

  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    date: query.date.toISOString().slice(0, 10),
    durationMinutes: service.durationMinutes,
    slots,
  };
}

/**
 * ກວດວ່າ slot ຍັງວ່າງ ພາຍໃນ transaction:
 *  - row-level lock (SELECT ... FOR UPDATE) ເທິງຄິວທີ່ຊ້ອນ staff/ຫ້ອງ/ເຄື່ອງມື
 *  - ຢືນຢັນ slot ຖືກຕ້ອງກັບ working hours + busy ຜ່ານ slot engine
 * throw ApiError ຖ້າບໍ່ວ່າງ.
 */
async function assertSlotFree(
  tx: Prisma.TransactionClient,
  params: {
    staffProfileId: string;
    durationMinutes: number;
    startAt: Date;
    endAt: Date;
    roomId?: string | null;
    equipmentId?: string | null;
    excludeAppointmentId?: string;
  },
): Promise<void> {
  const { staffProfileId, durationMinutes, startAt, endAt, roomId, equipmentId, excludeAppointmentId } =
    params;

  const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM appointments
    WHERE "deletedAt" IS NULL
      AND status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
      AND "startAt" < ${tsParam(endAt)}
      AND "endAt" > ${tsParam(startAt)}
      ${excludeAppointmentId ? Prisma.sql`AND id <> ${excludeAppointmentId}` : Prisma.empty}
      AND (
        "staffProfileId" = ${staffProfileId}
        ${roomId ? Prisma.sql`OR "roomId" = ${roomId}` : Prisma.empty}
        ${equipmentId ? Prisma.sql`OR "equipmentId" = ${equipmentId}` : Prisma.empty}
      )
    FOR UPDATE
  `;

  if (conflicts.length > 0) {
    throw ApiError.conflict('ຊ່ວງເວລານີ້ຖືກຈອງແລ້ວ', ErrorCode.DOUBLE_BOOKING);
  }

  const { start: dayStart, end: dayEnd } = vientianeDayRangeOf(startAt);
  const wh = await tx.workingHour.findFirst({
    where: { staffProfileId, dayOfWeek: vientianeDateKey(startAt).getUTCDay() },
    select: {
      startTime: true,
      endTime: true,
      breakStartTime: true,
      breakEndTime: true,
      isDayOff: true,
    },
  });
  const busy = await loadBusy(tx, staffProfileId, dayStart, dayEnd, excludeAppointmentId);
  const valid = computeAvailableSlots({
    day: dayStart,
    durationMinutes,
    workingHour: wh,
    busy,
  }).some((s) => s.startAt.getTime() === startAt.getTime());

  if (!valid) {
    throw ApiError.conflict('ຊ່ວງເວລານີ້ບໍ່ວ່າງໃຫ້ຈອງ', ErrorCode.SLOT_UNAVAILABLE);
  }
}

/**
 * ສ້າງຄິວ ພ້ອມປ້ອງກັນ double-booking (Serializable tx + SELECT ... FOR UPDATE).
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<{ id: string }> {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, deletedAt: null },
    select: { durationMinutes: true, price: true },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  const startAt = input.startAt;
  const endAt = addMinutes(startAt, service.durationMinutes);
  const basePrice = service.price.toNumber();

  return runSerializable(
    async (tx) => {
      // ໂມດູນ 29 — HOME_SERVICE ບໍ່ມີ staffProfileId ມາຈາກ caller, ຈັດຊ່າງທີ່ໃກ້ທີ່ສຸດອັດຕະໂນມັດ.
      // ຖ້າຫາຊ່າງທີ່ວ່າງແທ້ບໍ່ໄດ້ (matched=false), booking ຍັງສຳເລັດຢູ່ — matchNearestStaff ຄືນຊ່າງ
      // placeholder ໃຫ້ໃສ່ FK ຊົ່ວຄາວ, trip ຈະຖືກສ້າງເປັນ NO_MATCH ໃຫ້ dispatcher ມາຫາຊ່າງໃຫ້ເອງ.
      let staffProfileId = input.staffProfileId;
      let travelFee = 0;
      let matchDistanceMeters: number | null = 0;
      let homeServiceMatched = true;
      if (input.deliveryType === 'HOME_SERVICE') {
        const match = await matchNearestStaff(tx, {
          branchId: input.branchId,
          serviceId: input.serviceId,
          destLatitude: input.destLatitude!,
          destLongitude: input.destLongitude!,
          startAt,
          endAt,
        });
        staffProfileId = match.staffProfileId;
        matchDistanceMeters = match.distanceMeters;
        homeServiceMatched = match.matched;
        // ໄລຍະຫ່າງຂອງ placeholder (NO_MATCH) ບໍ່ແມ່ນຄ່າຈິງ — ຄ່າທຳນຽມເດີນທາງຄ່ອຍຄິດຄືນຕອນ admin
        // ຈັດຊ່າງຈິງໃຫ້ (assignTrip).
        travelFee = match.matched ? computeTravelFee(match.distanceMeters ?? 0) : 0;
      }

      // ຂ້າມການເຊັກຄິວຊ່າງ ຖ້າເປັນ placeholder (NO_MATCH) — ຊ່າງຄົນນີ້ບໍ່ໄດ້ຮັບວຽກນີ້ຈິງ, ບໍ່ຄວນໄປຕິດ
      // ຄິວປົກກະຕິຂອງລາວ.
      if (homeServiceMatched) {
        await assertSlotFree(tx, {
          staffProfileId: staffProfileId!,
          durationMinutes: service.durationMinutes,
          startAt,
          endAt,
          roomId: input.roomId ?? null,
          equipmentId: input.equipmentId ?? null,
        });
      }

      // Module 28 — dynamic pricing / happy-hours ຕາມເວລານັດ
      const { finalPrice } = await resolvePrice(tx, {
        branchId: input.branchId,
        serviceId: input.serviceId,
        basePrice,
        at: startAt,
      });

      // ໃຊ້ສິດແພັກເກັດ — ຕ້ອງເປັນຂອງລູກຄ້າຄົນນີ້, ACTIVE, ຍັງບໍ່ໝົດອາຍຸ, ບໍລິການກົງກັນ, ຍັງເຫຼືອຄັ້ງ.
      // ຕັດ 1 ຄັ້ງແບບມີເງື່ອນໄຂ (remainingUnits > 0) ກັນຈອງພ້ອມກັນເກີນສິດ. ນັດນີ້ບໍ່ເກັບເງິນ.
      if (input.userPackageItemId) {
        const { count } = await tx.userPackageItem.updateMany({
          where: {
            id: input.userPackageItemId,
            serviceId: input.serviceId,
            remainingUnits: { gt: 0 },
            userPackage: {
              userId: input.customerId,
              status: 'ACTIVE',
              expireDate: { gt: new Date() },
            },
          },
          data: { remainingUnits: { decrement: 1 } },
        });
        if (count === 0) {
          throw ApiError.badRequest('ຄອສ (package) ນີ້ໃຊ້ບໍ່ໄດ້ກັບບໍລິການນີ້ ຫຼື ໝົດສິດແລ້ວ');
        }
      }
      const chargedPrice = input.userPackageItemId ? 0 : finalPrice;

      const created = await tx.appointment.create({
        data: {
          branchId: input.branchId,
          customerId: input.customerId,
          staffProfileId: staffProfileId!,
          serviceId: input.serviceId,
          roomId: input.roomId ?? null,
          equipmentId: input.equipmentId ?? null,
          bookingGroupId: input.bookingGroupId ?? null,
          userPackageItemId: input.userPackageItemId ?? null,
          startAt,
          endAt,
          status: 'PENDING',
          deliveryType: input.deliveryType,
          homeAddress: input.homeAddress ?? null,
          destLatitude: input.destLatitude ?? null,
          destLongitude: input.destLongitude ?? null,
          travelFee,
          totalAmount: chargedPrice,
          currency: 'LAK',
          customerNotes: input.customerNotes ?? null,
        },
        select: { id: true },
      });

      // ໂມດູນ 29 — ບັນທຶກ trip (ASSIGNED ຫຼື NO_MATCH) ດຽວກັນກັບ tx ຂ້າງເທິງ.
      if (input.deliveryType === 'HOME_SERVICE') {
        await createTrip(tx, {
          appointmentId: created.id,
          staffProfileId: staffProfileId!,
          distanceMeters: matchDistanceMeters,
          matched: homeServiceMatched,
        });
      }

      // Module 33 — ນຳໃຊ້ລະຫັດແນະນຳໝູ່ (ຫັກສ່ວນຫຼຸດຄິວທຳອິດຂອງຜູ້ຖືກແນະນຳ)
      if (input.referralCode && chargedPrice > 0) {
        const discount = await applyReferralAtBooking(tx, {
          referredUserId: input.customerId,
          code: input.referralCode,
          appointmentId: created.id,
        });
        if (discount > 0) {
          await tx.appointment.update({
            where: { id: created.id },
            data: { totalAmount: Math.max(0, finalPrice - discount) },
          });
        }
      }

      return created;
    },
  );
}

/** ຍົກເລີກນັດທີ່ໃຊ້ສິດແພັກເກັດ → ຄືນ 1 ຄັ້ງ (ບໍ່ເກີນ totalUnits). no-op ຖ້າບໍ່ໄດ້ໃຊ້ແພັກເກັດ. */
export async function restorePackageUnit(
  tx: Prisma.TransactionClient,
  userPackageItemId: string | null,
): Promise<void> {
  if (!userPackageItemId) return;
  const item = await tx.userPackageItem.findUnique({
    where: { id: userPackageItemId },
    select: { remainingUnits: true, totalUnits: true },
  });
  if (!item || item.remainingUnits >= item.totalUnits) return;
  await tx.userPackageItem.update({
    where: { id: userPackageItemId },
    data: { remainingUnits: { increment: 1 } },
  });
}

/** Customer App — ຈອງຄິວໃຫ້ຕົນເອງ (customerId ມາຈາກ JWT). */
export async function createAppointmentForCustomer(
  customerId: string,
  input: CustomerCreateAppointmentInput,
): Promise<{ id: string }> {
  return createAppointment({ ...input, customerId });
}

// ---- view-model mapping -------------------------------------------------

const APPOINTMENT_INCLUDE = {
  branch: { select: { name: true } },
  service: { select: { name: true, imageUrl: true } },
  staffProfile: {
    select: { title: true, rating: true, user: { select: { name: true, avatarUrl: true } } },
  },
  review: { select: { rating: true, comment: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

/** include ເພີ່ມສຳລັບໜ້າລາຍລະອຽດເທົ່ານັ້ນ — ບໍ່ໃຫ້ລາຍການ (list) ໜັກ. */
const APPOINTMENT_DETAIL_INCLUDE = {
  ...APPOINTMENT_INCLUDE,
  branch: { select: { name: true, address: true, phone: true, latitude: true, longitude: true } },
  staffProfile: {
    select: {
      title: true,
      rating: true,
      totalReviews: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  },
  room: { select: { name: true } },
  queueTicket: { select: { ticketNumber: true, status: true, createdAt: true, calledAt: true } },
  payment: {
    select: {
      paymentStatus: true,
      totalAmount: true,
      depositAmount: true,
      paidAt: true,
      transactions: { where: { status: 'SUCCESS' }, select: { amount: true } },
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentDetailRow = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_DETAIL_INCLUDE;
}>;

function toListItem(a: AppointmentRow, now: Date, windowHours: number): AppointmentListItem {
  const deadline = cancelDeadline(a.startAt, windowHours);
  const modifiable = MODIFIABLE_STATUSES.includes(a.status) && now.getTime() < deadline.getTime();
  return {
    id: a.id,
    status: a.status,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    branchId: a.branchId,
    branchName: a.branch.name,
    serviceId: a.serviceId,
    serviceName: a.service.name,
    staffProfileId: a.staffProfileId,
    staffName: a.staffProfile.user.name,
    staffTitle: a.staffProfile.title,
    staffAvatarUrl: a.staffProfile.user.avatarUrl,
    staffRating: a.staffProfile.rating,
    serviceImageUrl: a.service.imageUrl,
    deliveryType: a.deliveryType,
    totalAmount: a.totalAmount.toNumber(),
    currency: a.currency,
    canCancel: modifiable,
    canReschedule: modifiable,
    cancelDeadline: deadline.toISOString(),
    canReview: a.status === 'COMPLETED' && !a.review,
  };
}

function toDetailView(a: AppointmentDetailRow, now: Date, windowHours: number): AppointmentDetailView {
  const p = a.payment;
  return {
    ...toListItem(a, now, windowHours),
    customerNotes: a.customerNotes,
    staffNotes: a.staffNotes,
    homeAddress: a.homeAddress,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    review: a.review ? { rating: a.review.rating, comment: a.review.comment } : null,
    branchAddress: a.branch.address,
    branchPhone: a.branch.phone,
    branchLatitude: a.branch.latitude,
    branchLongitude: a.branch.longitude,
    staffTotalReviews: a.staffProfile.totalReviews,
    roomName: a.room?.name ?? null,
    travelFee: a.travelFee.toNumber(),
    payment: p
      ? {
          status: p.paymentStatus,
          totalAmount: p.totalAmount.toNumber(),
          depositAmount: p.depositAmount.toNumber(),
          paidAmount: p.transactions.reduce((sum, tx) => sum + tx.amount.toNumber(), 0),
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        }
      : null,
    queueTicket: a.queueTicket
      ? {
          number: a.queueTicket.ticketNumber,
          status: a.queueTicket.status,
          issuedAt: a.queueTicket.createdAt.toISOString(),
          calledAt: a.queueTicket.calledAt ? a.queueTicket.calledAt.toISOString() : null,
        }
      : null,
  };
}

/** ລາຍການນັດໝາຍຂອງລູກຄ້າ — upcoming / history / all. */
export async function getMyAppointments(
  customerId: string,
  query: MyAppointmentsQuery,
): Promise<Paginated<AppointmentListItem>> {
  const now = new Date();
  const scopeWhere: Prisma.AppointmentWhereInput =
    query.scope === 'upcoming'
      ? { startAt: { gte: now }, status: { in: [...ACTIVE_STATUSES] } }
      : query.scope === 'history'
        ? {
            OR: [
              { startAt: { lt: now } },
              { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
            ],
          }
        : {};

  const where: Prisma.AppointmentWhereInput = { customerId, deletedAt: null, ...scopeWhere };

  const [rows, total, policy] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { startAt: query.scope === 'upcoming' ? 'asc' : 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.appointment.count({ where }),
    getBookingPolicy(),
  ]);

  return {
    items: rows.map((r) => toListItem(r, now, policy.cancellationWindowHours)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

async function loadOwnedAppointment(id: string, customerId: string): Promise<AppointmentRow> {
  const appt = await prisma.appointment.findFirst({
    where: { id, customerId, deletedAt: null },
    include: APPOINTMENT_INCLUDE,
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
  return appt;
}

/** ລາຍລະອຽດນັດໝາຍ 1 ລາຍການ (ຕ້ອງເປັນເຈົ້າຂອງ). */
export async function getMyAppointmentDetail(
  id: string,
  customerId: string,
): Promise<AppointmentDetailView> {
  const appt = await prisma.appointment.findFirst({
    where: { id, customerId, deletedAt: null },
    include: APPOINTMENT_DETAIL_INCLUDE,
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
  const policy = await getBookingPolicy();
  return toDetailView(appt, new Date(), policy.cancellationWindowHours);
}

/** ຍົກເລີກນັດໝາຍ. */
export async function cancelAppointment(
  id: string,
  customerId: string,
  input: CancelAppointmentInput,
): Promise<AppointmentListItem> {
  const appt = await loadOwnedAppointment(id, customerId);
  const policy = await getBookingPolicy();
  assertCustomerCanModify(appt, policy.cancellationWindowHours, 'cancel');

  const customerNotes = input.reason
    ? `${appt.customerNotes ? `${appt.customerNotes}\n` : ''}[ຍົກເລີກ] ${input.reason}`
    : appt.customerNotes;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', customerNotes },
      include: APPOINTMENT_INCLUDE,
    });
    await restorePackageUnit(tx, row.userPackageItemId);
    return row;
  });

  // Smart Waitlist (Module 20) — ຄິວຫວ່າງ → ແຈ້ງຄົນທີ່ລໍຖ້າ. no-op ຖ້າ Redis ບໍ່ພ້ອມ.
  await waitlistQueue
    .add('backfill', {
      branchId: appt.branchId,
      serviceId: appt.serviceId,
      freedFrom: appt.startAt.toISOString(),
      freedTo: appt.endAt.toISOString(),
    })
    .catch((err) => logger.warn({ err }, 'waitlist enqueue failed'));

  return toListItem(updated, new Date(), policy.cancellationWindowHours);
}

/** ເລື່ອນນັດ — ຢືນຢັນ slot ໃໝ່ຜ່ານ Serializable tx. */
export async function rescheduleAppointment(
  id: string,
  customerId: string,
  input: RescheduleAppointmentInput,
): Promise<AppointmentListItem> {
  const appt = await loadOwnedAppointment(id, customerId);
  const policy = await getBookingPolicy();
  assertCustomerCanModify(appt, policy.cancellationWindowHours, 'reschedule');

  const service = await prisma.service.findFirst({
    where: { id: appt.serviceId, deletedAt: null },
    select: { durationMinutes: true },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  const staffProfileId = input.staffProfileId ?? appt.staffProfileId;
  const startAt = input.startAt;
  const endAt = addMinutes(startAt, service.durationMinutes);

  await runSerializable(async (tx) => {
    if (staffProfileId !== appt.staffProfileId) {
      const canDo = await tx.staffService.findFirst({
        where: { staffProfileId, serviceId: appt.serviceId },
        select: { id: true },
      });
      if (!canDo) throw ApiError.badRequest('ຊ່າງທີ່ເລືອກບໍ່ໄດ້ໃຫ້ບໍລິການນີ້');
    }
    await assertSlotFree(tx, {
      staffProfileId,
      durationMinutes: service.durationMinutes,
      startAt,
      endAt,
      roomId: appt.roomId,
      equipmentId: appt.equipmentId,
      excludeAppointmentId: id,
    });
    await tx.appointment.update({
      where: { id },
      data: { staffProfileId, startAt, endAt, status: 'PENDING' },
    });
  });

  const refreshed = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: APPOINTMENT_INCLUDE,
  });
  return toListItem(refreshed, new Date(), policy.cancellationWindowHours);
}

/** ໃຫ້ຄະແນນ/ຣີວິວ ຫຼັງຮັບບໍລິການສຳເລັດ. */
export async function addReview(
  id: string,
  userId: string,
  input: CreateReviewInput,
): Promise<{ rating: number; comment: string | null }> {
  const appt = await prisma.appointment.findFirst({
    where: { id, customerId: userId, deletedAt: null },
    select: { status: true, staffProfileId: true, review: { select: { id: true } } },
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
  if (appt.status !== 'COMPLETED') {
    throw ApiError.badRequest('ໃຫ້ຄະແນນໄດ້ຫຼັງຮັບບໍລິການສຳເລັດເທົ່ານັ້ນ');
  }
  if (appt.review) throw ApiError.conflict('ນັດໝາຍນີ້ຖືກໃຫ້ຄະແນນແລ້ວ');

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: { appointmentId: id, userId, rating: input.rating, comment: input.comment ?? null },
      select: { rating: true, comment: true },
    });
    const agg = await tx.review.aggregate({
      where: { appointment: { staffProfileId: appt.staffProfileId } },
      _avg: { rating: true },
      _count: true,
    });
    await tx.staffProfile.update({
      where: { id: appt.staffProfileId },
      data: {
        rating: agg._avg.rating ?? 5,
        totalReviews: agg._count,
      },
    });
    return created;
  });

  return review;
}
