import type { Request, Response } from 'express';
import { getActor } from '../../middlewares/permissionGuard.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as adminSecurity from '../auth/admin-security.service.js';
import * as usersService from './users.service.js';

export const listUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await usersService.listUsers();
  res.json({ data: { items: data } });
});

export const createUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.createUser(req.body, await getActor(req));
  res.status(201).json({ data });
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.updateUser(req.params.id!, req.body, await getActor(req));
  res.json({ data });
});

export const getUserPermissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.getUserPermissions(req.params.id!);
  res.json({ data });
});

export const setUserPermissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.setUserPermissions(req.params.id!, req.body, await getActor(req));
  res.json({ data });
});

export const listQuickLoginUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await usersService.listQuickLoginUsers();
  res.json({ data: { items: data } });
});

export const setQuickLoginPinHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.setQuickLoginPin(req.params.id!, req.body.pin, await getActor(req));
  res.json({ data });
});

export const disableQuickLoginHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.disableQuickLogin(req.params.id!, await getActor(req));
  res.json({ data });
});

// --- Another user's account security (sessions, lockout, 2FA, reset code) ---

export const getUserSecurityHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.getUserSecurity(req.params.id!, await getActor(req)) });
});

export const revokeUserSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.revokeUserSession(req.params.id!, req.params.sid!, await getActor(req), req.ip) });
});

export const revokeAllUserSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.revokeAllUserSessions(req.params.id!, await getActor(req), req.auth!.sid, req.ip) });
});

export const unlockUserHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.unlockUser(req.params.id!, await getActor(req), req.ip) });
});

export const resetUserTwoFactorHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.resetUserTwoFactor(req.params.id!, await getActor(req), req.ip) });
});

export const issueResetCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await adminSecurity.issueResetCode(req.params.id!, await getActor(req), req.ip) });
});
