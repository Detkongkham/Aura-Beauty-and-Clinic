import { randomUUID } from 'node:crypto';
import {
  STOCK_SHRINKAGE_REASONS,
  type AccessTokenPayload,
  type AssignUnlottedInput,
  type CogsSummaryQuery,
  type CogsSummaryView,
  type InventoryStatsView,
  type LotUsageView,
  type Paginated,
  type ProductCreateInput,
  type ProductListQuery,
  type ProductUpdateInput,
  type ProductView,
  type GoodsReceiptCreateInput,
  type GoodsReceiptLineInput,
  type GoodsReceiptView,
  type PoStatusValue,
  type ProductLookupMatch,
  type ProductLookupQuery,
  type PurchaseOrderCloseShortInput,
  type PurchaseOrderCreateInput,
  type PurchaseOrderItemInput,
  type PurchaseOrderListQuery,
  type PurchaseOrderRejectInput,
  type PurchaseOrderReceiveInput,
  type PurchaseOrderUpdateInput,
  type PurchaseOrderView,
  type PurchaseOrderRevisionChange,
  type PurchaseOrderRevisionView,
  type ServiceMarginQuery,
  type ServiceMarginView,
  type StockAdjustInput,
  type StockAdjustReasonValue,
  type StockAdjustRejectInput,
  type StockAdjustRequestListQuery,
  type StockAdjustRequestView,
  type StockAdjustResult,
  type StockAdjustSettingsInput,
  type StockAdjustSettingsView,
  type StockLotListQuery,
  type StockLotStatusValue,
  type StockLotView,
  type StockMovementListQuery,
  type StockMovementStatsQuery,
  type StockMovementStatsView,
  type StockMovementTypeValue,
  type StockMovementView,
  type StockTransferCreateInput,
  type StockTransferListQuery,
  type StockTransferView,
  type SupplierListQuery,
  type SupplierProductView,
  type SupplierProductWriteInput,
  type SupplierView,
  type SupplierWriteInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../../services/push.js';
import { storage } from '../../storage/index.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import { resolveFxRate } from '../../utils/fxRate.js';
import { markReservationsConsumed, onOrderByProduct, reservedByProduct } from './reservation.service.js';
import {
  assertCategoryForBranch,
  bomBaseQty,
  categoryIdsWithChildren,
  categoryLabel,
  factorDec,
  factorNum,
  resolveUomFactors,
  syncProductConversions,
  uomIdForUnitText,
} from './inventory-master.service.js';

type Tx = Prisma.TransactionClient;

/**
 * BRANCH_ADMIN (authBranchId != null) ແກ້ໄຂໄດ້ສະເພາະສະຕັອກຂອງສາຂາຕົນ;
 * SUPER_ADMIN (authBranchId == null) ບໍ່ຈຳກັດ. ໃຊ້ກັບ write ເທົ່ານັ້ນ — read ບໍ່ຈຳກັດ.
 */
export function assertBranchScope(authBranchId: string | null | undefined, targetBranchId: string): void {
  if (authBranchId && authBranchId !== targetBranchId) {
    throw ApiError.forbidden('ແກ້ໄຂໄດ້ສະເພາະສະຕັອກຂອງສາຂາຂອງທ່ານ');
  }
}

/** ຈຳນວນ → Decimal(3dp) (ສະຕັອກ/BOM ຮອງຮັບເສດ). */
export function qdec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(3));
}
/** Decimal|number → number (3dp, ຕັດ -0). */
export function qnum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;
}
export function money(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 100) / 100 || 0;
}

/**
 * C4 — `Product.costPrice` ຕອນນີ້ເປັນ WAC ທີ່ອັບເດດທຸກຄັ້ງທີ່ຮັບເຄື່ອງ (ດູ `wacAfterReceipt`).
 * ເກັບ 4dp (ບໍ່ແມ່ນ 2dp ຄືກັບ `money()`) ເພື່ອບໍ່ໃຫ້ຄ່າສະເລ່ຍຄາດເຄື່ອນສະສົມເມື່ອຮັບເຄື່ອງຫຼາຍຄັ້ງ —
 * ໜ້າ UI ຍັງສະແດງດ້ວຍ `money()`/`CurrencyText` ຕາມປົກກະຕິ (2dp), ນີ້ຄືແຕ່ຄ່າ *ເກັບ/ຄິດໄລ່* ເທົ່ານັ້ນ.
 */
export function costDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(4));
}
/** Decimal(4dp) → number ແບບບໍ່ຕັດເຫຼືອ 2dp — ໃຊ້ຕອນອ່ານ costPrice ມາຄິດ WAC ໃໝ່ຕໍ່. */
export function costNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Math.round((n + Number.EPSILON) * 10000) / 10000 || 0;
}

/**
 * C4 — Weighted Average Cost. ໃຊ້ຕອນຮັບເຄື່ອງເຂົ້າ (PURCHASE_IN/TRANSFER_IN) ເທົ່ານັ້ນ — ການຕັດ
 * ອອກ (SERVICE_CONSUMED/TRANSFER_OUT/ADJUSTMENT) ບໍ່ປ່ຽນ WAC (ມາດຕະຖານ moving-average costing).
 */
