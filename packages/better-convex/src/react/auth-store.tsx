'use client';

/**
 * Auth Store - Generic auth state management with jotai-x
 *
 * Provides token storage and auth callback configuration.
 * App configures handlers, lib hooks consume state.
 */

import {
  ConvexProviderWithAuth as ConvexProviderWithAuthBase,
  useConvexAuth,
} from 'convex/react';
import { createAtomStore } from 'jotai-x';
import { createContext, useContext } from 'react';

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
  /** Grace window for freshly seeded auth tokens while session sync catches up */
  sessionSyncGraceUntil: number | null;
};

export const AUTH_SESSION_SYNC_GRACE_MS = 10_000;

export const isSessionSyncGraceActive = (
  sessionSyncGraceUntil: number | null
) =>
  typeof sessionSyncGraceUntil === 'number' &&
  sessionSyncGraceUntil > Date.now();

/** Decode JWT expiration (ms timestamp) from token */
export function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const { AuthProvider, useAuthStore, useAuthState, useAuthValue } =
  createAtomStore(
    {
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
      sessionSyncGraceUntil: null,
    } as AuthStoreState,
    { name: 'auth' as const, suppressWarnings: true }
  );

export type AuthStore = ReturnType<typeof useAuthStore>;

/**
 * Safe wrapper around useConvexAuth that doesn't throw when used outside auth provider.
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
  if (authStore.store) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexAuth();
  }

  // Check ConvexAuthBridge (provides value directly - no conditional hook needed)
  if (bridgeAuth !== null) {
    return bridgeAuth;
  }

  // No auth configured - return defaults
  return { isAuthenticated: false, isLoading: false };
}

/**
 * Internal bridge component. Use `ConvexProviderWithAuth` instead.
 * @internal
 */
export function ConvexAuthBridge({ children }: { children: React.ReactNode }) {
  // Called unconditionally - this component must be inside ConvexProviderWithAuth
  const auth = useConvexAuth();

  return (
    <ConvexAuthBridgeContext.Provider value={auth}>
      {children}
    </ConvexAuthBridgeContext.Provider>
  );
}

/**
 * Convex provider with auth bridge for @convex-dev/auth users.
 * Automatically wraps children with ConvexAuthBridge.
 *
 * @example
 * ```tsx
 * import { ConvexProviderWithAuth } from 'better-convex/react';
 *
 * <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
 *   <App />
 * </ConvexProviderWithAuth>
 * ```
 */
export function ConvexProviderWithAuth({
  children,
  ...props
}: React.ComponentProps<typeof ConvexProviderWithAuthBase>) {
  return (
    <ConvexProviderWithAuthBase {...props}>
      <ConvexAuthBridge>{children}</ConvexAuthBridge>
    </ConvexProviderWithAuthBase>
  );
}

export const useAuth = () => {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  // Check better-convex AuthProvider first
  if (authStore.store) {
    // During SSR/prerendering, read token from store for SSR auth-awareness
    if (typeof window === 'undefined') {
      const token = authStore.get('token');

      return {
        hasSession: !!token,
        isAuthenticated: false,
        isLoading: true,
      };
    }

    // Use Convex SDK's auth state directly
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { isLoading, isAuthenticated } = useConvexAuth();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const token = useAuthValue('token');

    return {
      hasSession: !!token,
      isAuthenticated,
      isLoading,
    };
  }

  // Check ConvexAuthBridge (provides value directly - no conditional hook needed)
  if (bridgeAuth !== null) {
    return {
      hasSession: false, // No token access via bridge
      isAuthenticated: bridgeAuth.isAuthenticated,
      isLoading: bridgeAuth.isLoading,
    };
  }

  // No auth configured - return defaults
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
      onMutationUnauthorized();

      return true;
    }

    return callback ? void callback() : false;
  };
};

/** Render children only when maybe has auth (optimistic) */
export function MaybeAuthenticated({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuth = useMaybeAuth();
  return isAuth ? children : null;
}

/** Render children only when authenticated (server-verified) */
export function Authenticated({ children }: { children: React.ReactNode }) {
  const isAuth = useIsAuth();
  return isAuth ? children : null;
}

/** Render children only when maybe not auth (optimistic) */
export function MaybeUnauthenticated({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuth = useMaybeAuth();
  return isAuth ? null : children;
}

/** Render children only when not authenticated (server-verified) */
export function Unauthenticated({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  // Wait for loading, then show if not authenticated
  return isLoading || isAuthenticated ? null : children;
}
