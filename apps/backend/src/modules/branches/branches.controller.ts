import type { Request, Response } from 'express';
import type {
  BranchClosureCreateInput,
  BranchCreateInput,
  BranchUpdateInput,
} from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as branchesService from './branches.service.js';

/** GET /branches */
export const listBranchesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await branchesService.listBranches();
  res.json({ data });
});

/** POST /branches */
export const createBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.createBranch(req.body as BranchCreateInput);
  res.status(201).json({ data });
});

/** PATCH /branches/:id */
export const updateBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.updateBranch(req.params.id!, req.body as BranchUpdateInput);
  res.json({ data });
});

/** GET /branches/closures */
export const listClosuresHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await branchesService.listClosures();
  res.json({ data });
});

/** POST /branches/closures */
export const createClosureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.createClosure(req.body as BranchClosureCreateInput);
  res.status(201).json({ data });
});

/** DELETE /branches/closures/:id */
export const deleteClosureHandler = asyncHandler(async (req: Request, res: Response) => {
  await branchesService.deleteClosure(req.params.id!);
  res.status(204).send();
});
