import { env } from '@/config/env';
import { queryClient } from '@/lib/queryClient';
import { ROUTES } from '@/router/paths';

import { useAuthStore } from './auth.store';

/** Why the session ended — shown as a notice on /login (`?reason=`). */
export type LogoutReason = 'idle' | 'mfa' | 'revoked';

let signingOut = false;

/**
 * The one way out of the console — manual logout, idle timeout and a dead session all end here:
 * 1. revoke the server session (`keepalive`, so the request survives the page unload below)
 * 2. wipe the persisted tokens (other tabs see the storage change and follow — ProtectedRoute)
 * 3. drop every cached query, so the next account never sees this one's data
 * 4. hard-replace to /login: fresh JS state, no "back" into the console, no return-to redirect
 */
export function signOut(reason?: LogoutReason): void {
  if (signingOut) return;
  signingOut = true;

  const refreshToken = useAuthStore.getState().tokens?.refreshToken;
  if (refreshToken) {
    void fetch(`${env.apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    }).catch(() => {});
  }
  useAuthStore.getState().clear();
  queryClient.clear();

  if (typeof window !== 'undefined') {
    window.location.replace(reason ? `${ROUTES.login}?reason=${reason}` : ROUTES.login);
  }
}
