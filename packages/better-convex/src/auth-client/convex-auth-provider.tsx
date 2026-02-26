'use client';

/**
 * Unified Convex + Better Auth provider
 */

import type { AuthTokenFetcher } from 'convex/browser';
import type { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithAuth, useConvexAuth } from 'convex/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';
import {
  AuthProvider,
  decodeJwtExp,
  FetchAccessTokenContext,
  useAuthStore,
  useAuthValue,
} from '../react/auth-store';

// Re-export AuthClient type
export type { AuthClient } from '@convex-dev/better-auth/react';

import type { AuthClient } from '@convex-dev/better-auth/react';

type IConvexReactClient = {
  setAuth(fetchToken: AuthTokenFetcher): void;
  clearAuth(): void;
};

export type ConvexAuthProviderProps = {
  children: ReactNode;
  /** Convex client instance */
  client: ConvexReactClient;
  /** Better Auth client instance */
  authClient: AuthClient;
  /** Initial session token (from SSR) */
  initialToken?: string;
  /** Callback when mutation called while unauthorized */
  onMutationUnauthorized?: () => void;
  /** Callback when query called while unauthorized */
  onQueryUnauthorized?: (info: { queryName: string }) => void;
  /** Custom function to detect UNAUTHORIZED errors. Default checks code property. */
  isUnauthorized?: (error: unknown) => boolean;
};

const defaultMutationHandler = () => {
  throw new CRPCClientError({
    code: 'UNAUTHORIZED',
    functionName: 'mutation',
  });
};

const hasActiveSessionData = (session: unknown) => {
  if (!session || typeof session !== 'object') {
    return false;
  }
  return Boolean((session as { session?: unknown }).session);
};

/**
 * Unified auth provider for Convex + Better Auth.
 * Handles token sync, HMR persistence, and auth callbacks.
 *
 * Structure: AuthProvider wraps ConvexAuthProviderInner so that
 * useAuthStore() is available when creating fetchAccessToken.
 */
export function ConvexAuthProvider({
  children,
  client,
  authClient,
  initialToken,
  onMutationUnauthorized,
  onQueryUnauthorized,
  isUnauthorized,
}: ConvexAuthProviderProps) {
  // Handle cross-domain one-time token
  useOTTHandler(authClient);

  // Memoize decoded JWT to avoid re-parsing on every render
  const tokenValues = useMemo(
    () => ({
      expiresAt: initialToken ? decodeJwtExp(initialToken) : null,
      token: initialToken ?? null,
    }),
    [initialToken]
  );

  // AuthProvider wraps inner so useAuthStore() is available inside
  // SSR initial values: set token/expiresAt, keep isLoading=true until Convex validates
  return (
    <AuthProvider
      initialValues={tokenValues}
      isUnauthorized={isUnauthorized ?? defaultIsUnauthorized}
      onMutationUnauthorized={onMutationUnauthorized ?? defaultMutationHandler}
      onQueryUnauthorized={onQueryUnauthorized ?? (() => {})}
    >
      <ConvexAuthProviderInner authClient={authClient} client={client}>
        {children}
      </ConvexAuthProviderInner>
    </AuthProvider>
  );
}

/**
 * Inner provider that has access to AuthStore via useAuthStore().
 * Creates fetchAccessToken and passes it through context (no race condition).
 */
