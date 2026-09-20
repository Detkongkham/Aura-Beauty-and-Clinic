import type {
  AdminServiceCategoryView,
  AdminServiceCreateInput,
  AdminServiceListQuery,
  AdminServiceUpdateInput,
  AdminServiceView,
  Paginated,
  ServiceCategoryWriteInput,
  ServiceStatsView,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const SERVICE_INCLUDE = {
  category: { select: { name: true } },
  branch: { select: { name: true } },
  consumables: {
    include: { product: { select: { name: true, unit: true, stockQty: true, minStockQty: true } } },
  },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

function toServiceView(s: ServiceRow): AdminServiceView {
  return {
    id: s.id,
    categoryId: s.categoryId,
    categoryName: s.category.name,
    branchId: s.branchId,
    branchName: s.branch?.name ?? null,
    name: s.name,
    description: s.description,
    price: s.price.toNumber(),
    compareAtPrice: s.compareAtPrice ? s.compareAtPrice.toNumber() : null,
    currency: 'LAK',
    durationMinutes: s.durationMinutes,
    imageUrl: s.imageUrl,
    highlights: s.highlights,
    requireDeposit: s.requireDeposit,
    depositAmount: s.depositAmount ? s.depositAmount.toNumber() : null,
    isActive: s.isActive,
    consumables: s.consumables.map((c) => ({
      productId: c.productId,
      productName: c.product.name,
      qtyPerUse: c.qtyPerUse.toNumber(),
      unit: c.product.unit,
      stockQty: c.product.stockQty.toNumber(),
      lowStock: c.product.stockQty.toNumber() <= c.product.minStockQty.toNumber(),
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** GET /services — ລາຍການບໍລິການ (admin, ແບ່ງໜ້າ + filter). */
export async function listServices(
  query: AdminServiceListQuery,
): Promise<Paginated<AdminServiceView>> {
  const where: Prisma.ServiceWhereInput = {
    deletedAt: null,
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: SERVICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.service.count({ where }),
  ]);
  return {
    items: rows.map(toServiceView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** GET /services/stats — KPI strip. */
export async function serviceStats(): Promise<ServiceStatsView> {
  const [all, categories] = await Promise.all([
    prisma.service.findMany({
      where: { deletedAt: null },
      select: { price: true, durationMinutes: true, isActive: true, requireDeposit: true, categoryId: true },
    }),
    prisma.serviceCategory.findMany({ select: { id: true, name: true } }),
  ]);
  const total = all.length;
  const active = all.filter((s) => s.isActive).length;
  const avgPrice = total ? Math.round(all.reduce((s, x) => s + x.price.toNumber(), 0) / total) : 0;
  const avgDuration = total
    ? Math.round(all.reduce((s, x) => s + x.durationMinutes, 0) / total)
    : 0;
  const byCategory = categories
    .map((c) => ({ id: c.id, name: c.name, count: all.filter((s) => s.categoryId === c.id).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    total,
    active,
    inactive: total - active,
    withDeposit: all.filter((s) => s.requireDeposit).length,
    avgPrice,
    avgDuration,
    byCategory,
  };
}

async function findService(id: string): Promise<ServiceRow> {
  const row = await prisma.service.findFirst({ where: { id, deletedAt: null }, include: SERVICE_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');
  return row;
}

export async function getService(id: string): Promise<AdminServiceView> {
  return toServiceView(await findService(id));
}

/**
 * BOM lines — every line must reference a real, non-deleted Product (Module 14).
 * Unknown productIds are rejected (400) rather than silently dropped.
 */
async function syncConsumables(
  tx: Prisma.TransactionClient,
  serviceId: string,
  consumables: NonNullable<AdminServiceCreateInput['consumables']>,
): Promise<void> {
  await tx.serviceConsumable.deleteMany({ where: { serviceId } });
  if (consumables.length === 0) return;
  const ids = [...new Set(consumables.map((c) => c.productId))];
  const real = await tx.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  const realIds = new Set(real.map((p) => p.id));
  const missing = ids.filter((id) => !realIds.has(id));
  if (missing.length > 0) {
    throw ApiError.badRequest(`BOM ອ້າງອີງສິນຄ້າທີ່ບໍ່ພົບ: ${missing.join(', ')}`);
  }
  const rows = consumables.map((c) => ({
    serviceId,
    productId: c.productId,
    qtyPerUse: c.qtyPerUse,
  }));
  await tx.serviceConsumable.createMany({ data: rows, skipDuplicates: true });
}

export async function createService(input: AdminServiceCreateInput): Promise<AdminServiceView> {
  const category = await prisma.serviceCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');

  const created = await prisma.$transaction(async (tx) => {
    const s = await tx.service.create({
      data: {
        categoryId: input.categoryId,
        branchId: input.branchId ?? null,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        durationMinutes: input.durationMinutes,
        imageUrl: input.imageUrl ?? null,
        highlights: input.highlights ?? [],
        requireDeposit: input.requireDeposit,
        depositAmount: input.requireDeposit ? (input.depositAmount ?? null) : null,
        isActive: input.isActive,
      },
    });
    if (input.consumables) await syncConsumables(tx, s.id, input.consumables);
    return s;
  });
  return getService(created.id);
}

export async function updateService(
  id: string,
  input: AdminServiceUpdateInput,
): Promise<AdminServiceView> {
  await findService(id);
  if (input.categoryId) {
    const category = await prisma.serviceCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  }
  await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice ?? null } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
        ...(input.highlights !== undefined ? { highlights: input.highlights ?? [] } : {}),
        ...(input.requireDeposit !== undefined ? { requireDeposit: input.requireDeposit } : {}),
        ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    if (input.consumables !== undefined) await syncConsumables(tx, id, input.consumables);
  });
  return getService(id);
}

/** DELETE /services/:id — soft delete. */
export async function deleteService(id: string): Promise<void> {
  await findService(id);
  await prisma.service.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

// ---- categories -----------------------------------------------------

async function categoryView(id: string): Promise<AdminServiceCategoryView> {
  const [cat, count, all] = await Promise.all([
    prisma.serviceCategory.findUnique({ where: { id } }),
    prisma.service.count({ where: { categoryId: id, deletedAt: null } }),
    prisma.serviceCategory.findMany({ select: { id: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!cat) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  return {
    id: cat.id,
    name: cat.name,
    imageUrl: cat.imageUrl,
    serviceCount: count,
    sortOrder: all.findIndex((c) => c.id === id),
  };
}

export async function listCategories(): Promise<{ items: AdminServiceCategoryView[] }> {
  const [cats, grouped] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.service.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const countBy = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  return {
    items: cats.map((c, i) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      serviceCount: countBy.get(c.id) ?? 0,
      sortOrder: i,
    })),
  };
}

export async function createCategory(
  input: ServiceCategoryWriteInput,
): Promise<AdminServiceCategoryView> {
  const cat = await prisma.serviceCategory.create({
    data: { name: input.name, imageUrl: input.imageUrl ?? null },
  });
  return categoryView(cat.id);
}

export async function updateCategory(
  id: string,
  input: Partial<ServiceCategoryWriteInput>,
): Promise<AdminServiceCategoryView> {
  await prisma.serviceCategory.findUnique({ where: { id } }).then((c) => {
    if (!c) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  });
  await prisma.serviceCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
    },
  });
  return categoryView(id);
}

export async function deleteCategory(id: string): Promise<void> {
  const count = await prisma.service.count({ where: { categoryId: id, deletedAt: null } });
  if (count > 0) throw ApiError.conflict('ໝວດໝູ່ນີ້ຍັງມີບໍລິການຢູ່');
  const existing = await prisma.serviceCategory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  await prisma.serviceCategory.delete({ where: { id } });
}
