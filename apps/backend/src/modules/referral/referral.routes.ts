import { Router } from 'express';
import { z } from 'zod';
import {
  affiliateListQuerySchema,
  createAffiliatePayoutSchema,
  enrollAffiliateSchema,
  paginationQuerySchema,
  updateAffiliatePayoutStatusSchema,
  updateAffiliateSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as affiliate from './affiliate.service.js';
import * as referral from './referral.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** /referral — Customer App ▸ ແນະນຳໝູ່ (Module 33). */
export const referralRouter: Router = Router();
referralRouter.use(authGuard);

referralRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await referral.getMyReferral(req.auth!.sub) });
  }),
);

referralRouter.get(
  '/me/usages',
  validateRequest({ query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await referral.getMyUsages(req.auth!.sub, req.query as never) });
  }),
);

/** /affiliate/me — dashboard ຂອງ affiliate ເອງ. */
export const affiliateSelfRouter: Router = Router();
affiliateSelfRouter.use(authGuard);
affiliateSelfRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.getMyAffiliate(req.auth!.sub) });
  }),
);

/** /affiliates — Web Admin ▸ Affiliate partners (Module 33). */
export const affiliatesRouter: Router = Router();
affiliatesRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

affiliatesRouter.get(
  '/',
  validateRequest({ query: affiliateListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.listAffiliates(req.query as never) });
  }),
);

affiliatesRouter.post(
  '/',
  validateRequest({ body: enrollAffiliateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await affiliate.enrollAffiliate(req.body) });
  }),
);

affiliatesRouter.patch(
  '/:id',
  validateRequest({ params: idParamSchema, body: updateAffiliateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.updateAffiliate(req.params.id!, req.body) });
  }),
);

affiliatesRouter.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.removeAffiliate(req.params.id!) });
  }),
);

affiliatesRouter.get(
  '/:id/payouts',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.listPayouts(req.params.id!) });
  }),
);

affiliatesRouter.post(
  '/:id/payouts',
  validateRequest({ params: idParamSchema, body: createAffiliatePayoutSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await affiliate.createPayout(req.params.id!, req.body) });
  }),
);

affiliatesRouter.patch(
  '/payouts/:id',
  validateRequest({ params: idParamSchema, body: updateAffiliatePayoutStatusSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await affiliate.setPayoutStatus(req.params.id!, req.body) });
  }),
);
