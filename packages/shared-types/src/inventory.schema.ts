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

export const productCreateSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(24),
  costPrice: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative().default(0),
  minStockQty: z.coerce.number().nonnegative().default(5),
  isActive: z.boolean().default(true),
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

/** delta ບວກ = ເພີ່ມສະຕັອກ, ລົບ = ຫຼຸດ. 0 ບໍ່ໄດ້. */
export const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  delta: z.coerce.number().refine((n) => n !== 0, 'delta ຕ້ອງບໍ່ເປັນ 0'),
  notes: z.string().trim().max(400).optional(),
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
};

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
