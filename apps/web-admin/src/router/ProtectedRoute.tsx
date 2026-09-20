import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageLoader } from '@/components/shared/PageLoader';
import { useAuth } from '@/features/auth/useAuth';
import { AUTH_LOGOUT_EVENT } from '@/services/http';
import { ROUTES } from '@/router/paths';

/**
 * Gate for the authenticated area:
 * 1. wait for the persisted session to be verified once (`hydrated`)
 * 2. no session → /login (remembering where the user was heading)
 * 3. session but not an admin role → /403
 * Also listens for the interceptor's forced-logout event.
 */
export function ProtectedRoute() {
  const { hydrated, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const onLogout = () => {
      // hard redirect keeps it simple and clears in-memory query cache on next mount
      if (window.location.pathname !== ROUTES.login) {
        window.location.assign(ROUTES.login);
      }
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, []);

  if (!hydrated) return <PageLoader />;

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname + location.search }} />;
  }

  if (!isAdmin) {
    return <Navigate to={ROUTES.forbidden} replace />;
  }

  return <Outlet />;
}
