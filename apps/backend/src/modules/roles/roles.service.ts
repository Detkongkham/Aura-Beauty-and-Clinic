import type { CreateRoleInput, Role, UpdateRoleInput } from '@abcp/shared-types';
import type { Role as PrismaRole } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { assertCanGrant, type Actor } from '../../middlewares/permissionGuard.js';
import { ApiError } from '../../utils/ApiError.js';

function toRole(role: PrismaRole, memberCount: number): Role {
  return {
    id: role.id,
    name: role.name,
    icon: role.icon,
    color: role.color,
    permissions: role.permissions as Role['permissions'],
    isSystem: role.isSystem,
    memberCount,
    createdAt: role.createdAt.toISOString(),
  };
}

export async function listRoles(): Promise<Role[]> {
  const rows = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => toRole(r, r._count.users));
}

export async function createRole(input: CreateRoleInput, actor: Actor): Promise<Role> {
  assertCanGrant(actor, input.permissions);
  const existing = await prisma.role.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict('ມີບົດບາດຊື່ນີ້ຢູ່ແລ້ວ');

  const role = await prisma.role.create({
    data: {
      name: input.name,
      icon: input.icon,
      color: input.color,
      permissions: input.permissions,
    },
  });
  return toRole(role, 0);
}

async function findRole(id: string): Promise<PrismaRole> {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw ApiError.notFound('ບໍ່ພົບບົດບາດ');
  return role;
}

export async function updateRole(id: string, input: UpdateRoleInput, actor: Actor): Promise<Role> {
  const existing = await findRole(id);
  if (!actor.isSuperAdmin) {
    if (existing.isSystem) throw ApiError.forbidden('ສະເພາະ SUPER_ADMIN ທີ່ແກ້ບົດບາດຫຼັກຂອງລະບົບໄດ້');
    // Editing the role you're assigned to would be a self-grant by another route.
    const self = await prisma.user.findUnique({ where: { id: actor.id }, select: { roleRefId: true } });
    if (self?.roleRefId === id) throw ApiError.forbidden('ບໍ່ສາມາດແກ້ບົດບາດທີ່ຕົນເອງສັງກັດຢູ່ໄດ້');
  }
  if (input.permissions !== undefined) assertCanGrant(actor, input.permissions);
  if (input.name !== undefined) {
    const clash = await prisma.role.findFirst({ where: { name: input.name, NOT: { id } } });
    if (clash) throw ApiError.conflict('ມີບົດບາດຊື່ນີ້ຢູ່ແລ້ວ');
  }
  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
    },
    include: { _count: { select: { users: true } } },
  });
  return toRole(role, role._count.users);
}

export async function deleteRole(id: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw ApiError.notFound('ບໍ່ພົບບົດບາດ');
  if (role.isSystem) throw ApiError.badRequest('ບໍ່ສາມາດລຶບບົດບາດຫຼັກຂອງລະບົບໄດ້');
  if (role._count.users > 0) {
    throw ApiError.badRequest('ຍັງມີຜູ້ໃຊ້ຢູ່ໃນບົດບາດນີ້ — ຍ້າຍພວກເຂົາອອກກ່ອນຈຶ່ງລຶບໄດ້');
  }
  await prisma.role.delete({ where: { id } });
}
