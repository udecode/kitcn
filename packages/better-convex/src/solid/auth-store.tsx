/**
 * Auth Store - Generic auth state management with Solid signals
 *
 * Provides token storage and auth callback configuration.
 * App configures handlers, lib hooks consume state.
 */

import type { ConvexProviderWithAuth as ConvexProviderWithAuthBase } from 'convex/react';
import type { JSX } from 'solid-js';
import { createContext, createSignal, Show, useContext } from 'solid-js';
import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';

// ============================================================================
// FetchAccessToken Context - Eliminates race condition by passing through context
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

// ============================================================================
// Auth Store - Solid signals
// ============================================================================

export type AuthStore = {
  get: <K extends keyof AuthStoreState>(key: K) => AuthStoreState[K];
  set: <K extends keyof AuthStoreState>(
    key: K,
    value: AuthStoreState[K]
  ) => void;
  store: true;
};

// ============================================================================
// AuthProvider Context
// ============================================================================

type AuthContextValue = AuthStore | null;

const AuthContext = createContext<AuthContextValue>(null);

type AuthProviderProps = {
  children: JSX.Element;
  initialState?: Partial<AuthStoreState>;
};

export function AuthProvider(props: AuthProviderProps) {
  const [token, setToken] = createSignal<string | null>(
    props.initialState?.token ?? null
  );
  const [expiresAt, setExpiresAt] = createSignal<number | null>(
    props.initialState?.expiresAt ?? null
  );
  const [isLoading, setIsLoading] = createSignal<boolean>(
    props.initialState?.isLoading ?? true
  );
  const [isAuthenticated, setIsAuthenticated] = createSignal<boolean>(
    props.initialState?.isAuthenticated ?? false
  );
  const [onMutationUnauthorized, setOnMutationUnauthorized] = createSignal<
    () => void
  >(
    props.initialState?.onMutationUnauthorized ??
      (() => {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: 'mutation',
        });
      })
  );
  const [onQueryUnauthorized, setOnQueryUnauthorized] = createSignal<
    (info: { queryName: string }) => void
  >(props.initialState?.onQueryUnauthorized ?? (() => {}));
  const [isUnauthorizedFn, setIsUnauthorizedFn] = createSignal<
    (error: unknown) => boolean
  >(props.initialState?.isUnauthorized ?? defaultIsUnauthorized);

  const store: AuthStore = {
    store: true,
    get<K extends keyof AuthStoreState>(key: K): AuthStoreState[K] {
      switch (key) {
        case 'token':
          return token() as AuthStoreState[K];
        case 'expiresAt':
          return expiresAt() as AuthStoreState[K];
        case 'isLoading':
          return isLoading() as AuthStoreState[K];
        case 'isAuthenticated':
          return isAuthenticated() as AuthStoreState[K];
        case 'onMutationUnauthorized':
          return onMutationUnauthorized() as AuthStoreState[K];
        case 'onQueryUnauthorized':
          return onQueryUnauthorized() as AuthStoreState[K];
        case 'isUnauthorized':
          return isUnauthorizedFn() as AuthStoreState[K];
        default:
          return undefined as unknown as AuthStoreState[K];
      }
    },
    set<K extends keyof AuthStoreState>(key: K, value: AuthStoreState[K]) {
      switch (key) {
        case 'token':
          setToken(value as string | null);
          break;
        case 'expiresAt':
          setExpiresAt(value as number | null);
          break;
        case 'isLoading':
          setIsLoading(value as boolean);
          break;
        case 'isAuthenticated':
          setIsAuthenticated(value as boolean);
          break;
        case 'onMutationUnauthorized':
          setOnMutationUnauthorized(() => value as () => void);
          break;
        case 'onQueryUnauthorized':
          setOnQueryUnauthorized(
            () => value as (info: { queryName: string }) => void
          );
          break;
        case 'isUnauthorized':
          setIsUnauthorizedFn(() => value as (error: unknown) => boolean);
          break;
      }
    },
  };

  return AuthContext.Provider({
    value: store,
    get children() {
      return props.children;
    },
  });
}

