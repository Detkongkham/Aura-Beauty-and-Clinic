import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';
import {
  barcodeSchema,
  gtinSchema,
  inventoryReportGroupBySchema,
  productUomConversionsSchema,
  type AbcClass,
  type ProductUomConversionView,
} from './inventory-master.schema.js';

/** ໂມດູນ 14 (BOM Ledger) + 32 (B2B Supplier & PO) — ໜ້າ Inventory ຂອງ Web Admin. */

// ---- Suppliers ------------------------------------------------------

export const supplierListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  /** 'purchaseOrders' ranks suppliers by PO count desc — powers the Top Suppliers leaderboard. */
  sort: z.enum(['name', 'purchaseOrders']).default('name'),
  /** M20 — 'true' = ສະເພາະ isActive (dropdown ສ້າງ PO). ຜູ້ສະໜອງທີ່ຖືກລຶບ (soft) ບໍ່ສະແດງສະເໝີ. */
  activeOnly: z.enum(['true', 'false']).optional(),
  /** M9 — ກັ່ນຕາມສາຂາ: ຜູ້ສະໜອງຂອງສາຂານີ້ + ທີ່ໃຊ້ຮ່ວມ (branchId null). BRANCH_ADMIN ຖືກບັງຄັບເປັນສາຂາຕົນ. */
  branchId: z.string().uuid().optional(),
});
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;

/** M8/M10 — ສະກຸນເງິນທີ່ຮອງຮັບໃນການຈັດຊື້ (ອັດຕາ → LAK ຈາກ ExchangeRate ຂອງໂມດູນລາຍຈ່າຍ ຫຼື ໃສ່ເອງ). */
export const PURCHASE_CURRENCIES = ['LAK', 'THB', 'USD'] as const;
export const purchaseCurrencySchema = z.enum(PURCHASE_CURRENCIES);
export type PurchaseCurrency = z.infer<typeof purchaseCurrencySchema>;

export const supplierWriteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(160).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  /** M8 — ເລກປະຈຳຕົວຜູ້ເສຍພາສີ / VAT */
  taxId: z.string().trim().max(60).nullable().optional(),
  /** M8 — ເງື່ອນໄຂຊຳລະ (ວັນ, NET30 = 30) */
  paymentTermsDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  /** M8/M11 — lead time ມາດຕະຖານ (ວັນ) */
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  currency: purchaseCurrencySchema.optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  bankAccountName: z.string().trim().max(160).nullable().optional(),
  bankAccountNo: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
  /** M9 — null = ໃຊ້ຮ່ວມທຸກສາຂາ (SUPER_ADMIN ເທົ່ານັ້ນ). BRANCH_ADMIN: ບໍ່ໃສ່ = ສາຂາຕົນ. */
  branchId: z.string().uuid().nullable().optional(),
});
export type SupplierWriteInput = z.infer<typeof supplierWriteSchema>;

export type SupplierView = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number | null;
  leadTimeDays: number | null;
  currency: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  isActive: boolean;
  /** M20 — soft-deleted (ຍັງເຫັນໃນ PO ເກົ່າ). */
  deletedAt: string | null;
  /** M9 — null = ໃຊ້ຮ່ວມທຸກສາຂາ. */
  branchId: string | null;
  branchName: string | null;
  purchaseOrderCount: number;
  /** ຈຳນວນສິນຄ້າໃນລາຍການລາຄາ. */
  priceListCount: number;
  createdAt: string;
  updatedAt: string;
};

/** M8 — ລາຍການລາຄາຂອງຜູ້ສະໜອງ (PUT /suppliers/:id/products = upsert ຕາມ productId). */
export const supplierProductWriteSchema = z.object({
  productId: z.string().uuid(),
  supplierSku: z.string().trim().max(60).nullable().optional(),
  unitCost: z.coerce.number().nonnegative(),
  /** ບໍ່ໃສ່ = ສະກຸນຂອງຜູ້ສະໜອງ. */
  currency: purchaseCurrencySchema.optional(),
  moq: z.coerce.number().positive().nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  /** true = ຜູ້ສະໜອງຫຼັກຂອງສິນຄ້ານີ້ (ລ້າງ isPreferred ຂອງຜູ້ສະໜອງອື່ນຂອງສິນຄ້ານັ້ນອັດຕະໂນມັດ). */
  isPreferred: z.boolean().optional(),
  /** M1 — ໜ່ວຍຊື້ (unitCost + moq ເປັນຕໍ່ໜ່ວຍນີ້). null/ບໍ່ໃສ່ = ໜ່ວຍພື້ນຖານ. ຕ້ອງມີອັດຕາແປງຂອງສິນຄ້າ. */
  uomId: z.string().uuid().nullable().optional(),
});
export type SupplierProductWriteInput = z.infer<typeof supplierProductWriteSchema>;

export type SupplierProductView = {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchId: string;
  branchName: string;
  supplierSku: string | null;
  unitCost: number;
  currency: string;
  moq: number | null;
  /** lead time ຂອງແຖວນີ້ (null = ໃຊ້ຂອງຜູ້ສະໜອງ). */
  leadTimeDays: number | null;
  isPreferred: boolean;
  /** M1 — ໜ່ວຍຊື້ຂອງລາຍການລາຄາ (null = ໜ່ວຍພື້ນຖານ); unitCost/moq ເປັນຕໍ່ໜ່ວຍນີ້. */
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  updatedAt: string;
};

// ---- Products -----------------------------------------------------

