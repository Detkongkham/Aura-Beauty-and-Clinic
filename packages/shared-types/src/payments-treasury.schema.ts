import { z } from 'zod';
import { moneySchema } from './common.schema.js';

/**
 * Payments & Treasury (ໂມດູນ 39) — Bank registry + BankAccount CRUD.
 * ອ້າງອີງ: docs/payments-treasury-plan.md §4-5 (W1).
 */

export const bankSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameLo: z.string(),
  nameEn: z.string(),
  logoUrl: z.string().nullable(),
  supportsQr: z.boolean(),
  isActive: z.boolean(),
});
export type Bank = z.infer<typeof bankSchema>;

export const createBankAccountSchema = z.object({
  bankId: z.string().uuid(),
  branchId: z.string().uuid(),
  accountName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(4).max(40),
  currency: z.string().trim().length(3).default('LAK'),
  qrImageKey: z.string().trim().max(200).optional(),
  isDefault: z.boolean().default(false),
  /** ຢືນຢັນລະຫັດຜ່ານ — ຕ້ອງມີເມື່ອເພີ່ມບັນຊີ / ແກ້ຂໍ້ມູນຜູ້ຮັບເງິນ / ປ່ຽນ QR. */
  currentPassword: z.string().min(1).max(128).optional(),
});
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

export const updateBankAccountSchema = z.object({
  accountName: z.string().trim().min(1).max(120).optional(),
  accountNumber: z.string().trim().min(4).max(40).optional(),
  currency: z.string().trim().length(3).optional(),
  qrImageKey: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  currentPassword: z.string().min(1).max(128).optional(),
});
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

export const bankAccountListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});
export type BankAccountListQuery = z.infer<typeof bankAccountListQuerySchema>;

