import { z } from 'zod';
import { uuidSchema } from './common.schema.js';

/**
 * Multi-Resource Allocation (Rooms & Equipment) — ໂມດູນ 17 (Phase 7C).
 * `Room`/`Equipment` ແລະ `Appointment.roomId/equipmentId` + double-booking check ໃນ
 * `assertSlotFree` ມີມາແຕ່ດົນແລ້ວ (booking engine) — ວຽກທີ່ຂາດແມ່ນ CRUD ໃຫ້ admin ສ້າງ/ຈັດການ
 * ຫ້ອງ/ອຸປະກອນ ແລະ ຊ່ອງໃຫ້ເລືອກຕອນສ້າງນັດໝາຍ.
 */

export const createRoomSchema = z.object({
  branchId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  isAvailable: z.boolean().default(true),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = createRoomSchema.omit({ branchId: true }).partial();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const createEquipmentSchema = z.object({
  branchId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(60),
  isAvailable: z.boolean().default(true),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = createEquipmentSchema.omit({ branchId: true }).partial();
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

export const resourceListQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  isAvailable: z.coerce.boolean().optional(),
});
export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>;

export type RoomView = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  isAvailable: boolean;
};

export type EquipmentView = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  code: string;
  isAvailable: boolean;
};
