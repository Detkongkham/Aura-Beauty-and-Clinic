import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

/** ໂມດູນ 14 (BOM Ledger) + 32 (B2B Supplier & PO) — ໜ້າ Inventory ຂອງ Web Admin. */

// ---- Suppliers ------------------------------------------------------

export const supplierListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  /** 'purchaseOrders' ranks suppliers by PO count desc — powers the Top Suppliers leaderboard. */
  sort: z.enum(['name', 'purchaseOrders']).default('name'),
});
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;

export const supplierWriteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(160).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
});
export type SupplierWriteInput = z.infer<typeof supplierWriteSchema>;

export type SupplierView = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  purchaseOrderCount: number;
  createdAt: string;
  updatedAt: string;
};

// ---- Products -----------------------------------------------------

export const productListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/** C5 — ວັນທີ YYYY-MM-DD (ວັນປະຕິທິນລ້ວນໆ, ບໍ່ມີເວລາ) ສຳລັບວັນໝົດອາຍຸ/ວັນຜະລິດ. */
export const lotDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຮູບແບບວັນທີຕ້ອງເປັນ YYYY-MM-DD');

/** C5 — ຂໍ້ມູນ lot ທີ່ລະບຸຕອນຮັບເຄື່ອງ/ຍອດເປີດ/ປັບເພີ່ມ. */
export const lotInfoSchema = z
  .object({
    lotNumber: z.string().trim().min(1).max(60),
    expiryDate: lotDateSchema.nullable().optional(),
    mfgDate: lotDateSchema.nullable().optional(),
  })
  .refine((v) => !v.expiryDate || !v.mfgDate || v.mfgDate <= v.expiryDate, {
    message: 'ວັນຜະລິດຕ້ອງບໍ່ຫຼັງວັນໝົດອາຍຸ',
    path: ['mfgDate'],
  });
export type LotInfoInput = z.infer<typeof lotInfoSchema>;

export const productCreateSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(24),
  costPrice: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative().default(0),
  minStockQty: z.coerce.number().nonnegative().default(5),
  isActive: z.boolean().default(true),
  /** C5 — ຕິດຕາມ lot/ວັນໝົດອາຍຸ. ຖ້າ true ແລະ openingStock > 0 ຕ້ອງລະບຸ `openingLot`. */
  trackLot: z.boolean().default(false),
  openingLot: lotInfoSchema.optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** stockQty ບໍ່ຢູ່ໃນນີ້ — ການປັບສະຕັອກໃຫ້ຜ່ານ POST /stock-movements/adjust ເທົ່ານັ້ນ. */
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  costPrice: z.coerce.number().nonnegative().optional(),
  minStockQty: z.coerce.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  /** C5 — ປິດບໍ່ໄດ້ ຖ້າຍັງມີ lot ທີ່ມີສະຕັອກຄົງເຫຼືອ. */
  trackLot: z.boolean().optional(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export type ProductView = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  sku: string;
  unit: string;
  costPrice: number;
  stockQty: number;
  minStockQty: number;
  stockValue: number;
  /** stockQty <= 0 */
  outOfStock: boolean;
  /** 0 < stockQty <= minStockQty */
  lowStock: boolean;
  /** C5 — ຕິດຕາມ lot/ວັນໝົດອາຍຸ */
  trackLot: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryStatsView = {
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockValue: number;
  openPurchaseOrders: number;
};

// ---- Stock movements (ledger) -----------------------------------

export const stockMovementTypeSchema = z.enum([
  'PURCHASE_IN',
  'SERVICE_CONSUMED',
  'ADJUSTMENT_ADD',
  'ADJUSTMENT_DEDUCT',
  'RETURN_TO_SUPPLIER',
  'TRANSFER_OUT',
  'TRANSFER_IN',
]);
export type StockMovementTypeValue = z.infer<typeof stockMovementTypeSchema>;

export const stockMovementListQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  type: stockMovementTypeSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;

export const stockMovementStatsQuerySchema = stockMovementListQuerySchema.pick({
  productId: true,
  branchId: true,
  from: true,
  to: true,
});
export type StockMovementStatsQuery = z.infer<typeof stockMovementStatsQuerySchema>;

/** ຈຳນວນລາຍການເໜັງຕີງແຍກຕາມປະເພດ — ໃຫ້ໜ້າ Ledger ສະແດງເປັນ stat cards ທີ່ກົດເພື່ອກັ່ນຕອງໄດ້. */
export type StockMovementStatsView = {
  total: number;
  byType: Record<StockMovementTypeValue, number>;
};

// ---- C4 costing — COGS summary -----------------------------------

/** ຊ່ວງເວລາ/ສາຂາ ດຽວກັນກັບ stats — ໃຊ້ sum(valueChange) ຂອງ SERVICE_CONSUMED. */
export const cogsSummaryQuerySchema = stockMovementListQuerySchema.pick({
  branchId: true,
  from: true,
  to: true,
});
export type CogsSummaryQuery = z.infer<typeof cogsSummaryQuerySchema>;

/** totalCogs ເປັນຄ່າບວກສະເໝີ (ຕົ້ນທຶນສິນຄ້າທີ່ຖືກໃຊ້ໄປ — ledger ເກັບເປັນ valueChange ລົບ). */
export type CogsSummaryView = {
  totalCogs: number;
};

/** delta ບວກ = ເພີ່ມສະຕັອກ, ລົບ = ຫຼຸດ. 0 ບໍ່ໄດ້. */
export const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  delta: z.coerce.number().refine((n) => n !== 0, 'delta ຕ້ອງບໍ່ເປັນ 0'),
  notes: z.string().trim().max(400).optional(),
  /** C5 — ບັງຄັບເມື່ອ delta > 0 ໃນສິນຄ້າ trackLot (ເພີ່ມເຂົ້າ lot ໃດ). delta < 0 ໃຊ້ FEFO ອັດຕະໂນມັດ. */
  lot: lotInfoSchema.optional(),
});
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export type StockMovementView = {
  id: string;
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  type: StockMovementTypeValue;
  qty: number;
  balanceAfter: number;
  /** C4 — WAC ຢູ່ ณ ເວລານັ້ນ. null = ແຖວເກົ່າກ່ອນ migration ນີ້ (ບໍ່ backfill). */
  unitCost: number | null;
  /** C4 — ມູນຄ່າ LAK ຂອງລາຍການນີ້ (signed). null = ແຖວເກົ່າກ່ອນ migration ນີ້. */
  valueChange: number | null;
  /** C5 — lot ທີ່ເກີດການເໜັງຕີງ (null = ບໍ່ trackLot ຫຼື ສະຕັອກເກົ່າທີ່ບໍ່ມີ lot). */
  lotId: string | null;
  lotNumber: string | null;
  refId: string | null;
  notes: string | null;
  /** ຜູ້ເຮັດລາຍການ — null = ລະບົບອັດຕະໂນມັດ (ເຊັ່ນ BOM ຕັດຕອນນັດໝາຍ COMPLETED). */
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: string;
};

