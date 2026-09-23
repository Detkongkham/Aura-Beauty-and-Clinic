import { Router } from 'express';
import { z } from 'zod';
import {
  cashFundCountSchema,
  cashFundMovementSchema,
  createCashFundSchema,
  receiptScanSchema,
  updateCashFundSchema,
  expenseBudgetQuerySchema,
  expenseStatusCountsQuerySchema,
  updateExpenseSettingsSchema,
  upsertExpenseBudgetsSchema,
  voidExpenseSchema,
  bulkExpenseActionSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  createRecurringExpenseSchema,
  expenseListQuerySchema,
  expenseSummaryQuerySchema,
  payExpenseSchema,
  profitLossQuerySchema,
  recurringExpenseListQuerySchema,
  rejectExpenseSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  updateRecurringExpenseSchema,
  uploadExpenseAttachmentSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { getActor, permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './expenses.service.js';
import { scanReceipt } from './receipt.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const attachmentParamSchema = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });

/**
 * ໂມດູນ 39 W4 — Expenses. ອ່ານ = `expenses:view`; ສ້າງ/ແກ້/ສົ່ງ/ແນບ = `expenses:manage`;
 * ອະນຸມັດ/ປະຕິເສດ/ຈ່າຍ = `expenses:approve`. ຈຳກັດສາຂາຂອງ BRANCH_ADMIN ໃນ service.
 */
export const expensesRouter: Router = Router();
expensesRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

const view = permissionGuard('expenses:view');
const manage = permissionGuard('expenses:view', 'expenses:manage');
const approve = permissionGuard('expenses:view', 'expenses:approve');

// ── ໝວດ ──
expensesRouter.get(
  '/categories',
  view,
  validateRequest({ query: z.object({ includeInactive: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    const includeInactive = (req.query as { includeInactive?: string }).includeInactive === 'true';
    res.json({ data: await service.listCategories(includeInactive) });
  }),
);

// ໝວດເປັນຂໍ້ມູນກາງຂອງທຸກສາຂາ → ແກ້ໄດ້ສະເພາະ SUPER_ADMIN.
expensesRouter.post(
  '/categories',
  roleGuard('SUPER_ADMIN'),
  manage,
  validateRequest({ body: createExpenseCategorySchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createCategory(req.auth!, req.body) });
  }),
);

expensesRouter.patch(
  '/categories/:id',
  roleGuard('SUPER_ADMIN'),
  manage,
  validateRequest({ params: idParamSchema, body: updateExpenseCategorySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateCategory(req.auth!, req.params.id!, req.body) });
  }),
);

// ── ສະຫຼຸບ / P&L ──
expensesRouter.get(
  '/summary',
  view,
  validateRequest({ query: expenseSummaryQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.expenseSummary(req.auth!, req.query as never) });
  }),
);

expensesRouter.get(
  '/profit-loss',
  view,
  validateRequest({ query: profitLossQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.profitLoss(req.auth!, req.query as never) });
  }),
);

// ── E1/E3 ການຕັ້ງຄ່າ (ອັດຕາບັນທຶກບັນຊີ + ເພດານອະນຸມັດ) ──
expensesRouter.get(
  '/settings',
  view,
  asyncHandler(async (_req, res) => {
    res.json({ data: await service.getExpenseSettings() });
  }),
);

expensesRouter.put(
  '/settings',
  roleGuard('SUPER_ADMIN'),
  validateRequest({ body: updateExpenseSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateExpenseSettings(req.auth!, req.body) });
  }),
);

// ── E2 ງົບປະມານ ──
expensesRouter.get(
  '/budgets',
  view,
  validateRequest({ query: expenseBudgetQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getBudgets(req.auth!, req.query as never) });
  }),
);

expensesRouter.put(
  '/budgets',
  approve,
  validateRequest({ body: upsertExpenseBudgetsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.upsertBudgets(req.auth!, req.body) });
  }),
);

// ── E9 ເງິນສົດຍ່ອຍ — ອ່ານ = view; ສ້າງ/ເຕີມ/ຖອນ/ນັບ = approve (ຄວບຄຸມເງິນ) ──
const branchQuery = z.object({ branchId: z.string().uuid().optional() });

expensesRouter.get(
  '/cash-funds',
  view,
  validateRequest({ query: branchQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listCashFunds(req.auth!, (req.query as { branchId?: string }).branchId) });
  }),
);

expensesRouter.post(
  '/cash-funds',
  approve,
  validateRequest({ body: createCashFundSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createCashFund(req.auth!, req.body) });
  }),
);

