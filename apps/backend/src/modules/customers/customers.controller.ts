import type { Request, Response } from 'express';
import type {
  CustomerCreateInput,
  CustomerListQuery,
  CustomerUpdateInput,
} from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as customersService from './customers.service.js';

/** GET /customers */
export const listCustomersHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.listCustomers(req.query as unknown as CustomerListQuery);
  res.json({ data });
});

/** GET /customers/:id */
export const customerDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.getCustomerDetail(req.params.id!);
  res.json({ data });
});

/** POST /customers */
export const createCustomerHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.createCustomer(req.body as CustomerCreateInput);
  res.status(201).json({ data });
});

/** PATCH /customers/:id */
export const updateCustomerHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await customersService.updateCustomer(
    req.params.id!,
    req.body as CustomerUpdateInput,
  );
  res.json({ data });
});
