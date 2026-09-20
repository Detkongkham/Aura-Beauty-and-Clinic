import type { NextFunction, Request, Response } from 'express';
import {
  mergePermissionOverrides,
  rolePermissions,
  type Permission,
  type UserRole,
} from '@abcp/shared-types';
import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

/** ຜູ້ເອີ້ນ API ພ້ອມສິດທີ່ມີຜົນຈິງ (dynamic Role ຫຼື ຄ່າເລີ່ມຕົ້ນຂອງ role + override ສ່ວນຕົວ). */
export type Actor = {
  id: string;
  role: UserRole;
  branchId: string | null;
  permissions: ReadonlySet<Permission>;
  isSuperAdmin: boolean;
};

const actorCache = new WeakMap<Request, Promise<Actor>>();

/**
 * ຄິດສິດແບບດຽວກັບ `/auth/me` (auth.service `toAuthUser`) ເພື່ອໃຫ້ backend ກັບ web-admin ຕັດສິນຕົງກັນ.
 * ອ່ານຈາກ DB ທຸກ request (ບໍ່ເຊື່ອ JWT) — ການຖອນສິດມີຜົນທັນທີ ບໍ່ຕ້ອງລໍ token ໝົດອາຍຸ.
 */
export function getActor(req: Request): Promise<Actor> {
  const cached = actorCache.get(req);
  if (cached) return cached;
  const auth = req.auth;
  if (!auth) return Promise.reject(ApiError.unauthorized());
  const promise = (async () => {
    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: {
        id: true,
        role: true,
        branchId: true,
        isActive: true,
        deletedAt: true,
        roleRef: { select: { permissions: true } },
        permissionOverrides: { select: { permission: true, granted: true } },
      },
    });
    if (!user || !user.isActive || user.deletedAt) throw ApiError.unauthorized();
    const base = user.roleRef ? user.roleRef.permissions : rolePermissions(user.role);
    return {
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      permissions: new Set(mergePermissionOverrides(base, user.permissionOverrides)),
      isSuperAdmin: user.role === 'SUPER_ADMIN',
    };
  })();
  actorCache.set(req, promise);
  return promise;
}

/**
 * ຕ້ອງມີທຸກສິດທີ່ລະບຸ. ໃຊ້ຫຼັງ authGuard (+ roleGuard ຖ້າຕ້ອງການຈຳກັດ role ກ່ອນ).
 * SUPER_ADMIN ຜ່ານສະເໝີ — ກັນການລັອກຕົນເອງອອກຈາກລະບົບດ້ວຍ override.
 */
export function permissionGuard(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    getActor(req)
      .then((actor) => {
        if (actor.isSuperAdmin || required.every((p) => actor.permissions.has(p))) {
          next();
          return;
        }
        next(ApiError.forbidden('ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້'));
      })
      .catch(next);
  };
}

/** ກັນການໃຫ້ສິດເກີນຕົວ: ຜູ້ທີ່ບໍ່ແມ່ນ SUPER_ADMIN ໃຫ້ສິດໄດ້ສະເພາະສິດທີ່ຕົນມີຢູ່ແລ້ວ. */
export function assertCanGrant(actor: Actor, permissions: readonly string[]): void {
  if (actor.isSuperAdmin) return;
  const excess = permissions.filter((p) => !actor.permissions.has(p as Permission));
  if (excess.length > 0) {
    throw ApiError.forbidden(`ບໍ່ສາມາດໃຫ້ສິດທີ່ທ່ານເອງບໍ່ມີ: ${excess.join(', ')}`);
  }
}
