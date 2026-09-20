import type {
  Paginated,
  ServiceCategoryView,
  ServiceDetailView,
  ServiceListItem,
  ServiceListQuery,
  ServiceBranchInfo,
  ServicePackageOffer,
  ServiceReviewItem,
  ServiceStep,
  StaffSummary,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

type ServiceWithCategory = Prisma.ServiceGetPayload<{
  include: { category: { select: { name: true } } };
}>;

type ServiceItemExtra = { rating?: number; reviewCount?: number; popular?: boolean };

function toServiceListItem(s: ServiceWithCategory, extra: ServiceItemExtra = {}): ServiceListItem {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    categoryId: s.categoryId,
    categoryName: s.category.name,
    branchId: s.branchId,
    price: s.price.toNumber(),
    compareAtPrice: s.compareAtPrice ? s.compareAtPrice.toNumber() : null,
    durationMinutes: s.durationMinutes,
    imageUrl: s.imageUrl,
    highlights: s.highlights ?? [],
    requireDeposit: s.requireDeposit,
    depositAmount: s.depositAmount ? s.depositAmount.toNumber() : null,
    rating: extra.rating ?? 0,
    reviewCount: extra.reviewCount ?? 0,
    popular: extra.popular ?? false,
  };
}

/** ຄະແນນສະເລ່ຍ + ຈຳນວນຣີວິວຕໍ່ບໍລິການ (join ຜ່ານ appointment). Bounded ຕາມ page. */
async function ratingByService(
  serviceIds: string[],
): Promise<Map<string, { rating: number; reviewCount: number }>> {
  const out = new Map<string, { rating: number; reviewCount: number }>();
  if (serviceIds.length === 0) return out;
  const reviews = await prisma.review.findMany({
    where: { appointment: { serviceId: { in: serviceIds } } },
    select: { rating: true, appointment: { select: { serviceId: true } } },
  });
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of reviews) {
    const sid = r.appointment.serviceId;
    const cur = acc.get(sid) ?? { sum: 0, n: 0 };
    cur.sum += r.rating;
    cur.n += 1;
    acc.set(sid, cur);
  }
  for (const [sid, { sum, n }] of acc) {
    out.set(sid, { rating: n > 0 ? Math.round((sum / n) * 10) / 10 : 0, reviewCount: n });
  }
  return out;
}

/** id ຂອງ 8 ບໍລິການທີ່ຖືກຈອງຫຼາຍທີ່ສຸດ (ໃຊ້ mark `popular`). */
async function popularServiceIds(): Promise<Set<string>> {
  const rows = await prisma.service.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { appointments: { _count: 'desc' } },
    take: 8,
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** ໝວດໝູ່ບໍລິການທັງໝົດ ພ້ອມຈຳນວນບໍລິການທີ່ເປີດໃຫ້ບໍລິການ. */
export async function listCategories(): Promise<ServiceCategoryView[]> {
  const [categories, grouped] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.service.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    }),
  ]);
  const countByCategory = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: c.imageUrl,
    serviceCount: countByCategory.get(c.id) ?? 0,
  }));
}

