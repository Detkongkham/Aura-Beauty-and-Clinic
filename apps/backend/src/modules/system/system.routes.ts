import { Router } from 'express';
import { z } from 'zod';
import {
  paginationQuerySchema,
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as system from './system.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(system.NOTIFICATION_LIST_MAX).default(300),
});
const notificationActionSchema = z.enum(['read', 'unread', 'resolve', 'reopen']);
const notificationBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(system.NOTIFICATION_LIST_MAX),
  action: z.enum(['read', 'unread', 'resolve', 'reopen', 'delete']),
});

/** GET /notifications — inbox ຂອງຜູ້ໃຊ້ປັດຈຸບັນ + summary + 14-day trend. */
export const notificationsRouter: Router = Router();
notificationsRouter.use(authGuard);
notificationsRouter.get(
  '/',
  validateRequest({ query: notificationListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit } = req.query as unknown as { limit: number };
    res.json({ data: await system.listNotifications(req.auth!.sub, limit) });
  }),
);

/** GET /notifications/unread-count — badge ໃນ Topbar (poll). */
notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ data: await system.countUnreadNotifications(req.auth!.sub) });
  }),
);

/** POST /notifications/read-all */
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    res.json({ data: await system.markAllNotificationsRead(req.auth!.sub) });
  }),
);

/** POST /notifications/bulk — { ids, action } ສຳລັບການເລືອກຫຼາຍລາຍການ. */
notificationsRouter.post(
  '/bulk',
  validateRequest({ body: notificationBulkSchema }),
  asyncHandler(async (req, res) => {
    const { ids, action } = req.body as z.infer<typeof notificationBulkSchema>;
    res.json({ data: await system.bulkNotificationAction(req.auth!.sub, ids, action) });
  }),
);

/** PATCH /notifications/:id/{read|unread|resolve|reopen} */
notificationsRouter.patch(
  '/:id/:action',
  validateRequest({ params: idParamSchema.extend({ action: notificationActionSchema }) }),
  asyncHandler(async (req, res) => {
    const action = req.params.action as z.infer<typeof notificationActionSchema>;
    res.json({ data: await system.applyNotificationAction(req.auth!.sub, req.params.id!, action) });
  }),
);

/** POST /notifications/devices — ລົງທະບຽນ Expo push token. */
notificationsRouter.post(
  '/devices',
  validateRequest({ body: registerPushDeviceSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await system.registerPushDevice(req.auth!.sub, req.body) });
  }),
);

/** DELETE /notifications/devices — ຖອນ token (logout). */
notificationsRouter.delete(
  '/devices',
  validateRequest({ body: unregisterPushDeviceSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await system.unregisterPushDevice(req.auth!.sub, req.body.token) });
  }),
);

/** DELETE /notifications/:id */
notificationsRouter.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await system.deleteNotification(req.auth!.sub, req.params.id!) });
  }),
);

const auditQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  category: z.string().trim().optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** GET /audit-logs */
export const auditLogsRouter: Router = Router();
auditLogsRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));
auditLogsRouter.get(
  '/',
  validateRequest({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await system.listAuditLogs(req.query as unknown as system.AuditQuery) });
  }),
);

const eodQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
});

/** GET /reports/end-of-day */
export const reportsRouter: Router = Router();
reportsRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));
reportsRouter.get(
  '/end-of-day',
  validateRequest({ query: eodQuerySchema }),
  asyncHandler(async (req, res) => {
    const { date, branchId } = req.query as unknown as { date: string; branchId: string };
    res.json({ data: await system.endOfDayReport(date, branchId) });
  }),
);
