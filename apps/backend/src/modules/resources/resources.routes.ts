import { Router } from 'express';
import { z } from 'zod';
import {
  createEquipmentSchema,
  createRoomSchema,
  resourceListQuerySchema,
  updateEquipmentSchema,
  updateRoomSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as resources from './resources.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** /resources/rooms — Web Admin ▸ Multi-Resource Allocation (Module 17). GET = any logged-in
 * role (ໃຊ້ຕອນເລືອກຫ້ອງໃນຟອມສ້າງນັດ), write = SUPER_ADMIN/BRANCH_ADMIN. */
export const roomsRouter: Router = Router();
roomsRouter.use(authGuard);

roomsRouter.get(
  '/',
  validateRequest({ query: resourceListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.listRooms(req.query as never) });
  }),
);

roomsRouter.post(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: createRoomSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await resources.createRoom(req.body) });
  }),
);

roomsRouter.patch(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: updateRoomSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.updateRoom(req.params.id!, req.body) });
  }),
);

roomsRouter.delete(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.deleteRoom(req.params.id!) });
  }),
);

/** /resources/equipment — ໂຄງສ້າງດຽວກັນກັບ rooms. */
export const equipmentRouter: Router = Router();
equipmentRouter.use(authGuard);

equipmentRouter.get(
  '/',
  validateRequest({ query: resourceListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.listEquipment(req.query as never) });
  }),
);

equipmentRouter.post(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: createEquipmentSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await resources.createEquipment(req.body) });
  }),
);

equipmentRouter.patch(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: updateEquipmentSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.updateEquipment(req.params.id!, req.body) });
  }),
);

equipmentRouter.delete(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await resources.deleteEquipment(req.params.id!) });
  }),
);
