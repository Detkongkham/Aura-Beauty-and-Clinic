import { randomBytes } from 'node:crypto';
import type {
  InventoryStatsView,
  Paginated,
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
  ProductView,
  PurchaseOrderCreateInput,
  PurchaseOrderListQuery,
  PurchaseOrderUpdateInput,
  PurchaseOrderView,
  StockAdjustInput,
  StockMovementListQuery,
  StockMovementStatsQuery,
  StockMovementStatsView,
  StockMovementTypeValue,
  StockMovementView,
  StockTransferCreateInput,
  StockTransferListQuery,
  StockTransferView,
  SupplierListQuery,
  SupplierView,
  SupplierWriteInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

type Tx = Prisma.TransactionClient;

/**
 * BRANCH_ADMIN (authBranchId != null) ແກ້ໄຂໄດ້ສະເພາະສະຕັອກຂອງສາຂາຕົນ;
 * SUPER_ADMIN (authBranchId == null) ບໍ່ຈຳກັດ. ໃຊ້ກັບ write ເທົ່ານັ້ນ — read ບໍ່ຈຳກັດ.
 */
function assertBranchScope(authBranchId: string | null | undefined, targetBranchId: string): void {
  if (authBranchId && authBranchId !== targetBranchId) {
    throw ApiError.forbidden('ແກ້ໄຂໄດ້ສະເພາະສະຕັອກຂອງສາຂາຂອງທ່ານ');
  }
}

/** ຈຳນວນ → Decimal(3dp) (ສະຕັອກ/BOM ຮອງຮັບເສດ). */
function qdec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(3));
}
/** Decimal|number → number (3dp, ຕັດ -0). */
function qnum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;
}
function money(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 100) / 100 || 0;
}

/**
 * C1 (audit ຄື້ນ 9A) — lock ແຖວ `products` ດ້ວຍ `SELECT ... FOR UPDATE` ພາຍໃນ transaction ດຽວກັນ
 * ກ່ອນອ່ານ+ຄິດໄລ່ stockQty. Postgres ຈະບລັອກ transaction ອື່ນທີ່ພະຍາຍາມ lock ແຖວດຽວກັນຈົນກວ່າ
 * transaction ນີ້ຈະ commit/rollback — ກັນ lost update ຕອນ 2 ຄົນປັບສະຕັອກສິນຄ້າດຽວກັນພ້ອມກັນ.
 * ຫຼັງຈາກນີ້ ໃຫ້ອ່ານຄ່າດ້ວຍ `tx.product.findFirst` ຕາມປົກກະຕິໄດ້ — lock ຍັງຄົງຢູ່ຈົນຈົບ transaction.
 */
