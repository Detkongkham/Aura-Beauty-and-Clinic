import { Router } from 'express';
import { telegramUpdateSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import * as telegram from './telegram.service.js';

/**
 * /chatbot/telegram — Module 35 Telegram pilot.
 * `link-code`: Customer App ▸ authGuard ; `webhook`: Telegram ຮຽກເອງ — ບໍ່ມີ authGuard, ຢືນຢັນ
 * ດ້ວຍ secret-token header ຕາມທີ່ Telegram ແນະນຳ ແທນ.
 */
export const chatbotRouter: Router = Router();

chatbotRouter.post(
  '/telegram/link-code',
  authGuard,
  asyncHandler(async (req, res) => {
    res.json({ data: await telegram.generateLinkCode(req.auth!.sub) });
  }),
);

chatbotRouter.post(
  '/telegram/webhook',
  validateRequest({ body: telegramUpdateSchema }),
  asyncHandler(async (req, res) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = req.get('X-Telegram-Bot-Api-Secret-Token');
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        throw ApiError.forbidden('webhook secret ບໍ່ຖືກຕ້ອງ');
      }
    }
    await telegram.handleUpdate(req.body);
    res.json({ ok: true });
  }),
);
