/** @jsxImportSource solid-js */

/**
 * Auth Store - Generic auth state management with Solid stores
 *
 * Provides token storage and auth callback configuration.
 * App configures handlers, lib hooks consume state.
 */

import {
  createContext,
  type JSX,
  type ParentProps,
  Show,
  useContext,
} from 'solid-js';
import { createStore } from 'solid-js/store';

import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';

// ============================================================================
// FetchAccessToken Context
// ============================================================================

export type FetchAccessTokenFn = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

export const FetchAccessTokenContext = createContext<FetchAccessTokenFn | null>(
  null
);

/** Get fetchAccessToken from context (available immediately, no race condition) */
export const useFetchAccessToken = () => useContext(FetchAccessTokenContext);

// ============================================================================
// ConvexAuthBridge Context - For @convex-dev/auth users without better-auth
// ============================================================================

type ConvexAuthResult = { isAuthenticated: boolean; isLoading: boolean };

/**
 * Context that holds auth result from ConvexAuthBridge.
 * Allows @convex-dev/auth users to use skipUnauth queries without better-auth.
 */
const ConvexAuthBridgeContext = createContext<ConvexAuthResult | null>(null);

/** Get auth from bridge context (null if no bridge configured) */
export const useConvexAuthBridge = () => useContext(ConvexAuthBridgeContext);

// ============================================================================
// Auth Store State
// ============================================================================

