import { Router } from 'express';
import { z } from 'zod';
import {
  branchClosureCreateSchema,
  branchCreateSchema,
  branchInsightsQuerySchema,
  branchUpdateSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createBranchHandler,
  createClosureHandler,
  deleteClosureHandler,
  branchInsightsHandler,
  listBranchesHandler,
  listClosuresHandler,
  updateBranchHandler,
  archiveBranchHandler,
  branchHistoryHandler,
  restoreBranchHandler,
} from './branches.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Module 02 — Branches (Web Admin ▸ Locations) + branch closures for the slot engine.
 * ອ່ານໄດ້ໂດຍ admin/manager/staff; ຂຽນໄດ້ໂດຍ SUPER_ADMIN (ສ້າງ) / BRANCH_ADMIN (ແກ້).
 */
export const branchesRouter: Router = Router();

branchesRouter.use(authGuard);

branchesRouter.get(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  listBranchesHandler,
);

/** ຕົວຊີ້ວັດຕໍ່ສາຂາ — BRANCH_ADMIN ເຫັນສະເພາະສາຂາຕົນ. ຕ້ອງມາກ່ອນ '/:id'. */
branchesRouter.get(
  '/insights',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: branchInsightsQuerySchema }),
  branchInsightsHandler,
);

branchesRouter.post(
  '/',
  roleGuard('SUPER_ADMIN'),
  validateRequest({ body: branchCreateSchema }),
  createBranchHandler,
);
branchesRouter.get(
  '/:id/history',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema }),
  branchHistoryHandler,
);
branchesRouter.delete(
  '/:id',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('branches:manage'),
  validateRequest({ params: idParamSchema }),
  archiveBranchHandler,
);
branchesRouter.post(
  '/:id/restore',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('branches:manage'),
  validateRequest({ params: idParamSchema }),
  restoreBranchHandler,
);
branchesRouter.patch(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('branches:manage'),
  validateRequest({ params: idParamSchema, body: branchUpdateSchema }),
  updateBranchHandler,
);

/** Branch closures / holidays — mounted top-level at /branch-closures (web-admin path). */
export const branchClosuresRouter: Router = Router();
branchClosuresRouter.use(authGuard);
branchClosuresRouter.get(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  listClosuresHandler,
);
branchClosuresRouter.post(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('branches:manage'),
  validateRequest({ body: branchClosureCreateSchema }),
  createClosureHandler,
);
branchClosuresRouter.delete(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('branches:manage'),
  validateRequest({ params: idParamSchema }),
  deleteClosureHandler,
);
