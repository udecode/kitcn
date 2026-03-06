/** @jsxImportSource solid-js */

/**
 * Unified Convex + Better Auth provider for SolidJS
 *
 * Port of the React ConvexAuthProvider to SolidJS.
 * Handles token sync and auth callbacks.
 */

import type { ConvexClient } from 'convex/browser';
import { createEffect, type JSX, onMount, type ParentProps } from 'solid-js';

import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';
import {
  AuthProvider,
  decodeJwtExp,
  FetchAccessTokenContext,
  useAuthStore,
} from './auth-store';
import { ConvexProviderWithAuth, useConvexAuth } from './convex-solid';
import type { SolidAuthClient } from './types';

export type ConvexAuthProviderProps = {
  children: JSX.Element;
  /** Convex client instance */
  client: ConvexClient;
  /** Better Auth client instance */
  authClient: SolidAuthClient;
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
 * Unified auth provider for Convex + Better Auth (SolidJS).
 * Handles token sync and auth callbacks.
 *
 * Structure: AuthProvider wraps ConvexAuthProviderInner so that
 * useAuthStore() is available when creating fetchAccessToken.
 */
export function ConvexAuthProvider(props: ConvexAuthProviderProps) {
  useOTTHandler(props.authClient);

  const tokenValues = () => ({
    expiresAt: props.initialToken ? decodeJwtExp(props.initialToken) : null,
    token: props.initialToken ?? null,
  });

  return (
    <AuthProvider
      initialValues={tokenValues()}
      isUnauthorized={props.isUnauthorized ?? defaultIsUnauthorized}
      onMutationUnauthorized={
        props.onMutationUnauthorized ?? defaultMutationHandler
      }
      onQueryUnauthorized={props.onQueryUnauthorized ?? (() => {})}
    >
      <ConvexAuthProviderInner
        authClient={props.authClient}
        client={props.client}
      >
        {props.children}
      </ConvexAuthProviderInner>
    </AuthProvider>
  );
}

/**
 * Inner provider that has access to AuthStore via useAuthStore().
 * Creates fetchAccessToken and passes it through context.
 */
function ConvexAuthProviderInner(
  props: ParentProps<{
    client: ConvexClient;
    authClient: SolidAuthClient;
  }>
) {
  const authStore = useAuthStore();

  // In Solid, useSession returns an Accessor
  const sessionAccessor = props.authClient.useSession();

  // Stable ref for pending token promise (no re-renders in Solid)
  let pendingTokenPromise: Promise<string | null> | null = null;

  // Clear token when session becomes null (logout)
  createEffect(() => {
    const sessionState = sessionAccessor();
    const session = sessionState.data;
    const isPending = sessionState.isPending;

    if (!hasActiveSessionData(session) && !isPending) {
      authStore.set('token', null);
      authStore.set('expiresAt', null);
      authStore.set('isAuthenticated', false);
    }
  });

  // Stable fetchAccessToken - no useCallback needed in Solid
  const fetchAccessToken = async ({
    forceRefreshToken = false,
  }: {
    forceRefreshToken?: boolean;
  } = {}) => {
    const sessionState = sessionAccessor();
    const currentSession = sessionState.data;
    const currentIsPending = sessionState.isPending;
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

    if (!forceRefreshToken && pendingTokenPromise) {
      return pendingTokenPromise;
    }

    // Fetch fresh JWT
    // biome-ignore lint/suspicious/noExplicitAny: convex plugin type
    pendingTokenPromise = (props.authClient as any).convex
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
        pendingTokenPromise = null;
      });

    return pendingTokenPromise;
  };

  // Create useAuth function for ConvexProviderWithAuth
  // In Solid, this is a plain function (stable, no useCallback needed)
  const useAuth = () => {
    const sessionState = sessionAccessor();
    const hasSession = hasActiveSessionData(sessionState.data);
    const sessionMissing = !hasSession && !sessionState.isPending;
    const token = authStore.get('token');

    return {
      isLoading: sessionState.isPending && !token,
      // If Better Auth confirms no session, stale JWT should not keep auth=true.
      isAuthenticated: sessionMissing ? false : hasSession || token !== null,
      fetchAccessToken,
    };
  };

  return (
    <FetchAccessTokenContext.Provider value={fetchAccessToken}>
      <ConvexProviderWithAuth client={props.client} useAuth={useAuth}>
        <AuthStateSync>{props.children}</AuthStateSync>
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
function AuthStateSync(props: ParentProps) {
  // Don't destructure — access via getters inside createEffect to preserve reactivity
  const convexAuth = useConvexAuth();
  const authStore = useAuthStore();

  createEffect(() => {
    // Read token inside effect so changes are tracked
    const token = authStore.get('token');

    // DEFENSIVE: If we have a token but Convex says not authenticated,
    // stay in loading state to avoid UNAUTHORIZED errors during hydration
    const hasTokenButNotAuth = !!token && !convexAuth.isAuthenticated;
    const isLoading = convexAuth.isLoading || hasTokenButNotAuth;

    authStore.set('isLoading', isLoading);
    authStore.set('isAuthenticated', convexAuth.isAuthenticated);
  });

  return props.children;
}

/**
 * Handles cross-domain one-time token (OTT) verification.
 */
function useOTTHandler(authClient: SolidAuthClient) {
  onMount(async () => {
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
  });
}
