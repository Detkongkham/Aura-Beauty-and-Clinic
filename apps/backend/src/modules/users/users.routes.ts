import { Router } from 'express';
import { z } from 'zod';
import {
  createUserSchema,
  setQuickLoginPinSchema,
  setUserPermissionsSchema,
  updateUserSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createUserHandler,
  disableQuickLoginHandler,
  getUserPermissionsHandler,
  listQuickLoginUsersHandler,
  listUsersHandler,
  setQuickLoginPinHandler,
  setUserPermissionsHandler,
  updateUserHandler,
} from './users.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const usersRouter: Router = Router();

usersRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

// Permission gates mirror web-admin (UsersPage = users:view, writes / permissions / quick-login =
// users:manage). Escalation rules (SUPER_ADMIN targets, self-edits, over-granting) live in the service.
const canView = permissionGuard('users:view');
const canManage = permissionGuard('users:manage');

usersRouter.get('/', canView, listUsersHandler);
usersRouter.post('/', canManage, validateRequest({ body: createUserSchema }), createUserHandler);

// Static sub-routes before the ":id" wildcard so they don't get shadowed.
usersRouter.get('/quick-login', canManage, listQuickLoginUsersHandler);

usersRouter.patch('/:id', canManage, validateRequest({ params: idParamSchema, body: updateUserSchema }), updateUserHandler);

usersRouter.get(
  '/:id/permissions',
  canManage,
  validateRequest({ params: idParamSchema }),
  getUserPermissionsHandler,
);
usersRouter.put(
  '/:id/permissions',
  canManage,
  validateRequest({ params: idParamSchema, body: setUserPermissionsSchema }),
  setUserPermissionsHandler,
);

usersRouter.post(
  '/:id/quick-login',
  canManage,
  validateRequest({ params: idParamSchema, body: setQuickLoginPinSchema }),
  setQuickLoginPinHandler,
);
usersRouter.delete(
  '/:id/quick-login',
  canManage,
  validateRequest({ params: idParamSchema }),
  disableQuickLoginHandler,
);
