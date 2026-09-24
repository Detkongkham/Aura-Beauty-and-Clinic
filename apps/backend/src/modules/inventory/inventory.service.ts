import { randomBytes } from 'node:crypto';
import type {
  CogsSummaryQuery,
  CogsSummaryView,
  InventoryStatsView,
  LotUsageView,
  Paginated,
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
  ProductView,
  PurchaseOrderCreateInput,
  PurchaseOrderListQuery,
  PurchaseOrderReceiveInput,
  PurchaseOrderUpdateInput,
  PurchaseOrderView,
  StockAdjustInput,
  StockLotListQuery,
  StockLotStatusValue,
  StockLotView,
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
import { vientianeDateKey } from '../../utils/dateHelpers.js';

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
 * C4 — `Product.costPrice` ຕອນນີ້ເປັນ WAC ທີ່ອັບເດດທຸກຄັ້ງທີ່ຮັບເຄື່ອງ (ດູ `wacAfterReceipt`).
 * ເກັບ 4dp (ບໍ່ແມ່ນ 2dp ຄືກັບ `money()`) ເພື່ອບໍ່ໃຫ້ຄ່າສະເລ່ຍຄາດເຄື່ອນສະສົມເມື່ອຮັບເຄື່ອງຫຼາຍຄັ້ງ —
 * ໜ້າ UI ຍັງສະແດງດ້ວຍ `money()`/`CurrencyText` ຕາມປົກກະຕິ (2dp), ນີ້ຄືແຕ່ຄ່າ *ເກັບ/ຄິດໄລ່* ເທົ່ານັ້ນ.
 */
function costDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(4));
}
/** Decimal(4dp) → number ແບບບໍ່ຕັດເຫຼືອ 2dp — ໃຊ້ຕອນອ່ານ costPrice ມາຄິດ WAC ໃໝ່ຕໍ່. */
function costNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 10000) / 10000 || 0;
}

/**
 * C4 — Weighted Average Cost. ໃຊ້ຕອນຮັບເຄື່ອງເຂົ້າ (PURCHASE_IN/TRANSFER_IN) ເທົ່ານັ້ນ — ການຕັດ
 * ອອກ (SERVICE_CONSUMED/TRANSFER_OUT/ADJUSTMENT) ບໍ່ປ່ຽນ WAC (ມາດຕະຖານ moving-average costing).
 */