export const bankAccountSchema = z.object({
  id: z.string().uuid(),
  bankId: z.string().uuid(),
  branchId: z.string().uuid(),
  accountName: z.string(),
  accountNumber: z.string(),
  currency: z.string(),
  qrImageKey: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  /** URL ຮູບ QR ຄົງທີ່ (ຄິດຈາກ qrImageKey) — null ຖ້າຍັງບໍ່ໄດ້ອັບໂຫຼດ. */
  qrImageUrl: z.string().nullable(),
  bank: bankSchema.pick({ id: true, code: true, nameLo: true, nameEn: true, supportsQr: true }),
  /** ຄຳຂໍປ່ຽນຂໍ້ມູນຜູ້ຮັບເງິນທີ່ລໍອະນຸມັດ (ຖ້າມີ). */
  pendingChange: z
    .object({
      id: z.string().uuid(),
      kind: z.enum(['UPDATE', 'QR']),
      requestedByName: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
});
export type BankAccountView = z.infer<typeof bankAccountSchema>;

/** GET /payments-treasury/bank-accounts/insights?days=&branchId= — ກິດຈະກຳເງິນເຂົ້າ/ອອກ ແລະ ສຸຂະພາບຕໍ່ບັນຊີ. */
export const bankAccountInsightsQuerySchema = z.object({
  days: z.coerce.number().int().refine((n) => [7, 30, 90].includes(n), 'days ຕ້ອງເປັນ 7, 30 ຫຼື 90').default(30),
  branchId: z.string().uuid().optional(),
});
export type BankAccountInsightsQuery = z.infer<typeof bankAccountInsightsQuerySchema>;

export type BankAccountInsight = {
  bankAccountId: string;
  /** ເງິນເຂົ້າ (tender BANK_TRANSFER/BANK_QR ທີ່ SUCCESS) ມື້ນີ້ຕາມເວລາວຽງຈັນ. */
  receivedToday: number;
  receivedTodayCount: number;
  receivedPeriod: number;
  receivedPeriodCount: number;
  /** ຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນ — ໃຊ້ຄິດ delta. */
  receivedPrevPeriod: number;
  /** ລາຍຈ່າຍ PAID ທີ່ຈ່າຍອອກຈາກບັນຊີນີ້ໃນຊ່ວງ. */
  paidOutPeriod: number;
  paidOutPeriodCount: number;
  /** ເງິນເຂົ້າລາຍວັນ, ເກົ່າ → ໃໝ່, ຍາວ `days`. */
  daily: number[];
  lastReceivedAt: string | null;
  /** ສະລິບທີ່ລະບຸບັນຊີນີ້ ແລະ ຍັງລໍກວດ. */
  openSlips: number;
  /** QR intent ທີ່ຍັງລໍຈ່າຍ (ບໍ່ໝົດອາຍຸ). */
  pendingIntents: number;
  /** ວັນທີ statement ຫຼ້າສຸດທີ່ປ້ອນ (YYYY-MM-DD) — null = ບໍ່ເຄີຍ. */
  lastStatementDate: string | null;
  /** ມື້ໃນຊ່ວງທີ່ມີເງິນເຄື່ອນໄຫວ ແຕ່ຍັງບໍ່ໄດ້ປ້ອນ statement. */
  unreconciledDays: number;
  /** ມື້ໃນຊ່ວງທີ່ statement ບໍ່ກົງກັບລະບົບ. */
  varianceDays: number;
};

export type BankAccountInsightsView = {
  days: number;
  /** YYYY-MM-DD ວຽງຈັນ (ລວມທັງສອງຂອບ). */
  from: string;
  to: string;
  accounts: BankAccountInsight[];
  totals: {
    receivedToday: number;
    receivedTodayCount: number;
    receivedPeriod: number;
    receivedPeriodCount: number;
    receivedPrevPeriod: number;
    paidOutPeriod: number;
    openSlips: number;
    pendingIntents: number;
    unreconciledDays: number;
    varianceDays: number;
    daily: number[];
  };
  /** ເງິນໂອນທີ່ SUCCESS ໃນຊ່ວງ ແຕ່ບໍ່ໄດ້ຜູກບັນຊີ — ກະທົບຍອດບໍ່ໄດ້. */
  unassigned: { amount: number; count: number };
};

/** GET /payments-treasury/unassigned-transfers — ເງິນໂອນ SUCCESS ທີ່ບໍ່ໄດ້ຜູກບັນຊີ (ກະທົບຍອດບໍ່ໄດ້). */
export type UnassignedTransfer = {
  id: string;
  paymentId: string;
  method: 'BANK_TRANSFER' | 'BANK_QR';
  amount: number;
  currency: string;
  reference: string | null;
  createdAt: string;
  branchId: string;
  branchName: string;
  /** ເລກບັນຊີປາຍທາງທີ່ອ່ານໄດ້ຈາກສະລິບ (ຖ້າມາຈາກສະລິບ). */
  receiverAccount: string | null;
  slipId: string | null;
  /** ບັນຊີທີ່ລະບົບຄາດວ່າແມ່ນ (ເລກປາຍທາງກົງ ຫຼື ສາຂາມີບັນຊີດຽວ) — ຜູ້ໃຊ້ຕ້ອງຢືນຢັນເອງ. */
  suggestedAccountId: string | null;
};

/** PATCH /payments-treasury/transactions/:id/bank-account — ຜູກບັນຊີໃຫ້ເງິນໂອນທີ່ຍັງບໍ່ມີບັນຊີ. */
export const assignTransferAccountSchema = z.object({
  bankAccountId: z.string().uuid(),
});
export type AssignTransferAccountInput = z.infer<typeof assignTransferAccountSchema>;

// ── ຄຳຂໍປ່ຽນຂໍ້ມູນຜູ້ຮັບເງິນ (ກັນການສັບປ່ຽນບັນຊີ) ──────────────────────
export const BANK_CHANGE_KINDS = ['CREATE', 'UPDATE', 'QR'] as const;
export const BANK_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type BankChangeKind = (typeof BANK_CHANGE_KINDS)[number];
export type BankChangeStatus = (typeof BANK_CHANGE_STATUSES)[number];

/** field ທີ່ປ່ຽນ ພ້ອມຄ່າເກົ່າ → ໃໝ່ (ເປັນຂໍ້ຄວາມ, ສຳລັບສະແດງ diff). */
export type BankChangeField = 'bank' | 'branch' | 'accountName' | 'accountNumber' | 'currency' | 'isDefault' | 'qrImage';

export type BankAccountChangeView = {
  id: string;
  kind: BankChangeKind;
  status: BankChangeStatus;
  branchId: string;
  branchName: string;
  bankAccountId: string | null;
  bankCode: string;
  /** ຊື່ບັນຊີ (ຄ່າໃໝ່ຖ້າມີ, ບໍ່ດັ່ງນັ້ນຄ່າປັດຈຸບັນ). */
  accountName: string;
  changes: Array<{ field: BankChangeField; before: string | null; after: string | null }>;
  /** ສຳລັບ kind = QR: ຮູບເກົ່າ / ຮູບທີ່ຂໍ. */
  qrBeforeUrl: string | null;
  qrAfterUrl: string | null;
  requestedById: string;
  requestedByName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export const bankChangeListQuerySchema = z.object({
  status: z.enum(BANK_CHANGE_STATUSES).optional(),
  branchId: z.string().uuid().optional(),
});
export type BankChangeListQuery = z.infer<typeof bankChangeListQuerySchema>;

/** POST /payments-treasury/bank-account-changes/:id/approve — ຕ້ອງຢືນຢັນລະຫັດຜ່ານ. */
export const approveBankChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  note: z.string().trim().max(300).optional(),
});
export type ApproveBankChangeInput = z.infer<typeof approveBankChangeSchema>;

/** POST /payments-treasury/bank-account-changes/:id/reject — ຕ້ອງມີເຫດຜົນ. */
export const rejectBankChangeSchema = z.object({
  note: z.string().trim().min(1).max(300),
});
export type RejectBankChangeInput = z.infer<typeof rejectBankChangeSchema>;

/**
 * GET /payments-treasury/payments/:id/bank-accounts — ບັນຊີຮັບເງິນຂອງສາຂາທີ່ອອກບິນ, ສຳລັບລູກຄ້າ/ພະນັກງານ
 * ທີ່ເຂົ້າເຖິງບິນໄດ້ (ບໍ່ແມ່ນ admin CRUD). ບໍ່ມີ field ພາຍໃນ (isActive, branchId).
 */
export const paymentBankAccountSchema = z.object({
  id: z.string().uuid(),
  accountName: z.string(),
  accountNumber: z.string(),
  currency: z.string(),
  isDefault: z.boolean(),
  /** URL ຮູບ QR ຄົງທີ່ຂອງບັນຊີ (ຖ້າຕັ້ງໄວ້). */
  qrImageUrl: z.string().nullable(),
  bank: bankSchema.pick({ code: true, nameLo: true, nameEn: true, supportsQr: true }),
});
export type PaymentBankAccountView = z.infer<typeof paymentBankAccountSchema>;

/** POST /payments-treasury/providers/:code/qr-intent — ສ້າງ intent ໂດຍຜ່ານ adapter. */
export const createQrIntentSchema = z.object({
  paymentId: z.string().uuid(),
  amount: moneySchema.refine((n) => n > 0, 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0'),
  currency: z.string().trim().length(3).default('LAK'),
  bankAccountId: z.string().uuid().optional(),
  ttlMinutes: z.number().int().min(1).max(120).default(15),
});
export type CreateQrIntentInput = z.infer<typeof createQrIntentSchema>;

/** POST /payments-treasury/intents/:id/simulate-paid — dev/staging ເທົ່ານັ້ນ. */
export const simulateIntentSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']).default('SUCCESS'),
});
export type SimulateIntentInput = z.infer<typeof simulateIntentSchema>;