export function wacAfterReceipt(
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
export async function lockProductRow(tx: Tx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${productId} FOR UPDATE`;
}

// ============================================================ Lots (C5)

/** ≤ ຈຳນວນວັນນີ້ກ່ອນໝົດອາຍຸ ຖືວ່າ "ໃກ້ໝົດອາຍຸ" (ໃຊ້ທັງ UI ແລະ job ແຈ້ງເຕືອນ). */
export const LOT_EXPIRY_WARN_DAYS = 60;

/** 'YYYY-MM-DD' → Date (UTC midnight) ສຳລັບຖັນ @db.Date. */
export function toDateOnly(v: string | null | undefined): Date | null {
  return v ? new Date(`${v}T00:00:00.000Z`) : null;
}
export function fromDateOnly(d: Date | null | undefined): string | null {
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
export async function receiveIntoLot(
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
export async function deductStock(
  tx: Tx,
  a: {
    productId: string;
    branchId: string;
    trackLot: boolean;
    wac: number;
    qty: number;
    balanceBefore: number;
    type: 'SERVICE_CONSUMED' | 'ADJUSTMENT_DEDUCT' | 'RETURN_TO_SUPPLIER' | 'SOLD';
    refId?: string;
    notes: string;
    createdByUserId?: string | null;
    reasonCode?: StockAdjustReasonValue | null;
    attachmentUrl?: string | null;
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
          reasonCode: a.reasonCode ?? null,
          attachmentUrl: a.attachmentUrl ?? null,
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

// ============================================================ Suppliers (M8/M9/M20)

type SupplierAuth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'> | null;

const SUPPLIER_INCLUDE = {
  branch: { select: { name: true } },
  _count: { select: { purchaseOrders: true, supplierProducts: true } },
} satisfies Prisma.SupplierInclude;
type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof SUPPLIER_INCLUDE }>;

function toSupplierView(s: SupplierRow): SupplierView {
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    taxId: s.taxId,
    paymentTermsDays: s.paymentTermsDays,
    leadTimeDays: s.leadTimeDays,
    currency: s.currency,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNo: s.bankAccountNo,
    isActive: s.isActive,
    deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
    branchId: s.branchId,
    branchName: s.branch?.name ?? null,
    purchaseOrderCount: s._count.purchaseOrders,
    priceListCount: s._count.supplierProducts,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** M9 — ຜູ້ສະໜອງທີ່ສາຂານີ້ເຫັນ/ໃຊ້ໄດ້: ຂອງສາຂາຕົນ + ທີ່ໃຊ້ຮ່ວມ (branchId null). */
function supplierBranchWhere(branchId: string | null | undefined): Prisma.SupplierWhereInput {
  return branchId ? { OR: [{ branchId: null }, { branchId }] } : {};
}

/**
 * M9 — ສິດຂຽນ: ຜູ້ສະໜອງທີ່ໃຊ້ຮ່ວມ (branchId null) = SUPER_ADMIN ເທົ່ານັ້ນ; ຜູ້ສະໜອງຂອງສາຂາ = SUPER_ADMIN ຫຼື
 * BRANCH_ADMIN ຂອງສາຂານັ້ນ (ຫຼັກດຽວກັບ assertBranchScope).
 */
function assertSupplierWrite(auth: SupplierAuth, supplierBranchId: string | null): void {
  if (auth?.role === 'SUPER_ADMIN') return;
  if (supplierBranchId == null) throw ApiError.forbidden('ຜູ້ສະໜອງທີ່ໃຊ້ຮ່ວມທຸກສາຂາ ແກ້ໄຂໄດ້ສະເພາະ SUPER_ADMIN');
  if (!auth?.branchId || auth.branchId !== supplierBranchId) {
    throw ApiError.forbidden('ແກ້ໄຂໄດ້ສະເພາະຜູ້ສະໜອງຂອງສາຂາຂອງທ່ານ');
  }
}

export async function listSuppliers(q: SupplierListQuery, auth: SupplierAuth = null): Promise<Paginated<SupplierView>> {
  if (auth?.branchId && q.branchId && q.branchId !== auth.branchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  const and: Prisma.SupplierWhereInput[] = [
    { deletedAt: null },
    supplierBranchWhere(auth?.branchId ?? q.branchId),
    ...(q.activeOnly === 'true' ? [{ isActive: true }] : []),
    ...(q.q
      ? [
          {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' as const } },
              { contactPerson: { contains: q.q, mode: 'insensitive' as const } },
              { phone: { contains: q.q, mode: 'insensitive' as const } },
              { taxId: { contains: q.q, mode: 'insensitive' as const } },
            ],
          },
        ]
      : []),
  ];
  const where: Prisma.SupplierWhereInput = { AND: and };
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
      include: SUPPLIER_INCLUDE,
    }),
    prisma.supplier.count({ where }),
  ]);
  return {
    items: rows.map(toSupplierView),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/** ຜູ້ສະໜອງທີ່ຖືກ soft-delete ຍັງອ່ານໄດ້ (PO ເກົ່າອ້າງອີງ). BRANCH_ADMIN ເຫັນສະເພາະຂອງສາຂາຕົນ + ທີ່ໃຊ້ຮ່ວມ. */
export async function getSupplier(id: string, auth: SupplierAuth = null): Promise<SupplierView> {
  const s = await prisma.supplier.findUnique({ where: { id }, include: SUPPLIER_INCLUDE });
  if (!s) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  if (auth?.branchId && s.branchId && s.branchId !== auth.branchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງຜູ້ສະໜອງຂອງສາຂາອື່ນ');
  return toSupplierView(s);
}

function supplierExtraData(input: SupplierWriteInput): Prisma.SupplierUncheckedUpdateInput {
  return {
    ...(input.taxId !== undefined ? { taxId: input.taxId || null } : {}),
    ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
    ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.bankName !== undefined ? { bankName: input.bankName || null } : {}),
    ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName || null } : {}),
    ...(input.bankAccountNo !== undefined ? { bankAccountNo: input.bankAccountNo || null } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
}

export async function createSupplier(input: SupplierWriteInput, auth: SupplierAuth = null): Promise<SupplierView> {
  // M9 — BRANCH_ADMIN: ບໍ່ລະບຸສາຂາ = ສາຂາຕົນ; ສ້າງແບບໃຊ້ຮ່ວມ (null) ຫຼື ໃຫ້ສາຂາອື່ນບໍ່ໄດ້.
  const branchId = input.branchId !== undefined ? input.branchId : auth?.role === 'SUPER_ADMIN' ? null : (auth?.branchId ?? null);
  assertSupplierWrite(auth, branchId);
  if (branchId) {
    const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!b) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  }
  const s = await prisma.supplier.create({
    data: {
      ...(supplierExtraData(input) as Omit<Prisma.SupplierUncheckedCreateInput, 'name' | 'phone'>),
      name: input.name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone,
      email: input.email ?? null,
      address: input.address ?? null,
      branchId,
    },
    include: SUPPLIER_INCLUDE,
  });
  return toSupplierView(s);
}

export async function updateSupplier(id: string, input: SupplierWriteInput, auth: SupplierAuth = null): Promise<SupplierView> {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  assertSupplierWrite(auth, existing.branchId);
  // ຍ້າຍສາຂາ (ຫຼື ປ່ຽນເປັນໃຊ້ຮ່ວມ) = ສິດຂອງປາຍທາງກໍຕ້ອງຜ່ານນຳ.
  if (input.branchId !== undefined && input.branchId !== existing.branchId) {
    assertSupplierWrite(auth, input.branchId);
    if (input.branchId) {
      const b = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
      if (!b) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
    }
  }
  const bankChanged =
    (input.bankName !== undefined && (input.bankName || null) !== existing.bankName) ||
    (input.bankAccountName !== undefined && (input.bankAccountName || null) !== existing.bankAccountName) ||
    (input.bankAccountNo !== undefined && (input.bankAccountNo || null) !== existing.bankAccountNo);
  const s = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({
      where: { id },
      data: {
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...supplierExtraData(input),
      },
      include: SUPPLIER_INCLUDE,
    });
    // ບັນຊີຮັບເງິນຂອງຜູ້ສະໜອງປ່ຽນ = ຈຸດສ່ຽງການສໍ້ໂກງ (payee fraud) → ເກັບຄ່າກ່ອນ/ຫຼັງໄວ້ໃນ AuditLog ສະເໝີ.
    if (bankChanged) {
      await tx.auditLog.create({
        data: {
          branchId: existing.branchId,
          userId: auth?.sub ?? null,
          action: 'SUPPLIER_BANK_CHANGE',
          entityName: 'Supplier',
          entityId: id,
          oldValue: { bankName: existing.bankName, bankAccountName: existing.bankAccountName, bankAccountNo: existing.bankAccountNo },
          newValue: { bankName: updated.bankName, bankAccountName: updated.bankAccountName, bankAccountNo: updated.bankAccountNo },
        },
      });
    }
    return updated;
  });
  return toSupplierView(s);
}

/**
 * M20 — ມີ PO / ລາຍຈ່າຍ / ໃບຄືນ ອ້າງອີງ → soft delete (deletedAt + isActive=false; ຍັງສະແດງໃນເອກະສານເກົ່າ,
 * ເຊື່ອງຈາກລາຍການ/dropdown). ບໍ່ມີ → ລຶບແທ້ (ລາຍການລາຄາ cascade).
 */
export async function deleteSupplier(id: string, auth: SupplierAuth = null): Promise<{ soft: boolean }> {
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true, expenses: true, supplierReturns: true } } },
  });
  if (!s || s.deletedAt) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  assertSupplierWrite(auth, s.branchId);
  if (s._count.purchaseOrders + s._count.expenses + s._count.supplierReturns > 0) {
    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { soft: true };
  }
  await prisma.supplier.delete({ where: { id } });
  return { soft: false };
}

/**
 * M20/M9 — ຜູ້ສະໜອງທີ່ໃຊ້ສ້າງ/ປ່ຽນ PO ໄດ້: ມີຢູ່, ບໍ່ຖືກລຶບ, active ແລະ ເປັນຂອງສາຂາ PO ຫຼື ໃຊ້ຮ່ວມ.
 */
async function assertSupplierUsable(
  db: Tx | typeof prisma,
  supplierId: string,
  branchId: string,
): Promise<{ id: string; currency: string }> {
  const s = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, isActive: true, deletedAt: true, branchId: true, currency: true },
  });
  if (!s) throw ApiError.badRequest('ບໍ່ພົບຜູ້ສະໜອງ');
  if (s.deletedAt || !s.isActive) throw ApiError.badRequest('ຜູ້ສະໜອງນີ້ຖືກປິດໃຊ້ງານ ຫຼື ລຶບແລ້ວ');
  if (s.branchId && s.branchId !== branchId) throw ApiError.badRequest('ຜູ້ສະໜອງນີ້ເປັນຂອງສາຂາອື່ນ');
  return { id: s.id, currency: s.currency };
}

// ---- M8 — price list (SupplierProduct) ---------------------------------

const SP_INCLUDE = {
  supplier: { select: { name: true } },
  uom: { select: { code: true } },
  product: { select: { name: true, sku: true, unit: true, branchId: true, branch: { select: { name: true } } } },
} satisfies Prisma.SupplierProductInclude;
type SpRow = Prisma.SupplierProductGetPayload<{ include: typeof SP_INCLUDE }>;

function toSupplierProductView(r: SpRow): SupplierProductView {
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    productId: r.productId,
    productName: r.product.name,
    sku: r.product.sku,
    unit: r.product.unit,
    branchId: r.product.branchId,
    branchName: r.product.branch.name,
    supplierSku: r.supplierSku,
    unitCost: costNum(r.unitCost),
    currency: r.currency,
    moq: r.moq != null ? qnum(r.moq) : null,
    leadTimeDays: r.leadTimeDays,
    isPreferred: r.isPreferred,
    uomId: r.uomId,
    uomCode: r.uom?.code ?? null,
    factorToBase: factorNum(r.factorToBase),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** GET /suppliers/:id/products — BRANCH_ADMIN ເຫັນສະເພາະແຖວຂອງສິນຄ້າສາຂາຕົນ. */
export async function listSupplierProducts(supplierId: string, auth: SupplierAuth = null): Promise<SupplierProductView[]> {
  const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, branchId: true } });
  if (!s) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  if (auth?.branchId && s.branchId && s.branchId !== auth.branchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງຜູ້ສະໜອງຂອງສາຂາອື່ນ');
  const rows = await prisma.supplierProduct.findMany({
    where: { supplierId, product: { deletedAt: null, ...(auth?.branchId ? { branchId: auth.branchId } : {}) } },
    include: SP_INCLUDE,
    orderBy: { product: { name: 'asc' } },
  });
  return rows.map(toSupplierProductView);
}

/**
 * PUT /suppliers/:id/products — upsert ຕາມ productId. ສິນຄ້າຕ້ອງເປັນຂອງສາຂາຜູ້ສະໜອງ (ຫຼື ຜູ້ສະໜອງໃຊ້ຮ່ວມ).
 * ສິດ: ລາຍການລາຄາເປັນຂໍ້ມູນຂອງສິນຄ້າສາຂາ → assertBranchScope(ສາຂາຂອງສິນຄ້າ) (BRANCH_ADMIN ຕັ້ງລາຄາຂອງຜູ້ສະໜອງ
 * ທີ່ໃຊ້ຮ່ວມ ສຳລັບສິນຄ້າສາຂາຕົນໄດ້ — ແຕ່ແກ້ຂໍ້ມູນຫຼັກຂອງຜູ້ສະໜອງນັ້ນບໍ່ໄດ້). isPreferred → ລ້າງຂອງຜູ້ສະໜອງອື່ນ.
 */
export async function upsertSupplierProduct(
  supplierId: string,
  input: SupplierProductWriteInput,
  auth: SupplierAuth = null,
): Promise<SupplierProductView> {
  const [s, p] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, branchId: true, deletedAt: true, currency: true } }),
    prisma.product.findFirst({ where: { id: input.productId, deletedAt: null }, select: { id: true, branchId: true } }),
  ]);
  if (!s || s.deletedAt) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  if (!p) throw ApiError.badRequest('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(auth?.branchId, p.branchId);
  if (s.branchId && s.branchId !== p.branchId) throw ApiError.badRequest('ສິນຄ້າຕ້ອງຢູ່ສາຂາດຽວກັນກັບຜູ້ສະໜອງ');
  // M1 — unitCost/moq ເປັນຕໍ່ໜ່ວຍຊື້ນີ້; snapshot ອັດຕາ (ອັບເດດຕາມເມື່ອແກ້ອັດຕາແປງຂອງສິນຄ້າ).
  const [uf] = input.uomId !== undefined ? await resolveUomFactors(prisma, [{ productId: p.id, uomId: input.uomId }]) : [undefined];
  const data = {
    ...(uf ? { uomId: uf.uomId, factorToBase: factorDec(uf.factor) } : {}),
    supplierSku: input.supplierSku ?? null,
    unitCost: costDec(input.unitCost),
    currency: input.currency ?? s.currency,
    moq: input.moq != null ? qdec(input.moq) : null,
    leadTimeDays: input.leadTimeDays ?? null,
    ...(input.isPreferred !== undefined ? { isPreferred: input.isPreferred } : {}),
  };
  const row = await prisma.$transaction(async (tx) => {
    if (input.isPreferred) {
      await tx.supplierProduct.updateMany({
        where: { productId: p.id, supplierId: { not: supplierId }, isPreferred: true },
        data: { isPreferred: false },
      });
    }
    return tx.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: p.id } },
      update: data,
      create: { ...data, supplierId, productId: p.id },
      include: SP_INCLUDE,
    });
  });
  return toSupplierProductView(row);
}

export async function deleteSupplierProduct(supplierId: string, productId: string, auth: SupplierAuth = null): Promise<void> {
  const row = await prisma.supplierProduct.findUnique({
    where: { supplierId_productId: { supplierId, productId } },
    include: { product: { select: { branchId: true } } },
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການລາຄາ');
  assertBranchScope(auth?.branchId, row.product.branchId);
  await prisma.supplierProduct.delete({ where: { id: row.id } });
}

// ============================================================ Products

const PRODUCT_INCLUDE = {
  branch: { select: { name: true } },
  baseUom: { select: { code: true } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  uomConversions: {
    include: { uom: { select: { code: true, name: true, nameLo: true } } },
    orderBy: { factorToBase: 'desc' },
  },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** M11 — ເກນສັ່ງຊື້ທີ່ໃຊ້ຈິງ = max(minStockQty ທີ່ຕັ້ງດ້ວຍມື, reorderPoint ທີ່ຄິດຈາກການໃຊ້ຈິງ). */
export function reorderThresholdOf(p: { minStockQty: Prisma.Decimal | number; reorderPoint: Prisma.Decimal | number | null }): number {
  return Math.max(qnum(p.minStockQty), p.reorderPoint != null ? qnum(p.reorderPoint) : 0);
}

type ProductExtras = { lotQty?: number; reserved?: number; onOrder?: number };

function toProductView(p: ProductRow, x: ProductExtras = {}): ProductView {
  const stockQty = qnum(p.stockQty);
  const minStockQty = qnum(p.minStockQty);
  const costPrice = money(p.costPrice);
  const reservedQty = qnum(x.reserved ?? 0);
  const availableQty = qnum(stockQty - reservedQty);
  const threshold = reorderThresholdOf(p);
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
    lowStock: stockQty > 0 && stockQty <= threshold,
    reservedQty,
    availableQty,
    onOrderQty: qnum(x.onOrder ?? 0),
    shortForUpcoming: availableQty < 0,
    reorderPoint: p.reorderPoint != null ? qnum(p.reorderPoint) : null,
    avgDailyUsage: p.avgDailyUsage != null ? costNum(p.avgDailyUsage) : null,
    reorderComputedAt: p.reorderComputedAt ? p.reorderComputedAt.toISOString() : null,
    reorderThreshold: threshold,
    trackLot: p.trackLot,
    unlottedQty: p.trackLot ? Math.max(0, qnum(stockQty - (x.lotQty ?? 0))) : 0,
    baseUomId: p.baseUomId,
    baseUomCode: p.baseUom?.code ?? null,
    conversions: p.uomConversions.map((c) => ({
      uomId: c.uomId,
      code: c.uom.code,
      name: c.uom.name,
      nameLo: c.uom.nameLo,
      factorToBase: factorNum(c.factorToBase),
      isPurchaseDefault: c.isPurchaseDefault,
      isConsumeDefault: c.isConsumeDefault,
    })),
    gtin: p.gtin,
    barcode: p.barcode,
    categoryId: p.categoryId,
    categoryName: categoryLabel(p.category),
    abcClass: p.abcClass === 'A' || p.abcClass === 'B' || p.abcClass === 'C' ? p.abcClass : null,
    isSellable: p.isSellable,
    retailPrice: p.retailPrice != null ? money(p.retailPrice) : null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Σ qtyOnHand ຂອງ lot ຕໍ່ສິນຄ້າ (ສະເພາະສິນຄ້າ trackLot) — ໃຊ້ຄິດ unlottedQty. */
async function lotQtyByProduct(rows: { id: string; trackLot: boolean }[]): Promise<Map<string, number>> {
  const ids = rows.filter((r) => r.trackLot).map((r) => r.id);
  if (!ids.length) return new Map();
  const grouped = await prisma.stockLot.groupBy({
    by: ['productId'],
    where: { productId: { in: ids } },
    _sum: { qtyOnHand: true },
  });
  return new Map(grouped.map((g) => [g.productId, qnum(g._sum.qtyOnHand)]));
}

/** ProductView ພ້ອມ lot / reserved / on-order (3 query ຕໍ່ໜ້າ ບໍ່ແມ່ນຕໍ່ແຖວ). */
async function productViews(rows: ProductRow[]): Promise<ProductView[]> {
  const ids = rows.map((r) => r.id);
  const [lots, reserved, onOrder] = await Promise.all([
    lotQtyByProduct(rows),
    reservedByProduct(ids),
    onOrderByProduct(ids),
  ]);
  return rows.map((r) =>
    toProductView(r, { lotQty: lots.get(r.id), reserved: reserved.get(r.id), onOrder: onOrder.get(r.id) }),
  );
}

/**
 * M4 — ຕົວກັ່ນ "ສະຕັອກຕ່ຳ/ໝົດ" ຝັ່ງ SQL (Prisma field reference ທຽບ 2 ຖັນ) ແທນການດຶງທຸກແຖວມາກັ່ນໃນ JS:
 * stockQty ≤ 0 ຫຼື stockQty ≤ minStockQty ຫຼື stockQty ≤ reorderPoint (= stockQty ≤ max(min, rp) — M11).
 * reorderPoint null → ການທຽບເປັນ NULL (false) → ຄວາມໝາຍເທົ່າກັບຕົວກັ່ນເກົ່າ (lowStock || outOfStock).
 */
export function lowStockWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      { stockQty: { lte: 0 } },
      { stockQty: { lte: prisma.product.fields.minStockQty } },
      { stockQty: { lte: prisma.product.fields.reorderPoint } },
    ],
  };
}

export async function listProducts(q: ProductListQuery): Promise<Paginated<ProductView>> {
  const and: Prisma.ProductWhereInput[] = [
    { deletedAt: null },
    ...(q.branchId ? [{ branchId: q.branchId }] : []),
    ...(q.isActive ? [{ isActive: q.isActive === 'true' }] : []),
    // M3 — ໝວດຫຼັກ = ລວມໝວດຍ່ອຍ.
    ...(q.categoryId ? [{ categoryId: { in: await categoryIdsWithChildren(prisma, q.categoryId) } }] : []),
    ...(q.q
      ? [
          {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' as const } },
              { sku: { contains: q.q, mode: 'insensitive' as const } },
              // M2 — ຄົ້ນດ້ວຍລະຫັດ barcode/GTIN ທີ່ພິມ/ສະແກນໄດ້ນຳ.
              { gtin: q.q },
              { barcode: { equals: q.q, mode: 'insensitive' as const } },
            ],
          },
        ]
      : []),
    ...(q.lowStock === 'true' ? [lowStockWhere()] : []),
  ];
  const where: Prisma.ProductWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: await productViews(rows),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/**
 * M2 — GTIN / barcode unique ຕໍ່ສາຂາ (ມີ @@unique ຄ້ຳຢູ່ — ກວດກ່ອນເພື່ອໃຫ້ 409 ອ່ານງ່າຍແທນ P2002).
 * ສິນຄ້າທີ່ soft-delete ແລ້ວມີລະຫັດຕໍ່ທ້າຍ `:deleted:` ຈຶ່ງບໍ່ຂັດ.
 */
async function assertCodesFree(
  db: Tx | typeof prisma,
  branchId: string,
  codes: { gtin?: string | null; barcode?: string | null },
  excludeId?: string,
): Promise<void> {
  const not = excludeId ? { id: { not: excludeId } } : {};
  if (codes.gtin) {
    const dup = await db.product.findFirst({ where: { branchId, gtin: codes.gtin, ...not }, select: { name: true } });
    if (dup) throw ApiError.conflict(`GTIN ນີ້ຖືກໃຊ້ແລ້ວໃນສາຂານີ້ (${dup.name})`);
  }
  if (codes.barcode) {
    const dup = await db.product.findFirst({ where: { branchId, barcode: codes.barcode, ...not }, select: { name: true } });
    if (dup) throw ApiError.conflict(`Barcode ນີ້ຖືກໃຊ້ແລ້ວໃນສາຂານີ້ (${dup.name})`);
  }
}

/**
 * M2 — GET /products/lookup?code&branchId: ສະແກນ/ພິມລະຫັດ → ສິນຄ້າ. ລຳດັບ: GTIN (ກົງຕົວ ຫຼື ເລກດຽວກັນທີ່ເຕີມ 0 ນຳໜ້າ
 * ເຊັ່ນ EAN-13 ທຽບ GTIN-14) → barcode ພາຍໃນ → SKU (ບໍ່ສົນຕົວພິມ). BRANCH_ADMIN/STAFF ຖືກ scope ສາຂາຕົນ. ບໍ່ພົບ = 404.
 */
export async function lookupProduct(
  q: ProductLookupQuery,
  authBranchId?: string | null,
): Promise<{ matchedBy: ProductLookupMatch; product: ProductView }> {
  if (authBranchId && q.branchId && q.branchId !== authBranchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  const branchId = authBranchId ?? q.branchId;
  const code = q.code.trim();
  const base: Prisma.ProductWhereInput = { deletedAt: null, ...(branchId ? { branchId } : {}) };
  const order = [{ isActive: 'desc' as const }, { name: 'asc' as const }];
  const tries: [ProductLookupMatch, Prisma.ProductWhereInput][] = [];
  if (/^\d+$/.test(code)) {
    const digits = code.replace(/^0+/, '');
    const variants = [...new Set([code, ...[8, 12, 13, 14].filter((n) => n >= digits.length).map((n) => digits.padStart(n, '0'))])];
    tries.push(['gtin', { gtin: { in: variants } }]);
  }
  tries.push(['barcode', { barcode: { equals: code, mode: 'insensitive' } }]);
  tries.push(['sku', { sku: { equals: code, mode: 'insensitive' } }]);
  for (const [matchedBy, where] of tries) {
    const p = await prisma.product.findFirst({ where: { ...base, ...where }, include: PRODUCT_INCLUDE, orderBy: order });
    if (p) return { matchedBy, product: (await productViews([p]))[0]! };
  }
  throw ApiError.notFound(`ບໍ່ພົບສິນຄ້າທີ່ມີລະຫັດ "${code}"`);
}

export async function getProduct(id: string): Promise<ProductView> {
  const p = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: PRODUCT_INCLUDE });
  if (!p) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  return (await productViews([p]))[0]!;
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
  if (!input.unit && !input.baseUomId) throw ApiError.badRequest('ຕ້ອງລະບຸໜ່ວຍ (unit ຫຼື baseUomId)');
  await assertCodesFree(prisma, input.branchId, input);
  await assertCategoryForBranch(prisma, input.categoryId, input.branchId);

  const created = await prisma.$transaction(async (tx) => {
    // M1 — ໜ່ວຍພື້ນຖານ: baseUomId ທີ່ເລືອກ (unit ບໍ່ໃສ່ = ຊື່ໜ່ວຍ) ຫຼື ຫາ/ສ້າງ Uom ຈາກຂໍ້ຄວາມ unit (client ເກົ່າ).
    let baseUomId: string;
    let unit: string;
    if (input.baseUomId) {
      const u = await tx.uom.findUnique({ where: { id: input.baseUomId }, select: { id: true, name: true } });
      if (!u) throw ApiError.badRequest('ບໍ່ພົບໜ່ວຍພື້ນຖານ');
      baseUomId = u.id;
      unit = input.unit ?? u.name;
    } else {
      unit = input.unit!;
      baseUomId = await uomIdForUnitText(tx, unit);
    }
    const p = await tx.product.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        sku: input.sku,
        unit,
        baseUomId,
        gtin: input.gtin ?? null,
        barcode: input.barcode ?? null,
        categoryId: input.categoryId ?? null,
        costPrice: costDec(input.costPrice),
        stockQty: qdec(input.openingStock),
        minStockQty: qdec(input.minStockQty),
        isActive: input.isActive,
        trackLot: input.trackLot,
        isSellable: input.isSellable,
        retailPrice: input.retailPrice != null ? new Prisma.Decimal(input.retailPrice.toFixed(2)) : null,
      },
      include: PRODUCT_INCLUDE,
    });
    if (input.conversions?.length) await syncProductConversions(tx, p.id, baseUomId, input.conversions);
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
          reasonCode: 'OPENING_BALANCE',
          notes: 'ຍອດເປີດ',
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
    return p;
  });
  return getProduct(created.id);
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
  await assertCodesFree(
    prisma,
    existing.branchId,
    { gtin: input.gtin && input.gtin !== existing.gtin ? input.gtin : null, barcode: input.barcode && input.barcode !== existing.barcode ? input.barcode : null },
    id,
  );
  if (input.categoryId) await assertCategoryForBranch(prisma, input.categoryId, existing.branchId);
  let unitFromUom: string | undefined;
  if (input.baseUomId && input.baseUomId !== existing.baseUomId) {
    // M1 — ທຸກຈຳນວນ (ສະຕັອກ/ledger/lot/BOM) ເປັນໜ່ວຍພື້ນຖານ → ປ່ຽນໄດ້ສະເພາະສິນຄ້າທີ່ຍັງບໍ່ມີການເຄື່ອນໄຫວ.
    const moved = await prisma.stockMovement.count({ where: { productId: id } });
    if (moved > 0 || qnum(existing.stockQty) !== 0) {
      throw ApiError.conflict('ປ່ຽນໜ່ວຍພື້ນຖານບໍ່ໄດ້ — ສິນຄ້ານີ້ມີການເຄື່ອນໄຫວສະຕັອກແລ້ວ (ແກ້ຊື່ໜ່ວຍແທນ ຫຼື ສ້າງສິນຄ້າໃໝ່)');
    }
    const u = await prisma.uom.findUnique({ where: { id: input.baseUomId }, select: { name: true } });
    if (!u) throw ApiError.badRequest('ບໍ່ພົບໜ່ວຍພື້ນຖານ');
    unitFromUom = u.name;
  }
  await prisma.$transaction(async (tx) => {
    let baseUomId = input.baseUomId ?? existing.baseUomId;
    if (!baseUomId && input.unit) baseUomId = await uomIdForUnitText(tx, input.unit);
    await tx.product.update({
      where: { id },
      data: {
        ...(input.trackLot !== undefined ? { trackLot: input.trackLot } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : unitFromUom ? { unit: unitFromUom } : {}),
        ...(baseUomId !== existing.baseUomId ? { baseUomId } : {}),
        ...(input.gtin !== undefined ? { gtin: input.gtin } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.costPrice !== undefined ? { costPrice: costDec(input.costPrice) } : {}),
        ...(input.minStockQty !== undefined ? { minStockQty: qdec(input.minStockQty) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isSellable !== undefined ? { isSellable: input.isSellable } : {}),
        ...(input.retailPrice !== undefined
          ? { retailPrice: input.retailPrice != null ? new Prisma.Decimal(input.retailPrice.toFixed(2)) : null }
          : {}),
      },
    });
    if (input.conversions !== undefined) await syncProductConversions(tx, id, baseUomId, input.conversions);
  });
  return getProduct(id);
}

/**
 * L7 — ລຶບ (soft) ບໍ່ໄດ້ (409) ຖ້າ: ຍັງມີສະຕັອກ (stockQty ≠ 0), lot ຍັງມີຂອງ, ຍັງຢູ່ໃນ BOM ຂອງບໍລິການທີ່ຍັງໃຊ້ຢູ່
 * (ລຶບແລ້ວ consumeServiceStock ຈະຂ້າມແບບງຽບໆ), ມີການຈອງ ACTIVE ຫຼື ມີແຖວໃນ PO ທີ່ຍັງເປີດ. ຂໍ້ຄວາມບອກທຸກເຫດຜົນ.
 */
export async function deleteProduct(id: string, authBranchId?: string | null): Promise<void> {
  const p = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(authBranchId, p.branchId);
  const [lotAgg, bom, reservations, openPoLines] = await Promise.all([
    prisma.stockLot.aggregate({ where: { productId: id, qtyOnHand: { gt: 0 } }, _sum: { qtyOnHand: true }, _count: { _all: true } }),
    prisma.serviceConsumable.findMany({
      where: { productId: id, service: { deletedAt: null } },
      select: { service: { select: { name: true } } },
      take: 5,
    }),
    prisma.stockReservation.count({ where: { productId: id, status: 'ACTIVE' } }),
    prisma.purchaseOrderItem.findMany({
      where: { productId: id, purchaseOrder: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] } } },
      select: { purchaseOrder: { select: { poNumber: true } } },
      take: 5,
    }),
  ]);
  const reasons: string[] = [];
  const stock = qnum(p.stockQty);
  if (stock !== 0) reasons.push(`ຍັງມີສະຕັອກ ${stock} ${p.unit} (ປັບເປັນ 0 ກ່ອນ)`);
  if (lotAgg._count._all > 0) reasons.push(`ຍັງມີ ${lotAgg._count._all} lot ທີ່ມີຂອງ`);
  if (bom.length) reasons.push(`ຍັງຢູ່ໃນ BOM ຂອງບໍລິການ: ${bom.map((b) => b.service.name).join(', ')}`);
  if (reservations > 0) reasons.push(`ຖືກຈອງໄວ້ສຳລັບ ${reservations} ນັດໝາຍທີ່ຢືນຢັນແລ້ວ`);
  if (openPoLines.length) reasons.push(`ຢູ່ໃນໃບສັ່ງຊື້ທີ່ຍັງເປີດ: ${openPoLines.map((l) => l.purchaseOrder.poNumber).join(', ')}`);
  if (reasons.length) {
    throw new ApiError(409, ErrorCode.CONFLICT, `ລຶບສິນຄ້າບໍ່ໄດ້ — ${reasons.join('; ')}`, { reasons });
  }
  // C3/M2 — ປົດປ່ອຍ SKU / GTIN / barcode ໃຫ້ໃຊ້ຄືນໄດ້ຫຼັງ soft-delete (unique ຕໍ່ສາຂາ).
  const tag = `:deleted:${Date.now()}`;
  await prisma.product.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      sku: `${p.sku}${tag}`,
      ...(p.gtin ? { gtin: `${p.gtin}${tag}` } : {}),
      ...(p.barcode ? { barcode: `${p.barcode}${tag}` } : {}),
    },
  });
}

/**
 * L8/M4 — ສະຖິຕິ inventory ດ້ວຍ SQL aggregate ດຽວ (ບໍ່ດຶງທຸກສິນຄ້າມາຄິດໃນ JS). ຄວາມໝາຍເທົ່າເກົ່າ:
 * outOfStock = stockQty ≤ 0; lowStock = 0 < stockQty ≤ max(minStockQty, reorderPoint); ມູນຄ່າ = Σ max(stockQty,0) ×
 * round(costPrice, 2) (C2 — ບໍ່ໃຫ້ຄ່າລົບດຶງມູນຄ່າລວມລົງ). + H7: ສິນຄ້າທີ່ available < 0 / ມີການຈອງ.
 */
export async function inventoryStats(branchId?: string, categoryId?: string): Promise<InventoryStatsView> {
  const branchSql = branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty;
  // M3 — ຕົວກັ່ນໝວດ (ໝວດຫຼັກລວມໝວດຍ່ອຍ) ນຳໃຊ້ກັບ KPI ສິນຄ້າ; ຈຳນວນ PO ທີ່ເປີດບໍ່ຂຶ້ນກັບໝວດ.
  const catSql = categoryId
    ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(await categoryIdsWithChildren(prisma, categoryId))})`
    : Prisma.empty;
  const [agg] = await prisma.$queryRaw<
    { total: bigint; active: bigint; out: bigint; low: bigint; value: Prisma.Decimal | null; short: bigint; reserved: bigint }[]
  >`
    WITH r AS (
      SELECT "productId", SUM(qty) AS qty FROM "stock_reservations" WHERE status = 'ACTIVE' GROUP BY "productId"
    )
    SELECT COUNT(*)                                                         AS total,
           COUNT(*) FILTER (WHERE p."isActive")                             AS active,
           COUNT(*) FILTER (WHERE p."stockQty" <= 0)                        AS out,
           COUNT(*) FILTER (WHERE p."stockQty" > 0
                              AND p."stockQty" <= GREATEST(p."minStockQty", COALESCE(p."reorderPoint", 0))) AS low,
           SUM(GREATEST(p."stockQty", 0) * ROUND(p."costPrice", 2))         AS value,
           COUNT(*) FILTER (WHERE r.qty IS NOT NULL AND p."stockQty" - r.qty < 0) AS short,
           COUNT(r.qty)                                                     AS reserved
      FROM "products" p
      LEFT JOIN r ON r."productId" = p.id
     WHERE p."deletedAt" IS NULL ${branchSql} ${catSql}`;
  const openPO = await prisma.purchaseOrder.count({
    where: {
      status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] },
      ...(branchId ? { branchId } : {}),
    },
  });
  return {
    totalProducts: Number(agg?.total ?? 0),
    activeProducts: Number(agg?.active ?? 0),
    lowStockCount: Number(agg?.low ?? 0),
    outOfStockCount: Number(agg?.out ?? 0),
    totalStockValue: money(agg?.value ?? 0),
    openPurchaseOrders: openPO,
    shortForUpcomingCount: Number(agg?.short ?? 0),
    reservedProductCount: Number(agg?.reserved ?? 0),
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
    reasonCode: m.reasonCode,
    attachmentUrl: m.attachmentUrl,
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
  'SOLD',
  'SALE_RETURN',
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

/**
 * M12-lite — COGS ຂອງແຖວ ledger: ໃຊ້ −valueChange (ຕົ້ນທຶນຕອນຕັດ); ແຖວເກົ່າກ່ອນ C4 (valueChange null) ໃຊ້
 * qty × costPrice ປັດຈຸບັນ ເປັນຄ່າປະມານ (ດີກວ່ານັບເປັນ 0 ໃນ P&L).
 */
export function movementCost(m: { qty: Prisma.Decimal; valueChange: Prisma.Decimal | null }, fallbackCost: number): number {
  return m.valueChange != null ? -qnum(m.valueChange) : qnum(m.qty) * fallbackCost;
}

/**
 * ແຖວ ledger ທີ່ນັບເປັນ "ການສູນເສຍ" (shrinkage) — ແຫຼ່ງດຽວທີ່ P&L ແລະ ລາຍງານ shrinkage ໃຊ້ຮ່ວມກັນ.
 * ການປັບເພີ່ມ (ເຊັ່ນ COUNT_VARIANCE ບວກ) ບໍ່ຫັກລ້າງ.
 */
export const SHRINKAGE_MOVEMENT_WHERE = {
  type: 'ADJUSTMENT_DEDUCT',
  reasonCode: { in: [...STOCK_SHRINKAGE_REASONS] },
} satisfies Prisma.StockMovementWhereInput;

/**
 * ຊ່ວງວັນ YYYY-MM-DD (ວັນວຽງຈັນ, ລວມທັງສອງ) → [gte, lt). ບໍ່ໃສ່ = 30 ວັນຫຼ້າສຸດ. ໃຊ້ໂດຍ service-margin + shrinkage.
 */
export function vientianeDayRange(q: { from?: string; to?: string }): { from: string; to: string; gte: Date; lt: Date } {
  const today = fromDateOnly(vientianeDateKey(new Date()))!;
  const to = q.to ?? today;
  const from = q.from ?? fromDateOnly(new Date(new Date(`${to}T00:00:00.000Z`).getTime() - 29 * 86_400_000))!;
  if (from > to) throw ApiError.badRequest('ວັນເລີ່ມຕ້ອງບໍ່ເກີນວັນສິ້ນສຸດ');
  const gte = vientianeDayStart(new Date(`${from}T00:00:00.000Z`));
  const lt = new Date(vientianeDayStart(new Date(`${to}T00:00:00.000Z`)).getTime() + 86_400_000);
  return { from, to, gte, lt };
}

/**
 * COGS + shrinkage ຂອງຊ່ວງເວລາ [gte, lt) — ໃຊ້ໂດຍ P&L (expenses.profitLoss).
 * M13 — cogs ລວມ retail: SOLD (ຕົ້ນທຶນອອກ) − SALE_RETURN (valueChange ບວກ → movementCost ລົບ = ຫັກຄືນ); `retailCogs` = ສ່ວນນັ້ນ.
 * SOLD/SALE_RETURN ບໍ່ແມ່ນ ADJUSTMENT_DEDUCT → ບໍ່ເຄີຍຖືກນັບເປັນ shrinkage.
 */
export async function inventoryCostsBetween(
  range: { gte: Date; lt: Date },
  branchId?: string,
): Promise<{ cogs: number; shrinkage: number; retailCogs: number }> {
  const rows = await prisma.stockMovement.findMany({
    where: {
      createdAt: range,
      ...(branchId ? { branchId } : {}),
      OR: [{ type: { in: ['SERVICE_CONSUMED', 'SOLD', 'SALE_RETURN'] } }, SHRINKAGE_MOVEMENT_WHERE],
    },
    select: { type: true, qty: true, valueChange: true, product: { select: { costPrice: true } } },
  });
  let service = 0;
  let retail = 0;
  let shrinkage = 0;
  for (const m of rows) {
    const cost = costNum(m.product.costPrice);
    if (m.type === 'SERVICE_CONSUMED') service += movementCost(m, cost);
    else if (m.type === 'SOLD') retail += movementCost(m, cost);
    // SALE_RETURN: valueChange ບວກ → movementCost = −value (ຫັກຄືນ); ແຖວບໍ່ມີ valueChange → ຫັກ qty × cost.
    else if (m.type === 'SALE_RETURN') retail -= m.valueChange != null ? qnum(m.valueChange) : qnum(m.qty) * cost;
    else shrinkage += movementCost(m, cost);
  }
  return { cogs: Math.round(service + retail), shrinkage: Math.round(shrinkage), retailCogs: Math.round(retail) };
}

/**
 * M12-lite — ກຳໄລຂັ້ນຕົ້ນຕໍ່ບໍລິການ: ລາຍຮັບນັດໝາຍ COMPLETED (totalAmount, ຕາມວັນ startAt ວຽງຈັນ) − COGS ຂອງ
 * ນັດໝາຍເຫຼົ່ານັ້ນ (SERVICE_CONSUMED refId = `appt:<id>`). BRANCH_ADMIN ຖືກບັງຄັບເປັນສາຂາຕົນ.
 */
export async function getServiceMargin(
  q: ServiceMarginQuery,
  authBranchId?: string | null,
): Promise<ServiceMarginView> {
  if (authBranchId && q.branchId && q.branchId !== authBranchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  const branchId = authBranchId ?? q.branchId ?? null;
  const { from, to, gte, lt } = vientianeDayRange(q);

  const appts = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      status: 'COMPLETED',
      startAt: { gte, lt },
      ...(branchId ? { branchId } : {}),
    },
    select: { id: true, serviceId: true, totalAmount: true, service: { select: { name: true } } },
  });
  const costByAppt = new Map<string, number>();
  const CHUNK = 1000;
  for (let i = 0; i < appts.length; i += CHUNK) {
    const refIds = appts.slice(i, i + CHUNK).map((a) => `appt:${a.id}`);
    const moves = await prisma.stockMovement.findMany({
      where: { type: 'SERVICE_CONSUMED', refId: { in: refIds } },
      select: { refId: true, qty: true, valueChange: true, product: { select: { costPrice: true } } },
    });
    for (const m of moves) {
      const aid = m.refId!.slice('appt:'.length);
      costByAppt.set(aid, (costByAppt.get(aid) ?? 0) + movementCost(m, costNum(m.product.costPrice)));
    }
  }

  const bySvc = new Map<string, { serviceName: string; completed: number; revenue: number; cogs: number }>();
  for (const a of appts) {
    const cur = bySvc.get(a.serviceId) ?? { serviceName: a.service.name, completed: 0, revenue: 0, cogs: 0 };
    cur.completed += 1;
    cur.revenue += a.totalAmount.toNumber();
    cur.cogs += costByAppt.get(a.id) ?? 0;
    bySvc.set(a.serviceId, cur);
  }
  const pct = (m: number, r: number) => (r > 0 ? Math.round((m / r) * 10000) / 10000 : 0);
  const rows = [...bySvc.entries()]
    .map(([serviceId, v]) => {
      const revenue = money(v.revenue);
      const cogs = money(v.cogs);
      return { serviceId, serviceName: v.serviceName, completed: v.completed, revenue, cogs, grossMargin: money(revenue - cogs), marginPct: pct(revenue - cogs, revenue) };
    })
    .sort((x, y) => y.revenue - x.revenue);
  const revenue = money(rows.reduce((s, r) => s + r.revenue, 0));
  const cogs = money(rows.reduce((s, r) => s + r.cogs, 0));
  return {
    from,
    to,
    branchId,
    rows,
    totals: {
      completed: rows.reduce((s, r) => s + r.completed, 0),
      revenue,
      cogs,
      grossMargin: money(revenue - cogs),
      marginPct: pct(revenue - cogs, revenue),
    },
  };
}

