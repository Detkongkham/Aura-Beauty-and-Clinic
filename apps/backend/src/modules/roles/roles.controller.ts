import type { Request, Response } from 'express';
import { getActor } from '../../middlewares/permissionGuard.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as rolesService from './roles.service.js';

export const listRolesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await rolesService.listRoles();
  res.json({ data: { items: data } });
});

export const createRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.createRole(req.body, await getActor(req));
  res.status(201).json({ data });
});

export const updateRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.updateRole(req.params.id!, req.body, await getActor(req));
  res.json({ data });
});

export const deleteRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  await rolesService.deleteRole(req.params.id!);
  res.status(204).send();
});
