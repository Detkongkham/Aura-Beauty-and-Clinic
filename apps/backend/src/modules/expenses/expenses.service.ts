import { createHash, randomUUID } from 'node:crypto';
import type {
  AccessTokenPayload,
  BulkExpenseActionInput,
  BulkExpenseActionResult,
  CashFundCountInput,
  CashFundEntryView,
  CashFundMovementInput,
  CashFundView,
  CreateCashFundInput,
  UpdateCashFundInput,
  ExpenseBudgetQuery,
  ExpenseBudgetView,
  ExpenseHistoryEntry,
  ExpenseSettingsView,
  ExpenseStatusCounts,
  ExpenseStatusCountsQuery,
  UpdateExpenseSettingsInput,
  UpsertExpenseBudgetsInput,
  VoidExpenseInput,
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreateRecurringExpenseInput,
  ExpenseAttachmentView,
  ExpenseCategoryView,
  ExpenseListQuery,
  ExpenseStatus,
  ExpenseSummaryQuery,
  ExpenseSummaryView,
  ExpenseView,
  Paginated,
  PayExpenseInput,
  ProfitLossMonth,
  ProfitLossQuery,
  ProfitLossView,
  RecurringExpenseListQuery,
  RecurringExpenseView,
  RejectExpenseInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
  UpdateRecurringExpenseInput,
  UploadExpenseAttachmentInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { storage } from '../../storage/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import { dec, toNum } from '../../utils/money.js';
import { getPayrollReport } from '../payroll/payroll.service.js';
import { notifyUser } from '../../services/push.js';
import { logger } from '../../config/logger.js';
import { assertNotLocked } from '../payments-treasury/reconciliation/recon.util.js';

const RECOGNISED: ExpenseStatus[] = ['APPROVED', 'PAID'];
const EXPENSE_STATUSES_ALL: ExpenseStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'VOIDED'];
/** ສະຖານະທີ່ຄວນມີໃບຮັບເງິນແນບແລ້ວ (ສົ່ງອະນຸມັດໄປແລ້ວ). */
const RECEIPT_REQUIRED: ExpenseStatus[] = ['SUBMITTED', 'APPROVED', 'PAID'];
const MAX_TREND_DAYS = 400;
/** ຍັງຄ້າງຈ່າຍ (ມີຄວາມໝາຍກັບວັນຄົບກຳນົດ). */
const OPEN_PAYABLE: ExpenseStatus[] = ['SUBMITTED', 'APPROVED'];
const APPROVAL_LIMIT_KEY = 'expenses.approvalLimit';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_EXPENSE = 10;
const MAX_PNL_MONTHS = 24;
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// ── helpers ──────────────────────────────────────────────────────────

