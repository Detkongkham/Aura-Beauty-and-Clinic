import { z } from 'zod';
import { moneySchema } from './common.schema.js';

/**
 * Expenses (ໂມດູນ 39 W4) — ໝວດ, workflow DRAFT→SUBMITTED→APPROVED→PAID, ໃບຮັບເງິນແນບ,
 * ລາຍຈ່າຍຊ້ຳປະຈຳເດືອນ ແລະ P&L. ອ້າງອີງ: docs/payments-treasury-plan.md §5 (W4).
 */

export const EXPENSE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'VOIDED'] as const;
export const expenseStatusSchema = z.enum(EXPENSE_STATUSES);
export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;

/** ສະຖານະທີ່ນັບເປັນລາຍຈ່າຍຈິງ (dashboard + P&L). */
export const RECOGNISED_EXPENSE_STATUSES = ['APPROVED', 'PAID'] as const satisfies readonly ExpenseStatus[];

export const EXPENSE_CATEGORY_KINDS = ['OPERATING', 'PAYROLL', 'INVENTORY'] as const;
export const expenseCategoryKindSchema = z.enum(EXPENSE_CATEGORY_KINDS);
export type ExpenseCategoryKind = z.infer<typeof expenseCategoryKindSchema>;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM-DD');
const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM');
const positiveMoney = moneySchema.refine((n) => n > 0, 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0');

// ── ໝວດ ──────────────────────────────────────────────────────────────
export const expenseCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameLo: z.string(),
  nameEn: z.string(),
  kind: expenseCategoryKindSchema,
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type ExpenseCategoryView = z.infer<typeof expenseCategorySchema>;

export const createExpenseCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'ໃຊ້ໄດ້ສະເພາະ A-Z, 0-9 ແລະ _'),
  nameLo: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  kind: expenseCategoryKindSchema.default('OPERATING'),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).max(999).default(50),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = z.object({
  nameLo: z.string().trim().min(1).max(80).optional(),
  nameEn: z.string().trim().min(1).max(80).optional(),
  kind: expenseCategoryKindSchema.optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

/** E10 — ແບ່ງຕົ້ນທຶນໃຫ້ຫຼາຍສາຂາ (ລວມ 100%). ບໍ່ໃສ່/ຫວ່າງ = ຂອງສາຂາທີ່ຈ່າຍທັງໝົດ. */
export const expenseAllocationInputSchema = z
  .array(z.object({ branchId: z.string().uuid(), percent: z.number().positive().max(100) }))
  .max(20)
  .refine((a) => a.length === 0 || Math.abs(a.reduce((s, x) => s + x.percent, 0) - 100) < 0.01, 'ສ່ວນແບ່ງລວມຕ້ອງເທົ່າກັບ 100%')
  .refine((a) => new Set(a.map((x) => x.branchId)).size === a.length, 'ສາຂາຊ້ຳກັນ');

// ── ລາຍຈ່າຍ ─────────────────────────────────────────────────────────
export const createExpenseSchema = z.object({
  branchId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  amount: positiveMoney,
  currency: z.string().trim().length(3).default('LAK'),
  /** ວັນທີ່ເກີດລາຍຈ່າຍ (ວັນຕາມເວລາວຽງຈັນ). */
  expenseDate: dateKeySchema,
  notes: z.string().trim().max(1000).optional(),
  supplierId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  /** E1 — 1 ໜ່ວຍ `currency` = ? LAK. ບໍ່ໃສ່ = ໃຊ້ອັດຕາບັນທຶກບັນຊີປັດຈຸບັນ (ExchangeRate). */
  fxRate: z.number().positive().max(1_000_000).optional(),
  /** E8 */
  taxAmount: moneySchema.optional(),
  invoiceNumber: z.string().trim().max(80).optional(),
  dueDate: dateKeySchema.optional(),
  allocations: expenseAllocationInputSchema.optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** ແກ້ໄຂໄດ້ສະເພາະ DRAFT / REJECTED; ບໍ່ໃຫ້ຍ້າຍສາຂາ. */
export const updateExpenseSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  amount: positiveMoney.optional(),
  currency: z.string().trim().length(3).optional(),
  expenseDate: dateKeySchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  fxRate: z.number().positive().max(1_000_000).optional(),
  taxAmount: moneySchema.nullable().optional(),
  invoiceNumber: z.string().trim().max(80).nullable().optional(),
  dueDate: dateKeySchema.nullable().optional(),
  /** [] = ລຶບການແບ່ງ. */
  allocations: expenseAllocationInputSchema.optional(),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const EXPENSE_LIST_FLAGS = ['missingReceipt', 'mine', 'recurring', 'overdue'] as const;
export type ExpenseListFlag = (typeof EXPENSE_LIST_FLAGS)[number];
export const EXPENSE_LIST_SORTS = ['newest', 'oldest', 'amountDesc', 'amountAsc'] as const;
export type ExpenseListSort = (typeof EXPENSE_LIST_SORTS)[number];

export const expenseListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: expenseStatusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  q: z.string().trim().max(100).optional(),
  /** ຕົວກອງຄວາມສົນໃຈ — ບໍ່ມີໃບຮັບເງິນ / ຂອງຂ້ອຍ / ມາຈາກກົດຊ້ຳ. */
  flag: z.enum(EXPENSE_LIST_FLAGS).optional(),
  sort: z.enum(EXPENSE_LIST_SORTS).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

/**
 * ດຳເນີນການຫຼາຍລາຍການພ້ອມກັນ. ແຕ່ລະລາຍການຜ່ານກົດດຽວກັບ endpoint ດ່ຽວ (ສິດ, ສາຂາ, ແຍກໜ້າທີ່),
 * ລາຍການທີ່ບໍ່ຜ່ານຖືກລາຍງານໃນ `failed` ແທນທີ່ຈະລົ້ມທັງຊຸດ.
 */
export const bulkExpenseActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), ids: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ action: z.literal('approve'), ids: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({
    action: z.literal('pay'),
    ids: z.array(z.string().uuid()).min(1).max(100),
    paidFromAccountId: z.string().uuid().nullable().optional(),
    paidReference: z.string().trim().max(120).optional(),
    cashFundId: z.string().uuid().nullable().optional(),
  }),
]);
export type BulkExpenseActionInput = z.infer<typeof bulkExpenseActionSchema>;

export type BulkExpenseActionResult = {
  succeeded: string[];
  failed: { id: string; message: string }[];
};

export const rejectExpenseSchema = z.object({
  reason: z.string().trim().min(1, 'ຕ້ອງລະບຸເຫດຜົນ').max(500),
});
export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

/**
 * Inventory 9D — ອະນຸມັດລາຍຈ່າຍທີ່ຜູກ PO ແຕ່ 3-way match ບໍ່ຜ່ານ (OVER_INVOICED/UNDER_RECEIVED) → 409,
 * ຍົກເວັ້ນ SUPER_ADMIN ສົ່ງ overrideMatch + ເຫດຜົນ (ບັນທຶກລົງ audit log).
 */
export const approveExpenseSchema = z
  .object({
    overrideMatch: z.boolean().optional(),
    overrideReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.overrideMatch || !!v.overrideReason?.trim(), {
    message: 'ຕ້ອງລະບຸເຫດຜົນເມື່ອຂ້າມການກວດ 3-way match',
    path: ['overrideReason'],
  })
  .default({});
export type ApproveExpenseInput = z.infer<typeof approveExpenseSchema>;

/** E5 — ຍົກເລີກລາຍການ APPROVED/PAID (ຕ້ອງມີເຫດຜົນ). */
export const voidExpenseSchema = z.object({
  reason: z.string().trim().min(1, 'ຕ້ອງລະບຸເຫດຜົນ').max(500),
});
export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;

/** E12 — ຈຳນວນຕໍ່ສະຖານະ ຕາມຕົວກອງດຽວກັບລາຍການ (ບໍ່ລວມ status/page). */
export const expenseStatusCountsQuerySchema = expenseListQuerySchema.omit({ status: true, page: true, pageSize: true, sort: true });
export type ExpenseStatusCountsQuery = z.infer<typeof expenseStatusCountsQuerySchema>;
export type ExpenseStatusCounts = Record<ExpenseStatus, number>;

/** E11 — ປະຫວັດການປ່ຽນແປງ (ຈາກ AuditLog). */
export type ExpenseHistoryEntry = {
  id: string;
  action: string;
  at: string;
  user: { id: string; name: string } | null;
  /** ຊ່ອງທີ່ປ່ຽນ (ສຳລັບ UPDATE) ຫຼື ຂໍ້ມູນເພີ່ມເຕີມຂອງ action. */
  changes: { field: string; from: unknown; to: unknown }[];
  note: string | null;
};

export const payExpenseSchema = z.object({
  /** null/ບໍ່ໃສ່ = ຈ່າຍເງິນສົດ. */
  paidFromAccountId: z.string().uuid().nullable().optional(),
  paidReference: z.string().trim().max(120).optional(),
  /** E9 — ຈ່າຍເງິນສົດຈາກກ່ອງເງິນສົດຍ່ອຍ (ໃຊ້ໄດ້ສະເພາະເມື່ອ paidFromAccountId ວ່າງ). */
  cashFundId: z.string().uuid().nullable().optional(),
});
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;

export const EXPENSE_ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const uploadExpenseAttachmentSchema = z.object({
  contentType: z.enum(EXPENSE_ATTACHMENT_CONTENT_TYPES),
  /** base64 (ບໍ່ຕ້ອງມີ data: prefix). ຈຳກັດ 8MB ຫຼັງ decode. */
  dataBase64: z.string().min(1),
});
export type UploadExpenseAttachmentInput = z.infer<typeof uploadExpenseAttachmentSchema>;

export const expenseAttachmentSchema = z.object({
  id: z.string().uuid(),
  url: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  imageHash: z.string(),
  createdAt: z.string(),
});
export type ExpenseAttachmentView = z.infer<typeof expenseAttachmentSchema>;

export type ExpenseView = {
  id: string;
  branchId: string;
  branchName: string;
  category: Pick<ExpenseCategoryView, 'id' | 'code' | 'nameLo' | 'nameEn' | 'kind'>;
  status: ExpenseStatus;
  title: string;
  amount: number;
  currency: string;
  /** E1 — ອັດຕາທີ່ບັນທຶກ + ຈຳນວນເປັນ LAK (ໃຊ້ລວມຍອດ). */
  fxRate: number;
  amountBase: number;
  taxAmount: number | null;
  invoiceNumber: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** SUBMITTED/APPROVED ທີ່ເລີຍ dueDate ແລ້ວ (ຕາມວັນວຽງຈັນ). */
  isOverdue: boolean;
  /** YYYY-MM-DD */
  expenseDate: string;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  purchaseOrder: { id: string; poNumber: string } | null;
  paidFromAccount: { id: string; accountName: string; accountNumber: string; bankCode: string } | null;
  paidReference: string | null;
  /** E9 */
  paidFromCashFund: { id: string; name: string } | null;
  /** E10 — ຫວ່າງ = ຕົ້ນທຶນທັງໝົດເປັນຂອງ branchId. */
  allocations: { branchId: string; branchName: string; percent: number; amountBase: number }[];
  /** E6 — ແຖວໃບແຈ້ງຍອດທະນາຄານທີ່ຈັບຄູ່ກັບການຈ່າຍນີ້. */
  bankMatch: { statementDate: string; reference: string | null; description: string | null; matchedAt: string | null; auto: boolean } | null;
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidedBy: { id: string; name: string } | null;
  voidReason: string | null;
  /** E3 — ຍອດ LAK ເກີນເພດານອະນຸມັດ → ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ. */
  needsOwnerApproval: boolean;
  /** Inventory 9D — ຜົນ 3-way match ຂອງ PO ທີ່ຜູກ (null = ບໍ່ຜູກ PO). */
  poMatch?: { status: 'MATCHED' | 'UNDER_RECEIVED' | 'OVER_INVOICED' | 'NO_INVOICE'; variance: number } | null;
  recurringExpenseId: string | null;
  attachments: ExpenseAttachmentView[];
  createdAt: string;
};

// ── ສະຫຼຸບ ───────────────────────────────────────────────────────────
export const expenseSummaryQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});
export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;