// ============================================================ Manual adjust + maker-checker (H2)

/** H2 — AppSetting key ຂອງເກນມູນຄ່າທີ່ຕ້ອງອະນຸມັດ (LAK). */
export const ADJUST_APPROVAL_THRESHOLD_KEY = 'inventory.adjustApprovalThresholdLak';
export const ADJUST_APPROVAL_THRESHOLD_DEFAULT = 1_000_000;
const MAX_ADJUST_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** 9D — M6: PO ທີ່ຍອດເກີນນີ້ ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ (LAK). */
export const PO_APPROVAL_THRESHOLD_KEY = 'inventory.poApprovalThresholdLak';
export const PO_APPROVAL_THRESHOLD_DEFAULT = 5_000_000;
/** 9D — H4: ຮັບເກີນຈຳນວນສັ່ງໄດ້ສູງສຸດ % (default 0 = ບໍ່ໃຫ້ເກີນ). */
export const OVER_RECEIPT_TOLERANCE_KEY = 'inventory.overReceiptTolerancePct';
export const OVER_RECEIPT_TOLERANCE_DEFAULT = 0;
/** 9D — H4: ຄວາມຕ່າງທີ່ຍອມຮັບໄດ້ຂອງ 3-way match (%). */
export const INVOICE_MATCH_TOLERANCE_KEY = 'inventory.invoiceMatchTolerancePct';
export const INVOICE_MATCH_TOLERANCE_DEFAULT = 1;