export const productListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  /** M3 — ໝວດ (ໝວດຫຼັກ = ລວມໝວດຍ່ອຍ). */
  categoryId: z.string().uuid().optional(),
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
  /** ຂໍ້ຄວາມໜ່ວຍ (ສະແດງຜົນ). M1 — ບໍ່ໃສ່ໄດ້ຖ້າມີ baseUomId (= ຊື່ໜ່ວຍ); ມີແຕ່ unit → ຫາ/ສ້າງ Uom ຈາກຂໍ້ຄວາມ. */
  unit: z.string().trim().min(1).max(24).optional(),
  /** M1 — ໜ່ວຍພື້ນຖານ (ໜ່ວຍເກັບສະຕັອກ). */
  baseUomId: z.string().uuid().nullable().optional(),
  /** M1 — ໜ່ວຍອື່ນ (ກ່ອງ, ml …) → ໜ່ວຍພື້ນຖານ. */
  conversions: productUomConversionsSchema.optional(),
  /** M2 — GS1 GTIN (ກວດ check digit) + ລະຫັດພາຍໃນ; unique ຕໍ່ສາຂາ. */
  gtin: gtinSchema.nullable().optional(),
  barcode: barcodeSchema.nullable().optional(),
  /** M3 */
  categoryId: z.string().uuid().nullable().optional(),
  costPrice: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative().default(0),
  minStockQty: z.coerce.number().nonnegative().default(5),
  isActive: z.boolean().default(true),
  /** C5 — ຕິດຕາມ lot/ວັນໝົດອາຍຸ. ຖ້າ true ແລະ openingStock > 0 ຕ້ອງລະບຸ `openingLot`. */
  trackLot: z.boolean().default(false),
  openingLot: lotInfoSchema.optional(),
  /** M13 — ຂາຍໜ້າຮ້ານໄດ້ + ລາຄາຂາຍຕໍ່ໜ່ວຍພື້ນຖານ (LAK). */
  isSellable: z.boolean().default(false),
  retailPrice: z.coerce.number().nonnegative().max(1_000_000_000).nullable().optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** stockQty ບໍ່ຢູ່ໃນນີ້ — ການປັບສະຕັອກໃຫ້ຜ່ານ POST /stock-movements/adjust ເທົ່ານັ້ນ. */
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  /** M1 — ປ່ຽນໄດ້ສະເພາະສິນຄ້າທີ່ຍັງບໍ່ມີການເຄື່ອນໄຫວສະຕັອກ (ຈຳນວນທັງໝົດເປັນໜ່ວຍນີ້). */
  baseUomId: z.string().uuid().optional(),
  /** M1 — ແທນທີ່ທັງຊຸດ (upsert ຕາມ uomId; ໜ່ວຍທີ່ຍັງຖືກໃຊ້ໃນ BOM/ລາຍການລາຄາ/PO ທີ່ເປີດ ລຶບບໍ່ໄດ້). */
  conversions: productUomConversionsSchema.optional(),
  gtin: gtinSchema.nullable().optional(),
  barcode: barcodeSchema.nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  costPrice: z.coerce.number().nonnegative().optional(),
  minStockQty: z.coerce.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  /** C5 — ປິດບໍ່ໄດ້ ຖ້າຍັງມີ lot ທີ່ມີສະຕັອກຄົງເຫຼືອ. */
  trackLot: z.boolean().optional(),
  /** M13 */
  isSellable: z.boolean().optional(),
  retailPrice: z.coerce.number().nonnegative().max(1_000_000_000).nullable().optional(),
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
  /** 0 < stockQty <= reorderThreshold (M11 — ເກນ = max(minStockQty, reorderPoint)) */
  lowStock: boolean;
  /** H7 — Σ ການຈອງ ACTIVE ຈາກນັດໝາຍທີ່ຢືນຢັນແລ້ວ. */
  reservedQty: number;
  /** H7 — stockQty − reservedQty (ຕິດລົບໄດ້ = ບໍ່ພໍສຳລັບນັດທີ່ຈະມາ). */
  availableQty: number;
  /** H7 — Σ ຈຳນວນຄ້າງຮັບຂອງ PO ທີ່ PENDING_APPROVAL/ORDERED/PARTIALLY_RECEIVED. */
  onOrderQty: number;
  /** H7 — availableQty < 0. */
  shortForUpcoming: boolean;
  /** M11 — ຄິດທຸກຄືນ (null = ຍັງບໍ່ເຄີຍຄິດ). */
  reorderPoint: number | null;
  avgDailyUsage: number | null;
  reorderComputedAt: string | null;
  /** M11 — max(minStockQty, reorderPoint ?? 0). */
  reorderThreshold: number;
  /** C5 — ຕິດຕາມ lot/ວັນໝົດອາຍຸ */
  trackLot: boolean;
  /** ສະຕັອກທີ່ຍັງບໍ່ມີ lot (stockQty − Σ lot qtyOnHand) — 0 ເມື່ອບໍ່ trackLot. ມອບເຂົ້າ lot ໄດ້ຜ່ານ assign-unlotted. */
  unlottedQty: number;
  /** M1 — ໜ່ວຍພື້ນຖານ (ທຸກຈຳນວນຂອງສິນຄ້ານີ້ເປັນໜ່ວຍນີ້) + ອັດຕາແປງ. */
  baseUomId: string | null;
  baseUomCode: string | null;
  conversions: ProductUomConversionView[];
  /** M2 */
  gtin: string | null;
  barcode: string | null;
  /** M3 */
  categoryId: string | null;
  categoryName: string | null;
  /** M3 — ABC ຈາກ job ກາງຄືນ (null = ຍັງບໍ່ຄິດ). */
  abcClass: AbcClass | null;
  /** M13 — ຂາຍໜ້າຮ້ານໄດ້ + ລາຄາຂາຍຕໍ່ໜ່ວຍພື້ນຖານ. */
  isSellable: boolean;
  retailPrice: number | null;
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
  /** H7 — ສິນຄ້າທີ່ available < 0 (ບໍ່ພໍສຳລັບນັດທີ່ຢືນຢັນແລ້ວ). */
  shortForUpcomingCount: number;
  /** H7 — ສິນຄ້າທີ່ມີການຈອງ ACTIVE. */
  reservedProductCount: number;
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
  /** M13 — ຂາຍໜ້າຮ້ານ (refId `sale:<retailSaleId>`). */
  'SOLD',
  /** M13 — ລູກຄ້າຄືນສິນຄ້າ (refId `saleret:<refundId>`). */
  'SALE_RETURN',
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

// ---- H2 — adjustment reason codes + maker-checker ------------------

export const STOCK_ADJUST_REASONS = [
  'DAMAGED',
  'EXPIRED',
  'LOST_OR_THEFT',
  'COUNT_VARIANCE',
  'SAMPLE_OR_TESTER',
  'INTERNAL_USE',
  'CUSTOMER_COMPENSATION',
  'SUPPLIER_RETURN',
  'OPENING_BALANCE',
  'OTHER',
] as const;
export const stockAdjustReasonSchema = z.enum(STOCK_ADJUST_REASONS);
export type StockAdjustReasonValue = z.infer<typeof stockAdjustReasonSchema>;

/** ເຫດຜົນທີ່ຕ້ອງອະທິບາຍເພີ່ມ (notes ບັງຄັບ) — ຈຸດສ່ຽງທຸດຈະລິດສູງສຸດ. */
export const STOCK_ADJUST_REASONS_REQUIRING_NOTES: readonly StockAdjustReasonValue[] = [
  'LOST_OR_THEFT',
  'COUNT_VARIANCE',
  'OTHER',
];