export type ExpenseSummaryView = {
  from: string;
  to: string;
  /** ຍອດ + ຈຳນວນຕໍ່ສະຖານະ (ທຸກສະຖານະ, ບໍ່ນັບ INVENTORY ແຍກ). */
  byStatus: { status: ExpenseStatus; count: number; amount: number }[];
  /** ສະເພາະ APPROVED+PAID — ຮຽງຈາກຫຼາຍໄປໜ້ອຍ. */
  byCategory: {
    categoryId: string;
    code: string;
    nameLo: string;
    nameEn: string;
    kind: ExpenseCategoryKind;
    count: number;
    amount: number;
  }[];
  byBranch: { branchId: string; branchName: string; count: number; amount: number }[];
  /** ຍອດ APPROVED+PAID ຕໍ່ເດືອນ (YYYY-MM) ຢູ່ໃນຊ່ວງ. */
  byMonth: { month: string; amount: number }[];
  recognisedTotal: number;
  /** ລໍຖ້າອະນຸມັດ (SUBMITTED). */
  pendingApproval: { count: number; amount: number };
  /** ອະນຸມັດແລ້ວແຕ່ຍັງບໍ່ຈ່າຍ (APPROVED). */
  awaitingPayment: { count: number; amount: number };
  /** ຍອດ APPROVED+PAID ຕໍ່ວັນ (YYYY-MM-DD) — ທຸກວັນໃນຊ່ວງ, ວັນທີ່ບໍ່ມີ = 0. ວ່າງຖ້າຊ່ວງເກີນ 400 ວັນ. */
  byDay: { date: string; amount: number }[];
  /** ຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນ — ໃຊ້ປຽບທຽບ. */
  previous: { from: string; to: string; recognisedTotal: number; count: number; byDay: { date: string; amount: number }[] };
  /** ທຸກສະຖານະ ແຍກຕາມສະກຸນເງິນ — ຍອດລວມຂ້າງເທິງບວກຕາມໜ້າເງິນ ບໍ່ໄດ້ແປງອັດຕາ. */
  byCurrency: { currency: string; count: number; amount: number }[];
  /** SUBMITTED/APPROVED/PAID ທີ່ບໍ່ມີໃບຮັບເງິນແນບ. */
  missingReceipts: { count: number; amount: number };
  /** ລາຍການ SUBMITTED ທີ່ຖືກສົ່ງດົນທີ່ສຸດ (ISO) — ບອກອາຍຸຄິວອະນຸມັດ. */
  oldestPendingAt: string | null;
  /** ສ່ວນທີ່ມາຈາກກົດລາຍຈ່າຍຊ້ຳ (ຕົ້ນທຶນຄົງທີ່) ໃນຍອດທີ່ຮັບຮູ້. */
  recurring: { count: number; amount: number };
  /** ຜູ້ຂາຍ 5 ອັນດັບ (APPROVED+PAID). */
  topSuppliers: { supplierId: string; name: string; count: number; amount: number }[];
  /** E6 — ຈ່າຍຜ່ານທະນາຄານໃນຊ່ວງ + ຈຳນວນທີ່ຈັບຄູ່ກັບໃບແຈ້ງຍອດແລ້ວ. E9 — ຈ່າຍເງິນສົດ. */
  bankPaid: { count: number; amount: number; matched: number };
  cashPaid: { count: number; amount: number };
  /** E8 — SUBMITTED/APPROVED ທີ່ເລີຍວັນຄົບກຳນົດ + ທີ່ຄົບກຳນົດໃນ 7 ມື້ຂ້າງໜ້າ. */
  overdue: { count: number; amount: number };
  dueSoon: { count: number; amount: number };
  /** E2 — ງົບປະມານຂອງເດືອນທີ່ຊ່ວງນີ້ແຕະ (ລວມທັງເດືອນ) ທຽບກັບລາຍຈ່າຍທີ່ຮັບຮູ້. null = ບໍ່ໄດ້ຕັ້ງງົບເລີຍ. */
  budget: {
    months: string[];
    total: number;
    byCategory: { categoryId: string; budget: number; actual: number }[];
  } | null;
  /** ລາຍຈ່າຍໃຫຍ່ສຸດ 5 ລາຍການ (APPROVED+PAID). */
  largest: { id: string; title: string; amount: number; currency: string; expenseDate: string; categoryId: string }[];
};

