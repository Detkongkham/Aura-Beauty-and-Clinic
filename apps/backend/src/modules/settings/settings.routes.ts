import { Router } from 'express';
import { z } from 'zod';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  getSettingsHandler,
  listTemplatesHandler,
  updateSettingsHandler,
  updateTemplateHandler,
} from './settings.controller.js';

/** Web Admin ▸ Settings + Notification Templates. SUPER_ADMIN only. */
export const settingsRouter: Router = Router();
settingsRouter.use(authGuard, roleGuard('SUPER_ADMIN'));
settingsRouter.get('/', getSettingsHandler);
settingsRouter.put('/', updateSettingsHandler);

const templateBodySchema = z.object({
  channel: z.string().trim().min(1).max(24).optional(),
  enabled: z.boolean().optional(),
  body: z.string().trim().max(2000).optional(),
  subject: z.string().trim().max(200).optional(),
});

export const notificationTemplatesRouter: Router = Router();
notificationTemplatesRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));
notificationTemplatesRouter.get('/', listTemplatesHandler);
notificationTemplatesRouter.put(
  '/:key',
  validateRequest({ body: templateBodySchema }),
  updateTemplateHandler,
);