/** ເຫດຜົນທີ່ນັບເປັນ "ການສູນເສຍສະຕັອກ" (shrinkage) ໃນ P&L — ບໍ່ລວມ SUPPLIER_RETURN/OPENING_BALANCE. */
export const STOCK_SHRINKAGE_REASONS: readonly StockAdjustReasonValue[] = [
  'DAMAGED',
  'EXPIRED',
  'LOST_OR_THEFT',
  'COUNT_VARIANCE',
  'SAMPLE_OR_TESTER',
  'INTERNAL_USE',
  'CUSTOMER_COMPENSATION',
  'OTHER',
];

export const STOCK_ADJUST_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** delta ບວກ = ເພີ່ມສະຕັອກ, ລົບ = ຫຼຸດ. 0 ບໍ່ໄດ້. reason ບັງຄັບ (H2). */
export const stockAdjustSchema = z
  .object({
    productId: z.string().uuid(),
    delta: z.coerce.number().refine((n) => n !== 0, 'delta ຕ້ອງບໍ່ເປັນ 0'),
    reason: stockAdjustReasonSchema,
    notes: z.string().trim().max(400).optional(),
    /** C5 — ບັງຄັບເມື່ອ delta > 0 ໃນສິນຄ້າ trackLot (ເພີ່ມເຂົ້າ lot ໃດ). delta < 0 ໃຊ້ FEFO ອັດຕະໂນມັດ. */
    lot: lotInfoSchema.optional(),
    /** H2 — ຮູບຫຼັກຖານ (optional). base64 ບໍ່ມີ data: prefix, ≤ 5MB ຫຼັງ decode. */
    photo: z
      .object({
        contentType: z.enum(STOCK_ADJUST_PHOTO_CONTENT_TYPES),
        dataBase64: z.string().min(1),
      })
      .optional(),
  })
  .refine((v) => !STOCK_ADJUST_REASONS_REQUIRING_NOTES.includes(v.reason) || !!v.notes?.trim(), {
    message: 'ເຫດຜົນນີ້ຕ້ອງໃສ່ໝາຍເຫດອະທິບາຍ',
    path: ['notes'],
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
  /** C4 — WAC ຢູ່ àºàº²àº¡ ເວລານັ້ນ. null = ແຖວເກົ່າກ່ອນ migration ນີ້ (ບໍ່ backfill). */
  unitCost: number | null;
  /** C4 — ມູນຄ່າ LAK ຂອງລາຍການນີ້ (signed). null = ແຖວເກົ່າກ່ອນ migration ນີ້. */
  valueChange: number | null;
  /** C5 — lot ທີ່ເກີດການເໜັງຕີງ (null = ບໍ່ trackLot ຫຼື ສະຕັອກເກົ່າທີ່ບໍ່ມີ lot). */
  lotId: string | null;
  lotNumber: string | null;
  /** H2 — ເຫດຜົນການປັບ (ADJUSTMENT_* ເທົ່ານັ້ນ; null = ແຖວເກົ່າ/ປະເພດອື່ນ). */
  reasonCode: StockAdjustReasonValue | null;
  attachmentUrl: string | null;
  refId: string | null;
  notes: string | null;
  /** ຜູ້ເຮັດລາຍການ — null = ລະບົບອັດຕະໂນມັດ (ເຊັ່ນ BOM ຕັດຕອນນັດໝາຍ COMPLETED). */
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: string;
};

// ---- Purchase orders --------------------------------------------

/**
 * 9D — DRAFT → [PENDING_APPROVAL →] ORDERED → PARTIALLY_RECEIVED → RECEIVED. CANCELLED ກ່ອນມີການຮັບ.
 * "ປິດຮັບບໍ່ຄົບ" (close short) = RECEIVED + `closedShortAt` (ບໍ່ແມ່ນ status ແຍກ).
 */
export const poStatusSchema = z.enum(['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']);
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
  /**
   * ສະກຸນຂອງ PO. M8 — ບໍ່ໃສ່ = ລາຄາຈາກລາຍການລາຄາຂອງຜູ້ສະໜອງ (ສະກຸນກົງກັນ) → ບໍ່ດັ່ງນັ້ນ WAC ÷ fxRate.
   */
  unitCost: z.coerce.number().nonnegative().optional(),
  /**
   * M1 — ໜ່ວຍທີ່ສັ່ງ (quantity + unitCost ເປັນຕໍ່ໜ່ວຍນີ້ → ເກັບເປັນໜ່ວຍພື້ນຖານ: quantity × factor, unitCost ÷ factor).
   * null/ບໍ່ໃສ່ = ໜ່ວຍພື້ນຖານ.
   */
  uomId: z.string().uuid().nullable().optional(),
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
  /** ORDERED ອາດກາຍເປັນ PENDING_APPROVAL (M6) ຖ້າຍອດເກີນເກນ ແລະ ຜູ້ສ້າງບໍ່ແມ່ນ SUPER_ADMIN. */
  status: z.enum(['DRAFT', 'ORDERED']).default('DRAFT'),
  /** M10 — ບໍ່ໃສ່ = ສະກຸນຂອງຜູ້ສະໜອງ. */
  currency: purchaseCurrencySchema.optional(),
  /** M10 — 1 ໜ່ວຍ currency = ? LAK. ບໍ່ໃສ່ = ອັດຕາບັນທຶກບັນຊີ (ExchangeRate); LAK = 1. */
  fxRate: z.coerce.number().positive().max(1_000_000).optional(),
});
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

/**
 * M7 — items upsert ຕາມ productId (ບໍ່ລຶບ-ສ້າງໃໝ່): ແກ້ໄດ້ໃນ DRAFT/ORDERED/PARTIALLY_RECEIVED; ແຖວທີ່ຮັບແລ້ວລຶບບໍ່ໄດ້
 * ແລະ ຫຼຸດຕ່ຳກວ່າ qtyReceived ບໍ່ໄດ້. status: DRAFT→ORDERED (ອາດເປັນ PENDING_APPROVAL, M6) / →CANCELLED (ກ່ອນມີການຮັບ).
 */
export const purchaseOrderUpdateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  items: z.array(purchaseOrderItemInputSchema).min(1).max(100).optional(),
  status: z.enum(['DRAFT', 'ORDERED', 'CANCELLED']).optional(),
  /** M10 — ແກ້ບໍ່ໄດ້ເມື່ອມີການຮັບເຄື່ອງແລ້ວ (ອັດຕາຖືກລັອກໃນ GRN). */
  currency: purchaseCurrencySchema.optional(),
  fxRate: z.coerce.number().positive().max(1_000_000).optional(),
});
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

