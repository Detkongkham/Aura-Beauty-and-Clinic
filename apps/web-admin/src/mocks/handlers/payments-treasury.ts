import type {
  BankAccountChangeView,
  BankAccountInsightsView,
  BankAccountView,
  ExpenseCategoryView,
  ExpenseSummaryView,
  ExpenseView,
  PaymentProviderView,
  PaymentSlipView,
  ProfitLossView,
  CashDrawerSessionView,
  ReconciliationDayDetail,
  ReconciliationRow,
  ReconciliationView,
  SlipSettings,
  SlipSummary,
  UnassignedTransfer,
} from '@abcp/shared-types';
import { HttpResponse, http } from 'msw';

import { api, ok, paginated } from '../helpers';

/**
 * Module 39 (Payments & Treasury) mocks — mirror `/payments-treasury/*` and `/expenses/*`.
 * Enough data to exercise every state the four «ການຊຳລະເງິນ» pages render.
 */
const BRANCH = '11111111-1111-1111-1111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const bcel = { id: id(901), code: 'BCEL', nameLo: 'ທະນາຄານການຄ້າຕ່າງປະເທດລາວ', nameEn: 'BCEL', supportsQr: true };
const ldb = { id: id(902), code: 'LDB', nameLo: 'ທະນາຄານພັດທະນາລາວ', nameEn: 'LDB', supportsQr: true };

export const mockBankAccounts: BankAccountView[] = [
  { id: id(11), bankId: bcel.id, branchId: BRANCH, accountName: 'Aura Clinic Main', accountNumber: '010120000123456', currency: 'LAK', qrImageKey: null, qrImageUrl: null, isActive: true, isDefault: true, pendingChange: null, bank: bcel },
  { id: id(12), bankId: ldb.id, branchId: BRANCH, accountName: 'Aura Clinic LDB', accountNumber: '2200998877', currency: 'LAK', qrImageKey: 'bank-qr/x.jpg', qrImageUrl: 'http://localhost/uploads/bank-qr/x.jpg', isActive: true, isDefault: false, pendingChange: { id: id(801), kind: 'UPDATE', requestedByName: 'Branch Manager', createdAt: new Date(Date.now() - 3_600_000).toISOString() }, bank: ldb },
];