/** BRANCH_ADMIN ເຫັນ/ແກ້ໄຂໄດ້ສະເພາະສາຂາຂອງຕົນ; SUPER_ADMIN ເລືອກໄດ້ (ຫຼືເບິ່ງໝົດ). */
function scopeBranchId(auth: AccessTokenPayload, requested?: string | null): string | undefined {
  if (auth.role === 'BRANCH_ADMIN') {
    if (!auth.branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາໃດ');
    if (requested && requested !== auth.branchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
    return auth.branchId;
  }
  return requested ?? undefined;
}

/** `YYYY-MM-DD` → Date ທີ່ UTC-midnight (ຮູບແບບຂອງ column `@db.Date`). */
function dateKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(y: number, m0: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}`;
}

/** ເດືອນປັດຈຸບັນຕາມເວລາວຽງຈັນ. */
function currentMonthVte(): { y: number; m0: number } {
  const k = vientianeDateKey(new Date());
  return { y: k.getUTCFullYear(), m0: k.getUTCMonth() };
}

/** ລາຍຊື່ເດືອນ [from..to] (ລວມທັງສອງ). */
function monthsBetween(from: string, to: string): { y: number; m0: number; label: string }[] {
  const out: { y: number; m0: number; label: string }[] = [];
  let y = Number(from.slice(0, 4));
  let m0 = Number(from.slice(5, 7)) - 1;
  const endY = Number(to.slice(0, 4));
  const endM0 = Number(to.slice(5, 7)) - 1;
  while (y < endY || (y === endY && m0 <= endM0)) {
    out.push({ y, m0, label: monthLabel(y, m0) });
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      y += 1;
    }
  }
  return out;
}

function auditExpense(
  auth: AccessTokenPayload,
  action: string,
  branchId: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
  entityName = 'Expense',
) {
  return prisma.auditLog.create({
    data: {
      branchId,
      userId: auth.sub,
      action,
      entityName,
      entityId,
      oldValue: (oldValue ?? undefined) as never,
      newValue: (newValue ?? undefined) as never,
    },
  });
}

const EXPENSE_INCLUDE = {
  branch: { select: { name: true } },
  category: { select: { id: true, code: true, nameLo: true, nameEn: true, kind: true } },
  supplier: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
  paidFromAccount: {
    select: { id: true, accountName: true, accountNumber: true, bank: { select: { code: true } } },
  },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  paidFromCashFund: { select: { id: true, name: true } },
  allocations: { include: { branch: { select: { name: true } } }, orderBy: { percent: 'desc' as const } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

function toAttachmentView(a: ExpenseRow['attachments'][number]): ExpenseAttachmentView {
  return {
    id: a.id,
    url: a.url,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    imageHash: a.imageHash,
    createdAt: a.createdAt.toISOString(),
  };
}

type BankMatchRow = { statementDate: Date; reference: string | null; description: string | null; matchedAt: Date | null; matchedById: string | null };

function toView(e: ExpenseRow, approvalLimit: number | null = null, match: BankMatchRow | null = null): ExpenseView {
  const today = dateToKey(vientianeDateKey(new Date()));
  const due = e.dueDate ? dateToKey(e.dueDate) : null;
  const base = toNum(e.amountBase);
  return {
    id: e.id,
    branchId: e.branchId,
    branchName: e.branch.name,
    category: e.category,
    status: e.status,
    title: e.title,
    amount: toNum(e.amount),
    currency: e.currency,
    fxRate: toNum(e.fxRate),
    amountBase: base,
    taxAmount: e.taxAmount == null ? null : toNum(e.taxAmount),
    invoiceNumber: e.invoiceNumber,
    dueDate: due,
    isOverdue: Boolean(due && due < today && (e.status === 'SUBMITTED' || e.status === 'APPROVED')),
    expenseDate: dateToKey(e.expenseDate),
    notes: e.notes,
    supplier: e.supplier,
    purchaseOrder: e.purchaseOrder,
    paidFromAccount: e.paidFromAccount
      ? {
          id: e.paidFromAccount.id,
          accountName: e.paidFromAccount.accountName,
          accountNumber: e.paidFromAccount.accountNumber,
          bankCode: e.paidFromAccount.bank.code,
        }
      : null,
    paidReference: e.paidReference,
    paidFromCashFund: e.paidFromCashFund,
    allocations: e.allocations.map((a) => ({
      branchId: a.branchId,
      branchName: a.branch.name,
      percent: toNum(a.percent),
      amountBase: toNum(a.amountBase),
    })),
    bankMatch: match
      ? {
          statementDate: dateToKey(match.statementDate),
          reference: match.reference,
          description: match.description,
          matchedAt: match.matchedAt?.toISOString() ?? null,
          auto: match.matchedById == null,
        }
      : null,
    createdBy: e.createdBy,
    approvedBy: e.approvedBy,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    rejectedReason: e.rejectedReason,
    paidAt: e.paidAt?.toISOString() ?? null,
    voidedAt: e.voidedAt?.toISOString() ?? null,
    voidedBy: e.voidedBy,
    voidReason: e.voidReason,
    needsOwnerApproval: approvalLimit != null && base > approvalLimit,
    recurringExpenseId: e.recurringExpenseId,
    attachments: e.attachments.map(toAttachmentView),
    createdAt: e.createdAt.toISOString(),
  };
}

async function loadExpense(auth: AccessTokenPayload, id: string): Promise<ExpenseRow> {
  const row = await prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍຈ່າຍ');
  scopeBranchId(auth, row.branchId);
  return row;
}

async function assertActiveCategory(categoryId: string): Promise<void> {
  const cat = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!cat) throw ApiError.notFound('ບໍ່ພົບໝວດລາຍຈ່າຍ');
  if (!cat.isActive) throw ApiError.badRequest('ໝວດລາຍຈ່າຍນີ້ຖືກປິດໃຊ້ງານແລ້ວ');
}

async function assertLinks(
  branchId: string,
  supplierId?: string | null,
  purchaseOrderId?: string | null,
): Promise<void> {
  if (supplierId) {
    const s = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!s) throw ApiError.notFound('ບໍ່ພົບຜູ້ຂາຍ');
  }
  if (purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
    if (po.branchId !== branchId) throw ApiError.badRequest('ໃບສັ່ງຊື້ຕ້ອງເປັນຂອງສາຂາດຽວກັນ');
  }
}

/**
 * ປ່ຽນສະຖານະແບບ atomic — ສຳເລັດສະເພາະເມື່ອແຖວຍັງຢູ່ສະຖານະ `from` (ກັນສອງຄົນກົດອະນຸມັດ/ຈ່າຍພ້ອມກັນ).
 * ຄືນ false ຖ້າມີຄົນອື່ນປ່ຽນໄປກ່ອນ.
 */
async function transition(
  id: string,
  from: ExpenseStatus[],
  data: Prisma.ExpenseUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await prisma.expense.updateMany({ where: { id, status: { in: from } }, data });
  return count === 1;
}

// ── categories ───────────────────────────────────────────────────────

export async function listCategories(includeInactive = false): Promise<ExpenseCategoryView[]> {
  return prisma.expenseCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      code: true,
      nameLo: true,
      nameEn: true,
      kind: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
    },
  });
}

export async function createCategory(auth: AccessTokenPayload, input: CreateExpenseCategoryInput) {
  if (await prisma.expenseCategory.findUnique({ where: { code: input.code } })) {
    throw ApiError.conflict('ລະຫັດໝວດນີ້ມີຢູ່ແລ້ວ');
  }
  if (input.parentId && !(await prisma.expenseCategory.findUnique({ where: { id: input.parentId } }))) {
    throw ApiError.notFound('ບໍ່ພົບໝວດແມ່');
  }
  const row = await prisma.expenseCategory.create({ data: input });
  await prisma.auditLog.create({
    data: { userId: auth.sub, action: 'CREATE', entityName: 'ExpenseCategory', entityId: row.id, newValue: row as never },
  });
  return row;
}

export async function updateCategory(auth: AccessTokenPayload, id: string, input: UpdateExpenseCategoryInput) {
  const existing = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບໝວດລາຍຈ່າຍ');
  const row = await prisma.expenseCategory.update({ where: { id }, data: input });
  await prisma.auditLog.create({
    data: {
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'ExpenseCategory',
      entityId: id,
      oldValue: existing as never,
      newValue: row as never,
    },
  });
  return row;
}

// ── expenses: CRUD ───────────────────────────────────────────────────

function listWhere(auth: AccessTokenPayload, query: Omit<ExpenseListQuery, 'page' | 'pageSize' | 'sort'>): Prisma.ExpenseWhereInput {
  const branchId = scopeBranchId(auth, query.branchId);
  return {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.from || query.to
      ? {
          expenseDate: {
            ...(query.from ? { gte: dateKeyToDate(query.from) } : {}),
            ...(query.to ? { lte: dateKeyToDate(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { notes: { contains: query.q, mode: 'insensitive' } },
            { paidReference: { contains: query.q, mode: 'insensitive' } },
            { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
            { category: { nameLo: { contains: query.q, mode: 'insensitive' } } },
            { category: { nameEn: { contains: query.q, mode: 'insensitive' } } },
            { createdBy: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(query.flag === 'missingReceipt'
      ? { status: query.status ?? { in: RECEIPT_REQUIRED }, attachments: { none: {} } }
      : query.flag === 'mine'
        ? { createdById: auth.sub }
        : query.flag === 'recurring'
          ? { recurringExpenseId: { not: null } }
          : query.flag === 'overdue'
            ? { status: query.status ?? { in: OPEN_PAYABLE }, dueDate: { lt: vientianeDateKey(new Date()) } }
            : {}),
  };
}

export async function listExpenses(
  auth: AccessTokenPayload,
  query: ExpenseListQuery,
): Promise<Paginated<ExpenseView>> {
  const where = listWhere(auth, query);
  const orderBy: Prisma.ExpenseOrderByWithRelationInput[] =
    query.sort === 'oldest'
      ? [{ expenseDate: 'asc' }, { createdAt: 'asc' }]
      : query.sort === 'amountDesc'
        ? [{ amount: 'desc' }, { expenseDate: 'desc' }]
        : query.sort === 'amountAsc'
          ? [{ amount: 'asc' }, { expenseDate: 'desc' }]
          : [{ expenseDate: 'desc' }, { createdAt: 'desc' }];
  const [total, rows, limit] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getApprovalLimit(),
  ]);
  const matches = await bankMatches(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toView(r, limit, matches.get(r.id) ?? null)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getExpense(auth: AccessTokenPayload, id: string): Promise<ExpenseView> {
  const [row, limit, matches] = await Promise.all([loadExpense(auth, id), getApprovalLimit(), bankMatches([id])]);
  return toView(row, limit, matches.get(id) ?? null);
}

export async function createExpense(auth: AccessTokenPayload, input: CreateExpenseInput): Promise<ExpenseView> {
  scopeBranchId(auth, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  await assertActiveCategory(input.categoryId);
  await assertLinks(input.branchId, input.supplierId, input.purchaseOrderId);
  const fxRate = await resolveFxRate(input.currency, input.fxRate);
  assertTax(input.taxAmount, input.amount);
  const amountBase = Math.round(input.amount * fxRate * 100) / 100;
  const allocations = await planAllocations(auth, input.branchId, amountBase, input.allocations);

  const row = await prisma.expense.create({
    data: {
      branchId: input.branchId,
      categoryId: input.categoryId,
      title: input.title,
      amount: dec(input.amount),
      currency: input.currency,
      fxRate: dec(fxRate),
      amountBase: dec(amountBase),
      ...(allocations.length ? { allocations: { create: allocations } } : {}),
      taxAmount: input.taxAmount == null ? undefined : dec(input.taxAmount),
      invoiceNumber: input.invoiceNumber,
      dueDate: input.dueDate ? dateKeyToDate(input.dueDate) : undefined,
      expenseDate: dateKeyToDate(input.expenseDate),
      notes: input.notes,
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId,
      createdById: auth.sub,
    },
    include: EXPENSE_INCLUDE,
  });
  const view = toView(row, await getApprovalLimit());
  await auditExpense(auth, 'CREATE', row.branchId, row.id, null, view);
  return view;
}

export async function updateExpense(
  auth: AccessTokenPayload,
  id: string,
  input: UpdateExpenseInput,
): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw ApiError.conflict('ແກ້ໄຂໄດ້ສະເພາະລາຍຈ່າຍທີ່ເປັນຮ່າງ ຫຼື ຖືກປະຕິເສດ');
  }
  if (input.categoryId) await assertActiveCategory(input.categoryId);
  await assertLinks(existing.branchId, input.supplierId, input.purchaseOrderId);
  const amount = input.amount ?? toNum(existing.amount);
  const currency = input.currency ?? existing.currency;
  // ສະກຸນ ຫຼື ອັດຕາປ່ຽນ → snapshot ອັດຕາໃໝ່; ບໍ່ດັ່ງນັ້ນຮັກສາອັດຕາເດີມ (ບັນທຶກຕາມວັນທີ່ສ້າງ).
  const fxRate =
    input.fxRate !== undefined || currency !== existing.currency
      ? await resolveFxRate(currency, input.fxRate)
      : toNum(existing.fxRate);
  assertTax(input.taxAmount === undefined ? (existing.taxAmount == null ? null : toNum(existing.taxAmount)) : input.taxAmount, amount);

  const newBase = Math.round(amount * fxRate * 100) / 100;
  // ແບ່ງໃໝ່ຖ້າສົ່ງມາ; ບໍ່ດັ່ງນັ້ນຄິດຈຳນວນຂອງການແບ່ງເດີມຄືນຕາມຍອດໃໝ່.
  const allocations =
    input.allocations !== undefined
      ? await planAllocations(auth, existing.branchId, newBase, input.allocations)
      : existing.allocations.length
        ? splitByPercent(newBase, existing.allocations.map((a) => ({ branchId: a.branchId, percent: toNum(a.percent) })))
        : [];

  const ok = await transition(id, ['DRAFT', 'REJECTED'], {
    fxRate: dec(fxRate),
    amountBase: dec(Math.round(amount * fxRate * 100) / 100),
    ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount == null ? null : dec(input.taxAmount) } : {}),
    ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? dateKeyToDate(input.dueDate) : null } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.amount !== undefined ? { amount: dec(input.amount) } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.expenseDate !== undefined ? { expenseDate: dateKeyToDate(input.expenseDate) } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
    ...(input.purchaseOrderId !== undefined ? { purchaseOrderId: input.purchaseOrderId } : {}),
    // ແກ້ຫຼັງຖືກປະຕິເສດ → ກັບເປັນຮ່າງ ແລະ ລຶບເຫດຜົນເກົ່າ (ຕ້ອງສົ່ງອະນຸມັດໃໝ່).
    status: 'DRAFT',
    rejectedReason: null,
  });
  if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  if (input.allocations !== undefined || existing.allocations.length) {
    await prisma.$transaction([
      prisma.expenseAllocation.deleteMany({ where: { expenseId: id } }),
      prisma.expenseAllocation.createMany({ data: allocations.map((a) => ({ ...a, expenseId: id })) }),
    ]);
  }

  const view = await getExpense(auth, id);
  await auditExpense(auth, 'UPDATE', existing.branchId, id, toView(existing), view);
  return view;
}

export async function deleteExpense(auth: AccessTokenPayload, id: string): Promise<void> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw ApiError.conflict('ລຶບໄດ້ສະເພາະລາຍຈ່າຍທີ່ເປັນຮ່າງ ຫຼື ຖືກປະຕິເສດ');
  }
  const { count } = await prisma.expense.deleteMany({ where: { id, status: { in: ['DRAFT', 'REJECTED'] } } });
  if (count !== 1) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  await Promise.all(existing.attachments.map((a) => storage.delete(a.imageKey).catch(() => undefined)));
  await auditExpense(auth, 'DELETE', existing.branchId, id, toView(existing), null);
}

// ── expenses: workflow ───────────────────────────────────────────────

export async function submitExpense(auth: AccessTokenPayload, id: string): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw ApiError.conflict('ສົ່ງອະນຸມັດໄດ້ສະເພາະລາຍຈ່າຍທີ່ເປັນຮ່າງ ຫຼື ຖືກປະຕິເສດ');
  }
  await assertActiveCategory(existing.categoryId);
  const ok = await transition(id, ['DRAFT', 'REJECTED'], {
    status: 'SUBMITTED',
    submittedAt: new Date(),
    rejectedReason: null,
  });
  if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'SUBMIT', existing.branchId, id, { status: existing.status }, { status: view.status });
  void notifyApprovers(view, auth.sub);
  return view;
}

export async function approveExpense(auth: AccessTokenPayload, id: string): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'SUBMITTED') throw ApiError.conflict('ອະນຸມັດໄດ້ສະເພາະລາຍຈ່າຍທີ່ລໍຖ້າອະນຸມັດ');
  // ແຍກໜ້າທີ່: ຜູ້ສ້າງອະນຸມັດຂອງຕົນເອງບໍ່ໄດ້ (ຍົກເວັ້ນ SUPER_ADMIN — ເຈົ້າຂອງຮ້ານດຽວ).
  if (existing.createdById === auth.sub && auth.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('ບໍ່ສາມາດອະນຸມັດລາຍຈ່າຍທີ່ຕົນເອງສ້າງ');
  }
  // E3 — ເກີນເພດານ → ສະເພາະ SUPER_ADMIN.
  const limit = await getApprovalLimit();
  if (limit != null && toNum(existing.amountBase) > limit && auth.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden(`ຍອດເກີນເພດານອະນຸມັດ (${limit.toLocaleString('en-US')} LAK) — ຕ້ອງໃຫ້ເຈົ້າຂອງອະນຸມັດ`);
  }
  const ok = await transition(id, ['SUBMITTED'], {
    status: 'APPROVED',
    approvedById: auth.sub,
    approvedAt: new Date(),
  });
  if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'APPROVE', existing.branchId, id, { status: 'SUBMITTED' }, { status: 'APPROVED', amount: view.amount });
  void notifyAuthor(view, 'EXPENSE_APPROVED', 'ລາຍຈ່າຍຖືກອະນຸມັດ', `${view.title} · ${view.amountBase.toLocaleString('en-US')} LAK`, 'info');
  return view;
}

export async function rejectExpense(
  auth: AccessTokenPayload,
  id: string,
  input: RejectExpenseInput,
): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'SUBMITTED') throw ApiError.conflict('ປະຕິເສດໄດ້ສະເພາະລາຍຈ່າຍທີ່ລໍຖ້າອະນຸມັດ');
  const ok = await transition(id, ['SUBMITTED'], {
    status: 'REJECTED',
    rejectedReason: input.reason,
    approvedById: auth.sub,
    approvedAt: new Date(),
  });
  if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'REJECT', existing.branchId, id, { status: 'SUBMITTED' }, { status: 'REJECTED', reason: input.reason });
  void notifyAuthor(view, 'EXPENSE_REJECTED', 'ລາຍຈ່າຍຖືກປະຕິເສດ', `${view.title} — ${input.reason}`, 'warning');
  return view;
}

export async function payExpense(
  auth: AccessTokenPayload,
  id: string,
  input: PayExpenseInput,
): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'APPROVED') throw ApiError.conflict('ຈ່າຍໄດ້ສະເພາະລາຍຈ່າຍທີ່ອະນຸມັດແລ້ວ');

  if (input.paidFromAccountId) {
    const account = await prisma.bankAccount.findUnique({ where: { id: input.paidFromAccountId } });
    if (!account || !account.isActive) throw ApiError.badRequest('ບັນຊີທະນາຄານບໍ່ຖືກຕ້ອງ ຫຼື ຖືກປິດໃຊ້ງານ');
    if (account.branchId !== existing.branchId) {
      throw ApiError.badRequest('ບັນຊີທີ່ຈ່າຍອອກຕ້ອງເປັນຂອງສາຂາດຽວກັນກັບລາຍຈ່າຍ');
    }
    if (account.currency !== existing.currency) {
      throw ApiError.badRequest(`ສະກຸນເງິນບັນຊີ (${account.currency}) ບໍ່ກົງກັບລາຍຈ່າຍ (${existing.currency})`);
    }
  }

  if (input.paidFromAccountId && input.cashFundId) {
    throw ApiError.badRequest('ເລືອກໄດ້ຢ່າງດຽວ: ບັນຊີທະນາຄານ ຫຼື ກ່ອງເງິນສົດ');
  }

  if (input.cashFundId) {
    // E9 — ຈ່າຍຈາກກ່ອງເງິນສົດ: lock ແຖວກ່ອງ → ກວດຍອດ → ປ່ຽນສະຖານະ + ບັນທຶກລາຍການ ໃນ transaction ດຽວ.
    const fundId = input.cashFundId;
    const amount = toNum(existing.amount);
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; branchId: string; currency: string; isActive: boolean }[]>`
        SELECT id, "branchId", currency, "isActive" FROM cash_funds WHERE id = ${fundId} FOR UPDATE`;
      const fund = locked[0];
      if (!fund || !fund.isActive) throw ApiError.badRequest('ກ່ອງເງິນສົດບໍ່ຖືກຕ້ອງ ຫຼື ຖືກປິດໃຊ້ງານ');
      if (fund.branchId !== existing.branchId) throw ApiError.badRequest('ກ່ອງເງິນສົດຕ້ອງເປັນຂອງສາຂາດຽວກັນກັບລາຍຈ່າຍ');
      if (fund.currency !== existing.currency) {
        throw ApiError.badRequest(`ສະກຸນເງິນກ່ອງ (${fund.currency}) ບໍ່ກົງກັບລາຍຈ່າຍ (${existing.currency})`);
      }
      const bal = await tx.cashFundEntry.aggregate({ where: { fundId }, _sum: { amount: true } });
      const balance = toNum(bal._sum.amount);
      if (balance < amount) {
        throw ApiError.badRequest(`ເງິນສົດໃນກ່ອງບໍ່ພໍ (ຍັງເຫຼືອ ${balance.toLocaleString('en-US')} ${fund.currency}) — ເຕີມເງິນກ່ອນ`);
      }
      const { count } = await tx.expense.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'PAID', paidAt: new Date(), paidFromAccountId: null, paidFromCashFundId: fundId, paidReference: input.paidReference ?? null },
      });
      if (count !== 1) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
      await tx.cashFundEntry.create({
        data: { fundId, type: 'EXPENSE', amount: dec(-amount), expenseId: id, note: existing.title, createdById: auth.sub },
      });
    });
  } else {
    const ok = await transition(id, ['APPROVED'], {
      status: 'PAID',
      paidAt: new Date(),
      paidFromAccountId: input.paidFromAccountId ?? null,
      paidReference: input.paidReference ?? null,
    });
    if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  }
  const view = await getExpense(auth, id);
  await auditExpense(
    auth,
    'PAY',
    existing.branchId,
    id,
    { status: 'APPROVED' },
    { status: 'PAID', paidFromAccountId: view.paidFromAccount?.id ?? null, cashFundId: view.paidFromCashFund?.id ?? null, amount: view.amount },
  );
  return view;
}

/**
 * ດຳເນີນການຫຼາຍລາຍການ — ແຕ່ລະລາຍການໃຊ້ຟັງຊັນດ່ຽວດຽວກັນ (ກົດສະຖານະ, ສາຂາ, ແຍກໜ້າທີ່, audit),
 * ຈຶ່ງບໍ່ມີທາງລັດທີ່ຂ້າມກົດໄດ້. ລາຍການທີ່ຖືກປະຕິເສດໂດຍກົດ (ApiError) ຖືກລາຍງານ ແລະ ດຳເນີນຕໍ່.
 */
export async function bulkExpenseAction(
  auth: AccessTokenPayload,
  input: BulkExpenseActionInput,
): Promise<BulkExpenseActionResult> {
  const succeeded: string[] = [];
  const failed: BulkExpenseActionResult['failed'] = [];
  for (const id of [...new Set(input.ids)]) {
    try {
      if (input.action === 'submit') await submitExpense(auth, id);
      else if (input.action === 'approve') await approveExpense(auth, id);
      else {
        await payExpense(auth, id, {
          paidFromAccountId: input.paidFromAccountId ?? null,
          cashFundId: input.cashFundId ?? null,
          ...(input.paidReference ? { paidReference: input.paidReference } : {}),
        });
      }
      succeeded.push(id);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      failed.push({ id, message: err.message });
    }
  }
  return { succeeded, failed };
}

/**
 * E5 — ຍົກເລີກລາຍການ APPROVED/PAID. ບໍ່ລຶບ: ຮັກສາແຖວ + ເຫດຜົນ + ຜູ້ຍົກເລີກ, ແລະ ອອກຈາກທຸກຍອດລວມ
 * (RECOGNISED ບໍ່ລວມ VOIDED). ຖ້າຈ່າຍໄປແລ້ວ ເງິນທີ່ອອກໄປຕ້ອງຕາມຄືນນອກລະບົບ — audit ບັນທຶກໄວ້.
 */
export async function voidExpense(auth: AccessTokenPayload, id: string, input: VoidExpenseInput): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status !== 'APPROVED' && existing.status !== 'PAID') {
    throw ApiError.conflict('ຍົກເລີກໄດ້ສະເພາະລາຍຈ່າຍທີ່ອະນຸມັດ ຫຼື ຈ່າຍແລ້ວ (ຮ່າງໃຫ້ລຶບແທນ)');
  }
  // E6 — ການຈ່າຍຜ່ານທະນາຄານຢູ່ໃນງວດກະທົບຍອດທີ່ປິດແລ້ວ → ຫ້າມແກ້ (ຕ້ອງເປີດງວດຄືນກ່ອນ).
  if (existing.status === 'PAID' && existing.paidFromAccountId && existing.paidAt) {
    await assertNotLocked(existing.branchId, dateToKey(vientianeDateKey(existing.paidAt)));
  }
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.expense.updateMany({
      where: { id, status: { in: ['APPROVED', 'PAID'] } },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedById: auth.sub, voidReason: input.reason },
    });
    if (count !== 1) return false;
    // ເງິນທີ່ອອກຈາກກ່ອງເງິນສົດ ຄືນເຂົ້າກ່ອງ (ສົມມຸດວ່າເງິນສົດຖືກສົ່ງຄືນ — ນັບກ່ອງເພື່ອຢືນຢັນ).
    if (existing.status === 'PAID' && existing.paidFromCashFundId) {
      await tx.cashFundEntry.create({
        data: {
          fundId: existing.paidFromCashFundId,
          type: 'REVERSAL',
          amount: existing.amount,
          expenseId: id,
          note: input.reason,
          createdById: auth.sub,
        },
      });
    }
    // ແຖວໃບແຈ້ງຍອດທີ່ຈັບຄູ່ກັບລາຍການນີ້ ກັບເປັນ "ຍັງບໍ່ຈັບຄູ່" ເພື່ອໃຫ້ຜູ້ກະທົບຍອດເຫັນ.
    await tx.bankStatementLine.updateMany({
      where: { matchedExpenseId: id },
      data: { matchStatus: 'UNMATCHED', matchedExpenseId: null, matchedById: null, matchedAt: null },
    });
    return true;
  });
  if (!ok) throw ApiError.conflict('ສະຖານະລາຍຈ່າຍຖືກປ່ຽນໂດຍຄົນອື່ນແລ້ວ');
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'VOID', existing.branchId, id, { status: existing.status }, { status: 'VOIDED', reason: input.reason, wasPaid: existing.status === 'PAID' });
  void notifyAuthor(view, 'EXPENSE_VOIDED', 'ລາຍຈ່າຍຖືກຍົກເລີກ', `${view.title} — ${input.reason}`, 'warning');
  return view;
}

// ── E6 ໃບແຈ້ງຍອດ / E10 ການແບ່ງ ─────────────────────────────────────

/** ແຖວໃບແຈ້ງຍອດທີ່ຈັບຄູ່ກັບລາຍຈ່າຍ (ໂມດູນກະທົບຍອດ ເປັນຜູ້ຂຽນ `matchedExpenseId`). */
async function bankMatches(ids: string[]): Promise<Map<string, BankMatchRow>> {
  if (!ids.length) return new Map();
  const rows = await prisma.bankStatementLine.findMany({
    where: { matchedExpenseId: { in: ids } },
    select: { matchedExpenseId: true, statementDate: true, reference: true, description: true, matchedAt: true, matchedById: true },
  });
  return new Map(rows.map((r) => [r.matchedExpenseId!, r]));
}

type AllocationPlan = { branchId: string; percent: Prisma.Decimal; amountBase: Prisma.Decimal };

/** ແບ່ງ amountBase ຕາມ % — ແຖວສຸດທ້າຍຮັບເສດ ເພື່ອໃຫ້ຜົນລວມເທົ່າກັບຍອດພໍດີ. */
function splitByPercent(amountBase: number, items: { branchId: string; percent: number }[]): AllocationPlan[] {
  let used = 0;
  return items.map((it, i) => {
    const amt =
      i === items.length - 1 ? Math.round((amountBase - used) * 100) / 100 : Math.round(amountBase * it.percent) / 100;
    used += amt;
    return { branchId: it.branchId, percent: dec(it.percent), amountBase: dec(amt) };
  });
}

/**
 * E10 — ກວດ + ແປງການແບ່ງ. ແບ່ງໃຫ້ສາຂາອື່ນ = ຕັດສິນໃຈລະດັບບໍລິສັດ → SUPER_ADMIN ເທົ່ານັ້ນ.
 * ແບ່ງໃຫ້ສາຂາດຽວ 100% ຂອງສາຂາທີ່ຈ່າຍ = ບໍ່ແບ່ງ (ຄືນ []).
 */
async function planAllocations(
  auth: AccessTokenPayload,
  payingBranchId: string,
  amountBase: number,
  input: { branchId: string; percent: number }[] | undefined,
): Promise<AllocationPlan[]> {
  if (!input || input.length === 0) return [];
  if (input.length === 1 && input[0]!.branchId === payingBranchId) return [];
  if (auth.role !== 'SUPER_ADMIN') throw ApiError.forbidden('ການແບ່ງຄ່າໃຊ້ຈ່າຍໃຫ້ສາຂາອື່ນ ເຮັດໄດ້ສະເພາະເຈົ້າຂອງ');
  const found = await prisma.branch.count({ where: { id: { in: input.map((a) => a.branchId) } } });
  if (found !== input.length) throw ApiError.badRequest('ມີສາຂາທີ່ບໍ່ພົບໃນການແບ່ງ');
  return splitByPercent(amountBase, input);
}

/** ເງື່ອນໄຂ "ຕົ້ນທຶນທີ່ເປັນຂອງສາຂາ X": ລາຍຈ່າຍຂອງ X ທີ່ບໍ່ໄດ້ແບ່ງ + ສ່ວນແບ່ງທີ່ຕົກໃຫ້ X. */
function costScope(branchId?: string): Prisma.ExpenseWhereInput {
  return branchId ? { OR: [{ branchId, allocations: { none: {} } }, { allocations: { some: { branchId } } }] } : {};
}

const COST_SELECT = {
  branchId: true,
  amountBase: true,
  allocations: { select: { branchId: true, amountBase: true } },
} as const;

type CostRow = {
  branchId: string;
  amountBase: Prisma.Decimal;
  allocations: { branchId: string; amountBase: Prisma.Decimal }[];
};

/** ຕົ້ນທຶນຂອງແຖວນີ້ ສຳລັບມຸມມອງສາຂາ (ບໍ່ມີສາຂາ = ທັງກ້ອນ). */
function costFor(e: CostRow, branchId?: string): number {
  if (!branchId || e.allocations.length === 0) return toNum(e.amountBase);
  return toNum(e.allocations.find((a) => a.branchId === branchId)?.amountBase ?? 0);
}

/** ແຍກຕົ້ນທຶນເປັນ [ສາຂາ, ຈຳນວນ] ຕາມການແບ່ງ — ໃຊ້ຈັດອັນດັບສາຂາ. */
function costByBranch(e: CostRow): [string, number][] {
  return e.allocations.length
    ? e.allocations.map((a) => [a.branchId, toNum(a.amountBase)] as [string, number])
    : [[e.branchId, toNum(e.amountBase)]];
}

/** Dashboard — ລາຍຈ່າຍທີ່ຮັບຮູ້ (ບໍ່ລວມຊື້ສິນຄ້າ) ຕັ້ງແຕ່ `from`, ຕາມສ່ວນແບ່ງຂອງສາຂາ. */
export async function recognisedOperatingCost(branchId: string | undefined, from: Date): Promise<number> {
  const rows = await prisma.expense.findMany({
    where: {
      ...costScope(branchId),
      status: { in: RECOGNISED },
      category: { kind: { not: 'INVENTORY' } },
      expenseDate: { gte: from },
    },
    select: COST_SELECT,
  });
  return rows.reduce((a, r) => a + costFor(r, branchId), 0);
}

// ── E9 ເງິນສົດຍ່ອຍ ────────────────────────────────────────────────────

async function fundBalances(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const g = await prisma.cashFundEntry.groupBy({ by: ['fundId'], where: { fundId: { in: ids } }, _sum: { amount: true } });
  return new Map(g.map((x) => [x.fundId, toNum(x._sum.amount)]));
}

export async function listCashFunds(auth: AccessTokenPayload, branchId?: string): Promise<CashFundView[]> {
  const scoped = scopeBranchId(auth, branchId);
  const funds = await prisma.cashFund.findMany({
    where: scoped ? { branchId: scoped } : {},
    include: { branch: { select: { name: true } } },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  const ids = funds.map((f) => f.id);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [balances, spent, counts] = await Promise.all([
    fundBalances(ids),
    prisma.cashFundEntry.groupBy({
      by: ['fundId'],
      where: { fundId: { in: ids }, type: 'EXPENSE', createdAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.cashFundEntry.findMany({
      where: { fundId: { in: ids }, type: 'COUNT' },
      orderBy: { createdAt: 'desc' },
      distinct: ['fundId'],
      include: { createdBy: { select: { name: true } } },
    }),
  ]);
  const spentBy = new Map(spent.map((x) => [x.fundId, -toNum(x._sum.amount)]));
  const countBy = new Map(counts.map((c) => [c.fundId, c]));
  return funds.map((f) => {
    const c = countBy.get(f.id);
    return {
      id: f.id,
      branchId: f.branchId,
      branchName: f.branch.name,
      name: f.name,
      currency: f.currency,
      floatAmount: f.floatAmount == null ? null : toNum(f.floatAmount),
      isActive: f.isActive,
      balance: balances.get(f.id) ?? 0,
      spent30d: spentBy.get(f.id) ?? 0,
      lastCount: c
        ? { at: c.createdAt.toISOString(), counted: toNum(c.countedAmount), difference: toNum(c.amount), by: c.createdBy.name }
        : null,
    };
  });
}

async function loadFund(auth: AccessTokenPayload, id: string) {
  const f = await prisma.cashFund.findUnique({ where: { id } });
  if (!f) throw ApiError.notFound('ບໍ່ພົບກ່ອງເງິນສົດ');
  scopeBranchId(auth, f.branchId);
  return f;
}

async function fundView(auth: AccessTokenPayload, id: string): Promise<CashFundView> {
  const f = await loadFund(auth, id);
  const all = await listCashFunds(auth, f.branchId);
  return all.find((x) => x.id === id)!;
}

export async function createCashFund(auth: AccessTokenPayload, input: CreateCashFundInput): Promise<CashFundView> {
  scopeBranchId(auth, input.branchId);
  if (await prisma.cashFund.findUnique({ where: { branchId_name: { branchId: input.branchId, name: input.name } } })) {
    throw ApiError.conflict('ມີກ່ອງເງິນສົດຊື່ນີ້ໃນສາຂານີ້ແລ້ວ');
  }
  const f = await prisma.cashFund.create({
    data: {
      branchId: input.branchId,
      name: input.name,
      currency: input.currency,
      floatAmount: input.floatAmount == null ? undefined : dec(input.floatAmount),
      createdById: auth.sub,
      ...(input.openingBalance && input.openingBalance > 0
        ? { entries: { create: { type: 'TOPUP', amount: dec(input.openingBalance), note: 'ຍອດຍົກມາ', createdById: auth.sub } } }
        : {}),
    },
  });
  await auditExpense(auth, 'CREATE', f.branchId, f.id, null, { name: f.name, currency: f.currency }, 'CashFund');
  return fundView(auth, f.id);
}

export async function updateCashFund(auth: AccessTokenPayload, id: string, input: UpdateCashFundInput): Promise<CashFundView> {
  const f = await loadFund(auth, id);
  await prisma.cashFund.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.floatAmount !== undefined ? { floatAmount: input.floatAmount == null ? null : dec(input.floatAmount) } : {}),
    },
  });
  await auditExpense(auth, 'UPDATE', f.branchId, id, { name: f.name, isActive: f.isActive }, input, 'CashFund');
  return fundView(auth, id);
}

/** ເຕີມ / ຖອນ. ຖອນເກີນຍອດບໍ່ໄດ້. */
export async function moveCashFund(auth: AccessTokenPayload, id: string, input: CashFundMovementInput): Promise<CashFundView> {
  const f = await loadFund(auth, id);
  if (!f.isActive) throw ApiError.conflict('ກ່ອງເງິນສົດນີ້ຖືກປິດໃຊ້ງານ');
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cash_funds WHERE id = ${id} FOR UPDATE`;
    if (input.type === 'WITHDRAW') {
      const bal = toNum((await tx.cashFundEntry.aggregate({ where: { fundId: id }, _sum: { amount: true } }))._sum.amount);
      if (bal < input.amount) throw ApiError.badRequest(`ຖອນເກີນຍອດໃນກ່ອງ (${bal.toLocaleString('en-US')} ${f.currency})`);
    }
    await tx.cashFundEntry.create({
      data: {
        fundId: id,
        type: input.type,
        amount: dec(input.type === 'WITHDRAW' ? -input.amount : input.amount),
        note: input.note,
        createdById: auth.sub,
      },
    });
  });
  await auditExpense(auth, input.type, f.branchId, id, null, { amount: input.amount, note: input.note ?? null }, 'CashFund');
  return fundView(auth, id);
}

