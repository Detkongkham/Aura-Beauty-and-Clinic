import { Router } from 'express';
import { z } from 'zod';
import {
  conversationListQuerySchema,
  createConversationSchema,
  reportConversationSchema,
  reviewChatReportSchema,
  setThreadLockSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { directConversationLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorizeThreadAccess } from '../chat/chat.service.js';
import * as conversations from './conversations.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const userIdParamSchema = z.object({ userId: z.string().uuid() });
const mediaQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(60) });
const reportsQuerySchema = z.object({ status: z.enum(['PENDING', 'REVIEWED', 'ACTIONED']).optional() });

/** /conversations — ໂມດູນ 38 (Phase 8). `POST /` ຮັບ `type: 'STAFF_INTERNAL' | 'DIRECT'`. ອ່ານ/
 * ສົ່ງຂໍ້ຄວາມຍັງໃຊ້ `/chat/threads/:id/messages` ເກົ່າ (threadId ແບບທົ່ວໄປຢູ່ແລ້ວ). */
export const conversationsRouter: Router = Router();
conversationsRouter.use(authGuard);

conversationsRouter.get(
  '/',
  validateRequest({ query: conversationListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await conversations.listConversations(req.auth!, req.query as never) });
  }),
);

conversationsRouter.post(
  '/',
  directConversationLimiter,
  validateRequest({ body: createConversationSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as { type: 'STAFF_INTERNAL' | 'DIRECT' };
    const created =
      body.type === 'DIRECT'
        ? await conversations.createDirectConversation(
            (req.body as { targetUserId: string }).targetUserId,
            req.auth!,
          )
        : await conversations.createStaffConversation(
            (req.body as { participantIds: string[] }).participantIds,
            req.auth!,
          );
    res.status(201).json({ data: created });
  }),
);

conversationsRouter.patch(
  '/:id/lock',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: setThreadLockSchema }),
  asyncHandler(async (req, res) => {
    await conversations.setThreadLock(req.params.id!, req.body.isLocked);
    res.json({ data: { id: req.params.id, isLocked: req.body.isLocked } });
  }),
);

conversationsRouter.get(
  '/:id/media',
  validateRequest({ params: idParamSchema, query: mediaQuerySchema }),
  asyncHandler(async (req, res) => {
    await authorizeThreadAccess(req.params.id!, req.auth!);
    const { limit } = mediaQuerySchema.parse(req.query);
    res.json({ data: await conversations.getConversationMedia(req.params.id!, limit) });
  }),
);

conversationsRouter.post(
  '/:id/read',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await authorizeThreadAccess(req.params.id!, req.auth!);
    await conversations.markConversationRead(req.params.id!, req.auth!.sub);
    res.json({ data: { id: req.params.id } });
  }),
);

conversationsRouter.post(
  '/:id/report',
  validateRequest({ params: idParamSchema, body: reportConversationSchema }),
  asyncHandler(async (req, res) => {
    await conversations.reportConversation(req.params.id!, req.auth!, req.body);
    res.status(201).json({ data: { ok: true } });
  }),
);

conversationsRouter.get(
  '/blocks',
  asyncHandler(async (req, res) => {
    res.json({ data: await conversations.listBlockedUsers(req.auth!) });
  }),
);

conversationsRouter.post(
  '/block/:userId',
  validateRequest({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    await conversations.blockUser(req.auth!, req.params.userId!);
    res.json({ data: { blockedId: req.params.userId } });
  }),
);

conversationsRouter.delete(
  '/block/:userId',
  validateRequest({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    await conversations.unblockUser(req.auth!, req.params.userId!);
    res.json({ data: { blockedId: req.params.userId } });
  }),
);

// ---- Moderation (admin-only) — ໜ້າ /settings/chat-moderation ----
conversationsRouter.get(
  '/reports',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: reportsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await conversations.listChatReports((req.query as { status?: string }).status) });
  }),
);

conversationsRouter.patch(
  '/reports/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: reviewChatReportSchema }),
  asyncHandler(async (req, res) => {
    await conversations.reviewChatReport(req.params.id!, req.body.status);
    res.json({ data: { id: req.params.id, status: req.body.status } });
  }),
);
