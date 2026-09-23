import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  closePeriodSchema,
  matchLineSchema,
  reconSettingsSchema,
  reconciliationDayQuerySchema,
  reconciliationQuerySchema,
  resolveStatementSchema,
  resolveStatementsBulkSchema,
  statementImportSchema,
  upsertBankStatementSchema,
  monthKeySchema,
  type Permission,
} from '@abcp/shared-types';
import { getActor } from '../../../middlewares/permissionGuard.js';
import { roleGuard } from '../../../middlewares/roleGuard.js';
import { validateRequest } from '../../../middlewares/validateRequest.js';
import { ApiError } from '../../../utils/ApiError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as recon from './reconciliation.service.js';

/**
 * /payments-treasury/reconciliation/* — mount ພາຍໃຕ້ paymentsTreasuryRouter (authGuard ແລ້ວ).
 * ອ່ານ + ປ້ອນ statement: payments:manage ຫຼື payments:reconcile.
 * ອະນຸມັດສ່ວນຕ່າງ / ນຳເຂົ້າ / ຈັບຄູ່ / ປິດງວດ: payments:reconcile (G12).
 */
export const reconciliationRouter: Router = Router();
reconciliationRouter.use(roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

function anyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    getActor(req)
      .then((a) => (a.isSuperAdmin || perms.some((p) => a.permissions.has(p)) ? next() : next(ApiError.forbidden('ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້'))))
      .catch(next);
  };
}
const canRead = anyPermission('payments:manage', 'payments:reconcile');
const canReconcile = anyPermission('payments:reconcile');

const idParam = z.object({ id: z.string().uuid() });
const accountRange = z.object({
  bankAccountId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

reconciliationRouter.get(
  '/',
  canRead,
  validateRequest({ query: reconciliationQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.getReconciliation(req.auth!, req.query as never) });
  }),
);

reconciliationRouter.get(
  '/day',
  canRead,
  validateRequest({ query: reconciliationDayQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.getReconciliationDay(req.auth!, req.query as never) });
  }),
);

// ── statements ──
reconciliationRouter.put(
  '/statements',
  canRead,
  validateRequest({ body: upsertBankStatementSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.upsertBankStatement(req.auth!, req.body) });
  }),
);
reconciliationRouter.post(
  '/statements/resolve-bulk',
  canReconcile,
  validateRequest({ body: resolveStatementsBulkSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.resolveStatementsBulk(req.auth!, req.body) });
  }),
);
reconciliationRouter.delete(
  '/statements/:id',
  canRead,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    await recon.deleteBankStatement(req.auth!, req.params.id!);
    res.status(204).send();
  }),
);
reconciliationRouter.post(
  '/statements/:id/resolve',
  canReconcile,
  validateRequest({ params: idParam, body: resolveStatementSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.resolveStatement(req.auth!, req.params.id!, req.body) });
  }),
);
reconciliationRouter.delete(
  '/statements/:id/resolve',
  canReconcile,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.reopenStatement(req.auth!, req.params.id!) });
  }),
);
reconciliationRouter.get(
  '/statements/:id/history',
  canRead,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.statementHistory(req.auth!, req.params.id!) });
  }),
);

// ── import + lines ──
reconciliationRouter.post(
  '/imports',
  canReconcile,
  validateRequest({ body: statementImportSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.importStatement(req.auth!, req.body) });
  }),
);
reconciliationRouter.get(
  '/imports',
  canRead,
  validateRequest({ query: z.object({ bankAccountId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.listImports(req.auth!, String(req.query.bankAccountId)) });
  }),
);
reconciliationRouter.delete(
  '/imports/:id',
  canReconcile,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    await recon.deleteImport(req.auth!, req.params.id!);
    res.status(204).send();
  }),
);
reconciliationRouter.post(
  '/rematch',
  canReconcile,
  validateRequest({ body: accountRange }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.rematch(req.auth!, req.body.bankAccountId, req.body.from, req.body.to) });
  }),
);
reconciliationRouter.get(
  '/lines/:id/candidates',
  canReconcile,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.lineCandidates(req.auth!, req.params.id!) });
  }),
);
reconciliationRouter.post(
  '/lines/:id/match',
  canReconcile,
  validateRequest({ params: idParam, body: matchLineSchema }),
  asyncHandler(async (req, res) => {
    await recon.matchLine(req.auth!, req.params.id!, req.body);
    res.status(204).send();
  }),
);
reconciliationRouter.post(
  '/lines/:id/unmatch',
  canReconcile,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    await recon.setLineStatus(req.auth!, req.params.id!, 'UNMATCHED');
    res.status(204).send();
  }),
);
reconciliationRouter.post(
  '/lines/:id/ignore',
  canReconcile,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    await recon.setLineStatus(req.auth!, req.params.id!, 'IGNORED');
    res.status(204).send();
  }),
);

// ── periods ──
reconciliationRouter.get(
  '/periods',
  canRead,
  validateRequest({ query: z.object({ branchId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.listPeriods(req.auth!, req.query.branchId as string | undefined) });
  }),
);
reconciliationRouter.get(
  '/periods/readiness',
  canRead,
  validateRequest({ query: z.object({ branchId: z.string().uuid(), month: monthKeySchema }) }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.periodReadiness(req.auth!, String(req.query.branchId), String(req.query.month)) });
  }),
);
reconciliationRouter.post(
  '/periods',
  canReconcile,
  validateRequest({ body: closePeriodSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await recon.closePeriod(req.auth!, req.body) });
  }),
);
reconciliationRouter.delete(
  '/periods/:id',
  canReconcile,
  validateRequest({ params: idParam, body: z.object({ reason: z.string().trim().max(300).optional() }).optional() }),
  asyncHandler(async (req, res) => {
    await recon.reopenPeriod(req.auth!, req.params.id!, req.body?.reason);
    res.status(204).send();
  }),
);

// ── settings ──
reconciliationRouter.get(
  '/settings',
  canRead,
  asyncHandler(async (_req, res) => {
    res.json({ data: await recon.getReconSettings() });
  }),
);
reconciliationRouter.put(
  '/settings',
  canReconcile,
  validateRequest({ body: reconSettingsSchema.partial() }),
  asyncHandler(async (req, res) => {
    res.json({ data: await recon.updateReconSettings(req.auth!, req.body) });
  }),
);