/** ນັບເງິນຕົວຈິງ — ບັນທຶກສ່ວນຕ່າງເປັນລາຍການ COUNT ເພື່ອໃຫ້ຍອດໃນລະບົບເທົ່າກັບເງິນໃນກ່ອງ. */
export async function countCashFund(auth: AccessTokenPayload, id: string, input: CashFundCountInput): Promise<CashFundView> {
  const f = await loadFund(auth, id);
  let difference = 0;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cash_funds WHERE id = ${id} FOR UPDATE`;
    const bal = toNum((await tx.cashFundEntry.aggregate({ where: { fundId: id }, _sum: { amount: true } }))._sum.amount);
    difference = Math.round((input.countedAmount - bal) * 100) / 100;
    await tx.cashFundEntry.create({
      data: {
        fundId: id,
        type: 'COUNT',
        amount: dec(difference),
        countedAmount: dec(input.countedAmount),
        note: input.note,
        createdById: auth.sub,
      },
    });
  });
  await auditExpense(auth, 'COUNT', f.branchId, id, null, { counted: input.countedAmount, difference }, 'CashFund');
  return fundView(auth, id);
}

export async function cashFundEntries(auth: AccessTokenPayload, id: string, limit = 100): Promise<CashFundEntryView[]> {
  await loadFund(auth, id);
  const all = await prisma.cashFundEntry.findMany({
    where: { fundId: id },
    orderBy: { createdAt: 'asc' },
    include: { createdBy: { select: { name: true } }, expense: { select: { id: true, title: true } } },
  });
  let running = 0;
  const out = all.map((e) => {
    running = Math.round((running + toNum(e.amount)) * 100) / 100;
    return {
      id: e.id,
      type: e.type,
      amount: toNum(e.amount),
      countedAmount: e.countedAmount == null ? null : toNum(e.countedAmount),
      balanceAfter: running,
      expense: e.expense,
      note: e.note,
      createdBy: e.createdBy.name,
      createdAt: e.createdAt.toISOString(),
    };
  });
  return out.reverse().slice(0, limit);
}

// ── E1 ອັດຕາ / E3 ເພດານ / ການຕັ້ງຄ່າ ────────────────────────────────

/** 1 ໜ່ວຍ `currency` = ? LAK. ໃຊ້ຄ່າທີ່ຜູ້ໃຊ້ໃສ່ ຖ້າມີ; ບໍ່ດັ່ງນັ້ນອັດຕາບັນທຶກບັນຊີ (ExchangeRate). */
async function resolveFxRate(currency: string, override?: number): Promise<number> {
  if (currency === 'LAK') return 1;
  if (override != null) return override;
  const r = await prisma.exchangeRate.findUnique({
    where: { baseCurrency_targetCurrency: { baseCurrency: currency, targetCurrency: 'LAK' } },
  });
  if (!r) throw ApiError.badRequest(`ຍັງບໍ່ໄດ້ຕັ້ງອັດຕາ ${currency} → LAK — ໃສ່ອັດຕາເອງ ຫຼື ຕັ້ງໃນການຕັ້ງຄ່າລາຍຈ່າຍ`);
  return r.rate.toNumber();
}

function assertTax(tax: number | null | undefined, amount: number): void {
  if (tax != null && tax > amount) throw ApiError.badRequest('ພາສີຕ້ອງບໍ່ເກີນຈຳນວນເງິນ');
}

async function getApprovalLimit(): Promise<number | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: APPROVAL_LIMIT_KEY } });
  const v = row?.value as unknown;
  return typeof v === 'number' && v > 0 ? v : null;
}

export async function getExpenseSettings(): Promise<ExpenseSettingsView> {
  const [approvalLimit, rates] = await Promise.all([
    getApprovalLimit(),
    prisma.exchangeRate.findMany({ where: { targetCurrency: 'LAK', baseCurrency: { in: ['THB', 'USD'] } } }),
  ]);
  return {
    approvalLimit,
    rates: ['THB', 'USD'].map((c) => {
      const r = rates.find((x) => x.baseCurrency === c);
      return { currency: c, rate: r ? r.rate.toNumber() : 0, updatedAt: r?.updatedAt.toISOString() ?? null };
    }),
  };
}

export async function updateExpenseSettings(
  auth: AccessTokenPayload,
  input: UpdateExpenseSettingsInput,
): Promise<ExpenseSettingsView> {
  const before = await getExpenseSettings();
  if (input.approvalLimit !== undefined) {
    if (input.approvalLimit == null) await prisma.appSetting.deleteMany({ where: { key: APPROVAL_LIMIT_KEY } });
    else
      await prisma.appSetting.upsert({
        where: { key: APPROVAL_LIMIT_KEY },
        update: { value: input.approvalLimit },
        create: { key: APPROVAL_LIMIT_KEY, value: input.approvalLimit },
      });
  }
  for (const r of input.rates ?? []) {
    await prisma.exchangeRate.upsert({
      where: { baseCurrency_targetCurrency: { baseCurrency: r.currency, targetCurrency: 'LAK' } },
      update: { rate: dec(r.rate) },
      create: { baseCurrency: r.currency, targetCurrency: 'LAK', rate: dec(r.rate) },
    });
  }
  const after = await getExpenseSettings();
  await prisma.auditLog.create({
    data: { userId: auth.sub, action: 'UPDATE', entityName: 'ExpenseSettings', entityId: APPROVAL_LIMIT_KEY, oldValue: before as never, newValue: after as never },
  });
  return after;
}

// ── E4 ແຈ້ງເຕືອນ ─────────────────────────────────────────────────────
// ບໍ່ໃຫ້ການແຈ້ງເຕືອນທີ່ລົ້ມ ເຮັດໃຫ້ workflow ລົ້ມ — ບັນທຶກ log ແລ້ວປ່ອຍຜ່ານ.

async function notifyApprovers(e: ExpenseView, actorId: string): Promise<void> {
  try {
    const limit = await getApprovalLimit();
    const ownerOnly = limit != null && e.amountBase > limit;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        id: { not: actorId },
        OR: [
          { role: 'SUPER_ADMIN' },
          ...(ownerOnly ? [] : [{ role: 'BRANCH_ADMIN' as const, branchId: e.branchId }]),
        ],
      },
      select: { id: true, role: true, branchId: true, roleRef: { select: { permissions: true } } },
    });
    const approvers = users.filter((u) => u.role === 'SUPER_ADMIN' || !u.roleRef || u.roleRef.permissions.includes('expenses:approve'));
    await Promise.all(
      approvers.map((u) =>
        notifyUser({
          userId: u.id,
          type: 'EXPENSE_SUBMITTED',
          title: ownerOnly ? 'ລາຍຈ່າຍລໍຖ້າເຈົ້າຂອງອະນຸມັດ' : 'ລາຍຈ່າຍລໍຖ້າອະນຸມັດ',
          body: `${e.title} · ${e.amountBase.toLocaleString('en-US')} LAK · ${e.branchName}`,
          severity: ownerOnly ? 'warning' : 'info',
          data: { expenseId: e.id, branchId: e.branchId },
          dedupeKey: `expense-submitted:${e.id}:${u.id}:${e.submittedAt ?? ''}`,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, expenseId: e.id }, 'expense approver notification failed');
  }
}

async function notifyAuthor(
  e: ExpenseView,
  type: string,
  title: string,
  body: string,
  severity: 'info' | 'warning',
): Promise<void> {
  try {
    await notifyUser({ userId: e.createdBy.id, type, title, body, severity, data: { expenseId: e.id, branchId: e.branchId } });
  } catch (err) {
    logger.warn({ err, expenseId: e.id }, 'expense author notification failed');
  }
}

// ── E11 ປະຫວັດ / E12 ຈຳນວນຕໍ່ສະຖານະ ───────────────────────────────────

const HISTORY_FIELDS = ['title', 'amount', 'currency', 'fxRate', 'expenseDate', 'dueDate', 'invoiceNumber', 'taxAmount', 'notes'] as const;

export async function expenseHistory(auth: AccessTokenPayload, id: string): Promise<ExpenseHistoryEntry[]> {
  await loadExpense(auth, id);
  const rows = await prisma.auditLog.findMany({
    where: { entityName: 'Expense', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } } },
  });
  return rows.map((r) => {
    const oldV = (r.oldValue ?? {}) as Record<string, unknown>;
    const newV = (r.newValue ?? {}) as Record<string, unknown>;
    const changes =
      r.action === 'UPDATE'
        ? [
            ...HISTORY_FIELDS.filter((f) => JSON.stringify(oldV[f] ?? null) !== JSON.stringify(newV[f] ?? null)).map((f) => ({ field: f, from: oldV[f] ?? null, to: newV[f] ?? null })),
            ...(JSON.stringify((oldV.category as { id?: string } | undefined)?.id) !== JSON.stringify((newV.category as { id?: string } | undefined)?.id)
              ? [{ field: 'category', from: (oldV.category as { nameEn?: string } | undefined)?.nameEn ?? null, to: (newV.category as { nameEn?: string } | undefined)?.nameEn ?? null }]
              : []),
          ]
        : [];
    const note =
      typeof newV.reason === 'string'
        ? newV.reason
        : r.action === 'PAY' && typeof newV.paidFromAccountId === 'string'
          ? null
          : null;
    return {
      id: r.id,
      action: r.action,
      at: r.createdAt.toISOString(),
      user: r.user ? { id: r.user.id, name: r.user.name } : null,
      changes,
      note,
    };
  });
}

export async function expenseStatusCounts(auth: AccessTokenPayload, query: ExpenseStatusCountsQuery): Promise<ExpenseStatusCounts> {
  const where = listWhere(auth, query);
  // flag ບາງອັນ (missingReceipt/overdue) ກຳນົດ status ເອງ — ຈຳນວນຍັງນັບຕາມສະຖານະຈິງ.
  const groups = await prisma.expense.groupBy({ by: ['status'], where, _count: { _all: true } });
  const out = Object.fromEntries(EXPENSE_STATUSES_ALL.map((st) => [st, 0])) as ExpenseStatusCounts;
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

// ── E2 ງົບປະມານ ──────────────────────────────────────────────────────

function shiftMonthLabel(month: string, delta: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return monthLabel(d.getUTCFullYear(), d.getUTCMonth());
}

async function actualByCategory(branchId: string, month: string): Promise<{ categoryId: string; amount: number }[]> {
  const y = Number(month.slice(0, 4));
  const m0 = Number(month.slice(5, 7)) - 1;
  const rows = await prisma.expense.findMany({
    where: {
      ...costScope(branchId),
      status: { in: RECOGNISED },
      expenseDate: { gte: new Date(Date.UTC(y, m0, 1)), lt: new Date(Date.UTC(y, m0 + 1, 1)) },
    },
    select: { ...COST_SELECT, categoryId: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + costFor(r, branchId));
  return [...m.entries()].map(([categoryId, amount]) => ({ categoryId, amount }));
}

export async function getBudgets(auth: AccessTokenPayload, query: ExpenseBudgetQuery): Promise<ExpenseBudgetView> {
  const branchId = scopeBranchId(auth, query.branchId);
  if (!branchId) throw ApiError.badRequest('ຕ້ອງເລືອກສາຂາ');
  const [rows, actual, previousActual] = await Promise.all([
    prisma.expenseBudget.findMany({ where: { branchId, month: query.month } }),
    actualByCategory(branchId, query.month),
    actualByCategory(branchId, shiftMonthLabel(query.month, -1)),
  ]);
  return {
    branchId,
    month: query.month,
    items: rows.map((r) => ({ categoryId: r.categoryId, amount: toNum(r.amount) })),
    actual,
    previousActual,
  };
}

export async function upsertBudgets(auth: AccessTokenPayload, input: UpsertExpenseBudgetsInput): Promise<ExpenseBudgetView> {
  scopeBranchId(auth, input.branchId);
  const before = await prisma.expenseBudget.findMany({ where: { branchId: input.branchId, month: input.month } });
  await prisma.$transaction(
    input.items.map((it) =>
      it.amount > 0
        ? prisma.expenseBudget.upsert({
            where: { branchId_categoryId_month: { branchId: input.branchId, categoryId: it.categoryId, month: input.month } },
            update: { amount: dec(it.amount), updatedById: auth.sub },
            create: { branchId: input.branchId, categoryId: it.categoryId, month: input.month, amount: dec(it.amount), updatedById: auth.sub },
          })
        : prisma.expenseBudget.deleteMany({ where: { branchId: input.branchId, categoryId: it.categoryId, month: input.month } }),
    ),
  );
  const view = await getBudgets(auth, { branchId: input.branchId, month: input.month });
  await prisma.auditLog.create({
    data: {
      branchId: input.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'ExpenseBudget',
      entityId: `${input.branchId}:${input.month}`,
      oldValue: before.map((b) => ({ categoryId: b.categoryId, amount: toNum(b.amount) })) as never,
      newValue: view.items as never,
    },
  });
  return view;
}

/** ຈັດຮູບງົບຂອງເດືອນທີ່ຊ່ວງ [from..to] ແຕະ — null ຖ້າບໍ່ມີງົບເລີຍ. */
async function budgetForRange(
  branchId: string | undefined,
  range: { from: string; to: string },
  actualByCat: Map<string, number>,
): Promise<ExpenseSummaryView['budget']> {
  const months = monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7)).map((m) => m.label);
  if (months.length > MAX_PNL_MONTHS) return null;
  const rows = await prisma.expenseBudget.groupBy({
    by: ['categoryId'],
    where: { month: { in: months }, ...(branchId ? { branchId } : {}) },
    _sum: { amount: true },
  });
  if (rows.length === 0) return null;
  const byCategory = rows.map((r) => ({
    categoryId: r.categoryId,
    budget: toNum(r._sum.amount),
    actual: actualByCat.get(r.categoryId) ?? 0,
  }));
  return { months, total: byCategory.reduce((a, b) => a + b.budget, 0), byCategory };
}

// ── attachments ──────────────────────────────────────────────────────

export async function addAttachment(
  auth: AccessTokenPayload,
  id: string,
  input: UploadExpenseAttachmentInput,
): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.attachments.length >= MAX_ATTACHMENTS_PER_EXPENSE) {
    throw ApiError.badRequest(`ແນບໄດ້ສູງສຸດ ${MAX_ATTACHMENTS_PER_EXPENSE} ໄຟລ໌ຕໍ່ລາຍຈ່າຍ`);
  }
  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ໄຟລ໌ບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) throw ApiError.badRequest('ໄຟລ໌ໃຫຍ່ເກີນ 8MB');

  // ໃບຮັບເງິນໃບດຽວໃຊ້ເບີກສອງລາຍຈ່າຍ = ສັນຍານທຸຈະລິດ → ປະຕິເສດ.
  const imageHash = createHash('sha256').update(buffer).digest('hex');
  const dup = await prisma.expenseAttachment.findFirst({
    where: { imageHash },
    select: { expenseId: true },
  });
  if (dup) {
    throw ApiError.conflict(
      dup.expenseId === id ? 'ໄຟລ໌ນີ້ຖືກແນບກັບລາຍຈ່າຍນີ້ແລ້ວ' : 'ໃບຮັບເງິນນີ້ຖືກໃຊ້ກັບລາຍຈ່າຍອື່ນແລ້ວ',
    );
  }

  const ext = EXT_BY_CONTENT_TYPE[input.contentType] ?? 'bin';
  const key = `expenses/${id}/${randomUUID()}.${ext}`;
  const { url } = await storage.save(key, buffer, input.contentType);
  await prisma.expenseAttachment.create({
    data: {
      expenseId: id,
      imageKey: key,
      url,
      contentType: input.contentType,
      sizeBytes: buffer.byteLength,
      imageHash,
      uploadedById: auth.sub,
    },
  });
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'ATTACH', existing.branchId, id, null, { attachments: view.attachments.length });
  return view;
}

export async function removeAttachment(
  auth: AccessTokenPayload,
  id: string,
  attachmentId: string,
): Promise<ExpenseView> {
  const existing = await loadExpense(auth, id);
  if (existing.status === 'PAID') throw ApiError.conflict('ລາຍຈ່າຍທີ່ຈ່າຍແລ້ວ ລຶບເອກະສານແນບບໍ່ໄດ້');
  const att = existing.attachments.find((a) => a.id === attachmentId);
  if (!att) throw ApiError.notFound('ບໍ່ພົບເອກະສານແນບ');
  await prisma.expenseAttachment.delete({ where: { id: attachmentId } });
  await storage.delete(att.imageKey).catch(() => undefined);
  const view = await getExpense(auth, id);
  await auditExpense(auth, 'DETACH', existing.branchId, id, { attachmentId }, null);
  return view;
}

// ── summary ──────────────────────────────────────────────────────────

/** ຊ່ວງເລີ່ມຕົ້ນ: ເດືອນປັດຈຸບັນຕາມເວລາວຽງຈັນ ເມື່ອບໍ່ໃສ່ from/to. */
function defaultDateRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const { y, m0 } = currentMonthVte();
  const first = `${monthLabel(y, m0)}-01`;
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return {
    from: query.from ?? first,
    to: query.to ?? `${monthLabel(y, m0)}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function expenseSummary(
  auth: AccessTokenPayload,
  query: ExpenseSummaryQuery,
): Promise<ExpenseSummaryView> {
  const branchId = scopeBranchId(auth, query.branchId);
  const range = defaultDateRange(query);
  if (range.from > range.to) throw ApiError.badRequest('ວັນທີເລີ່ມຕ້ອງບໍ່ເກີນວັນທີສິ້ນສຸດ');
  const prev = previousRange(range);
  const scope: Prisma.ExpenseWhereInput = branchId ? { branchId } : {};
  const where: Prisma.ExpenseWhereInput = {
    ...scope,
    expenseDate: { gte: dateKeyToDate(range.from), lte: dateKeyToDate(range.to) },
  };

  const [byStatus, recognised, prevRecognised, byCurrency, missing, oldestPending, categories, branches] =
    await Promise.all([
      prisma.expense.groupBy({ by: ['status'], where, _sum: { amountBase: true }, _count: { _all: true } }),
      prisma.expense.findMany({
        where: { ...costScope(branchId), expenseDate: where.expenseDate, status: { in: RECOGNISED } },
        select: {
          id: true,
          title: true,
          currency: true,
          amountBase: true,
          allocations: { select: { branchId: true, amountBase: true } },
          branchId: true,
          categoryId: true,
          supplierId: true,
          recurringExpenseId: true,
          amount: true,
          expenseDate: true,
          supplier: { select: { name: true } },
        },
      }),
      prisma.expense.findMany({
        where: {
          ...costScope(branchId),
          status: { in: RECOGNISED },
          expenseDate: { gte: dateKeyToDate(prev.from), lte: dateKeyToDate(prev.to) },
        },
        select: { ...COST_SELECT, expenseDate: true },
      }),
      prisma.expense.groupBy({ by: ['currency'], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.aggregate({
        where: { ...where, status: { in: RECEIPT_REQUIRED }, attachments: { none: {} } },
        _sum: { amountBase: true },
        _count: { _all: true },
      }),
      prisma.expense.findFirst({
        where: { ...where, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true, createdAt: true },
      }),
      prisma.expenseCategory.findMany(),
      prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const byCat = new Map<string, { count: number; amount: number }>();
  const byBranch = new Map<string, { count: number; amount: number }>();
  const byMonth = new Map<string, number>();
  const bySupplier = new Map<string, { name: string; count: number; amount: number }>();
  const dayTotals = new Map<string, number>();
  let recognisedTotal = 0;
  const recurring = { count: 0, amount: 0 };
  for (const r of recognised) {
    const amt = costFor(r, branchId);
    recognisedTotal += amt;
    const c = byCat.get(r.categoryId) ?? { count: 0, amount: 0 };
    byCat.set(r.categoryId, { count: c.count + 1, amount: c.amount + amt });
    for (const [bid, part] of branchId ? ([[branchId, amt]] as [string, number][]) : costByBranch(r)) {
      const b = byBranch.get(bid) ?? { count: 0, amount: 0 };
      byBranch.set(bid, { count: b.count + 1, amount: b.amount + part });
    }
    const day = dateToKey(r.expenseDate);
    byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + amt);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + amt);
    if (r.supplierId && r.supplier) {
      const sp = bySupplier.get(r.supplierId) ?? { name: r.supplier.name, count: 0, amount: 0 };
      bySupplier.set(r.supplierId, { ...sp, count: sp.count + 1, amount: sp.amount + amt });
    }
    if (r.recurringExpenseId) {
      recurring.count += 1;
      recurring.amount += amt;
    }
  }

  const prevDayTotals = new Map<string, number>();
  let prevTotal = 0;
  for (const r of prevRecognised) {
    const amt = costFor(r, branchId);
    prevTotal += amt;
    const day = dateToKey(r.expenseDate);
    prevDayTotals.set(day, (prevDayTotals.get(day) ?? 0) + amt);
  }

  const statusRow = (s: ExpenseStatus) => {
    const g = byStatus.find((x) => x.status === s);
    return { count: g?._count._all ?? 0, amount: toNum(g?._sum.amountBase) };
  };

  // E8 ຄົບກຳນົດ — ບໍ່ຂຶ້ນກັບຊ່ວງວັນທີ່ລາຍຈ່າຍ (ໜີ້ຄ້າງເກົ່າກໍ່ຍັງຕ້ອງເຫັນ).
  const today = vientianeDateKey(new Date());
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const [overdueAgg, dueSoonAgg, budget, bankPaidRows, cashPaidAgg] = await Promise.all([
    prisma.expense.aggregate({
      where: { ...scope, status: { in: OPEN_PAYABLE }, dueDate: { lt: today } },
      _sum: { amountBase: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { ...scope, status: { in: OPEN_PAYABLE }, dueDate: { gte: today, lte: weekAhead } },
      _sum: { amountBase: true },
      _count: { _all: true },
    }),
    budgetForRange(branchId, range, new Map([...byCat.entries()].map(([k, v]) => [k, v.amount]))),
    prisma.expense.findMany({
      where: { ...where, status: 'PAID', paidFromAccountId: { not: null } },
      select: { id: true, amountBase: true },
    }),
    prisma.expense.aggregate({
      where: { ...where, status: 'PAID', paidFromCashFundId: { not: null } },
      _sum: { amountBase: true },
      _count: { _all: true },
    }),
  ]);
  const matchedIds = await bankMatches(bankPaidRows.map((r) => r.id));

  return {
    from: range.from,
    to: range.to,
    byStatus: byStatus.map((g) => ({
      status: g.status,
      count: g._count._all,
      amount: toNum(g._sum.amountBase),
    })),
    byCategory: [...byCat.entries()]
      .map(([categoryId, v]) => {
        const c = catById.get(categoryId)!;
        return { categoryId, code: c.code, nameLo: c.nameLo, nameEn: c.nameEn, kind: c.kind, ...v };
      })
      .sort((a, b) => b.amount - a.amount),
    byBranch: [...byBranch.entries()]
      .map(([id, v]) => ({ branchId: id, branchName: branchName.get(id) ?? '', ...v }))
      .sort((a, b) => b.amount - a.amount),
    byMonth: [...byMonth.entries()].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)),
    recognisedTotal,
    pendingApproval: statusRow('SUBMITTED'),
    awaitingPayment: statusRow('APPROVED'),
    byDay: fillDays(range, dayTotals),
    previous: {
      from: prev.from,
      to: prev.to,
      recognisedTotal: prevTotal,
      count: prevRecognised.length,
      byDay: fillDays(prev, prevDayTotals),
    },
    byCurrency: byCurrency
      .map((g) => ({ currency: g.currency, count: g._count._all, amount: toNum(g._sum.amount) }))
      .sort((a, b) => b.count - a.count),
    missingReceipts: { count: missing._count._all, amount: toNum(missing._sum.amountBase) },
    overdue: { count: overdueAgg._count._all, amount: toNum(overdueAgg._sum.amountBase) },
    dueSoon: { count: dueSoonAgg._count._all, amount: toNum(dueSoonAgg._sum.amountBase) },
    budget,
    bankPaid: {
      count: bankPaidRows.length,
      amount: bankPaidRows.reduce((a, r) => a + toNum(r.amountBase), 0),
      matched: matchedIds.size,
    },
    cashPaid: { count: cashPaidAgg._count._all, amount: toNum(cashPaidAgg._sum.amountBase) },
    oldestPendingAt: (oldestPending?.submittedAt ?? oldestPending?.createdAt)?.toISOString() ?? null,
    recurring,
    topSuppliers: [...bySupplier.entries()]
      .map(([supplierId, v]) => ({ supplierId, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    largest: [...recognised]
      .sort((a, b) => toNum(b.amountBase) - toNum(a.amountBase))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        title: r.title,
        amount: toNum(r.amount),
        currency: r.currency,
        expenseDate: dateToKey(r.expenseDate),
        categoryId: r.categoryId,
      })),
  };
}

/** ຈຳນວນວັນ (ລວມທັງສອງ) ລະຫວ່າງ YYYY-MM-DD ສອງວັນ. */
function daySpan(from: string, to: string): number {
  return Math.round((dateKeyToDate(to).getTime() - dateKeyToDate(from).getTime()) / 86_400_000) + 1;
}

function shiftDateKey(key: string, days: number): string {
  return dateToKey(new Date(dateKeyToDate(key).getTime() + days * 86_400_000));
}

/**
 * ຊ່ວງກ່ອນໜ້າທີ່ປຽບທຽບໄດ້: ຖ້າຊ່ວງເປັນເດືອນເຕັມ (ວັນທີ 1 → ວັນສຸດທ້າຍ ຫຼື ວັນນີ້ຂອງເດືອນດຽວກັນ)
 * ໃຫ້ໃຊ້ວັນທີດຽວກັນຂອງເດືອນກ່ອນ (1–20 ກັນຍາ ↔ 1–20 ສິງຫາ); ນອກນັ້ນ ເລື່ອນຖອຍຫຼັງເທົ່າຄວາມຍາວຊ່ວງ.
 */
function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  if (range.from.endsWith('-01') && range.from.slice(0, 7) === range.to.slice(0, 7)) {
    const y = Number(range.from.slice(0, 4));
    const m0 = Number(range.from.slice(5, 7)) - 1;
    const prevY = m0 === 0 ? y - 1 : y;
    const prevM0 = m0 === 0 ? 11 : m0 - 1;
    const prevLast = new Date(Date.UTC(prevY, prevM0 + 1, 0)).getUTCDate();
    const day = Math.min(Number(range.to.slice(8, 10)), prevLast);
    const label = monthLabel(prevY, prevM0);
    return { from: `${label}-01`, to: `${label}-${String(day).padStart(2, '0')}` };
  }
  const span = daySpan(range.from, range.to);
  return { from: shiftDateKey(range.from, -span), to: shiftDateKey(range.from, -1) };
}

function fillDays(range: { from: string; to: string }, totals: Map<string, number>): { date: string; amount: number }[] {
  const span = daySpan(range.from, range.to);
  if (span <= 0 || span > MAX_TREND_DAYS) return [];
  return Array.from({ length: span }, (_, i) => {
    const date = shiftDateKey(range.from, i);
    return { date, amount: totals.get(date) ?? 0 };
  });
}

// ── profit & loss ────────────────────────────────────────────────────

type MonthWindow = { gte: Date; lt: Date };

function monthWindow(y: number, m0: number): MonthWindow {
  return {
    gte: vientianeDayStart(new Date(Date.UTC(y, m0, 1))),
    lt: vientianeDayStart(new Date(Date.UTC(y, m0 + 1, 1))),
  };
}

/**
 * P&L ລາຍເດືອນ:
 *   ລາຍຮັບ(ເກັບໄດ້ຈິງ) − ຄືນເງິນ − COGS(ຕັດສະຕັອກ) − ຄ່າແຮງ(ຄອມ+ໂບນັດ, ເງິນເດືອນນອກລະບົບ) − ລາຍຈ່າຍດຳເນີນງານ.
 * ລາຍຈ່າຍໝວດ INVENTORY ບໍ່ນັບ (COGS ນັບຈາກການຕັດສະຕັອກແລ້ວ) — ສະແດງເປັນ memo ເທົ່ານັ້ນ.
 */
export async function profitLoss(auth: AccessTokenPayload, query: ProfitLossQuery): Promise<ProfitLossView> {
  const branchId = scopeBranchId(auth, query.branchId);
  const cur = currentMonthVte();
  const curLabel = monthLabel(cur.y, cur.m0);
  const from = query.from ?? query.to ?? curLabel;
  const to = query.to ?? query.from ?? curLabel;
  if (from > to) throw ApiError.badRequest('ເດືອນເລີ່ມຕ້ອງບໍ່ເກີນເດືອນສິ້ນສຸດ');
  const months = monthsBetween(from, to);
  if (months.length > MAX_PNL_MONTHS) throw ApiError.badRequest(`ເບິ່ງໄດ້ສູງສຸດ ${MAX_PNL_MONTHS} ເດືອນຕໍ່ຄັ້ງ`);

  const categories = await prisma.expenseCategory.findMany();
  const catById = new Map(categories.map((c) => [c.id, c]));

  const perMonth: ProfitLossMonth[] = [];
  const opsByCat = new Map<string, number>();
  let inventoryMemo = 0;

  for (const mo of months) {
    const w = monthWindow(mo.y, mo.m0);
    const paymentBranch = branchId ? { payment: { branchId } } : {};

    const [revAgg, refundAgg, consumed, expenseGroups, payroll] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: w.gte, lt: w.lt }, ...paymentBranch },
      }),
      prisma.refund.aggregate({
        _sum: { amount: true },
        where: { status: 'PAID', updatedAt: { gte: w.gte, lt: w.lt }, ...paymentBranch },
      }),
      prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { type: 'SERVICE_CONSUMED', createdAt: { gte: w.gte, lt: w.lt }, ...(branchId ? { branchId } : {}) },
        _sum: { qty: true },
      }),
      prisma.expense
        .findMany({
          where: {
            status: { in: RECOGNISED },
            expenseDate: { gte: new Date(Date.UTC(mo.y, mo.m0, 1)), lt: new Date(Date.UTC(mo.y, mo.m0 + 1, 1)) },
            ...costScope(branchId),
          },
          select: { ...COST_SELECT, categoryId: true },
        })
        .then((rows) => {
          const m = new Map<string, number>();
          for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + costFor(r, branchId));
          return [...m.entries()].map(([categoryId, amount]) => ({ categoryId, amount }));
        }),
      getPayrollReport({ monthYear: mo.label, ...(branchId ? { branchId } : {}) }),
    ]);

    const costs = consumed.length
      ? await prisma.product.findMany({
          where: { id: { in: consumed.map((c) => c.productId) } },
          select: { id: true, costPrice: true },
        })
      : [];
    const costById = new Map(costs.map((p) => [p.id, p.costPrice.toNumber()]));
    const cogs = Math.round(
      consumed.reduce((s, c) => s + Math.abs(c._sum.qty?.toNumber() ?? 0) * (costById.get(c.productId) ?? 0), 0),
    );

    let labourOther = 0;
    let operating = 0;
    for (const g of expenseGroups) {
      const amt = g.amount;
      const cat = catById.get(g.categoryId);
      if (!cat) continue;
      if (cat.kind === 'PAYROLL') labourOther += amt;
      else if (cat.kind === 'INVENTORY') inventoryMemo += amt;
      else {
        operating += amt;
        opsByCat.set(cat.code, (opsByCat.get(cat.code) ?? 0) + amt);
      }
    }

    const revenue = toNum(revAgg._sum.amount);
    const refunds = toNum(refundAgg._sum.amount);
    const labourCommission = payroll.totals.payable;
    perMonth.push({
      month: mo.label,
      revenue,
      refunds,
      cogs,
      labourCommission,
      labourOther,
      operatingExpenses: operating,
      netProfit: revenue - refunds - cogs - labourCommission - labourOther - operating,
    });
  }

  const sum = (pick: (m: ProfitLossMonth) => number) => perMonth.reduce((s, m) => s + pick(m), 0);
  const revenue = sum((m) => m.revenue);
  const refunds = sum((m) => m.refunds);
  const netRevenue = revenue - refunds;
  const cogs = sum((m) => m.cogs);
  const commission = sum((m) => m.labourCommission);
  const otherPayroll = sum((m) => m.labourOther);
  const operatingTotal = sum((m) => m.operatingExpenses);
  const netProfit = sum((m) => m.netProfit);

  return {
    from,
    to,
    branchId: branchId ?? null,
    revenue,
    refunds,
    netRevenue,
    cogs,
    grossProfit: netRevenue - cogs,
    labour: { commissionAndBonus: commission, otherPayroll, total: commission + otherPayroll },
    operating: {
      total: operatingTotal,
      byCategory: [...opsByCat.entries()]
        .map(([code, amount]) => {
          const c = categories.find((x) => x.code === code)!;
          return { code, nameLo: c.nameLo, nameEn: c.nameEn, amount };
        })
        .sort((a, b) => b.amount - a.amount),
    },
    inventoryPurchasesMemo: inventoryMemo,
    netProfit,
    netMargin: netRevenue > 0 ? Math.round((netProfit / netRevenue) * 10000) / 10000 : 0,
    months: perMonth,
  };
}