export type AuthStoreState = {
  /** Callback when mutation/action called while unauthorized. Throws by default. */
  onMutationUnauthorized: () => void;
  /** Callback when query called while unauthorized. Noop by default. */
  onQueryUnauthorized: (info: { queryName: string }) => void;
  /** Custom function to detect UNAUTHORIZED errors. Default checks code or "auth" in message. */
  isUnauthorized: (error: unknown) => boolean;
  /** Cached Convex JWT for HTTP requests */
  token: string | null;
  /** JWT expiration timestamp (ms) */
  expiresAt: number | null;
  /** Auth loading state (synced from useConvexAuth for class methods) */
  isLoading: boolean;
  /** Auth state (synced from useConvexAuth for class methods) */
  isAuthenticated: boolean;
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

const defaultState: AuthStoreState = {
  onMutationUnauthorized: () => {
    throw new CRPCClientError({
      code: 'UNAUTHORIZED',
      functionName: 'mutation',
    });
  },
  onQueryUnauthorized: () => {},
  isUnauthorized: defaultIsUnauthorized,
  token: null,
  expiresAt: null,
  isLoading: true,
  isAuthenticated: false,
};

// ============================================================================
// Auth Store
// ============================================================================

export type AuthStore = {
  get: <K extends keyof AuthStoreState>(key: K) => AuthStoreState[K];
  set: <K extends keyof AuthStoreState>(
    key: K,
    value: AuthStoreState[K]
  ) => void;
  store: AuthStoreState;
};

const AuthStoreContext = createContext<AuthStore | null>(null);

export function useAuthStore(): AuthStore {
  const ctx = useContext(AuthStoreContext);
  if (!ctx) {
    // Return a dummy store when no provider (matches jotai-x behavior)
    return {
      get: (key) => defaultState[key],
      set: () => {},
      store: null as unknown as AuthStoreState,
    };
  }
  return ctx;
}

export function useAuthValue<K extends keyof AuthStoreState>(
  key: K
): AuthStoreState[K] {
  const store = useAuthStore();
  return store.get(key);
}

// ============================================================================
// AuthProvider
// ============================================================================

export function AuthProvider(props: {
  children: JSX.Element;
  initialValues?: Partial<AuthStoreState>;
  isUnauthorized?: (error: unknown) => boolean;
  onMutationUnauthorized?: () => void;
  onQueryUnauthorized?: (info: { queryName: string }) => void;
}) {
  const [state, setState] = createStore<AuthStoreState>({
    ...defaultState,
    ...props.initialValues,
    ...(props.isUnauthorized && { isUnauthorized: props.isUnauthorized }),
    ...(props.onMutationUnauthorized && {
      onMutationUnauthorized: props.onMutationUnauthorized,
    }),
    ...(props.onQueryUnauthorized && {
      onQueryUnauthorized: props.onQueryUnauthorized,
    }),
  });

  const store: AuthStore = {
    get: (key) => state[key],
    set: (key, value) => setState(key, value as never),
    store: state,
  };

  return (
    <AuthStoreContext.Provider value={store}>
      {props.children}
    </AuthStoreContext.Provider>
  );
}

// ============================================================================
// Safe Auth Hooks
// ============================================================================

/**
 * Safe wrapper that doesn't throw when used outside auth provider.
 * Returns { isAuthenticated: false, isLoading: false } when no auth provider.
 *
 * Supports both:
 * - better-auth users (via AuthProvider)
 * - @convex-dev/auth users (via ConvexAuthBridge)
 */
export function useSafeConvexAuth(): ConvexAuthResult {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  // Return getters so property access reads lazily from the store
  return {
    get isAuthenticated() {
      if (authStore.store) return authStore.get('isAuthenticated');
      if (bridgeAuth !== null) return bridgeAuth.isAuthenticated;
      return false;
    },
    get isLoading() {
      if (authStore.store) return authStore.get('isLoading');
      if (bridgeAuth !== null) return bridgeAuth.isLoading;
      return false;
    },
  };
}

// ============================================================================
// ConvexAuthBridge
// ============================================================================

/**
 * Bridge component that provides auth state via context.
 * @internal
 */
export function ConvexAuthBridge(
  props: ParentProps<{
    isLoading: boolean;
    isAuthenticated: boolean;
  }>
) {
  // Use getters so context consumers can track prop changes reactively
  const value = {
    get isLoading() {
      return props.isLoading;
    },
    get isAuthenticated() {
      return props.isAuthenticated;
    },
  };

  return (
    <ConvexAuthBridgeContext.Provider value={value}>
      {props.children}
    </ConvexAuthBridgeContext.Provider>
  );
}

// ============================================================================
// Auth Hooks
// ============================================================================

export const useAuth = () => {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  // Return getters so property access reads lazily from the store
  return {
    get hasSession() {
      if (authStore.store) return !!authStore.get('token');
      return false;
    },
    get isAuthenticated() {
      if (authStore.store) return authStore.get('isAuthenticated');
      if (bridgeAuth !== null) return bridgeAuth.isAuthenticated;
      return false;
    },
    get isLoading() {
      if (authStore.store) return authStore.get('isLoading');
      if (bridgeAuth !== null) return bridgeAuth.isLoading;
      return false;
    },
  };
};

/** Check if user maybe has auth (optimistic, has token) */
export const useMaybeAuth = () => {
  const auth = useAuth();
  return () => auth.hasSession;
};

/** Check if user is authenticated (server-verified) */
export const useIsAuth = () => {
  const auth = useAuth();
  return () => auth.isAuthenticated;
};

export const useAuthGuard = () => {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  return (callback?: () => Promise<void> | void) => {
    // Read auth state lazily at callback time so guard follows auth transitions
    let isAuthenticated = false;
    if (authStore.store) {
      isAuthenticated = authStore.get('isAuthenticated');
    } else if (bridgeAuth !== null) {
      isAuthenticated = bridgeAuth.isAuthenticated;
    }

    if (!isAuthenticated) {
      authStore.get('onMutationUnauthorized')();

      return true;
    }

    return callback ? void callback() : false;
  };
};

// ============================================================================
// Auth Guard Components
// ============================================================================

/** Render children only when maybe has auth (optimistic) */
export function MaybeAuthenticated(props: { children: JSX.Element }) {
  const isAuth = useMaybeAuth();
  return <Show when={isAuth()}>{props.children}</Show>;
}

/** Render children only when authenticated (server-verified) */
export function Authenticated(props: { children: JSX.Element }) {
  const isAuth = useIsAuth();
  return <Show when={isAuth()}>{props.children}</Show>;
}

/** Render children only when maybe not auth (optimistic) */
export function MaybeUnauthenticated(props: { children: JSX.Element }) {
  const isAuth = useMaybeAuth();
  return <Show when={!isAuth()}>{props.children}</Show>;
}

/** Render children only when not authenticated (server-verified) */
export function Unauthenticated(props: { children: JSX.Element }) {
  const auth = useAuth();
  // Wait for loading, then show if not authenticated
  return (
    <Show when={!auth.isAuthenticated && !auth.isLoading}>
      {props.children}
    </Show>
  );
}