// ---- Purchase orders --------------------------------------------

export const poStatusSchema = z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED']);
export type PoStatusValue = z.infer<typeof poStatusSchema>;

export const purchaseOrderListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: poStatusSchema.optional(),
  /** Matches PO # (exact prefix/substring, case-insensitive). */
  q: z.string().trim().min(1).optional(),
});
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export const purchaseOrderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  /** C5 — ບໍ່ບັງຄັບຕອນສ້າງ PO (ເລກ lot ມັກຮູ້ຕອນເຄື່ອງມາຮອດ) — ສົ່ງທັບໄດ້ຕອນ receive. */
  lotNumber: z.string().trim().min(1).max(60).nullable().optional(),
  expiryDate: lotDateSchema.nullable().optional(),
  mfgDate: lotDateSchema.nullable().optional(),
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;

export const purchaseOrderCreateSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  items: z.array(purchaseOrderItemInputSchema).min(1).max(100),
  status: z.enum(['DRAFT', 'ORDERED']).default('DRAFT'),
});
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

/** ແກ້ໄດ້ສະເພາະ PO ທີ່ຍັງ DRAFT. status ປ່ຽນໄດ້ DRAFT→ORDERED / *→CANCELLED. */
export const purchaseOrderUpdateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  items: z.array(purchaseOrderItemInputSchema).min(1).max(100).optional(),
  status: z.enum(['DRAFT', 'ORDERED', 'CANCELLED']).optional(),
});
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

export type PurchaseOrderItemView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  /** C5 — ສິນຄ້ານີ້ຕ້ອງລະບຸ lot ຕອນຮັບເຄື່ອງ */
  trackLot: boolean;
  lotNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
};

/** C5 — body ຂອງ POST /purchase-orders/:id/receive (ທັງໝົດ optional — PO ທີ່ບໍ່ມີສິນຄ້າ trackLot ສົ່ງ {} ໄດ້). */
export const purchaseOrderReceiveSchema = z
  .object({
    lots: z
      .array(
        z.object({
          productId: z.string().uuid(),
          lotNumber: z.string().trim().min(1).max(60),
          expiryDate: lotDateSchema.nullable().optional(),
          mfgDate: lotDateSchema.nullable().optional(),
        }),
      )
      .max(100)
      .optional(),
  })
  .default({});
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveSchema>;

