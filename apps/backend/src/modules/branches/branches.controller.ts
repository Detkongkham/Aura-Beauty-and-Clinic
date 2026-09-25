import type { Request, Response } from 'express';
import type {
  AccessTokenPayload,
  BranchClosureCreateInput,
  BranchCreateInput,
  BranchInsightsQuery,
  BranchUpdateInput,
} from '@abcp/shared-types';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as branchesService from './branches.service.js';

/** GET /branches */
export const listBranchesHandler = asyncHandler(async (req: Request, res: Response) => {
  // Wave 11 — ?includeArchived=true ສຳລັບ SUPER_ADMIN ເທົ່ານັ້ນ (ໜ້າ "ຄັງສາຂາ").
  const includeArchived = req.query.includeArchived === 'true' && req.auth?.role === 'SUPER_ADMIN';
  const data = await branchesService.listBranches(includeArchived);
  res.json({ data });
});

/** POST /branches */
export const createBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.createBranch(req.body as BranchCreateInput, req.auth);
  res.status(201).json({ data });
});

/**
 * ສາຂາທີ່ BRANCH_ADMIN ຈັດການໄດ້ — undefined = ບໍ່ຈຳກັດ (SUPER_ADMIN).
 * BRANCH_ADMIN ທີ່ບໍ່ໄດ້ຜູກສາຂາ → 403.
 */
function adminScope(auth: AccessTokenPayload | undefined): string | undefined {
  if (auth?.role === 'SUPER_ADMIN') return undefined;
  if (!auth?.branchId) throw ApiError.forbidden('ບັນຊີນີ້ຍັງບໍ່ໄດ້ຜູກກັບສາຂາ');
  return auth.branchId;
}

/** GET /branches/insights */
export const branchInsightsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as BranchInsightsQuery;
  const scope = adminScope(req.auth);
  const data = await branchesService.getBranchInsights(days, scope ? [scope] : undefined);
  res.json({ data });
});

/** PATCH /branches/:id — BRANCH_ADMIN ແກ້ໄດ້ສະເພາະສາຂາຕົນ. */
export const updateBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const scope = adminScope(req.auth);
  if (scope !== undefined && scope !== req.params.id) {
    throw ApiError.forbidden('ແກ້ໄຂໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
  const data = await branchesService.updateBranch(req.params.id!, req.body as BranchUpdateInput, req.auth);
  res.json({ data });
});

/** DELETE /branches/:id — ເກັບເຂົ້າຄັງ (SUPER_ADMIN). */
export const archiveBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const force = (req.body as { force?: boolean } | undefined)?.force === true || req.query.force === 'true';
  const data = await branchesService.archiveBranch(req.params.id!, force, req.auth);
  res.json({ data });
});

/** POST /branches/:id/restore — ກູ້ຄືນຈາກຄັງ (SUPER_ADMIN). */
export const restoreBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.restoreBranch(req.params.id!, req.auth);
  res.json({ data });
});

/** GET /branches/:id/history — BRANCH_ADMIN ເບິ່ງໄດ້ສະເພາະສາຂາຕົນ. */
export const branchHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const scope = adminScope(req.auth);
  if (scope !== undefined && scope !== req.params.id) throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  const data = await branchesService.branchHistory(req.params.id!);
  res.json({ data });
});

/** GET /branches/closures */
export const listClosuresHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await branchesService.listClosures();
  res.json({ data });
});

/** POST /branches/closures */
export const createClosureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.createClosure(
    req.body as BranchClosureCreateInput,
    adminScope(req.auth),
  );
  res.status(201).json({ data });
});

/** DELETE /branches/closures/:id */
export const deleteClosureHandler = asyncHandler(async (req: Request, res: Response) => {
  await branchesService.deleteClosure(req.params.id!, adminScope(req.auth));
  res.status(204).send();
});