function wacAfterReceipt(
  onHandBefore: number,
  avgCostBefore: number,
  qtyReceived: number,
  unitCostReceived: number,
): number {
  const totalQty = onHandBefore + qtyReceived;
  // ກັນ divide-by-zero ແລະ ກໍລະນີ edge (ສະຕັອກຕິດລົບກ່ອນຮັບ, ດູ C2) — ໃຊ້ຕົ້ນທຶນທີ່ຮັບເຂົ້າຄັ້ງນີ້ລ້ວນໆ.
  if (totalQty <= 0) return unitCostReceived;
  return (onHandBefore * avgCostBefore + qtyReceived * unitCostReceived) / totalQty;
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

// ============================================================ Lots (C5)

/** ≤ ຈຳນວນວັນນີ້ກ່ອນໝົດອາຍຸ ຖືວ່າ "ໃກ້ໝົດອາຍຸ" (ໃຊ້ທັງ UI ແລະ job ແຈ້ງເຕືອນ). */
export const LOT_EXPIRY_WARN_DAYS = 60;

/** 'YYYY-MM-DD' → Date (UTC midnight) ສຳລັບຖັນ @db.Date. */
function toDateOnly(v: string | null | undefined): Date | null {
  return v ? new Date(`${v}T00:00:00.000Z`) : null;
}
function fromDateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** ຈຳນວນວັນເຫຼືອຈົນໝົດອາຍຸ ນັບຕາມວັນວຽງຈັນ (ລົບ = ໝົດແລ້ວ). */
export function lotDaysLeft(expiry: Date | null, now: Date = new Date()): number | null {
  if (!expiry) return null;
  return Math.round((expiry.getTime() - vientianeDateKey(now).getTime()) / 86_400_000);
}

function lotStatusOf(daysLeft: number | null): StockLotStatusValue {
  if (daysLeft == null) return 'NO_EXPIRY';
  if (daysLeft < 0) return 'EXPIRED';
  return daysLeft <= LOT_EXPIRY_WARN_DAYS ? 'EXPIRING' : 'OK';
}

const LOT_INCLUDE = {
  product: { select: { name: true, sku: true, unit: true } },
  branch: { select: { name: true } },
} satisfies Prisma.StockLotInclude;
type LotRow = Prisma.StockLotGetPayload<{ include: typeof LOT_INCLUDE }>;

function toLotView(l: LotRow, now: Date = new Date()): StockLotView {
  const daysLeft = lotDaysLeft(l.expiryDate, now);
  return {
    id: l.id,
    productId: l.productId,
    productName: l.product.name,
    sku: l.product.sku,
    unit: l.product.unit,
    branchId: l.branchId,
    branchName: l.branch.name,
    lotNumber: l.lotNumber,
    expiryDate: fromDateOnly(l.expiryDate),
    mfgDate: fromDateOnly(l.mfgDate),
    qtyOnHand: qnum(l.qtyOnHand),
    unitCost: money(l.unitCost),
    receivedAt: l.receivedAt.toISOString(),
    daysLeft,
    status: lotStatusOf(daysLeft),
  };
}

/**
 * C5 — ຮັບເຄື່ອງເຂົ້າ lot (upsert ຕາມ productId+branchId+lotNumber). ຕ້ອງເອີ້ນຫຼັງ lockProductRow ແລ້ວ
 * (ການ serialize lot ອາໄສ lock ຂອງແຖວສິນຄ້າ ບໍ່ lock ແຖວ lot ແຍກ). lot ເລກດຽວກັນມາຊ້ຳ = ບວກຈຳນວນ +
 * ສະເລ່ຍຕົ້ນທຶນຖ່ວງນ້ຳໜັກ; ແຕ່ຖ້າວັນໝົດອາຍຸຂັດກັບທີ່ບັນທຶກໄວ້ = ປະຕິເສດ (ເລກ lot ດຽວກັນຕ້ອງ
 * ໝົດອາຍຸວັນດຽວກັນ — ຖ້າບໍ່ແມ່ນ ແປວ່າພິມເລກ lot ຜິດ ແລະ ຈະເຮັດໃຫ້ FEFO/recall ຜິດ).
 */
async function receiveIntoLot(
  tx: Tx,
  a: {
    productId: string;
    branchId: string;
    lotNumber: string;
    expiryDate: Date | null;
    mfgDate: Date | null;
    qty: number;
    unitCost: number;
    poItemId?: string | null;
  },
): Promise<string> {
  const existing = await tx.stockLot.findUnique({
    where: {
      productId_branchId_lotNumber: { productId: a.productId, branchId: a.branchId, lotNumber: a.lotNumber },
    },
  });
  if (!existing) {
    const created = await tx.stockLot.create({
      data: {
        productId: a.productId,
        branchId: a.branchId,
        lotNumber: a.lotNumber,
        expiryDate: a.expiryDate,
        mfgDate: a.mfgDate,
        qtyOnHand: qdec(a.qty),
        unitCost: costDec(a.unitCost),
        poItemId: a.poItemId ?? null,
      },
      select: { id: true },
    });
    return created.id;
  }
  if (a.expiryDate && existing.expiryDate && a.expiryDate.getTime() !== existing.expiryDate.getTime()) {
    throw ApiError.conflict(`Lot "${a.lotNumber}" ມີຢູ່ແລ້ວດ້ວຍວັນໝົດອາຍຸທີ່ຕ່າງກັນ — ກວດເລກ lot ອີກຄັ້ງ`);
  }
  const oldQty = qnum(existing.qtyOnHand);
  const base = Math.max(oldQty, 0);
  const blended =
    base + a.qty > 0 ? (base * costNum(existing.unitCost) + a.qty * a.unitCost) / (base + a.qty) : a.unitCost;
  await tx.stockLot.update({
    where: { id: existing.id },
    data: {
      qtyOnHand: qdec(oldQty + a.qty),
      unitCost: costDec(blended),
      expiryDate: existing.expiryDate ?? a.expiryDate,
      mfgDate: existing.mfgDate ?? a.mfgDate,
    },
  });
  return existing.id;
}

type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

/**
 * C5 — ຕັດສະຕັອກ `qty` ອອກຈາກສິນຄ້າ ແລະ ຂຽນ ledger. ຜູ້ເອີ້ນເປັນຜູ້ກວດ balance<0/allowNegativeStock ແລະ
 * update products.stockQty ເອງ (ຕ້ອງ lockProductRow ແລ້ວ).
 *  - ບໍ່ trackLot: 1 ແຖວ ຕາມ WAC (ພຶດຕິກຳ C4 ເດີມ).
 *  - trackLot: FEFO — ຍ່າງ lot (expiryDate ASC NULLS LAST, receivedAt ASC) ທີ່ qtyOnHand>0 ແລ້ວຕັດຈົນຄົບ,
 *    ໜຶ່ງແຖວຕໍ່ lot ທີ່ແຕະ (unitCost = ຕົ້ນທຶນຂອງ lot ນັ້ນ). ສ່ວນທີ່ເຫຼືອຫຼັງ lot ໝົດ (ສະຕັອກເກົ່າກ່ອນເປີດ
 *    trackLot, ຫຼື ສະຕັອກຕິດລົບທີ່ສາຂາອະນຸຍາດ) ຕັດເປັນແຖວ lotId=null ຕາມ WAC — ລວມ qty ທຸກແຖວ = qty ທີ່ຂໍ.
 */
async function deductStock(
  tx: Tx,
  a: {
    productId: string;
    branchId: string;
    trackLot: boolean;
    wac: number;
    qty: number;
    balanceBefore: number;
    type: 'SERVICE_CONSUMED' | 'ADJUSTMENT_DEDUCT';
    refId?: string;
    notes: string;
    createdByUserId?: string | null;
  },
): Promise<MovementRow[]> {
  const slices: { lotId: string | null; qty: number; unitCost: number }[] = [];
  let remaining = a.qty;
  if (a.trackLot) {
    const lots = await tx.stockLot.findMany({
      where: { productId: a.productId, branchId: a.branchId, qtyOnHand: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
    });
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(qnum(lot.qtyOnHand), remaining);
      if (take <= 0) continue;
      await tx.stockLot.update({ where: { id: lot.id }, data: { qtyOnHand: qdec(qnum(lot.qtyOnHand) - take) } });
      slices.push({ lotId: lot.id, qty: take, unitCost: costNum(lot.unitCost) });
      remaining = qnum(remaining - take);
    }
  }
  if (remaining > 0 || slices.length === 0) {
    slices.push({ lotId: null, qty: remaining > 0 ? remaining : a.qty, unitCost: a.wac });
  }
  const rows: MovementRow[] = [];
  let running = a.balanceBefore;
  for (const sl of slices) {
    running = qnum(running - sl.qty);
    rows.push(
      await tx.stockMovement.create({
        data: {
          branchId: a.branchId,
          productId: a.productId,
          type: a.type,
          qty: qdec(sl.qty),
          balanceAfter: qdec(running),
          unitCost: costDec(sl.unitCost),
          valueChange: money(-(sl.qty * sl.unitCost)),
          lotId: sl.lotId,
          refId: a.refId ?? null,
          notes: a.notes,
          createdByUserId: a.createdByUserId ?? null,
        },
        include: MOVEMENT_INCLUDE,
      }),
    );
  }
  return rows;
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
    trackLot: p.trackLot,
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
  if (input.trackLot && input.openingStock > 0 && !input.openingLot) {
    throw ApiError.badRequest('ສິນຄ້າທີ່ຕິດຕາມ lot ຕ້ອງລະບຸເລກ lot ຂອງຍອດເປີດ');
  }

  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        costPrice: costDec(input.costPrice),
        stockQty: qdec(input.openingStock),
        minStockQty: qdec(input.minStockQty),
        isActive: input.isActive,
        trackLot: input.trackLot,
      },
      include: PRODUCT_INCLUDE,
    });
    if (input.openingStock > 0) {
      const lotId =
        input.trackLot && input.openingLot
          ? await receiveIntoLot(tx, {
              productId: p.id,
              branchId: p.branchId,
              lotNumber: input.openingLot.lotNumber,
              expiryDate: toDateOnly(input.openingLot.expiryDate),
              mfgDate: toDateOnly(input.openingLot.mfgDate),
              qty: input.openingStock,
              unitCost: input.costPrice,
            })
          : null;
      await tx.stockMovement.create({
        data: {
          branchId: p.branchId,
          productId: p.id,
          type: 'ADJUSTMENT_ADD',
          qty: qdec(input.openingStock),
          balanceAfter: qdec(input.openingStock),
          lotId,
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
  if (input.trackLot === false && existing.trackLot) {
    // ປິດ trackLot ຕອນທີ່ lot ຍັງມີຂອງ → qtyOnHand ຂອງ lot ຈະຄ້າງ/ບໍ່ກົງກັບ stockQty ເມື່ອເປີດຄືນ.
    const live = await prisma.stockLot.count({ where: { productId: id, qtyOnHand: { gt: 0 } } });
    if (live > 0) throw ApiError.conflict('ປິດການຕິດຕາມ lot ບໍ່ໄດ້ — ຍັງມີ lot ທີ່ມີສະຕັອກຄົງເຫຼືອ');
  }
  const p = await prisma.product.update({
    where: { id },
    data: {
      ...(input.trackLot !== undefined ? { trackLot: input.trackLot } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.costPrice !== undefined ? { costPrice: costDec(input.costPrice) } : {}),
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
  lot: { select: { lotNumber: true } },
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
    // C4 — null ສຳລັບແຖວເກົ່າກ່ອນ migration ນີ້ (ບໍ່ backfill ຍ້ອນຫຼັງ). ສະແດງດ້ວຍ money() (2dp)
    // ຄືກັບຄ່າເງິນອື່ນໆ — ຄວາມລະອຽດ 4dp ຂອງ WAC ໃຊ້ສະເພາະຕອນ *ຄິດໄລ່* ພາຍໃນ (ດູ wacAfterReceipt).
    unitCost: m.unitCost != null ? money(m.unitCost) : null,
    valueChange: m.valueChange != null ? money(m.valueChange) : null,
    lotId: m.lotId,
    lotNumber: m.lot?.lotNumber ?? null,
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

/**
 * C4 — ຕົ້ນທຶນສິນຄ້າທີ່ຖືກໃຊ້ໄປ (COGS) ໃນຊ່ວງເວລາ/ສາຂາທີ່ກຳນົດ — sum(valueChange) ຂອງ
 * SERVICE_CONSUMED (ເກັບເປັນລົບໃນ ledger). ໃຫ້ Finance/Dashboard ເອົາໄປທຽບກັບລາຍຮັບ = ກຳໄລຕໍ່ບໍລິການ.
 * ແຖວເກົ່າກ່ອນ migration ນີ້ມີ valueChange = null → ບໍ່ນັບ (ບໍ່ແມ່ນສູນ, ພຽງແຕ່ບໍ່ຮູ້ຄ່າ).
 */
export async function getCogsSummary(q: CogsSummaryQuery): Promise<CogsSummaryView> {
  const where = movementWhere({ ...q, type: 'SERVICE_CONSUMED' });
  const agg = await prisma.stockMovement.aggregate({ where, _sum: { valueChange: true } });
  return { totalCogs: money(Math.abs(qnum(agg._sum.valueChange))) };
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
      select: { id: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
    });
    if (!product) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
    assertBranchScope(authBranchId, product.branchId);
    const balance = qnum(product.stockQty) + input.delta;
    if (balance < 0) throw ApiError.conflict('ປັບບໍ່ໄດ້ — ສະຕັອກຈະຕິດລົບ');
    // C5 — ເພີ່ມເຂົ້າສິນຄ້າ trackLot ຕ້ອງບອກ lot (ຫຼັກດຽວກັບການຮັບ PO); ຫັກອອກໃຊ້ FEFO ອັດຕະໂນມັດ.
    if (input.delta > 0 && product.trackLot && !input.lot) {
      throw ApiError.badRequest('ສິນຄ້ານີ້ຕິດຕາມ lot — ຕ້ອງລະບຸເລກ lot ເມື່ອປັບເພີ່ມສະຕັອກ');
    }
    await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
    // C4 — ການປັບດ້ວຍມືບໍ່ແມ່ນການຊື້, ຈຶ່ງບໍ່ປ່ຽນ WAC (costPrice) — ແຕ່ບັນທຶກ unitCost/valueChange
    // ໄວ້ໃນ ledger ນຳ ໂດຍໃຊ້ WAC ປັດຈຸບັນ ເພື່ອໃຫ້ valued ledger ຄົບຖ້ວນ.
    const currentCost = costNum(product.costPrice);
    if (input.delta < 0) {
      const rows = await deductStock(tx, {
        productId: product.id,
        branchId: product.branchId,
        trackLot: product.trackLot,
        wac: currentCost,
        qty: Math.abs(input.delta),
        balanceBefore: qnum(product.stockQty),
        type: 'ADJUSTMENT_DEDUCT',
        notes: input.notes ?? 'ປັບສະຕັອກດ້ວຍມື',
        createdByUserId,
      });
      // ຕັດຂ້າມຫຼາຍ lot ໄດ້ຫຼາຍແຖວ — ຄືນແຖວທຳອິດ (lot ທີ່ໃກ້ໝົດອາຍຸສຸດ) ເປັນຕົວແທນ.
      return toMovementView(rows[0]!);
    }
    const lotId =
      product.trackLot && input.lot
        ? await receiveIntoLot(tx, {
            productId: product.id,
            branchId: product.branchId,
            lotNumber: input.lot.lotNumber,
            expiryDate: toDateOnly(input.lot.expiryDate),
            mfgDate: toDateOnly(input.lot.mfgDate),
            qty: input.delta,
            unitCost: currentCost,
          })
        : null;
    const m = await tx.stockMovement.create({
      data: {
        branchId: product.branchId,
        productId: product.id,
        type: 'ADJUSTMENT_ADD',
        qty: qdec(input.delta),
        balanceAfter: qdec(balance),
        unitCost: costDec(currentCost),
        valueChange: money(input.delta * currentCost),
        lotId,
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
          costPrice: true,
          trackLot: true,
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
    const fresh = await tx.product.findFirst({
      where: { id: c.productId },
      select: { stockQty: true, costPrice: true, trackLot: true },
    });
    const balanceBefore = qnum(fresh?.stockQty ?? c.product.stockQty);
    const balance = balanceBefore - use;
    if (balance < 0 && !c.product.branch.allowNegativeStock) {
      throw ApiError.conflict(`ສະຕັອກສິນຄ້າ "${c.product.name}" ບໍ່ພຽງພໍສຳລັບຕັດ BOM ຂອງບໍລິການນີ້`);
    }
    // C4 — COGS = qty × WAC *ກ່ອນ* ຕັດ (ບໍ່ແມ່ນ WAC ໃໝ່) — ການບໍລິໂພກບໍ່ປ່ຽນ WAC ເລີຍ.
    const avgCostBefore = costNum(fresh?.costPrice ?? c.product.costPrice);
    await tx.product.update({ where: { id: c.productId }, data: { stockQty: qdec(balance) } });
    // C5 — trackLot: FEFO ຂ້າມຫຼາຍ lot (ໜຶ່ງແຖວ ledger ຕໍ່ lot, ຕົ້ນທຶນຂອງ lot ນັ້ນ) — ດູ deductStock.
    // idempotency ຂ້າງເທິງກວດຕາມ (productId, refId) ບໍ່ແມ່ນ lot ຈຶ່ງບໍ່ຕັດຊ້ຳເມື່ອມີຫຼາຍແຖວ.
    await deductStock(tx, {
      productId: c.productId,
      branchId: c.product.branchId,
      trackLot: fresh?.trackLot ?? c.product.trackLot,
      wac: avgCostBefore,
      qty: use,
      balanceBefore,
      type: 'SERVICE_CONSUMED',
      refId,
      notes:
        balance < 0
          ? 'ຕັດສະຕັອກຈາກ BOM ບໍລິການ — ⚠️ ຕິດລົບ (ອະນຸຍາດຕາມການຕັ້ງຄ່າສາຂາ)'
          : 'ຕັດສະຕັອກຈາກ BOM ບໍລິການ',
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
  items: { include: { product: { select: { name: true, sku: true, unit: true, trackLot: true } } } },
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
            trackLot: it.product.trackLot,
            lotNumber: it.lotNumber,
            expiryDate: fromDateOnly(it.expiryDate),
            mfgDate: fromDateOnly(it.mfgDate),
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
            lotNumber: it.lotNumber ?? null,
            expiryDate: toDateOnly(it.expiryDate),
            mfgDate: toDateOnly(it.mfgDate),
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
          lotNumber: it.lotNumber ?? null,
          expiryDate: toDateOnly(it.expiryDate),
          mfgDate: toDateOnly(it.mfgDate),
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
  input: PurchaseOrderReceiveInput = {},
): Promise<PurchaseOrderView> {
  const po = await prisma.$transaction(async (tx) => {
    // C1 — lock ແຖວ PO ນີ້ກ່ອນ ເພື່ອກັນ 2 request "ຮັບເຄື່ອງ" ພ້ອມກັນ (ຖ້າບໍ່ lock, ທັງສອງອາດ
    // ຜ່ານການກວດ status='RECEIVED' ພ້ອມກັນ ແລ້ວເພີ່ມສະຕັອກຊ້ຳ 2 ເທື່ອ).
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          select: { id: true, productId: true, quantity: true, unitCost: true, lotNumber: true, expiryDate: true, mfgDate: true },
        },
      },
    });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    assertBranchScope(authBranchId, existing.branchId);
    if (existing.status === 'RECEIVED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຮັບເຄື່ອງແລ້ວ');
    if (existing.status === 'CANCELLED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຖືກຍົກເລີກ');

    // C5 — ຂໍ້ມູນ lot ທີ່ສົ່ງມາຕອນຮັບເຄື່ອງ (ຕາມ productId) ທັບຄ່າທີ່ບັນທຶກໃນ PO item.
    const lotByProduct = new Map((input.lots ?? []).map((l) => [l.productId, l]));
    for (const pid of lotByProduct.keys()) {
      if (!existing.items.some((it) => it.productId === pid)) {
        throw ApiError.badRequest('ມີ lot ທີ່ບໍ່ຢູ່ໃນລາຍການຂອງ PO ນີ້');
      }
    }

    for (const it of existing.items) {
      // C1 — lock ແຖວສິນຄ້າກ່ອນອ່ານ/ບວກສະຕັອກ (ຄືກັນກັບ adjustStock/consumeServiceStock).
      await lockProductRow(tx, it.productId);
      const product = await tx.product.findUnique({
        where: { id: it.productId },
        select: { id: true, name: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
      });
      if (!product) continue;
      const onHandBefore = qnum(product.stockQty);
      const qtyReceived = qnum(it.quantity);
      const unitCostReceived = costNum(it.unitCost);
      const balance = onHandBefore + qtyReceived;
      // C5 — ສິນຄ້າ trackLot ຮັບໂດຍບໍ່ມີເລກ lot ບໍ່ໄດ້ (ຈະເຮັດໃຫ້ FEFO/recall ໃຊ້ບໍ່ໄດ້).
      let lotId: string | null = null;
      if (product.trackLot) {
        const supplied = lotByProduct.get(it.productId);
        const lotNumber = supplied?.lotNumber ?? it.lotNumber;
        if (!lotNumber) throw ApiError.badRequest(`ສິນຄ້າ "${product.name}" ຕິດຕາມ lot — ຕ້ອງລະບຸເລກ lot ຕອນຮັບເຄື່ອງ`);
        const expiryDate = supplied ? toDateOnly(supplied.expiryDate) : it.expiryDate;
        const mfgDate = supplied ? toDateOnly(supplied.mfgDate) : it.mfgDate;
        lotId = await receiveIntoLot(tx, {
          productId: product.id,
          branchId: product.branchId,
          lotNumber,
          expiryDate,
          mfgDate,
          qty: qtyReceived,
          unitCost: unitCostReceived,
          poItemId: it.id,
        });
        // ບັນທຶກ lot ທີ່ຮັບຈິງໄວ້ໃນ PO item ເປັນຫຼັກຖານ
        await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { lotNumber, expiryDate, mfgDate } });
      }
      // C4 — WAC ໃໝ່ຈາກຍອດເກົ່າ + ລາຍການທີ່ຮັບເຂົ້າ ຄັ້ງນີ້ (ຕາມ unitCost ຂອງແຕ່ລະລາຍການ PO).
      const newWac = wacAfterReceipt(onHandBefore, costNum(product.costPrice), qtyReceived, unitCostReceived);
      await tx.product.update({
        where: { id: product.id },
        data: { stockQty: qdec(balance), costPrice: costDec(newWac) },
      });
      await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          type: 'PURCHASE_IN',
          qty: qdec(qtyReceived),
          balanceAfter: qdec(balance),
          unitCost: costDec(unitCostReceived),
          valueChange: money(qtyReceived * unitCostReceived),
          lotId,
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
            lotNumber: it.lotNumber,
            expiryDate: fromDateOnly(it.expiryDate),
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
      select: { id: true, name: true, sku: true, unit: true, costPrice: true, trackLot: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    // C5 — ສິນຄ້າ trackLot ຕ້ອງເລືອກ lot ຕົ້ນທາງ (snapshot ເລກ lot/ວັນໝົດອາຍຸ ໄປປາຍທາງ).
    const lotOf = new Map<string, Awaited<ReturnType<typeof tx.stockLot.findMany>>[number]>();
    for (const it of input.items) {
      const p = byId.get(it.productId)!;
      if (!p.trackLot) continue;
      if (!it.lotId) throw ApiError.badRequest(`ສິນຄ້າ "${p.name}" ຕິດຕາມ lot — ຕ້ອງເລືອກ lot ທີ່ຈະໂອນ`);
      const lot = await tx.stockLot.findUnique({ where: { id: it.lotId } });
      if (!lot || lot.productId !== it.productId || lot.branchId !== input.fromBranchId) {
        throw ApiError.badRequest(`Lot ຂອງ "${p.name}" ບໍ່ຖືກຕ້ອງ`);
      }
      lotOf.set(it.productId, lot);
    }
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
            const lot = lotOf.get(it.productId);
            return {
              productId: it.productId,
              productName: p.name,
              sku: p.sku,
              unit: p.unit,
              quantity: qdec(it.quantity),
              // ມີ lot → ຕົ້ນທຶນຂອງ lot ຕິດຕາມໄປກັບເຄື່ອງ (ບໍ່ແມ່ນ WAC ລວມຂອງສິນຄ້າ).
              unitCost: lot ? lot.unitCost : p.costPrice,
              lotNumber: lot?.lotNumber ?? null,
              expiryDate: lot?.expiryDate ?? null,
              mfgDate: lot?.mfgDate ?? null,
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
        select: { id: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
      });
      if (!product) throw ApiError.conflict(`ສິນຄ້າ "${it.productName}" ຖືກລຶບໄປແລ້ວ — ໂອນບໍ່ໄດ້`);
      const balance = qnum(product.stockQty) - qnum(it.quantity);
      if (balance < 0 && !fromBranch?.allowNegativeStock) {
        throw ApiError.conflict(`ສະຕັອກ "${it.productName}" ບໍ່ພຽງພໍສຳລັບການໂອນນີ້`);
      }
      // C5 — ໂອນສິນຄ້າ trackLot ຕັດຈາກ lot ທີ່ເລືອກໄວ້ຕອນສ້າງລາຍການ (ບໍ່ FEFO — ຜູ້ໃຊ້ເລືອກ lot ເອງ).
      // lot ບໍ່ຕິດລົບໄດ້ ຈຶ່ງຕ້ອງພຽງພໍສະເໝີ ແມ່ນສາຂາຈະເປີດ allowNegativeStock.
      if (product.trackLot && !it.lotNumber) {
        throw ApiError.conflict(`ສິນຄ້າ "${it.productName}" ເປີດຕິດຕາມ lot ຫຼັງສ້າງລາຍການ — ສ້າງລາຍການໃໝ່ ແລະ ເລືອກ lot`);
      }
      if (it.lotNumber) {
        const lot = await tx.stockLot.findUnique({
          where: {
            productId_branchId_lotNumber: {
              productId: product.id,
              branchId: product.branchId,
              lotNumber: it.lotNumber,
            },
          },
        });
        if (!lot || qnum(lot.qtyOnHand) < qnum(it.quantity)) {
          throw ApiError.conflict(`Lot ${it.lotNumber} ຂອງ "${it.productName}" ມີສະຕັອກບໍ່ພຽງພໍສຳລັບການໂອນນີ້`);
        }
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { qtyOnHand: qdec(qnum(lot.qtyOnHand) - qnum(it.quantity)) },
        });
        await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
        await tx.stockMovement.create({
          data: {
            branchId: product.branchId,
            productId: product.id,
            type: 'TRANSFER_OUT',
            qty: qdec(qnum(it.quantity)),
            balanceAfter: qdec(balance),
            unitCost: costDec(costNum(lot.unitCost)),
            valueChange: money(-(qnum(it.quantity) * costNum(lot.unitCost))),
            lotId: lot.id,
            refId: `transfer:${id}`,
            notes: `ໂອນອອກ ${existing.transferNumber}`,
            createdByUserId: createdByUserId ?? null,
          },
        });
        continue;
      }
      // C4 — ໂອນອອກບໍ່ແມ່ນການຊື້, ບໍ່ປ່ຽນ WAC — ຄ່າ unitCost/valueChange ໃນ ledger ໃຊ້ WAC ປັດຈຸບັນ
      // ຂອງສາຂາຕົ້ນທາງ ณ ເວລາສົ່ງ (ນີ້ຄືມູນຄ່າທີ່ "ອອກ" ໄປຈາກສາງຕົ້ນທາງ).
      const costAtSend = costNum(product.costPrice);
      await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
      await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          type: 'TRANSFER_OUT',
          qty: qdec(qnum(it.quantity)),
          balanceAfter: qdec(balance),
          unitCost: costDec(costAtSend),
          valueChange: money(-(qnum(it.quantity) * costAtSend)),
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
        select: { id: true, trackLot: true },
      });
      if (!dest) {
        // C4 — ສິນຄ້າໃໝ່ຢູ່ປາຍທາງ: WAC ເລີ່ມຕົ້ນ = ຕົ້ນທຶນຂອງລາຍການໂອນນີ້ (ບໍ່ມີຍອດເກົ່າໃຫ້ຖົວສະເລ່ຍ).
        dest = await tx.product.create({
          data: {
            branchId: existing.toBranchId,
            name: it.productName,
            sku: it.sku,
            unit: it.unit,
            costPrice: costDec(costNum(it.unitCost)),
            stockQty: qdec(0),
            minStockQty: qdec(5),
            trackLot: !!it.lotNumber,
          },
          select: { id: true, trackLot: true },
        });
      }
      await lockProductRow(tx, dest.id);
      // C5 — ຂອງທີ່ມາພ້ອມ lot ຕ້ອງຖືກຕິດຕາມເປັນ lot ຢູ່ປາຍທາງນຳ → ເປີດ trackLot ໃຫ້ອັດຕະໂນມັດ
      // (ສະຕັອກເກົ່າຂອງປາຍທາງທີ່ບໍ່ມີ lot ຍັງຢູ່ໃນສ່ວນ "ບໍ່ມີ lot" ທີ່ FEFO ຕັດເປັນອັນດັບສຸດທ້າຍ).
      if (it.lotNumber && !dest.trackLot) {
        await tx.product.update({ where: { id: dest.id }, data: { trackLot: true } });
      }
      const fresh = await tx.product.findFirst({ where: { id: dest.id }, select: { stockQty: true, costPrice: true } });
      const onHandBefore = qnum(fresh?.stockQty ?? 0);
      const qtyReceived = qnum(it.quantity);
      const unitCostReceived = costNum(it.unitCost);
      const balance = onHandBefore + qtyReceived;
      // ສິນຄ້າໃໝ່: onHandBefore = 0 ຢູ່ແລ້ວ (stockQty ເລີ່ມ 0) → wacAfterReceipt ໃຫ້ຄ່າ unitCostReceived ພໍດີ.
      const newWac = wacAfterReceipt(onHandBefore, costNum(fresh?.costPrice), qtyReceived, unitCostReceived);
      await tx.product.update({
        where: { id: dest.id },
        data: { stockQty: qdec(balance), costPrice: costDec(newWac) },
      });
      await tx.stockTransferItem.update({ where: { id: it.id }, data: { receivedProductId: dest.id } });
      const lotId = it.lotNumber
        ? await receiveIntoLot(tx, {
            productId: dest.id,
            branchId: existing.toBranchId,
            lotNumber: it.lotNumber,
            expiryDate: it.expiryDate,
            mfgDate: it.mfgDate,
            qty: qtyReceived,
            unitCost: unitCostReceived,
          })
        : null;
      await tx.stockMovement.create({
        data: {
          branchId: existing.toBranchId,
          productId: dest.id,
          type: 'TRANSFER_IN',
          qty: qdec(qtyReceived),
          balanceAfter: qdec(balance),
          unitCost: costDec(unitCostReceived),
          valueChange: money(qtyReceived * unitCostReceived),
          lotId,
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

// ============================================================ Lots — list + recall usage (C5)

export async function listStockLots(
  q: StockLotListQuery,
  authBranchId?: string | null,
): Promise<Paginated<StockLotView>> {
  const now = new Date();
  const where: Prisma.StockLotWhereInput = {
    product: { deletedAt: null },
    // BRANCH_ADMIN ເຫັນສະເພາະ lot ຂອງສາຂາຕົນ
    ...(authBranchId ? { branchId: authBranchId } : q.branchId ? { branchId: q.branchId } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.includeEmpty === 'true' ? {} : { qtyOnHand: { gt: 0 } }),
    ...(q.expiringWithinDays != null
      ? {
          expiryDate: {
            not: null,
            lte: new Date(vientianeDateKey(now).getTime() + q.expiringWithinDays * 86_400_000),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockLot.findMany({
      where,
      include: LOT_INCLUDE,
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockLot.count({ where }),
  ]);
  return {
    items: rows.map((r) => toLotView(r, now)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/**
 * C5 recall — lot ນີ້ຖືກໃຊ້ກັບນັດໝາຍ/ລູກຄ້າຄົນໃດ (SERVICE_CONSUMED ທີ່ refId = `appt:<id>`) ແລະ ຖືກໂອນ
 * ໄປສາຂາໃດແດ່ (TRANSFER_OUT). lot ທີ່ຖືກໂອນຈະກາຍເປັນແຖວ StockLot ໃໝ່ຢູ່ສາຂາປາຍທາງ (ເລກ lot ດຽວກັນ)
 * — ຜູ້ເອີ້ນຕ້ອງຕາມດູ usage ຂອງ lot ປາຍທາງນັ້ນຕໍ່ (ຜ່ານ transfersOut ເພື່ອຮູ້ວ່າໄປສາຂາໃດ).
 */
export async function getLotUsage(lotId: string, authBranchId?: string | null): Promise<LotUsageView> {
  const lot = await prisma.stockLot.findUnique({ where: { id: lotId }, include: LOT_INCLUDE });
  if (!lot) throw ApiError.notFound('ບໍ່ພົບ lot');
  if (authBranchId && authBranchId !== lot.branchId) {
    throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະ lot ຂອງສາຂາຂອງທ່ານ');
  }
  const [consumed, sentOut] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { lotId, type: 'SERVICE_CONSUMED' },
      orderBy: { createdAt: 'asc' },
      select: { refId: true, qty: true, createdAt: true },
    }),
    prisma.stockMovement.findMany({
      where: { lotId, type: 'TRANSFER_OUT' },
      orderBy: { createdAt: 'asc' },
      select: { refId: true, qty: true, createdAt: true },
    }),
  ]);

  const apptQty = new Map<string, { qty: number; at: Date }>();
  for (const m of consumed) {
    if (!m.refId?.startsWith('appt:')) continue;
    const aid = m.refId.slice('appt:'.length);
    const prev = apptQty.get(aid);
    apptQty.set(aid, { qty: (prev?.qty ?? 0) + qnum(m.qty), at: prev?.at ?? m.createdAt });
  }
  const appts = apptQty.size
    ? await prisma.appointment.findMany({
        where: { id: { in: [...apptQty.keys()] } },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          service: { select: { name: true } },
        },
      })
    : [];
  const appointments = appts
    .map((a) => ({
      appointmentId: a.id,
      startAt: a.startAt.toISOString(),
      status: a.status,
      serviceName: a.service.name,
      customerId: a.customer.id,
      customerName: a.customer.name,
      customerPhone: a.customer.phone ?? null,
      qty: qnum(apptQty.get(a.id)!.qty),
      consumedAt: apptQty.get(a.id)!.at.toISOString(),
    }))
    .sort((x, y) => x.consumedAt.localeCompare(y.consumedAt));

  const transferIds = sentOut
    .map((m) => (m.refId?.startsWith('transfer:') ? m.refId.slice('transfer:'.length) : null))
    .filter((v): v is string => v != null);
  const transfers = transferIds.length
    ? await prisma.stockTransfer.findMany({
        where: { id: { in: transferIds } },
        include: { toBranch: { select: { name: true } } },
      })
    : [];
  const transfersOut = sentOut.flatMap((m) => {
    const t = transfers.find((x) => m.refId === `transfer:${x.id}`);
    return t
      ? [
          {
            transferId: t.id,
            transferNumber: t.transferNumber,
            toBranchId: t.toBranchId,
            toBranchName: t.toBranch.name,
            qty: qnum(m.qty),
            sentAt: (t.sentAt ?? m.createdAt).toISOString(),
          },
        ]
      : [];
  });

  return {
    lot: toLotView(lot),
    appointments,
    customerCount: new Set(appointments.map((a) => a.customerId)).size,
    totalConsumedQty: qnum(consumed.reduce((sum, m) => sum + qnum(m.qty), 0)),
    transfersOut,
  };
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