/** POST /payments-treasury/bank-accounts/:id/qr — ອັບໂຫຼດຮູບ QR ຄົງທີ່ຂອງບັນຊີ (base64, ບໍ່ຕ້ອງມີ data: prefix). */
export const uploadBankAccountQrSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(1),
  currentPassword: z.string().min(1).max(128).optional(),
});
export type UploadBankAccountQrInput = z.infer<typeof uploadBankAccountQrSchema>;

// ── Provider config (W5) ─────────────────────────────────────────────
export const paymentProviderViewSchema = z.object({
  code: z.string(),
  nameLo: z.string(),
  nameEn: z.string(),
  /** MOCK = ຈຳລອງ, LIVE = ຕໍ່ API ຈິງ. ປ່ຽນ mode ຜ່ານ deploy/env ເທົ່ານັ້ນ (ບໍ່ແກ້ຈາກ UI). */
  mode: z.enum(['MOCK', 'LIVE']),
  feeRate: z.number(),
  /** G2 — ທະນາຄານໂອນເງິນເຂົ້າເປັນຍອດສຸດທິ (ຫັກ feeRate ແລ້ວ). */
  settlesNet: z.boolean(),
  isActive: z.boolean(),
  /** ມີ secret ສຳລັບກວດ HMAC ພ້ອມແລ້ວ (env ຕັ້ງແລ້ວ ຫຼື MOCK ໃຊ້ຄ່າ dev). */
  secretConfigured: z.boolean(),
  /** path ຂອງ webhook ທີ່ຕ້ອງໃຫ້ທະນາຄານຍິງມາ. */
  webhookPath: z.string(),
  pendingIntents: z.number().int(),
  lastEventAt: z.string().nullable(),
  /** ຈຳນວນ event 7 ມື້ຫຼ້າສຸດທີ່ບໍ່ສຳເລັດ (mismatch/overpay/unknown/ຄ້າງ). */
  recentIssues: z.number().int(),
});
export type PaymentProviderView = z.infer<typeof paymentProviderViewSchema>;

