import { json, Router } from 'express';
import { z } from 'zod';
import { chatMessagesQuerySchema, sendChatMediaSchema, sendChatMessageSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { emitChatMessage } from '../../realtime/socket.js';
import * as chat from './chat.service.js';

const appointmentIdParamSchema = z.object({ appointmentId: z.string().uuid() });
const threadIdParamSchema = z.object({ id: z.string().uuid() });

/** /chat — ໂມດູນ 21. GET/POST ensure ໃຫ້ນັດໝາຍໜຶ່ງມີ thread, ອ່ານ/ສົ່ງຂໍ້ຄວາມ. socket.io ເປັນທາງຫຼັກ
 * ສຳລັບການສົ່ງ (chat:message), REST ນີ້ເປັນ fallback + ໃຊ້ໂຫຼດ history. */
export const chatRouter: Router = Router();
chatRouter.use(authGuard);

chatRouter.get(
  '/appointments/:appointmentId/thread',
  validateRequest({ params: appointmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await chat.ensureThread(req.params.appointmentId!, req.auth!) });
  }),
);

chatRouter.post(
  '/appointments/:appointmentId/thread',
  validateRequest({ params: appointmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await chat.ensureThread(req.params.appointmentId!, req.auth!) });
  }),
);

chatRouter.get(
  '/threads/:id/messages',
  validateRequest({ params: threadIdParamSchema, query: chatMessagesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await chat.listMessages(req.params.id!, req.auth!, req.query as never) });
  }),
);

chatRouter.post(
  '/threads/:id/messages',
  validateRequest({ params: threadIdParamSchema, body: sendChatMessageSchema }),
  asyncHandler(async (req, res) => {
    const message = await chat.postMessage(req.params.id!, req.auth!, req.body.body);
    emitChatMessage(message);
    res.status(201).json({ data: message });
  }),
);

// ຮູບ/ສຽງ base64 ອາດໃຫຍ່ກວ່າ global body-size limit — ຍົກ limit ສະເພາະ route ນີ້ (ຄືກັນກັບ
// staff-portal treatment photos).
chatRouter.post(
  '/threads/:id/media',
  json({ limit: '14mb' }),
  validateRequest({ params: threadIdParamSchema, body: sendChatMediaSchema }),
  asyncHandler(async (req, res) => {
    const message = await chat.postMediaMessage(req.params.id!, req.auth!, req.body);
    emitChatMessage(message);
    res.status(201).json({ data: message });
  }),
);