export type PurchaseOrderItemView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  /** ໜ່ວຍພື້ນຖານ. */
  quantity: number;
  /** ຕໍ່ໜ່ວຍພື້ນຖານ (ສະກຸນ PO). */
  unitCost: number;
  lineTotal: number;
  /** M1 — ໜ່ວຍທີ່ສັ່ງ (null = ໜ່ວຍພື້ນຖານ) + ອັດຕາ snapshot; uomQty = quantity ÷ factor, uomUnitCost = unitCost × factor. */
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  uomQty: number;
  uomUnitCost: number;
  /** C5 — ສິນຄ້ານີ້ຕ້ອງລະບຸ lot ຕອນຮັບເຄື່ອງ */
  trackLot: boolean;
  lotNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  /** H4 — Σ ຮັບເຂົ້າສະຕັອກແລ້ວ / ປະຕິເສດ ຈາກທຸກ GRN; outstanding = max(0, quantity − qtyReceived) (0 ເມື່ອ PO ປິດ). */
  qtyReceived: number;
  qtyRejected: number;
  qtyOutstanding: number;
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
  /** M20 — ຜູ້ສະໜອງຖືກປິດ/ລຶບແລ້ວ (PO ເກົ່າຍັງສະແດງ). */
  supplierInactive: boolean;
  status: PoStatusValue;
  /** ສະກຸນຂອງ PO (M10). */
  totalAmount: number;
  currency: string;
  fxRate: number;
  /** M10 — totalAmount × fxRate. */
  totalAmountLak: number;
  itemCount: number;
  orderDate: string;
  receivedDate: string | null;
  /** M6 */
  orderedByUserName: string | null;
  approvedByUserName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  /** H4 — ປິດຮັບບໍ່ຄົບ (status = RECEIVED). */
  closedShortAt: string | null;
  closedShortReason: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItemView[];
  /** H4 — ສະເພາະ detail. */
  receipts?: GoodsReceiptView[];
  /** M7 — ປະຫວັດການແກ້/ປ່ຽນສະຖານະ (ສະເພາະ detail, ໃໝ່ສຸດກ່ອນ). */
  revisions?: PurchaseOrderRevisionView[];
};

/** M7 — ການປ່ຽນແປງໜຶ່ງລາຍການໃນ revision (field ຂອງ header ຫຼື ແຖວສິນຄ້າ). */
export type PurchaseOrderRevisionChange = {
  /** 'status' | 'supplier' | 'currency' | 'fxRate' | 'total' | 'item.added' | 'item.removed' | 'item.quantity' | 'item.unitCost' | 'item.uom' */
  field: string;
  productName?: string | null;
  from: string | number | null;
  to: string | number | null;
};

export type PurchaseOrderRevisionView = {
  id: string;
  revisionNo: number;
  action: string;
  fromStatus: PoStatusValue | null;
  toStatus: PoStatusValue | null;
  changedByUserId: string | null;
  changedByUserName: string | null;
  changedAt: string;
  summary: string;
  note: string | null;
  changes: PurchaseOrderRevisionChange[];
};

// ---- H4 — Goods receipts (GRN) --------------------------------------

export const goodsReceiptLineInputSchema = z
  .object({
    poItemId: z.string().uuid(),
    /** ຈຳນວນທີ່ຮັບເຂົ້າສະຕັອກ (accepted). */
    qtyReceived: z.coerce.number().nonnegative(),
    /** ຈຳນວນທີ່ປະຕິເສດ (ເສຍຫາຍ/ຜິດ) — ບໍ່ເຂົ້າສະຕັອກ, ບໍ່ນັບເປັນການຮັບ. */
    qtyRejected: z.coerce.number().nonnegative().default(0),
    rejectReason: z.string().trim().max(400).nullable().optional(),
    /** ສະກຸນຂອງ PO (M10 — ແປງເປັນ LAK ດ້ວຍ fxRate ຂອງ PO). ບໍ່ໃສ່ = ຕົ້ນທຶນໃນ PO. */
    unitCost: z.coerce.number().nonnegative().optional(),
    /**
     * M1 — ໜ່ວຍຂອງ qtyReceived/qtyRejected/unitCost ໃນແຖວນີ້. ບໍ່ໃສ່ = ໜ່ວຍທີ່ສັ່ງໃນ PO; null = ໜ່ວຍພື້ນຖານ.
     * ເກັບເປັນໜ່ວຍພື້ນຖານສະເໝີ (× factor).
     */
    uomId: z.string().uuid().nullable().optional(),
    /** C5 — ບັງຄັບສຳລັບສິນຄ້າ trackLot ເມື່ອ qtyReceived > 0 (ບໍ່ໃສ່ = ໃຊ້ lot ໃນ PO item ຖ້າມີ). */
    lotNumber: z.string().trim().min(1).max(60).nullable().optional(),
    expiryDate: lotDateSchema.nullable().optional(),
    mfgDate: lotDateSchema.nullable().optional(),
  })
  .refine((v) => v.qtyReceived > 0 || v.qtyRejected > 0, { message: 'ຕ້ອງມີຈຳນວນຮັບ ຫຼື ປະຕິເສດ', path: ['qtyReceived'] })
  .refine((v) => v.qtyRejected <= 0 || !!v.rejectReason?.trim(), { message: 'ຕ້ອງລະບຸເຫດຜົນທີ່ປະຕິເສດ', path: ['rejectReason'] })
  .refine((v) => !v.expiryDate || !v.mfgDate || v.mfgDate <= v.expiryDate, {
    message: 'ວັນຜະລິດຕ້ອງບໍ່ຫຼັງວັນໝົດອາຍຸ',
    path: ['mfgDate'],
  });
export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineInputSchema>;

export const goodsReceiptCreateSchema = z.object({
  supplierDeliveryNote: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
  lines: z.array(goodsReceiptLineInputSchema).min(1).max(100),
});
export type GoodsReceiptCreateInput = z.infer<typeof goodsReceiptCreateSchema>;

export type GoodsReceiptLineView = {
  id: string;
  poItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  /** ໜ່ວຍພື້ນຖານ. */
  qtyReceived: number;
  qtyRejected: number;
  rejectReason: string | null;
  /** M1 — ໜ່ວຍທີ່ປ້ອນຕອນຮັບ (null = ໜ່ວຍພື້ນຖານ). */
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  /** LAK ຕໍ່ໜ່ວຍພື້ນຖານ (M10 — = unitCostForeign × fxRate). */
  unitCost: number;
  /** ສະກຸນຂອງ PO (null = PO ເປັນ LAK). */
  unitCostForeign: number | null;
  lineValue: number;
  lotId: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
};