/** ລາຍການບໍລິການ — ຮອງຮັບ filter ຕາມສາຂາ/ໝວດ, ຄົ້ນຫາຕາມຊື່, ແລະ ຈັດຮຽງ "ຍອດນິຍົມ". */
export async function listServices(
  query: ServiceListQuery,
): Promise<Paginated<ServiceListItem>> {
  const priceFilter: Prisma.DecimalFilter = {};
  if (query.priceMin != null) priceFilter.gte = query.priceMin;
  if (query.priceMax != null) priceFilter.lte = query.priceMax;

  const where: Prisma.ServiceWhereInput = {
    deletedAt: null,
    isActive: true,
    ...(query.branchId ? { OR: [{ branchId: query.branchId }, { branchId: null }] } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    ...(Object.keys(priceFilter).length > 0 ? { price: priceFilter } : {}),
    ...(query.durationMax != null ? { durationMinutes: { lte: query.durationMax } } : {}),
    ...(query.requireDeposit === true ? { requireDeposit: true } : {}),
  };

  // `sort` ໃໝ່ ແທນ `popular` flag ເກົ່າ (ຍັງຮອງຮັບ flag ເພື່ອ back-compat).
  const sort = query.sort ?? (query.popular ? 'popular' : 'name');
  const orderBy: Prisma.ServiceOrderByWithRelationInput =
    sort === 'popular'
      ? { appointments: { _count: 'desc' } }
      : sort === 'priceAsc'
        ? { price: 'asc' }
        : sort === 'priceDesc'
          ? { price: 'desc' }
          : { name: 'asc' };

  const [rows, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.service.count({ where }),
  ]);

  const [ratings, popularIds] = await Promise.all([
    ratingByService(rows.map((r) => r.id)),
    popularServiceIds(),
  ]);

  return {
    items: rows.map((s) =>
      toServiceListItem(s, { ...ratings.get(s.id), popular: popularIds.has(s.id) }),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** ແປງ Service.steps (Json) → ServiceStep[] ຢ່າງປອດໄພ. */
function parseSteps(raw: unknown): ServiceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is { title: unknown; body: unknown } =>
        typeof x === 'object' && x !== null && 'title' in x && 'body' in x,
    )
    .map((x) => ({ title: String(x.title), body: String(x.body) }))
    .filter((x) => x.title.length > 0);
}

/** ຣີວິວລູກຄ້າລ່າສຸດທີ່ມີຂໍ້ຄວາມ ສຳລັບບໍລິການໜຶ່ງ. */
async function recentReviewsForService(serviceId: string): Promise<ServiceReviewItem[]> {
  const rows = await prisma.review.findMany({
    where: { appointment: { serviceId }, comment: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  });
  return rows
    .filter((r) => (r.comment ?? '').trim().length > 0)
    .map((r) => ({
      id: r.id,
      authorName: r.user.name,
      authorAvatarUrl: r.user.avatarUrl,
      rating: r.rating,
      comment: (r.comment ?? '').trim(),
      createdAt: r.createdAt.toISOString(),
    }));
}

/** ຈຳນວນຣີວິວຕໍ່ດາວ [5★,4★,3★,2★,1★] ຂອງບໍລິການໜຶ່ງ. */
async function ratingBreakdownForService(
  serviceId: string,
): Promise<[number, number, number, number, number]> {
  const grouped = await prisma.review.groupBy({
    by: ['rating'],
    where: { appointment: { serviceId } },
    _count: { _all: true },
  });
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const g of grouped) {
    const star = Math.min(5, Math.max(1, Math.round(g.rating)));
    out[5 - star] = (out[5 - star] ?? 0) + g._count._all;
  }
  return out;
}

const branchInfoSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  openTime: true,
  closeTime: true,
  latitude: true,
  longitude: true,
  amenities: true,
  isActive: true,
  deletedAt: true,
} as const;

type BranchInfoRow = Prisma.BranchGetPayload<{ select: typeof branchInfoSelect }>;

function toBranchInfo(b: BranchInfoRow): ServiceBranchInfo {
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    openTime: b.openTime,
    closeTime: b.closeTime,
    latitude: b.latitude,
    longitude: b.longitude,
  };
}

/** GET /catalog/branches — ສາຂາທີ່ເປີດໃຫ້ບໍລິການ (ລູກຄ້າ: ສະແດງສະຖານທີ່/ເວລາເປີດ/ແຜນທີ່). */
export async function listBranchInfo(): Promise<ServiceBranchInfo[]> {
  const rows = await prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: branchInfoSelect,
    orderBy: { name: 'asc' },
  });
  return rows.map(toBranchInfo);
}

/** GET /catalog/branches/:id — ສາຂາດຽວ (ປິດ/ລຶບແລ້ວ → 404). */
export async function getBranchInfo(id: string): Promise<ServiceBranchInfo> {
  const row = await prisma.branch.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: branchInfoSelect,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  return toBranchInfo(row);
}

