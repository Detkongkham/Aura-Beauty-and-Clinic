import type { AuthTokens, AuthUser } from '@abcp/shared-types';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'aura.session';

export type AuthStatus = 'hydrating' | 'authed' | 'guest';

type PersistedSession = { tokens: AuthTokens; user: AuthUser };

type AuthState = {
  status: AuthStatus;
  tokens: AuthTokens | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (session: PersistedSession) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clear: () => void;
  setStatus: (status: AuthStatus) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'hydrating',
  tokens: null,
  accessToken: null,
  refreshToken: null,
  user: null,

  setSession: ({ tokens, user }) => {
    void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ tokens, user }));
    set({
      status: 'authed',
      tokens,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    });
  },

  updateUser: (patch) =>
    set((state) => {
      if (!state.user) return state;
      const user = { ...state.user, ...patch };
      if (state.tokens) {
        void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ tokens: state.tokens, user }));
      }
      return { user };
    }),

  clear: () => {
    void SecureStore.deleteItemAsync(STORAGE_KEY);
    set({ status: 'guest', tokens: null, accessToken: null, refreshToken: null, user: null });
  },

  setStatus: (status) => set({ status }),
}));

/** ອ່ານ session ທີ່ persist ໄວ້ (ໃຊ້ຕອນ bootstrap). */
export async function readPersistedSession(): Promise<PersistedSession | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}
