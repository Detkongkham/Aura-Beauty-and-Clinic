import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  res.status(201).json({ data: result });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, req.headers['user-agent']);
  res.json({ data: result });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken);
  res.json({ data: result });
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.me(req.auth!.sub);
  res.json({ data: user });
});

export const updateProfileHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.auth!.sub, req.body);
  res.json({ data: user });
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changePassword(req.auth!.sub, req.body);
  res.json({ data: result });
});

export const quickLoginHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.quickLogin(req.body.userId, req.body.pin, req.headers['user-agent']);
  res.json({ data: result });
});