function ConvexAuthProviderInner({
  children,
  client,
  authClient,
}: {
  children: ReactNode;
  client: ConvexReactClient;
  authClient: AuthClient;
}) {
  const authStore = useAuthStore();
  const { data: session, isPending } = authClient.useSession();

  // Use refs to avoid recreating fetchAccessToken on session refetch (tab focus)
  // This prevents Convex SDK from calling setAuth() again and causing race conditions
  const sessionRef = useRef(session);
  const isPendingRef = useRef(isPending);
  const pendingTokenRef = useRef<Promise<string | null> | null>(null);
  sessionRef.current = session;
  isPendingRef.current = isPending;

  // Clear token when session becomes null (logout)
  // This can't be inside fetchAccessToken because it's not called after logout
  useEffect(() => {
    if (!hasActiveSessionData(session) && !isPending) {
      authStore.set('token', null);
      authStore.set('expiresAt', null);
      authStore.set('isAuthenticated', false);
    }
  }, [session, isPending, authStore]);

  // Stable fetchAccessToken - only recreated when authStore/authClient change (rare)
  // Reads session/isPending from refs to avoid dependency on changing objects
  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken = false,
    }: {
      forceRefreshToken?: boolean;
    } = {}) => {
      const currentSession = sessionRef.current;
      const currentIsPending = isPendingRef.current;
      const hasSession = hasActiveSessionData(currentSession);

      // If no session:
      // - If still pending (hydration), return cached token from SSR
      // - If not pending (confirmed no session), clear cache
      if (!hasSession) {
        if (!currentIsPending) {
          authStore.set('token', null);
          authStore.set('expiresAt', null);
        }
        return authStore.get('token');
      }

      // Check cached JWT from store
      const cachedToken = authStore.get('token');
      const expiresAt = authStore.get('expiresAt');
      const timeRemaining = expiresAt ? expiresAt - Date.now() : 0;

      // Return cached if valid and not forced (60s leeway)
      if (
        !forceRefreshToken &&
        cachedToken &&
        expiresAt &&
        timeRemaining >= 60_000
      ) {
        return cachedToken;
      }

      if (!forceRefreshToken && pendingTokenRef.current) {
        return pendingTokenRef.current;
      }

      // Fetch fresh JWT
      // biome-ignore lint/suspicious/noExplicitAny: convex plugin type
      pendingTokenRef.current = (authClient as any).convex
        .token({ fetchOptions: { throw: false } })
        .then((result: { data?: { token?: string | null } | null }) => {
          const jwt = result.data?.token || null;

          if (jwt) {
            const exp = decodeJwtExp(jwt);
            authStore.set('token', jwt);
            authStore.set('expiresAt', exp);
            return jwt;
          }

          authStore.set('token', null);
          authStore.set('expiresAt', null);
          return null;
        })
        .catch((error: unknown) => {
          authStore.set('token', null);
          authStore.set('expiresAt', null);
          console.error('[fetchAccessToken] error', error);
          return null;
        })
        .finally(() => {
          pendingTokenRef.current = null;
        });

      return pendingTokenRef.current;
    },
    // Stable deps - authStore/authClient rarely change
    // session/isPending accessed via refs to prevent callback recreation
    [authStore, authClient]
  );

  // Create useAuth hook for ConvexProviderWithAuth
  // The hook itself is stable - it reads current values from refs
  // This prevents Convex SDK from calling setAuth() on every session refetch
  const useAuth = useCallback(
    function useConvexAuthHook() {
      const token = authStore.get('token');
      const hasSession = hasActiveSessionData(sessionRef.current);
      const sessionMissing = !hasSession && !isPendingRef.current;
      return {
        isLoading: isPendingRef.current && !token,
        // If Better Auth confirms no session, stale JWT should not keep auth=true.
        isAuthenticated: sessionMissing ? false : hasSession || token !== null,
        fetchAccessToken,
      };
    },
    [fetchAccessToken, authStore]
  );

  return (
    <FetchAccessTokenContext.Provider value={fetchAccessToken}>
      <ConvexProviderWithAuth
        client={client as IConvexReactClient}
        useAuth={useAuth}
      >
        <AuthStateSync>{children}</AuthStateSync>
      </ConvexProviderWithAuth>
    </FetchAccessTokenContext.Provider>
  );
}

/**
 * Syncs auth state from useConvexAuth() to the auth store.
 * MUST be inside ConvexProviderWithAuth to access useConvexAuth().
 *
 * Defensive isLoading computation handles SSR hydration race:
 * 1. SSR sets token from cookie
 * 2. Client hydrates
 * 3. Better Auth's useSession() briefly returns null before loading cookie
 * 4. Convex sets isConvexAuthenticated = false (no auth to wait for)
 * 5. Without defensive check, we'd sync { isLoading: false, isAuthenticated: false }
 * 6. Queries would throw UNAUTHORIZED before token is validated
 */
function AuthStateSync({ children }: { children: ReactNode }) {
  const { isLoading: convexIsLoading, isAuthenticated } = useConvexAuth();
  const authStore = useAuthStore();
  const token = useAuthValue('token');

  useEffect(() => {
    // DEFENSIVE: If we have a token but Convex says not authenticated,
    // stay in loading state to avoid UNAUTHORIZED errors during hydration
    const hasTokenButNotAuth = !!token && !isAuthenticated;
    const isLoading = convexIsLoading || hasTokenButNotAuth;

    authStore.set('isLoading', isLoading);
    authStore.set('isAuthenticated', isAuthenticated);
  }, [convexIsLoading, isAuthenticated, token, authStore]);

  return children;
}

/**
 * Handles cross-domain one-time token (OTT) verification.
 */
function useOTTHandler(authClient: AuthClient) {
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.location?.href) {
        return;
      }
      const url = new URL(window.location.href);
      const token = url.searchParams.get('ott');

      if (token) {
        // biome-ignore lint/suspicious/noExplicitAny: cross-domain plugin type
        const authClientWithCrossDomain = authClient as any;
        url.searchParams.delete('ott');
        window.history.replaceState({}, '', url);
        const result =
          await authClientWithCrossDomain.crossDomain.oneTimeToken.verify({
            token,
          });
        const session = result.data?.session;

        if (session) {
          await authClient.getSession({
            fetchOptions: {
              headers: {
                Authorization: `Bearer ${session.token}`,
              },
            },
          });
          authClientWithCrossDomain.updateSession();
        }
      }
    })();
  }, [authClient]);
}
