import { Router } from 'express';
import {
  giftCardListQuerySchema,
  giftCardLookupSchema,
  issueGiftCardSchema,
  purchaseGiftCardSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as giftCards from './gift-cards.service.js';

export const giftCardsRouter: Router = Router();
giftCardsRouter.use(authGuard);

/**
 * POST /gift-cards/purchase — ລູກຄ້າຊື້ບັດຂອງຂວັນເອງ (ຕ້ອງຈ່າຍຜ່ານ Payment ກ່ອນ activate).
 * Wave 10A (ອຸດ C1): ບໍ່ອອກຍອດເງິນໃຫ້ໂດຍກົງອີກຕໍ່ໄປ — ນີ້ພຽງແຕ່ສ້າງບິນລໍຖ້າຈ່າຍ.
 */
giftCardsRouter.post(
  '/purchase',
  requireIdempotencyKey(),
  validateRequest({ body: purchaseGiftCardSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await giftCards.purchaseGiftCard(req.auth!.sub, req.body) });
  }),
);

/** POST /gift-cards/issue — admin ອອກດ້ວຍມື (ບໍ່ເກັບເງິນ), ບັງຄັບ issueReason + audit log. */
giftCardsRouter.post(
  '/issue',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: issueGiftCardSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await giftCards.issueGiftCard(req.auth!.sub, req.body) });
  }),
);

/** GET /gift-cards/me — ບັດທີ່ຊື້ / ໄດ້ຮັບ / ໃຊ້. */
giftCardsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await giftCards.myGiftCards(req.auth!.sub) });
  }),
);

/** GET /gift-cards/lookup?code= — ກວດຍອດກ່ອນໃຊ້. */
giftCardsRouter.get(
  '/lookup',
  validateRequest({ query: giftCardLookupSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await giftCards.lookupByCode(String(req.query.code)) });
  }),
);

/** GET /gift-cards — admin list. */
giftCardsRouter.get(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: giftCardListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await giftCards.listGiftCards(req.query as never) });
  }),
);