export const updatePaymentProviderSchema = z.object({
  isActive: z.boolean().optional(),
  feeRate: z.number().min(0).max(0.2).optional(),
  settlesNet: z.boolean().optional(),
});
export type UpdatePaymentProviderInput = z.infer<typeof updatePaymentProviderSchema>;

// ── ຕັ້ງຄ່າລະບົບກວດສະລິບ (W5) ────────────────────────────────────────
export const slipSettingsSchema = z.object({
  /** true = ສະລິບທີ່ຜ່ານທັງ 3 ເກນ ຈະຕັດຍອດເອງ (ຄ່າເລີ່ມຕົ້ນ false). */
  autoApprove: z.boolean(),
  /** ຄວາມຄາດເຄື່ອນຂອງຈຳນວນເງິນທີ່ຍອມຮັບ (ຫົວໜ່ວຍ: ກີບ). */
  amountTolerance: z.number().min(0).max(100_000),
  /** S4 — ເປົ້າໝາຍເວລາກວດ (ນາທີ) ຄ່າເລີ່ມຕົ້ນ + ແຍກຕາມສາຂາ. */
  reviewSlaMinutes: z.number().int().min(5).max(1440),
  branchSlaMinutes: z.record(z.string().uuid(), z.number().int().min(5).max(1440)),
  /** S4 — ແຈ້ງຜູ້ຈັດການເມື່ອສະລິບລໍເກີນເປົ້າໝາຍ. */
  slaAlertEnabled: z.boolean(),
});
export type SlipSettings = z.infer<typeof slipSettingsSchema>;

// ── ກະທົບຍອດ (W5) ────────────────────────────────────────────────────
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM-DD');

export const reconciliationQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  from: dateKeySchema,
  to: dateKeySchema,
});
export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;

/** PUT /payments-treasury/reconciliation/statements — ບັນທຶກຍອດຕາມ statement ທະນາຄານຂອງມື້ໜຶ່ງ (upsert). */
export const upsertBankStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  date: dateKeySchema,
  statementCredit: moneySchema,
  statementDebit: moneySchema,
  note: z.string().trim().max(300).optional(),
  /** G4 — ຍອດຍົກມາ/ຍອດຍົກໄປ ຕາມ statement (ອາດຕິດລົບໄດ້ ຖ້າເບີກເກີນ). null = ລ້າງ. */
  openingBalance: z.number().finite().nullable().optional(),
  closingBalance: z.number().finite().nullable().optional(),
});
export type UpsertBankStatementInput = z.infer<typeof upsertBankStatementSchema>;

/** RESOLVED = ມີສ່ວນຕ່າງ ແຕ່ອະທິບາຍ ແລະ ອະນຸມັດແລ້ວ (G3). */
export type ReconciliationStatus = 'MATCHED' | 'VARIANCE' | 'RESOLVED' | 'UNRECONCILED';

export const VARIANCE_RESOLUTIONS = ['BANK_FEE', 'TIMING', 'WRONG_ACCOUNT', 'UNBOOKED_SLIP', 'DATA_ENTRY', 'OTHER'] as const;
export type VarianceResolution = (typeof VARIANCE_RESOLUTIONS)[number];

const resolutionBody = {
  resolution: z.enum(VARIANCE_RESOLUTIONS),
  note: z.string().trim().max(300).optional(),
};
/** POST /reconciliation/statements/:id/resolve — OTHER ຕ້ອງມີໝາຍເຫດ. */
export const resolveStatementSchema = z
  .object(resolutionBody)
  .refine((v) => v.resolution !== 'OTHER' || Boolean(v.note), { message: 'ເຫດຜົນ "ອື່ນໆ" ຕ້ອງມີໝາຍເຫດ', path: ['note'] });
export type ResolveStatementInput = z.infer<typeof resolveStatementSchema>;

/** POST /reconciliation/statements/resolve-bulk — ເຊັ່ນ ຄູ່ສ່ວນຕ່າງ T+1 (TIMING). */
export const resolveStatementsBulkSchema = z
  .object({ ...resolutionBody, statementIds: z.array(z.string().uuid()).min(1).max(100) })
  .refine((v) => v.resolution !== 'OTHER' || Boolean(v.note), { message: 'ເຫດຜົນ "ອື່ນໆ" ຕ້ອງມີໝາຍເຫດ', path: ['note'] });
