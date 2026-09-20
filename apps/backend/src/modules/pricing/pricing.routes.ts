import { Router } from 'express';
import { z } from 'zod';
import {
  createPricingRuleSchema,
  priceQuoteQuerySchema,
  promotionListQuerySchema,
  pricingRuleListQuerySchema,
  updatePricingRuleSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as pricing from './pricing.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** GET /pricing/quote — ເປີດໃຫ້ຜູ້ໃຊ້ທີ່ login ແລ້ວທຸກ role (ໃຊ້ຕອນຈອງ). */
export const pricingQuoteRouter: Router = Router();
pricingQuoteRouter.use(authGuard);
pricingQuoteRouter.get(
  '/quote',
  validateRequest({ query: priceQuoteQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await pricing.quote(req.query as never) });
  }),
);

/** GET /pricing/promotions — ໂປຣໂມຊັນທີ່ມີຜົນແທ້ ສຳລັບ Home ຂອງລູກຄ້າ. */
pricingQuoteRouter.get(
  '/promotions',
  validateRequest({ query: promotionListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await pricing.listPromotions(req.query as never) });
  }),
);

/** /pricing-rules — Web Admin ▸ Dynamic Pricing (Module 28). */
export const pricingRulesRouter: Router = Router();
pricingRulesRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

pricingRulesRouter.get(
  '/',
  validateRequest({ query: pricingRuleListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await pricing.listRules(req.query as never) });
  }),
);

pricingRulesRouter.post(
  '/',
  validateRequest({ body: createPricingRuleSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await pricing.createRule(req.body) });
  }),
);

pricingRulesRouter.patch(
  '/:id',
  validateRequest({ params: idParamSchema, body: updatePricingRuleSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await pricing.updateRule(req.params.id!, req.body) });
  }),
);

pricingRulesRouter.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await pricing.deleteRule(req.params.id!) });
  }),
);