/** ແພັກເກັດທີ່ເປີດຂາຍ ແລະ ມີບໍລິການນີ້ (ສູງສຸດ 3, ຖືກສຸດກ່ອນ). */
async function packagesForService(
  serviceId: string,
  branchId: string | null,
): Promise<ServicePackageOffer[]> {
  const rows = await prisma.package.findMany({
    where: {
      isActive: true,
      items: { some: { serviceId } },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { totalPrice: 'asc' },
    take: 3,
    select: {
      id: true,
      name: true,
      totalPrice: true,
      items: { select: { serviceId: true, totalUnits: true, service: { select: { price: true } } } },
    },
  });
  return rows.map((p) => {
    const totalPrice = p.totalPrice.toNumber();
    const value = p.items.reduce((sum, i) => sum + i.service.price.toNumber() * i.totalUnits, 0);
    return {
      id: p.id,
      name: p.name,
      totalPrice,
      units: p.items.find((i) => i.serviceId === serviceId)?.totalUnits ?? 1,
      itemCount: p.items.length,
      savings: Math.max(0, value - totalPrice),
    };
  });
}

/** ບໍລິການອື່ນໃນໝວດດຽວກັນ (ສູງສຸດ 6, ຍອດຈອງສູງສຸດກ່ອນ). */
async function relatedServices(
  serviceId: string,
  categoryId: string,
  branchId: string | null,
): Promise<ServiceListItem[]> {
  const rows = await prisma.service.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      categoryId,
      id: { not: serviceId },
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { appointments: { _count: 'desc' } },
    take: 6,
  });
  const [ratings, popularIds] = await Promise.all([
    ratingByService(rows.map((r) => r.id)),
    popularServiceIds(),
  ]);
  return rows.map((r) =>
    toServiceListItem(r, { ...ratings.get(r.id), popular: popularIds.has(r.id) }),
  );
}

/**
 * ລາຍລະອຽດບໍລິການ 1 ລາຍການ + ຊ່າງ + ຂັ້ນຕອນ + ຣີວິວ + ສາຂາ + ແພັກເກັດ + ບໍລິການທີ່ກ່ຽວຂ້ອງ.
 * `viewerBranchId` = ສາຂາທີ່ລູກຄ້າກຳລັງເບິ່ງ — ໃຊ້ເມື່ອບໍລິການບໍ່ຜູກສາຂາ (ເປີດທຸກສາຂາ).
 */
export async function getServiceById(
  id: string,
  viewerBranchId?: string,
): Promise<ServiceDetailView> {
  const service = await prisma.service.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { name: true } },
      branch: { select: branchInfoSelect },
      staffServices: {
        where: { staffProfile: { isActive: true, deletedAt: null } },
        include: {
          staffProfile: {
            include: { user: { select: { name: true, avatarUrl: true } } },
          },
        },
      },
    },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  const staff: StaffSummary[] = service.staffServices.map((ss) => ({
    id: ss.staffProfile.id,
    name: ss.staffProfile.user.name,
    title: ss.staffProfile.title,
    avatarUrl: ss.staffProfile.user.avatarUrl,
    rating: ss.staffProfile.rating,
    totalReviews: ss.staffProfile.totalReviews,
  }));

  const viewerBranch =
    !service.branch && viewerBranchId
      ? await prisma.branch.findFirst({
          where: { id: viewerBranchId, isActive: true, deletedAt: null },
          select: branchInfoSelect,
        })
      : null;
  const branch = service.branch ?? viewerBranch;
  const scopeBranchId = branch?.id ?? null;

  const [ratingMap, reviews, breakdown, completedCount, packages, related] = await Promise.all([
    ratingByService([service.id]),
    recentReviewsForService(service.id),
    ratingBreakdownForService(service.id),
    prisma.appointment.count({
      where: { serviceId: service.id, status: 'COMPLETED', deletedAt: null },
    }),
    packagesForService(service.id, scopeBranchId),
    relatedServices(service.id, service.categoryId, scopeBranchId),
  ]);

  return {
    ...toServiceListItem(service, ratingMap.get(service.id)),
    isActive: service.isActive,
    staff,
    steps: parseSteps(service.steps),
    reviews,
    amenities: branch?.amenities ?? [],
    ratingBreakdown: breakdown,
    completedCount,
    branch: branch ? toBranchInfo(branch) : null,
    packages,
    related,
  };
}
