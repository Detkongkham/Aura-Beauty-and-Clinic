import { Router } from 'express';
import { z } from 'zod';
import { customerCreateSchema, customerListQuerySchema, customerUpdateSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createCustomerHandler,
  customerDetailHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from './customers.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** Module 08 — CRM / Customers (Web Admin). Admin + front-desk staff. */
export const customersRouter: Router = Router();

customersRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'));

customersRouter.get('/', validateRequest({ query: customerListQuerySchema }), listCustomersHandler);
customersRouter.post('/', validateRequest({ body: customerCreateSchema }), createCustomerHandler);
customersRouter.get('/:id', validateRequest({ params: idParamSchema }), customerDetailHandler);
customersRouter.patch(
  '/:id',
  validateRequest({ params: idParamSchema, body: customerUpdateSchema }),
  updateCustomerHandler,
);
