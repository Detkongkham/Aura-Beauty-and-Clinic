import { z } from 'zod';

/**
 * Wave 11 — ຊັ້ນບັນຊີທີ່ຍັງຂາດ (finance-marketing-audit F-09…F-20):
 * ນະໂຍບາຍການເງິນ, ທິບ + ຄ່າບໍລິການ, ຄ່າປັບ no-show / ຍົກເລີກຊ້າ, ຄະແນນໝົດອາຍຸ, ໜີ້ສິນສັນຍາ (IFRS 15),
 * breakage ບັດຂອງຂວັນ, FX feed ຝັ່ງ server ແລະ ການສົ່ງອອກ journal ໄປໂປຣແກຣມບັນຊີ.
 */

// ---- policy (AppSetting `finance.policy`) --------------------------------

export const financePolicySchema = z.object({
  /** % ຄ່າບໍລິການທີ່ບວກເທິງບິນຄ່າບໍລິການ (0 = ປິດ). ຢຸດໄວ້ໃນບິນຕອນສ້າງ. */
  serviceChargePercent: z.number().min(0).max(20),
  /** % ຂອງມັດຈຳທີ່ຈ່າຍແລ້ວ ທີ່ຢຶດເມື່ອລູກຄ້າບໍ່ມາ (NO_SHOW). */
  noShowFeePercent: z.number().min(0).max(100),
  /** % ຂອງມັດຈຳທີ່ຢຶດເມື່ອຍົກເລີກພາຍໃນ cancellation window. */
  lateCancelFeePercent: z.number().min(0).max(100),
  /** ຄະແນນໝົດອາຍຸຫຼັງໄດ້ຮັບ N ເດືອນ (FIFO). 0 = ບໍ່ໝົດອາຍຸ. */
  pointsExpiryMonths: z.number().int().min(0).max(120),
  /** ແຈ້ງລູກຄ້າລ່ວງໜ້າ N ມື້ກ່ອນຄະແນນໝົດອາຍຸ (0 = ບໍ່ແຈ້ງ). */
  pointsExpiryNoticeDays: z.number().int().min(0).max(90),
  /** ຮັບຮູ້ຍອດຄົງເຫຼືອຂອງບັດຂອງຂວັນທີ່ໝົດອາຍຸເປັນລາຍຮັບ breakage ອັດຕະໂນມັດ. */
  giftCardBreakage: z.boolean(),
  /** ດຶງອັດຕາແລກປ່ຽນປະຈຳວັນຈາກ feed (ອັດຕາທີ່ `locked` ບໍ່ຖືກຂຽນທັບ). */
  fxAutoFeed: z.boolean(),
  fxCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(12),
});
export type FinancePolicy = z.infer<typeof financePolicySchema>;
export const updateFinancePolicySchema = financePolicySchema.partial();
export type UpdateFinancePolicyInput = z.infer<typeof updateFinancePolicySchema>;

// ---- chart of accounts (AppSetting `finance.accounts`) -------------------

export const LEDGER_ACCOUNT_KEYS = [
  'cash',
  'bank',
  'inventory',
  'inventoryInTransit',
  'accountsPayable',
  'openingEquity',
  'customerDeposits',
  'giftCardLiability',
  'packageDeferred',
  'vatPayable',
  'tipsPayable',
  'serviceRevenue',
  'serviceChargeRevenue',
  'cancellationFeeIncome',
  'breakageIncome',
  'loyaltyDiscount',
  'salesReturns',
  'cogs',
  'operatingExpense',
  'shrinkage',
] as const;
export const LedgerAccountKey = z.enum(LEDGER_ACCOUNT_KEYS);
export type LedgerAccountKey = z.infer<typeof LedgerAccountKey>;

export const ledgerAccountSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
});
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
export const chartOfAccountsSchema = z.record(LedgerAccountKey, ledgerAccountSchema);
export type ChartOfAccounts = Record<LedgerAccountKey, LedgerAccount>;
export const updateChartOfAccountsSchema = z.record(LedgerAccountKey, ledgerAccountSchema.partial()).default({});
export type UpdateChartOfAccountsInput = z.infer<typeof updateChartOfAccountsSchema>;

// ---- journal export -----------------------------------------------------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const journalQuerySchema = z.object({
  from: dateStr,
  to: dateStr,
  branchId: z.string().default('all'),
  format: z.enum(['json', 'csv']).default('json'),
});
export type JournalQuery = z.infer<typeof journalQuerySchema>;

export type JournalSource =
  | 'RECEIPT'
  | 'TENDER'
  | 'REVENUE'
  | 'FORFEIT'
  | 'REFUND'
  | 'BREAKAGE'
  | 'GRATUITY'
  | 'GRATUITY_PAYOUT'
  | 'PACKAGE_USAGE'
  | 'EXPENSE'
  | 'COGS'
  | 'INVENTORY';

