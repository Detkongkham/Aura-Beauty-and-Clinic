import type { Request, Response } from 'express';
import type {
  QueueClearStaleInput,
  QueueListQuery,
  QueueSetStatusInput,
  QueueUpdateDetailsInput,
  WalkInInput,
} from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { resolveDashboardBranch } from '../dashboard/dashboard.controller.js';
import * as queueService from './queue.service.js';

/** ສາຂາທີ່ຜູ້ໃຊ້ແຕະບັດໄດ້ — null = ທຸກສາຂາ (SUPER_ADMIN). */
function writeScope(req: Request): string | null {
  return req.auth?.role === 'SUPER_ADMIN' ? null : resolveDashboardBranch(req.auth, 'all');
}

/** GET /queue */
export const listQueueHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as QueueListQuery;
  const data = await queueService.listQueue({
    ...query,
    branchId: resolveDashboardBranch(req.auth, query.branchId),
  });
  res.json({ data });
});

/** PATCH /queue/:id */
export const setTicketStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await queueService.setTicketStatus(
    req.params.id!,
    req.body as QueueSetStatusInput,
    writeScope(req),
  );
  res.json({ data });
});

/** POST /queue/:id/recall */
export const recallTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await queueService.recallTicket(req.params.id!, writeScope(req)) });
});

/** PATCH /queue/:id/details */
export const updateTicketDetailsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await queueService.updateTicketDetails(
    req.params.id!,
    req.body as QueueUpdateDetailsInput,
    writeScope(req),
  );
  res.json({ data });
});

/** POST /queue/clear-stale */
export const clearStaleHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as QueueClearStaleInput;
  const data = await queueService.clearStaleTickets(resolveDashboardBranch(req.auth, body.branchId));
  res.json({ data });
});

/** POST /appointments/walk-in */
export const walkInHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await queueService.createWalkIn(req.body as WalkInInput);
  res.status(201).json({ data });
});
