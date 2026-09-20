import { Router } from 'express';
import { z } from 'zod';
import {
  bonusBulkPaidSchema,
  bonusPaidSchema,
  commissionBulkPaySchema,
  commissionPaySchema,
  kpiGoalWriteSchema,
  kpiRecomputeSchema,
  payrollQuerySchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './payroll.service.js';

const staffIdParamSchema = z.object({ staffProfileId: z.string().uuid() });
const manage = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');

/** Web Admin ▸ Staff KPI / Leaderboard / Payroll (Module 34 + 09). */
export const payrollRouter: Router = Router();
payrollRouter.use(authGuard, manage);

payrollRouter.get(
  '/kpi',
  validateRequest({ query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getPayrollReport(req.query as never) });
  }),
);

payrollRouter.get(
  '/kpi/:staffProfileId/breakdown',
  validateRequest({ params: staffIdParamSchema, query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.getStaffBreakdown(req.params.staffProfileId!, req.query as never),
    });
  }),
);

payrollRouter.get(
  '/export',
  validateRequest({ query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filename, csv } = await svc.exportPayrollCsv(req.query as never);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);

payrollRouter.put(
  '/kpi/:staffProfileId',
  validateRequest({ params: staffIdParamSchema, body: kpiGoalWriteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setKpiGoal(req.params.staffProfileId!, req.body) });
  }),
);

payrollRouter.post(
  '/kpi/recompute',
  validateRequest({ body: kpiRecomputeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.recomputeKpi(req.body) });
  }),
);

payrollRouter.patch(
  '/kpi/:staffProfileId/bonus-paid',
  validateRequest({ params: staffIdParamSchema, body: bonusPaidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setBonusPaid(req.params.staffProfileId!, req.body) });
  }),
);

payrollRouter.post(
  '/commissions/pay',
  validateRequest({ body: commissionPaySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.payCommissions(req.body) });
  }),
);

payrollRouter.post(
  '/commissions/pay-bulk',
  validateRequest({ body: commissionBulkPaySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.payCommissionsBulk(req.body) });
  }),
);

payrollRouter.patch(
  '/kpi/bonus-paid-bulk',
  validateRequest({ body: bonusBulkPaidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setBonusPaidBulk(req.body) });
  }),
);