// ── P&L ─────────────────────────────────────────────────────────────
export const profitLossQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  /** ເດືອນເລີ່ມ/ສິ້ນສຸດ (ລວມທັງສອງ) — payroll ຄິດເປັນລາຍເດືອນ ຈຶ່ງໃຊ້ຫົວໜ່ວຍເດືອນ. ບໍ່ໃສ່ = ເດືອນນີ້. */
  from: monthKeySchema.optional(),
  to: monthKeySchema.optional(),
});
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;

export type ProfitLossMonth = {
  month: string;
  revenue: number;
  refunds: number;
  cogs: number;
  /** M13 — ລາຍຮັບຂາຍໜ້າຮ້ານ (ສ່ວນໜຶ່ງຂອງ revenue) + ຕົ້ນທຶນ retail (SOLD − SALE_RETURN, ສ່ວນໜຶ່ງຂອງ cogs). */
  retailRevenue: number;
  retailCogs: number;
  /** ມູນຄ່າສະຕັອກທີ່ສູນເສຍ (ADJUSTMENT_DEDUCT ທີ່ reason ຢູ່ໃນ STOCK_SHRINKAGE_REASONS). */
  shrinkage: number;
  labourCommission: number;
  labourOther: number;
  operatingExpenses: number;
  netProfit: number;
};

