/* eslint-disable react-hooks/rules-of-hooks */
import { createContext, useContext } from 'solid-js';
import { createStore, type SetStoreFunction } from 'solid-js/store';

import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';

export type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
  /** Callback when mutation/action called while unauthorized. Throws by default. */
  onMutationUnauthorized: () => void;
  onQueryUnauthorized: (info: { queryName: string }) => void;
  isUnauthorized: (error: unknown) => boolean;
};

/** Decode JWT expiration (ms timestamp) from token */
export function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function createAuthStore(initial?: Partial<AuthState>) {
  return createStore<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    token: null,
    expiresAt: null,
    onMutationUnauthorized: () => {
      throw new CRPCClientError({
        code: 'UNAUTHORIZED',
        functionName: 'mutation',
      });
    },
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

/** Reactive auth state derived from the auth store */
export function createAuth() {
  const { store } = useAuthStore();
  return {
    get hasSession() {
      return !!store.token;
    },
    get isAuthenticated() {
      return store.isAuthenticated;
    },
    get isLoading() {
      return store.isLoading;
    },
  };
}

/** Check if user maybe has auth (optimistic, has token) */
export function createMaybeAuth() {
  const auth = createAuth();
  return () => auth.hasSession;
}

/** Check if user is authenticated (server-verified) */
export function createIsAuth() {
  const auth = createAuth();
  return () => auth.isAuthenticated;
}

/** Guard that checks auth before executing a callback */
export function createAuthGuard() {
  const { store } = useAuthStore();
  return (callback?: () => Promise<void> | void) => {
    if (!store.isAuthenticated) {
      store.onMutationUnauthorized?.();
      return true;
    }
    return callback ? void callback() : false;
  };
}