expensesRouter.patch(
  '/cash-funds/:id',
  approve,
  validateRequest({ params: idParamSchema, body: updateCashFundSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateCashFund(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.get(
  '/cash-funds/:id/entries',
  view,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.cashFundEntries(req.auth!, req.params.id!) });
  }),
);

expensesRouter.post(
  '/cash-funds/:id/movements',
  approve,
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: cashFundMovementSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.moveCashFund(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.post(
  '/cash-funds/:id/count',
  approve,
  validateRequest({ params: idParamSchema, body: cashFundCountSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.countCashFund(req.auth!, req.params.id!, req.body) });
  }),
);

// ── E7 ອ່ານໃບຮັບເງິນ (OCR) — ບໍ່ບັນທຶກຫຍັງ, ຄືນຄ່າແນະນຳເທົ່ານັ້ນ ──
expensesRouter.post(
  '/receipt-scan',
  manage,
  validateRequest({ body: receiptScanSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await scanReceipt(req.body) });
  }),
);

// ── E12 ຈຳນວນຕໍ່ສະຖານະຕາມຕົວກອງ ──
expensesRouter.get(
  '/status-counts',
  view,
  validateRequest({ query: expenseStatusCountsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.expenseStatusCounts(req.auth!, req.query as never) });
  }),
);

// ── ລາຍຈ່າຍຊ້ຳ ──
expensesRouter.get(
  '/recurring',
  view,
  validateRequest({ query: recurringExpenseListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listRecurring(req.auth!, req.query as never) });
  }),
);

expensesRouter.post(
  '/recurring',
  manage,
  validateRequest({ body: createRecurringExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createRecurring(req.auth!, req.body) });
  }),
);

expensesRouter.patch(
  '/recurring/:id',
  manage,
  validateRequest({ params: idParamSchema, body: updateRecurringExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateRecurring(req.auth!, req.params.id!, req.body) });
  }),
);

// ── ລາຍຈ່າຍ ──
expensesRouter.get(
  '/',
  view,
  validateRequest({ query: expenseListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listExpenses(req.auth!, req.query as never) });
  }),
);

expensesRouter.post(
  '/',
  manage,
  requireIdempotencyKey(),
  validateRequest({ body: createExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createExpense(req.auth!, req.body) });
  }),
);

// ດຳເນີນການຫຼາຍລາຍການ — ສິດຂຶ້ນກັບ action: submit = manage, approve/pay = approve.
expensesRouter.post(
  '/bulk',
  view,
  requireIdempotencyKey(),
  validateRequest({ body: bulkExpenseActionSchema }),
  asyncHandler(async (req, res) => {
    const actor = await getActor(req);
    const needed = req.body.action === 'submit' ? 'expenses:manage' : 'expenses:approve';
    if (!actor.isSuperAdmin && !actor.permissions.has(needed)) throw ApiError.forbidden('ບໍ່ມີສິດດຳເນີນການນີ້');
    res.json({ data: await service.bulkExpenseAction(req.auth!, req.body) });
  }),
);

expensesRouter.get(
  '/:id',
  view,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getExpense(req.auth!, req.params.id!) });
  }),
);

expensesRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: updateExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateExpense(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteExpense(req.auth!, req.params.id!);
    res.status(204).send();
  }),
);

expensesRouter.post(
  '/:id/submit',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.submitExpense(req.auth!, req.params.id!) });
  }),
);

expensesRouter.post(
  '/:id/approve',
  approve,
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.approveExpense(req.auth!, req.params.id!) });
  }),
);

expensesRouter.post(
  '/:id/reject',
  approve,
  validateRequest({ params: idParamSchema, body: rejectExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.rejectExpense(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.post(
  '/:id/pay',
  approve,
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: payExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.payExpense(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.post(
  '/:id/void',
  approve,
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: voidExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.voidExpense(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.get(
  '/:id/history',
  view,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.expenseHistory(req.auth!, req.params.id!) });
  }),
);

expensesRouter.post(
  '/:id/attachments',
  manage,
  validateRequest({ params: idParamSchema, body: uploadExpenseAttachmentSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.addAttachment(req.auth!, req.params.id!, req.body) });
  }),
);

expensesRouter.delete(
  '/:id/attachments/:attachmentId',
  manage,
  validateRequest({ params: attachmentParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.removeAttachment(req.auth!, req.params.id!, req.params.attachmentId!) });
  }),
);
