import type { UserRole } from '@abcp/shared-types';
import { isAdminRole as isAdminRoleShared, PERMISSIONS, rolePermissions } from '@abcp/shared-types';

export type { Permission } from '@abcp/shared-types';

/**
 * RBAC for the admin console (design.md infra §13). Base role→permission map
 * lives in `@abcp/shared-types` (shared with the backend). Per-user overrides
 * on top of the role base are computed server-side and delivered as
 * `AuthUser.permissions` — see `useAuth().hasPermission`.
 */
export { PERMISSIONS };

export const isAdminRole = isAdminRoleShared;

export function permissionsFor(role: UserRole | null | undefined) {
  return rolePermissions(role);
}

/** `can(role, 'services:manage')` — role-only check; prefer `useAuth().hasPermission` which also applies per-user overrides. */
export function can(role: UserRole | null | undefined, permission: (typeof PERMISSIONS)[number]): boolean {
  return rolePermissions(role).includes(permission);
}
