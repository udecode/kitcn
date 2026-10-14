'use client';

/**
 * Unified Convex + Better Auth provider
 */

import type { AuthTokenFetcher } from 'convex/browser';
import type { ConvexReactClient } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';
import {
  clearAuthSessionFallback,
  readAuthSessionFallbackData,
  readAuthSessionFallbackToken,
  writeAuthSessionFallbackData,
} from '../react/auth-session-fallback';
import {
  AUTH_SESSION_SYNC_GRACE_MS,
  AuthProvider,
  type AuthStore,
  ConvexProviderWithAuth,
  decodeJwtExp,
  FetchAccessTokenContext,
  isSessionSyncGraceActive,
  useAuthStore,
  useAuthValue,
} from '../react/auth-store';
import {
  admitToken,
  attachStoreGuard,
  decodeTokenSubjectSessionIdentity,
  type IdentityGuard,
  identityGuardInPlay,
  isDocumentTripped,
  isJwt,
  isTokenAdmissible,
  joinPage,
  mountGuard,
  subscribeDocumentTrip,
  tripDocument,
} from '../react/identity-guard-registry';
import {
  admitStoreToken,
  publishAuthState,
  publishToken,
} from '../react/token-gate';
import {
  isClientSettled,
  subscribeClientSettlement,
  watchClientSettlement,
} from './client-settlement';
import type { ConvexAuthProviderClient } from './types';

type AuthClientFetch = ConvexAuthProviderClient & {
  $fetch?: (
    path: string,
    options?: {
      credentials?: RequestCredentials;
      headers?: Record<string, string>;
    }
  ) => Promise<{ data?: unknown } | null | undefined>;
};

type AuthGetSession = (options?: {
  fetchOptions?: {
    credentials?: RequestCredentials;
    headers?: Record<string, string>;
  };
}) => Promise<unknown> | unknown;

type AuthSessionAtom = {
  get?: () =>
    | {
        refetch?: (...args: never[]) => unknown;
      }
    | undefined;
  set?: (state: {
    data: unknown;
    error: null;
    isPending: false;
    isRefetching: false;
    refetch: (...args: never[]) => unknown;
  }) => void;
};

type IConvexReactClient = {
  setAuth(fetchToken: AuthTokenFetcher): void;
  clearAuth(): void;
};

export type ConvexAuthProviderQueryClient = {
  updateAuthStore: (authStore?: AuthStore) => void;
};

