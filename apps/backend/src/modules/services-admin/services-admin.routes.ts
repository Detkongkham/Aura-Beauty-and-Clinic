import { Router } from 'express';
import { z } from 'zod';
import {
  adminServiceCreateSchema,
  adminServiceListQuerySchema,
  adminServiceUpdateSchema,
  serviceCategoryWriteSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './services-admin.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
// Role gate + the same permission web-admin's Services/Categories pages check before showing edit UI.
const manage = [roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'), permissionGuard('services:manage')];

/** Web Admin ▸ Services (admin CRUD + BOM + stats). Distinct from /catalog/services. */
export const servicesAdminRouter: Router = Router();
servicesAdminRouter.use(authGuard);

servicesAdminRouter.get(
  '/',
  validateRequest({ query: adminServiceListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listServices(req.query as never) });
  }),
);
servicesAdminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.serviceStats() });
  }),
);
servicesAdminRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getService(req.params.id!) });
  }),
);
servicesAdminRouter.post(
  '/',
  manage,
  validateRequest({ body: adminServiceCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createService(req.body) });
  }),
);
servicesAdminRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: adminServiceUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateService(req.params.id!, req.body) });
  }),
);
servicesAdminRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteService(req.params.id!);
    res.status(204).send();
  }),
);

/** Web Admin ▸ Service categories. */
export const serviceCategoriesRouter: Router = Router();
serviceCategoriesRouter.use(authGuard);

serviceCategoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listCategories() });
  }),
);
serviceCategoriesRouter.post(
  '/',
  manage,
  validateRequest({ body: serviceCategoryWriteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createCategory(req.body) });
  }),
);
serviceCategoriesRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: serviceCategoryWriteSchema.partial() }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateCategory(req.params.id!, req.body) });
  }),
);
serviceCategoriesRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteCategory(req.params.id!);
    res.status(204).send();
  }),
);
