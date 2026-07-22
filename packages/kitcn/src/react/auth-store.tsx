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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

export type ConvexAuthRecoveryStatus = 'idle' | 'recovering' | 'failed';

export type ConvexAuthRecoveryErrorCode =
  | 'AUTH_PROVIDER_LOADING'
  | 'AUTH_PROVIDER_UNAUTHENTICATED'
  | 'AUTH_RECOVERY_CANCELLED'
  | 'AUTH_RECOVERY_FAILED'
  | 'AUTH_RECOVERY_TIMEOUT';

export class ConvexAuthRecoveryError extends Error {
  readonly code: ConvexAuthRecoveryErrorCode;

  constructor(code: ConvexAuthRecoveryErrorCode, message: string) {
    super(message);
    this.name = 'ConvexAuthRecoveryError';
    this.code = code;
  }
}

export type ConvexAuthRecoveryOptions = {
  /** Maximum time to wait for Convex backend confirmation. Defaults to 10s. */
  timeoutMs?: number;
};

export type ConvexAuthRecovery = {
  error: ConvexAuthRecoveryError | null;
  recover: (options?: ConvexAuthRecoveryOptions) => Promise<void>;
  status: ConvexAuthRecoveryStatus;
};

const ConvexAuthRecoveryContext = createContext<ConvexAuthRecovery | null>(
  null
);

/** Imperatively rebind Convex auth and wait for backend confirmation. */
export function useConvexAuthRecovery(): ConvexAuthRecovery {
  const recovery = useContext(ConvexAuthRecoveryContext);

  if (!recovery) {
    throw new Error(
      'useConvexAuthRecovery must be used inside ConvexProviderWithAuth'
    );
  }

  return recovery;
}

type ConvexProviderWithAuthProps = React.ComponentProps<
  typeof ConvexProviderWithAuthBase
>;