export type GoodsReceiptView = {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  branchId: string;
  /** M10 — ສະກຸນ/ອັດຕາທີ່ລັອກຕອນຮັບ. */
  currency: string;
  fxRate: number;
  receivedAt: string;
  receivedByUserName: string | null;
  supplierDeliveryNote: string | null;
  notes: string | null;
  /** Σ qtyReceived × unitCost (accepted ເທົ່ານັ້ນ). */
  totalValue: number;
  lines: GoodsReceiptLineView[];
};

export const purchaseOrderCloseShortSchema = z.object({ reason: z.string().trim().min(1).max(400) });
export type PurchaseOrderCloseShortInput = z.infer<typeof purchaseOrderCloseShortSchema>;

export const purchaseOrderRejectSchema = z.object({ reason: z.string().trim().min(1).max(400) });
export type PurchaseOrderRejectInput = z.infer<typeof purchaseOrderRejectSchema>;

// ---- H4 — 3-way match (PO ↔ GRN ↔ supplier invoice = Expense ທີ່ຜູກ PO) ------------

/**
 * MATCHED = ໃບເກັບເງິນ ≤ ມູນຄ່າທີ່ຮັບຈິງ (+ພາສີ) × (1 + tolerance).
 * UNDER_RECEIVED = ໃບເກັບເງິນເກີນມູນຄ່າທີ່ຮັບ ແຕ່ບໍ່ເກີນມູນຄ່າສັ່ງ ແລະ PO ຍັງຮັບບໍ່ຄົບ (ລໍເຄື່ອງ).
 * OVER_INVOICED = ໃບເກັບເງິນເກີນມູນຄ່າທີ່ຮັບ (PO ປິດແລ້ວ ຫຼື ເກີນມູນຄ່າສັ່ງ). NO_INVOICE = ຍັງບໍ່ມີໃບເກັບເງິນ.
 */
export const poMatchStatusSchema = z.enum(['MATCHED', 'UNDER_RECEIVED', 'OVER_INVOICED', 'NO_INVOICE']);
export type PoMatchStatusValue = z.infer<typeof poMatchStatusSchema>;

export type PurchaseOrderMatchLineView = {
  poItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  rejectedQty: number;
  returnedQty: number;
  poUnitCost: number;
  orderedValue: number;
  /** Σ accepted GRN qty × GRN unitCost */
  receivedValue: number;
  returnedValue: number;
};

export type PurchaseOrderMatchView = {
  purchaseOrderId: string;
  poNumber: string;
  poStatus: PoStatusValue;
  status: PoMatchStatusValue;
  tolerancePct: number;
  /** ມູນຄ່າ LAK ທັງໝົດ. */
  ordered: number;
  received: number;
  /** debit notes (ໃບຄືນສິນຄ້າ POSTED ທີ່ຜູກ PO ນີ້). */
  returned: number;
  /** received − returned */
  netReceived: number;
  /** Σ amountBase ຂອງ Expense ທີ່ຜູກ PO (SUBMITTED/APPROVED/PAID) — ລວມພາສີ. */
  invoiced: number;
  invoicedTax: number;
  /** invoiced − returned (ຫັກ debit note). */
  netInvoiced: number;
  /** netReceived + invoicedTax — ຍອດທີ່ຄວນຖືກເກັບ. */
  expected: number;
  /** netInvoiced − expected (ບວກ = ເກັບເກີນ). */
  variance: number;
  invoices: {
    expenseId: string;
    title: string;
    invoiceNumber: string | null;
    status: string;
    amountBase: number;
    taxBase: number;
  }[];
  debitNotes: { supplierReturnId: string; returnNumber: string; postedAt: string | null; value: number }[];
  lines: PurchaseOrderMatchLineView[];
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

// ---- H2 — adjustment approval requests ----------------------------

export const stockAdjustRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type StockAdjustRequestStatusValue = z.infer<typeof stockAdjustRequestStatusSchema>;

export const stockAdjustRequestListQuerySchema = paginationQuerySchema.extend({
  status: stockAdjustRequestStatusSchema.optional(),
  branchId: z.string().uuid().optional(),
});
export type StockAdjustRequestListQuery = z.infer<typeof stockAdjustRequestListQuerySchema>;

export const stockAdjustRejectSchema = z.object({
  reason: z.string().trim().min(1).max(400),
});
export type StockAdjustRejectInput = z.infer<typeof stockAdjustRejectSchema>;

export type StockAdjustRequestView = {
  id: string;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  delta: number;
  reason: StockAdjustReasonValue;
  notes: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  unitCost: number;
  /** |delta| × WAC ຕອນຍື່ນ (LAK) */
  estimatedValue: number;
  status: StockAdjustRequestStatusValue;
  attachmentUrl: string | null;
  requestedByUserId: string;
  requestedByUserName: string;
  reviewedByUserId: string | null;
  reviewedByUserName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  movementId: string | null;
  createdAt: string;
};

/**
 * POST /stock-movements/adjust — 201 `POSTED` (ບັນທຶກເລີຍ) ຫຼື 202 `PENDING_APPROVAL`
 * (ມູນຄ່າເກີນເກນ ແລະ ຜູ້ເຮັດບໍ່ແມ່ນ SUPER_ADMIN → ລໍອະນຸມັດ).
 */
export type StockAdjustResult =
  | { outcome: 'POSTED'; movement: StockMovementView }
  | { outcome: 'PENDING_APPROVAL'; request: StockAdjustRequestView };

/**
 * ການຕັ້ງຄ່າ inventory (GET/PUT /stock-adjustments/settings) — ສົ່ງສະເພາະຄ່າທີ່ຈະປ່ຽນ.
 */
export const stockAdjustSettingsSchema = z
  .object({
    /** ເກນມູນຄ່າ (LAK) — ການປັບທີ່ |delta| × WAC ເກີນນີ້ ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ. */
    approvalThresholdLak: z.coerce.number().nonnegative().max(1e12).optional(),
    /** M6 — PO ທີ່ຍອດເກີນນີ້ (LAK) ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ ກ່ອນເປັນ ORDERED. */
    poApprovalThresholdLak: z.coerce.number().nonnegative().max(1e13).optional(),
    /** H4 — ຮັບເກີນຈຳນວນສັ່ງໄດ້ສູງສຸດ % (0 = ບໍ່ໃຫ້ເກີນ). */
    overReceiptTolerancePct: z.coerce.number().min(0).max(100).optional(),
    /** H4 — ຄວາມຕ່າງທີ່ຍອມຮັບໄດ້ຂອງ 3-way match (%). */
    invoiceMatchTolerancePct: z.coerce.number().min(0).max(100).optional(),
    /** M11 — safety stock = ການໃຊ້ສະເລ່ຍ/ວັນ × ຈຳນວນວັນນີ້. */
    safetyStockDays: z.coerce.number().min(0).max(365).optional(),
    /** M11 — ຄຳແນະນຳ PO ສັ່ງພໍໃຊ້ຮອດຮອບທົບທວນຖັດໄປ (reorderPoint + ສະເລ່ຍ/ວັນ × ວັນນີ້). */
    reorderReviewDays: z.coerce.number().min(0).max(365).optional(),
    /** M11 — lead time ເມື່ອຜູ້ສະໜອງ/ລາຍການລາຄາບໍ່ໄດ້ລະບຸ. */
    defaultLeadTimeDays: z.coerce.number().min(0).max(365).optional(),
    /** M3 — ABC: ສິນຄ້າທີ່ມູນຄ່າສະສົມ ≤ abcA% = A, ≤ abcB% = B, ທີ່ເຫຼືອ = C. */
    abcA: z.coerce.number().min(1).max(100).optional(),
    abcB: z.coerce.number().min(1).max(100).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'ບໍ່ມີຄ່າໃຫ້ບັນທຶກ' })
  .refine((v) => v.abcA === undefined || v.abcB === undefined || v.abcA <= v.abcB, {
    message: 'ເກນ A ຕ້ອງບໍ່ເກີນເກນ B',
    path: ['abcA'],
  });
export type StockAdjustSettingsInput = z.infer<typeof stockAdjustSettingsSchema>;
export type StockAdjustSettingsView = {
  approvalThresholdLak: number;
  poApprovalThresholdLak: number;
  overReceiptTolerancePct: number;
  invoiceMatchTolerancePct: number;
  safetyStockDays: number;
  reorderReviewDays: number;
  defaultLeadTimeDays: number;
  abcA: number;
  abcB: number;
};
export type InventorySettingsView = StockAdjustSettingsView;

// ---- Lot backfill — ມອບສະຕັອກທີ່ບໍ່ມີ lot ເຂົ້າ lot -----------------

export const assignUnlottedSchema = z
  .object({
    productId: z.string().uuid(),
    lotNumber: z.string().trim().min(1).max(60),
    expiryDate: lotDateSchema.nullable().optional(),
    mfgDate: lotDateSchema.nullable().optional(),
    qty: z.coerce.number().positive(),
  })
  .refine((v) => !v.expiryDate || !v.mfgDate || v.mfgDate <= v.expiryDate, {
    message: 'ວັນຜະລິດຕ້ອງບໍ່ຫຼັງວັນໝົດອາຍຸ',
    path: ['mfgDate'],
  });
export type AssignUnlottedInput = z.infer<typeof assignUnlottedSchema>;

// ---- M12-lite — per-service gross margin ---------------------------

export const serviceMarginQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  /** YYYY-MM-DD ຕາມວັນວຽງຈັນ (ລວມທັງສອງ). ບໍ່ໃສ່ = 30 ວັນຫຼ້າສຸດ. */
  from: lotDateSchema.optional(),
  to: lotDateSchema.optional(),
});
export type ServiceMarginQuery = z.infer<typeof serviceMarginQuerySchema>;

