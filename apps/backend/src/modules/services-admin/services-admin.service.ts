import type {
  AdminServiceCategoryView,
  AdminServiceCreateInput,
  AdminServiceListQuery,
  AdminServiceUpdateInput,
  AdminServiceView,
  Paginated,
  ServiceCategoryWriteInput,
  ServiceImageUploadInput,
  ServiceStatsView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';
import { storage } from '../../storage/index.js';
import { storageKeyFromUrl } from '../../storage/signedUrl.js';
import { parseSteps } from '../catalog/catalog.service.js';
import { bomBaseQty, factorDec, factorNum, resolveUomFactors } from '../inventory/inventory-master.service.js';

const SERVICE_INCLUDE = {
  category: { select: { name: true } },
  branch: { select: { name: true } },
  consumables: {
    include: {
      product: { select: { name: true, unit: true, stockQty: true, minStockQty: true } },
      uom: { select: { code: true } },
    },
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
    steps: parseSteps(s.steps),
    requireDeposit: s.requireDeposit,
    depositAmount: s.depositAmount ? s.depositAmount.toNumber() : null,
    isActive: s.isActive,
    consumables: s.consumables.map((c) => ({
      productId: c.productId,
      productName: c.product.name,
      qtyPerUse: c.qtyPerUse.toNumber(),
      unit: c.product.unit,
      uomId: c.uomId,
      uomCode: c.uom?.code ?? null,
      factorToBase: factorNum(c.factorToBase),
      baseQtyPerUse: bomBaseQty(c),
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
  // M1 — BOM ຂຽນເປັນໜ່ວຍໃດກໍໄດ້ທີ່ສິນຄ້າມີອັດຕາແປງ (ເຊັ່ນ ml) → ເກັບ uom + factor snapshot; ການຕັດ/ຈອງແປງເປັນໜ່ວຍພື້ນຖານ.
  const factors = await resolveUomFactors(tx, consumables);
  const rows = consumables.map((c, i) => ({
    serviceId,
    productId: c.productId,
    qtyPerUse: c.qtyPerUse,
    uomId: factors[i]!.uomId,
    factorToBase: factorDec(factors[i]!.factor),
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
        ...(input.steps?.length ? { steps: input.steps } : {}),
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
  const before = await findService(id);
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
        ...(input.steps !== undefined ? { steps: input.steps.length ? input.steps : Prisma.DbNull } : {}),
        ...(input.requireDeposit !== undefined ? { requireDeposit: input.requireDeposit } : {}),
        ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    if (input.consumables !== undefined) await syncConsumables(tx, id, input.consumables);
  });
  if (input.imageUrl !== undefined && before.imageUrl && before.imageUrl !== input.imageUrl) {
    await releaseServiceImage(before.imageUrl);
  }
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
  const before = await prisma.serviceCategory.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  await prisma.serviceCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
    },
  });
  if (input.imageUrl !== undefined && before.imageUrl && before.imageUrl !== input.imageUrl) {
    await releaseServiceImage(before.imageUrl);
  }
  return categoryView(id);
}

export async function deleteCategory(id: string): Promise<void> {
  const count = await prisma.service.count({ where: { categoryId: id, deletedAt: null } });
  if (count > 0) throw ApiError.conflict('ໝວດໝູ່ນີ້ຍັງມີບໍລິການຢູ່');
  const existing = await prisma.serviceCategory.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບໝວດໝູ່');
  await prisma.serviceCategory.delete({ where: { id } });
  if (existing.imageUrl) await releaseServiceImage(existing.imageUrl);
}

// ---- images -------------------------------------------------------------

const MAX_SERVICE_IMAGE_BYTES = 5 * 1024 * 1024;
const EXT_BY_IMAGE_TYPE: Record<ServiceImageUploadInput['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** ກວດ magic bytes ໃຫ້ກົງກັບ contentType — ກັນໄຟລ໌ອື່ນປອມເປັນຮູບ. */
function matchesImageSignature(buf: Buffer, type: ServiceImageUploadInput['contentType']): boolean {
  switch (type) {
    case 'image/jpeg':
      return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  }
}

/** ບັນທຶກຮູບບໍລິການ ແລ້ວຄືນ URL (ຍັງບໍ່ຜູກກັບ service — ຟອມຈະສົ່ງ URL ນີ້ໃນ imageUrl ຕອນບັນທຶກ). */
export async function uploadServiceImage(input: ServiceImageUploadInput): Promise<{ url: string }> {
  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ໄຟລ໌ບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_SERVICE_IMAGE_BYTES) throw ApiError.badRequest('ຮູບໃຫຍ່ເກີນ 5MB');
  if (!matchesImageSignature(buffer, input.contentType)) throw ApiError.badRequest('ໄຟລ໌ບໍ່ແມ່ນຮູບທີ່ຮອງຮັບ');
  const key = `services/${randomUUID()}.${EXT_BY_IMAGE_TYPE[input.contentType]}`;
  const { url } = await storage.save(key, buffer, input.contentType);
  return { url };
}

// ---- image lifecycle (ບໍ່ໃຫ້ໄຟລ໌ກຳພ້າຄ້າງໃນ storage) ---------------------------

/** ສະເພາະໄຟລ໌ທີ່ uploadServiceImage ສ້າງ — ຮູບແບບເຂັ້ມງວດ ກັນ path traversal / ລຶບໄຟລ໌ອື່ນ. */
const MANAGED_IMAGE_KEY = /^services\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
/** ຮູບທີ່ອັບໂຫລດແລ້ວແຕ່ບໍ່ໄດ້ຜູກກັບແຖວໃດ ເກີນເວລານີ້ = ກຳພ້າ (ຟອມທີ່ເປີດຄ້າງໄວ້ດົນກວ່ານີ້ແມ່ນບໍ່ປົກກະຕິ). */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

function managedImageKey(url: string): string | null {
  const key = storageKeyFromUrl(url);
  return key && MANAGED_IMAGE_KEY.test(key) ? key : null;
}

/** ຍັງມີແຖວໃດອ້າງອີງໄຟລ໌ນີ້ບໍ — ລວມບໍລິການທີ່ soft-delete ແລະ ແພັກເກັດ (admin ອາດວາງລິ້ງດຽວກັນ). */
async function isImageReferenced(key: string): Promise<boolean> {
  const where = { imageUrl: { contains: key } };
  const like = `%${key}%`;
  const [services, categories, packages, branches] = await Promise.all([
    prisma.service.count({ where }),
    prisma.serviceCategory.count({ where }),
    prisma.package.count({ where }),
    // Wave 11 — ຮູບໜ້າປົກ/ຄັງຮູບສາຂາ ອັບໂຫລດຜ່ານ endpoint ດຽວກັນ.
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "branches"
      WHERE "coverImageUrl" LIKE ${like} OR array_to_string("photoUrls", ' ') LIKE ${like}`.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  return services + categories + packages + branches > 0;
}

/**
 * ລຶບໄຟລ໌ຮູບຖ້າເປັນຂອງເຮົາ ແລະ ບໍ່ມີແຖວໃດໃຊ້ແລ້ວ. ລິ້ງພາຍນອກ / ໄຟລ໌ທີ່ຍັງຖືກໃຊ້ = ບໍ່ແຕະ.
 * ບໍ່ throw — ການລ້າງໄຟລ໌ລົ້ມເຫຼວບໍ່ຄວນເຮັດໃຫ້ການບັນທຶກລົ້ມ (sweep ປະຈຳວັນຈະເກັບຕົກຄ້າງ).
 */
export async function releaseServiceImage(url: string): Promise<boolean> {
  const key = managedImageKey(url);
  if (!key) return false;
  try {
    if (await isImageReferenced(key)) return false;
    await storage.delete(key);
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'service image cleanup failed');
    return false;
  }
}

/** Job ປະຈຳວັນ: ລຶບຮູບໃນ services/ ທີ່ເກົ່າກວ່າ 24 ຊົ່ວໂມງ ແລະ ບໍ່ມີແຖວໃດອ້າງອີງ. */
export async function sweepOrphanServiceImages(now = new Date()): Promise<{ scanned: number; deleted: number }> {
  const files = await storage.list('services/');
  const cutoff = now.getTime() - ORPHAN_GRACE_MS;
  let deleted = 0;
  for (const f of files) {
    if (f.modifiedAt.getTime() > cutoff || !MANAGED_IMAGE_KEY.test(f.key)) continue;
    if (await isImageReferenced(f.key)) continue;
    await storage.delete(f.key);
    deleted++;
  }
  return { scanned: files.length, deleted };
}
