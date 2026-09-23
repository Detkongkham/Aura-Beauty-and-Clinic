import { z } from 'zod';
import { UserRole } from './enums.js';

/**
 * Admin-console permission keys — single source of truth shared by the backend
 * (users module + auth effective-permission computation) and the frontend
 * (`@/lib/rbac`). Keep in sync with `implementation_plan.md` §13.
 *
 * Resources that support fine-grained CRUD carry `view` + `manage` (the
 * existing umbrella still gating every page today) plus the newer granular
 * `create` / `edit` / `delete` / `special` actions used by the permission
 * matrix UI. The granular actions are additive — no page currently checks
 * them, so introducing them cannot change anyone's existing access; they let
 * an admin pre-configure fine-grained roles ahead of pages adopting them.
 */
export const PERMISSIONS = [
  'dashboard:view',
  'calendar:view',
  'appointments:view',
  'appointments:manage',
  'appointments:create',
  'appointments:edit',
  'appointments:delete',
  'appointments:special',
  'queue:manage',
  'queue:create',
  'queue:edit',
  'queue:delete',
  'queue:special',
  'services:view',
  'services:manage',
  'services:create',
  'services:edit',
  'services:delete',
  'services:special',
  'staff:view',
  'staff:manage',
  'staff:create',
  'staff:edit',
  'staff:delete',
  'staff:special',
  'customers:view',
  'customers:manage',
  'customers:create',
  'customers:edit',
  'customers:delete',
  'customers:special',
  'branches:view',
  'branches:manage',
  'branches:create',
  'branches:edit',
  'branches:delete',
  'branches:special',
  'users:view',
  'users:manage',
  'users:create',
  'users:edit',
  'users:delete',
  'users:special',
  'settings:view',
  'settings:manage',
  'settings:create',
  'settings:edit',
  'settings:delete',
  'settings:special',
  'reports:view',
  'finance:view',
  'finance:manage',
  'marketing:view',
  'marketing:manage',
  'inventory:view',
  'inventory:manage',
  'payments:manage',
  'payments:review',
  'payments:reconcile',
  'payments:refund',
  'expenses:view',
  'expenses:manage',
  'expenses:approve',
] as const;

export const PermissionKey = z.enum(PERMISSIONS);
export type Permission = (typeof PERMISSIONS)[number];

/** Only these two roles use the admin console (design.md infra §13). */
export const ADMIN_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

const BRANCH_ADMIN_PERMISSIONS: readonly Permission[] = [
  'dashboard:view',
  'calendar:view',
  'appointments:view',
  'appointments:manage',
  'appointments:create',
  'appointments:edit',
  'appointments:delete',
  'appointments:special',
  'queue:manage',
  'queue:create',
  'queue:edit',
  'queue:delete',
  'queue:special',
  'services:view',
  'staff:view',
  'staff:manage',
  'staff:create',
  'staff:edit',
  'staff:delete',
  'staff:special',
  'customers:view',
  'customers:manage',
  'customers:create',
  'customers:edit',
  'customers:delete',
  'customers:special',
  'branches:view',
  'settings:view',
  'reports:view',
  'finance:view',
  'finance:manage',
  'marketing:view',
  'marketing:manage',
  'inventory:view',
  'inventory:manage',
  'payments:manage',
  'payments:review',
  'payments:reconcile',
  'payments:refund',
  'expenses:view',
  'expenses:manage',
  'expenses:approve',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  BRANCH_ADMIN: BRANCH_ADMIN_PERMISSIONS,
  STAFF: [],
  CUSTOMER: [],
  AFFILIATE_PARTNER: [],
};

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

export function rolePermissions(role: UserRole | null | undefined): readonly Permission[] {
  return role ? (ROLE_PERMISSIONS[role] ?? []) : [];
}

export interface PermissionOverrideLike {
  permission: string;
  granted: boolean;
}

/**
 * Merge a base permission set (a role's defaults) with per-user overrides. An
 * override with `granted: true` adds a permission the base wouldn't normally
 * grant; `granted: false` revokes one the base would normally grant.
 */
export function mergePermissionOverrides(
  base: readonly string[],
  overrides: readonly PermissionOverrideLike[],
): Permission[] {
  const set = new Set<string>(base);
  for (const o of overrides) {
    if (o.granted) set.add(o.permission);
    else set.delete(o.permission);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

/** @deprecated Use `mergePermissionOverrides` with a dynamic Role's permissions where available. */
export function computeEffectivePermissions(
  role: UserRole | null | undefined,
  overrides: readonly PermissionOverrideLike[],
): Permission[] {
  return mergePermissionOverrides(rolePermissions(role), overrides);
}

export const permissionOverrideSchema = z.object({
  permission: PermissionKey,
  granted: z.boolean(),
});
export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;

export const setUserPermissionsSchema = z.object({
  overrides: z.array(permissionOverrideSchema).max(PERMISSIONS.length),
});
export type SetUserPermissionsInput = z.infer<typeof setUserPermissionsSchema>;

export const userPermissionsResponseSchema = z.object({
  userId: z.string().uuid(),
  role: UserRole,
  roleId: z.string().uuid().nullable(),
  roleName: z.string().nullable(),
  rolePermissions: z.array(PermissionKey),
  overrides: z.array(permissionOverrideSchema),
  effective: z.array(PermissionKey),
});
export type UserPermissionsResponse = z.infer<typeof userPermissionsResponseSchema>;
