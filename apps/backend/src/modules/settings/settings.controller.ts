import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as settingsService from './settings.service.js';

/** GET /settings */
export const getSettingsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await settingsService.getSettings();
  res.json({ data });
});

/** PUT /settings */
export const updateSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.updateSettings(
    (req.body ?? {}) as Record<string, unknown>,
  );
  res.json({ data });
});

/** GET /notification-templates */
export const listTemplatesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await settingsService.listTemplates();
  res.json({ data });
});

/** PUT /notification-templates/:key */
export const updateTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.updateTemplate(req.params.key!, req.body ?? {});
  res.json({ data });
});
