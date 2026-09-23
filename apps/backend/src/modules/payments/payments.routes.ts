import { Router } from 'express';
import { z } from 'zod';
import {
  addTendersSchema,
  createPaymentSchema,
  createRefundSchema,
  payRefundSchema,
  refundListQuerySchema,
  rejectRefundSchema,
  vatReportQuerySchema,
  vatSettingsSchema,
  voidPaymentSchema,
  depositIntentSchema,
  paymentListQuerySchema,
  settleMockSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as payments from './payments.service.js';
import * as docs from './payments.docs.service.js';
import * as refunds from './refunds.service.js';
import { getVatSettings, updateVatSettings } from './vat.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const apptParamSchema = z.object({ appointmentId: z.string().uuid() });
const ADMIN = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');

export const paymentsRouter: Router = Router();
paymentsRouter.use(authGuard);

/** POST /payments — ເປີດບິນ (idempotent ຕໍ່ appointment; ບັງຄັບ Idempotency-Key ອີກຊັ້ນໜຶ່ງ). */
paymentsRouter.post(
  '/',
  requireIdempotencyKey(),
  validateRequest({ body: createPaymentSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await payments.createPayment(req.auth!, req.body) });
  }),
);

/** GET /payments — admin list. */
paymentsRouter.get(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: paymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.listPayments(req.query as never) });
  }),
);

/** GET /payments/summary — finance dashboard. */
paymentsRouter.get(
  '/summary',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: paymentListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.financeSummary(req.query as never) });
  }),
);

// ---- Wave 10B: VAT / ລາຍງານ VAT / refund / void / ໃບຮັບເງິນ ----

/** GET /payments/vat-settings — ທຸກ admin ອ່ານໄດ້; PUT ສະເພາະ SUPER_ADMIN. */
paymentsRouter.get(
  '/vat-settings',
  ADMIN,
  asyncHandler(async (_req, res) => {
    res.json({ data: await getVatSettings() });
  }),
);

paymentsRouter.put(
  '/vat-settings',
  roleGuard('SUPER_ADMIN'),
  validateRequest({ body: vatSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await updateVatSettings(req.body) });
  }),
);

/** GET /payments/vat-report?month=YYYY-MM&branchId= */
paymentsRouter.get(
  '/vat-report',
  ADMIN,
  permissionGuard('finance:view'),
  validateRequest({ query: vatReportQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await docs.vatReport(req.auth!, req.query as never) });
  }),
);

/** GET /payments/refunds — ຄິວຄຳຮ້ອງຄືນເງິນ. */
paymentsRouter.get(
  '/refunds',
  ADMIN,
  permissionGuard('finance:view'),
  validateRequest({ query: refundListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await refunds.listRefunds(req.auth!, req.query as never) });
  }),
);

paymentsRouter.post(
  '/refunds/:id/approve',
  ADMIN,
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await refunds.approveRefund(req.auth!, req.params.id!) });
  }),
);

paymentsRouter.post(
  '/refunds/:id/reject',
  ADMIN,
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema, body: rejectRefundSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await refunds.rejectRefund(req.auth!, req.params.id!, req.body.reason) });
  }),
);

paymentsRouter.post(
  '/refunds/:id/pay',
  ADMIN,
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema, body: payRefundSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await refunds.payRefund(req.auth!, req.params.id!, req.body) });
  }),
);

/** POST /payments/:id/refunds — ຂໍຄືນເງິນ (ຄົນລະຄົນກັບຜູ້ອະນຸມັດ). */
paymentsRouter.post(
  '/:id/refunds',
  ADMIN,
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema, body: createRefundSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await refunds.createRefund(req.auth!, req.params.id!, req.body) });
  }),
);

/** POST /payments/:id/void — ຍົກເລີກບິນທີ່ຍັງບໍ່ມີເງິນເຂົ້າ. */
paymentsRouter.post(
  '/:id/void',
  ADMIN,
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema, body: voidPaymentSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await docs.voidPayment(req.auth!, req.params.id!, req.body.reason) });
  }),
);

/** GET /payments/:id/receipt — ໃບຮັບເງິນ (ພະນັກງານ ຫຼື ເຈົ້າຂອງບິນ). */
paymentsRouter.get(
  '/:id/receipt',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await docs.getReceipt(req.auth!, req.params.id!) });
  }),
);

/** GET /payments/by-appointment/:appointmentId */
paymentsRouter.get(
  '/by-appointment/:appointmentId',
  validateRequest({ params: apptParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.getByAppointment(req.params.appointmentId!, req.auth!) });
  }),
);

/** GET /payments/:id */
paymentsRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.getPayment(req.params.id!, req.auth!) });
  }),
);

/** POST /payments/:id/deposit-intent — mock BCEL One QR / card charge. */
paymentsRouter.post(
  '/:id/deposit-intent',
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: depositIntentSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.createDepositIntent(req.params.id!, req.auth!, req.body) });
  }),
);

/** POST /payments/:id/settle-mock — demo: ຢືນຢັນ QR reference. */
paymentsRouter.post(
  '/:id/settle-mock',
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: settleMockSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.settleMock(req.params.id!, req.auth!, req.body) });
  }),
);

/** POST /payments/:id/tenders — split tender. */
paymentsRouter.post(
  '/:id/tenders',
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: addTendersSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await payments.addTenders(req.params.id!, req.auth!, req.body) });
  }),
);
