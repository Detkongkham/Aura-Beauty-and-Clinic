import { z } from 'zod';
import type { PaymentMethod, PaymentStatus } from './enums.js';

/**
 * Wave 10B — Refund engine, void, VAT, ໃບຮັບເງິນ.
 *
 * Refund.amount = ເງິນທີ່ຈ່າຍອອກຈິງ (ເງິນສົດ/ໂອນ); storeCreditAmount = ສ່ວນທີ່ຄືນເຂົ້າບັດຂອງຂວັນ/ຄະແນນ.
 * ຍອດຄືນລວມ = amount + storeCreditAmount.
 */

export const RefundStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID']);
export type RefundStatus = z.infer<typeof RefundStatus>;

export const RefundMethod = z.enum(['CASH', 'BANK_TRANSFER', 'ORIGINAL_TENDER']);
export type RefundMethod = z.infer<typeof RefundMethod>;

/**
 * POST /payments/:id/refunds — `amount` = ຍອດຄືນລວມ (ລະບົບແຈກຍອດຄືນໄປຕາມ tender ເດີມເອງ).
 * `returnPackageUnit` = ຄືນສິດແພັກເກັດ 1 ຄັ້ງ ສຳລັບນັດທີ່ຈ່າຍດ້ວຍຄອສ (PACKAGE_CREDIT / ນັດທີ່ໃຊ້ສິດແພັກເກັດ) —
 * ບໍ່ແມ່ນເງິນ; ໃຊ້ຮ່ວມກັບ amount ໄດ້ ຫຼື amount = 0 ຖ້າຄືນແຕ່ສິດ.
 * ບິນຊື້ບັດຂອງຂວັນ: ຄືນໄດ້ບໍ່ເກີນຍອດຄົງເຫຼືອໃນບັດ (ຫັກອອກຈາກບັດຕອນຈ່າຍ). ບິນຊື້ແພັກເກັດ: ຄືນໄດ້ບໍ່ເກີນມູນຄ່າ
 * ສ່ວນທີ່ຍັງບໍ່ໄດ້ໃຊ້ (ຕາມສັດສ່ວນຄັ້ງທີ່ເຫຼືອ) ແລະ ແພັກເກັດຖືກຍົກເລີກຕອນຈ່າຍ.
 */
export const createRefundSchema = z
  .object({
    amount: z.number().min(0).max(1_000_000_000),
    reason: z.string().trim().min(3).max(300),
    method: RefundMethod.default('ORIGINAL_TENDER'),
    returnPackageUnit: z.boolean().default(false),
  })
  .refine((v) => v.amount > 0 || v.returnPackageUnit, { message: 'ຕ້ອງມີຍອດຄືນ ຫຼື ຄືນສິດແພັກເກັດ', path: ['amount'] });
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const rejectRefundSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

/** POST /refunds/:id/pay — ບັນທຶກວ່າຈ່າຍອອກແລ້ວ. ໂອນທະນາຄານ → ຕ້ອງລະບຸບັນຊີທີ່ໂອນອອກ. */
export const payRefundSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  providerRef: z.string().trim().max(120).optional(),
});
export type PayRefundInput = z.infer<typeof payRefundSchema>;

export const voidPaymentSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const refundListQuerySchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  status: RefundStatus.optional(),
  paymentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RefundListQuery = z.infer<typeof refundListQuerySchema>;

export type RefundAllocation = {
  tenderId: string;
  method: z.infer<typeof PaymentMethod>;
  amount: number;
  /**
   * ຄືນເຂົ້າ 'STORE' (ບັດຂອງຂວັນ/ຄະແນນ), ຈ່າຍອອກເປັນ 'PAYOUT' (ເງິນສົດ/ໂອນ) ຫຼື 'PACKAGE' = ຄືນສິດແພັກເກັດ 1 ຄັ້ງ
   * (amount = ມູນຄ່າ tender PACKAGE_CREDIT ເພື່ອອ້າງອີງ, ບໍ່ນັບເປັນເງິນ).
   */
  kind: 'STORE' | 'PAYOUT' | 'PACKAGE';
};

/** ປະເພດບິນທີ່ຖືກຄືນເງິນ — ກຳນົດກົດການຄືນ. */
export type RefundBillKind = 'SERVICE' | 'GIFT_CARD_SALE' | 'PACKAGE_SALE';