export type ServiceMarginRow = {
  serviceId: string;
  serviceName: string;
  completed: number;
  revenue: number;
  /** Σ −valueChange ຂອງ SERVICE_CONSUMED (refId = appt:<id>) ຂອງນັດໝາຍເຫຼົ່ານີ້. */
  cogs: number;
  grossMargin: number;
  /** grossMargin ÷ revenue (0 ຖ້າບໍ່ມີລາຍຮັບ). */
  marginPct: number;
};

export type ServiceMarginView = {
  from: string;
  to: string;
  branchId: string | null;
  rows: ServiceMarginRow[];
  totals: { completed: number; revenue: number; cogs: number; grossMargin: number; marginPct: number };
};

// ---- M15 — CSV export ----------------------------------------------

/** ເພດານແຖວຂອງ endpoint `/export` ທຸກໜ້າ inventory (ກັນ response ໃຫຍ່ເກີນ). */
export const INVENTORY_EXPORT_MAX_ROWS = 10_000;

/** ຜົນຂອງ `GET …/export` — ທຸກແຖວທີ່ຜ່ານຕົວກັ່ນຕອງ (ສູງສຸດ INVENTORY_EXPORT_MAX_ROWS). */
export type InventoryExportView<T> = {
  items: T[];
  /** ຈຳນວນແຖວທັງໝົດທີ່ຜ່ານຕົວກັ່ນຕອງ (ອາດ > items.length ເມື່ອ truncated). */
  total: number;
  truncated: boolean;
  maxRows: number;
};

// ---- H3 — stock-take / cycle count ----------------------------------

export const stockCountStatusSchema = z.enum(['DRAFT', 'COUNTING', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED']);
export type StockCountStatusValue = z.infer<typeof stockCountStatusSchema>;
export const stockCountTypeSchema = z.enum(['FULL', 'CYCLE', 'SPOT']);
export type StockCountTypeValue = z.infer<typeof stockCountTypeSchema>;

export const stockCountListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  status: stockCountStatusSchema.optional(),
  type: stockCountTypeSchema.optional(),
});
export type StockCountListQuery = z.infer<typeof stockCountListQuerySchema>;

/** FULL = ທຸກສິນຄ້າ active ຂອງສາຂາ (productIds ບໍ່ໃຊ້); CYCLE/SPOT ຕ້ອງເລືອກ productIds. */
export const stockCountCreateSchema = z
  .object({
    branchId: z.string().uuid(),
    type: stockCountTypeSchema,
    productIds: z.array(z.string().uuid()).max(2000).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(400).optional(),
  })
  .refine((v) => v.type === 'FULL' || (v.productIds?.length ?? 0) > 0, {
    message: 'ນັບແບບ CYCLE/SPOT ຕ້ອງເລືອກສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ',
    path: ['productIds'],
  });
export type StockCountCreateInput = z.infer<typeof stockCountCreateSchema>;

/** ບັນທຶກຜົນນັບ (ບາງແຖວກໍໄດ້). countedQty = null → ລ້າງຄ່າ (ຍັງບໍ່ນັບ). */
export const stockCountLinesUpdateSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        countedQty: z.coerce.number().nonnegative().nullable(),
        notes: z.string().trim().max(400).nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});