// ── recurring ────────────────────────────────────────────────────────

const RECURRING_INCLUDE = {
  branch: { select: { name: true } },
  category: { select: { id: true, code: true, nameLo: true, nameEn: true } },
} satisfies Prisma.RecurringExpenseInclude;

function toRecurringView(
  r: Prisma.RecurringExpenseGetPayload<{ include: typeof RECURRING_INCLUDE }>,
): RecurringExpenseView {
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: r.branch.name,
    category: r.category,
    title: r.title,
    amount: toNum(r.amount),
    currency: r.currency,
    dayOfMonth: r.dayOfMonth,
    notes: r.notes,
    isActive: r.isActive,
    lastGeneratedPeriod: r.lastGeneratedPeriod,
    nextDueDate: nextRecurringDate(r.dayOfMonth, r.lastGeneratedPeriod),
  };
}

/** ເດືອນນີ້ຖ້າຍັງບໍ່ໄດ້ສ້າງ, ບໍ່ດັ່ງນັ້ນເດືອນໜ້າ — ວັນທີ `dayOfMonth` (1–28 ຈຶ່ງມີທຸກເດືອນ). */
function nextRecurringDate(dayOfMonth: number, lastGeneratedPeriod: string | null): string {
  const { y, m0 } = currentMonthVte();
  const period = monthLabel(y, m0);
  const generated = lastGeneratedPeriod != null && lastGeneratedPeriod >= period;
  const target = generated ? new Date(Date.UTC(y, m0 + 1, 1)) : new Date(Date.UTC(y, m0, 1));
  return `${monthLabel(target.getUTCFullYear(), target.getUTCMonth())}-${String(dayOfMonth).padStart(2, '0')}`;
}