export type JournalLine = { account: string; accountName: string; debit: number; credit: number };
export type JournalEntry = {
  /** ວັນທີ (Vientiane, YYYY-MM-DD) */
  date: string;
  source: JournalSource;
  /** ເລກເອກະສານອ້າງອີງ (INV/CN/ລະຫັດລາຍການ) */
  ref: string;
  memo: string;
  branchName: string;
  lines: JournalLine[];
};
export type JournalView = {
  from: string;
  to: string;
  entries: JournalEntry[];
  /** ຍອດລວມຕາມບັນຊີ (trial balance ຂອງຊ່ວງ) */
  totals: { account: string; accountName: string; debit: number; credit: number }[];
  debitTotal: number;
  creditTotal: number;
  balanced: boolean;
};

// ---- liabilities (IFRS 15 contract liabilities) --------------------------

export const liabilitiesQuerySchema = z.object({
  branchId: z.string().default('all'),
  /** ຊ່ວງທີ່ໃຊ້ນັບ breakage / ຄະແນນໝົດອາຍຸ / ຄ່າປັບ ທີ່ຮັບຮູ້ (default 30 ມື້ຫຼ້າສຸດ). */
  from: dateStr.optional(),
  to: dateStr.optional(),
});
export type LiabilitiesQuery = z.infer<typeof liabilitiesQuerySchema>;

export type LiabilitiesView = {
  asOf: string;
  from: string;
  to: string;
  /** ເງິນທີ່ລູກຄ້າຈ່າຍລ່ວງໜ້າສຳລັບນັດທີ່ຍັງບໍ່ໄດ້ໃຫ້ບໍລິການ */
  customerDeposits: { amount: number; bills: number };
  giftCards: { amount: number; cards: number; expiringIn30Days: number };
  packages: { amount: number; packages: number; sessions: number };
  loyaltyPoints: { points: number; amount: number; pointValueLak: number; expiringIn30Days: number };
  tipsPayable: { amount: number; staff: number };
  total: number;
  recognized: {
    breakage: number;
    pointsExpired: number;
    cancellationFees: number;
    serviceCharges: number;
  };
};

// ---- gratuities (tips) ---------------------------------------------------

export const gratuityShareInputSchema = z.object({
  staffProfileId: z.string().uuid(),
  amount: z.number().positive(),
});

/** POST /payments/:id/gratuities — shares ວ່າງ = ໃຫ້ຊ່າງຂອງນັດທັງໝົດ (ບິນທີ່ບໍ່ມີຊ່າງ ຕ້ອງລະບຸ). */
export const createGratuitySchema = z.object({
  method: z.enum(['CASH', 'BANK_QR', 'BANK_TRANSFER', 'CREDIT_CARD']),
  amount: z.number().positive().max(100_000_000),
  note: z.string().trim().max(200).optional(),
  shares: z.array(gratuityShareInputSchema).max(20).optional(),
});
export type CreateGratuityInput = z.infer<typeof createGratuitySchema>;

export type GratuityView = {
  id: string;
  paymentId: string;
  invoiceNo: string | null;
  branchName: string;
  method: string;
  amount: number;
  note: string | null;
  collectedByName: string;
  createdAt: string;
  shares: { id: string; staffProfileId: string; staffName: string; amount: number; paidOutAt: string | null }[];
};

export const gratuityListQuerySchema = z.object({
  branchId: z.string().default('all'),
  from: dateStr.optional(),
  to: dateStr.optional(),
  status: z.enum(['all', 'unpaid', 'paid']).default('all'),
});
export type GratuityListQuery = z.infer<typeof gratuityListQuerySchema>;

export type GratuityStaffSummary = {
  staffProfileId: string;
  staffName: string;
  unpaid: number;
  paid: number;
  shares: number;
};
export type GratuityListView = {
  items: GratuityView[];
  byStaff: GratuityStaffSummary[];
  totals: { collected: number; unpaid: number; paid: number };
};

/** POST /finance/gratuities/payout — ຈ່າຍທິບຄ້າງໃຫ້ພະນັກງານ (ທຸກສ່ວນແບ່ງທີ່ຍັງບໍ່ຈ່າຍ ຫຼື ລະບຸ shareIds). */
export const gratuityPayoutSchema = z.object({
  staffProfileId: z.string().uuid(),
  shareIds: z.array(z.string().uuid()).max(500).optional(),
  /** CASH = ຈ່າຍຈາກລິ້ນຊັກ (ບັນທຶກ PAYOUT ຖ້າມີກະເປີດ); PAYROLL = ລວມຈ່າຍກັບເງິນເດືອນ. */
  method: z.enum(['CASH', 'BANK_TRANSFER', 'PAYROLL']).default('CASH'),
  branchId: z.string().uuid().optional(),
});
export type GratuityPayoutInput = z.infer<typeof gratuityPayoutSchema>;

// ---- FX feed --------------------------------------------------------------

export type FxRateView = {
  currency: string;
  /** 1 ໜ່ວຍ `currency` = ? LAK */
  rate: number;
  source: 'MANUAL' | 'FEED';
  locked: boolean;
  fetchedAt: string | null;
  updatedAt: string;
};

export const upsertFxRateSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().positive().max(10_000_000),
  locked: z.boolean().default(true),
});
export type UpsertFxRateInput = z.infer<typeof upsertFxRateSchema>;

export type FxRefreshResult = { updated: string[]; skippedLocked: string[]; failed: string | null; fetchedAt: string };