export type ProfitLossView = {
  from: string;
  to: string;
  branchId: string | null;
  /** ລາຍຮັບທີ່ເກັບໄດ້ຈິງ (Σ tender SUCCESS ໃນຊ່ວງ, ເງິນສົດ-ພື້ນຖານ). */
  revenue: number;
  refunds: number;
  netRevenue: number;
  /** ຕົ້ນທຶນສິນຄ້າທີ່ໃຊ້ — Σ −valueChange ຂອງ SERVICE_CONSUMED (WAC/ຕົ້ນທຶນ lot ຕອນຕັດ); ແຖວເກົ່າທີ່ບໍ່ມີ
   *  valueChange ໃຊ້ qty × costPrice ປັດຈຸບັນແທນ. */
  cogs: number;
  /** M13 — ລາຍຮັບຂາຍສິນຄ້າໜ້າຮ້ານ (tender SUCCESS ຂອງບິນ RetailSale — ລວມຢູ່ໃນ revenue ແລ້ວ, ແຍກໃຫ້ເຫັນ). */
  retailRevenue: number;
  /** M13 — ຕົ້ນທຶນສິນຄ້າທີ່ຂາຍ = Σ −valueChange ຂອງ SOLD − ມູນຄ່າ SALE_RETURN (ລວມຢູ່ໃນ cogs ແລ້ວ). */
  retailCogs: number;
  /** netRevenue − cogs */
  grossProfit: number;
  /** ການສູນເສຍສະຕັອກ (ເສຍຫາຍ/ໝົດອາຍຸ/ຫາຍ/ນັບຂາດ/…) — ລາຍຈ່າຍແຍກ, ຫັກອອກຈາກ netProfit. */
  shrinkage: number;
  labour: { commissionAndBonus: number; otherPayroll: number; total: number };
  operating: {
    total: number;
    byCategory: { code: string; nameLo: string; nameEn: string; amount: number }[];
  };
  /** ຊື້ວັດຖຸດິບ/ສິນຄ້າທີ່ບັນທຶກເປັນລາຍຈ່າຍ — ບໍ່ນັບໃນ P&L (COGS ນັບແລ້ວ), ສະແດງເປັນ memo. */
  inventoryPurchasesMemo: number;
  netProfit: number;
  /** netProfit ÷ netRevenue (0 ຖ້າບໍ່ມີລາຍຮັບ). */
  netMargin: number;
  months: ProfitLossMonth[];
};