export async function listRecurring(
  auth: AccessTokenPayload,
  query: RecurringExpenseListQuery,
): Promise<RecurringExpenseView[]> {
  const branchId = scopeBranchId(auth, query.branchId);
  const rows = await prisma.recurringExpense.findMany({
    where: branchId ? { branchId } : {},
    include: RECURRING_INCLUDE,
    orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }, { title: 'asc' }],
  });
  return rows.map(toRecurringView);
}

export async function createRecurring(
  auth: AccessTokenPayload,
  input: CreateRecurringExpenseInput,
): Promise<RecurringExpenseView> {
  scopeBranchId(auth, input.branchId);
  if (!(await prisma.branch.findUnique({ where: { id: input.branchId } }))) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  await assertActiveCategory(input.categoryId);
  const row = await prisma.recurringExpense.create({
    data: { ...input, amount: dec(input.amount), createdById: auth.sub },
    include: RECURRING_INCLUDE,
  });
  const view = toRecurringView(row);
  await auditExpense(auth, 'CREATE', row.branchId, row.id, null, view, 'RecurringExpense');
  return view;
}

export async function updateRecurring(
  auth: AccessTokenPayload,
  id: string,
  input: UpdateRecurringExpenseInput,
): Promise<RecurringExpenseView> {
  const existing = await prisma.recurringExpense.findUnique({ where: { id }, include: RECURRING_INCLUDE });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບກົດລາຍຈ່າຍຊ້ຳ');
  scopeBranchId(auth, existing.branchId);
  if (input.categoryId) await assertActiveCategory(input.categoryId);
  const row = await prisma.recurringExpense.update({
    where: { id },
    data: {
      ...input,
      ...(input.amount !== undefined ? { amount: dec(input.amount) } : {}),
    },
    include: RECURRING_INCLUDE,
  });
  const view = toRecurringView(row);
  await auditExpense(auth, 'UPDATE', row.branchId, id, toRecurringView(existing), view, 'RecurringExpense');
  return view;
}

