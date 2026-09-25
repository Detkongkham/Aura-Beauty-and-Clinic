import type {
  AccessTokenPayload,
  ProductCategoryListQuery,
  ProductCategoryUpdateInput,
  ProductCategoryView,
  ProductCategoryWriteInput,
  ProductUomConversionInput,
  UomListQuery,
  UomUpdateInput,
  UomView,
  UomWriteInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Inventory audit ຄື້ນ 9C — ຂໍ້ມູນຫຼັກ: M1 ໜ່ວຍນັບ + ອັດຕາແປງ, M3 ໝວດສິນຄ້າ.
 *
 * ຫຼັກການ M1: **ທຸກຈຳນວນທີ່ເກັບໃນສະຕັອກ/ledger/lot/ການຈອງ ເປັນໜ່ວຍພື້ນຖານ** (Product.baseUomId). ການແປງເກີດສະເພາະ
 * ຕອນ input: PO (`itemsToBase`), GRN (`postGoodsReceipt`), ລາຍການລາຄາ (upsertSupplierProduct), BOM (`syncConsumables`
 * ເກັບ uom + factor snapshot, ຕັດ/ຈອງ = qtyPerUse × factor ຜ່ານ `bomBaseQty`).
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Auth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'> | null;

/** Decimal(16,6) ຂອງອັດຕາແປງ. */
export function factorDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(6));
}
export function factorNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 1;
  const n = typeof v === 'number' ? v : v.toNumber();
  return n > 0 ? n : 1;
}

/** M1 — ຈຳນວນ BOM ເປັນໜ່ວຍພື້ນຖານ (qtyPerUse ເປັນໜ່ວຍ BOM × factor snapshot; ແຖວເກົ່າ factor = 1). */
export function bomBaseQty(c: {
  qtyPerUse: Prisma.Decimal | number;
  factorToBase?: Prisma.Decimal | number | null;
}): number {
  const q = typeof c.qtyPerUse === 'number' ? c.qtyPerUse : c.qtyPerUse.toNumber();
  const n = q * factorNum(c.factorToBase);
  return Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;
}

// ============================================================ Uom

const UOM_INCLUDE = {
  _count: { select: { baseProducts: { where: { deletedAt: null } } } },
} satisfies Prisma.UomInclude;
type UomRow = Prisma.UomGetPayload<{ include: typeof UOM_INCLUDE }>;

function toUomView(u: UomRow): UomView {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    nameLo: u.nameLo,
    isActive: u.isActive,
    productCount: u._count.baseProducts,
  };
}

export async function listUoms(q: UomListQuery = {}): Promise<UomView[]> {
  const rows = await prisma.uom.findMany({
    where: q.includeInactive === 'true' ? {} : { isActive: true },
    include: UOM_INCLUDE,
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  });
  return rows.map(toUomView);
}

export async function createUom(input: UomWriteInput): Promise<UomView> {
  const dup = await prisma.uom.findUnique({ where: { code: input.code } });
  if (dup) throw ApiError.conflict(`ລະຫັດໜ່ວຍ "${input.code}" ມີຢູ່ແລ້ວ`);
  const u = await prisma.uom.create({
    data: {
      code: input.code,
      name: input.name,
      nameLo: input.nameLo ?? null,
      isActive: input.isActive ?? true,
    },
    include: UOM_INCLUDE,
  });
  return toUomView(u);
}

export async function updateUom(id: string, input: UomUpdateInput): Promise<UomView> {
  const cur = await prisma.uom.findUnique({ where: { id } });
  if (!cur) throw ApiError.notFound('ບໍ່ພົບໜ່ວຍ');
  if (input.code && input.code !== cur.code) {
    const dup = await prisma.uom.findUnique({ where: { code: input.code } });
    if (dup) throw ApiError.conflict(`ລະຫັດໜ່ວຍ "${input.code}" ມີຢູ່ແລ້ວ`);
  }
  const u = await prisma.uom.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameLo !== undefined ? { nameLo: input.nameLo } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: UOM_INCLUDE,
  });
  return toUomView(u);
}

/**
 * M1 back-compat — ຫາ Uom ຈາກຂໍ້ຄວາມ `unit` (ກົງ code → name → nameLo, ບໍ່ສົນຕົວພິມ) ຫຼື ສ້າງໃໝ່ (code = ຂໍ້ຄວາມຕົວພິມນ້ອຍ).
 * ກົດດຽວກັບ backfill ໃນ migration `20260925210000_inventory_uom_barcode_category`.
 */
