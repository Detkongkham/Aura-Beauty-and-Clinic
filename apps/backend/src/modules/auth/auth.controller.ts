import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as accountService from './account.service.js';
import * as authService from './auth.service.js';

const ctx = (req: Request) => ({ userAgent: req.headers['user-agent'], ipAddress: req.ip });

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body, req.ip, req.headers['user-agent']);
  res.status(201).json({ data: result });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, ctx(req));
  res.json({ data: result });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken, ctx(req));
  res.json({ data: result });
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.me(req.auth!.sub);
  res.json({ data: user });
});

export const updateProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.auth!.sub, req.body, req.ip);
  res.json({ data: user });
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changePassword(req.auth!.sub, req.body, req.auth!.sid, req.ip);
  res.json({ data: result });
});

export const quickLoginHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.quickLogin(req.body.userId, req.body.pin, ctx(req));
  res.json({ data: result });
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await authService.logout(req.body.refreshToken) });
});

// --- /auth/me/* — account console (web-admin /account) ---

export const overviewHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.overview(req.auth!.sub, req.auth!.sid) });
});

export const listSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.listSessions(req.auth!.sub, req.auth!.sid) });
});

export const revokeSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.revokeSession(req.auth!.sub, req.params.id!, req.ip) });
});

export const revokeOtherSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.revokeOtherSessions(req.auth!.sub, req.auth!.sid, req.ip) });
});

export const activityHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.listActivity(req.auth!.sub, req.query as never) });
});

export const setOwnPinHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.setOwnQuickLoginPin(req.auth!.sub, req.body, req.ip) });
});

export const disableOwnPinHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await accountService.disableOwnQuickLogin(req.auth!.sub, req.ip) });
});
