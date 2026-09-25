import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';
import { lotDateSchema } from './inventory.schema.js';
import { RefundMethod, type RefundStatus } from './refund.schema.js';

/**
 * M13 (inventory 9D) — ຂາຍສິນຄ້າໜ້າຮ້ານ (retail / OTC).
 *
 * RetailSale ຈ່າຍຜ່ານ Payment ປົກກະຕິ (1:1, ຄືກັບບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ) → tender / INV / VAT / refund / CN ຊຸດດຽວກັນ.
 * ສະຕັອກຕັດ (SOLD, refId `sale:<id>`) ເມື່ອ Payment FULLY_PAID; ຄືນສິນຄ້າ = Refund + ແຖວຄືນ → SALE_RETURN
 * (refId `saleret:<refundId>`) ຕອນ Refund PAID.
 */

export const retailSaleStatusSchema = z.enum(['PENDING_PAYMENT', 'PAID', 'VOIDED']);
export type RetailSaleStatusValue = z.infer<typeof retailSaleStatusSchema>;

export const retailSaleLineInputSchema = z.object({
  productId: z.string().uuid(),
  /** ຈຳນວນເປັນໜ່ວຍ `uomId` (null = ໜ່ວຍພື້ນຖານ). */
  qty: z.coerce.number().positive().max(1_000_000),
  uomId: z.string().uuid().nullable().optional(),
  /** ລາຄາຕໍ່ໜ່ວຍ `uomId`. ບໍ່ໃສ່ = retailPrice × factor. */
  unitPrice: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  /** ສ່ວນຫຼຸດຂອງແຖວ (LAK). */
  discount: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
});
export type RetailSaleLineInput = z.infer<typeof retailSaleLineInputSchema>;

export const retailSaleCreateSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
  lines: z.array(retailSaleLineInputSchema).min(1).max(100),
});
export type RetailSaleCreateInput = z.infer<typeof retailSaleCreateSchema>;

export const retailSaleListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  status: retailSaleStatusSchema.optional(),
  /** ເລກບິນ RS / INV ຫຼື ຊື່ລູກຄ້າ. */
  q: z.string().trim().min(1).max(120).optional(),
  from: lotDateSchema.optional(),
  to: lotDateSchema.optional(),
});
export type RetailSaleListQuery = z.infer<typeof retailSaleListQuerySchema>;

export const retailSaleVoidSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type RetailSaleVoidInput = z.infer<typeof retailSaleVoidSchema>;

/** POST /retail-sales/:id/returns — ຍອດຄືນ = Σ qty × ລາຄາສຸດທິ/ໜ່ວຍຂອງແຖວ (ຄິດຝັ່ງ server). */
export const retailSaleReturnSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  method: RefundMethod.default('ORIGINAL_TENDER'),
  lines: z
    .array(
      z.object({
        saleLineId: z.string().uuid(),
        /** ໜ່ວຍພື້ນຖານ. */
        qty: z.coerce.number().positive(),
        /** false = ຄືນເງິນແຕ່ບໍ່ເອົາເຂົ້າສະຕັອກ (ເສຍຫາຍ/ເປີດໃຊ້ແລ້ວ). */
        restock: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(100),
});
export type RetailSaleReturnInput = z.infer<typeof retailSaleReturnSchema>;

export type RetailSaleReturnLineView = {
  id: string;
  refundId: string;
  refundStatus: RefundStatus | null;
  creditNoteNo: string | null;
  qty: number;
  amount: number;
  restock: boolean;
  postedAt: string | null;
  createdAt: string;
};

export type RetailSaleLineView = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  /** ໜ່ວຍພື້ນຖານ. */
  qty: number;
  uomId: string | null;
  uomCode: string | null;
  factorToBase: number;
  uomQty: number;
  /** ຕໍ່ໜ່ວຍ uom. */
  unitPrice: number;
  discount: number;
  lineTotal: number;
  /** Σ −valueChange ຂອງ SOLD (null = ຍັງບໍ່ຕັດສະຕັອກ). */
  cogs: number | null;
  /** SALE_RETURN ທີ່ post ແລ້ວ (ໜ່ວຍພື້ນຖານ). */
  qtyReturned: number;
  /** ຄືນໄດ້ອີກ (ລົບຄຳຮ້ອງທີ່ຍັງເປີດ). */
  qtyReturnable: number;
  returns: RetailSaleReturnLineView[];
};

export type RetailSaleView = {
  id: string;
  saleNumber: string;
  branchId: string;
  branchName: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentId: string;
  invoiceNo: string | null;
  paymentStatus: string;
  status: RetailSaleStatusValue;
  subtotal: number;
  discountTotal: number;
  /** ສຸດທິກ່ອນ VAT EXCLUSIVE. */
  total: number;
  /** ຍອດບິນ (Payment.totalAmount, ລວມ VAT EXCLUSIVE ຖ້າມີ). */
  billTotal: number;
  paidAmount: number;
  balanceAmount: number;
  refundedAmount: number;
  taxAmount: number | null;
  vatRate: number | null;
  notes: string | null;
  createdByUserName: string | null;
  paidAt: string | null;
  stockPostedAt: string | null;
  stockError: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  itemCount: number;
  createdAt: string;
  lines?: RetailSaleLineView[];
};

// ---- ລາຍງານ: ກຳໄລຂັ້ນຕົ້ນຕໍ່ສິນຄ້າ (retail) ----------------------------

export const retailMarginQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  from: lotDateSchema.optional(),
  to: lotDateSchema.optional(),
});
export type RetailMarginQuery = z.infer<typeof retailMarginQuerySchema>;

export type RetailMarginRow = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qtySold: number;
  qtyReturned: number;
  netQty: number;
  /** ລາຍຮັບສຸດທິ ບໍ່ລວມ VAT (ລົບສ່ວນທີ່ຄືນ). */
  revenue: number;
  /** SOLD − SALE_RETURN (ມູນຄ່າ ledger). */
  cogs: number;
  grossMargin: number;
  marginPct: number;
};

export type RetailMarginView = {
  from: string;
  to: string;
  branchId: string | null;
  rows: RetailMarginRow[];
  totals: { saleCount: number; qtySold: number; qtyReturned: number; revenue: number; cogs: number; grossMargin: number; marginPct: number };
};