export async function uomIdForUnitText(db: Db, text: string): Promise<string> {
  const t = text.trim();
  const lower = t.toLowerCase();
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "uoms"
     WHERE ${lower} IN (lower(code), lower(name), lower(coalesce("nameLo", '')))
     ORDER BY (lower(code) = ${lower}) DESC, "createdAt" ASC
     LIMIT 1`;
  if (rows[0]) return rows[0].id;
  const created = await db.uom.upsert({
    where: { code: lower },
    update: {},
    create: { code: lower, name: t },
    select: { id: true },
  });
  return created.id;
}

// ============================================================ Product conversions

export type UomFactor = { uomId: string | null; factor: number };

/**
 * M1 — ແປງ (productId, uomId) → ອັດຕາຫາໜ່ວຍພື້ນຖານ. uomId null/undefined ຫຼື = baseUomId → factor 1.
 * ໜ່ວຍທີ່ສິນຄ້າບໍ່ມີອັດຕາແປງ → 400 (ບໍ່ເດົາ).
 */
export async function resolveUomFactors(
  db: Db,
  pairs: { productId: string; uomId?: string | null }[],
): Promise<UomFactor[]> {
  const need = pairs.filter((p) => p.uomId);
  if (!need.length) return pairs.map(() => ({ uomId: null, factor: 1 }));
  const productIds = [...new Set(need.map((p) => p.productId))];
  const [products, convs] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, baseUomId: true },
    }),
    db.productUomConversion.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, uomId: true, factorToBase: true, uom: { select: { code: true } } },
    }),
  ]);
  const productBy = new Map(products.map((p) => [p.id, p]));
  const convBy = new Map(convs.map((c) => [`${c.productId}|${c.uomId}`, c]));
  return pairs.map((p) => {
    if (!p.uomId) return { uomId: null, factor: 1 };
    const prod = productBy.get(p.productId);
    if (prod?.baseUomId === p.uomId) return { uomId: p.uomId, factor: 1 };
    const c = convBy.get(`${p.productId}|${p.uomId}`);
    if (!c) {
      throw ApiError.badRequest(
        `ສິນຄ້າ "${prod?.name ?? p.productId}" ບໍ່ມີອັດຕາແປງສຳລັບໜ່ວຍທີ່ເລືອກ — ຕັ້ງອັດຕາແປງໃນຟອມສິນຄ້າກ່ອນ`,
      );
    }
    return { uomId: p.uomId, factor: factorNum(c.factorToBase) };
  });
}

/**
 * M1 — ແທນທີ່ອັດຕາແປງທັງຊຸດຂອງສິນຄ້າ (upsert ຕາມ uomId). ໜ່ວຍທີ່ເອົາອອກ ແຕ່ຍັງຖືກໃຊ້ໃນ BOM / ລາຍການລາຄາ /
 * ແຖວ PO ທີ່ຍັງເປີດ → 409. ອັດຕາທີ່ປ່ຽນ → ອັບເດດ snapshot ຂອງຂໍ້ມູນຫຼັກ (BOM + ລາຍການລາຄາ) ຕາມ; PO/GRN ເກົ່າຮັກສາ snapshot ເດີມ.
 */
export async function syncProductConversions(
  tx: Prisma.TransactionClient,
  productId: string,
  baseUomId: string | null,
  rows: ProductUomConversionInput[],
): Promise<void> {
  if (baseUomId && rows.some((r) => r.uomId === baseUomId)) {
    throw ApiError.badRequest('ໜ່ວຍພື້ນຖານບໍ່ຕ້ອງໃສ່ໃນອັດຕາແປງ (factor = 1 ສະເໝີ)');
  }
  if (rows.length) {
    const found = await tx.uom.count({ where: { id: { in: rows.map((r) => r.uomId) } } });
    if (found !== rows.length) throw ApiError.badRequest('ມີໜ່ວຍທີ່ບໍ່ພົບໃນອັດຕາແປງ');
  }
  const existing = await tx.productUomConversion.findMany({ where: { productId } });
  const keep = new Set(rows.map((r) => r.uomId));
  const removed = existing.filter((e) => !keep.has(e.uomId));
  if (removed.length) {
    const ids = removed.map((r) => r.uomId);
    const [bom, sp, po] = await Promise.all([
      tx.serviceConsumable.count({
        where: { productId, uomId: { in: ids }, service: { deletedAt: null } },
      }),
      tx.supplierProduct.count({ where: { productId, uomId: { in: ids } } }),
      tx.purchaseOrderItem.count({
        where: {
          productId,
          uomId: { in: ids },
          purchaseOrder: {
            status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] },
          },
        },
      }),
    ]);
    const reasons = [
      bom ? `BOM ${bom}` : '',
      sp ? `ລາຍການລາຄາ ${sp}` : '',
      po ? `PO ທີ່ເປີດ ${po}` : '',
    ].filter(Boolean);
    if (reasons.length)
      throw ApiError.conflict(`ລຶບອັດຕາແປງບໍ່ໄດ້ — ຍັງຖືກໃຊ້ຢູ່ (${reasons.join(', ')})`);
    await tx.productUomConversion.deleteMany({ where: { productId, uomId: { in: ids } } });
  }
  const byUom = new Map(existing.map((e) => [e.uomId, e]));
  for (const r of rows) {
    const data = {
      factorToBase: factorDec(r.factorToBase),
      isPurchaseDefault: r.isPurchaseDefault,
      isConsumeDefault: r.isConsumeDefault,
    };
    const prev = byUom.get(r.uomId);
    if (!prev) {
      await tx.productUomConversion.create({ data: { ...data, productId, uomId: r.uomId } });
      continue;
    }
    await tx.productUomConversion.update({ where: { id: prev.id }, data });
    if (Math.abs(factorNum(prev.factorToBase) - r.factorToBase) > 1e-9) {
      await tx.serviceConsumable.updateMany({
        where: { productId, uomId: r.uomId },
        data: { factorToBase: data.factorToBase },
      });
      await tx.supplierProduct.updateMany({
        where: { productId, uomId: r.uomId },
        data: { factorToBase: data.factorToBase },
      });
    }
  }
}

// ============================================================ Categories (M3)

const CAT_INCLUDE = {
  parent: { select: { name: true } },
  branch: { select: { name: true } },
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.ProductCategoryInclude;
type CatRow = Prisma.ProductCategoryGetPayload<{ include: typeof CAT_INCLUDE }>;

function toCategoryView(c: CatRow): ProductCategoryView {
  return {
    id: c.id,
    name: c.name,
    nameLo: c.nameLo,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    branchId: c.branchId,
    branchName: c.branch?.name ?? null,
    productCount: c._count.products,
  };
}

/** ໝວດທີ່ສາຂາເຫັນ = ໃຊ້ຮ່ວມ (branchId null) + ຂອງສາຂານັ້ນ. */
function categoryScope(branchId: string | null | undefined): Prisma.ProductCategoryWhereInput {
  return branchId ? { OR: [{ branchId: null }, { branchId }] } : {};
}

export async function listProductCategories(
  q: ProductCategoryListQuery,
  auth: Auth = null,
): Promise<ProductCategoryView[]> {
  if (auth?.branchId && q.branchId && q.branchId !== auth.branchId)
    throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  const rows = await prisma.productCategory.findMany({
    where: {
      ...categoryScope(auth?.branchId ?? q.branchId),
      ...(q.includeInactive === 'true' ? {} : { isActive: true }),
    },
    include: CAT_INCLUDE,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toCategoryView);
}

function assertCategoryWrite(auth: Auth, branchId: string | null): void {
  if (auth?.role === 'SUPER_ADMIN') return;
  if (!branchId) throw ApiError.forbidden('ໝວດທີ່ໃຊ້ຮ່ວມທົ່ວອົງກອນ ແກ້ໄດ້ສະເພາະ SUPER_ADMIN');
  if (auth?.branchId && auth.branchId !== branchId)
    throw ApiError.forbidden('ແກ້ໄຂໄດ້ສະເພາະໝວດຂອງສາຂາຂອງທ່ານ');
}

async function assertParent(
  db: Db,
  parentId: string | null | undefined,
  selfId: string | null,
  branchId: string | null,
): Promise<void> {
  if (!parentId) return;
  if (parentId === selfId) throw ApiError.badRequest('ໝວດເປັນແມ່ຂອງຕົນເອງບໍ່ໄດ້');
  const parent = await db.productCategory.findUnique({
    where: { id: parentId },
    select: { parentId: true, branchId: true },
  });
  if (!parent) throw ApiError.badRequest('ບໍ່ພົບໝວດແມ່');
  if (parent.parentId) throw ApiError.badRequest('ຊ້ອນໝວດໄດ້ສະເພາະ 1 ຊັ້ນ (ໝວດແມ່ຕ້ອງເປັນໝວດຫຼັກ)');
  if (parent.branchId && parent.branchId !== branchId)
    throw ApiError.badRequest('ໝວດແມ່ເປັນຂອງສາຂາອື່ນ');
  if (selfId) {
    const kids = await db.productCategory.count({ where: { parentId: selfId } });
    if (kids > 0)
      throw ApiError.badRequest('ໝວດນີ້ມີໝວດຍ່ອຍ — ຍ້າຍໄປເປັນໝວດຍ່ອຍບໍ່ໄດ້ (ຊ້ອນໄດ້ 1 ຊັ້ນ)');
  }
}

export async function createProductCategory(
  input: ProductCategoryWriteInput,
  auth: Auth = null,
): Promise<ProductCategoryView> {
  const branchId =
    input.branchId !== undefined
      ? input.branchId
      : auth?.role === 'SUPER_ADMIN'
        ? null
        : (auth?.branchId ?? null);
  assertCategoryWrite(auth, branchId);
  await assertParent(prisma, input.parentId, null, branchId);
  const c = await prisma.productCategory.create({
    data: {
      name: input.name,
      nameLo: input.nameLo ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      branchId,
    },
    include: CAT_INCLUDE,
  });
  return toCategoryView(c);
}

export async function updateProductCategory(
  id: string,
  input: ProductCategoryUpdateInput,
  auth: Auth = null,
): Promise<ProductCategoryView> {
  const cur = await prisma.productCategory.findUnique({ where: { id } });
  if (!cur) throw ApiError.notFound('ບໍ່ພົບໝວດ');
  assertCategoryWrite(auth, cur.branchId);
  const branchId = input.branchId !== undefined ? input.branchId : cur.branchId;
  if (branchId !== cur.branchId) assertCategoryWrite(auth, branchId);
  if (input.parentId !== undefined) await assertParent(prisma, input.parentId, id, branchId);
  const c = await prisma.productCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameLo !== undefined ? { nameLo: input.nameLo } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.branchId !== undefined ? { branchId } : {}),
    },
    include: CAT_INCLUDE,
  });
  return toCategoryView(c);
}

/** ລຶບໄດ້ສະເພາະໝວດທີ່ບໍ່ມີສິນຄ້າ (ລວມທີ່ຖືກ soft-delete ບໍ່ນັບ) ແລະ ບໍ່ມີໝວດຍ່ອຍ — ບໍ່ດັ່ງນັ້ນໃຫ້ປິດ (isActive) ແທນ. */
export async function deleteProductCategory(id: string, auth: Auth = null): Promise<void> {
  const cur = await prisma.productCategory.findUnique({ where: { id }, include: CAT_INCLUDE });
  if (!cur) throw ApiError.notFound('ບໍ່ພົບໝວດ');
  assertCategoryWrite(auth, cur.branchId);
  const kids = await prisma.productCategory.count({ where: { parentId: id } });
  if (cur._count.products > 0 || kids > 0) {
    throw ApiError.conflict('ລຶບໝວດບໍ່ໄດ້ — ຍັງມີສິນຄ້າ ຫຼື ໝວດຍ່ອຍ (ປິດການໃຊ້ງານແທນ)');
  }
  await prisma.productCategory.delete({ where: { id } });
}

/** ໝວດ + ໝວດຍ່ອຍ (ສຳລັບຕົວກັ່ນ "ໝວດຫຼັກ = ລວມໝວດຍ່ອຍ"). */
export async function categoryIdsWithChildren(db: Db, id: string): Promise<string[]> {
  const kids = await db.productCategory.findMany({ where: { parentId: id }, select: { id: true } });
  return [id, ...kids.map((k) => k.id)];
}

/** ກວດວ່າ categoryId ໃຊ້ໄດ້ກັບສິນຄ້າຂອງສາຂານີ້ (ໃຊ້ຮ່ວມ ຫຼື ຂອງສາຂາດຽວກັນ). */
export async function assertCategoryForBranch(
  db: Db,
  categoryId: string | null | undefined,
  branchId: string,
): Promise<void> {
  if (!categoryId) return;
  const c = await db.productCategory.findUnique({
    where: { id: categoryId },
    select: { branchId: true },
  });
  if (!c) throw ApiError.badRequest('ບໍ່ພົບໝວດສິນຄ້າ');
  if (c.branchId && c.branchId !== branchId)
    throw ApiError.badRequest('ໝວດສິນຄ້ານີ້ເປັນຂອງສາຂາອື່ນ');
}

/** ຊື່ໝວດສະແດງຜົນ: "ແມ່ › ລູກ". */
export function categoryLabel(
  c: { name: string; parent?: { name: string } | null } | null | undefined,
): string | null {
  if (!c) return null;
  return c.parent ? `${c.parent.name} › ${c.name}` : c.name;
}
