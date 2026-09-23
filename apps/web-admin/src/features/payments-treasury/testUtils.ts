import { PERMISSIONS } from '@abcp/shared-types';

import { useAuthStore } from '@/features/auth/auth.store';

/** Sign in as the owner (every permission) — all write actions on these pages are permission-gated. */
export function signInAsOwner(): void {
  useAuthStore.getState().setSession({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin',
      phone: '2021000001',
      email: null,
      role: 'SUPER_ADMIN',
      branchId: null,
      permissions: [...PERMISSIONS],
      allowDirectMessages: false,
    },
    tokens: { accessToken: 'mock-access.x', refreshToken: 'mock-refresh.x', expiresIn: 900 },
  });
  useAuthStore.getState().setHydrated(true);
}
