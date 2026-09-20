import type { Request, Response } from 'express';
import type { ServiceListQuery } from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as catalogService from './catalog.service.js';

export const listCategoriesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await catalogService.listCategories();
  res.json({ data });
});

export const listServicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.listServices(req.query as unknown as ServiceListQuery);
  res.json({ data });
});

export const listBranchesHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await catalogService.listBranchInfo() });
});

export const getBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await catalogService.getBranchInfo(req.params.id!) });
});

export const getServiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await catalogService.getServiceById(
    req.params.id!,
    typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
  );
  res.json({ data });
});