/** 9D — M11: safety stock (ວັນ), ຮອບທົບທວນຄຳແນະນຳ PO (ວັນ), lead time ເລີ່ມຕົ້ນ (ວັນ). */
export const SAFETY_STOCK_DAYS_KEY = 'inventory.safetyStockDays';
export const SAFETY_STOCK_DAYS_DEFAULT = 3;
export const REORDER_REVIEW_DAYS_KEY = 'inventory.reorderReviewDays';
export const REORDER_REVIEW_DAYS_DEFAULT = 7;
export const DEFAULT_LEAD_TIME_DAYS_KEY = 'inventory.defaultLeadTimeDays';
export const DEFAULT_LEAD_TIME_DAYS_DEFAULT = 7;
/** 9C — M3: ເກນ ABC (% ມູນຄ່າສະສົມ). */
export const ABC_A_KEY = 'inventory.abcA';
export const ABC_A_DEFAULT = 80;
export const ABC_B_KEY = 'inventory.abcB';
export const ABC_B_DEFAULT = 95;

const SETTING_KEYS = {
  approvalThresholdLak: [ADJUST_APPROVAL_THRESHOLD_KEY, ADJUST_APPROVAL_THRESHOLD_DEFAULT],
  poApprovalThresholdLak: [PO_APPROVAL_THRESHOLD_KEY, PO_APPROVAL_THRESHOLD_DEFAULT],
  overReceiptTolerancePct: [OVER_RECEIPT_TOLERANCE_KEY, OVER_RECEIPT_TOLERANCE_DEFAULT],
  invoiceMatchTolerancePct: [INVOICE_MATCH_TOLERANCE_KEY, INVOICE_MATCH_TOLERANCE_DEFAULT],
  safetyStockDays: [SAFETY_STOCK_DAYS_KEY, SAFETY_STOCK_DAYS_DEFAULT],
  reorderReviewDays: [REORDER_REVIEW_DAYS_KEY, REORDER_REVIEW_DAYS_DEFAULT],
  defaultLeadTimeDays: [DEFAULT_LEAD_TIME_DAYS_KEY, DEFAULT_LEAD_TIME_DAYS_DEFAULT],
  abcA: [ABC_A_KEY, ABC_A_DEFAULT],
  abcB: [ABC_B_KEY, ABC_B_DEFAULT],
} as const satisfies Record<keyof StockAdjustSettingsView, readonly [string, number]>;

/** ການຕັ້ງຄ່າ inventory ທັງໝົດ (AppSetting) — ຄ່າທີ່ບໍ່ຖືກຕ້ອງ/ບໍ່ມີ = default. */
export async function getAdjustSettings(): Promise<StockAdjustSettingsView> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS).map(([k]) => k) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]));
  const out = {} as StockAdjustSettingsView;
  for (const [field, [key, def]] of Object.entries(SETTING_KEYS) as [keyof StockAdjustSettingsView, readonly [string, number]][]) {
    const v = byKey.get(key);
    out[field] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def;
  }
  return out;
}

export async function updateAdjustSettings(
  input: StockAdjustSettingsInput,
  actorId: string,
): Promise<StockAdjustSettingsView> {
  const before = await getAdjustSettings();
  // M3 — ກວດ A ≤ B ຫຼັງລວມກັບຄ່າປັດຈຸບັນ (ສົ່ງມາແຕ່ຄ່າດຽວກໍໄດ້).
  const nextA = input.abcA ?? before.abcA;
  const nextB = input.abcB ?? before.abcB;
  if (nextA > nextB) throw ApiError.badRequest('ເກນ ABC: A ຕ້ອງບໍ່ເກີນ B');
  for (const [field, [key]] of Object.entries(SETTING_KEYS) as [keyof StockAdjustSettingsView, readonly [string, number]][]) {
    const value = input[field];
    if (value === undefined) continue;
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  const after = await getAdjustSettings();
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'UPDATE',
      entityName: 'StockAdjustSettings',
      entityId: ADJUST_APPROVAL_THRESHOLD_KEY,
      oldValue: before,
      newValue: after,
    },
  });
  return after;
}

async function saveAdjustPhoto(photo: StockAdjustInput['photo']): Promise<string | null> {
  if (!photo) return null;
  const buffer = Buffer.from(photo.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ໄຟລ໌ຮູບບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_ADJUST_PHOTO_BYTES) throw ApiError.badRequest('ຮູບໃຫຍ່ເກີນ 5MB');
  const key = `stock-adjustments/${randomUUID()}.${PHOTO_EXT[photo.contentType] ?? 'bin'}`;
  const { url } = await storage.save(key, buffer, photo.contentType);
  return url;
}

type AdjustPost = {
  productId: string;
  delta: number;
  reason: StockAdjustReasonValue;
  notes?: string | null;
  lot?: { lotNumber: string; expiryDate: Date | null; mfgDate: Date | null } | null;
  attachmentUrl?: string | null;
  createdByUserId?: string | null;
  authBranchId?: string | null;
};

/**
 * ເສັ້ນທາງ post ການປັບສະຕັອກອັນດຽວ (ປັບທັນທີ ແລະ ຕອນອະນຸມັດຄຳຂໍ) — ຕ້ອງເອີ້ນພາຍໃນ transaction.
 * C1: lock ແຖວສິນຄ້າກ່ອນອ່ານ; C4: ບໍ່ປ່ຽນ WAC; C5: ເພີ່ມເຂົ້າ lot / ຫັກແບບ FEFO.
 */
async function postAdjustment(tx: Tx, a: AdjustPost): Promise<MovementRow[]> {
  await lockProductRow(tx, a.productId);
  const product = await tx.product.findFirst({
    where: { id: a.productId, deletedAt: null },
    select: { id: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
  });
  if (!product) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(a.authBranchId, product.branchId);
  const balance = qnum(product.stockQty) + a.delta;
  if (balance < 0) throw ApiError.conflict('ປັບບໍ່ໄດ້ — ສະຕັອກຈະຕິດລົບ');
  if (a.delta > 0 && product.trackLot && !a.lot) {
    throw ApiError.badRequest('ສິນຄ້ານີ້ຕິດຕາມ lot — ຕ້ອງລະບຸເລກ lot ເມື່ອປັບເພີ່ມສະຕັອກ');
  }
  await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance) } });
  const currentCost = costNum(product.costPrice);
  const notes = a.notes?.trim() || 'ປັບສະຕັອກດ້ວຍມື';
  if (a.delta < 0) {
    return deductStock(tx, {
      productId: product.id,
      branchId: product.branchId,
      trackLot: product.trackLot,
      wac: currentCost,
      qty: Math.abs(a.delta),
      balanceBefore: qnum(product.stockQty),
      type: 'ADJUSTMENT_DEDUCT',
      notes,
      createdByUserId: a.createdByUserId,
      reasonCode: a.reason,
      attachmentUrl: a.attachmentUrl,
    });
  }
  const lotId =
    product.trackLot && a.lot
      ? await receiveIntoLot(tx, {
          productId: product.id,
          branchId: product.branchId,
          lotNumber: a.lot.lotNumber,
          expiryDate: a.lot.expiryDate,
          mfgDate: a.lot.mfgDate,
          qty: a.delta,
          unitCost: currentCost,
        })
      : null;
  const m = await tx.stockMovement.create({
    data: {
      branchId: product.branchId,
      productId: product.id,
      type: 'ADJUSTMENT_ADD',
      qty: qdec(a.delta),
      balanceAfter: qdec(balance),
      unitCost: costDec(currentCost),
      valueChange: money(a.delta * currentCost),
      lotId,
      reasonCode: a.reason,
      attachmentUrl: a.attachmentUrl ?? null,
      notes,
      createdByUserId: a.createdByUserId ?? null,
    },
    include: MOVEMENT_INCLUDE,
  });
  return [m];
}

