import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  announcementInputSchema,
  announcementPatchSchema,
  CHECKLIST_TASK_KEYS,
  checklistToggleSchema,
  portalScopeQuerySchema,
  type ChecklistTaskKey,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { getActor } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as portal from './portal.service.js';

const idParam = z.object({ id: z.string().uuid() });

/**
 * Announcing to the team: system settings admins, or anyone who manages staff (branch admins).
 * Non-super-admins are further limited to their own branch in the service.
 */
const canAnnounce: RequestHandler = (req, _res, next) => {
  getActor(req)
    .then((a) =>
      a.isSuperAdmin || a.permissions.has('settings:manage') || a.permissions.has('staff:manage')
        ? next()
        : next(ApiError.forbidden('ທ່ານບໍ່ມີສິດຈັດການປະກາດ')),
    )
    .catch(next);
};
const taskParam = z.object({ key: z.enum(CHECKLIST_TASK_KEYS) });

/** web-admin /portal — staff console only. */
export const portalRouter: Router = Router();
portalRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'));

/** GET /portal/summary — every "needs me" count the caller may see (keys missing = no permission). */
portalRouter.get(
  '/summary',
  validateRequest({ query: portalScopeQuerySchema }),
  asyncHandler(async (req, res) => {
    const actor = await getActor(req);
    res.json({ data: await portal.getSummary(actor, (req.query as { branchId?: string }).branchId) });
  }),
);

// --- Announcements ---

portalRouter.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.listAnnouncements(await getActor(req)) });
  }),
);

portalRouter.post(
  '/announcements/read-all',
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.markAllAnnouncementsRead(await getActor(req)) });
  }),
);

portalRouter.post(
  '/announcements/:id/read',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.markAnnouncementRead(await getActor(req), req.params.id!) });
  }),
);

portalRouter.get(
  '/announcements/manage',
  canAnnounce,
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.listAnnouncementsForManage(await getActor(req)) });
  }),
);

portalRouter.post(
  '/announcements',
  canAnnounce,
  validateRequest({ body: announcementInputSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await portal.createAnnouncement(await getActor(req), req.body) });
  }),
);

portalRouter.patch(
  '/announcements/:id',
  canAnnounce,
  validateRequest({ params: idParam, body: announcementPatchSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.updateAnnouncement(await getActor(req), req.params.id!, req.body) });
  }),
);

portalRouter.delete(
  '/announcements/:id',
  canAnnounce,
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await portal.deleteAnnouncement(await getActor(req), req.params.id!) });
  }),
);

// --- System status ---

/** GET /portal/system-status — API / DB / Redis / socket / worker / queues / backup. SUPER_ADMIN. */
portalRouter.get(
  '/system-status',
  roleGuard('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({ data: await portal.getSystemStatus() });
  }),
);

// --- Daily checklist ---

portalRouter.get(
  '/checklist',
  validateRequest({ query: portalScopeQuerySchema }),
  asyncHandler(async (req, res) => {
    const actor = await getActor(req);
    res.json({ data: await portal.getChecklist(actor, (req.query as { branchId?: string }).branchId) });
  }),
);

portalRouter.post(
  '/checklist/:key',
  validateRequest({ params: taskParam, body: checklistToggleSchema }),
  asyncHandler(async (req, res) => {
    const { done, branchId } = req.body as z.infer<typeof checklistToggleSchema>;
    res.json({
      data: await portal.toggleChecklistTask(
        await getActor(req),
        req.params.key as ChecklistTaskKey,
        done,
        branchId,
      ),
    });
  }),
);
