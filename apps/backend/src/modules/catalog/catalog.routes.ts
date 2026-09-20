import { Router } from 'express';
import { z } from 'zod';
import { serviceListQuerySchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  getBranchHandler,
  getServiceHandler,
  listBranchesHandler,
  listCategoriesHandler,
  listServicesHandler,
} from './catalog.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });
/** ສາຂາທີ່ລູກຄ້າກຳລັງເບິ່ງ — ໃຊ້ເປັນບັດສະຖານທີ່ ເມື່ອບໍລິການເປີດທຸກສາຂາ. */
const serviceDetailQuerySchema = z.object({ branchId: z.string().uuid().optional() });

export const catalogRouter: Router = Router();

catalogRouter.get('/categories', authGuard, listCategoriesHandler);

catalogRouter.get('/branches', authGuard, listBranchesHandler);

catalogRouter.get(
  '/branches/:id',
  authGuard,
  validateRequest({ params: idParamSchema }),
  getBranchHandler,
);

catalogRouter.get(
  '/services',
  authGuard,
  validateRequest({ query: serviceListQuerySchema }),
  listServicesHandler,
);

catalogRouter.get(
  '/services/:id',
  authGuard,
  validateRequest({ params: idParamSchema, query: serviceDetailQuerySchema }),
  getServiceHandler,
);