const ADJ_REQ_INCLUDE = {
  branch: { select: { name: true } },
  product: { select: { name: true, sku: true, unit: true } },
  requestedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.StockAdjustmentRequestInclude;
type AdjReqRow = Prisma.StockAdjustmentRequestGetPayload<{ include: typeof ADJ_REQ_INCLUDE }>;

function toAdjReqView(r: AdjReqRow): StockAdjustRequestView {
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: r.branch.name,
    productId: r.productId,
    productName: r.product.name,
    sku: r.product.sku,
    unit: r.product.unit,
    delta: qnum(r.delta),
    reason: r.reason,
    notes: r.notes,
    lotNumber: r.lotNumber,
    expiryDate: fromDateOnly(r.expiryDate),
    unitCost: money(r.unitCost),
    estimatedValue: money(r.estimatedValue),
    status: r.status,
    attachmentUrl: r.attachmentUrl,
    requestedByUserId: r.requestedByUserId,
    requestedByUserName: r.requestedBy.name,
    reviewedByUserId: r.reviewedByUserId,
    reviewedByUserName: r.reviewedBy?.name ?? null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    rejectReason: r.rejectReason,
    movementId: r.movementId,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * POST /stock-movements/adjust. H2 maker-checker: ຖ້າ |delta| × WAC > ເກນ ແລະ ຜູ້ເຮັດບໍ່ແມ່ນ SUPER_ADMIN →
 * ສ້າງຄຳຂໍ PENDING ແທນການ post (stockQty ບໍ່ປ່ຽນ) ແລ້ວແຈ້ງ SUPER_ADMIN.
 */
export async function adjustStock(
  input: StockAdjustInput,
  auth: Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'> | null,
): Promise<StockAdjustResult> {
  const authBranchId = auth?.branchId ?? null;
  const userId = auth?.sub ?? null;
  const product = await prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    select: { id: true, name: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
  });
  if (!product) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
  assertBranchScope(authBranchId, product.branchId);
  if (input.delta > 0 && product.trackLot && !input.lot) {
    throw ApiError.badRequest('ສິນຄ້ານີ້ຕິດຕາມ lot — ຕ້ອງລະບຸເລກ lot ເມື່ອປັບເພີ່ມສະຕັອກ');
  }
  const lot = input.lot
    ? { lotNumber: input.lot.lotNumber, expiryDate: toDateOnly(input.lot.expiryDate), mfgDate: toDateOnly(input.lot.mfgDate) }
    : null;

  const wac = costNum(product.costPrice);
  const estimatedValue = money(Math.abs(input.delta) * wac);
  const { approvalThresholdLak } = await getAdjustSettings();
  const needsApproval = auth?.role !== 'SUPER_ADMIN' && estimatedValue > approvalThresholdLak;

  if (needsApproval) {
    // ກວດກ່ອນຍື່ນ ເພື່ອບໍ່ໃຫ້ຄຳຂໍທີ່ຮູ້ຢູ່ແລ້ວວ່າ post ບໍ່ໄດ້ ໄປຄ້າງລໍ SUPER_ADMIN (ຕອນອະນຸມັດກວດຄືນອີກຄັ້ງ).
    if (qnum(product.stockQty) + input.delta < 0) throw ApiError.conflict('ປັບບໍ່ໄດ້ — ສະຕັອກຈະຕິດລົບ');
    if (!userId) throw ApiError.unauthorized('ຕ້ອງເຂົ້າສູ່ລະບົບ');
    const attachmentUrl = await saveAdjustPhoto(input.photo);
    const req = await prisma.stockAdjustmentRequest.create({
      data: {
        branchId: product.branchId,
        productId: product.id,
        delta: qdec(input.delta),
        reason: input.reason,
        notes: input.notes?.trim() || null,
        lotNumber: lot?.lotNumber ?? null,
        expiryDate: lot?.expiryDate ?? null,
        mfgDate: lot?.mfgDate ?? null,
        unitCost: costDec(wac),
        estimatedValue: new Prisma.Decimal(estimatedValue.toFixed(2)),
        attachmentUrl,
        requestedByUserId: userId,
      },
      include: ADJ_REQ_INCLUDE,
    });
    const view = toAdjReqView(req);
    void notifyAdjustApprovers(view);
    return { outcome: 'PENDING_APPROVAL', request: view };
  }

  const attachmentUrl = await saveAdjustPhoto(input.photo);
  const rows = await prisma.$transaction((tx) =>
    postAdjustment(tx, {
      productId: product.id,
      delta: input.delta,
      reason: input.reason,
      notes: input.notes,
      lot,
      attachmentUrl,
      createdByUserId: userId,
      authBranchId,
    }),
  );
  // ຕັດຂ້າມຫຼາຍ lot ໄດ້ຫຼາຍແຖວ — ຄືນແຖວທຳອິດ (lot ທີ່ໃກ້ໝົດອາຍຸສຸດ) ເປັນຕົວແທນ.
  return { outcome: 'POSTED', movement: toMovementView(rows[0]!) };
}

async function notifyAdjustApprovers(r: StockAdjustRequestView): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null, id: { not: r.requestedByUserId } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((u) =>
        notifyUser({
          userId: u.id,
          type: 'STOCK_ADJUST_PENDING',
          title: 'ການປັບສະຕັອກລໍຖ້າອະນຸມັດ',
          body: `${r.productName} ${r.delta > 0 ? '+' : ''}${r.delta} ${r.unit} · ${r.estimatedValue.toLocaleString('en-US')} LAK · ${r.branchName}`,
          severity: 'warning',
          data: { stockAdjustRequestId: r.id, branchId: r.branchId, productId: r.productId },
          dedupeKey: `stock-adjust-pending:${r.id}:${u.id}`,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, requestId: r.id }, 'stock adjust approver notification failed');
  }
}

async function notifyAdjustRequester(r: StockAdjustRequestView, approved: boolean): Promise<void> {
  try {
    await notifyUser({
      userId: r.requestedByUserId,
      type: approved ? 'STOCK_ADJUST_APPROVED' : 'STOCK_ADJUST_REJECTED',
      title: approved ? 'ການປັບສະຕັອກຖືກອະນຸມັດ' : 'ການປັບສະຕັອກຖືກປະຕິເສດ',
      body: `${r.productName} ${r.delta > 0 ? '+' : ''}${r.delta} ${r.unit}${approved ? '' : ` — ${r.rejectReason ?? ''}`}`,
      severity: approved ? 'info' : 'warning',
      data: { stockAdjustRequestId: r.id, branchId: r.branchId, productId: r.productId },
    });
  } catch (err) {
    logger.warn({ err, requestId: r.id }, 'stock adjust requester notification failed');
  }
}

export async function listAdjustRequests(
  q: StockAdjustRequestListQuery,
  authBranchId?: string | null,
): Promise<Paginated<StockAdjustRequestView>> {
  const where: Prisma.StockAdjustmentRequestWhereInput = {
    ...(authBranchId ? { branchId: authBranchId } : q.branchId ? { branchId: q.branchId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockAdjustmentRequest.findMany({
      where,
      include: ADJ_REQ_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockAdjustmentRequest.count({ where }),
  ]);
  return {
    items: rows.map(toAdjReqView),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/** SUPER_ADMIN ເທົ່ານັ້ນ (ກັ້ນທີ່ route). lock ແຖວຄຳຂໍ → ກັນອະນຸມັດຊ້ຳ 2 ເທື່ອພ້ອມກັນ. */
export async function approveAdjustRequest(id: string, reviewerId: string): Promise<StockAdjustRequestView> {
  const view = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "stock_adjustment_requests" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.stockAdjustmentRequest.findUnique({ where: { id } });
    if (!r) throw ApiError.notFound('ບໍ່ພົບຄຳຂໍປັບສະຕັອກ');
    if (r.status !== 'PENDING') throw ApiError.conflict('ຄຳຂໍນີ້ຖືກພິຈາລະນາແລ້ວ');
    if (r.requestedByUserId === reviewerId) throw ApiError.forbidden('ອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້');
    const rows = await postAdjustment(tx, {
      productId: r.productId,
      delta: qnum(r.delta),
      reason: r.reason,
      notes: r.notes,
      lot: r.lotNumber ? { lotNumber: r.lotNumber, expiryDate: r.expiryDate, mfgDate: r.mfgDate } : null,
      attachmentUrl: r.attachmentUrl,
      // H1 — ຜູ້ເຮັດລາຍການ (maker) ຍັງເປັນຄົນຍື່ນ; ຜູ້ອະນຸມັດ (checker) ເກັບໃນຄຳຂໍ.
      createdByUserId: r.requestedByUserId,
    });
    const updated = await tx.stockAdjustmentRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedByUserId: reviewerId, reviewedAt: new Date(), movementId: rows[0]!.id },
      include: ADJ_REQ_INCLUDE,
    });
    return toAdjReqView(updated);
  });
  void notifyAdjustRequester(view, true);
  return view;
}

export async function rejectAdjustRequest(
  id: string,
  reviewerId: string,
  input: StockAdjustRejectInput,
): Promise<StockAdjustRequestView> {
  const view = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "stock_adjustment_requests" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.stockAdjustmentRequest.findUnique({ where: { id }, select: { status: true } });
    if (!r) throw ApiError.notFound('ບໍ່ພົບຄຳຂໍປັບສະຕັອກ');
    if (r.status !== 'PENDING') throw ApiError.conflict('ຄຳຂໍນີ້ຖືກພິຈາລະນາແລ້ວ');
    const updated = await tx.stockAdjustmentRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedByUserId: reviewerId, reviewedAt: new Date(), rejectReason: input.reason },
      include: ADJ_REQ_INCLUDE,
    });
    return toAdjReqView(updated);
  });
  void notifyAdjustRequester(view, false);
  return view;
}

// ============================================================ Lot backfill (ສະຕັອກເກົ່າທີ່ບໍ່ມີ lot)

/**
 * ມອບສະຕັອກສ່ວນທີ່ບໍ່ມີ lot (stockQty − Σ lot qtyOnHand) ເຂົ້າ lot ໃໝ່/ທີ່ມີຢູ່ ຕາມ WAC ປັດຈຸບັນ.
 * stockQty ບໍ່ປ່ຽນ → ບໍ່ຂຽນ StockMovement (ledger ນັບຈຳນວນຕໍ່ສິນຄ້າ, ການຍ້າຍຈາກ "ບໍ່ມີ lot" ເຂົ້າ lot ບໍ່ແມ່ນ
 * ການເໜັງຕີງຂອງຍອດ ແລະ ຈະເຮັດໃຫ້ reconcileStock ຜິດ); ບັນທຶກເປັນ AuditLog ແທນ.
 */
export async function assignUnlottedToLot(
  input: AssignUnlottedInput,
  authBranchId?: string | null,
  actorId?: string | null,
): Promise<ProductView> {
  const result = await prisma.$transaction(async (tx) => {
    await lockProductRow(tx, input.productId);
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw ApiError.notFound('ບໍ່ພົບສິນຄ້າ');
    assertBranchScope(authBranchId, product.branchId);
    if (!product.trackLot) throw ApiError.badRequest('ສິນຄ້ານີ້ບໍ່ໄດ້ຕິດຕາມ lot');
    const agg = await tx.stockLot.aggregate({ where: { productId: product.id }, _sum: { qtyOnHand: true } });
    const unlotted = qnum(qnum(product.stockQty) - qnum(agg._sum.qtyOnHand));
    if (unlotted <= 0) throw ApiError.conflict('ບໍ່ມີສະຕັອກທີ່ບໍ່ມີ lot ໃຫ້ມອບ');
    if (input.qty > unlotted + 0.0005) {
      throw ApiError.conflict(`ມອບໄດ້ສູງສຸດ ${unlotted} (ສະຕັອກທີ່ບໍ່ມີ lot)`);
    }
    const wac = costNum(product.costPrice);
    const lotId = await receiveIntoLot(tx, {
      productId: product.id,
      branchId: product.branchId,
      lotNumber: input.lotNumber,
      expiryDate: toDateOnly(input.expiryDate),
      mfgDate: toDateOnly(input.mfgDate),
      qty: input.qty,
      unitCost: wac,
    });
    await tx.auditLog.create({
      data: {
        branchId: product.branchId,
        userId: actorId ?? null,
        action: 'ASSIGN_UNLOTTED',
        entityName: 'StockLot',
        entityId: lotId,
        oldValue: { productId: product.id, unlottedQty: unlotted },
        newValue: { lotNumber: input.lotNumber, qty: input.qty, unitCost: wac, unlottedQty: qnum(unlotted - input.qty) },
      },
    });
    return { product, lotQty: qnum(qnum(agg._sum.qtyOnHand) + input.qty) };
  });
  return (await productViews([result.product]))[0]!;
}

// ============================================================ BOM consumption

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
    // M1 — BOM ຂຽນເປັນໜ່ວຍໃດກໍໄດ້ (ເຊັ່ນ ml) → ຕັດເປັນໜ່ວຍພື້ນຖານ (ຕຸກ) = qtyPerUse × factor snapshot.
    const use = bomBaseQty(c);
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
  // H7 — ການຈອງຂອງນັດນີ້ກາຍເປັນການຕັດຈິງແລ້ວ (tx ດຽວກັນ → rollback ພ້ອມກັນຖ້າການຕັດລົ້ມ).
  await markReservationsConsumed(tx, params.appointmentId);
}

// ============================================================ Purchase orders

type PoAuth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'> | null;
const QTY_EPS = 0.0005;
/** ສະຖານະທີ່ຍັງຮັບເຄື່ອງເຂົ້າໄດ້ (DRAFT = ຮັບກົງໂດຍບໍ່ສັ່ງກ່ອນ — ພຶດຕິກຳເກົ່າ, ຖ້າຍອດບໍ່ຕ້ອງອະນຸມັດ). */
const PO_RECEIVABLE = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] as const;

const PO_INCLUDE = {
  branch: { select: { name: true } },
  supplier: { select: { name: true, isActive: true, deletedAt: true } },
  orderedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  items: {
    include: { product: { select: { name: true, sku: true, unit: true, trackLot: true } }, uom: { select: { code: true } } },
  },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseOrderInclude;
type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof PO_INCLUDE }>;

const GRN_INCLUDE = {
  purchaseOrder: { select: { poNumber: true } },
  receivedBy: { select: { name: true } },
  lines: { include: { product: { select: { name: true, sku: true, unit: true } }, uom: { select: { code: true } } } },
} satisfies Prisma.GoodsReceiptInclude;
type GrnRow = Prisma.GoodsReceiptGetPayload<{ include: typeof GRN_INCLUDE }>;

function toGrnView(g: GrnRow): GoodsReceiptView {
  const lines = g.lines.map((l) => {
    const qtyReceived = qnum(l.qtyReceived);
    const unitCost = costNum(l.unitCost);
    return {
      id: l.id,
      poItemId: l.poItemId,
      productId: l.productId,
      productName: l.product.name,
      sku: l.product.sku,
      unit: l.product.unit,
      qtyReceived,
      qtyRejected: qnum(l.qtyRejected),
      rejectReason: l.rejectReason,
      uomId: l.uomId,
      uomCode: l.uom?.code ?? null,
      factorToBase: factorNum(l.factorToBase),
      unitCost: money(unitCost),
      unitCostForeign: l.unitCostForeign != null ? costNum(l.unitCostForeign) : null,
      lineValue: money(qtyReceived * unitCost),
      lotId: l.lotId,
      lotNumber: l.lotNumber,
      expiryDate: fromDateOnly(l.expiryDate),
    };
  });
  return {
    id: g.id,
    grnNumber: g.grnNumber,
    purchaseOrderId: g.purchaseOrderId,
    poNumber: g.purchaseOrder.poNumber,
    branchId: g.branchId,
    currency: g.currency,
    fxRate: g.fxRate.toNumber(),
    receivedAt: g.receivedAt.toISOString(),
    receivedByUserName: g.receivedBy?.name ?? null,
    supplierDeliveryNote: g.supplierDeliveryNote,
    notes: g.notes,
    totalValue: money(lines.reduce((s, l) => s + l.lineValue, 0)),
    lines,
  };
}

function toPoView(po: PoRow, withItems: boolean, receipts?: GrnRow[]): PurchaseOrderView {
  const closed = po.status === 'RECEIVED' || po.status === 'CANCELLED';
  return {
    id: po.id,
    poNumber: po.poNumber,
    branchId: po.branchId,
    branchName: po.branch.name,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    supplierInactive: !po.supplier.isActive || po.supplier.deletedAt != null,
    status: po.status,
    totalAmount: money(po.totalAmount),
    currency: po.currency,
    fxRate: po.fxRate.toNumber(),
    totalAmountLak: money(money(po.totalAmount) * po.fxRate.toNumber()),
    itemCount: po._count.items,
    orderDate: po.orderDate.toISOString(),
    receivedDate: po.receivedDate ? po.receivedDate.toISOString() : null,
    orderedByUserName: po.orderedBy?.name ?? null,
    approvedByUserName: po.approvedBy?.name ?? null,
    approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
    rejectedReason: po.rejectedReason,
    closedShortAt: po.closedShortAt ? po.closedShortAt.toISOString() : null,
    closedShortReason: po.closedShortReason,
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
            unitCost: costNum(it.unitCost),
            lineTotal: money(qnum(it.quantity) * it.unitCost.toNumber()),
            uomId: it.uomId,
            uomCode: it.uom?.code ?? null,
            factorToBase: factorNum(it.factorToBase),
            uomQty: qnum(qnum(it.quantity) / factorNum(it.factorToBase)),
            uomUnitCost: money(it.unitCost.toNumber() * factorNum(it.factorToBase)),
            trackLot: it.product.trackLot,
            lotNumber: it.lotNumber,
            expiryDate: fromDateOnly(it.expiryDate),
            mfgDate: fromDateOnly(it.mfgDate),
            qtyReceived: qnum(it.qtyReceived),
            qtyRejected: qnum(it.qtyRejected),
            // H4 — PO ທີ່ປິດແລ້ວ (ຮັບຄົບ/ປິດຮັບບໍ່ຄົບ/ຍົກເລີກ) ບໍ່ມີຈຳນວນຄ້າງ (ບໍ່ນັບເປັນ on-order).
            qtyOutstanding: closed ? 0 : Math.max(0, qnum(qnum(it.quantity) - qnum(it.qtyReceived))),
          })),
        }
      : {}),
    ...(receipts ? { receipts: receipts.map(toGrnView) } : {}),
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


