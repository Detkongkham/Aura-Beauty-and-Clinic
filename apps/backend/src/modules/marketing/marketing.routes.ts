import { Router } from 'express';
import { z } from 'zod';
import {
  campaignListQuerySchema,
  createCampaignSchema,
  updateCampaignSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as marketing from './marketing.service.js';

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