export type ResolveStatementsBulkInput = z.infer<typeof resolveStatementsBulkSchema>;

export type ReconciliationRow = {
  /** YYYY-MM-DD (ວຽງຈັນ) */
  date: string;
  bankAccountId: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  branchId: string;
  branchName: string;
  currency: string;
  /** ເງິນເຂົ້າຕາມລະບົບ (tender BANK_TRANSFER/BANK_QR ທີ່ SUCCESS). */
  systemCredit: number;
  systemCreditCount: number;
  /** ເງິນອອກຕາມລະບົບ (ລາຍຈ່າຍ PAID ຈາກບັນຊີນີ້). */
  systemDebit: number;
  systemDebitCount: number;
  statementId: string | null;
  statementCredit: number | null;
  statementDebit: number | null;
  note: string | null;
  /** statement − system; null ຖ້າຍັງບໍ່ໄດ້ປ້ອນ statement. */
  creditVariance: number | null;
  debitVariance: number | null;
  status: ReconciliationStatus;
  /** ຜູ້ປ້ອນ/ແກ້ statement ຫຼ້າສຸດ ແລະ ເວລາ — audit trail ສຳລັບຜູ້ກວດ. */
  enteredByName: string | null;
  enteredAt: string | null;
  /** G2 — ຄ່າທຳນຽມຂອງ provider ທີ່ໂອນສຸດທິ (settlesNet); ທະນາຄານຄວນສະແດງ systemCredit − systemFee. */
  systemFee: number;
  expectedCredit: number;
  /** G4 */
  openingBalance: number | null;
  closingBalance: number | null;
  /** closing − (opening + statementCredit − statementDebit); null ຖ້າບໍ່ມີທັງສອງ. */
  balanceGap: number | null;
  /** opening − closing ຂອງ statement ມື້ກ່ອນ (ມື້ທີ່ມີ closing ຫຼ້າສຸດ); null ຖ້າບໍ່ມີຂໍ້ມູນ. */
  openingGap: number | null;
  source: 'MANUAL' | 'IMPORT';
  /** G3 */
  resolution: VarianceResolution | null;
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  /** G1 — ແຖວ statement ທີ່ນຳເຂົ້າ ແລະ ທີ່ຍັງບໍ່ຈັບຄູ່. */
  lineCount: number;
  unmatchedLines: number;
  /** G5 — ເດືອນຂອງມື້ນີ້ປິດງວດແລ້ວ (ແກ້ບໍ່ໄດ້). */
  locked: boolean;
};

export type ReconciliationTotals = {
  systemCredit: number;
  systemDebit: number;
  systemFee: number;
  statementCredit: number;
  statementDebit: number;
  matched: number;
  variance: number;
  resolved: number;
  unreconciled: number;
};

export type ReconciliationPeriodView = {
  id: string;
  branchId: string;
  branchName: string;
  month: string;
  closedAt: string;
  closedByName: string | null;
  note: string | null;
  summary: Record<string, unknown>;
};

/** ສະຫຼຸບຕໍ່ບັນຊີທະນາຄານ — ລວມບັນຊີທີ່ບໍ່ມີລາຍການໃນຊ່ວງດ້ວຍ (ໃຫ້ເຫັນວ່າຍັງບໍ່ເຄື່ອນໄຫວ). */
export type ReconciliationAccount = {
  bankAccountId: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  branchId: string;
  branchName: string;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  /** ວັນທີ statement ຫຼ້າສຸດທີ່ເຄີຍປ້ອນ (ທຸກຊ່ວງເວລາ), null ຖ້າບໍ່ເຄີຍ. */
  lastStatementDate: string | null;
};

export type ReconciliationIssue = {
  id: string;
  providerCode: string;
  eventId: string;
  /** ຜົນ process ຂອງ webhook (AMOUNT_MISMATCH / OVERPAY / UNKNOWN_INTENT / PROVIDER_MISMATCH) ຫຼື null ຖ້າຍັງຄ້າງ. */
  result: string | null;
  amount: number | null;
  reference: string | null;
  createdAt: string;
};