// ============================================================ PO revision history (M7 remainder)

type PoSnapItem = { productId: string; productName: string; quantity: number; unitCost: number; uomCode: string | null };
type PoSnapshot = {
  status: PoStatusValue;
  supplierId: string;
  supplierName: string;
  currency: string;
  fxRate: number;
  totalAmount: number;
  items: PoSnapItem[];
};

/** header + ລາຍການ ຂອງ PO ນະຈຸດນີ້ (ພາຍໃນ tx ທີ່ lock ແຖວ PO ແລ້ວ). */
async function poSnapshot(tx: Tx, id: string): Promise<PoSnapshot> {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      items: { include: { product: { select: { name: true } }, uom: { select: { code: true } } }, orderBy: { id: 'asc' } },
    },
  });
  return {
    status: po.status,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    currency: po.currency,
    fxRate: po.fxRate.toNumber(),
    totalAmount: money(po.totalAmount),
    items: po.items.map((it) => ({
      productId: it.productId,
      productName: it.product.name,
      quantity: qnum(it.quantity),
      unitCost: costNum(it.unitCost),
      uomCode: it.uom?.code ?? null,
    })),
  };
}

export function diffPoSnapshots(a: PoSnapshot, b: PoSnapshot): PurchaseOrderRevisionChange[] {
  const out: PurchaseOrderRevisionChange[] = [];
  if (a.status !== b.status) out.push({ field: 'status', from: a.status, to: b.status });
  if (a.supplierId !== b.supplierId) out.push({ field: 'supplier', from: a.supplierName, to: b.supplierName });
  if (a.currency !== b.currency) out.push({ field: 'currency', from: a.currency, to: b.currency });
  if (Math.abs(a.fxRate - b.fxRate) > 1e-9) out.push({ field: 'fxRate', from: a.fxRate, to: b.fxRate });
  if (Math.abs(a.totalAmount - b.totalAmount) > 0.005) out.push({ field: 'total', from: a.totalAmount, to: b.totalAmount });
  const before = new Map(a.items.map((i) => [i.productId, i]));
  const after = new Map(b.items.map((i) => [i.productId, i]));
  for (const [pid, i] of after) {
    const o = before.get(pid);
    if (!o) {
      out.push({ field: 'item.added', productName: i.productName, from: null, to: i.quantity });
      continue;
    }
    if (Math.abs(o.quantity - i.quantity) > QTY_EPS) out.push({ field: 'item.quantity', productName: i.productName, from: o.quantity, to: i.quantity });
    if (Math.abs(o.unitCost - i.unitCost) > 1e-6) out.push({ field: 'item.unitCost', productName: i.productName, from: o.unitCost, to: i.unitCost });
    if (o.uomCode !== i.uomCode) out.push({ field: 'item.uom', productName: i.productName, from: o.uomCode, to: i.uomCode });
  }
  for (const [pid, o] of before) {
    if (!after.has(pid)) out.push({ field: 'item.removed', productName: o.productName, from: o.quantity, to: null });
  }
  return out;
}

function poRevisionSummary(changes: PurchaseOrderRevisionChange[]): string {
  const parts: string[] = [];
  const st = changes.find((c) => c.field === 'status');
  if (st) parts.push(`status ${st.from} → ${st.to}`);
  const items = changes.filter((c) => c.field.startsWith('item.')).length;
  if (items) parts.push(`${items} line change(s)`);
  const hdr = changes.filter((c) => ['supplier', 'currency', 'fxRate'].includes(c.field)).map((c) => c.field);
  if (hdr.length) parts.push(hdr.join(', '));
  const total = changes.find((c) => c.field === 'total');
  if (total) parts.push(`total ${total.from} → ${total.to}`);
  return parts.join('; ') || 'no change';
}

/**
 * ຂຽນ PurchaseOrderRevision (ໃນ tx ດຽວກັບການປ່ຽນ; ແຖວ PO ຖືກ lock ແລ້ວ → revisionNo ບໍ່ຊ້ຳ).
 * `before` = snapshot ກ່ອນປ່ຽນ (ເກັບເປັນ snapshot); diff ທຽບກັບສະພາບຫຼັງປ່ຽນ. ບໍ່ມີຫຍັງປ່ຽນ ແລະ ບໍ່ມີ note → ບໍ່ຂຽນ.
 */
async function recordPoRevision(
  tx: Tx,
  id: string,
  before: PoSnapshot,
  action: string,
  userId: string | null,
  note?: string | null,
): Promise<void> {
  const after = await poSnapshot(tx, id);
  const changes = diffPoSnapshots(before, after);
  if (!changes.length && !note) return;
  const last = await tx.purchaseOrderRevision.aggregate({ where: { purchaseOrderId: id }, _max: { revisionNo: true } });
  await tx.purchaseOrderRevision.create({
    data: {
      purchaseOrderId: id,
      revisionNo: (last._max.revisionNo ?? 0) + 1,
      action,
      fromStatus: before.status,
      toStatus: after.status,
      changedByUserId: userId,
      snapshot: before as unknown as Prisma.InputJsonValue,
      diff: changes as unknown as Prisma.InputJsonValue,
      summary: poRevisionSummary(changes),
      note: note ?? null,
    },
  });
}

async function poRevisionViews(db: Tx | typeof prisma, id: string): Promise<PurchaseOrderRevisionView[]> {
  const rows = await db.purchaseOrderRevision.findMany({ where: { purchaseOrderId: id }, orderBy: { revisionNo: 'desc' } });
  const userIds = [...new Set(rows.map((r) => r.changedByUserId).filter((v): v is string => !!v))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameBy = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    revisionNo: r.revisionNo,
    action: r.action,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    changedByUserId: r.changedByUserId,
    changedByUserName: r.changedByUserId ? (nameBy.get(r.changedByUserId) ?? null) : null,
    changedAt: r.changedAt.toISOString(),
    summary: r.summary,
    note: r.note,
    changes: (r.diff as unknown as PurchaseOrderRevisionChange[]) ?? [],
  }));
}

async function poDetail(db: Tx | typeof prisma, id: string): Promise<PurchaseOrderView> {
  const [po, receipts, revisions] = await Promise.all([
    db.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE }),
    db.goodsReceipt.findMany({ where: { purchaseOrderId: id }, include: GRN_INCLUDE, orderBy: { receivedAt: 'asc' } }),
    poRevisionViews(db, id),
  ]);
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  return { ...toPoView(po, true, receipts), revisions };
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderView> {
  return poDetail(prisma, id);
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

/** M1 — ແຖວ PO ທີ່ແປງເປັນໜ່ວຍພື້ນຖານແລ້ວ (quantity × factor, unitCost ÷ factor) + ໜ່ວຍ/ອັດຕາ snapshot. */
type BasePoItem = Omit<PurchaseOrderItemInput, 'uomId'> & { uomId: string | null; factorToBase: number };
type ResolvedPoItem = Omit<BasePoItem, 'unitCost'> & { unitCost: number };

/** ລາຄາ/ໜ່ວຍພື້ນຖານຂອງແຖວ PO (6dp — ລາຄາ/ກ່ອງ ÷ 12 ບໍ່ປັດເສດຈົນຍອດລວມຜິດ). */
function poCostDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Number(n).toFixed(6));
}

function poTotal(items: ResolvedPoItem[]): number {
  return money(items.reduce((s, it) => s + qnum(it.quantity) * it.unitCost, 0));
}

/** M1 — input edge ຂອງ PO: ຈຳນວນ/ລາຄາທີ່ປ້ອນເປັນໜ່ວຍຊື້ → ໜ່ວຍພື້ນຖານ. */
async function itemsToBase(db: Tx | typeof prisma, items: PurchaseOrderItemInput[]): Promise<BasePoItem[]> {
  const factors = await resolveUomFactors(db, items);
  return items.map((it, i) => {
    const f = factors[i]!;
    return {
      ...it,
      quantity: qnum(it.quantity * f.factor),
      ...(it.unitCost !== undefined ? { unitCost: it.unitCost / f.factor } : {}),
      uomId: f.uomId,
      factorToBase: f.factor,
    };
  });
}

/**
 * M8 — ແຖວທີ່ບໍ່ໄດ້ໃສ່ unitCost: ລາຄາຈາກລາຍການລາຄາຂອງຜູ້ສະໜອງ (ຖ້າສະກຸນກົງກັບ PO) → ບໍ່ດັ່ງນັ້ນ WAC (LAK) ÷ fxRate.
 */
async function resolvePoItemCosts(
  db: Tx | typeof prisma,
  supplierId: string,
  currency: string,
  fxRate: number,
  items: BasePoItem[],
): Promise<ResolvedPoItem[]> {
  const missing = items.filter((i) => i.unitCost === undefined).map((i) => i.productId);
  if (!missing.length) return items as ResolvedPoItem[];
  const [prices, products] = await Promise.all([
    db.supplierProduct.findMany({ where: { supplierId, productId: { in: missing } } }),
    db.product.findMany({ where: { id: { in: missing } }, select: { id: true, costPrice: true } }),
  ]);
  const priceBy = new Map(prices.map((p) => [p.productId, p]));
  const wacBy = new Map(products.map((p) => [p.id, costNum(p.costPrice)]));
  return items.map((it) => {
    if (it.unitCost !== undefined) return it as ResolvedPoItem;
    const sp = priceBy.get(it.productId);
    // M1 — ລາຄາໃນລາຍການລາຄາເປັນຕໍ່ໜ່ວຍຊື້ຂອງມັນ → ÷ factor = ຕໍ່ໜ່ວຍພື້ນຖານ.
    const cost =
      sp && sp.currency === currency
        ? costNum(sp.unitCost) / factorNum(sp.factorToBase)
        : (wacBy.get(it.productId) ?? 0) / (fxRate || 1);
    return { ...it, unitCost: cost };
  });
}

/** M6 — ຍອດ PO (ເປັນ LAK — M10: total × fxRate) ເກີນເກນ ແລະ ຜູ້ເຮັດບໍ່ແມ່ນ SUPER_ADMIN → ຕ້ອງອະນຸມັດກ່ອນເປັນ ORDERED. */
function needsPoApproval(totalLak: number, auth: PoAuth, settings: StockAdjustSettingsView): boolean {
  return auth?.role !== 'SUPER_ADMIN' && totalLak > settings.poApprovalThresholdLak;
}