// ── ລາຍຈ່າຍຊ້ຳ ──────────────────────────────────────────────────────
export const createRecurringExpenseSchema = z.object({
  branchId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  amount: positiveMoney,
  currency: z.string().trim().length(3).default('LAK'),
  dayOfMonth: z.number().int().min(1).max(28),
  notes: z.string().trim().max(1000).optional(),
  /** Wave 11 — template ແບ່ງຄ່າໃຊ້ຈ່າຍ ທີ່ຕິດໄປກັບທຸກລາຍຈ່າຍທີ່ສ້າງຈາກຮອບນີ້. */
  allocations: expenseAllocationInputSchema.optional(),
});
export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;

export const updateRecurringExpenseSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  amount: positiveMoney.optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  /** [] = ລຶບ template (ລາຍຈ່າຍໃໝ່ລົງສາຂາດຽວ). */
  allocations: expenseAllocationInputSchema.optional(),
});
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;

export const recurringExpenseListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});
export type RecurringExpenseListQuery = z.infer<typeof recurringExpenseListQuerySchema>;

export type RecurringExpenseView = {
  id: string;
  branchId: string;
  branchName: string;
  category: Pick<ExpenseCategoryView, 'id' | 'code' | 'nameLo' | 'nameEn'>;
  title: string;
  amount: number;
  currency: string;
  dayOfMonth: number;
  notes: string | null;
  isActive: boolean;
  lastGeneratedPeriod: string | null;
  /** ວັນທີ່ຮ່າງຄັ້ງຕໍ່ໄປຈະຖືກສ້າງ (YYYY-MM-DD, ເວລາວຽງຈັນ). */
  nextDueDate: string;
  /** Wave 11 — template ແບ່ງຄ່າໃຊ້ຈ່າຍ (ວ່າງ = ບໍ່ແບ່ງ). */
  allocations?: { branchId: string; branchName: string; percent: number }[];
};

