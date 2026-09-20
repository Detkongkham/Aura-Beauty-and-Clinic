import type {
  CreateEquipmentInput,
  CreateRoomInput,
  EquipmentView,
  ResourceListQuery,
  RoomView,
  UpdateEquipmentInput,
  UpdateRoomInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const BRANCH_INCLUDE = { branch: { select: { name: true } } } satisfies Prisma.RoomInclude;

type RoomRow = Prisma.RoomGetPayload<{ include: typeof BRANCH_INCLUDE }>;
type EquipmentRow = Prisma.EquipmentGetPayload<{ include: typeof BRANCH_INCLUDE }>;

function toRoomView(r: RoomRow): RoomView {
  return { id: r.id, branchId: r.branchId, branchName: r.branch.name, name: r.name, isAvailable: r.isAvailable };
}

function toEquipmentView(r: EquipmentRow): EquipmentView {
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: r.branch.name,
    name: r.name,
    code: r.code,
    isAvailable: r.isAvailable,
  };
}

async function assertBranch(branchId: string): Promise<void> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
}

// ---- Rooms -----------------------------------------------------------

export async function listRooms(query: ResourceListQuery): Promise<RoomView[]> {
  const rows = await prisma.room.findMany({
    where: {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.isAvailable === undefined ? {} : { isAvailable: query.isAvailable }),
    },
    include: BRANCH_INCLUDE,
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toRoomView);
}

export async function createRoom(input: CreateRoomInput): Promise<RoomView> {
  await assertBranch(input.branchId);
  const row = await prisma.room.create({
    data: { branchId: input.branchId, name: input.name, isAvailable: input.isAvailable },
    include: BRANCH_INCLUDE,
  });
  return toRoomView(row);
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<RoomView> {
  const existing = await prisma.room.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບຫ້ອງ');
  const row = await prisma.room.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
    },
    include: BRANCH_INCLUDE,
  });
  return toRoomView(row);
}

export async function deleteRoom(id: string): Promise<{ id: string }> {
  const existing = await prisma.room.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບຫ້ອງ');
  const inUse = await prisma.appointment.findFirst({
    where: { roomId: id, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
    select: { id: true },
  });
  if (inUse) throw ApiError.conflict('ຫ້ອງນີ້ຍັງມີນັດໝາຍໃຊ້ຢູ່ — ລຶບບໍ່ໄດ້');
  await prisma.room.delete({ where: { id } });
  return { id };
}

// ---- Equipment ---------------------------------------------------------

export async function listEquipment(query: ResourceListQuery): Promise<EquipmentView[]> {
  const rows = await prisma.equipment.findMany({
    where: {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.isAvailable === undefined ? {} : { isAvailable: query.isAvailable }),
    },
    include: BRANCH_INCLUDE,
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toEquipmentView);
}

export async function createEquipment(input: CreateEquipmentInput): Promise<EquipmentView> {
  await assertBranch(input.branchId);
  const dup = await prisma.equipment.findUnique({ where: { code: input.code }, select: { id: true } });
  if (dup) throw ApiError.conflict('ລະຫັດອຸປະກອນນີ້ຖືກໃຊ້ແລ້ວ');
  const row = await prisma.equipment.create({
    data: { branchId: input.branchId, name: input.name, code: input.code, isAvailable: input.isAvailable },
    include: BRANCH_INCLUDE,
  });
  return toEquipmentView(row);
}

export async function updateEquipment(id: string, input: UpdateEquipmentInput): Promise<EquipmentView> {
  const existing = await prisma.equipment.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບອຸປະກອນ');
  if (input.code !== undefined && input.code !== existing.code) {
    const dup = await prisma.equipment.findUnique({ where: { code: input.code }, select: { id: true } });
    if (dup) throw ApiError.conflict('ລະຫັດອຸປະກອນນີ້ຖືກໃຊ້ແລ້ວ');
  }
  const row = await prisma.equipment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
    },
    include: BRANCH_INCLUDE,
  });
  return toEquipmentView(row);
}

export async function deleteEquipment(id: string): Promise<{ id: string }> {
  const existing = await prisma.equipment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບອຸປະກອນ');
  const inUse = await prisma.appointment.findFirst({
    where: { equipmentId: id, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
    select: { id: true },
  });
  if (inUse) throw ApiError.conflict('ອຸປະກອນນີ້ຍັງມີນັດໝາຍໃຊ້ຢູ່ — ລຶບບໍ່ໄດ້');
  await prisma.equipment.delete({ where: { id } });
  return { id };
}