async function lockProductRow(tx: Tx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${productId} FOR UPDATE`;
}

// ============================================================ Suppliers

export async function listSuppliers(q: SupplierListQuery): Promise<Paginated<SupplierView>> {
  const where: Prisma.SupplierWhereInput = q.q
    ? {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { contactPerson: { contains: q.q, mode: 'insensitive' } },
          { phone: { contains: q.q, mode: 'insensitive' } },
        ],
      }
    : {};
  const orderBy: Prisma.SupplierOrderByWithRelationInput[] =
    q.sort === 'purchaseOrders'
      ? [{ purchaseOrders: { _count: 'desc' } }, { name: 'asc' }]
      : [{ name: 'asc' }];
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { purchaseOrders: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);
  return {
    items: rows.map((s) => ({
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      purchaseOrderCount: s._count.purchaseOrders,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getSupplier(id: string): Promise<SupplierView> {
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  if (!s) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    purchaseOrderCount: s._count.purchaseOrders,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function createSupplier(input: SupplierWriteInput): Promise<SupplierView> {
  const s = await prisma.supplier.create({
    data: {
      name: input.name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone,
      email: input.email ?? null,
      address: input.address ?? null,
    },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    purchaseOrderCount: 0,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function updateSupplier(id: string, input: SupplierWriteInput): Promise<SupplierView> {
  await prisma.supplier.findUniqueOrThrow({ where: { id } }).catch(() => {
    throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  });
  const s = await prisma.supplier.update({
    where: { id },
    data: {
      name: input.name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone,
      email: input.email ?? null,
      address: input.address ?? null,
    },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    purchaseOrderCount: s._count.purchaseOrders,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function deleteSupplier(id: string): Promise<void> {
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  if (!s) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  if (s._count.purchaseOrders > 0) {
    throw ApiError.conflict('ລຶບບໍ່ໄດ້ — ຍັງມີໃບສັ່ງຊື້ຜູກກັບຜູ້ສະໜອງນີ້');
  }
  await prisma.supplier.delete({ where: { id } });
}

// ============================================================ Products

const PRODUCT_INCLUDE = { branch: { select: { name: true } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

function toProductView(p: ProductRow): ProductView {
  const stockQty = qnum(p.stockQty);
  const minStockQty = qnum(p.minStockQty);
  const costPrice = money(p.costPrice);
  return {
    id: p.id,
    branchId: p.branchId,
    branchName: p.branch.name,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    costPrice,
    stockQty,
    minStockQty,
    // C2 — ຖ້າ (ໃນກໍລະນີພິເສດ) stockQty ຕິດລົບ, ຢ່າໃຫ້ມູນຄ່າສະຕັອກ (ຊັບສິນ) ຕິດລົບໄປນຳ.
    stockValue: money(Math.max(stockQty, 0) * costPrice),
    outOfStock: stockQty <= 0,
    lowStock: stockQty > 0 && stockQty <= minStockQty,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listProducts(q: ProductListQuery): Promise<Paginated<ProductView>> {
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(q.branchId ? { branchId: q.branchId } : {}),
    ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { sku: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  // lowStock ຕ້ອງທຽບ 2 ຖັນ → ດຶງແລ້ວກັ່ນຫຼັງ query (dataset ນ້ອຍ).
  const filterLow = q.lowStock === 'true';
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
      ...(filterLow ? {} : { skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    }),
    filterLow ? Promise.resolve(0) : prisma.product.count({ where }),
  ]);
  let views = rows.map(toProductView);
  if (filterLow) {
    views = views.filter((v) => v.lowStock || v.outOfStock);
    const sliced = views.slice((q.page - 1) * q.pageSize, (q.page - 1) * q.pageSize + q.pageSize);
    return {
      items: sliced,
      page: q.page,
      pageSize: q.pageSize,
      total: views.length,
      totalPages: Math.max(1, Math.ceil(views.length / q.pageSize)),
    };
  }
  return {
    items: views,
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getProduct(id: string): Promise<ProductView> {
  const p = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: PRODUCT_INCLUDE });
  if (!p) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  return toProductView(p);
}

export async function createProduct(
  input: ProductCreateInput,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<ProductView> {
  assertBranchScope(authBranchId, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  // C3 — SKU unique ຕໍ່ສາຂາເທົ່ານັ້ນ (ບໍ່ແມ່ນທົ່ວລະບົບ).
  const dup = await prisma.product.findUnique({
    where: { branchId_sku: { branchId: input.branchId, sku: input.sku } },
  });
  if (dup) throw ApiError.conflict('SKU ນີ້ມີຢູ່ແລ້ວໃນສາຂານີ້');

  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        costPrice: new Prisma.Decimal(Number(input.costPrice).toFixed(2)),
        stockQty: qdec(input.openingStock),
        minStockQty: qdec(input.minStockQty),
        isActive: input.isActive,
      },
      include: PRODUCT_INCLUDE,
    });
    if (input.openingStock > 0) {
      await tx.stockMovement.create({
        data: {
          branchId: p.branchId,
          productId: p.id,
          type: 'ADJUSTMENT_ADD',
          qty: qdec(input.openingStock),
          balanceAfter: qdec(input.openingStock),
          notes: 'ຍອດເປີດ',
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
    return p;
  });
  return toProductView(created);
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
  authBranchId?: string | null,
): Promise<ProductView> {
  const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(authBranchId, existing.branchId);
  if (input.sku && input.sku !== existing.sku) {
    // C3 — SKU unique ຕໍ່ສາຂາເທົ່ານັ້ນ.
    const dup = await prisma.product.findUnique({
      where: { branchId_sku: { branchId: existing.branchId, sku: input.sku } },
    });
    if (dup) throw ApiError.conflict('SKU ນີ້ມີຢູ່ແລ້ວໃນສາຂານີ້');
  }
  const p = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.costPrice !== undefined
        ? { costPrice: new Prisma.Decimal(Number(input.costPrice).toFixed(2)) }
        : {}),
      ...(input.minStockQty !== undefined ? { minStockQty: qdec(input.minStockQty) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: PRODUCT_INCLUDE,
  });
  return toProductView(p);
}

export async function deleteProduct(id: string, authBranchId?: string | null): Promise<void> {
  const p = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(authBranchId, p.branchId);
  // C3 — ປົດປ່ອຍ SKU ໃຫ້ໃຊ້ຄືນໄດ້ຫຼັງ soft-delete (compound unique ຄື [branchId, sku]).
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, sku: `${p.sku}:deleted:${Date.now()}` },
  });
}

export async function inventoryStats(branchId?: string): Promise<InventoryStatsView> {
  const where: Prisma.ProductWhereInput = { deletedAt: null, ...(branchId ? { branchId } : {}) };
  const [products, openPO] = await Promise.all([
    prisma.product.findMany({ where, select: { stockQty: true, minStockQty: true, costPrice: true, isActive: true } }),
    prisma.purchaseOrder.count({
      where: { status: { in: ['DRAFT', 'ORDERED'] }, ...(branchId ? { branchId } : {}) },
    }),
  ]);
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalStockValue = 0;
  for (const p of products) {
    const s = qnum(p.stockQty);
    const min = qnum(p.minStockQty);
    if (s <= 0) outOfStockCount += 1;
    else if (s <= min) lowStockCount += 1;
    // C2 — ບໍ່ໃຫ້ຄ່າລົບຂອງສິນຄ້າໃດໜຶ່ງ (exception ຕາມ allowNegativeStock) ດຶງມູນຄ່າລວມລົງຕິດລົບ.
    totalStockValue += Math.max(s, 0) * money(p.costPrice);
  }
  return {
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.isActive).length,
    lowStockCount,
    outOfStockCount,
    totalStockValue: money(totalStockValue),
    openPurchaseOrders: openPO,
  };
}

// ============================================================ Stock movements

const MOVEMENT_INCLUDE = {
  product: { select: { name: true } },
  branch: { select: { name: true } },
  createdByUser: { select: { name: true } },
} satisfies Prisma.StockMovementInclude;

function toMovementView(m: Prisma.StockMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>): StockMovementView {
  return {
    id: m.id,
    productId: m.productId,
    productName: m.product.name,
    branchId: m.branchId,
    branchName: m.branch.name,
    type: m.type,
    qty: qnum(m.qty),
    balanceAfter: qnum(m.balanceAfter),
    refId: m.refId,
    notes: m.notes,
    createdByUserId: m.createdByUserId,
    createdByUserName: m.createdByUser?.name ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * M16 — ຮັບໄດ້ທັງ 'YYYY-MM-DD' ແລະ full ISO timestamp. ຖ້າເປັນວັນທີລ້ວນໆ (ບໍ່ມີ time component)
 * ໃຫ້ຄິດເປັນທ້າຍວັນນັ້ນ (exclusive ວັນຖັດໄປ) ບໍ່ໃຫ້ `lte` ຕັດລາຍການຂອງວັນນັ້ນອອກໝົດ (ຕອນທ່ຽງຄືນ).
 */
function toExclusiveUpperBound(dateStr: string): Date {
  const asGiven = new Date(dateStr);
  const truncated = new Date(asGiven);
  truncated.setUTCHours(0, 0, 0, 0);
  if (asGiven.getTime() !== truncated.getTime()) return asGiven; // ມີ time component ຢູ່ແລ້ວ → ໃຊ້ຄືເກົ່າ
  const nextDay = new Date(truncated);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay;
}

function movementWhere(q: {
  productId?: string;
  branchId?: string;
  type?: StockMovementTypeValue;
  from?: string;
  to?: string;
}): Prisma.StockMovementWhereInput {
  return {
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.branchId ? { branchId: q.branchId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lt: toExclusiveUpperBound(q.to) } : {}),
          },
        }
      : {}),
  };
}

export async function listStockMovements(q: StockMovementListQuery): Promise<Paginated<StockMovementView>> {
  const where = movementWhere(q);
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: MOVEMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return {
    items: rows.map(toMovementView),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

const MOVEMENT_TYPES: StockMovementTypeValue[] = [
  'PURCHASE_IN',
  'SERVICE_CONSUMED',
  'ADJUSTMENT_ADD',
  'ADJUSTMENT_DEDUCT',
  'RETURN_TO_SUPPLIER',
  'TRANSFER_IN',
  'TRANSFER_OUT',
];

export async function getStockMovementStats(q: StockMovementStatsQuery): Promise<StockMovementStatsView> {
  const where = movementWhere(q);
  const grouped = await prisma.stockMovement.groupBy({ by: ['type'], where, _count: { _all: true } });
  const byType = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t, 0])) as Record<StockMovementTypeValue, number>;
  let total = 0;
  for (const g of grouped) {
    byType[g.type] = g._count._all;
    total += g._count._all;
  }
  return { total, byType };
}

export async function adjustStock(
  input: StockAdjustInput,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<StockMovementView> {
  return prisma.$transaction(async (tx) => {
    // C1 — lock ແຖວກ່ອນອ່ານ ເພື່ອກັນ lost update ຕອນ 2 request ປັບສະຕັອກສິນຄ້າດຽວກັນພ້ອມກັນ.
    await lockProductRow(tx, input.productId);
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true, branchId: true, stockQty: true },
    });
    if (!product) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
    assertBranchScope(authBranchId, product.branchId);
    const balance = qnum(product.stockQty) + input.delta;
    if (balance < 0) throw ApiError.conflict('ປັບບໍ່ໄດ້ — ສະຕັອກຈະຕິດລົບ');
    await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
    const m = await tx.stockMovement.create({
      data: {
        branchId: product.branchId,
        productId: product.id,
        type: input.delta > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT',
        qty: qdec(Math.abs(input.delta)),
        balanceAfter: qdec(balance),
        notes: input.notes ?? 'ປັບສະຕັອກດ້ວຍມື',
        createdByUserId: createdByUserId ?? null,
      },
      include: MOVEMENT_INCLUDE,
    });
    return toMovementView(m);
  });
}

/**
 * ໂມດູນ 14 — ຕັດສະຕັອກ BOM ອັດຕະໂນມັດເມື່ອນັດໝາຍ COMPLETED.
 * ເອີ້ນຈາກ tx ຂອງ appointments / staff-portal. idempotent ຕໍ່ refId `appt:<id>` ຕໍ່ສິນຄ້າ.
 * createdByUserId ຕັ້ງເປັນ null ສະເໝີ — ນີ້ຄືການຕັດອັດຕະໂນມັດຂອງລະບົບ, ບໍ່ແມ່ນມະນຸດກົດ.
 *
 * C2 — ຖ້າສະຕັອກຈະຕິດລົບ ແລະ ສາຂາບໍ່ໄດ້ເປີດ `allowNegativeStock`, throw ເພື່ອບໍ່ໃຫ້ນັດໝາຍ
 * COMPLETED ໄດ້ໂດຍທີ່ວັດຖຸໝົດແລ້ວ (transaction ຝັ່ງນອກ — appointments/staff-portal — ຈະ rollback ນຳ).
 * ຖ້າສາຂາເປີດ `allowNegativeStock` ໄວ້ ຈະຍອມໃຫ້ຕິດລົບແຕ່ໝາຍ note ໄວ້ໃຫ້ຮູ້ (exception ແບບເບົາ —
 * ບໍ່ທຽບເທົ່າ exception record ເຕັມຮູບແບບ, ດູ docs/inventory-audit.md §C2 ສຳລັບຄື້ນຕໍ່ໄປ).
 */
export async function consumeServiceStock(
  tx: Tx,
  params: { appointmentId: string; serviceId: string },
): Promise<void> {
  const refId = `appt:${params.appointmentId}`;
  const consumables = await tx.serviceConsumable.findMany({
    where: { serviceId: params.serviceId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          branchId: true,
          stockQty: true,
          deletedAt: true,
          branch: { select: { allowNegativeStock: true } },
        },
      },
    },
  });
  for (const c of consumables) {
    if (c.product.deletedAt) continue;
    const already = await tx.stockMovement.findFirst({
      where: { productId: c.productId, refId, type: 'SERVICE_CONSUMED' },
      select: { id: true },
    });
    if (already) continue;
    const use = qnum(c.qtyPerUse);
    if (use <= 0) continue;
    // C1 — lock ແຖວສິນຄ້າກ່ອນອ່ານ/ຄິດໄລ່ (ຄືກັນກັບ adjustStock).
    await lockProductRow(tx, c.productId);
    const fresh = await tx.product.findFirst({ where: { id: c.productId }, select: { stockQty: true } });
    const balance = qnum(fresh?.stockQty ?? c.product.stockQty) - use;
    if (balance < 0 && !c.product.branch.allowNegativeStock) {
      throw ApiError.conflict(`ສະຕັອກສິນຄ້າ "${c.product.name}" ບໍ່ພຽງພໍສຳລັບຕັດ BOM ຂອງບໍລິການນີ້`);
    }
    await tx.product.update({ where: { id: c.productId }, data: { stockQty: qdec(balance) } });
    await tx.stockMovement.create({
      data: {
        branchId: c.product.branchId,
        productId: c.productId,
        type: 'SERVICE_CONSUMED',
        qty: qdec(use),
        balanceAfter: qdec(balance),
        refId,
        notes:
          balance < 0
            ? 'ຕັດສະຕັອກຈາກ BOM ບໍລິການ — ⚠️ ຕິດລົບ (ອະນຸຍາດຕາມການຕັ້ງຄ່າສາຂາ)'
            : 'ຕັດສະຕັອກຈາກ BOM ບໍລິການ',
      },
    });
  }
}

// ============================================================ Purchase orders

function genPoNumber(): string {
  return `PO-${randomBytes(4).toString('hex').toUpperCase()}`;
}

const PO_INCLUDE = {
  branch: { select: { name: true } },
  supplier: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseOrderInclude;
type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof PO_INCLUDE }>;

function toPoView(po: PoRow, withItems: boolean): PurchaseOrderView {
  return {
    id: po.id,
    poNumber: po.poNumber,
    branchId: po.branchId,
    branchName: po.branch.name,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    status: po.status,
    totalAmount: money(po.totalAmount),
    itemCount: po._count.items,
    orderDate: po.orderDate.toISOString(),
    receivedDate: po.receivedDate ? po.receivedDate.toISOString() : null,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    ...(withItems
      ? {
          items: po.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productName: it.product.name,
            sku: it.product.sku,
            unit: it.product.unit,
            quantity: qnum(it.quantity),
            unitCost: money(it.unitCost),
            lineTotal: money(qnum(it.quantity) * money(it.unitCost)),
          })),
        }
      : {}),
  };
}

export async function listPurchaseOrders(q: PurchaseOrderListQuery): Promise<Paginated<PurchaseOrderView>> {
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(q.branchId ? { branchId: q.branchId } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { poNumber: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: PO_INCLUDE,
      orderBy: { orderDate: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return {
    items: rows.map((r) => toPoView(r, false)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderView> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  return toPoView(po, true);
}

async function assertProductsForBranch(tx: Tx, branchId: string, productIds: string[]): Promise<void> {
  // M17 — ກັນສິນຄ້າດຽວກັນຊ້ຳ 2 ແຖວໃນ PO ດຽວ (ຕອນນີ້ມີ DB constraint @@unique ຄ້ຳຢູ່ແລ້ວ,
  // ແຕ່ກວດຢູ່ນີ້ໃຫ້ error ອ່ານງ່າຍ 400 ແທນທີ່ຈະເປັນ Prisma unique-violation 500).
  if (new Set(productIds).size !== productIds.length) {
    throw ApiError.badRequest('ມີສິນຄ້າຊ້ຳກັນໃນລາຍການ PO');
  }
  const found = await tx.product.findMany({
    where: { id: { in: productIds }, deletedAt: null },
    select: { id: true, branchId: true },
  });
  if (found.length !== new Set(productIds).size) throw ApiError.badRequest('ມີສິນຄ້າບາງລາຍການບໍ່ພົບ');
  if (found.some((p) => p.branchId !== branchId)) {
    throw ApiError.badRequest('ສິນຄ້າຕ້ອງຢູ່ສາຂາດຽວກັນກັບໃບສັ່ງຊື້');
  }
}

function poTotal(items: PurchaseOrderCreateInput['items']): number {
  return money(items.reduce((s, it) => s + qnum(it.quantity) * money(it.unitCost), 0));
}

export async function createPurchaseOrder(
  input: PurchaseOrderCreateInput,
  authBranchId?: string | null,
): Promise<PurchaseOrderView> {
  assertBranchScope(authBranchId, input.branchId);
  const [branch, supplier] = await Promise.all([
    prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } }),
    prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }),
  ]);
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  if (!supplier) throw ApiError.badRequest('ບໍ່ພົບຜູ້ສະໜອງ');

  const po = await prisma.$transaction(async (tx) => {
    await assertProductsForBranch(tx, input.branchId, input.items.map((i) => i.productId));
    return tx.purchaseOrder.create({
      data: {
        branchId: input.branchId,
        supplierId: input.supplierId,
        poNumber: genPoNumber(),
        status: input.status,
        totalAmount: new Prisma.Decimal(poTotal(input.items).toFixed(2)),
        items: {
          create: input.items.map((it) => ({
            productId: it.productId,
            quantity: qdec(it.quantity),
            unitCost: new Prisma.Decimal(Number(it.unitCost).toFixed(2)),
          })),
        },
      },
      include: PO_INCLUDE,
    });
  });
  return toPoView(po, true);
}

export async function updatePurchaseOrder(
  id: string,
  input: PurchaseOrderUpdateInput,
  authBranchId?: string | null,
): Promise<PurchaseOrderView> {
  const po = await prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findUnique({ where: { id }, select: { id: true, status: true, branchId: true } });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    assertBranchScope(authBranchId, existing.branchId);
    if (existing.status === 'RECEIVED' || existing.status === 'CANCELLED') {
      throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ປິດແລ້ວ — ແກ້ໄຂບໍ່ໄດ້');
    }
    if (input.items && existing.status !== 'DRAFT') {
      throw ApiError.conflict('ແກ້ລາຍການໄດ້ສະເພາະ PO ທີ່ຍັງ DRAFT');
    }
    if (input.supplierId) {
      const sup = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
      if (!sup) throw ApiError.badRequest('ບໍ່ພົບຜູ້ສະໜອງ');
    }
    if (input.items) {
      await assertProductsForBranch(tx, existing.branchId, input.items.map((i) => i.productId));
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderItem.createMany({
        data: input.items.map((it) => ({
          purchaseOrderId: id,
          productId: it.productId,
          quantity: qdec(it.quantity),
          unitCost: new Prisma.Decimal(Number(it.unitCost).toFixed(2)),
        })),
      });
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.items ? { totalAmount: new Prisma.Decimal(poTotal(input.items).toFixed(2)) } : {}),
      },
      include: PO_INCLUDE,
    });
  });
  return toPoView(po, true);
}

export async function receivePurchaseOrder(
  id: string,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<PurchaseOrderView> {
  const po = await prisma.$transaction(async (tx) => {
    // C1 — lock ແຖວ PO ນີ້ກ່ອນ ເພື່ອກັນ 2 request "ຮັບເຄື່ອງ" ພ້ອມກັນ (ຖ້າບໍ່ lock, ທັງສອງອາດ
    // ຜ່ານການກວດ status='RECEIVED' ພ້ອມກັນ ແລ້ວເພີ່ມສະຕັອກຊ້ຳ 2 ເທື່ອ).
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({
      where: { id },
      include: { items: { select: { productId: true, quantity: true } } },
    });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    assertBranchScope(authBranchId, existing.branchId);
    if (existing.status === 'RECEIVED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຮັບເຄື່ອງແລ້ວ');
    if (existing.status === 'CANCELLED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຖືກຍົກເລີກ');

    for (const it of existing.items) {
      // C1 — lock ແຖວສິນຄ້າກ່ອນອ່ານ/ບວກສະຕັອກ (ຄືກັນກັບ adjustStock/consumeServiceStock).
      await lockProductRow(tx, it.productId);
      const product = await tx.product.findUnique({
        where: { id: it.productId },
        select: { id: true, branchId: true, stockQty: true },
      });
      if (!product) continue;
      const balance = qnum(product.stockQty) + qnum(it.quantity);
      await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
      await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          type: 'PURCHASE_IN',
          qty: qdec(qnum(it.quantity)),
          balanceAfter: qdec(balance),
          refId: `po:${id}`,
          notes: `ຮັບເຄື່ອງຈາກ ${existing.poNumber}`,
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedDate: new Date() },
      include: PO_INCLUDE,
    });
  });
  return toPoView(po, true);
}

export async function deletePurchaseOrder(id: string, authBranchId?: string | null): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, branchId: true } });
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  assertBranchScope(authBranchId, po.branchId);
  if (po.status !== 'DRAFT') throw ApiError.conflict('ລຶບໄດ້ສະເພາະ PO ທີ່ຍັງ DRAFT');
  await prisma.purchaseOrder.delete({ where: { id } });
}

// ============================================================ Stock transfers (cross-branch)

function genTransferNumber(): string {
  return `TRF-${randomBytes(4).toString('hex').toUpperCase()}`;
}

const TRANSFER_INCLUDE = {
  fromBranch: { select: { name: true } },
  toBranch: { select: { name: true } },
  createdByUser: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
  _count: { select: { items: true } },
} satisfies Prisma.StockTransferInclude;
type TransferRow = Prisma.StockTransferGetPayload<{ include: typeof TRANSFER_INCLUDE }>;

function toTransferView(row: TransferRow, withItems: boolean): StockTransferView {
  const totalValue = row.items.reduce((s, it) => s + qnum(it.quantity) * money(it.unitCost), 0);
  return {
    id: row.id,
    transferNumber: row.transferNumber,
    fromBranchId: row.fromBranchId,
    fromBranchName: row.fromBranch.name,
    toBranchId: row.toBranchId,
    toBranchName: row.toBranch.name,
    status: row.status,
    notes: row.notes,
    itemCount: row._count.items,
    totalValue: money(totalValue),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
    createdByUserName: row.createdByUser?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(withItems
      ? {
          items: row.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            // ໃຊ້ snapshot ທີ່ບັນທຶກໄວ້ຕອນສ້າງ, ບໍ່ໃຊ້ product.* ປັດຈຸບັນ — ສິນຄ້າຕົ້ນທາງອາດຖືກແກ້ໄຂ
            // ຫຼືລຶບຫຼັງຈາກນັ້ນ, ແຕ່ລາຍການໂອນຄວນສະແດງຄ່າ ณ ເວລາທີ່ໂອນ.
            productName: it.productName,
            sku: it.sku,
            unit: it.unit,
            quantity: qnum(it.quantity),
            unitCost: money(it.unitCost),
            lineValue: money(qnum(it.quantity) * money(it.unitCost)),
            receivedProductId: it.receivedProductId,
          })),
        }
      : {}),
  };
}

export async function listStockTransfers(q: StockTransferListQuery): Promise<Paginated<StockTransferView>> {
  const where: Prisma.StockTransferWhereInput = {
    ...(q.branchId ? { OR: [{ fromBranchId: q.branchId }, { toBranchId: q.branchId }] } : {}),
    ...(q.fromBranchId ? { fromBranchId: q.fromBranchId } : {}),
    ...(q.toBranchId ? { toBranchId: q.toBranchId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockTransfer.count({ where }),
  ]);
  return {
    items: rows.map((r) => toTransferView(r, false)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getStockTransfer(id: string): Promise<StockTransferView> {
  const row = await prisma.stockTransfer.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການໂອນສິນຄ້າ');
  return toTransferView(row, true);
}

export async function createStockTransfer(
  input: StockTransferCreateInput,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<StockTransferView> {
  // ຄົນສ້າງລາຍການໂອນຕ້ອງເປັນຄົນຂອງສາຂາຕົ້ນທາງ (ຄົນທີ່ "ສົ່ງອອກ") — SUPER_ADMIN ບໍ່ຈຳກັດ.
  assertBranchScope(authBranchId, input.fromBranchId);
  const [fromBranch, toBranch] = await Promise.all([
    prisma.branch.findUnique({ where: { id: input.fromBranchId }, select: { id: true } }),
    prisma.branch.findUnique({ where: { id: input.toBranchId }, select: { id: true } }),
  ]);
  if (!fromBranch) throw ApiError.badRequest('ບໍ່ພົບສາຂາຕົ້ນທາງ');
  if (!toBranch) throw ApiError.badRequest('ບໍ່ພົບສາຂາປາຍທາງ');

  const created = await prisma.$transaction(async (tx) => {
    await assertProductsForBranch(tx, input.fromBranchId, input.items.map((i) => i.productId));
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, name: true, sku: true, unit: true, costPrice: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return tx.stockTransfer.create({
      data: {
        transferNumber: genTransferNumber(),
        fromBranchId: input.fromBranchId,
        toBranchId: input.toBranchId,
        notes: input.notes ?? null,
        createdByUserId: createdByUserId ?? null,
        items: {
          create: input.items.map((it) => {
            const p = byId.get(it.productId)!;
            return {
              productId: it.productId,
              productName: p.name,
              sku: p.sku,
              unit: p.unit,
              quantity: qdec(it.quantity),
              unitCost: p.costPrice,
            };
          }),
        },
      },
      include: TRANSFER_INCLUDE,
    });
  });
  return toTransferView(created, true);
}

/**
 * DRAFT → IN_TRANSIT — ຕັດສະຕັອກສິນຄ້າຕົ້ນທາງທັນທີ (ຄືກັບເຄື່ອງອອກຈາກສາງແລ້ວ, ກຳລັງເດີນທາງ),
 * ບັນທຶກ TRANSFER_OUT movement ຕໍ່ລາຍການ. ຮຽກໂດຍຄົນຂອງສາຂາຕົ້ນທາງເທົ່ານັ້ນ.
 */
export async function sendStockTransfer(
  id: string,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<StockTransferView> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "stock_transfers" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບລາຍການໂອນສິນຄ້າ');
    assertBranchScope(authBranchId, existing.fromBranchId);
    if (existing.status !== 'DRAFT') throw ApiError.conflict('ລາຍການນີ້ສົ່ງແລ້ວ ຫຼື ຖືກຍົກເລີກແລ້ວ');

    const fromBranch = await tx.branch.findUnique({
      where: { id: existing.fromBranchId },
      select: { allowNegativeStock: true },
    });

    for (const it of existing.items) {
      await lockProductRow(tx, it.productId);
      const product = await tx.product.findFirst({
        where: { id: it.productId, deletedAt: null },
        select: { id: true, branchId: true, stockQty: true },
      });
      if (!product) throw ApiError.conflict(`ສິນຄ້າ "${it.productName}" ຖືກລຶບໄປແລ້ວ — ໂອນບໍ່ໄດ້`);
      const balance = qnum(product.stockQty) - qnum(it.quantity);
      if (balance < 0 && !fromBranch?.allowNegativeStock) {
        throw ApiError.conflict(`ສະຕັອກ "${it.productName}" ບໍ່ພຽງພໍສຳລັບການໂອນນີ້`);
      }
      await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
      await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          type: 'TRANSFER_OUT',
          qty: qdec(qnum(it.quantity)),
          balanceAfter: qdec(balance),
          refId: `transfer:${id}`,
          notes: `ໂອນອອກ ${existing.transferNumber}`,
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
    return tx.stockTransfer.update({
      where: { id },
      data: { status: 'IN_TRANSIT', sentAt: new Date() },
      include: TRANSFER_INCLUDE,
    });
  });
  return toTransferView(row, true);
}

/**
 * IN_TRANSIT → COMPLETED — ບວກສະຕັອກຢູ່ສາຂາປາຍທາງ. ຖ້າສາຂາປາຍທາງຍັງບໍ່ມີສິນຄ້າ SKU ນີ້ ຈະສ້າງ
 * ແຖວ Product ໃໝ່ໃຫ້ (branchId+sku unique — ດູ C3 ໃນ createProduct) ໂດຍໃຊ້ snapshot name/unit/
 * costPrice ທີ່ບັນທຶກໄວ້ຕອນສ້າງລາຍການໂອນ. ຮຽກໂດຍຄົນຂອງສາຂາປາຍທາງເທົ່ານັ້ນ.
 */
export async function receiveStockTransfer(
  id: string,
  authBranchId?: string | null,
  createdByUserId?: string | null,
): Promise<StockTransferView> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "stock_transfers" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບລາຍການໂອນສິນຄ້າ');
    assertBranchScope(authBranchId, existing.toBranchId);
    if (existing.status === 'COMPLETED') throw ApiError.conflict('ລາຍການນີ້ຮັບເຄື່ອງແລ້ວ');
    if (existing.status !== 'IN_TRANSIT') throw ApiError.conflict('ລາຍການນີ້ຍັງບໍ່ໄດ້ສົ່ງອອກຈາກຕົ້ນທາງ');

    for (const it of existing.items) {
      let dest = await tx.product.findFirst({
        where: { branchId: existing.toBranchId, sku: it.sku, deletedAt: null },
        select: { id: true },
      });
      if (!dest) {
        dest = await tx.product.create({
          data: {
            branchId: existing.toBranchId,
            name: it.productName,
            sku: it.sku,
            unit: it.unit,
            costPrice: it.unitCost,
            stockQty: qdec(0),
            minStockQty: qdec(5),
          },
          select: { id: true },
        });
      }
      await lockProductRow(tx, dest.id);
      const fresh = await tx.product.findFirst({ where: { id: dest.id }, select: { stockQty: true } });
      const balance = qnum(fresh?.stockQty ?? 0) + qnum(it.quantity);
      await tx.product.update({ where: { id: dest.id }, data: { stockQty: qdec(balance) } });
      await tx.stockTransferItem.update({ where: { id: it.id }, data: { receivedProductId: dest.id } });
      await tx.stockMovement.create({
        data: {
          branchId: existing.toBranchId,
          productId: dest.id,
          type: 'TRANSFER_IN',
          qty: qdec(qnum(it.quantity)),
          balanceAfter: qdec(balance),
          refId: `transfer:${id}`,
          notes: `ໂອນເຂົ້າ ${existing.transferNumber}`,
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
    return tx.stockTransfer.update({
      where: { id },
      data: { status: 'COMPLETED', receivedAt: new Date() },
      include: TRANSFER_INCLUDE,
    });
  });
  return toTransferView(row, true);
}

export async function deleteStockTransfer(id: string, authBranchId?: string | null): Promise<void> {
  const row = await prisma.stockTransfer.findUnique({ where: { id }, select: { status: true, fromBranchId: true } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການໂອນສິນຄ້າ');
  assertBranchScope(authBranchId, row.fromBranchId);
  if (row.status !== 'DRAFT') throw ApiError.conflict('ລຶບໄດ້ສະເພາະລາຍການທີ່ຍັງເປັນຮ່າງ (ຍັງບໍ່ໄດ້ສົ່ງ)');
  await prisma.stockTransfer.delete({ where: { id } });
}

// ============================================================ Reconciliation (M19, audit ຄື້ນ 9A)

/** ທິດທາງຂອງແຕ່ລະປະເພດ movement ຕໍ່ stockQty — ໃຊ້ຄິດຍອດຄາດຄະເນຈາກ ledger. */
const MOVEMENT_SIGN: Record<string, 1 | -1> = {
  PURCHASE_IN: 1,
  ADJUSTMENT_ADD: 1,
  TRANSFER_IN: 1,
  SERVICE_CONSUMED: -1,
  ADJUSTMENT_DEDUCT: -1,
  RETURN_TO_SUPPLIER: -1,
  TRANSFER_OUT: -1,
};

export type StockMismatch = {
  productId: string;
  productName: string;
  branchId: string;
  /** ຍອດຄາດຄະເນຈາກ SUM(movements) */
  ledgerBalance: number;
  /** ຍອດຈິງໃນ `products.stockQty` */
  actualBalance: number;
  diff: number;
};
export type StockReconciliationResult = {
  checked: number;
  mismatches: StockMismatch[];
};

/**
 * M19 — ທຽບ SUM(stock_movements.qty ຕາມທິດທາງ) ກັບ `products.stockQty` ຈິງ ຂອງທຸກສິນຄ້າ.
 * ຖ້າບໍ່ກົງກັນ = ມີ bug (write ນອກ ledger, migration ຜິດ, ...) — ຄວນຮັນຈາກ job ປະຈຳຄືນ
 * (ດູ jobs/stock-reconciliation.job.ts) ແລ້ວແຈ້ງເຕືອນ SUPER_ADMIN ເມື່ອພົບ.
 */
export async function reconcileStock(): Promise<StockReconciliationResult> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, branchId: true, stockQty: true },
  });
  const mismatches: StockMismatch[] = [];
  for (const p of products) {
    const grouped = await prisma.stockMovement.groupBy({
      by: ['type'],
      where: { productId: p.id },
      _sum: { qty: true },
    });
    let ledgerBalance = 0;
    for (const g of grouped) {
      const sign = MOVEMENT_SIGN[g.type] ?? 1;
      ledgerBalance += sign * qnum(g._sum.qty);
    }
    const actualBalance = qnum(p.stockQty);
    const diff = Math.round((actualBalance - ledgerBalance + Number.EPSILON) * 1000) / 1000;
    if (Math.abs(diff) > 0.001) {
      mismatches.push({ productId: p.id, productName: p.name, branchId: p.branchId, ledgerBalance, actualBalance, diff });
    }
  }
  return { checked: products.length, mismatches };
}