type PendingAuthRecovery = {
  bindingVersion: number;
  isBound: boolean;
  promise: Promise<void>;
  reject: (error: ConvexAuthRecoveryError) => void;
  resolve: () => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type AuthRecoverySnapshot = {
  authProviderAuthenticated: boolean;
  authProviderLoading: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
};

const AUTH_RECOVERY_TIMEOUT_MS = 10_000;

function ConvexAuthRecoverySync({
  authProviderAuthenticated,
  authProviderLoading,
  onChange,
}: {
  authProviderAuthenticated: boolean;
  authProviderLoading: boolean;
  onChange: (snapshot: AuthRecoverySnapshot) => void;
}) {
  const auth = useConvexAuth();

  useEffect(() => {
    onChange({
      authProviderAuthenticated,
      authProviderLoading,
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
    });
  }, [
    auth.isAuthenticated,
    auth.isLoading,
    authProviderAuthenticated,
    authProviderLoading,
    onChange,
  ]);

  return null;
}

function ConvexAuthBinding({
  bindingVersion,
  children,
  client,
  onAuthSnapshot,
  onBindingFetch,
  useAuth,
}: ConvexProviderWithAuthProps & {
  bindingVersion: number;
  onAuthSnapshot: (snapshot: AuthRecoverySnapshot) => void;
  onBindingFetch: (bindingVersion: number) => void;
}) {
  const {
    fetchAccessToken: fetchAccessTokenFromAuth,
    isAuthenticated,
    isLoading,
  } = useAuth();

  const fetchAccessToken = useCallback(
    (args: { forceRefreshToken: boolean }) => {
      onBindingFetch(bindingVersion);
      return fetchAccessTokenFromAuth(args);
    },
    [bindingVersion, fetchAccessTokenFromAuth, onBindingFetch]
  );
  const boundAuth = useMemo(
    () => ({
      fetchAccessToken,
      isAuthenticated,
      isLoading,
    }),
    [fetchAccessToken, isAuthenticated, isLoading]
  );
  const useBoundAuth = useCallback(() => boundAuth, [boundAuth]);

  return (
    <ConvexProviderWithAuthBase client={client} useAuth={useBoundAuth}>
      <ConvexAuthRecoverySync
        authProviderAuthenticated={isAuthenticated}
        authProviderLoading={isLoading}
        onChange={onAuthSnapshot}
      />
      <ConvexAuthBridge>{children}</ConvexAuthBridge>
    </ConvexProviderWithAuthBase>
  );
}

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

  // Check kitcn AuthProvider first
  if (authStore.store) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const isAuthenticated = useAuthValue('isAuthenticated');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const isLoading = useAuthValue('isLoading');

    return { isAuthenticated, isLoading };
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
 * import { ConvexProviderWithAuth } from 'kitcn/react';
 *
 * <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
 *   <App />
 * </ConvexProviderWithAuth>
 * ```
 */
export function ConvexProviderWithAuth({
  children,
  client,
  useAuth,
}: ConvexProviderWithAuthProps) {
  const [bindingVersion, setBindingVersion] = useState(0);
  const [error, setError] = useState<ConvexAuthRecoveryError | null>(null);
  const [status, setStatus] = useState<ConvexAuthRecoveryStatus>('idle');
  const bindingVersionRef = useRef(0);
  const pendingRef = useRef<PendingAuthRecovery | null>(null);
  const authSnapshotRef = useRef<AuthRecoverySnapshot>({
    authProviderAuthenticated: false,
    authProviderLoading: true,
    isAuthenticated: false,
    isLoading: true,
  });

  const settleRecovery = useCallback(
    (recoveryError: ConvexAuthRecoveryError | null) => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingRef.current = null;

      if (recoveryError) {
        setError(recoveryError);
        setStatus('failed');
        pending.reject(recoveryError);
        return;
      }

      setError(null);
      setStatus('idle');
      pending.resolve();
    },
    []
  );

  const onAuthSnapshot = useCallback(
    (snapshot: AuthRecoverySnapshot) => {
      authSnapshotRef.current = snapshot;

      const pending = pendingRef.current;
      if (!pending) {
        return;
      }

      if (snapshot.authProviderLoading) {
        settleRecovery(
          new ConvexAuthRecoveryError(
            'AUTH_PROVIDER_LOADING',
            'Cannot recover Convex auth while the auth provider is loading'
          )
        );
        return;
      }
      if (!snapshot.authProviderAuthenticated) {
        settleRecovery(
          new ConvexAuthRecoveryError(
            'AUTH_PROVIDER_UNAUTHENTICATED',
            'Cannot recover Convex auth without an authenticated provider session'
          )
        );
        return;
      }
      if (!pending.isBound || snapshot.isLoading) {
        return;
      }
      if (snapshot.isAuthenticated) {
        settleRecovery(null);
        return;
      }

      settleRecovery(
        new ConvexAuthRecoveryError(
          'AUTH_RECOVERY_FAILED',
          'Convex rejected the recovered authentication binding'
        )
      );
    },
    [settleRecovery]
  );

  const onBindingFetch = useCallback((activeBindingVersion: number) => {
    const pending = pendingRef.current;
    if (pending?.bindingVersion === activeBindingVersion) {
      pending.isBound = true;
    }
  }, []);

  const recover = useCallback(
    (options: ConvexAuthRecoveryOptions = {}) => {
      const pending = pendingRef.current;
      if (pending) {
        return pending.promise;
      }

      const authSnapshot = authSnapshotRef.current;
      if (authSnapshot.authProviderLoading) {
        const recoveryError = new ConvexAuthRecoveryError(
          'AUTH_PROVIDER_LOADING',
          'Cannot recover Convex auth while the auth provider is loading'
        );
        setError(recoveryError);
        setStatus('failed');
        return Promise.reject(recoveryError);
      }
      if (!authSnapshot.authProviderAuthenticated) {
        const recoveryError = new ConvexAuthRecoveryError(
          'AUTH_PROVIDER_UNAUTHENTICATED',
          'Cannot recover Convex auth without an authenticated provider session'
        );
        setError(recoveryError);
        setStatus('failed');
        return Promise.reject(recoveryError);
      }

      let resolve!: () => void;
      let reject!: (error: ConvexAuthRecoveryError) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const timeoutMs = options.timeoutMs ?? AUTH_RECOVERY_TIMEOUT_MS;
      const nextBindingVersion = bindingVersionRef.current + 1;
      const timeoutId = setTimeout(() => {
        settleRecovery(
          new ConvexAuthRecoveryError(
            'AUTH_RECOVERY_TIMEOUT',
            `Convex auth recovery timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);

      pendingRef.current = {
        bindingVersion: nextBindingVersion,
        isBound: false,
        promise,
        reject,
        resolve,
        timeoutId,
      };
      bindingVersionRef.current = nextBindingVersion;
      setError(null);
      setStatus('recovering');
      setBindingVersion(nextBindingVersion);

      return promise;
    },
    [settleRecovery]
  );

  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingRef.current = null;
      pending.reject(
        new ConvexAuthRecoveryError(
          'AUTH_RECOVERY_CANCELLED',
          'Convex auth recovery was cancelled because the provider unmounted'
        )
      );
    },
    []
  );

  const recovery = useMemo(
    () => ({ error, recover, status }),
    [error, recover, status]
  );

  return (
    <ConvexAuthRecoveryContext.Provider value={recovery}>
      <ConvexAuthBinding
        bindingVersion={bindingVersion}
        client={client}
        onAuthSnapshot={onAuthSnapshot}
        onBindingFetch={onBindingFetch}
        useAuth={useAuth}
      >
        {children}
      </ConvexAuthBinding>
    </ConvexAuthRecoveryContext.Provider>
  );
}

export const useAuth = () => {
  const authStore = useAuthStore();
  const bridgeAuth = useConvexAuthBridge();

  // Check kitcn AuthProvider first
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

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const token = useAuthValue('token');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const isAuthenticated = useAuthValue('isAuthenticated');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const isLoading = useAuthValue('isLoading');

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
