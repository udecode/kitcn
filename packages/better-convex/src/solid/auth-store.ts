import { createContext, useContext } from 'solid-js';
import { createStore, type SetStoreFunction } from 'solid-js/store';

import { defaultIsUnauthorized } from '../crpc/error';

export type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
  onQueryUnauthorized: (info: { queryName: string }) => void;
  isUnauthorized: (error: unknown) => boolean;
};

export function createAuthStore(initial?: Partial<AuthState>) {
  return createStore<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    token: null,
    expiresAt: null,
    onQueryUnauthorized: () => {},
    isUnauthorized: defaultIsUnauthorized,
    ...initial,
  });
}

export type AuthContextValue = {
  store: AuthState;
  setStore: SetStoreFunction<AuthState>;
};

export const AuthContext = createContext<AuthContextValue>();

export function useAuthStore() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthStore must be used within AuthProvider');
  return ctx;
}

/** Convenience accessor matching the AuthStore interface used by ConvexQueryClient */
export function createAuthStoreAccessor(store: AuthState) {
  return {
    get(key: keyof AuthState) {
      return store[key];
    },
  };
}
