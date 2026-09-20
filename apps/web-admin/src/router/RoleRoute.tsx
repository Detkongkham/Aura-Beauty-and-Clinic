import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import type { Permission } from '@/lib/rbac';
import { ROUTES } from '@/router/paths';

/** Nested guard — route requires a specific permission (design.md infra §13). */
export function RoleRoute({ permission }: { permission: Permission }) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <Outlet /> : <Navigate to={ROUTES.forbidden} replace />;
}