export type ReconciliationView = {
  from: string;
  to: string;
  rows: ReconciliationRow[];
  /** ລວມທຸກສະກຸນ (ໃຊ້ໄດ້ເມື່ອມີສະກຸນດຽວ) — ເບິ່ງ totalsByCurrency ເມື່ອມີຫຼາຍສະກຸນ (G6). */
  totals: ReconciliationTotals;
  totalsByCurrency: Record<string, ReconciliationTotals>;
  /** G5 — ງວດທີ່ປິດແລ້ວ ທີ່ຊ້ອນກັບຊ່ວງວັນທີນີ້. */
  periods: ReconciliationPeriodView[];
  /** ສະລິບທີ່ຍັງລໍກວດ (ເງິນອາດເຂົ້າບັນຊີແລ້ວ ແຕ່ລະບົບຍັງບໍ່ຕັດຍອດ) — ອະທິບາຍ variance. */
  openSlips: number;
  issues: ReconciliationIssue[];
  accounts: ReconciliationAccount[];
};

/** GET /payments-treasury/reconciliation/day — ລາຍລະອຽດຂອງບັນຊີໜຶ່ງໃນມື້ໜຶ່ງ (ໃຊ້ຊອກຫາທີ່ມາຂອງສ່ວນຕ່າງ). */
export const reconciliationDayQuerySchema = z.object({
  bankAccountId: z.string().uuid(),
  date: dateKeySchema,
});
export type ReconciliationDayQuery = z.infer<typeof reconciliationDayQuerySchema>;

export type ReconciliationCreditLine = {
  id: string;
  /** G2 — ຄ່າທຳນຽມ provider (0 ຖ້າບໍ່ໄດ້ຫັກສຸດທິ). */
  fee: number;
  providerCode: string | null;
  matchedLineId: string | null;
  at: string;
  amount: number;
  method: string;
  reference: string | null;
  paymentId: string;
  appointmentId: string | null;
  customerName: string | null;
  serviceName: string | null;
  /** ສະລິບທີ່ນຳໄປສູ່ tender ນີ້ (ຖ້າມີ). */
  slipId: string | null;
};

export type ReconciliationDebitLine = {
  id: string;
  /** G7 — EXPENSE = ລາຍຈ່າຍ, REFUND = ໂອນເງິນຄືນລູກຄ້າ. */
  kind: 'EXPENSE' | 'REFUND';
  matchedLineId: string | null;
  at: string;
  amount: number;
  title: string;
  categoryLo: string;
  categoryEn: string;
  supplierName: string | null;
  reference: string | null;
};

export type ReconciliationSlipLine = {
  id: string;
  verdict: string;
  amount: number | null;
  declaredAmount: number | null;
  txnRef: string | null;
  senderName: string | null;
  transferredAt: string | null;
  createdAt: string;
  paymentId: string;
};

export type ReconciliationLineView = {
  id: string;
  seq: number;
  postedAt: string | null;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balance: number | null;
  description: string | null;
  reference: string | null;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'IGNORED';
  matchedKind: 'TX' | 'EXPENSE' | 'REFUND' | null;
  matchedId: string | null;
  /** true = ຈັບຄູ່ອັດຕະໂນມັດ. */
  autoMatched: boolean;
};

export type ReconciliationDayDetail = {
  row: ReconciliationRow;
  credits: ReconciliationCreditLine[];
  debits: ReconciliationDebitLine[];
  /** G1 — ແຖວ statement ທີ່ນຳເຂົ້າ ຂອງມື້ນີ້. */
  lines: ReconciliationLineView[];
  /** ສະລິບທີ່ອັບໂຫຼດໃນມື້ນັ້ນສຳລັບບັນຊີນີ້ (ຫຼື ບໍ່ລະບຸບັນຊີ ໃນສາຂາດຽວກັນ). */
  slips: ReconciliationSlipLine[];
};

// ── ກະທົບຍອດ: ນຳເຂົ້າ statement (G1) ───────────────────────────────
export const STATEMENT_DATE_FORMATS = ['DMY', 'YMD', 'MDY'] as const;