export type StockCountLinesUpdateInput = z.infer<typeof stockCountLinesUpdateSchema>;

export const stockCountRejectSchema = z.object({ reason: z.string().trim().min(1).max(400) });
export type StockCountRejectInput = z.infer<typeof stockCountRejectSchema>;
export const stockCountCancelSchema = z.object({ reason: z.string().trim().max(400).optional() }).default({});
export type StockCountCancelInput = z.infer<typeof stockCountCancelSchema>;

export type StockCountLineView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  lotId: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  /** snapshot ຕອນເລີ່ມນັບ (null ໃນ DRAFT). */
  systemQty: number | null;
  /** ການເໜັງຕີງສຸດທິ (signed) ຂອງສິນຄ້າ/lot ນີ້ນັບແຕ່ startedAt — ຈາກ ledger. */
  movedSinceStart: number;
  /** systemQty + movedSinceStart — ຍອດທີ່ຄວນນັບໄດ້ຕອນນີ້. */
  expectedQty: number | null;
  countedQty: number | null;
  /** countedQty − expectedQty (null ຖ້າຍັງບໍ່ນັບ). ຫຼັງ POSTED = ຄ່າທີ່ post ຈິງ. */
  variance: number | null;
  unitCost: number;
  varianceValue: number | null;
  reasonCode: StockAdjustReasonValue | null;
  notes: string | null;
  countedAt: string | null;
};

export type StockCountView = {
  id: string;
  countNumber: string;
  branchId: string;
  branchName: string;
  status: StockCountStatusValue;
  type: StockCountTypeValue;
  scheduledAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  createdByUserName: string | null;
  countedByUserName: string | null;
  approvedByUserName: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  notes: string | null;
  lineCount: number;
  countedLineCount: number;
  /** Σ varianceValue (signed) / Σ |varianceValue| ຂອງແຖວທີ່ນັບແລ້ວ. */
  netVarianceValue: number;
  absVarianceValue: number;
  /** ຈຳນວນແຖວ ledger ຂອງສິນຄ້າໃນໃບນີ້ທີ່ເກີດລະຫວ່າງນັບ (ສະເພາະ detail; 0 ໃນ list). */
  movementsDuringCount: number;
  createdAt: string;
  updatedAt: string;
  lines?: StockCountLineView[];
};

// ---- Reports — valuation as of a date + shrinkage ------------------

export const stockValuationQuerySchema = z.object({
  /** ທ້າຍວັນນີ້ຕາມເວລາວຽງຈັນ. ບໍ່ໃສ່ = ມື້ນີ້. */
  asOf: lotDateSchema.optional(),
  branchId: z.string().uuid().optional(),
  /** M3 — category = ເພີ່ມ `groups` ຕາມໝວດ. */
  groupBy: inventoryReportGroupBySchema.optional(),
});
export type StockValuationQuery = z.infer<typeof stockValuationQuerySchema>;

export type StockValuationRow = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchId: string;
  branchName: string;
  /** M3 */
  categoryId: string | null;
  categoryName: string | null;
  qty: number;
  value: number;
  /** value ÷ qty (0 ຖ້າ qty = 0). */
  avgCost: number;
  /** true = ມີແຖວ ledger ເກົ່າ (ກ່ອນ C4) ທີ່ບໍ່ມີ valueChange → ຕີມູນຄ່າດ້ວຍ fallbackCost. */
  fallbackUsed: boolean;
  fallbackRows: number;
  /** ຕົ້ນທຶນທີ່ໃຊ້ແທນ: unitCost ທຳອິດທີ່ຮູ້ໃນ ledger, ຖ້າບໍ່ມີ = WAC ປັດຈຸບັນ. */
  fallbackCost: number | null;
};

/** M3 — ແຖວລວມຕາມໝວດ (categoryId null = ບໍ່ມີໝວດ). ຄ່າທີ່ບໍ່ກ່ຽວກັບລາຍງານນັ້ນເປັນ 0/undefined. */
export type InventoryCategoryGroup = {
  categoryId: string | null;
  categoryName: string | null;
  products: number;
  qty: number;
  value: number;
};

export type StockValuationView = {
  asOf: string;
  branchId: string | null;
  rows: StockValuationRow[];
  /** M3 — ມີເມື່ອ groupBy=category. */
  groups?: InventoryCategoryGroup[];
  totals: { products: number; value: number; fallbackProducts: number };
};

export const stockShrinkageQuerySchema = serviceMarginQuerySchema;
export type StockShrinkageQuery = z.infer<typeof stockShrinkageQuerySchema>;

export type StockShrinkageView = {
  from: string;
  to: string;
  branchId: string | null;
  byReason: { reason: StockAdjustReasonValue; count: number; qty: number; value: number }[];
  byProduct: {
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    branchName: string;
    count: number;
    qty: number;
    value: number;
  }[];
  totals: { count: number; value: number };
};

// ---- H5 — Return to supplier + debit note --------------------------

export const supplierReturnStatusSchema = z.enum(['DRAFT', 'POSTED', 'CANCELLED']);
export type SupplierReturnStatusValue = z.infer<typeof supplierReturnStatusSchema>;

export const supplierReturnListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  status: supplierReturnStatusSchema.optional(),
});
export type SupplierReturnListQuery = z.infer<typeof supplierReturnListQuerySchema>;

export const supplierReturnCreateSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  goodsReceiptId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(1).max(400),
  notes: z.string().trim().max(400).nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        /** ບໍ່ໃສ່ = FEFO (ສິນຄ້າ trackLot) */
        lotId: z.string().uuid().nullable().optional(),
        qty: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(100),
});
export type SupplierReturnCreateInput = z.infer<typeof supplierReturnCreateSchema>;

export const supplierReturnCancelSchema = z.object({ reason: z.string().trim().max(400).optional() }).default({});
export type SupplierReturnCancelInput = z.infer<typeof supplierReturnCancelSchema>;

export type SupplierReturnLineView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  lotId: string | null;
  lotNumber: string | null;
  qty: number;
  /** ຕັ້ງຕອນ post (null ໃນ DRAFT/CANCELLED). */
  unitCost: number | null;
  value: number | null;
};

export type SupplierReturnView = {
  id: string;
  returnNumber: string;
  branchId: string;
  branchName: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  goodsReceiptId: string | null;
  grnNumber: string | null;
  status: SupplierReturnStatusValue;
  reason: string;
  notes: string | null;
  /** ມູນຄ່າ debit note (POSTED) ຫຼື 0. */
  totalValue: number;
  lineCount: number;
  createdByUserName: string | null;
  postedByUserName: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  lines?: SupplierReturnLineView[];
};

