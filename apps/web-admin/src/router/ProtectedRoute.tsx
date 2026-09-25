import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageLoader } from '@/components/shared/PageLoader';
import { useAuth } from '@/features/auth/useAuth';
import { useIdleLogout } from '@/features/auth/useIdleLogout';
import { usePreferenceSync } from '@/features/account/usePreferenceSync';
import { useAuthStore } from '@/features/auth/auth.store';
import { STORAGE_KEYS } from '@/lib/constants';
import { ROUTES } from '@/router/paths';

/**
 * Gate for the authenticated area:
 * 1. wait for the persisted session to be verified once (`hydrated`)
 * 2. no session → /login (remembering where the user was heading)
 * 3. session but not an admin role → /403
 * Also keeps sign-out / token refresh in sync across tabs.
 */
export function ProtectedRoute() {
  const { hydrated, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  const signedIn = hydrated && isAuthenticated && isAdmin;
  useIdleLogout(signedIn);
  usePreferenceSync(signedIn);

  // Keep every open tab on one session: a sign-out anywhere signs them all out, and a token
  // refresh in one tab is picked up by the others instead of them racing on stale tokens.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.auth) return;
      let signedOut = !e.newValue;
      try {
        signedOut ||= !(JSON.parse(e.newValue ?? '{}') as { state?: { tokens?: unknown } }).state?.tokens;
      } catch {
        /* unreadable → treat as signed out */
        signedOut = true;
      }
      if (signedOut) window.location.replace(ROUTES.login);
      else void useAuthStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