export async function createPurchaseOrder(input: PurchaseOrderCreateInput, auth: PoAuth): Promise<PurchaseOrderView> {
  assertBranchScope(auth?.branchId, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  // M20/M9 — ຜູ້ສະໜອງທີ່ປິດ/ລຶບແລ້ວ ຫຼື ຂອງສາຂາອື່ນ ສ້າງ PO ບໍ່ໄດ້.
  const supplier = await assertSupplierUsable(prisma, input.supplierId, input.branchId);
  // M10 — ສະກຸນ: ບໍ່ໃສ່ = ສະກຸນຂອງຜູ້ສະໜອງ; ອັດຕາ: ບໍ່ໃສ່ = ອັດຕາບັນທຶກບັນຊີ (ExchangeRate).
  const currency = input.currency ?? supplier.currency;
  const fxRate = await resolveFxRate(currency, input.fxRate);
  const items = await resolvePoItemCosts(prisma, input.supplierId, currency, fxRate, await itemsToBase(prisma, input.items));
  const total = poTotal(items);
  const settings = await getAdjustSettings();
  const status: PoStatusValue =
    input.status === 'ORDERED' && needsPoApproval(total * fxRate, auth, settings) ? 'PENDING_APPROVAL' : input.status;

  const po = await prisma.$transaction(async (tx) => {
    await assertProductsForBranch(tx, input.branchId, input.items.map((i) => i.productId));
    return tx.purchaseOrder.create({
      data: {
        branchId: input.branchId,
        supplierId: input.supplierId,
        // M5 — ເລກຕໍ່ເນື່ອງຕໍ່ສາຂາ/ປີ ຜ່ານ DocumentSequence (tx ດຽວກັນ → rollback ເລກກໍ rollback).
        poNumber: await nextDocumentNo(tx, input.branchId, 'PO'),
        status,
        orderedByUserId: input.status === 'ORDERED' ? (auth?.sub ?? null) : null,
        currency,
        fxRate: new Prisma.Decimal(fxRate.toFixed(6)),
        totalAmount: new Prisma.Decimal(total.toFixed(2)),
        items: {
          create: items.map((it) => ({
            productId: it.productId,
            quantity: qdec(it.quantity),
            unitCost: poCostDec(it.unitCost),
            uomId: it.uomId,
            factorToBase: factorDec(it.factorToBase),
            lotNumber: it.lotNumber ?? null,
            expiryDate: toDateOnly(it.expiryDate),
            mfgDate: toDateOnly(it.mfgDate),
          })),
        },
      },
      select: { id: true },
    });
  });
  const view = await poDetail(prisma, po.id);
  if (view.status === 'PENDING_APPROVAL') void notifyPoApprovers(view, auth?.sub ?? null);
  return view;
}

/**
 * ແກ້ PO. M7 — ລາຍການ upsert ຕາມ productId (ຮັກສາ id ຂອງແຖວ; ລຶບສະເພາະແຖວທີ່ເອົາອອກ). ແຖວທີ່ມີການຮັບ/ປະຕິເສດແລ້ວ
 * ລຶບບໍ່ໄດ້ ແລະ ຫຼຸດ quantity ຕ່ຳກວ່າ qtyReceived ບໍ່ໄດ້. ແກ້ລາຍການໄດ້ໃນ DRAFT/ORDERED/PARTIALLY_RECEIVED (ບໍ່ແມ່ນລະຫວ່າງລໍ
 * ອະນຸມັດ); ການແກ້ PO ທີ່ສັ່ງແລ້ວໃຫ້ຍອດເພີ່ມຂຶ້ນເກີນເກນອະນຸມັດ ຕ້ອງເປັນ SUPER_ADMIN.
 */
export async function updatePurchaseOrder(
  id: string,
  input: PurchaseOrderUpdateInput,
  auth: PoAuth,
): Promise<PurchaseOrderView> {
  const settings = await getAdjustSettings();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    assertBranchScope(auth?.branchId, existing.branchId);
    if (existing.status === 'RECEIVED' || existing.status === 'CANCELLED') {
      throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ປິດແລ້ວ — ແກ້ໄຂບໍ່ໄດ້');
    }
    // M7 — snapshot ກ່ອນແກ້ (revision history).
    const before = await poSnapshot(tx, id);
    const touched = (it: { qtyReceived: Prisma.Decimal; qtyRejected: Prisma.Decimal }) =>
      qnum(it.qtyReceived) > 0 || qnum(it.qtyRejected) > 0;
    const hasReceipts = existing.items.some(touched);

    if (input.supplierId && input.supplierId !== existing.supplierId) {
      if (hasReceipts) throw ApiError.conflict('ປ່ຽນຜູ້ສະໜອງບໍ່ໄດ້ — ມີການຮັບເຄື່ອງແລ້ວ');
      await assertSupplierUsable(tx, input.supplierId, existing.branchId);
    }

    // M10 — ສະກຸນ/ອັດຕາ ລັອກເມື່ອມີການຮັບເຄື່ອງແລ້ວ (WAC ຂອງ GRN ໃຊ້ອັດຕານັ້ນໄປແລ້ວ).
    const currency = input.currency ?? existing.currency;
    let fxRate = existing.fxRate.toNumber();
    const fxChanged = (input.currency !== undefined && input.currency !== existing.currency) || input.fxRate !== undefined;
    if (fxChanged) {
      if (hasReceipts && (currency !== existing.currency || (input.fxRate !== undefined && Math.abs(input.fxRate - fxRate) > 1e-9))) {
        throw ApiError.conflict('ປ່ຽນສະກຸນເງິນ/ອັດຕາແລກປ່ຽນບໍ່ໄດ້ — ມີການຮັບເຄື່ອງແລ້ວ (ອັດຕາຖືກລັອກ)');
      }
      fxRate = await resolveFxRate(currency, input.fxRate);
    }
    const supplierId = input.supplierId ?? existing.supplierId;

    let total = money(existing.totalAmount);
    if (input.items) {
      if (existing.status === 'PENDING_APPROVAL') {
        throw ApiError.conflict('PO ນີ້ລໍຖ້າອະນຸມັດ — ດຶງກັບເປັນ DRAFT ກ່ອນຈຶ່ງແກ້ລາຍການໄດ້');
      }
      await assertProductsForBranch(tx, existing.branchId, input.items.map((i) => i.productId));
      const items = await resolvePoItemCosts(tx, supplierId, currency, fxRate, await itemsToBase(tx, input.items));
      const newTotal = poTotal(items);
      if (
        existing.status !== 'DRAFT' &&
        auth?.role !== 'SUPER_ADMIN' &&
        newTotal * fxRate > total * existing.fxRate.toNumber() + 0.005 &&
        newTotal * fxRate > settings.poApprovalThresholdLak
      ) {
        throw ApiError.forbidden('ການແກ້ນີ້ເຮັດໃຫ້ຍອດ PO ເກີນເກນອະນຸມັດ — ຕ້ອງໃຫ້ SUPER_ADMIN ແກ້');
      }
      const byProduct = new Map(existing.items.map((it) => [it.productId, it]));
      const keep = new Set(input.items.map((i) => i.productId));
      const removed = existing.items.filter((it) => !keep.has(it.productId));
      for (const it of removed) {
        if (touched(it)) throw ApiError.conflict('ລຶບລາຍການທີ່ມີການຮັບເຄື່ອງແລ້ວບໍ່ໄດ້');
      }
      for (const it of items) {
        const prev = byProduct.get(it.productId);
        const data = {
          quantity: qdec(it.quantity),
          unitCost: poCostDec(it.unitCost),
          uomId: it.uomId,
          factorToBase: factorDec(it.factorToBase),
          lotNumber: it.lotNumber ?? null,
          expiryDate: toDateOnly(it.expiryDate),
          mfgDate: toDateOnly(it.mfgDate),
        };
        if (!prev) {
          await tx.purchaseOrderItem.create({ data: { ...data, purchaseOrderId: id, productId: it.productId } });
          continue;
        }
        if (qnum(it.quantity) < qnum(prev.qtyReceived) - QTY_EPS) {
          throw ApiError.conflict(`ຫຼຸດຈຳນວນຕ່ຳກວ່າທີ່ຮັບແລ້ວ (${qnum(prev.qtyReceived)}) ບໍ່ໄດ້`);
        }
        await tx.purchaseOrderItem.update({ where: { id: prev.id }, data });
      }
      if (removed.length) await tx.purchaseOrderItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
      total = newTotal;
    }

    let status: PoStatusValue = existing.status;
    const extra: Prisma.PurchaseOrderUncheckedUpdateInput = {};
    if (input.status && input.status !== existing.status) {
      if (input.status === 'ORDERED') {
        if (existing.status !== 'DRAFT') throw ApiError.conflict('ສັ່ງຊື້ໄດ້ສະເພາະ PO ທີ່ເປັນ DRAFT');
        status = needsPoApproval(total * fxRate, auth, settings) ? 'PENDING_APPROVAL' : 'ORDERED';
        Object.assign(extra, { orderedByUserId: auth?.sub ?? null, rejectedReason: null, approvedByUserId: null, approvedAt: null });
      } else {
        // CANCELLED / DRAFT (ດຶງຄືນ) — ບໍ່ໄດ້ຖ້າມີການຮັບແລ້ວ (ໃຫ້ໃຊ້ "ປິດຮັບບໍ່ຄົບ" ແທນ).
        if (hasReceipts) throw ApiError.conflict('ມີການຮັບເຄື່ອງແລ້ວ — ໃຊ້ "ປິດຮັບບໍ່ຄົບ" ແທນ');
        status = input.status;
      }
    }
    if (input.items && status === 'PARTIALLY_RECEIVED') {
      const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id }, select: { quantity: true, qtyReceived: true } });
      if (fresh.every((it) => qnum(it.qtyReceived) >= qnum(it.quantity) - QTY_EPS)) {
        status = 'RECEIVED';
        extra.receivedDate = new Date();
      }
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
        ...(input.items ? { totalAmount: new Prisma.Decimal(total.toFixed(2)) } : {}),
        ...(fxChanged ? { currency, fxRate: new Prisma.Decimal(fxRate.toFixed(6)) } : {}),
        status,
        ...extra,
      },
    });
    const action =
      status === existing.status
        ? 'UPDATE'
        : status === 'PENDING_APPROVAL'
          ? 'SUBMIT_APPROVAL'
          : status === 'ORDERED'
            ? 'ORDER'
            : status === 'CANCELLED'
              ? 'CANCEL'
              : status === 'DRAFT'
                ? 'REVERT_DRAFT'
                : 'UPDATE';
    await recordPoRevision(tx, id, before, action, auth?.sub ?? null);
  });
  const view = await poDetail(prisma, id);
  if (input.status === 'ORDERED' && view.status === 'PENDING_APPROVAL') void notifyPoApprovers(view, auth?.sub ?? null);
  return view;
}

/** M6 — SUPER_ADMIN (ກັ້ນທີ່ route): PENDING_APPROVAL → ORDERED. */
export async function approvePurchaseOrder(id: string, reviewerId: string): Promise<PurchaseOrderView> {
  const orderedBy = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, select: { status: true, orderedByUserId: true } });
    if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    if (po.status !== 'PENDING_APPROVAL') throw ApiError.conflict('ອະນຸມັດໄດ້ສະເພາະ PO ທີ່ລໍຖ້າອະນຸມັດ');
    const before = await poSnapshot(tx, id);
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'ORDERED', approvedByUserId: reviewerId, approvedAt: new Date(), rejectedReason: null },
    });
    await recordPoRevision(tx, id, before, 'APPROVE', reviewerId);
    return po.orderedByUserId;
  });
  const view = await poDetail(prisma, id);
  if (orderedBy) void notifyPoOrderer(orderedBy, view, true);
  return view;
}

/** M6 — SUPER_ADMIN: PENDING_APPROVAL → DRAFT ພ້ອມເຫດຜົນ (ຜູ້ສັ່ງແກ້ແລ້ວສັ່ງໃໝ່ໄດ້). */
export async function rejectPurchaseOrder(
  id: string,
  reviewerId: string,
  input: PurchaseOrderRejectInput,
): Promise<PurchaseOrderView> {
  const orderedBy = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, select: { status: true, orderedByUserId: true } });
    if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    if (po.status !== 'PENDING_APPROVAL') throw ApiError.conflict('ປະຕິເສດໄດ້ສະເພາະ PO ທີ່ລໍຖ້າອະນຸມັດ');
    const before = await poSnapshot(tx, id);
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'DRAFT', rejectedReason: input.reason, approvedByUserId: reviewerId, approvedAt: new Date() },
    });
    await recordPoRevision(tx, id, before, 'REJECT', reviewerId, input.reason);
    return po.orderedByUserId;
  });
  const view = await poDetail(prisma, id);
  if (orderedBy) void notifyPoOrderer(orderedBy, view, false);
  return view;
}

async function notifyPoApprovers(po: PurchaseOrderView, actorId: string | null): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null, ...(actorId ? { id: { not: actorId } } : {}) },
      select: { id: true },
    });
    await Promise.all(
      admins.map((u) =>
        notifyUser({
          userId: u.id,
          type: 'PO_APPROVAL_PENDING',
          title: 'ໃບສັ່ງຊື້ລໍຖ້າອະນຸມັດ',
          body: `${po.poNumber} · ${po.supplierName} · ${po.totalAmount.toLocaleString('en-US')} LAK · ${po.branchName}`,
          severity: 'warning',
          data: { purchaseOrderId: po.id, branchId: po.branchId },
          dedupeKey: `po-approval-pending:${po.id}:${po.updatedAt}:${u.id}`,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, purchaseOrderId: po.id }, 'PO approver notification failed');
  }
}

async function notifyPoOrderer(userId: string, po: PurchaseOrderView, approved: boolean): Promise<void> {
  try {
    await notifyUser({
      userId,
      type: approved ? 'PO_APPROVED' : 'PO_REJECTED',
      title: approved ? 'ໃບສັ່ງຊື້ຖືກອະນຸມັດ' : 'ໃບສັ່ງຊື້ຖືກປະຕິເສດ',
      body: `${po.poNumber} · ${po.totalAmount.toLocaleString('en-US')} LAK${approved ? '' : ` — ${po.rejectedReason ?? ''}`}`,
      severity: approved ? 'info' : 'warning',
      data: { purchaseOrderId: po.id, branchId: po.branchId },
    });
  } catch (err) {
    logger.warn({ err, purchaseOrderId: po.id }, 'PO orderer notification failed');
  }
}

