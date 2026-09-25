import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  createPackageSchema,
  packageListQuerySchema,
  purchasePackageSchema,
  updatePackageSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as packages from './packages.service.js';

const idParam = z.object({ id: z.string().uuid() });
const adminQuery = z.object({ branchId: z.string().uuid().optional() });

/** BRANCH_ADMIN → ສາຂາຂອງຕົນ; SUPER_ADMIN → null (ບໍ່ຈຳກັດ). */
const adminScope = (req: Request): string | null => (req.auth?.role === 'BRANCH_ADMIN' ? (req.auth.branchId ?? null) : null);

export const packagesRouter: Router = Router();
packagesRouter.use(authGuard);

/** GET /packages — ແພັກເກັດທີ່ເປີດຂາຍ (?branchId, ?serviceId). */
packagesRouter.get(
  '/',
  validateRequest({ query: packageListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.listPackages(req.query as never) });
  }),
);

/** GET /packages/me — ຄອສຂອງຂ້ອຍ. (ຕ້ອງປະກາດກ່ອນ /:id) */
packagesRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.myPackages(req.auth!.sub) });
  }),
);

/** GET /packages/me/:id/usage — ປະຫວັດການໃຊ້ສິດຂອງແພັກເກັດນັ້ນ. */
packagesRouter.get(
  '/me/:id/usage',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.packageUsage(req.auth!.sub, req.params.id!) });
  }),
);

/** DELETE /packages/me/:id — ຍົກເລີກການຊື້ທີ່ຍັງບໍ່ຈ່າຍ. */
packagesRouter.delete(
  '/me/:id',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    await packages.cancelPendingPurchase(req.auth!.sub, req.params.id!);
    res.status(204).end();
  }),
);

/** GET /packages/admin — admin ເບິ່ງທັງໝົດ (ລວມປິດຂາຍ). */
packagesRouter.get(
  '/admin',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: adminQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.adminListPackages(adminScope(req) ?? (req.query.branchId as string | undefined)) });
  }),
);

packagesRouter.post(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: createPackageSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await packages.createPackage(req.body, adminScope(req)) });
  }),
);

packagesRouter.patch(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParam, body: updatePackageSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.updatePackage(req.params.id!, req.body, adminScope(req)) });
  }),
);

packagesRouter.get(
  '/:id',
  validateRequest({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ data: await packages.getPackage(req.params.id!) });
  }),
);

/** POST /packages/:id/purchase — ສ້າງບິນລໍຖ້າຈ່າຍ; activate ເມື່ອຈ່າຍຄົບ. */
packagesRouter.post(
  '/:id/purchase',
  requireIdempotencyKey(),
  validateRequest({ params: idParam, body: purchasePackageSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await packages.purchasePackage(req.auth!.sub, req.params.id!) });
  }),
);