// ── E2 ງົບປະມານ ──────────────────────────────────────────────────────
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM');

export const expenseBudgetQuerySchema = z.object({
  month: monthKey,
  branchId: z.string().uuid().optional(),
});
export type ExpenseBudgetQuery = z.infer<typeof expenseBudgetQuerySchema>;

/** ຕັ້ງງົບທັງເດືອນຂອງສາຂາໜຶ່ງ — amount 0 = ລຶບງົບໝວດນັ້ນ. */
export const upsertExpenseBudgetsSchema = z.object({
  branchId: z.string().uuid(),
  month: monthKey,
  items: z.array(z.object({ categoryId: z.string().uuid(), amount: moneySchema.refine((n) => n >= 0) })).max(100),
});
export type UpsertExpenseBudgetsInput = z.infer<typeof upsertExpenseBudgetsSchema>;

export type ExpenseBudgetView = {
  branchId: string;
  month: string;
  items: { categoryId: string; amount: number }[];
  /** ລາຍຈ່າຍທີ່ຮັບຮູ້ຂອງເດືອນນັ້ນ ຕໍ່ໝວດ (LAK) — ໃຫ້ຟອມສະແດງຂ້າງງົບ. */
  actual: { categoryId: string; amount: number }[];
  /** ລາຍຈ່າຍເດືອນກ່ອນ ຕໍ່ໝວດ — ໃຊ້ເປັນຄ່າແນະນຳ. */
  previousActual: { categoryId: string; amount: number }[];
};

// ── E1/E3 ການຕັ້ງຄ່າ ─────────────────────────────────────────────────
export const EXPENSE_FOREIGN_CURRENCIES = ['THB', 'USD'] as const;

export type ExpenseSettingsView = {
  /** ຍອດ LAK ທີ່ BRANCH_ADMIN ອະນຸມັດໄດ້ສູງສຸດ; null = ບໍ່ຈຳກັດ. */
  approvalLimit: number | null;
  /** ອັດຕາບັນທຶກບັນຊີ: 1 ໜ່ວຍ currency = rate LAK. */
  rates: { currency: string; rate: number; updatedAt: string | null }[];
};

export const updateExpenseSettingsSchema = z.object({
  approvalLimit: z.number().positive().max(1e13).nullable().optional(),
  rates: z
    .array(z.object({ currency: z.enum(EXPENSE_FOREIGN_CURRENCIES), rate: z.number().positive().max(1_000_000) }))
    .max(5)
    .optional(),
});
export type UpdateExpenseSettingsInput = z.infer<typeof updateExpenseSettingsSchema>;