/** ຍອດຄົງຄ້າງຂອງຜູ້ສະໜອງ: ໃບເກັບເງິນ (Expense SUBMITTED/APPROVED/PAID) − ຈ່າຍແລ້ວ − debit notes. */
export type SupplierBalanceView = {
  supplierId: string;
  supplierName: string;
  invoiced: number;
  paid: number;
  debitNotes: number;
  outstanding: number;
};

// ---- M11 — reorder point + suggested PO ------------------------------

export const reorderSuggestionQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});
export type ReorderSuggestionQuery = z.infer<typeof reorderSuggestionQuerySchema>;

export type ReorderSuggestionItem = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchId: string;
  onHand: number;
  reserved: number;
  available: number;
  onOrder: number;
  minStockQty: number;
  reorderPoint: number | null;
  /** max(minStockQty, reorderPoint) — ແນະນຳເມື່ອ available + onOrder ≤ ນີ້. */
  threshold: number;
  avgDailyUsage: number;
  leadTimeDays: number;
  /** ຕໍ່ໜ່ວຍຊື້ (uomId). */
  moq: number | null;
  /** ໜ່ວຍພື້ນຖານ (= suggestedUomQty × factorToBase). */
  suggestedQty: number;
  /** M1 — ໜ່ວຍຊື້ຂອງລາຍການລາຄາ (null = ໜ່ວຍພື້ນຖານ); ປັດຂຶ້ນເປັນຈຳນວນເຕັມ ແລະ ຜົນຄູນ MOQ ໃນໜ່ວຍນີ້. */
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  suggestedUomQty: number;
  /** ສະກຸນຂອງກຸ່ມ ຕໍ່ໜ່ວຍພື້ນຖານ (ລາຄາຈາກລາຍການລາຄາ; ບໍ່ມີ = WAC ເປັນ LAK). */
  unitCost: number;
  /** ຕໍ່ໜ່ວຍຊື້ (= unitCost × factorToBase). */
  uomUnitCost: number;
  lineTotal: number;
};

export type ReorderSuggestionGroup = {
  /** null = ຍັງບໍ່ມີຜູ້ສະໜອງໃນລາຍການລາຄາ/PO ເກົ່າ. */
  supplierId: string | null;
  supplierName: string | null;
  branchId: string;
  branchName: string;
  currency: string;
  items: ReorderSuggestionItem[];
  total: number;
};

export type ReorderSuggestionView = {
  branchId: string | null;
  generatedAt: string;
  groups: ReorderSuggestionGroup[];
  totals: { products: number; groups: number };
};

// ---- Reports — turnover / days on hand, aging, usage per service -----

export const inventoryTurnoverQuerySchema = serviceMarginQuerySchema.extend({
  groupBy: inventoryReportGroupBySchema.optional(),
});
export type InventoryTurnoverQuery = z.infer<typeof inventoryTurnoverQuerySchema>;

export type InventoryTurnoverRow = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchName: string;
  categoryId: string | null;
  categoryName: string | null;
  cogs: number;
  openingValue: number;
  closingValue: number;
  /** (opening + closing) ÷ 2 */
  avgValue: number;
  /** cogs ÷ avgValue (0 ເມື່ອ avgValue = 0). */
  turnover: number;
  /** avgValue ÷ (cogs ÷ days) — null ເມື່ອບໍ່ມີ COGS ໃນຊ່ວງ. */
  daysOnHand: number | null;
};

export type InventoryTurnoverView = {
  from: string;
  to: string;
  branchId: string | null;
  days: number;
  rows: InventoryTurnoverRow[];
  /** M3 — ມີເມື່ອ groupBy=category (turnover/DIO ຄິດຄືນຈາກຍອດລວມຂອງໝວດ). */
  groups?: {
    categoryId: string | null;
    categoryName: string | null;
    products: number;
    cogs: number;
    openingValue: number;
    closingValue: number;
    avgValue: number;
    turnover: number;
    daysOnHand: number | null;
  }[];
  totals: {
    cogs: number;
    openingValue: number;
    closingValue: number;
    avgValue: number;
    turnover: number;
    daysOnHand: number | null;
  };
};

export const stockAgingQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  groupBy: inventoryReportGroupBySchema.optional(),
});
export type StockAgingQuery = z.infer<typeof stockAgingQuerySchema>;

export const STOCK_AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type StockAgingBucket = (typeof STOCK_AGING_BUCKETS)[number];

export type StockAgingRow = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchName: string;
  categoryId: string | null;
  categoryName: string | null;
  /** null = ສ່ວນທີ່ບໍ່ມີ lot. */
  lotNumber: string | null;
  /** LOT = lot.receivedAt; LAST_RECEIPT = PURCHASE_IN ຫຼ້າສຸດ; CREATED = ບໍ່ເຄີຍຮັບ → ວັນສ້າງສິນຄ້າ. */
  ageSource: 'LOT' | 'LAST_RECEIPT' | 'CREATED';
  receivedAt: string;
  ageDays: number;
  bucket: StockAgingBucket;
  qty: number;
  value: number;
};

export type StockAgingView = {
  asOf: string;
  branchId: string | null;
  rows: StockAgingRow[];
  buckets: { bucket: StockAgingBucket; qty: number; value: number; lines: number }[];
  /** M3 — ມີເມື່ອ groupBy=category: ມູນຄ່າຕໍ່ຊ່ວງອາຍຸ ຂອງແຕ່ລະໝວດ. */
  groups?: {
    categoryId: string | null;
    categoryName: string | null;
    qty: number;
    value: number;
    byBucket: Record<StockAgingBucket, number>;
  }[];
  totals: { qty: number; value: number; lines: number };
};

export const serviceUsageQuerySchema = serviceMarginQuerySchema;
export type ServiceUsageQuery = z.infer<typeof serviceUsageQuerySchema>;

export type ServiceUsageRow = {
  serviceId: string;
  serviceName: string;
  productId: string;
  productName: string;
  unit: string;
  /** ຈຳນວນນັດທີ່ຕັດສິນຄ້ານີ້. */
  appointments: number;
  qty: number;
  value: number;
  /** qty ÷ appointments */
  qtyPerAppointment: number;
};

export type ServiceUsageView = {
  from: string;
  to: string;
  branchId: string | null;
  rows: ServiceUsageRow[];
  byService: { serviceId: string; serviceName: string; appointments: number; value: number; valuePerAppointment: number }[];
  totals: { appointments: number; value: number };
};
