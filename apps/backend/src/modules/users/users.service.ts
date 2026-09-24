import {
  mergePermissionOverrides,
  rolePermissions,
  type AdminUser,
  type CreateUserInput,
  type PermissionOverride,
  type SetUserPermissionsInput,
  type UpdateUserInput,
  type UserPermissionsResponse,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { assertCanGrant, type Actor } from '../../middlewares/permissionGuard.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword } from '../../utils/password.js';
import { revokeAllSessions } from '../auth/security.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'] as const;

const WITH_RELATIONS = {
  branch: { select: { name: true } },
  roleRef: { select: { id: true, name: true, icon: true, color: true, permissions: true } },
} satisfies Prisma.UserInclude;
type UserWithRelations = Prisma.UserGetPayload<{ include: typeof WITH_RELATIONS }>;

/** Base permission set for a user: their dynamic Role if assigned, else the legacy enum default. */
function basePermissions(user: UserWithRelations): readonly string[] {
  return user.roleRef ? user.roleRef.permissions : rolePermissions(user.role);
}

function toAdminUser(user: UserWithRelations): AdminUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    roleId: user.roleRef?.id ?? null,
    roleName: user.roleRef?.name ?? null,
    roleIcon: user.roleRef?.icon ?? null,
    roleColor: user.roleRef?.color ?? null,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    quickLoginEnabled: user.quickLoginEnabled,
    quickLoginUpdatedAt: user.quickLoginUpdatedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lastLoginDevice: user.lastLoginDevice,
    createdAt: user.createdAt.toISOString(),
  };
}

/** ລາຍຊື່ບັນຊີແອັດມິນ/ຜູ້ຈັດການສາຂາ — ໜ້າ "ຜູ້ໃຊ້ລະບົບ". */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ROLES] }, deletedAt: null },
    include: WITH_RELATIONS,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toAdminUser);
}

async function findRoleRef(roleId: string): Promise<{ permissions: string[] }> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { permissions: true } });
  if (!role) throw ApiError.notFound('ບໍ່ພົບບົດບາດ');
  return role;
}

/*
 * Anti-escalation rules for non-SUPER_ADMIN actors (holding users:manage is not enough):
 *  - never create, promote to, or touch a SUPER_ADMIN account (incl. its quick-login PIN,
 *    which would otherwise let the actor sign in as that super admin);
 *  - never change their own role / dynamic role / permission overrides;
 *  - never hand out a permission set larger than their own.
 */
function assertNotSuperAdminTarget(actor: Actor, targetRole: string): void {
  if (!actor.isSuperAdmin && targetRole === 'SUPER_ADMIN') {
    throw ApiError.forbidden('ສະເພາະ SUPER_ADMIN ເທົ່ານັ້ນທີ່ຈັດການບັນຊີ SUPER_ADMIN ໄດ້');
  }
}
function assertNotSelf(actor: Actor, targetId: string): void {
  if (!actor.isSuperAdmin && actor.id === targetId) {
    throw ApiError.forbidden('ບໍ່ສາມາດປ່ຽນບົດບາດ ຫຼື ສິດຂອງຕົນເອງໄດ້');
  }
}

export async function createUser(input: CreateUserInput, actor: Actor): Promise<AdminUser> {
  assertNotSuperAdminTarget(actor, input.role);
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
  });
  if (existing) throw ApiError.conflict('ເບີໂທ ຫຼື ອີເມວນີ້ຖືກໃຊ້ແລ້ວ');
  const roleRef = input.roleId ? await findRoleRef(input.roleId) : null;
  assertCanGrant(actor, roleRef ? roleRef.permissions : rolePermissions(input.role));

  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      role: input.role,
      roleRefId: input.roleId ?? null,
      branchId: input.branchId ?? null,
    },
    include: WITH_RELATIONS,
  });
  return toAdminUser(user);
}

