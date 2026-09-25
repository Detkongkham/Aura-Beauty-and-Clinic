import { useCallback } from 'react';

import { can, isAdminRole, type Permission } from '@/lib/rbac';

import { useAuthStore } from './auth.store';
import { signOut } from './signOut';

/** The single hook feature code uses to read the session + check permissions. */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const hydrated = useAuthStore((s) => s.hydrated);

  /** Full sign-out: server session revoked, local session + query cache wiped, hard reload to /login. */
  const logout = useCallback(() => signOut(), []);

  const hasPermission = useCallback(
    (permission: Permission) =>
      user?.permissions?.includes(permission) ?? can(user?.role, permission),
    [user],
  );

  return {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(tokens?.accessToken && user),
    isAdmin: isAdminRole(user?.role),
    hydrated,
    hasPermission,
    logout,
  };
}