/** One branch-admin request waiting for the owner: a new account number on the LDB account. */
const mockChanges: BankAccountChangeView[] = [
  {
    id: id(801),
    kind: 'UPDATE',
    status: 'PENDING',
    branchId: BRANCH,
    branchName: 'Aura Main',
    bankAccountId: id(12),
    bankCode: 'LDB',
    accountName: 'Aura Clinic LDB',
    changes: [{ field: 'accountNumber', before: '2200998877', after: '2200554433' }],
    qrBeforeUrl: null,
    qrAfterUrl: null,
    requestedById: id(3),
    requestedByName: 'Branch Manager',
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
];

const mockUnassigned: UnassignedTransfer[] = [
  { id: id(851), paymentId: id(70), method: 'BANK_TRANSFER', amount: 150_000, currency: 'LAK', reference: 'BCEL123456', createdAt: new Date(Date.now() - 86_400_000).toISOString(), branchId: BRANCH, branchName: 'Aura Main', receiverAccount: '3456', slipId: null, suggestedAccountId: id(11) },
];

/** Insights for the two mock accounts — Main is busy and reconciled, LDB has a variance day + open slips. */
function mockInsights(days: number): BankAccountInsightsView {
  const series = (seed: number) => Array.from({ length: days }, (_, i) => ((i * seed) % 7 === 0 ? 0 : ((i * seed) % 5) * 150_000));
  const main = series(3);
  const ldb = series(3).reverse().map((v) => Math.round(v / 3));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const accounts = [
    { bankAccountId: id(11), daily: main, receivedPrevPeriod: Math.round(sum(main) * 0.85), openSlips: 0, pendingIntents: 1, lastStatementDate: today, unreconciledDays: 0, varianceDays: 0, paidOutPeriod: 1_200_000, paidOutPeriodCount: 2 },
    { bankAccountId: id(12), daily: ldb, receivedPrevPeriod: 0, openSlips: 2, pendingIntents: 0, lastStatementDate: null, unreconciledDays: 3, varianceDays: 1, paidOutPeriod: 0, paidOutPeriodCount: 0 },
  ].map((a) => ({
    ...a,
    receivedToday: a.daily[days - 1] ?? 0,
    receivedTodayCount: (a.daily[days - 1] ?? 0) > 0 ? 1 : 0,
    receivedPeriod: sum(a.daily),
    receivedPeriodCount: a.daily.filter((v) => v > 0).length,
    lastReceivedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  }));
  const tot = <K extends keyof (typeof accounts)[number]>(k: K) => accounts.reduce((s, a) => s + (a[k] as number), 0);
  return {
    days,
    from,
    to: today,
    accounts,
    totals: {
      receivedToday: tot('receivedToday'),
      receivedTodayCount: tot('receivedTodayCount'),
      receivedPeriod: tot('receivedPeriod'),
      receivedPeriodCount: tot('receivedPeriodCount'),
      receivedPrevPeriod: tot('receivedPrevPeriod'),
      paidOutPeriod: tot('paidOutPeriod'),
      openSlips: tot('openSlips'),
      pendingIntents: tot('pendingIntents'),
      unreconciledDays: tot('unreconciledDays'),
      varianceDays: tot('varianceDays'),
      daily: main.map((v, i) => v + (ldb[i] ?? 0)),
    },
    unassigned: { amount: 150_000, count: 1 },
  };
}

const providers: PaymentProviderView[] = [
  { code: 'MOCK_BCEL', nameLo: 'BCEL One (ຈຳລອງ)', nameEn: 'BCEL One (simulated)', mode: 'MOCK', feeRate: 0.01, settlesNet: false, isActive: true, secretConfigured: true, webhookPath: '/api/v1/payments/webhooks/MOCK_BCEL', pendingIntents: 2, lastEventAt: new Date(Date.now() - 3_600_000).toISOString(), recentIssues: 1 },
  { code: 'MANUAL_TRANSFER', nameLo: 'ໂອນເອງ + ສະລິບ', nameEn: 'Manual transfer + slip', mode: 'MOCK', feeRate: 0, settlesNet: false, isActive: false, secretConfigured: false, webhookPath: '/api/v1/payments/webhooks/MANUAL_TRANSFER', pendingIntents: 0, lastEventAt: null, recentIssues: 0 },
];

let settings: SlipSettings = { autoApprove: false, amountTolerance: 0, reviewSlaMinutes: 30, branchSlaMinutes: {}, slaAlertEnabled: true };

/** Drawn transfer-slip screenshot so the review page's image viewer has something real to show in mock mode. */
function slipSvg(amount: string, ref: string, color = '#b91c1c'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><rect width="360" height="640" fill="#f8fafc"/><rect width="360" height="120" fill="${color}"/><text x="24" y="58" font-family="Arial" font-size="24" font-weight="700" fill="#fff">BCEL One</text><text x="24" y="90" font-family="Arial" font-size="15" fill="#fee2e2">Transfer successful</text><circle cx="180" cy="178" r="34" fill="#16a34a"/><path d="M164 178l11 11 22-22" stroke="#fff" stroke-width="6" fill="none"/><text x="180" y="262" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#0f172a">${amount} LAK</text><g font-family="Arial" font-size="14" fill="#475569"><text x="24" y="320">From</text><text x="24" y="370">To</text><text x="24" y="420">Reference</text><text x="24" y="470">Date</text></g><g font-family="Arial" font-size="15" fill="#0f172a" text-anchor="end"><text x="336" y="320">NOY S · 0201xxxx88</text><text x="336" y="370">AURA CLINIC · 0101200001xxxx</text><text x="336" y="420">${ref}</text><text x="336" y="470">20/09/2026 10:42</text></g><rect x="120" y="510" width="120" height="100" fill="#fff" stroke="#e2e8f0"/><path d="M130 520h30v30h-30zM200 520h30v30h-30zM130 570h30v30h-30zM175 560h10v10h-10zM200 575h15v15h-15z" fill="#0f172a"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const baseSlip = {
  paymentId: id(70),
  branchId: BRANCH,
  branchName: 'Vientiane Main',
  uploadedById: id(5),
  uploadedByName: 'Noy',
  imageUrl: 'http://localhost/uploads/slips/a.jpg',
  declaredAmount: null,
  ocrStatus: 'DONE' as const,
  ocrEngine: 'tesseract.js',
  ocrMs: 900,
  qrPayload: null,
  currency: 'LAK',
  senderName: 'NOY S',
  matchScore: 100,
  mismatchFields: [] as PaymentSlipView['mismatchFields'],
  rejectReason: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  paymentTransactionId: null,
  ocrError: null,
  ocrConfidence: 88,
  dateOnly: false,
  uploadedByRole: 'CUSTOMER',
  sizeBytes: 184_000,
  riskSignals: [] as PaymentSlipView['riskSignals'],
  nearDuplicateOfId: null,
  claimedBy: null as PaymentSlipView['claimedBy'],
  infoRequestedAt: null,
  infoRequestNote: null,
  rejectCode: null,
  reversedByName: null,
  reversedAt: null,
  reverseReason: null,
  bankProof: { status: 'NO_STATEMENT', refMatched: false, line: null } as PaymentSlipView['bankProof'],
  reversal: { allowed: false, blockedReason: 'NOT_APPROVED' } as PaymentSlipView['reversal'],
  updatedAt: new Date(Date.now() - 500_000).toISOString(),
  payment: {
    totalAmount: 500000,
    balanceAmount: 500000,
    currency: 'LAK',
    paidAmount: 0,
    depositAmount: 0,
    depositRemaining: 0,
    status: 'PENDING',
    invoiceNo: null,
    appointmentId: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  bankAccount: { id: id(11), accountName: 'Aura Clinic Main', accountNumber: '010120000123456', bankCode: 'BCEL' },
  createdAt: new Date(Date.now() - 600_000).toISOString(),
};

const slipSummary: SlipSummary = {
  open: { needsReview: 1, autoMatched: 1, pending: 0, ocrFailed: 0, duplicates: 0, amount: 950000, oldestAt: new Date(Date.now() - 1_800_000).toISOString(), overSla: 1, risky: 1, infoRequested: 0 },
  today: { approved: 1, approvedAmount: 500000, autoApproved: 0, rejected: 0, uploaded: 2 },
  week: {
    uploaded: 3,
    autoMatchRate: 67,
    medianReviewMinutes: 12,
    mismatch: { amount: 1 },
    byBank: [
      { bankCode: 'BCEL', processed: 12, clean: 9, rate: 75 },
      { bankCode: 'LDB', processed: 4, clean: 2, rate: 50 },
    ],
    rejectCodes: { AMOUNT_SHORT: 2, UNREADABLE: 1 },
    daily: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${String(17 + i).padStart(2, '0')}`, uploaded: i === 6 ? 2 : 1, approved: i === 5 ? 1 : 0, rejected: 0 })),
  },
  slaMinutes: 30,
};

function slipMatches(s: PaymentSlipView, view: string | null, flag: string | null): boolean {
  const byView =
    view === 'action'
      ? ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'].includes(s.verdict)
      : view === 'approved'
        ? s.verdict === 'APPROVED'
        : view === 'rejected'
          ? s.verdict === 'REJECTED' || s.verdict === 'DUPLICATE'
          : true;
  const byFlag =
    !flag ||
    (flag === 'ocrFailed' ? s.ocrStatus === 'FAILED' : flag === 'duplicate' ? s.verdict === 'DUPLICATE' : (s.mismatchFields as string[]).includes(flag));
  return byView && byFlag;
}

export const mockSlips: PaymentSlipView[] = [
  { ...baseSlip, id: id(21), imageUrl: slipSvg('450,000', 'FT260920AB12'), customerName: 'Somchai Vong', riskSignals: ['NEAR_DUPLICATE'], nearDuplicateOfId: id(23), verdict: 'NEEDS_REVIEW', bankCode: 'BCEL', amount: 450000, txnRef: 'FT260920AB12', transferredAt: new Date(Date.now() - 900_000).toISOString(), receiverAccount: '010120000123456', matchScore: 50, mismatchFields: ['amount'] },
  { ...baseSlip, id: id(22), imageUrl: slipSvg('500,000', 'FT260920CD34'), customerName: 'Noy Keo', bankProof: { status: 'FOUND', refMatched: true, line: { id: id(801), statementDate: '2026-09-20', postedAt: null, amount: 500000, reference: 'TRF FT260920CD34', description: 'NOY KEO' } }, verdict: 'AUTO_MATCHED', bankCode: 'BCEL', amount: 500000, txnRef: 'FT260920CD34', transferredAt: new Date(Date.now() - 1_200_000).toISOString(), receiverAccount: '010120000123456', createdAt: new Date(Date.now() - 1_800_000).toISOString() },
  { ...baseSlip, id: id(23), imageUrl: slipSvg('500,000', 'LD0001', '#1d4ed8'), customerName: 'Dara P', reversal: { allowed: true, blockedReason: null }, paymentTransactionId: id(851), verdict: 'APPROVED', bankCode: 'LDB', amount: 500000, txnRef: 'LD0001', transferredAt: new Date(Date.now() - 86_400_000).toISOString(), receiverAccount: '2200998877', reviewedByName: 'Admin', reviewedAt: new Date().toISOString(), createdAt: new Date(Date.now() - 90_000_000).toISOString() },
];

const categories: ExpenseCategoryView[] = [
  { id: id(31), code: 'RENT', nameLo: 'ຄ່າເຊົ່າ', nameEn: 'Rent', kind: 'OPERATING', parentId: null, sortOrder: 10, isActive: true },
  { id: id(32), code: 'UTILITIES', nameLo: 'ໄຟ/ນ້ຳ', nameEn: 'Utilities', kind: 'OPERATING', parentId: null, sortOrder: 20, isActive: true },
  { id: id(33), code: 'STOCK', nameLo: 'ວັດຖຸດິບ', nameEn: 'Stock purchases', kind: 'INVENTORY', parentId: null, sortOrder: 30, isActive: true },
];

const expenseBase = {
  branchId: BRANCH,
  branchName: 'Vientiane Main',
  currency: 'LAK',
  notes: null,
  supplier: null,
  purchaseOrder: null,
  paidFromAccount: null,
  paidReference: null,
  createdBy: { id: id(5), name: 'Manager' },
  approvedBy: null,
  submittedAt: null,
  approvedAt: null,
  rejectedReason: null,
  paidAt: null,
  paidFromCashFund: null,
  allocations: [],
  bankMatch: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  needsOwnerApproval: false,
  fxRate: 1,
  taxAmount: null,
  invoiceNumber: null,
  dueDate: null,
  isOverdue: false,
  recurringExpenseId: null,
  attachments: [],
  createdAt: new Date().toISOString(),
};
const cat = (i: number) => {
  const c = categories[i]!;
  return { id: c.id, code: c.code, nameLo: c.nameLo, nameEn: c.nameEn, kind: c.kind };
};

export const mockExpenses: ExpenseView[] = [
  { ...expenseBase, id: id(41), category: cat(0), status: 'SUBMITTED', title: 'September rent', amount: 8_000_000, amountBase: 8_000_000, expenseDate: '2026-09-01', dueDate: '2026-09-05', isOverdue: true, invoiceNumber: 'INV-0901', needsOwnerApproval: true },
  { ...expenseBase, id: id(42), category: cat(1), status: 'PAID', title: 'Electricity', amount: 1_200_000, amountBase: 1_200_000, expenseDate: '2026-09-05', paidAt: new Date().toISOString(), paidFromAccount: { id: id(11), accountName: 'Aura Clinic Main', accountNumber: '010120000123456', bankCode: 'BCEL' }, bankMatch: { statementDate: '2026-09-06', reference: 'FT0906', description: 'EDL', matchedAt: new Date().toISOString(), auto: true }, allocations: [{ branchId: BRANCH, branchName: 'Vientiane Main', percent: 70, amountBase: 840_000 }, { branchId: id(99), branchName: 'Pakse', percent: 30, amountBase: 360_000 }] },
  { ...expenseBase, id: id(43), category: cat(1), status: 'DRAFT', title: 'Water bill', amount: 300_000, amountBase: 300_000, expenseDate: '2026-09-06' },
];

const summary: ExpenseSummaryView = {
  from: '2026-09-01',
  to: '2026-09-20',
  byStatus: [
    { status: 'SUBMITTED', count: 1, amount: 8_000_000 },
    { status: 'PAID', count: 1, amount: 1_200_000 },
    { status: 'DRAFT', count: 1, amount: 300_000 },
  ],
  byCategory: [{ categoryId: id(32), code: 'UTILITIES', nameLo: 'ໄຟ/ນ້ຳ', nameEn: 'Utilities', kind: 'OPERATING', count: 1, amount: 1_200_000 }],
  byBranch: [{ branchId: BRANCH, branchName: 'Vientiane Main', count: 3, amount: 9_500_000 }],
  byMonth: [{ month: '2026-09', amount: 1_200_000 }],
  recognisedTotal: 1_200_000,
  pendingApproval: { count: 1, amount: 8_000_000 },
  awaitingPayment: { count: 0, amount: 0 },
  byDay: Array.from({ length: 20 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    amount: i === 4 ? 1_200_000 : 0,
  })),
  previous: {
    from: '2026-08-01',
    to: '2026-08-20',
    recognisedTotal: 1_000_000,
    count: 1,
    byDay: Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, amount: i === 3 ? 1_000_000 : 0 })),
  },
  byCurrency: [{ currency: 'LAK', count: 3, amount: 9_500_000 }],
  missingReceipts: { count: 2, amount: 9_200_000 },
  oldestPendingAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  recurring: { count: 0, amount: 0 },
  overdue: { count: 1, amount: 8_000_000 },
  bankPaid: { count: 1, amount: 1_200_000, matched: 1 },
  cashPaid: { count: 0, amount: 0 },
  dueSoon: { count: 0, amount: 0 },
  budget: { months: ['2026-09'], total: 2_000_000, byCategory: [{ categoryId: id(32), budget: 1_000_000, actual: 1_200_000 }, { categoryId: id(31), budget: 1_000_000, actual: 0 }] },
  topSuppliers: [],
  largest: [{ id: id(42), title: 'Electricity', amount: 1_200_000, currency: 'LAK', expenseDate: '2026-09-05', categoryId: id(32) }],
};

const pnl: ProfitLossView = {
  from: '2026-09',
  to: '2026-09',
  branchId: null,
  revenue: 20_000_000,
  refunds: 500_000,
  netRevenue: 19_500_000,
  cogs: 2_000_000,
  grossProfit: 17_500_000,
  labour: { commissionAndBonus: 3_000_000, otherPayroll: 0, total: 3_000_000 },
  operating: { total: 1_200_000, byCategory: [{ code: 'UTILITIES', nameLo: 'ໄຟ/ນ້ຳ', nameEn: 'Utilities', amount: 1_200_000 }] },
  inventoryPurchasesMemo: 0,
  netProfit: 13_300_000,
  netMargin: 0.682,
  months: [],
};

const rowBase = {
  branchId: BRANCH,
  branchName: 'Vientiane Main',
  currency: 'LAK',
  systemFee: 0,
  openingBalance: null,
  closingBalance: null,
  balanceGap: null,
  openingGap: null,
  source: 'MANUAL' as const,
  resolution: null,
  resolutionNote: null,
  resolvedByName: null,
  resolvedAt: null,
  lineCount: 0,
  unmatchedLines: 0,
  locked: false,
};
const bcelAcct = { bankAccountId: id(11), accountName: 'Aura Clinic Main', accountNumber: '010120000123456', bankCode: 'BCEL' };
const ldbAcct = { bankAccountId: id(12), accountName: 'Aura Clinic LDB', accountNumber: '2200998877', bankCode: 'LDB' };

const reconRows: ReconciliationRow[] = [
  { ...rowBase, ...bcelAcct, date: '2026-09-20', systemCredit: 1_000_000, expectedCredit: 1_000_000, systemCreditCount: 2, systemDebit: 0, systemDebitCount: 0, statementId: null, statementCredit: null, statementDebit: null, note: null, creditVariance: null, debitVariance: null, status: 'UNRECONCILED', enteredByName: null, enteredAt: null },
  { ...rowBase, ...bcelAcct, date: '2026-09-19', systemCredit: 800_000, expectedCredit: 800_000, systemCreditCount: 1, systemDebit: 0, systemDebitCount: 0, statementId: id(51), statementCredit: 850_000, statementDebit: 0, note: null, creditVariance: 50_000, debitVariance: 0, status: 'VARIANCE', enteredByName: 'Owner', enteredAt: '2026-09-20T02:00:00.000Z', source: 'IMPORT', openingBalance: 1_000_000, closingBalance: 1_850_000, balanceGap: 0, lineCount: 2, unmatchedLines: 1 },
  { ...rowBase, ...ldbAcct, date: '2026-09-18', systemCredit: 500_000, expectedCredit: 500_000, systemCreditCount: 1, systemDebit: 100_000, systemDebitCount: 1, statementId: id(52), statementCredit: 500_000, statementDebit: 100_000, note: null, creditVariance: 0, debitVariance: 0, status: 'MATCHED', enteredByName: 'Owner', enteredAt: '2026-09-19T02:00:00.000Z' },
  { ...rowBase, ...ldbAcct, date: '2026-09-17', systemCredit: 300_000, expectedCredit: 297_000, systemFee: 3_000, systemCreditCount: 1, systemDebit: 0, systemDebitCount: 0, statementId: id(53), statementCredit: 292_000, statementDebit: 0, note: 'fee', creditVariance: -5_000, debitVariance: 0, status: 'RESOLVED', enteredByName: 'Manager', enteredAt: '2026-09-18T02:00:00.000Z', resolution: 'BANK_FEE', resolutionNote: 'Monthly SMS fee', resolvedByName: 'Owner', resolvedAt: '2026-09-18T03:00:00.000Z' },
];
const totals = (rows: ReconciliationRow[]) => ({
  systemCredit: rows.reduce((n, r) => n + r.systemCredit, 0),
  systemDebit: rows.reduce((n, r) => n + r.systemDebit, 0),
  systemFee: rows.reduce((n, r) => n + r.systemFee, 0),
  statementCredit: rows.reduce((n, r) => n + (r.statementCredit ?? 0), 0),
  statementDebit: rows.reduce((n, r) => n + (r.statementDebit ?? 0), 0),
  matched: rows.filter((r) => r.status === 'MATCHED').length,
  variance: rows.filter((r) => r.status === 'VARIANCE').length,
  resolved: rows.filter((r) => r.status === 'RESOLVED').length,
  unreconciled: rows.filter((r) => r.status === 'UNRECONCILED').length,
});

const recon: ReconciliationView = {
  from: '2026-09-01',
  to: '2026-09-20',
  rows: reconRows,
  totals: totals(reconRows),
  totalsByCurrency: { LAK: totals(reconRows) },
  periods: [],
  openSlips: 2,
  issues: [{ id: id(61), providerCode: 'MOCK_BCEL', eventId: 'evt-1', result: 'AMOUNT_MISMATCH', amount: 90_000, reference: 'MOCK_BCEL_x', createdAt: new Date().toISOString() }],
  accounts: [
    { ...bcelAcct, branchId: BRANCH, branchName: 'Vientiane Main', currency: 'LAK', isActive: true, isDefault: true, lastStatementDate: '2026-09-19' },
    { ...ldbAcct, branchId: BRANCH, branchName: 'Vientiane Main', currency: 'LAK', isActive: true, isDefault: false, lastStatementDate: '2026-09-18' },
  ],
};

function reconDay(bankAccountId: string, date: string): ReconciliationDayDetail {
  const base = recon.rows.find((r) => r.bankAccountId === bankAccountId && r.date === date);
  const acct = recon.accounts.find((a) => a.bankAccountId === bankAccountId) ?? recon.accounts[0]!;
  const row: ReconciliationRow = base ?? {
    ...rowBase,
    bankAccountId: acct.bankAccountId,
    accountName: acct.accountName,
    accountNumber: acct.accountNumber,
    bankCode: acct.bankCode,
    date,
    systemCredit: 0,
    expectedCredit: 0,
    systemCreditCount: 0,
    systemDebit: 0,
    systemDebitCount: 0,
    statementId: null,
    statementCredit: null,
    statementDebit: null,
    note: null,
    creditVariance: null,
    debitVariance: null,
    status: 'UNRECONCILED',
    enteredByName: null,
    enteredAt: null,
  };
  const n = row.systemCreditCount;
  const credits = Array.from({ length: n }, (_, i) => ({
    id: id(700 + i),
    fee: row.systemFee / Math.max(1, n),
    providerCode: null,
    matchedLineId: row.lineCount && i === 0 ? id(950) : null,
    at: `${date}T0${3 + i}:15:00.000Z`,
    amount: row.systemCredit / n,
    method: i % 2 ? 'BANK_QR' : 'BANK_TRANSFER',
    reference: `TXN-${date.replace(/-/g, '')}-${i + 1}`,
    paymentId: id(800 + i),
    appointmentId: id(900 + i),
    customerName: ['Somchai K.', 'Noy P.'][i % 2]!,
    serviceName: 'Facial Deluxe',
    slipId: i === 0 ? id(31) : null,
  }));
  return {
    row,
    credits,
    debits: row.systemDebitCount
      ? [{ id: id(760), kind: 'EXPENSE' as const, matchedLineId: null, at: `${date}T06:00:00.000Z`, amount: row.systemDebit, title: 'Laundry service', categoryLo: 'ບໍລິການ', categoryEn: 'Services', supplierName: 'Clean Co.', reference: 'EXP-1' }]
      : [],
    lines: row.lineCount
      ? [
          { id: id(950), seq: 1, postedAt: `${date}T03:16:00.000Z`, direction: 'CREDIT' as const, amount: 800_000, balance: 1_800_000, description: 'Transfer Somchai', reference: `TXN-${date.replace(/-/g, '')}-1`, matchStatus: 'MATCHED' as const, matchedKind: 'TX' as const, matchedId: id(700), autoMatched: true },
          { id: id(951), seq: 2, postedAt: `${date}T08:00:00.000Z`, direction: 'CREDIT' as const, amount: 50_000, balance: 1_850_000, description: 'Transfer Kham S.', reference: 'BCEL123', matchStatus: 'UNMATCHED' as const, matchedKind: null, matchedId: null, autoMatched: false },
        ]
      : [],
    slips: base?.status === 'VARIANCE'
      ? [{ id: id(32), verdict: 'NEEDS_REVIEW', amount: 50_000, declaredAmount: null, txnRef: 'BCEL123', senderName: 'Kham S.', transferredAt: `${date}T08:00:00.000Z`, createdAt: `${date}T08:05:00.000Z`, paymentId: id(801) }]
      : [],
  };
}

let reconSettings = { reminderEnabled: true, varianceAlertThreshold: 100_000 };

const drawerBase = {
  branchId: BRANCH,
  branchName: 'Vientiane Main',
  currency: 'LAK',
  openingNote: null,
  denominations: null,
  closingNote: null,
  movements: [] as CashDrawerSessionView['movements'],
};
const openDrawer: CashDrawerSessionView = {
  ...drawerBase,
  id: id(1101),
  status: 'OPEN',
  openedAt: '2026-09-21T01:00:00.000Z',
  openedByName: 'Manager',
  openingFloat: 500_000,
  closedAt: null,
  closedByName: null,
  cashSales: 1_250_000,
  cashSalesCount: 7,
  cashRefunds: 50_000,
  payIns: 0,
  drops: 1_000_000,
  payouts: 0,
  expectedAmount: 700_000,
  countedAmount: null,
  variance: null,
  movements: [{ id: id(1111), type: 'DROP', amount: 1_000_000, note: 'Bank deposit', createdByName: 'Manager', createdAt: '2026-09-21T06:00:00.000Z' }],
};
const closedDrawer: CashDrawerSessionView = {
  ...drawerBase,
  id: id(1102),
  status: 'CLOSED',
  openedAt: '2026-09-20T01:00:00.000Z',
  openedByName: 'Manager',
  openingFloat: 500_000,
  closedAt: '2026-09-20T12:00:00.000Z',
  closedByName: 'Owner',
  cashSales: 900_000,
  cashSalesCount: 5,
  cashRefunds: 0,
  payIns: 0,
  drops: 800_000,
  payouts: 0,
  expectedAmount: 600_000,
  countedAmount: 590_000,
  variance: -10_000,
  closingNote: 'Change given twice',
};


export const paymentsTreasuryHandlers = [
  http.get(api('/payments-treasury/banks'), () => ok([{ ...bcel, logoUrl: null, isActive: true }, { ...ldb, logoUrl: null, isActive: true }])),
  http.get(api('/payments-treasury/bank-accounts/insights'), ({ request }) =>
    ok(mockInsights(Number(new URL(request.url).searchParams.get('days')) || 30)),
  ),
  http.get(api('/payments-treasury/bank-accounts'), () => ok(mockBankAccounts)),
  http.get(api('/payments-treasury/bank-account-changes'), () => ok(mockChanges)),
  http.post(api('/payments-treasury/bank-account-changes/:id/approve'), ({ params }) =>
    ok({ ...mockChanges.find((c) => c.id === params.id)!, status: 'APPROVED', reviewedByName: 'Admin', reviewedAt: new Date().toISOString() }),
  ),
  http.post(api('/payments-treasury/bank-account-changes/:id/reject'), ({ params }) =>
    ok({ ...mockChanges.find((c) => c.id === params.id)!, status: 'REJECTED' }),
  ),
  http.post(api('/payments-treasury/bank-account-changes/:id/cancel'), ({ params }) =>
    ok({ ...mockChanges.find((c) => c.id === params.id)!, status: 'CANCELLED' }),
  ),
  http.get(api('/payments-treasury/unassigned-transfers'), () => ok(mockUnassigned)),
  http.patch(api('/payments-treasury/transactions/:id/bank-account'), () => new Response(null, { status: 204 })),
  http.get(api('/payments-treasury/payments/:id/bank-accounts'), () =>
    ok(mockBankAccounts.map(({ id: aid, accountName, accountNumber, currency, isDefault, qrImageUrl, bank }) => ({ id: aid, accountName, accountNumber, currency, isDefault, qrImageUrl, bank }))),
  ),
  http.post(api('/payments-treasury/bank-accounts'), async ({ request }) => ok({ ...mockBankAccounts[0], ...((await request.json()) as object), id: crypto.randomUUID() }, { status: 201 })),
  http.patch(api('/payments-treasury/bank-accounts/:id'), async ({ params, request }) => ok({ ...mockBankAccounts[0], ...((await request.json()) as object), id: params.id })),
  http.delete(api('/payments-treasury/bank-accounts/:id'), () => new Response(null, { status: 204 })),
  http.post(api('/payments-treasury/bank-accounts/:id/qr'), ({ params }) => ok({ ...mockBankAccounts[0], id: params.id, qrImageUrl: 'http://localhost/uploads/bank-qr/new.jpg' })),
  http.get(api('/payments-treasury/providers'), () => ok(providers)),
  http.patch(api('/payments-treasury/providers/:code'), async ({ params, request }) => ok({ ...providers.find((p) => p.code === params.code)!, ...((await request.json()) as object) })),
  http.get(api('/payments-treasury/settings'), () => ok(settings)),
  http.put(api('/payments-treasury/settings'), async ({ request }) => {
    settings = { ...settings, ...((await request.json()) as Partial<SlipSettings>) };
    return ok(settings);
  }),
  http.get(api('/payments-treasury/slips'), ({ request }) => {
    const u = new URL(request.url);
    return paginated(mockSlips.filter((s) => slipMatches(s, u.searchParams.get('view'), u.searchParams.get('flag'))), 1, 100);
  }),
  http.get(api('/payments-treasury/slips/summary'), () => ok(slipSummary)),
  http.post(api('/payments-treasury/slips/bulk-approve'), async ({ request }) => {
    const { ids } = (await request.json()) as { ids: string[] };
    return ok({ approved: ids, failed: [] });
  }),
  http.post(api('/payments-treasury/slips/:id/reprocess'), ({ params }) => {
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    return ok({ ...slip, verdict: 'PENDING', ocrStatus: 'PENDING', mismatchFields: [], matchScore: 0 });
  }),
  http.get(api('/payments-treasury/slips/export'), () =>
    new HttpResponse('\uFEFFuploaded_at,txn_ref\n', { headers: { 'Content-Type': 'text/csv' } }),
  ),
  http.get(api('/payments-treasury/slips/:id'), ({ params }) => {
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    const near = slip.nearDuplicateOfId ? mockSlips.find((s) => s.id === slip.nearDuplicateOfId) : undefined;
    return ok({
      ...slip,
      ocrText: 'BCEL One\nTransfer Successful',
      duplicateOf: null,
      nearDuplicateOf: near
        ? { id: near.id, verdict: near.verdict, amount: near.amount, txnRef: near.txnRef, customerName: near.customerName, paymentId: near.paymentId, createdAt: near.createdAt }
        : null,
      siblings: [],
    });
  }),
  http.post(api('/payments-treasury/slips/:id/claim'), ({ params }) => {
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    return ok(slip);
  }),
  http.delete(api('/payments-treasury/slips/:id/claim'), () => new HttpResponse(null, { status: 204 })),
  http.post(api('/payments-treasury/slips/:id/request-info'), async ({ params, request }) => {
    const { message } = (await request.json()) as { message: string };
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    return ok({ slip: { ...slip, infoRequestedAt: new Date().toISOString(), infoRequestNote: message }, viaChat: false });
  }),
  http.post(api('/payments-treasury/slips/:id/reverse'), async ({ params, request }) => {
    const { reason } = (await request.json()) as { reason: string };
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    return ok({ ...slip, verdict: 'REVERSED', reverseReason: reason, reversedByName: 'Admin', reversedAt: new Date().toISOString() });
  }),
  http.post(api('/payments-treasury/payments/:id/slips'), ({ params }) =>
    ok({ ...mockSlips[1]!, id: id(29), paymentId: String(params.id), verdict: 'PENDING', ocrStatus: 'PENDING', uploadedByRole: 'BRANCH_ADMIN' }, { status: 201 }),
  ),
  http.post(api('/payments-treasury/slips/:id/review'), async ({ params, request }) => {
    const body = (await request.json()) as { action: 'APPROVE' | 'REJECT'; note?: string };
    const slip = mockSlips.find((s) => s.id === params.id) ?? mockSlips[0]!;
    return ok({ ...slip, verdict: body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', rejectReason: body.note ?? null });
  }),
  http.get(api('/payments-treasury/cash-drawer/current'), () => ok(openDrawer)),
  http.get(api('/payments-treasury/cash-drawer/sessions'), () => ok([openDrawer, closedDrawer])),
  http.post(api('/payments-treasury/cash-drawer/sessions'), () => ok(openDrawer, { status: 201 })),
  http.post(api('/payments-treasury/cash-drawer/sessions/:id/movements'), () => ok(openDrawer)),
  http.post(api('/payments-treasury/cash-drawer/sessions/:id/close'), async ({ request }) => {
    const b = (await request.json()) as { denominations?: Record<string, number>; note?: string };
    const counted = Object.entries(b.denominations ?? {}).reduce((n, [k, q]) => n + Number(k) * q, 0);
    return ok({ ...openDrawer, status: 'CLOSED', countedAmount: counted, variance: counted - openDrawer.expectedAmount, closingNote: b.note ?? null });
  }),
  http.get(api('/payments-treasury/reconciliation/day'), ({ request }) => {
    const u = new URL(request.url);
    return ok(reconDay(u.searchParams.get('bankAccountId') ?? id(11), u.searchParams.get('date') ?? '2026-09-20'));
  }),
  http.get(api('/payments-treasury/reconciliation/settings'), () => ok(reconSettings)),
  http.put(api('/payments-treasury/reconciliation/settings'), async ({ request }) => {
    reconSettings = { ...reconSettings, ...((await request.json()) as object) };
    return ok(reconSettings);
  }),
  http.get(api('/payments-treasury/reconciliation/periods/readiness'), ({ request }) => {
    const u = new URL(request.url);
    return ok({ branchId: u.searchParams.get('branchId'), month: u.searchParams.get('month'), closed: false, unreconciled: 1, unresolvedVariance: 1, unmatchedLines: 1, balanceBreaks: 0, canClose: false, monthOpen: false });
  }),
  http.get(api('/payments-treasury/reconciliation/periods'), () =>
    ok([{ id: id(990), branchId: BRANCH, branchName: 'Vientiane Main', month: '2026-08', closedAt: '2026-09-02T03:00:00.000Z', closedByName: 'Owner', note: null, summary: { days: 22 } }]),
  ),
  http.post(api('/payments-treasury/reconciliation/periods'), () => new Response(JSON.stringify({ error: { message: 'not ready' } }), { status: 409 })),
  http.delete(api('/payments-treasury/reconciliation/periods/:id'), () => new Response(null, { status: 204 })),
  http.get(api('/payments-treasury/reconciliation/imports'), () => ok([])),
  http.post(api('/payments-treasury/reconciliation/imports'), async ({ request }) => {
    const b = (await request.json()) as { dryRun?: boolean };
    if (b.dryRun === false) return ok({ importId: id(980), inserted: 2, duplicates: 0, days: 1, matched: 1, unmatched: 1 });
    return ok({
      mapping: { date: 0, time: null, description: 1, reference: 2, credit: 3, debit: null, amount: null, balance: 4, dateFormat: 'DMY', hasHeader: true, headerRow: 0 },
      detected: true,
      headers: ['Date', 'Description', 'Reference', 'Credit', 'Balance'],
      sampleRows: [['19/09/2026', 'Transfer', 'BCEL123', '50,000', '1,850,000']],
      lines: [{ row: 2, date: '2026-09-19', postedAt: null, direction: 'CREDIT', amount: 50_000, balance: 1_850_000, description: 'Transfer', reference: 'BCEL123' }],
      count: 2,
      creditTotal: 850_000,
      debitTotal: 0,
      fromDate: '2026-09-19',
      toDate: '2026-09-19',
      errors: [],
      duplicates: 0,
      lockedDates: [],
    });
  }),
  http.get(api('/payments-treasury/reconciliation/lines/:id/candidates'), () =>
    ok([{ kind: 'TX', id: id(701), amount: 50_000, netAmount: 50_000, at: '2026-09-19T08:00:00.000Z', date: '2026-09-19', reference: 'BCEL123', amountDiff: 0, sameDay: true }]),
  ),
  http.post(api('/payments-treasury/reconciliation/lines/:id/:action'), () => new Response(null, { status: 204 })),
  http.post(api('/payments-treasury/reconciliation/rematch'), () => ok({ matched: 0 })),
  http.post(api('/payments-treasury/reconciliation/statements/resolve-bulk'), () => ok({ resolved: 2 })),
  http.post(api('/payments-treasury/reconciliation/statements/:id/resolve'), async ({ request }) => {
    const b = (await request.json()) as { resolution: string; note?: string };
    return ok({ ...reconRows[1]!, status: 'RESOLVED', resolution: b.resolution, resolutionNote: b.note ?? null, resolvedByName: 'Owner' });
  }),
  http.delete(api('/payments-treasury/reconciliation/statements/:id/resolve'), () => ok(reconRows[3]!)),
  http.get(api('/payments-treasury/reconciliation/statements/:id/history'), () =>
    ok([
      { id: id(970), action: 'UPDATE', at: '2026-09-20T02:00:00.000Z', userName: 'Owner', oldValue: { credit: 800_000, debit: 0 }, newValue: { credit: 850_000, debit: 0 } },
      { id: id(971), action: 'CREATE', at: '2026-09-19T02:00:00.000Z', userName: 'Owner', oldValue: null, newValue: { credit: 800_000, debit: 0 } },
    ]),
  ),
  http.get(api('/payments-treasury/reconciliation'), () => ok(recon)),
  http.put(api('/payments-treasury/reconciliation/statements'), async ({ request }) => {
    const b = (await request.json()) as { statementCredit: number; statementDebit: number };
    return ok({ ...recon.rows[0]!, statementCredit: b.statementCredit, statementDebit: b.statementDebit, status: 'VARIANCE' });
  }),
  http.delete(api('/payments-treasury/reconciliation/statements/:id'), () => new Response(null, { status: 204 })),

  // ---- expenses (specific paths before /:id) ----
  http.get(api('/expenses/cash-funds'), () =>
    ok([
      { id: id(61), branchId: BRANCH, branchName: 'Vientiane Main', name: 'Front desk', currency: 'LAK', floatAmount: 2_000_000, isActive: true, balance: 350_000, spent30d: 1_650_000, lastCount: { at: new Date(Date.now() - 3 * 86_400_000).toISOString(), counted: 500_000, difference: -20_000, by: 'Manager' } },
    ]),
  ),
  http.get(api('/expenses/cash-funds/:id/entries'), () =>
    ok([
      { id: id(71), type: 'EXPENSE', amount: -150_000, countedAmount: null, balanceAfter: 350_000, expense: { id: id(43), title: 'Water bill' }, note: null, createdBy: 'Manager', createdAt: new Date().toISOString() },
      { id: id(72), type: 'TOPUP', amount: 2_000_000, countedAmount: null, balanceAfter: 500_000, expense: null, note: 'Opening', createdBy: 'Admin', createdAt: new Date(Date.now() - 86_400_000).toISOString() },
    ]),
  ),
  http.post(api('/expenses/cash-funds/:id/movements'), () => ok({ id: id(61), branchId: BRANCH, branchName: 'Vientiane Main', name: 'Front desk', currency: 'LAK', floatAmount: 2_000_000, isActive: true, balance: 2_000_000, spent30d: 0, lastCount: null })),
  http.post(api('/expenses/cash-funds/:id/count'), () => ok({ id: id(61), branchId: BRANCH, branchName: 'Vientiane Main', name: 'Front desk', currency: 'LAK', floatAmount: 2_000_000, isActive: true, balance: 340_000, spent30d: 0, lastCount: { at: new Date().toISOString(), counted: 340_000, difference: -10_000, by: 'Admin' } })),
  http.post(api('/expenses/receipt-scan'), () =>
    ok({ total: 150_000, taxAmount: 13_636, currency: 'LAK', date: '2026-09-12', invoiceNumber: 'INV-20488', vendor: 'SAKURA SUPPLY CO', confidence: 88, engine: 'tesseract.js', ms: 900, preview: [], duplicateOf: null }),
  ),
  http.get(api('/expenses/settings'), () => ok({ approvalLimit: 5_000_000, rates: [{ currency: 'THB', rate: 600, updatedAt: new Date().toISOString() }, { currency: 'USD', rate: 21_500, updatedAt: new Date().toISOString() }] })),
  http.put(api('/expenses/settings'), async ({ request }) => ok({ approvalLimit: null, rates: [], ...((await request.json()) as object) })),
  http.get(api('/expenses/budgets'), ({ request }) => {
    const u = new URL(request.url);
    return ok({ branchId: u.searchParams.get('branchId'), month: u.searchParams.get('month'), items: [{ categoryId: id(32), amount: 1_000_000 }], actual: [{ categoryId: id(32), amount: 1_200_000 }], previousActual: [{ categoryId: id(32), amount: 900_000 }] });
  }),
  http.put(api('/expenses/budgets'), async ({ request }) => {
    const b = (await request.json()) as { branchId: string; month: string; items: { categoryId: string; amount: number }[] };
    return ok({ branchId: b.branchId, month: b.month, items: b.items.filter((i) => i.amount > 0), actual: [], previousActual: [] });
  }),
  http.get(api('/expenses/status-counts'), () => ok({ DRAFT: 1, SUBMITTED: 1, APPROVED: 0, REJECTED: 0, PAID: 1, VOIDED: 0 })),
  http.get(api('/expenses/:id/history'), () =>
    ok([
      { id: id(90), action: 'CREATE', at: new Date(Date.now() - 86_400_000).toISOString(), user: { id: id(5), name: 'Manager' }, changes: [], note: null },
      { id: id(91), action: 'UPDATE', at: new Date(Date.now() - 80_000_000).toISOString(), user: { id: id(5), name: 'Manager' }, changes: [{ field: 'amount', from: 7_500_000, to: 8_000_000 }], note: null },
      { id: id(92), action: 'SUBMIT', at: new Date().toISOString(), user: { id: id(5), name: 'Manager' }, changes: [], note: null },
    ]),
  ),
  http.get(api('/expenses/categories'), () => ok(categories)),
  http.post(api('/expenses/categories'), async ({ request }) => ok({ ...categories[0]!, ...((await request.json()) as object), id: crypto.randomUUID() }, { status: 201 })),
  http.patch(api('/expenses/categories/:id'), async ({ params, request }) => ok({ ...categories[0]!, ...((await request.json()) as object), id: params.id })),
  http.get(api('/expenses/summary'), () => ok(summary)),
  http.get(api('/expenses/profit-loss'), () => ok(pnl)),
  http.get(api('/expenses/recurring'), () => ok([])),
  http.post(api('/expenses/recurring'), async ({ request }) => ok({ id: crypto.randomUUID(), ...((await request.json()) as object) }, { status: 201 })),
  http.patch(api('/expenses/recurring/:id'), async ({ params, request }) => ok({ id: params.id, ...((await request.json()) as object) })),
  http.get(api('/expenses'), () => paginated(mockExpenses, 1, 20)),
  http.post(api('/expenses'), async ({ request }) => ok({ ...mockExpenses[2]!, ...((await request.json()) as object), id: crypto.randomUUID() }, { status: 201 })),
  http.get(api('/expenses/:id'), ({ params }) => ok(mockExpenses.find((e) => e.id === params.id) ?? mockExpenses[0]!)),
  http.patch(api('/expenses/:id'), async ({ params, request }) => ok({ ...(mockExpenses.find((e) => e.id === params.id) ?? mockExpenses[0]!), ...((await request.json()) as object) })),
  http.delete(api('/expenses/:id'), () => new Response(null, { status: 204 })),
  http.post(api('/expenses/bulk'), async ({ request }) => {
    const body = (await request.json()) as { ids: string[] };
    return ok({ succeeded: body.ids, failed: [] });
  }),
  http.post(api('/expenses/:id/:action'), ({ params }) => ok(mockExpenses.find((e) => e.id === params.id) ?? mockExpenses[0]!)),
];