/**
 * Job ປະຈຳວັນ: ສ້າງ Expense DRAFT ຂອງເດືອນນີ້ ໃຫ້ທຸກກົດທີ່ເຖິງກຳນົດ (`dayOfMonth` ຜ່ານມາແລ້ວຕາມເວລາວຽງຈັນ)
 * ແລະ ຍັງບໍ່ໄດ້ສ້າງ. Idempotent — `@@unique([recurringExpenseId, recurringPeriod])` ກັນສ້າງຊ້ຳ, ຖ້າ job
 * ຢຸດໄປຫຼາຍມື້ ກໍ catch-up ໃນຮອບຕໍ່ໄປ (ສ້າງສະເພາະເດືອນປັດຈຸບັນ, ບໍ່ຍ້ອນຫຼັງ).
 */
export async function generateDueRecurringExpenses(now: Date = new Date()): Promise<{ created: number }> {
  const today = vientianeDateKey(now);
  const period = monthLabel(today.getUTCFullYear(), today.getUTCMonth());
  const dom = today.getUTCDate();

  const due = await prisma.recurringExpense.findMany({
    where: {
      isActive: true,
      dayOfMonth: { lte: dom },
      category: { isActive: true },
      OR: [{ lastGeneratedPeriod: null }, { lastGeneratedPeriod: { lt: period } }],
    },
  });

  let created = 0;
  for (const r of due) {
    // job ບໍ່ຄວນລົ້ມເພາະບໍ່ມີອັດຕາ — ຕົກໄປໃຊ້ 1 ແລ້ວ log (ຜູ້ໃຊ້ແກ້ອັດຕາໃນຮ່າງໄດ້).
    const fxRate = await resolveFxRate(r.currency).catch(() => {
      logger.warn({ ruleId: r.id, currency: r.currency }, 'recurring expense: no booking rate, using 1');
      return 1;
    });
    const expenseDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), r.dayOfMonth));
    try {
      await prisma.$transaction([
        prisma.expense.create({
          data: {
            branchId: r.branchId,
            categoryId: r.categoryId,
            title: r.title,
            amount: r.amount,
            currency: r.currency,
            fxRate: dec(fxRate),
            amountBase: dec(Math.round(r.amount.toNumber() * fxRate * 100) / 100),
            expenseDate,
            notes: r.notes,
            createdById: r.createdById,
            recurringExpenseId: r.id,
            recurringPeriod: period,
          },
        }),
        prisma.recurringExpense.update({ where: { id: r.id }, data: { lastGeneratedPeriod: period } }),
      ]);
      created += 1;
    } catch (err) {
      // P2002 = job ອື່ນສ້າງເດືອນນີ້ໄປແລ້ວ (race) — ຂ້າມ; ຄວາມຜິດພາດອື່ນໃຫ້ job ລົ້ມ (retry ຕາມ BullMQ).
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  return { created };
}