async function findAdminUser(id: string): Promise<UserWithRelations> {
  const user = await prisma.user.findFirst({
    where: { id, role: { in: [...ADMIN_ROLES] }, deletedAt: null },
    include: WITH_RELATIONS,
  });
  if (!user) throw ApiError.notFound('ບໍ່ພົບຜູ້ໃຊ້');
  return user;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: Actor,
): Promise<AdminUser> {
  const target = await findAdminUser(id);
  assertNotSuperAdminTarget(actor, target.role);
  const changesAccess = input.role !== undefined || input.roleId !== undefined;
  if (changesAccess) {
    assertNotSelf(actor, id);
    const nextRole = input.role ?? target.role;
    assertNotSuperAdminTarget(actor, nextRole);
    const nextRoleId = input.roleId !== undefined ? input.roleId : target.roleRefId;
    const roleRef = nextRoleId ? await findRoleRef(nextRoleId) : null;
    assertCanGrant(actor, roleRef ? roleRef.permissions : rolePermissions(nextRole));
  }
  // Deactivating yourself would lock the actor out mid-session; branch moves re-scope access.
  if ((input.isActive === false || input.branchId !== undefined) && actor.id === id && !actor.isSuperAdmin) {
    throw ApiError.forbidden('ບໍ່ສາມາດປິດບັນຊີ ຫຼື ຍ້າຍສາຂາຂອງຕົນເອງໄດ້');
  }
  if (input.email) {
    const existing = await prisma.user.findFirst({ where: { email: input.email, id: { not: id } } });
    if (existing) throw ApiError.conflict('ອີເມວນີ້ຖືກໃຊ້ແລ້ວ');
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.roleId !== undefined ? { roleRefId: input.roleId } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
    include: WITH_RELATIONS,
  });
  // Deactivated = signed out everywhere, not just unable to sign in again.
  if (input.isActive === false && target.isActive) await revokeAllSessions(id, 'DEACTIVATED');
  return toAdminUser(user);
}

/** ຄ່າສິດປັດຈຸບັນ (ຕາມບົດບາດ) + override ສ່ວນຕົວຂອງຜູ້ໃຊ້ນີ້. */
export async function getUserPermissions(id: string): Promise<UserPermissionsResponse> {
  const user = await findAdminUser(id);
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: id },
    select: { permission: true, granted: true },
  });
  const base = basePermissions(user);
  return {
    userId: user.id,
    role: user.role,
    roleId: user.roleRef?.id ?? null,
    roleName: user.roleRef?.name ?? null,
    rolePermissions: [...base] as UserPermissionsResponse['rolePermissions'],
    overrides: overrides as PermissionOverride[],
    effective: mergePermissionOverrides(base, overrides),
  };
}

/** ປ່ຽນແທນ override ທັງໝົດຂອງຜູ້ໃຊ້ (idempotent replace). */
export async function setUserPermissions(
  id: string,
  input: SetUserPermissionsInput,
  actor: Actor,
): Promise<UserPermissionsResponse> {
  const target = await findAdminUser(id);
  assertNotSuperAdminTarget(actor, target.role);
  assertNotSelf(actor, id);
  assertCanGrant(
    actor,
    input.overrides.filter((o) => o.granted).map((o) => o.permission),
  );
  await prisma.$transaction([
    prisma.userPermissionOverride.deleteMany({ where: { userId: id } }),
    ...(input.overrides.length > 0
      ? [
          prisma.userPermissionOverride.createMany({
            data: input.overrides.map((o) => ({ userId: id, permission: o.permission, granted: o.granted })),
          }),
        ]
      : []),
  ]);
  return getUserPermissions(id);
}

/** ຜູ້ໃຊ້ທັງໝົດທີ່ເປີດ Quick Login (ສຳລັບໜ້າຈັດການ). */
export async function listQuickLoginUsers(): Promise<AdminUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ROLES] }, deletedAt: null },
    include: WITH_RELATIONS,
    orderBy: { name: 'asc' },
  });
  return rows.map(toAdminUser);
}

export async function setQuickLoginPin(id: string, pin: string, actor: Actor): Promise<AdminUser> {
  assertNotSuperAdminTarget(actor, (await findAdminUser(id)).role);
  const user = await prisma.user.update({
    where: { id },
    data: { quickLoginPin: await hashPassword(pin), quickLoginEnabled: true, quickLoginUpdatedAt: new Date() },
    include: WITH_RELATIONS,
  });
  return toAdminUser(user);
}

export async function disableQuickLogin(id: string, actor: Actor): Promise<AdminUser> {
  assertNotSuperAdminTarget(actor, (await findAdminUser(id)).role);
  const user = await prisma.user.update({
    where: { id },
    data: { quickLoginPin: null, quickLoginEnabled: false, quickLoginUpdatedAt: null },
    include: WITH_RELATIONS,
  });
  return toAdminUser(user);
}
