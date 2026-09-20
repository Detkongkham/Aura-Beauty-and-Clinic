import { Router } from 'express';
import { z } from 'zod';
import {
  addTendersSchema,
  createPaymentSchema,
  depositIntentSchema,
  paymentListQuerySchema,
  settleMockSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as payments from './payments.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const apptParamSchema = z.object({ appointmentId: z.string().uuid() });

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
