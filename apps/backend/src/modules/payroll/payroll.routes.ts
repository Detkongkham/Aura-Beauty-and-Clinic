import { Router } from 'express';
import { z } from 'zod';
import {
  payrollAdjustmentCreateSchema,
  payrollAdjustmentQuerySchema,
  payrollRunCreateSchema,
  payrollRunListQuerySchema,
  payrollRunPaySchema,
  payrollRunReopenSchema,
  payrollSettingsSchema,
  staffSalarySchema,
  kpiBulkTargetSchema,
  payrollYtdQuerySchema,
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
import type { Request } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './payroll.service.js';
import * as runs from './payroll-run.service.js';

const staffIdParamSchema = z.object({ staffProfileId: z.string().uuid() });
const idParamSchema = z.object({ id: z.string().uuid() });
const manage = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');
/** G3.2 — ອະນຸມັດ/ຈ່າຍ/ເປີດຄືນຮອບ ແລະ ແກ້ເງິນເດືອນ/ການຕັ້ງຄ່າ = SUPER_ADMIN (ແຍກຈາກຜູ້ກຽມ). */
const owner = roleGuard('SUPER_ADMIN');

/** Web Admin ▸ Staff KPI / Leaderboard / Payroll (Module 34 + 09). */
export const payrollRouter: Router = Router();
payrollRouter.use(authGuard, manage);

/**
 * C4 — BRANCH_ADMIN ຖືກບັງຄັບໃຫ້ຢູ່ໃນສາຂາຕົນ: ບໍ່ສົ່ງ branchId → ໃຊ້ສາຂາຕົນ; ສົ່ງສາຂາອື່ນ → 403.
 * ບັນຊີ BRANCH_ADMIN ທີ່ບໍ່ມີສາຂາ → 403 (ບໍ່ປ່ອຍໃຫ້ເຫັນທຸກສາຂາ).
 */
function actorOf(req: Request): svc.PayrollActor {
  const auth = req.auth!;
  if (auth.role === 'SUPER_ADMIN') return { userId: auth.sub, branchId: null };
  if (!auth.branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາ');
  return { userId: auth.sub, branchId: auth.branchId };
}

function scopedQuery(req: Request): { monthYear?: string; branchId?: string } {
  const actor = actorOf(req);
  const q = req.query as { monthYear?: string; branchId?: string };
  if (actor.branchId && q.branchId && q.branchId !== actor.branchId) {
    throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
  return { monthYear: q.monthYear, branchId: actor.branchId ?? q.branchId };
}

payrollRouter.get(
  '/kpi',
  validateRequest({ query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getPayrollReport(scopedQuery(req)) });
  }),
);

payrollRouter.get(
  '/kpi/:staffProfileId/breakdown',
  validateRequest({ params: staffIdParamSchema, query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.getStaffBreakdown(req.params.staffProfileId!, scopedQuery(req), actorOf(req)),
    });
  }),
);

payrollRouter.get(
  '/export',
  validateRequest({ query: payrollQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filename, csv } = await svc.exportPayrollCsv(scopedQuery(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);

payrollRouter.put(
  '/kpi/:staffProfileId',
  validateRequest({ params: staffIdParamSchema, body: kpiGoalWriteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setKpiGoal(req.params.staffProfileId!, req.body, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/kpi/recompute',
  validateRequest({ body: kpiRecomputeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.recomputeKpi(req.body, actorOf(req)) });
  }),
);

payrollRouter.patch(
  '/kpi/:staffProfileId/bonus-paid',
  validateRequest({ params: staffIdParamSchema, body: bonusPaidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setBonusPaid(req.params.staffProfileId!, req.body, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/commissions/pay',
  validateRequest({ body: commissionPaySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.payCommissions(req.body, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/commissions/pay-bulk',
  validateRequest({ body: commissionBulkPaySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.payCommissionsBulk(req.body, actorOf(req)) });
  }),
);

payrollRouter.patch(
  '/kpi/bonus-paid-bulk',
  validateRequest({ body: bonusBulkPaidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setBonusPaidBulk(req.body, actorOf(req)) });
  }),
);

// ---- Payroll P2/P3/P4 — settings, salary, adjustments, pay runs, payslips ----

payrollRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ data: await runs.getPayrollSettings() });
  }),
);

payrollRouter.put(
  '/settings',
  owner,
  validateRequest({ body: payrollSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.updatePayrollSettings(req.body, actorOf(req)) });
  }),
);

payrollRouter.get(
  '/staff/:staffProfileId/salary',
  validateRequest({ params: staffIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.getStaffSalary(req.params.staffProfileId!) });
  }),
);

payrollRouter.put(
  '/staff/:staffProfileId/salary',
  owner,
  validateRequest({ params: staffIdParamSchema, body: staffSalarySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.setStaffSalary(req.params.staffProfileId!, req.body, actorOf(req)) });
  }),
);

payrollRouter.get(
  '/adjustments',
  validateRequest({ query: payrollAdjustmentQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.listAdjustments(req.query as never, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/adjustments',
  validateRequest({ body: payrollAdjustmentCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await runs.createAdjustment(req.body, actorOf(req)) });
  }),
);

payrollRouter.delete(
  '/adjustments/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await runs.deleteAdjustment(req.params.id!, actorOf(req));
    res.status(204).end();
  }),
);

payrollRouter.get(
  '/runs',
  validateRequest({ query: payrollRunListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.listRuns(req.query as never, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/runs',
  validateRequest({ body: payrollRunCreateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.prepareRun(req.body, actorOf(req)) });
  }),
);

payrollRouter.get(
  '/runs/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.getRun(req.params.id!, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/runs/:id/approve',
  owner,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.approveRun(req.params.id!, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/runs/:id/reopen',
  owner,
  validateRequest({ params: idParamSchema, body: payrollRunReopenSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.reopenRun(req.params.id!, req.body, actorOf(req)) });
  }),
);

payrollRouter.post(
  '/runs/:id/pay',
  owner,
  validateRequest({ params: idParamSchema, body: payrollRunPaySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.payRun(req.params.id!, req.body, actorOf(req)) });
  }),
);

payrollRouter.get(
  '/payslips/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.getPayslip(req.params.id!, actorOf(req)) });
  }),
);

// ---- G1.8 — per-service commission rate --------------------------------------

payrollRouter.get(
  '/service-rules',
  asyncHandler(async (_req, res) => {
    res.json({ data: await runs.listServiceCommissionRules() });
  }),
);

payrollRouter.put(
  '/service-rules/:serviceId',
  owner,
  validateRequest({
    params: z.object({ serviceId: z.string().uuid() }),
    body: z.object({ rate: z.number().min(0).max(1).nullable() }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.setServiceCommissionRule(req.params.serviceId!, req.body.rate, actorOf(req)) });
  }),
);

// ---- G5.5 bulk targets · G5.3 year-to-date --------------------------------

payrollRouter.post(
  '/kpi/bulk-targets',
  validateRequest({ body: kpiBulkTargetSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setKpiTargetsBulk(req.body, actorOf(req)) });
  }),
);

payrollRouter.get(
  '/ytd',
  validateRequest({ query: payrollYtdQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await runs.payrollYtd(req.query as never, actorOf(req)) });
  }),
);

