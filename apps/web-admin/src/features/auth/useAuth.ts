import { useCallback } from 'react';

import { can, isAdminRole, type Permission } from '@/lib/rbac';

import { authApi } from './auth.api';
import { authStore, useAuthStore } from './auth.store';

/** The single hook feature code uses to read the session + check permissions. */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const hydrated = useAuthStore((s) => s.hydrated);
  const clear = useAuthStore((s) => s.clear);

  /** Clears locally at once; revoking the server session is fire-and-forget. */
  const logout = useCallback(() => {
    const refreshToken = authStore.getRefreshToken();
    clear();
    if (refreshToken) void authApi.logout(refreshToken).catch(() => {});
  }, [clear]);

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