/** M18 — lock ແຖວສິນຄ້າຫຼາຍແຖວໃນຄຳສັ່ງດຽວ ຕາມລຳດັບ id (ທຸກ tx lock ລຳດັບດຽວກັນ → ບໍ່ deadlock). */
export async function lockProductRows(tx: Tx, productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw`SELECT id FROM "products" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

type PoForReceipt = Prisma.PurchaseOrderGetPayload<{ include: { items: true } }>;

/**
 * H4 — ຮັບເຄື່ອງເຂົ້າ 1 GRN (ພາຍໃນ tx). lock PO → ກວດສະຖານະ/tolerance → lock ສິນຄ້າທັງໝົດເທື່ອດຽວ (ລຽງ id) →
 * ຕໍ່ແຖວ: lot (C5) + WAC (C4) + PURCHASE_IN refId `grn:<id>` ສະເພາະຈຳນວນທີ່ຮັບ (accepted); ຈຳນວນປະຕິເສດບັນທຶກແຕ່ໃນ GRN.
 * ສະຖານະ PO: ຮັບຄົບທຸກແຖວ = RECEIVED, ມີການຮັບບາງສ່ວນ = PARTIALLY_RECEIVED.
 */
async function postGoodsReceipt(
  tx: Tx,
  poId: string,
  auth: PoAuth,
  settings: StockAdjustSettingsView,
  build: (po: PoForReceipt) => GoodsReceiptLineInput[],
  meta: { supplierDeliveryNote?: string | null; notes?: string | null } = {},
): Promise<string> {
  // C1 — lock ແຖວ PO ກ່ອນ ກັນ 2 ຄຳຂໍຮັບເຄື່ອງພ້ອມກັນ (ບໍ່ດັ່ງນັ້ນທັງສອງອາດຜ່ານການກວດ tolerance ພ້ອມກັນ).
  await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${poId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  assertBranchScope(auth?.branchId, po.branchId);
  if (po.status === 'RECEIVED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຮັບເຄື່ອງແລ້ວ');
  if (po.status === 'CANCELLED') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ຖືກຍົກເລີກ');
  if (po.status === 'PENDING_APPROVAL') throw ApiError.conflict('ໃບສັ່ງຊື້ນີ້ລໍຖ້າອະນຸມັດ — ຍັງຮັບເຄື່ອງບໍ່ໄດ້');
  if (!(PO_RECEIVABLE as readonly string[]).includes(po.status)) throw ApiError.conflict('ຮັບເຄື່ອງບໍ່ໄດ້ໃນສະຖານະນີ້');
  const fxRate = po.fxRate.toNumber();
  if (po.status === 'DRAFT' && needsPoApproval(money(po.totalAmount) * fxRate, auth, settings)) {
    throw ApiError.conflict('ຍອດ PO ເກີນເກນອະນຸມັດ — ຕ້ອງສັ່ງຊື້ ແລະ ໄດ້ຮັບອະນຸມັດກ່ອນຮັບເຄື່ອງ');
  }
  const revBefore = await poSnapshot(tx, poId);

  const rawLines = build(po);
  if (!rawLines.length) throw ApiError.conflict('ບໍ່ມີລາຍການຄ້າງຮັບ');
  if (new Set(rawLines.map((l) => l.poItemId)).size !== rawLines.length) throw ApiError.badRequest('ມີແຖວ PO ຊ້ຳກັນໃນໃບຮັບ');
  const itemById = new Map(po.items.map((it) => [it.id, it]));
  // M1 — input edge ຂອງ GRN: uomId ບໍ່ໃສ່ = ໜ່ວຍທີ່ສັ່ງ (ອັດຕາ snapshot ຂອງ PO), null = ໜ່ວຍພື້ນຖານ, ອື່ນ = ອັດຕາຂອງສິນຄ້າ.
  // ຈາກນີ້ໄປທຸກຈຳນວນ/ຕົ້ນທຶນເປັນໜ່ວຍພື້ນຖານ (tolerance, WAC, lot, ledger).
  const explicit = rawLines.filter((l) => l.uomId !== undefined && itemById.has(l.poItemId));
  const explicitFactors = await resolveUomFactors(
    tx,
    explicit.map((l) => ({ productId: itemById.get(l.poItemId)!.productId, uomId: l.uomId })),
  );
  const factorByLine = new Map(explicit.map((l, i) => [l.poItemId, explicitFactors[i]!]));
  const uomByPoItem = new Map<string, { uomId: string | null; factor: number }>();
  const lines: GoodsReceiptLineInput[] = rawLines.map((l) => {
    const it = itemById.get(l.poItemId);
    if (!it) return l;
    const f = factorByLine.get(l.poItemId) ?? { uomId: it.uomId, factor: factorNum(it.factorToBase) };
    uomByPoItem.set(l.poItemId, f);
    if (f.factor === 1) return l;
    return {
      ...l,
      qtyReceived: qnum(l.qtyReceived * f.factor),
      qtyRejected: qnum(l.qtyRejected * f.factor),
      ...(l.unitCost !== undefined ? { unitCost: l.unitCost / f.factor } : {}),
    };
  });
  const tol = settings.overReceiptTolerancePct;
  for (const l of lines) {
    const it = itemById.get(l.poItemId);
    if (!it) throw ApiError.badRequest('ມີແຖວທີ່ບໍ່ຢູ່ໃນ PO ນີ້');
    const cap = qnum(qnum(it.quantity) * (1 + tol / 100));
    if (qnum(it.qtyReceived) + l.qtyReceived > cap + QTY_EPS) {
      throw ApiError.conflict(
        `ຮັບເກີນຈຳນວນສັ່ງ — ຮັບໄດ້ອີກສູງສຸດ ${Math.max(0, qnum(cap - qnum(it.qtyReceived)))} (tolerance ${tol}%)`,
      );
    }
  }

  // M18 — lock + ໂຫຼດສິນຄ້າທຸກລາຍການເທື່ອດຽວ (ແທນ findUnique ຕໍ່ແຖວ); lock ຕາມລຳດັບ id ກັນ deadlock.
  const productIds = lines.map((l) => itemById.get(l.poItemId)!.productId);
  await lockProductRows(tx, productIds);
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, branchId: true, stockQty: true, costPrice: true, trackLot: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const grn = await tx.goodsReceipt.create({
    data: {
      grnNumber: await nextDocumentNo(tx, po.branchId, 'GRN'),
      purchaseOrderId: po.id,
      branchId: po.branchId,
      receivedByUserId: auth?.sub ?? null,
      supplierDeliveryNote: meta.supplierDeliveryNote?.trim() || null,
      notes: meta.notes?.trim() || null,
      // M10 — ລັອກສະກຸນ/ອັດຕາຂອງ PO ໄວ້ໃນ GRN (ແກ້ PO ຫຼັງຮັບແລ້ວບໍ່ໄດ້).
      currency: po.currency,
      fxRate: po.fxRate,
    },
    select: { id: true, grnNumber: true },
  });

  const ordered = [...lines].sort((a, b) =>
    itemById.get(a.poItemId)!.productId.localeCompare(itemById.get(b.poItemId)!.productId),
  );
  for (const l of ordered) {
    const it = itemById.get(l.poItemId)!;
    const product = productById.get(it.productId);
    if (!product) throw ApiError.conflict('ສິນຄ້າໃນ PO ບໍ່ພົບແລ້ວ — ຮັບເຄື່ອງບໍ່ໄດ້');
    // M10 — ລາຄາໃນ GRN/PO ເປັນສະກຸນຂອງ PO → WAC, lot, ledger ແລະ 3-way match ໃຊ້ LAK = ລາຄາ × fxRate.
    const unitCostForeign = l.unitCost ?? it.unitCost.toNumber();
    const unitCost = costNum(unitCostForeign * fxRate);
    const lot: { lotId: string | null; lotNumber: string | null; expiryDate: Date | null; mfgDate: Date | null } = {
      lotId: null,
      lotNumber: null,
      expiryDate: null,
      mfgDate: null,
    };
    if (l.qtyReceived > 0) {
      if (product.trackLot) {
        // C5 — ສິນຄ້າ trackLot ຮັບໂດຍບໍ່ມີເລກ lot ບໍ່ໄດ້ (ຈະເຮັດໃຫ້ FEFO/recall ໃຊ້ບໍ່ໄດ້). ແຕ່ລະ GRN ໃຊ້ lot ຂອງຕົນເອງໄດ້.
        lot.lotNumber = l.lotNumber ?? it.lotNumber;
        if (!lot.lotNumber) {
          throw ApiError.badRequest(`ສິນຄ້າ "${product.name}" ຕິດຕາມ lot — ຕ້ອງລະບຸເລກ lot ຕອນຮັບເຄື່ອງ`);
        }
        lot.expiryDate = l.expiryDate !== undefined ? toDateOnly(l.expiryDate) : it.expiryDate;
        lot.mfgDate = l.mfgDate !== undefined ? toDateOnly(l.mfgDate) : it.mfgDate;
        lot.lotId = await receiveIntoLot(tx, {
          productId: product.id,
          branchId: product.branchId,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate,
          mfgDate: lot.mfgDate,
          qty: l.qtyReceived,
          unitCost,
          poItemId: it.id,
        });
      }
      const onHandBefore = qnum(product.stockQty);
      const balance = qnum(onHandBefore + l.qtyReceived);
      // C4 — WAC ໃໝ່ຈາກຍອດເກົ່າ + ຈຳນວນທີ່ຮັບໃນ GRN ນີ້ ຕາມຕົ້ນທຶນຂອງແຖວ GRN.
      const newWac = wacAfterReceipt(onHandBefore, costNum(product.costPrice), l.qtyReceived, unitCost);
      await tx.product.update({ where: { id: product.id }, data: { stockQty: qdec(balance), costPrice: costDec(newWac) } });
      product.stockQty = qdec(balance);
      product.costPrice = costDec(newWac);
      await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          type: 'PURCHASE_IN',
          qty: qdec(l.qtyReceived),
          balanceAfter: qdec(balance),
          unitCost: costDec(unitCost),
          valueChange: money(l.qtyReceived * unitCost),
          lotId: lot.lotId,
          refId: `grn:${grn.id}`,
          notes: `ຮັບເຄື່ອງ ${grn.grnNumber} (${po.poNumber})`,
          createdByUserId: auth?.sub ?? null,
        },
      });
    }
    await tx.purchaseOrderItem.update({
      where: { id: it.id },
      data: {
        qtyReceived: qdec(qnum(it.qtyReceived) + l.qtyReceived),
        qtyRejected: qdec(qnum(it.qtyRejected) + l.qtyRejected),
        // ບັນທຶກ lot ຫຼ້າສຸດທີ່ຮັບຈິງໄວ້ໃນ PO item ເປັນຫຼັກຖານ (ລາຍລະອຽດຕໍ່ GRN ຢູ່ໃນແຖວ GRN).
        ...(lot.lotNumber ? { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, mfgDate: lot.mfgDate } : {}),
      },
    });
    await tx.goodsReceiptLine.create({
      data: {
        goodsReceiptId: grn.id,
        poItemId: it.id,
        productId: it.productId,
        qtyReceived: qdec(l.qtyReceived),
        qtyRejected: qdec(l.qtyRejected),
        rejectReason: l.qtyRejected > 0 ? (l.rejectReason?.trim() ?? null) : null,
        unitCost: costDec(unitCost),
        unitCostForeign: po.currency === 'LAK' ? null : costDec(unitCostForeign),
        uomId: uomByPoItem.get(it.id)?.uomId ?? null,
        factorToBase: factorDec(uomByPoItem.get(it.id)?.factor ?? 1),
        ...lot,
      },
    });
  }

  const fresh = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: po.id },
    select: { quantity: true, qtyReceived: true },
  });
  const complete = fresh.every((it) => qnum(it.qtyReceived) >= qnum(it.quantity) - QTY_EPS);
  const anyReceived = fresh.some((it) => qnum(it.qtyReceived) > 0);
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: complete ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'ORDERED',
      ...(complete ? { receivedDate: new Date() } : {}),
      ...(po.orderedByUserId ? {} : { orderedByUserId: auth?.sub ?? null }),
    },
  });
  // M7 — ບັນທຶກການຮັບເຄື່ອງ (ແລະ ສະຖານະທີ່ປ່ຽນ) ໃນປະຫວັດ PO.
  const grnNo = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: grn.id }, select: { grnNumber: true } });
  await recordPoRevision(tx, po.id, revBefore, 'RECEIVE', auth?.sub ?? null, grnNo.grnNumber);
  return grn.id;
}

/** H4 — POST /purchase-orders/:id/receipts: ຮັບບາງລາຍການ/ບາງຈຳນວນ (GRN ໃໝ່ 1 ໃບ). */
export async function receiveGoods(
  poId: string,
  input: GoodsReceiptCreateInput,
  auth: PoAuth,
): Promise<{ receipt: GoodsReceiptView; purchaseOrder: PurchaseOrderView }> {
  const settings = await getAdjustSettings();
  const grnId = await prisma.$transaction(
    (tx) => postGoodsReceipt(tx, poId, auth, settings, () => input.lines, input),
    { timeout: 30_000 },
  );
  const [receipt, purchaseOrder] = await Promise.all([
    prisma.goodsReceipt.findUniqueOrThrow({ where: { id: grnId }, include: GRN_INCLUDE }),
    poDetail(prisma, poId),
  ]);
  return { receipt: toGrnView(receipt), purchaseOrder };
}

/**
 * ເສັ້ນທາງເກົ່າ POST /purchase-orders/:id/receive = "ຮັບທຸກຈຳນວນທີ່ຍັງຄ້າງ" ຜ່ານ GRN ໃໝ່ 1 ໃບ.
 * body `{lots}` (ຕາມ productId) ທັບເລກ lot ໃນ PO item ຄືເກົ່າ.
 */
export async function receivePurchaseOrder(
  id: string,
  auth: PoAuth,
  input: PurchaseOrderReceiveInput = {},
): Promise<PurchaseOrderView> {
  const settings = await getAdjustSettings();
  const lotByProduct = new Map((input.lots ?? []).map((l) => [l.productId, l]));
  await prisma.$transaction(
    (tx) =>
      postGoodsReceipt(tx, id, auth, settings, (po) => {
        for (const pid of lotByProduct.keys()) {
          if (!po.items.some((it) => it.productId === pid)) throw ApiError.badRequest('ມີ lot ທີ່ບໍ່ຢູ່ໃນລາຍການຂອງ PO ນີ້');
        }
        return po.items
          .filter((it) => qnum(it.quantity) - qnum(it.qtyReceived) > QTY_EPS)
          .map((it) => {
            const l = lotByProduct.get(it.productId);
            return {
              poItemId: it.id,
              // ຈຳນວນຄ້າງເປັນໜ່ວຍພື້ນຖານຢູ່ແລ້ວ → uomId null (ບໍ່ແປງຊ້ຳ).
              uomId: null,
              qtyReceived: qnum(qnum(it.quantity) - qnum(it.qtyReceived)),
              qtyRejected: 0,
              ...(l ? { lotNumber: l.lotNumber, expiryDate: l.expiryDate ?? null, mfgDate: l.mfgDate ?? null } : {}),
            };
          });
      }),
    { timeout: 30_000 },
  );
  return poDetail(prisma, id);
}

/**
 * H4 — ປິດຮັບບໍ່ຄົບ (close short): PO ທີ່ຮັບບາງສ່ວນ → RECEIVED + closedShortAt. ຈຳນວນທີ່ຍັງຄ້າງບໍ່ນັບເປັນ on-order ອີກ
 * (qtyOutstanding = 0) ແລະ ຮັບເພີ່ມບໍ່ໄດ້. PO ທີ່ຍັງບໍ່ມີການຮັບເລີຍ ໃຫ້ຍົກເລີກແທນ.
 */
export async function closeShortPurchaseOrder(
  id: string,
  input: PurchaseOrderCloseShortInput,
  auth: PoAuth,
): Promise<PurchaseOrderView> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    assertBranchScope(auth?.branchId, po.branchId);
    const anyReceived = po.items.some((it) => qnum(it.qtyReceived) > 0);
    if (po.status !== 'PARTIALLY_RECEIVED' && !(po.status === 'ORDERED' && anyReceived)) {
      throw ApiError.conflict('ປິດຮັບບໍ່ຄົບໄດ້ສະເພາະ PO ທີ່ຮັບເຄື່ອງບາງສ່ວນແລ້ວ (ບໍ່ມີການຮັບ → ຍົກເລີກແທນ)');
    }
    const before = await poSnapshot(tx, id);
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedDate: new Date(),
        closedShortAt: new Date(),
        closedShortReason: input.reason,
        closedByUserId: auth?.sub ?? null,
      },
    });
    await recordPoRevision(tx, id, before, 'CLOSE_SHORT', auth?.sub ?? null, input.reason);
  });
  return poDetail(prisma, id);
}

export async function deletePurchaseOrder(id: string, authBranchId?: string | null): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, branchId: true } });
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  assertBranchScope(authBranchId, po.branchId);
  if (po.status !== 'DRAFT') throw ApiError.conflict('ລຶບໄດ້ສະເພາະ PO ທີ່ຍັງ DRAFT');
  await prisma.purchaseOrder.delete({ where: { id } });
}

// ============================================================ Stock transfers (cross-branch)

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
            // ຫຼືລຶບຫຼັງຈາກນັ້ນ, ແຕ່ລາຍການໂອນຄວນສະແດງຄ່າ àºàº²àº¡ ເວລາທີ່ໂອນ.
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
        // M5 — ນັບຕໍ່ສາຂາຕົ້ນທາງ/ປີ.
        transferNumber: await nextDocumentNo(tx, input.fromBranchId, 'TRF'),
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
      // ຂອງສາຂາຕົ້ນທາງ àºàº²àº¡ ເວລາສົ່ງ (ນີ້ຄືມູນຄ່າທີ່ "ອອກ" ໄປຈາກສາງຕົ້ນທາງ).
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
        // M1/M3 — ສືບທອດໜ່ວຍພື້ນຖານ + ອັດຕາແປງ ແລະ ໝວດທີ່ໃຊ້ຮ່ວມ ຈາກສິນຄ້າຕົ້ນທາງ (ຈຳນວນໂອນເປັນໜ່ວຍພື້ນຖານດຽວກັນ).
        const src = await tx.product.findUnique({
          where: { id: it.productId },
          select: {
            baseUomId: true,
            categoryId: true,
            category: { select: { branchId: true } },
            uomConversions: { select: { uomId: true, factorToBase: true, isPurchaseDefault: true, isConsumeDefault: true } },
          },
        });
        dest = await tx.product.create({
          data: {
            branchId: existing.toBranchId,
            name: it.productName,
            sku: it.sku,
            unit: it.unit,
            baseUomId: src?.baseUomId ?? (await uomIdForUnitText(tx, it.unit)),
            categoryId: src?.category && !src.category.branchId ? src.categoryId : null,
            costPrice: costDec(costNum(it.unitCost)),
            stockQty: qdec(0),
            minStockQty: qdec(5),
            trackLot: !!it.lotNumber,
            ...(src?.uomConversions.length ? { uomConversions: { create: src.uomConversions } } : {}),
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
export const MOVEMENT_SIGN: Record<string, 1 | -1> = {
  PURCHASE_IN: 1,
  ADJUSTMENT_ADD: 1,
  TRANSFER_IN: 1,
  SERVICE_CONSUMED: -1,
  ADJUSTMENT_DEDUCT: -1,
  RETURN_TO_SUPPLIER: -1,
  TRANSFER_OUT: -1,
  // M13 — ຂາຍໜ້າຮ້ານ / ລູກຄ້າຄືນສິນຄ້າ.
  SOLD: -1,
  SALE_RETURN: 1,
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
