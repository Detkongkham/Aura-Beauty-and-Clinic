import type {
  AdminStaffListQuery,
  AdminStaffUpdateInput,
  AdminStaffView,
  Paginated,
  TimeOffDecisionInput,
  TimeOffRequestView,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { revokeAllSessions } from '../auth/security.js';

const STAFF_INCLUDE = {
  user: { select: { name: true, phone: true, email: true, avatarUrl: true } },
  staffBranches: { include: { branch: { select: { id: true, name: true } } } },
  staffServices: { select: { serviceId: true } },
  workingHours: true,
} satisfies Prisma.StaffProfileInclude;

type StaffRow = Prisma.StaffProfileGetPayload<{ include: typeof STAFF_INCLUDE }>;

function primaryBranch(s: StaffRow): { id: string; name: string } {
  const primary = s.staffBranches.find((b) => b.isPrimary) ?? s.staffBranches[0];
  return primary ? { id: primary.branch.id, name: primary.branch.name } : { id: '', name: '—' };
}

function toAdminStaffView(s: StaffRow): AdminStaffView {
  const branch = primaryBranch(s);
  return {
    id: s.id,
    userId: s.userId,
    name: s.user.name,
    phone: s.user.phone,
    email: s.user.email,
    avatarUrl: s.user.avatarUrl,
    jobTitle: s.title,
    branchId: branch.id,
    branchName: branch.name,
    isActive: s.isActive,
    serviceIds: s.staffServices.map((x) => x.serviceId),
    workingHours: [...s.workingHours]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        isDayOff: w.isDayOff,
      })),
    commissionRate: s.commissionRate,
    hiredAt: s.createdAt.toISOString(),
  };
}

/** GET /staff?page=… — ໜ້າ Staff directory (admin). */
export async function listAdminStaff(
  query: AdminStaffListQuery,
): Promise<Paginated<AdminStaffView>> {
  const where: Prisma.StaffProfileWhereInput = {
    deletedAt: null,
    ...(query.q ? { user: { name: { contains: query.q, mode: 'insensitive' } } } : {}),
    ...(query.branchId ? { staffBranches: { some: { branchId: query.branchId } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.staffProfile.findMany({
      where,
      include: STAFF_INCLUDE,
      orderBy: { user: { name: 'asc' } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.staffProfile.count({ where }),
  ]);
  return {
    items: rows.map(toAdminStaffView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

async function findStaff(id: string): Promise<StaffRow> {
  const row = await prisma.staffProfile.findFirst({
    where: { id, deletedAt: null },
    include: STAFF_INCLUDE,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບພະນັກງານ');
  return row;
}

/** GET /staff/:id — ໂປຣຟາຍພະນັກງານ (admin shape). */
export async function getAdminStaff(id: string): Promise<AdminStaffView> {
  return toAdminStaffView(await findStaff(id));
}

/** PATCH /staff/:id — ແກ້ໂປຣຟາຍ / ຊົ່ວໂມງ / ບໍລິການ / ຄ່ານາຍໜ້າ. */
export async function updateAdminStaff(
  id: string,
  input: AdminStaffUpdateInput,
): Promise<AdminStaffView> {
  const staff = await findStaff(id);

  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({
      where: { id },
      data: {
        ...(input.jobTitle !== undefined ? { title: input.jobTitle } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
      },
    });
    // The staff member's login follows the profile: deactivated staff can't sign in (e.g. they left).
    if (input.isActive !== undefined && input.isActive !== staff.isActive) {
      await tx.user.update({ where: { id: staff.userId }, data: { isActive: input.isActive } });
    }

    if (input.branchId !== undefined) {
      const exists = await tx.branch.findFirst({
        where: { id: input.branchId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
      await tx.staffBranch.updateMany({ where: { staffProfileId: id }, data: { isPrimary: false } });
      await tx.staffBranch.upsert({
        where: { staffProfileId_branchId: { staffProfileId: id, branchId: input.branchId } },
        create: { staffProfileId: id, branchId: input.branchId, isPrimary: true },
        update: { isPrimary: true },
      });
    }

    if (input.serviceIds !== undefined) {
      await tx.staffService.deleteMany({ where: { staffProfileId: id } });
      if (input.serviceIds.length > 0) {
        await tx.staffService.createMany({
          data: input.serviceIds.map((serviceId) => ({ staffProfileId: id, serviceId })),
          skipDuplicates: true,
        });
      }
    }

    if (input.workingHours !== undefined) {
      await tx.workingHour.deleteMany({ where: { staffProfileId: id } });
      if (input.workingHours.length > 0) {
        await tx.workingHour.createMany({
          data: input.workingHours.map((w) => ({
            staffProfileId: id,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            isDayOff: w.isDayOff,
          })),
        });
      }
    }
  });

  if (input.isActive === false && staff.isActive) await revokeAllSessions(staff.userId, 'DEACTIVATED');
  return getAdminStaff(id);
}

// ---- time-off approvals ----------------------------------------------

function toTimeOffView(
  r: Prisma.StaffTimeOffGetPayload<{
    include: { staffProfile: { include: { user: { select: { name: true } } } } };
  }>,
): TimeOffRequestView {
  const status =
    r.status === 'APPROVED' || r.status === 'REJECTED'
      ? r.status
      : r.isApproved
        ? 'APPROVED'
        : 'PENDING';
  return {
    id: r.id,
    staffId: r.staffProfileId,
    staffName: r.staffProfile.user.name,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    reason: r.reason ?? '',
    status,
    requestedAt: r.createdAt.toISOString(),
  };
}

/** GET /staff/time-off — ຄຳຮ້ອງລາພັກທັງໝົດ (ໃໝ່ສຸດກ່ອນ). */
export async function listTimeOff(): Promise<{ items: TimeOffRequestView[] }> {
  const rows = await prisma.staffTimeOff.findMany({
    include: { staffProfile: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items: rows.map(toTimeOffView) };
}

/** PATCH /staff/time-off/:id — ອະນຸມັດ / ປະຕິເສດ. */
export async function decideTimeOff(
  id: string,
  input: TimeOffDecisionInput,
): Promise<TimeOffRequestView> {
  const existing = await prisma.staffTimeOff.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບຄຳຮ້ອງ');
  const row = await prisma.staffTimeOff.update({
    where: { id },
    data: { status: input.status, isApproved: input.status === 'APPROVED' },
    include: { staffProfile: { include: { user: { select: { name: true } } } } },
  });
  return toTimeOffView(row);
}