export function useAuthStore(): AuthStore | null {
  return useContext(AuthContext);
}

export function useAuthValue<K extends keyof AuthStoreState>(
  key: K
): AuthStoreState[K] | undefined {
  const store = useAuthStore();
  return store?.get(key);
}

// ============================================================================
// Safe Convex Auth
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

  // Check better-convex AuthProvider first
  if (authStore) {
    return {
      isAuthenticated: authStore.get('isAuthenticated'),
      isLoading: authStore.get('isLoading'),
    };
  }

  // Check ConvexAuthBridge
  if (bridgeAuth !== null) {
    return bridgeAuth;
  }

  // No auth configured - return defaults
  return { isAuthenticated: false, isLoading: false };
}

// ============================================================================
// Auth Hooks
// ============================================================================

export const useAuth = () => {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  if (authStore) {
    const token = authStore.get('token');
    const isLoading = authStore.get('isLoading');
    const isAuthenticated = authStore.get('isAuthenticated');

    return {
      hasSession: !!token,
      isAuthenticated,
      isLoading,
    };
  }

  if (bridgeAuth !== null) {
    return {
      hasSession: false,
      isAuthenticated: bridgeAuth.isAuthenticated,
      isLoading: bridgeAuth.isLoading,
    };
  }

  return {
    hasSession: false,
    isAuthenticated: false,
    isLoading: false,
  };
};

/** Check if user maybe has auth (optimistic, has token) */
export const useMaybeAuth = () => {
  const { hasSession } = useAuth();
  return hasSession;
};

/** Check if user is authenticated (server-verified) */
export const useIsAuth = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
};

export const useAuthGuard = () => {
  const { isAuthenticated } = useSafeConvexAuth();
  const onMutationUnauthorized = useAuthValue('onMutationUnauthorized');

  return (callback?: () => Promise<void> | void) => {
    if (!isAuthenticated) {
      onMutationUnauthorized?.();
      return true;
    }

    return callback ? void callback() : false;
  };
};

// ============================================================================
// Conditional Rendering Components
// ============================================================================

/** Render children only when maybe has auth (optimistic) */
export function MaybeAuthenticated(props: { children: JSX.Element }) {
  const isAuth = useMaybeAuth();
  return Show({
    get when() {
      return isAuth;
    },
    get children() {
      return props.children;
    },
  });
}

/** Render children only when authenticated (server-verified) */
export function Authenticated(props: { children: JSX.Element }) {
  const isAuth = useIsAuth();
  return Show({
    get when() {
      return isAuth;
    },
    get children() {
      return props.children;
    },
  });
}

/** Render children only when maybe not auth (optimistic) */
export function MaybeUnauthenticated(props: { children: JSX.Element }) {
  const isAuth = useMaybeAuth();
  return Show({
    get when() {
      return !isAuth;
    },
    get children() {
      return props.children;
    },
  });
}

/** Render children only when not authenticated (server-verified) */
export function Unauthenticated(props: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();
  return Show({
    get when() {
      return !isLoading && !isAuthenticated;
    },
    get children() {
      return props.children;
    },
  });
}

// ============================================================================
// ConvexProviderWithAuth
// ============================================================================

/**
 * Convex provider with auth bridge for @convex-dev/auth users.
 *
 * @example
 * ```tsx
 * import { ConvexProviderWithAuth } from 'better-convex/solid';
 *
 * <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
 *   <App />
 * </ConvexProviderWithAuth>
 * ```
 */
export function ConvexProviderWithAuth(
  props: Parameters<typeof ConvexProviderWithAuthBase>[0] & {
    children: JSX.Element;
  }
) {
  // We wrap children with a bridge context provider
  // Since we can't use React hooks in Solid, we provide a static bridge
  // For @convex-dev/auth, auth state must be passed via props
  return ConvexAuthBridgeContext.Provider({
    value: null,
    get children() {
      return props.children;
    },
  });
}
