import { useEffect } from 'react';

import { authApi } from './auth.api';
import { useAuthStore } from './auth.store';

/**
 * Verifies a persisted session once on app start: if we have tokens, fetch /auth/me
 * to confirm they're still valid and refresh the cached user. Always ends with
 * `hydrated = true` so ProtectedRoute can stop showing a loader.
 */
export function useSessionBootstrap(): void {
  useEffect(() => {
    const { tokens, hydrated, setUser, setHydrated } = useAuthStore.getState();

    if (hydrated) return;
    if (!tokens?.accessToken) {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    void authApi
      .me()
      .then((user) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => {
        // A dead session is signed out by the http interceptor. Anything else (offline, backend
        // restarting, 5xx) keeps the cached session — a reload must never sign anyone out.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
