import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  cashDrawerMovementSchema,
  cashPolicySchema,
  cashVarianceQuerySchema,
  closeCashDrawerSchema,
  openCashDrawerSchema,
} from '@abcp/shared-types';
import { getActor } from '../../../middlewares/permissionGuard.js';
import { roleGuard } from '../../../middlewares/roleGuard.js';
import { validateRequest } from '../../../middlewares/validateRequest.js';
import { ApiError } from '../../../utils/ApiError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as drawer from './cash-drawer.service.js';
import { getCashPolicy, updateCashPolicy } from './cash-policy.js';

/** /payments-treasury/cash-drawer/* (G10) — payments:manage ຫຼື payments:reconcile. */
export const cashDrawerRouter: Router = Router();
cashDrawerRouter.use(roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));
cashDrawerRouter.use((req: Request, _res: Response, next: NextFunction) => {
  getActor(req)
    .then((a) =>
      a.isSuperAdmin || a.permissions.has('payments:manage') || a.permissions.has('payments:reconcile')
        ? next()
        : next(ApiError.forbidden('ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້')),
    )
    .catch(next);
});

const idParam = z.object({ id: z.string().uuid() });
const branchQuery = z.object({ branchId: z.string().uuid().optional() });

cashDrawerRouter.get(
  '/current',
  validateRequest({ query: branchQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.currentSession(req.auth!, req.query.branchId as string | undefined) });
  }),
);
cashDrawerRouter.get(
  '/sessions',
  validateRequest({ query: branchQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.listSessions(req.auth!, req.query.branchId as string | undefined) });
  }),
);
cashDrawerRouter.post(
  '/sessions',
  validateRequest({ body: openCashDrawerSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await drawer.openSession(req.auth!, req.body) });
  }),
);
cashDrawerRouter.post(
  '/sessions/:id/movements',
  validateRequest({ params: idParam, body: cashDrawerMovementSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.addMovement(req.auth!, req.params.id!, req.body) });
  }),
);
cashDrawerRouter.post(
  '/sessions/:id/close',
  validateRequest({ params: idParam, body: closeCashDrawerSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.closeSession(req.auth!, req.params.id!, req.body) });
  }),
);

/** GET /cash-drawer/sessions/:id/z-report — Z-report (ກະທີ່ປິດ = snapshot ບໍ່ປ່ຽນ; ກະທີ່ເປີດ = ເບິ່ງລ່ວງໜ້າ). */
cashDrawerRouter.get(
  '/sessions/:id/z-report',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.getZReport(req.auth!, req.params.id!) });
  }),
);

/** GET /cash-drawer/variance-report?from&to&branchId — over/short ຕາມພະນັກງານ + ສາຂາ. */
cashDrawerRouter.get(
  '/variance-report',
  validateRequest({ query: cashVarianceQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await drawer.varianceReport(req.auth!, req.query as never) });
  }),
);

cashDrawerRouter.get(
  '/policy',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getCashPolicy() });
  }),
);

cashDrawerRouter.put(
  '/policy',
  roleGuard('SUPER_ADMIN'),
  validateRequest({ body: cashPolicySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await updateCashPolicy(req.body) });
  }),
);
