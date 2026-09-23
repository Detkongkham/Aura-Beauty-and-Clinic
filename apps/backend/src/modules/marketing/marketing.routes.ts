import { Router } from 'express';
import { z } from 'zod';
import {
  campaignListQuerySchema,
  createCampaignSchema,
  createSuppressionSchema,
  marketingPolicySchema,
  suppressionListQuerySchema,
  updateCampaignSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as marketing from './marketing.service.js';
import * as consent from './consent.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const marketingRouter: Router = Router();
marketingRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

marketingRouter.get(
  '/campaigns',
  validateRequest({ query: campaignListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await marketing.listCampaigns(req.query as never) });
  }),
);

marketingRouter.post(
  '/campaigns',
  validateRequest({ body: createCampaignSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await marketing.createCampaign(req.body) });
  }),
);

marketingRouter.patch(
  '/campaigns/:id',
  validateRequest({ params: idParamSchema, body: updateCampaignSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await marketing.updateCampaign(req.params.id!, req.body) });
  }),
);

marketingRouter.delete(
  '/campaigns/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await marketing.deleteCampaign(req.params.id!) });
  }),
);

marketingRouter.get(
  '/campaigns/:id/recipients',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await marketing.getRecipients(req.params.id!) });
  }),
);

/** POST /marketing/campaigns/:id/run — manual sweep. */
marketingRouter.post(
  '/campaigns/:id/run',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await marketing.runCampaign(req.params.id!) });
  }),
);

// ---- Wave 10G: suppression / consent summary / policy (admin) ----

/** GET /marketing/channels — ຊ່ອງທາງໃດຕັ້ງຄ່າຜູ້ໃຫ້ບໍລິການແລ້ວ (ສົ່ງແຄມເປນໄດ້ຈິງ). */
marketingRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    res.json({ data: consent.channelStatus() });
  }),
);

marketingRouter.get(
  '/suppressions',
  validateRequest({ query: suppressionListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.listSuppressions(req.query as never) });
  }),
);

marketingRouter.post(
  '/suppressions',
  validateRequest({ body: createSuppressionSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await consent.addSuppression(req.body, req.auth!.sub) });
  }),
);

marketingRouter.delete(
  '/suppressions/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.removeSuppression(req.params.id!) });
  }),
);

marketingRouter.get(
  '/consent-summary',
  asyncHandler(async (_req, res) => {
    res.json({ data: await consent.consentSummary() });
  }),
);

marketingRouter.get(
  '/policy',
  asyncHandler(async (_req, res) => {
    res.json({ data: await consent.getPolicy() });
  }),
);

marketingRouter.put(
  '/policy',
  validateRequest({ body: marketingPolicySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.updatePolicy(req.body) });
  }),
);