export type PurchaseOrderView = {
  id: string;
  poNumber: string;
  branchId: string;
  branchName: string;
  supplierId: string;
  supplierName: string;
  status: PoStatusValue;
  totalAmount: number;
  itemCount: number;
  orderDate: string;
  receivedDate: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItemView[];
};

// ---- Stock transfers (cross-branch) ------------------------------

/**
 * DRAFT (ຮ່າງ) → IN_TRANSIT (ສົ່ງແລ້ວ, ຕັດສະຕັອກຕົ້ນທາງແລ້ວ) → COMPLETED (ປາຍທາງຮັບແລ້ວ,
 * ບວກສະຕັອກປາຍທາງແລ້ວ). CANCELLED ອະນຸຍາດສະເພາະຈາກ DRAFT.
 */
export const stockTransferStatusSchema = z.enum(['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']);
export type StockTransferStatusValue = z.infer<typeof stockTransferStatusSchema>;

export const stockTransferListQuerySchema = paginationQuerySchema.extend({
  /** ສາຂາໃດກໍ່ໄດ້ ບໍ່ວ່າຈະເປັນຕົ້ນທາງ ຫຼື ປາຍທາງ. */
  branchId: z.string().uuid().optional(),
  fromBranchId: z.string().uuid().optional(),
  toBranchId: z.string().uuid().optional(),
  status: stockTransferStatusSchema.optional(),
});
export type StockTransferListQuery = z.infer<typeof stockTransferListQuerySchema>;

export const stockTransferItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  /** C5 — ບັງຄັບສຳລັບສິນຄ້າ trackLot: lot ຕົ້ນທາງທີ່ຈະຕັດ (ຕ້ອງມີສະຕັອກພຽງພໍໃນ lot ດຽວ). */
  lotId: z.string().uuid().optional(),
});
export type StockTransferItemInput = z.infer<typeof stockTransferItemInputSchema>;

export const stockTransferCreateSchema = z
  .object({
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    items: z.array(stockTransferItemInputSchema).min(1).max(100),
    notes: z.string().trim().max(400).optional(),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, {
    message: 'ສາຂາຕົ້ນທາງ ແລະ ປາຍທາງຕ້ອງບໍ່ຊ້ຳກັນ',
    path: ['toBranchId'],
  });
export type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;

export type StockTransferItemView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineValue: number;
  receivedProductId: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
};

export type StockTransferView = {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  status: StockTransferStatusValue;
  notes: string | null;
  itemCount: number;
  totalValue: number;
  sentAt: string | null;
  receivedAt: string | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
  items?: StockTransferItemView[];
};

// ---- C5 lots (batch / expiry / recall traceability) ---------------

export const stockLotListQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  /** ສະເພາະ lot ທີ່ມີວັນໝົດອາຍຸ ≤ ວັນນີ້ + N ວັນ (ລວມ lot ທີ່ໝົດອາຍຸແລ້ວ). */
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  /** default false — ສະແດງສະເພາະ lot ທີ່ຍັງມີສະຕັອກ (qtyOnHand > 0). */
  includeEmpty: z.enum(['true', 'false']).optional(),
});
export type StockLotListQuery = z.infer<typeof stockLotListQuerySchema>;

export type StockLotStatusValue = 'EXPIRED' | 'EXPIRING' | 'OK' | 'NO_EXPIRY';

export type StockLotView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchId: string;
  branchName: string;
  lotNumber: string;
  /** YYYY-MM-DD */
  expiryDate: string | null;
  mfgDate: string | null;
  qtyOnHand: number;
  unitCost: number;
  receivedAt: string;
  /** ຈຳນວນວັນເຫຼືອ (ຕາມວັນວຽງຈັນ) — ລົບ = ໝົດອາຍຸແລ້ວ, null = ບໍ່ມີວັນໝົດອາຍຸ. */
  daysLeft: number | null;
  /** EXPIRING = ≤ 60 ວັນ */
  status: StockLotStatusValue;
};

export type LotUsageAppointmentView = {
  appointmentId: string;
  startAt: string;
  status: string;
  serviceName: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  qty: number;
  consumedAt: string;
};

export type LotUsageTransferView = {
  transferId: string;
  transferNumber: string;
  toBranchId: string;
  toBranchName: string;
  qty: number;
  sentAt: string;
};

/** ລາຍງານ recall — lot ນີ້ຖືກໃຊ້ກັບລູກຄ້າຄົນໃດ ແລະ ຖືກໂອນໄປສາຂາໃດແດ່. */
export type LotUsageView = {
  lot: StockLotView;
  appointments: LotUsageAppointmentView[];
  /** ຈຳນວນລູກຄ້າທີ່ບໍ່ຊ້ຳກັນ */
  customerCount: number;
  totalConsumedQty: number;
  transfersOut: LotUsageTransferView[];
};
