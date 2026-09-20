import type { StaffListItem, StaffListQuery } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

type StaffRow = Prisma.StaffProfileGetPayload<{
  include: {
    user: { select: { name: true; avatarUrl: true } };
    staffBranches: { select: { branchId: true } };
    staffServices: { select: { serviceId: true } };
  };
}>;

const STAFF_INCLUDE = {
  user: { select: { name: true, avatarUrl: true } },
  staffBranches: { select: { branchId: true } },
  staffServices: { select: { serviceId: true } },
} satisfies Prisma.StaffProfileInclude;

function toStaffListItem(s: StaffRow): StaffListItem {
  return {
    id: s.id,
    name: s.user.name,
    title: s.title,
    avatarUrl: s.user.avatarUrl,
    rating: s.rating,
    totalReviews: s.totalReviews,
    bio: s.bio,
    branchIds: s.staffBranches.map((b) => b.branchId),
    serviceIds: s.staffServices.map((x) => x.serviceId),
  };
}

/** ລາຍຊື່ຊ່າງທີ່ເປີດໃຫ້ບໍລິການ — filter ຕາມສາຂາ ຫຼື ບໍລິການ. */
export async function listStaff(query: StaffListQuery): Promise<StaffListItem[]> {
  const rows = await prisma.staffProfile.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(query.branchId ? { staffBranches: { some: { branchId: query.branchId } } } : {}),
      ...(query.serviceId ? { staffServices: { some: { serviceId: query.serviceId } } } : {}),
    },
    include: STAFF_INCLUDE,
    orderBy: [{ rating: 'desc' }, { totalReviews: 'desc' }],
  });
  return rows.map(toStaffListItem);
}

/** ໂປຣຟາຍຊ່າງ 1 ຄົນ. */
export async function getStaffById(id: string): Promise<StaffListItem> {
  const row = await prisma.staffProfile.findFirst({
    where: { id, isActive: true, deletedAt: null },
    include: STAFF_INCLUDE,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  return toStaffListItem(row);
}