export type ConvexAuthProviderProps = {
  children: ReactNode;
  /** Convex client instance */
  client: ConvexReactClient;
  /** Better Auth client instance */
  authClient: ConvexAuthProviderClient;
  /** Shared Convex query client to sync with auth state */
  convexQueryClient?: ConvexAuthProviderQueryClient;
  /** Initial session token (from SSR) */
  initialToken?: string;
  /** Callback when mutation called while unauthorized */
  onMutationUnauthorized?: () => void;
  /** Callback when query called while unauthorized */
  onQueryUnauthorized?: (info: { queryName: string }) => void;
  /** Custom function to detect UNAUTHORIZED errors. Default checks code property. */
  isUnauthorized?: (error: unknown) => boolean;
  /**
   * Run auth-bound queries as soon as an unexpired JWT is held instead of
   * after Convex confirms it, until the Convex client reports its first auth
   * result (confirmed or refused); after that the gate follows Convex's
   * confirmed state for the client's lifetime, remounts included. Convex
   * sends them after Authenticate on the same socket and evaluates none of
   * them if the token is refused; a refused token sets `isAuthenticated` back
   * to false, which resets auth-bound queries. With the identity guard, only
   * a token the guard admits opens it. No effect over a client the TanStack
   * Start loader already authenticated. Every provider over one Convex client
   * must use the same setting: mixing optimistic and non-optimistic providers
   * over one client is unsupported, because results the client reports
   * before an optimistic provider mounts are not seen. Default `false`.
   */
  optimisticAuth?: boolean;
  /**
   * Fix the identity (JWT `sub` and `sessionId`) the document speaks for: the
   * one it holds when it mounts (`initialToken`), or, with none, the first
   * token that carries one. Guarantees: (1) a token of another user or
   * session (or a JWT without an identity once one is established) is never
   * cached, published, or handed to Convex, cRPC HTTP or the Start loader;
   * (2) when a trip happens (this or another provider, or the Start loader,
   * refuses one), this provider stops handing out tokens (null), publishes
   * unauthenticated, calls `client.close()` (Convex's close semantics govern
   * its queued work) and then this, once, where the app should reload the
   * page. A provider that mounts (or shows again) on a page that is already
   * tripped starts tripped and does the same, once, so a trip that happened
   * while no guarded provider was mounted still reaches the app.
   * The trip is page-wide in the browser (never on the server); sign-in
   * mutations fail with `AuthMutationError` code `TOKEN_IDENTITY_CHANGED`
   * until the reload. It governs the token kitcn supplies, not an
   * `Authorization` header the app sets itself. Same-session refreshes pass
   * through. Off when not set: a page that never enables it is unchanged.
   * Once a guarded provider establishes the page identity, it persists until
   * the reload, binding every provider (with or without this) and the Start
   * loader, even after that provider unmounts. Two kitcn versions or
   * revisions on one page (dev HMR across revisions included) are
   * unsupported: they share no page identity until the reload.
   */
  onTokenIdentityChange?: () => void;
  /**
   * The identity (`sub|sessionId`, as the guard decodes it from a JWT) the
   * document already speaks for when this provider mounts, for an app that
   * mounts the provider more than once in one document (for example one per
   * route group, over a shared Convex client). The guard starts from it
   * instead of from `initialToken` or the first token obtained, so a remount
   * without a token still refuses another user's or session's token.
   *
   * A fixed value is read on the first render only. A getter is read at
   * every admission, cached tokens included, and while this provider is
   * mounted it binds every provider's admissions. A token must match all of:
   * the page identity (the first one a provider knew), this provider's
   * baseline and admitted identity, and every mounted getter's current
   * answer; any mismatch trips the page. So a provider kept mounted but
   * hidden (React `<Activity>`) cannot resume under an identity the document
   * has since moved away from. A getter returning null does not constrain.
   * Needs `onTokenIdentityChange`.
   */
  tokenIdentityBaseline?: string | null | (() => string | null);
  /**
   * Called synchronously with every token the identity guard admits, before
   * Convex or HTTP headers receive it: a fresh token when it is admitted and
   * cached, a cached token each time it is handed out. The document can claim
   * the identity at that moment (for example the first token a document
   * without one obtains). Never called for a refused token. Read from a ref,
   * so passing a new function does not re-run effects. Needs
   * `onTokenIdentityChange`.
   */
  onTokenIdentityAdmitted?: (token: string) => void;
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

const getSessionId = (sessionData: unknown) => {
  if (!sessionData || typeof sessionData !== 'object') {
    return;
  }
  const session = (sessionData as { session?: unknown }).session;
  if (!session || typeof session !== 'object') {
    return;
  }
  const id = (session as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
};

const isSameSession = (left: unknown, right: unknown) => {
  if (left === right) {
    return true;
  }
  const leftId = getSessionId(left);
  return leftId !== undefined && leftId === getSessionId(right);
};

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const PERSISTED_TOKEN_RETRY_BASE_MS = 100;
const PERSISTED_TOKEN_RETRY_MAX_MS = 2000;

/**
 * `session` — the server returned one.
 * `none` — the server answered and there is no session. Definitive.
 * `unknown` — every attempt failed in transport. Says nothing about the token.
 */
type PersistedTokenOutcome =
  | { data: unknown; status: 'session' }
  | { status: 'none' }
  | { status: 'unknown' };

// `/get-session` answers an unknown or expired token with 200 and a null body,
// and the client resolves transport failures to `{ data: null, error }` instead
// of throwing. `.error` is the only thing separating "no session" from "the
// request never landed", so it has to be read.
const readAuthResult = (result: unknown) => {
  if (!result || typeof result !== 'object') {
    return { data: undefined, errored: true };
  }

  const { data, error } = result as { data?: unknown; error?: unknown };

  return { data, errored: Boolean(error) };
};

// A thrown request is indistinguishable from a resolved one carrying `.error`,
// so both surface as an errored result rather than as a rejection.
const fetchPersistedSession = async (
  authClient: AuthClientFetch,
  token: string
) => {
  const getSession = authClient.getSession as AuthGetSession | undefined;

  try {
    return await (authClient.$fetch
      ? authClient.$fetch('/get-session', {
          credentials: 'omit',
          headers: { Authorization: `Bearer ${token}` },
        })
      : getSession?.({
          fetchOptions: {
            credentials: 'omit',
            headers: { Authorization: `Bearer ${token}` },
          },
        }));
  } catch (error) {
    return { data: undefined, error };
  }
};

const fetchPersistedSessionBeforeDeadline = async (
  authClient: AuthClientFetch,
  token: string,
  deadline: number
): Promise<{ result: unknown; status: 'result' } | { status: 'deadline' }> => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return { status: 'deadline' };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadlineResult = new Promise<{ status: 'deadline' }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: 'deadline' }), remaining);
  });

  try {
    return await Promise.race([
      fetchPersistedSession(authClient, token).then((result) => ({
        result,
        status: 'result' as const,
      })),
      deadlineResult,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

// Retries are bounded by the same grace window the caller opened, so the
// recovery always terminates: either the server answers, or the window closes
// and the caller resolves the optimistic state it created.
const getSessionFromPersistedToken = async (
  authClient: AuthClientFetch,
  token: string,
  { deadline, shouldStop }: { deadline: number; shouldStop: () => boolean }
): Promise<PersistedTokenOutcome> => {
  for (let attempt = 0; ; attempt += 1) {
    // Only retries wait, so a live token costs one immediate request.
    if (attempt > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { status: 'unknown' };
      }

      await wait(
        Math.min(
          PERSISTED_TOKEN_RETRY_BASE_MS * 3 ** (attempt - 1),
          PERSISTED_TOKEN_RETRY_MAX_MS,
          remaining
        )
      );
    }

    if (shouldStop()) {
      return { status: 'unknown' };
    }

    const request = await fetchPersistedSessionBeforeDeadline(
      authClient,
      token,
      deadline
    );
    if (request.status === 'deadline') {
      return { status: 'unknown' };
    }
    const { data, errored } = readAuthResult(request.result);

    if (data) {
      return { data, status: 'session' };
    }
    if (!errored) {
      return { status: 'none' };
    }
  }
};

const syncSessionAtom = (
  authClient: ConvexAuthProviderClient,
  sessionData: unknown
) => {
  const sessionAtom = authClient.$store?.atoms?.session as
    | AuthSessionAtom
    | undefined;
  if (
    typeof sessionAtom?.get !== 'function' ||
    typeof sessionAtom.set !== 'function'
  ) {
    return;
  }

  const current = sessionAtom.get();
  sessionAtom.set({
    data: sessionData,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: current?.refetch ?? (async () => {}),
  });
};

const clearSessionAtom = (authClient: ConvexAuthProviderClient) => {
  const sessionAtom = authClient.$store?.atoms?.session as
    | AuthSessionAtom
    | undefined;
  if (
    typeof sessionAtom?.get !== 'function' ||
    typeof sessionAtom.set !== 'function'
  ) {
    return;
  }

  const current = sessionAtom.get();
  sessionAtom.set({
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: current?.refetch ?? (async () => {}),
  });
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
  convexQueryClient,
  initialToken,
  onMutationUnauthorized,
  onQueryUnauthorized,
  isUnauthorized,
  optimisticAuth = false,
  onTokenIdentityChange,
  onTokenIdentityAdmitted,
  tokenIdentityBaseline,
}: ConvexAuthProviderProps) {
  // Handle cross-domain one-time token
  useOTTHandler(authClient);
  useMemo(() => {
    if (optimisticAuth) watchClientSettlement(client);
  }, [client, optimisticAuth]);

  const baselineRef = useRef(tokenIdentityBaseline);
  baselineRef.current = tokenIdentityBaseline;
  const onAdmittedRef = useRef(onTokenIdentityAdmitted);
  onAdmittedRef.current = onTokenIdentityAdmitted;
  const [{ guard, inheritedTrip, refusedInitialToken }] = useState(() => {
    const guarded = onTokenIdentityChange !== undefined;
    const getter = typeof tokenIdentityBaseline === 'function';
    const fixed = getter ? null : (tokenIdentityBaseline ?? null);
    const created: IdentityGuard = {
      baseline: () => {
        if (!created.guarded) return null;
        return created.hasGetter
          ? resolveTokenIdentityBaseline(baselineRef.current)
          : fixed;
      },
      guarded,
      hasGetter: guarded && getter,
      heldToken: () => null,
      identity: guarded ? fixed : null,
      onAdmitted: (token) => onAdmittedRef.current?.(token),
      tripped: isDocumentTripped(),
    };
    const refused =
      !created.tripped &&
      !!initialToken &&
      !isTokenAdmissible(initialToken, created, 'hold');
    if (refused) created.tripped = true;
    else if (guarded) {
      created.identity ??= decodeTokenSubjectSessionIdentity(
        initialToken ?? null
      );
    }
    return {
      guard: created,
      inheritedTrip: isDocumentTripped(),
      refusedInitialToken: refused,
    };
  });

  useLayoutEffect(() => {
    const guarded = onTokenIdentityChange !== undefined;
    guard.hasGetter = guarded && typeof tokenIdentityBaseline === 'function';
    if (guarded === guard.guarded) return;
    guard.guarded = guarded;
    if (!guarded) return;
    guard.identity ??=
      (guard.hasGetter ? null : guard.baseline()) ??
      decodeTokenSubjectSessionIdentity(guard.heldToken());
    joinPage(guard);
  });

  // Memoize decoded JWT to avoid re-parsing on every render
  const tokenValues = useMemo(
    () =>
      refusedInitialToken || inheritedTrip
        ? { expiresAt: null, token: null }
        : {
            expiresAt: initialToken ? decodeJwtExp(initialToken) : null,
            token: initialToken ?? null,
          },
    [initialToken, inheritedTrip, refusedInitialToken]
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
      <ConvexAuthProviderInner
        authClient={authClient}
        client={client}
        convexQueryClient={convexQueryClient}
        guard={guard}
        inheritedTrip={inheritedTrip}
        onTokenIdentityChange={onTokenIdentityChange}
        optimisticAuth={optimisticAuth}
        refusedInitialToken={refusedInitialToken}
      >
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
  convexQueryClient,
  guard,
  inheritedTrip,
  optimisticAuth,
  onTokenIdentityChange,
  refusedInitialToken,
}: {
  children: ReactNode;
  client: ConvexReactClient;
  authClient: ConvexAuthProviderClient;
  convexQueryClient?: ConvexAuthProviderQueryClient;
  guard: IdentityGuard;
  inheritedTrip: boolean;
  optimisticAuth: boolean;
  onTokenIdentityChange?: () => void;
  refusedInitialToken: boolean;
}) {
  const authStore = useAuthStore();
  convexQueryClient?.updateAuthStore(authStore);

  const { data: session, isPending } = authClient.useSession();

  // Use refs to avoid recreating fetchAccessToken on session refetch (tab focus)
  // This prevents Convex SDK from calling setAuth() again and causing race conditions
  const sessionRef = useRef(session);
  const isPendingRef = useRef(isPending);
  const pendingTokenRef = useRef<Promise<string | null> | null>(null);
  const restoredTokenRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  sessionRef.current = session;
  isPendingRef.current = isPending;

  const isOpaqueUnderGuard = useCallback(
    (token: string) => identityGuardInPlay(guard) && !isJwt(token),
    [guard]
  );

  const getCachedJwt = useCallback(
    (minTimeRemainingMs = 0) => {
      const cachedToken = authStore.get('token');
      if (!cachedToken || isOpaqueUnderGuard(cachedToken)) {
        return null;
      }

      const expiresAt = decodeJwtExp(cachedToken);
      if (expiresAt === null || expiresAt <= Date.now() + minTimeRemainingMs) {
        return null;
      }

      return cachedToken;
    },
    [authStore, isOpaqueUnderGuard]
  );

  // Clear token when session becomes null (logout)
  // This can't be inside fetchAccessToken because it's not called after logout
  useEffect(() => {
    if (hasActiveSessionData(session)) {
      authStore.set('sessionSyncGraceUntil', null);
      return;
    }

    if (
      !isPending &&
      !isSessionSyncGraceActive(authStore.get('sessionSyncGraceUntil'))
    ) {
      authStore.set('token', null);
      authStore.set('expiresAt', null);
      authStore.set('isAuthenticated', false);
      authStore.set('sessionSyncGraceUntil', null);
    }
  }, [session, isPending, authStore]);

  const onTokenIdentityChangeRef = useRef(onTokenIdentityChange);
  onTokenIdentityChangeRef.current = onTokenIdentityChange;
  // Registered during render so store-level paths (auth mutations, HTTP
  // headers) admit through this guard before any effect runs; a render React
  // discards leaves an entry keyed by a store nothing else holds.
  attachStoreGuard(authStore.store, guard);
  const [guardTripped, setGuardTripped] = useState(
    refusedInitialToken || inheritedTrip
  );
  const quarantinedRef = useRef(false);
  const tripNotifiedRef = useRef(false);
  const announcedTokenRef = useRef<string | null>(null);

  const quarantine = useCallback(() => {
    guard.tripped = true;
    authStore.set('token', null);
    authStore.set('expiresAt', null);
    authStore.set('sessionSyncGraceUntil', null);
    authStore.set('isAuthenticated', false);
    authStore.set('isLoading', false);
    setGuardTripped(true);
  }, [authStore, guard]);

  const tripGuard = useCallback(() => {
    guard.tripped = true;
    if (!quarantinedRef.current) {
      quarantinedRef.current = true;
      quarantine();
    }
    tripDocument();
    if (tripNotifiedRef.current || !onTokenIdentityChangeRef.current) return;
    tripNotifiedRef.current = true;
    try {
      void Promise.resolve(client.close()).catch(() => {});
    } catch {}
    try {
      onTokenIdentityChangeRef.current?.();
    } catch (error) {
      console.error('[ConvexAuthProvider] onTokenIdentityChange threw', error);
    }
  }, [client, guard, quarantine]);

  useLayoutEffect(() => {
    guard.heldToken = () => authStore.get('token');
    const unsubscribe = subscribeDocumentTrip(tripGuard);
    const unmount = mountGuard(guard);
    if (refusedInitialToken || isDocumentTripped()) tripGuard();
    return () => {
      unmount();
      unsubscribe();
    };
  }, [authStore, guard, refusedInitialToken, tripGuard]);

  useLayoutEffect(() => {
    if (onTokenIdentityChange && isDocumentTripped()) tripGuard();
  }, [onTokenIdentityChange, tripGuard]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasActiveSessionData(session) || isPending || authStore.get('token')) {
      return;
    }
    const persistedToken = readAuthSessionFallbackToken();
    if (
      !persistedToken ||
      // The restore owns the optimistic state until it resolves. Re-entering on
      // an unrelated re-render would either duplicate the probe or orphan the
      // one already in flight.
      restoredTokenRef.current === persistedToken ||
      (typeof authClient.getSession !== 'function' &&
        typeof (authClient as AuthClientFetch).$fetch !== 'function')
    ) {
      return;
    }

    restoredTokenRef.current = persistedToken;

    const persistedSessionData = readAuthSessionFallbackData();
    const graceUntil = Date.now() + AUTH_SESSION_SYNC_GRACE_MS;

    if (
      !publishToken(authStore, persistedToken, {
        announce: true,
        sessionSyncGraceUntil: graceUntil,
        use: 'restore',
      })
    ) {
      return;
    }
    if (persistedSessionData) {
      syncSessionAtom(authClient, persistedSessionData);
    }

    // Anything else that takes over the token — a Convex JWT exchange, a sign
    // out — owns the state from that point on, so the restore stands down.
    const ownsToken = () => authStore.get('token') === persistedToken;
    const shouldStop = () => !isMountedRef.current || !ownsToken();

    void getSessionFromPersistedToken(
      authClient as AuthClientFetch,
      persistedToken,
      { deadline: graceUntil, shouldStop }
    )
      .then((outcome) => {
        const hasCompetingSession =
          hasActiveSessionData(sessionRef.current) &&
          !isSameSession(sessionRef.current, persistedSessionData);
        if (!isMountedRef.current || !ownsToken() || hasCompetingSession) {
          return;
        }

        if (outcome.status === 'session') {
          syncSessionAtom(authClient, outcome.data);
          writeAuthSessionFallbackData(outcome.data);
          return;
        }

        // The transport never answered before the grace window closed. Keep the
        // persisted credential — a dropped request is not a sign out, and the
        // next mount can retry it — but drop the optimistic state this effect
        // created. Leaving it behind pins the app in `isLoading` forever.
        if (outcome.status === 'unknown') {
          if (persistedSessionData) {
            clearSessionAtom(authClient);
          }
          authStore.set('token', null);
          authStore.set('expiresAt', null);
          authStore.set('sessionSyncGraceUntil', null);
          return;
        }

        clearAuthSessionFallback();
        clearSessionAtom(authClient);
        authStore.set('token', null);
        authStore.set('expiresAt', null);
        authStore.set('sessionSyncGraceUntil', null);
      })
      // An unexpected failure is not evidence that the session is gone either.
      .catch(() => {});
  }, [session, isPending, authStore, authClient]);

  // Stable fetchAccessToken - only recreated when authStore/authClient change (rare)
  // Reads session/isPending from refs to avoid dependency on changing objects
  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken = false,
    }: {
      forceRefreshToken?: boolean;
    } = {}) => {
      const fetchFreshToken = () => {
        if (pendingTokenRef.current) {
          return pendingTokenRef.current;
        }

        const cachedToken = authStore.get('token');
        const fetchOptions: {
          credentials?: 'omit';
          headers?: {
            Authorization: string;
          };
          throw: false;
        } = {
          throw: false,
        };
        if (
          cachedToken &&
          (decodeJwtExp(cachedToken) === null ||
            isOpaqueUnderGuard(cachedToken))
        ) {
          fetchOptions.credentials = 'omit';
          fetchOptions.headers = {
            Authorization: `Bearer ${cachedToken}`,
          };
        }

        pendingTokenRef.current = authClient.convex
          .token({ fetchOptions })
          .then((result) => {
            const jwt = result?.data?.token || null;
            if (jwt) {
              if (
                !publishToken(authStore, jwt, {
                  announce: true,
                  sessionSyncGraceUntil: null,
                })
              ) {
                return null;
              }
              announcedTokenRef.current = jwt;
              return jwt;
            }

            const cachedJwt = getCachedJwt();
            if (cachedJwt) {
              authStore.set('expiresAt', decodeJwtExp(cachedJwt));
              authStore.set('sessionSyncGraceUntil', null);
              return cachedJwt;
            }

            authStore.set('token', null);
            authStore.set('expiresAt', null);
            authStore.set('sessionSyncGraceUntil', null);
            return null;
          })
          .catch((error: unknown) => {
            const cachedJwt = getCachedJwt();
            if (cachedJwt) {
              authStore.set('expiresAt', decodeJwtExp(cachedJwt));
              authStore.set('sessionSyncGraceUntil', null);
              return cachedJwt;
            }

            authStore.set('token', null);
            authStore.set('expiresAt', null);
            authStore.set('sessionSyncGraceUntil', null);
            console.error('[fetchAccessToken] error', error);
            return null;
          })
          .finally(() => {
            pendingTokenRef.current = null;
          });

        return pendingTokenRef.current;
      };

      const fetchFreshTokenForced = async () => {
        // For forced refresh, if we only have an in-flight request and it
        // resolves null, retry once immediately instead of returning null.
        const cachedJwt = getCachedJwt();
        if (pendingTokenRef.current) {
          const token = await pendingTokenRef.current;
          if (token && (!cachedJwt || token !== cachedJwt)) {
            return token;
          }
        }

        return fetchFreshToken();
      };

      const currentSession = sessionRef.current;
      const currentIsPending = isPendingRef.current;
      const hasSession = hasActiveSessionData(currentSession);
      const hasSessionSyncGrace = isSessionSyncGraceActive(
        authStore.get('sessionSyncGraceUntil')
      );

      // If no session:
      // - If still pending (hydration), return cached SSR token for non-forced reads
      // - If the cached token is an opaque Better Auth session token, exchange it
      //   before handing auth to Convex
      // - If still pending + forced refresh, fetch a fresh token for Convex scheduling
      // - If not pending (confirmed no session), clear cache
      if (!hasSession) {
        if (currentIsPending || hasSessionSyncGrace) {
          const cachedJwt = getCachedJwt();

          if (!forceRefreshToken) {
            if (cachedJwt) {
              return cachedJwt;
            }

            return fetchFreshToken();
          }

          const freshToken = await fetchFreshTokenForced();

          // During hydration, keep a cached JWT on transient forced-refresh failure.
          // Convex asked for a fresh token, but dropping auth to null here can
          // briefly flip to unauthenticated before Better Auth session settles.
          if (!freshToken && cachedJwt) {
            return publishToken(authStore, cachedJwt, { announce: false })
              ? cachedJwt
              : null;
          }

          return freshToken;
        }

        authStore.set('token', null);
        authStore.set('expiresAt', null);
        authStore.set('sessionSyncGraceUntil', null);
        return null;
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
        timeRemaining >= 60_000 &&
        !isOpaqueUnderGuard(cachedToken)
      ) {
        return cachedToken;
      }

      if (!forceRefreshToken && pendingTokenRef.current) {
        return pendingTokenRef.current;
      }

      if (forceRefreshToken) {
        return fetchFreshTokenForced();
      }

      return fetchFreshToken();
    },
    // Stable deps - authStore/authClient rarely change
    // session/isPending accessed via refs to prevent callback recreation
    [authStore, authClient, getCachedJwt, isOpaqueUnderGuard]
  );

  const guardedFetchAccessToken = useCallback(
    async (args: { forceRefreshToken?: boolean } = {}) => {
      if (isDocumentTripped()) return null;
      const token = await fetchAccessToken(args);
      if (!token) return null;
      const announced = announcedTokenRef.current === token;
      if (announced) announcedTokenRef.current = null;
      return admitToken(token, { announce: !announced, guard, use: 'handout' })
        ? token
        : null;
    },
    [fetchAccessToken, guard]
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
        fetchAccessToken: guardedFetchAccessToken,
      };
    },
    [guardedFetchAccessToken, authStore]
  );

  return (
    <FetchAccessTokenContext.Provider value={guardedFetchAccessToken}>
      <ConvexProviderWithAuth
        client={client as IConvexReactClient}
        useAuth={useAuth}
      >
        <AuthStateSync
          client={client}
          guardTripped={guardTripped}
          optimisticAuth={optimisticAuth}
        >
          {children}
        </AuthStateSync>
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
function AuthStateSync({
  children,
  client,
  guardTripped,
  optimisticAuth = false,
}: {
  children: ReactNode;
  client: ConvexReactClient;
  guardTripped: boolean;
  optimisticAuth?: boolean;
}) {
  const { isLoading: convexIsLoading, isAuthenticated } = useConvexAuth();
  const authStore = useAuthStore();
  const token = useAuthValue('token');
  const subscribe = useCallback(
    (listener: () => void) => subscribeClientSettlement(client, listener),
    [client]
  );
  const getSettled = useCallback(() => isClientSettled(client), [client]);
  const settled = useSyncExternalStore(subscribe, getSettled, getSettled);

  useEffect(() => {
    // Read the trip, the settlement and the held token again at the write: a
    // descendant effect earlier in this commit may have changed any of them.
    const gate = resolveAuthGate({
      admitHeldToken: (held) =>
        admitStoreToken(authStore, held, { use: 'hold' }),
      convexIsLoading,
      guardTripped: guardTripped || isDocumentTripped(),
      isAuthenticated,
      optimisticWindow: optimisticAuth && !settled && !isClientSettled(client),
      token: authStore.get('token'),
    });

    publishAuthState(authStore, gate);
  }, [
    client,
    convexIsLoading,
    guardTripped,
    isAuthenticated,
    optimisticAuth,
    settled,
    token,
    authStore,
  ]);

  return children;
}

function resolveTokenIdentityBaseline(
  baseline: string | null | (() => string | null) | undefined
): string | null {
  return typeof baseline === 'function' ? baseline() : (baseline ?? null);
}

type AuthGateInput = {
  admitHeldToken: (token: string) => boolean;
  convexIsLoading: boolean;
  guardTripped: boolean;
  isAuthenticated: boolean;
  optimisticWindow: boolean;
  token: string | null;
};

/**
 * The auth state published to the store, which is what every query gate reads.
 *
 * Without `optimisticAuth` this is the confirmed state: queries wait until
 * Convex has confirmed the token. With it, until the Convex client reports its
 * first auth result, a held, unexpired JWT counts as authenticated while
 * Convex confirms it, so auth-bound queries subscribe at once; Convex sends
 * them after Authenticate on the same socket, and a refused token closes the
 * socket before any of them is evaluated. When Convex refuses the token,
 * `isAuthenticated` falls back to false, which resets auth-bound queries (see
 * `CRPCProviderInner`), and the window is over: no token reopens it.
 */
function resolveAuthGate({
  admitHeldToken,
  convexIsLoading,
  guardTripped,
  isAuthenticated,
  optimisticWindow,
  token,
}: AuthGateInput): { isAuthenticated: boolean; isLoading: boolean } {
  if (guardTripped || (token !== null && !admitHeldToken(token))) {
    return { isAuthenticated: false, isLoading: false };
  }
  if (
    optimisticWindow &&
    convexIsLoading &&
    token !== null &&
    isOptimisticToken(token)
  ) {
    return { isAuthenticated: true, isLoading: false };
  }
  // DEFENSIVE: If we have a token but Convex says not authenticated,
  // stay in loading state to avoid UNAUTHORIZED errors during hydration
  return {
    isAuthenticated,
    isLoading: convexIsLoading || (!!token && !isAuthenticated),
  };
}

function isOptimisticToken(token: string) {
  if (!isJwt(token)) return false;
  const expiresAt = decodeJwtExp(token);
  return expiresAt !== null && expiresAt > Date.now();
}

/**
 * Handles cross-domain one-time token (OTT) verification.
 */
function useOTTHandler(authClient: ConvexAuthProviderClient) {
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

        if (session && typeof authClient.getSession === 'function') {
          const getSession = authClient.getSession as AuthGetSession;
          await getSession({
            fetchOptions: {
              credentials: 'omit',
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
