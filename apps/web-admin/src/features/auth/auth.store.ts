import type { AuthTokens, AuthUser } from '@abcp/shared-types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/lib/constants';

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  /** false until the persisted session has been rehydrated + verified once. */
  hydrated: boolean;
  setSession: (payload: { user: AuthUser; tokens: AuthTokens }) => void;
  setUser: (user: AuthUser) => void;
  setTokens: (tokens: AuthTokens) => void;
  setHydrated: (value: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      hydrated: false,
      setSession: ({ user, tokens }) => set({ user, tokens }),
      setUser: (user) => set({ user }),
      setTokens: (tokens) => set({ tokens }),
      setHydrated: (value) => set({ hydrated: value }),
      clear: () => set({ user: null, tokens: null }),
    }),
    {
      name: STORAGE_KEYS.auth,
      partialize: (s) => ({ user: s.user, tokens: s.tokens }),
    },
  ),
);

/** Non-reactive accessors for use outside React (axios interceptors). */
export const authStore = {
  get: () => useAuthStore.getState(),
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getRefreshToken: () => useAuthStore.getState().tokens?.refreshToken ?? null,
};
