import { Router } from 'express';
import { z } from 'zod';
import { joinWaitlistSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as waitlist from './waitlist.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const waitlistRouter: Router = Router();
waitlistRouter.use(authGuard);

/** POST /waitlist — ເຂົ້າຄິວລໍຖ້າ. */
waitlistRouter.post(
  '/',
  validateRequest({ body: joinWaitlistSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await waitlist.joinWaitlist(req.auth!.sub, req.body) });
  }),
);

/** GET /waitlist/me */
waitlistRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await waitlist.myWaitlist(req.auth!.sub) });
  }),
);

/** DELETE /waitlist/:id */
waitlistRouter.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await waitlist.leaveWaitlist(req.auth!.sub, req.params.id!) });
  }),
);