export type RefundView = {
  id: string;
  paymentId: string;
  invoiceNo: string | null;
  branchId: string;
  branchName: string;
  customerName: string | null;
  currency: string;
  /** ເງິນຈ່າຍອອກຈິງ */
  amount: number;
  storeCreditAmount: number;
  /** amount + storeCreditAmount */
  totalAmount: number;
  taxAmount: number;
  reason: string;
  method: RefundMethod;
  status: RefundStatus;
  requestedById: string;
  requestedByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  rejectedReason: string | null;
  creditNoteNo: string | null;
  providerRef: string | null;
  bankAccountId: string | null;
  allocations: RefundAllocation[];
  billKind: RefundBillKind;
  /** ຄືນສິດແພັກເກັດ 1 ຄັ້ງ (allocation kind PACKAGE) */
  packageUnitReturned: boolean;
  paidAt: string | null;
  createdAt: string;
};

// ---- VAT ----------------------------------------------------------

export const VatMode = z.enum(['INCLUSIVE', 'EXCLUSIVE']);
export type VatMode = z.infer<typeof VatMode>;

/**
 * ຕັ້ງຄ່າ VAT (AppSetting 'finance-vat').
 *  - INCLUSIVE: ລາຄາບໍລິການລວມພາສີແລ້ວ — ພາສີ = total × r/(1+r), ຢຸດໄວ້ຕອນອອກເລກ INV.
 *  - EXCLUSIVE: ລາຄາບໍລິການບໍ່ລວມພາສີ — ບວກພາສີເທິງລາຄາຕອນສ້າງບິນ (totalAmount = net + tax), ຢຸດໄວ້ໃນບິນທັນທີ.
 * ບິນຊື້ບັດຂອງຂວັນບໍ່ຄິດ VAT (ເປັນ voucher — ພາສີຄິດຕອນນຳບັດໄປຈ່າຍຄ່າບໍລິການ).
 */
export const vatSettingsSchema = z.object({
  enabled: z.boolean(),
  /** ອັດຕາ ເປັນເສດສ່ວນ: 0.10 = 10% (ສປປ ລາວ) */
  rate: z.number().min(0).max(0.5),
  mode: VatMode.default('INCLUSIVE'),
});
export type VatSettings = z.infer<typeof vatSettingsSchema>;

export const vatReportQuerySchema = z.object({
  /** YYYY-MM (ເດືອນຕາມເວລາວຽງຈັນ) */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
});
export type VatReportQuery = z.infer<typeof vatReportQuerySchema>;

export type VatReportDay = {
  date: string;
  invoices: number;
  gross: number;
  net: number;
  tax: number;
  creditNotes: number;
  creditNet: number;
  creditTax: number;
};

export type VatReportView = {
  month: string;
  branchId: string | 'all';
  vat: VatSettings;
  taxId: string;
  legalName: string;
  invoices: number;
  gross: number;
  net: number;
  outputTax: number;
  creditNotes: number;
  creditTax: number;
  /** ພາສີຂາອອກສຸດທິ = outputTax − creditTax */
  netTaxPayable: number;
  /** ບິນທີ່ອອກກ່ອນເປີດ VAT / ບໍ່ມີຂໍ້ມູນພາສີ */
  invoicesWithoutTax: number;
  days: VatReportDay[];
};

// ---- ໃບຮັບເງິນ ---------------------------------------------------

export type ReceiptLine = { label: string; qty: number; amount: number };

export type ReceiptView = {
  invoiceNo: string | null;
  status: z.infer<typeof PaymentStatus>;
  issuedAt: string | null;
  business: { name: string; legalName: string; taxId: string; address: string; phone: string };
  branch: { name: string; address: string; phone: string };
  customerName: string | null;
  currency: string;
  lines: ReceiptLine[];
  total: number;
  vatRate: number | null;
  vatMode: VatMode | null;
  netAmount: number | null;
  taxAmount: number | null;
  tenders: Array<{ method: z.infer<typeof PaymentMethod>; amount: number }>;
  refunds: Array<{ creditNoteNo: string | null; amount: number; paidAt: string | null }>;
  refundedAmount: number;
  /** payload ສຳລັບ QR ກວດສອບໃບຮັບເງິນ */
  verifyCode: string;
};
