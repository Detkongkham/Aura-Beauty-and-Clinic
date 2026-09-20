import { Router } from 'express';
import { z } from 'zod';
import {
  loyaltyAccountListQuerySchema,
  loyaltyAdjustSchema,
  loyaltyLedgerQuerySchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as loyalty from './loyalty.service.js';

const userIdParamSchema = z.object({ userId: z.string().uuid() });

export const loyaltyRouter: Router = Router();
loyaltyRouter.use(authGuard);

/** GET /loyalty/me — ບັນຊີຄະແນນຂອງຕົນເອງ. */
loyaltyRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await loyalty.getMyAccount(req.auth!.sub) });
  }),
);

/** GET /loyalty/me/ledger */
loyaltyRouter.get(
  '/me/ledger',
  validateRequest({ query: loyaltyLedgerQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await loyalty.getMyLedger(req.auth!.sub, req.query as never),
    });
  }),
);

// ---- admin ----
loyaltyRouter.get(
  '/accounts',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: loyaltyAccountListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await loyalty.listAccounts(req.query as never) });
  }),
);

/** GET /loyalty/accounts/:userId/ledger — ປະຫວັດຄະແນນຂອງສະມາຊິກ (admin). */
loyaltyRouter.get(
  '/accounts/:userId/ledger',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: userIdParamSchema, query: loyaltyLedgerQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await loyalty.getMemberLedger(req.params.userId!, req.query as never) });
  }),
);

loyaltyRouter.post(
  '/accounts/:userId/adjust',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: userIdParamSchema, body: loyaltyAdjustSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await loyalty.adjustPoints(req.params.userId!, req.body) });
  }),
);