/** ຄໍລຳ (index ເລີ່ມ 0) ຂອງໄຟລ໌ CSV — credit/debit ແຍກກັນ ຫຼື amount ມີເຄື່ອງໝາຍ. */
export const statementMappingSchema = z
  .object({
    date: z.number().int().min(0),
    time: z.number().int().min(0).nullable().optional(),
    description: z.number().int().min(0).nullable().optional(),
    reference: z.number().int().min(0).nullable().optional(),
    credit: z.number().int().min(0).nullable().optional(),
    debit: z.number().int().min(0).nullable().optional(),
    amount: z.number().int().min(0).nullable().optional(),
    balance: z.number().int().min(0).nullable().optional(),
    dateFormat: z.enum(STATEMENT_DATE_FORMATS).default('DMY'),
    hasHeader: z.boolean().default(true),
    /** ແຖວຫົວຕາຕະລາງ (0-based) — ບາງທະນາຄານມີແຖວຂໍ້ມູນບັນຊີຢູ່ກ່ອນ. */
    headerRow: z.number().int().min(0).max(30).default(0),
  })
  .refine((m) => m.amount != null || m.credit != null || m.debit != null, {
    message: 'ຕ້ອງເລືອກຄໍລຳຈຳນວນເງິນ (amount ຫຼື credit/debit)',
  });
export type StatementMapping = z.infer<typeof statementMappingSchema>;

export const statementImportSchema = z.object({
  bankAccountId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  /** ເນື້ອໃນ CSV (UTF-8). ~1.4MB ພໍດີກັບ body limit 2MB. */
  csv: z.string().min(1).max(1_400_000),
  mapping: statementMappingSchema.optional(),
  /** true = ວິເຄາະ ແລະ ສະແດງຕົວຢ່າງ ໂດຍບໍ່ບັນທຶກ. */
  dryRun: z.boolean().default(true),
});
export type StatementImportInput = z.infer<typeof statementImportSchema>;

export type StatementParsedLine = {
  row: number;
  date: string;
  postedAt: string | null;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balance: number | null;
  description: string | null;
  reference: string | null;
};

export type StatementImportPreview = {
  mapping: StatementMapping;
  /** true = ລະບົບເດົາ mapping ເອງຈາກຫົວຕາຕະລາງ. */
  detected: boolean;
  headers: string[];
  sampleRows: string[][];
  lines: StatementParsedLine[];
  count: number;
  creditTotal: number;
  debitTotal: number;
  fromDate: string | null;
  toDate: string | null;
  errors: { row: number; message: string }[];
  duplicates: number;
  /** ມື້ທີ່ຕົກຢູ່ໃນງວດທີ່ປິດແລ້ວ — ຈະບໍ່ຖືກນຳເຂົ້າ. */
  lockedDates: string[];
};

export type StatementImportResult = {
  importId: string;
  inserted: number;
  duplicates: number;
  days: number;
  matched: number;
  unmatched: number;
};

export const matchLineSchema = z.object({
  kind: z.enum(['TX', 'EXPENSE', 'REFUND']),
  id: z.string().uuid(),
});
export type MatchLineInput = z.infer<typeof matchLineSchema>;

// ── ກະທົບຍອດ: ປິດງວດ (G5), ການຕັ້ງຄ່າ (G9), ປະຫວັດ (G11) ──────────────
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM');

export const closePeriodSchema = z.object({
  branchId: z.string().uuid(),
  month: monthKeySchema,
  note: z.string().trim().max(300).optional(),
});
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;

export type PeriodReadiness = {
  branchId: string;
  month: string;
  closed: boolean;
  /** ມື້ຍັງບໍ່ໃສ່ statement / ສ່ວນຕ່າງທີ່ຍັງບໍ່ອະທິບາຍ / ແຖວ statement ທີ່ຍັງບໍ່ຈັບຄູ່ / ຍອດບໍ່ຕໍ່ເນື່ອງ. */
  unreconciled: number;
  unresolvedVariance: number;
  unmatchedLines: number;
  balanceBreaks: number;
  canClose: boolean;
  /** ເດືອນຍັງບໍ່ຈົບ (ວຽງຈັນ) — ປິດບໍ່ໄດ້. */
  monthOpen: boolean;
};

export const reconSettingsSchema = z.object({
  /** ແຈ້ງເຕືອນທຸກເຊົ້າ ຖ້າມື້ວານມີການເຄື່ອນໄຫວ ແຕ່ຍັງບໍ່ໃສ່ statement. */
  reminderEnabled: z.boolean(),
  /** ສ່ວນຕ່າງ (ກີບ) ທີ່ຍັງບໍ່ອະທິບາຍ ຕັ້ງແຕ່ຈຳນວນນີ້ຂຶ້ນໄປ → ແຈ້ງເຕືອນລະດັບ warning. */
  varianceAlertThreshold: z.number().min(0).max(1_000_000_000),
});
export type ReconSettings = z.infer<typeof reconSettingsSchema>;

