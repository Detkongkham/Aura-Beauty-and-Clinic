import type { Request, Response } from 'express';
import type {
  AdminStaffUpdateInput,
  StaffListQuery,
  TimeOffDecisionInput,
} from '@abcp/shared-types';
import { adminStaffListQuerySchema } from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as staffService from './staff.service.js';
import * as staffAdmin from './staff-admin.service.js';

/**
 * GET /staff — dual contract:
 *   `?page=` present  → Web Admin directory (paginated admin shape)
 *   otherwise         → Customer App list (StaffListItem[])
 */
export const listStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.query.page !== undefined) {
    const data = await staffAdmin.listAdminStaff(adminStaffListQuerySchema.parse(req.query));
    res.json({ data });
    return;
  }
  const data = await staffService.listStaff(req.query as unknown as StaffListQuery);
  res.json({ data });
});

/** GET /staff/:id — Web Admin staff detail (admin shape). */
export const getStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await staffAdmin.getAdminStaff(req.params.id!);
  res.json({ data });
});

/** PATCH /staff/:id — Web Admin edit profile / hours / services / commission. */
export const updateStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await staffAdmin.updateAdminStaff(
    req.params.id!,
    req.body as AdminStaffUpdateInput,
  );
  res.json({ data });
});

/** GET /staff/time-off */
export const listTimeOffHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await staffAdmin.listTimeOff();
  res.json({ data });
});

/** PATCH /staff/time-off/:id */
export const decideTimeOffHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await staffAdmin.decideTimeOff(
    req.params.id!,
    req.body as TimeOffDecisionInput,
  );
  res.json({ data });
});
