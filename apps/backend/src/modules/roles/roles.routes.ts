import { Router } from 'express';
import { z } from 'zod';
import { createRoleSchema, updateRoleSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createRoleHandler,
  deleteRoleHandler,
  listRolesHandler,
  updateRoleHandler,
} from './roles.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const rolesRouter: Router = Router();

rolesRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

const canManage = permissionGuard('users:manage');

rolesRouter.get('/', permissionGuard('users:view'), listRolesHandler);
rolesRouter.post('/', canManage, validateRequest({ body: createRoleSchema }), createRoleHandler);
rolesRouter.patch('/:id', canManage, validateRequest({ params: idParamSchema, body: updateRoleSchema }), updateRoleHandler);
rolesRouter.delete('/:id', canManage, validateRequest({ params: idParamSchema }), deleteRoleHandler);