// ── E9 ເງິນສົດຍ່ອຍ ────────────────────────────────────────────────────
export const CASH_FUND_ENTRY_TYPES = ['TOPUP', 'WITHDRAW', 'EXPENSE', 'REVERSAL', 'COUNT'] as const;
export type CashFundEntryType = (typeof CASH_FUND_ENTRY_TYPES)[number];

export const createCashFundSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3).default('LAK'),
  floatAmount: moneySchema.optional(),
  /** ຍອດເງິນທີ່ມີຢູ່ໃນກ່ອງຕອນເລີ່ມ (ບັນທຶກເປັນ TOPUP). */
  openingBalance: moneySchema.optional(),
});
export type CreateCashFundInput = z.infer<typeof createCashFundSchema>;

export const updateCashFundSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  floatAmount: moneySchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCashFundInput = z.infer<typeof updateCashFundSchema>;

export const cashFundMovementSchema = z.object({
  type: z.enum(['TOPUP', 'WITHDRAW']),
  amount: positiveMoney,
  note: z.string().trim().max(300).optional(),
  /** Wave 11 — ເຕີມຈາກ / ຖອນເຂົ້າ ບັນຊີທະນາຄານນີ້ (ບໍ່ລະບຸ = ເງິນສົດນອກລະບົບທະນາຄານ). ລົງເປັນ DEBIT/CREDIT ໃນການກະທົບຍອດ. */
  bankAccountId: z.string().uuid().optional(),
});
export type CashFundMovementInput = z.infer<typeof cashFundMovementSchema>;

export const cashFundCountSchema = z.object({
  countedAmount: moneySchema.refine((n) => n >= 0),
  note: z.string().trim().max(300).optional(),
});
export type CashFundCountInput = z.infer<typeof cashFundCountSchema>;

export type CashFundView = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  currency: string;
  floatAmount: number | null;
  isActive: boolean;
  balance: number;
  /** ຈ່າຍອອກໃນ 30 ມື້ຫຼ້າສຸດ (ລາຍຈ່າຍ). */
  spent30d: number;
  lastCount: { at: string; counted: number; difference: number; by: string } | null;
};

export type CashFundEntryView = {
  id: string;
  type: CashFundEntryType;
  amount: number;
  countedAmount: number | null;
  /** ຍອດຄົງເຫຼືອຫຼັງລາຍການນີ້. */
  balanceAfter: number;
  expense: { id: string; title: string } | null;
  /** Wave 11 — ບັນຊີທະນາຄານຂອງການເຕີມ/ຖອນ. */
  bankAccount?: { id: string; label: string } | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

// ── E7 ອ່ານໃບຮັບເງິນ (OCR) ────────────────────────────────────────────
export const receiptScanSchema = z.object({
  /** application/pdf — ອ່ານຈາກ text layer ຂອງ PDF (ໃບແຈ້ງໜີ້ດິຈິຕອນ); PDF ທີ່ເປັນຮູບສະແກນ ຕ້ອງອັບເປັນຮູບ. */
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  dataBase64: z.string().min(1),
});
export type ReceiptScanInput = z.infer<typeof receiptScanSchema>;

export type ReceiptScanView = {
  /** ຄ່າທີ່ອ່ານໄດ້ — null = ບໍ່ແນ່ໃຈ, ບໍ່ຕ້ອງຕື່ມ. */
  total: number | null;
  taxAmount: number | null;
  currency: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  invoiceNumber: string | null;
  vendor: string | null;
  /** 0–100 ຈາກ engine. */
  confidence: number;
  engine: string;
  ms: number;
  /** 5 ແຖວທຳອິດຂອງຂໍ້ຄວາມ — ໃຫ້ຜູ້ໃຊ້ເຫັນວ່າອ່ານຫຍັງໄດ້. */
  preview: string[];
  /** ພົບໃບຮັບເງິນນີ້ (hash ດຽວກັນ) ໃນລາຍຈ່າຍອື່ນແລ້ວ. */
  duplicateOf: { expenseId: string; title: string } | null;
};