export type StatementHistoryEntry = {
  id: string;
  action: string;
  at: string;
  userName: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

// ── ລິ້ນຊັກເງິນສົດ (G10) ──────────────────────────────────────────────
/** ລາຄາໃບເງິນກີບທີ່ນັບ (ໃຫຍ່ → ນ້ອຍ). */
export const LAK_DENOMINATIONS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export const openCashDrawerSchema = z.object({
  branchId: z.string().uuid(),
  openingFloat: z.number().min(0).max(1_000_000_000),
  note: z.string().trim().max(300).optional(),
});
export type OpenCashDrawerInput = z.infer<typeof openCashDrawerSchema>;

export const cashDrawerMovementSchema = z.object({
  type: z.enum(['DROP', 'PAYIN', 'PAYOUT']),
  amount: z.number().positive().max(1_000_000_000),
  note: z.string().trim().max(300).optional(),
});
export type CashDrawerMovementInput = z.infer<typeof cashDrawerMovementSchema>;

/** ນັບດ້ວຍໃບເງິນ (denominations) ຫຼື ໃສ່ຍອດລວມ. ມີສ່ວນຕ່າງ → ຕ້ອງມີໝາຍເຫດ (ກວດຢູ່ server). */
export const closeCashDrawerSchema = z
  .object({
    denominations: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(100_000)).optional(),
    countedAmount: z.number().min(0).max(1_000_000_000).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.denominations !== undefined || v.countedAmount !== undefined, {
    message: 'ຕ້ອງໃສ່ຍອດທີ່ນັບໄດ້',
  });
export type CloseCashDrawerInput = z.infer<typeof closeCashDrawerSchema>;

export type CashDrawerMovementView = {
  id: string;
  type: 'DROP' | 'PAYIN' | 'PAYOUT';
  amount: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type CashDrawerSessionView = {
  id: string;
  branchId: string;
  branchName: string;
  currency: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedByName: string | null;
  openingFloat: number;
  openingNote: string | null;
  closedAt: string | null;
  closedByName: string | null;
  /** ສຳລັບກະທີ່ເປີດຢູ່: ຄຳນວນສົດ; ກະທີ່ປິດ: snapshot ຕອນປິດ. */
  cashSales: number;
  cashSalesCount: number;
  cashRefunds: number;
  payIns: number;
  drops: number;
  payouts: number;
  expectedAmount: number;
  countedAmount: number | null;
  variance: number | null;
  denominations: Record<string, number> | null;
  closingNote: string | null;
  movements: CashDrawerMovementView[];
};

// ---- Wave 10C: Z-report / ນະໂຍບາຍເງິນສົດ / ລາຍງານ over-short ----------------

export type ZReportView = {
  sessionId: string;
  /** ເລກ Z-report ຕໍ່ເນື່ອງ — null ຖ້າກະຍັງເປີດຢູ່ (ເບິ່ງລ່ວງໜ້າ) */
  zNo: string | null;
  isLive: boolean;
  branchName: string;
  currency: string;
  openedAt: string;
  openedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  /** ຍອດຮັບຊຳລະໃນກະ ແຍກຕາມວິທີຈ່າຍ (ທຸກວິທີ, ບໍ່ສະເພາະເງິນສົດ) */
  sales: Array<{ method: string; count: number; amount: number }>;
  salesTotal: number;
  invoices: { count: number; first: string | null; last: string | null; gross: number; net: number; tax: number };
  refunds: { count: number; total: number; payout: number; storeCredit: number; tax: number; firstCreditNote: string | null; lastCreditNote: string | null };
  voids: number;
  cash: {
    openingFloat: number;
    cashSales: number;
    cashRefunds: number;
    payIns: number;
    drops: number;
    payouts: number;
    expected: number;
    counted: number | null;
    variance: number | null;
    denominations: Record<string, number> | null;
    note: string | null;
  };
  generatedAt: string;
};

export type CashPolicy = { requireOpenDrawer: boolean };
export const cashPolicySchema = z.object({ requireOpenDrawer: z.boolean() });

export const cashVarianceQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CashVarianceQuery = z.infer<typeof cashVarianceQuerySchema>;

export type CashVarianceRow = {
  key: string;
  name: string;
  sessions: number;
  sessionsWithVariance: number;
  over: number;
  short: number;
  net: number;
  worst: number;
};

export type CashVarianceReport = {
  from: string;
  to: string;
  totalSessions: number;
  net: number;
  over: number;
  short: number;
  byStaff: CashVarianceRow[];
  byBranch: CashVarianceRow[];
};
