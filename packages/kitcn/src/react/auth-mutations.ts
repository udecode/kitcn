'use client';

/**
 * Auth Mutations Factory
 *
 * Creates TanStack Query mutation option hooks from auth functions.
 */

import type { DefaultError, UseMutationOptions } from '@tanstack/react-query';
import {
  clearAuthSessionFallback,
  writeAuthSessionFallbackData,
  writeAuthSessionFallbackToken,
} from './auth-session-fallback';
import type { AuthStore } from './auth-store';
import {
  AUTH_SESSION_SYNC_GRACE_MS,
  decodeJwtExp,
  useAuthStore,
} from './auth-store';
import { useConvexQueryClient } from './context';

export { AuthMutationError, isAuthMutationError } from '../crpc/auth-error';

import { AuthMutationError } from '../crpc/auth-error';

type MutationOptionsHook<TData, TVariables = void> = (
  options?: Omit<
    UseMutationOptions<TData, DefaultError, TVariables>,
    'mutationFn'
  >
) => UseMutationOptions<TData, DefaultError, TVariables>;

/** Poll until JWT token exists (auth complete) (max 5s) */
const waitForAuth = async (
  store: AuthStore,
  timeout = 5000
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (store.get('token')) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

const authStateTimeoutError = () =>
  new AuthMutationError({
    code: 'AUTH_STATE_TIMEOUT',
    message: 'Authentication did not complete. Try again.',
    status: 401,
    statusText: 'UNAUTHORIZED',
  });

const ensureAuth = async (store: AuthStore) => {
  if (await waitForAuth(store)) {
    return;
  }

  throw authStateTimeoutError();
};

const readReturnedToken = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as {
    data?: unknown;
    session?: unknown;
    token?: unknown;
  };

  if (typeof record.token === 'string' && record.token.length > 0) {
    return record.token;
  }

  return readReturnedToken(record.data) ?? readReturnedToken(record.session);
};

const seedReturnedToken = (store: AuthStore, value: unknown) => {
  const token = readReturnedToken(value);
  if (!token) {
    return;
  }

  store.set('token', token);
  store.set('expiresAt', decodeJwtExp(token));
  store.set('sessionSyncGraceUntil', Date.now() + AUTH_SESSION_SYNC_GRACE_MS);
  if (decodeJwtExp(token) === null) {
    writeAuthSessionFallbackToken(token);
  }
};

type AnyFn = (...args: unknown[]) => Promise<unknown>;
type AuthResponse = {
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    status?: number;
    statusText?: string;
  };
};

const toAuthMutationError = (error: AuthResponse['error']) =>
  new AuthMutationError({
    code: error?.code,
    message: error?.message,
    status: error?.status ?? 500,
    statusText: error?.statusText ?? 'AUTH_ERROR',
  });
type MutationArgsWithFetchOptions = {
  fetchOptions?: Record<string, unknown>;
};

type AuthClient = {
  $store?: {
    atoms?: {
      session?: {
        get?: () => {
          data?: unknown;
          error?: unknown;
          isPending?: boolean;
          isRefetching?: boolean;
          refetch?: (queryParams?: {
            query?: Record<string, unknown>;
          }) => Promise<void>;
        };
        set?: (value: {
          data: unknown;
          error: unknown;
          isPending: boolean;
          isRefetching: boolean;
          refetch: (queryParams?: {
            query?: Record<string, unknown>;
          }) => Promise<void>;
        }) => void;
      };
    };
  };
  getSession?: (...args: any[]) => Promise<any>;
  signOut?: AnyFn;
  signIn?: {
    anonymous?: AnyFn;
    social?: AnyFn;
    email?: AnyFn;
  };
  signUp?: {
    email?: AnyFn;
  };
};

const syncSessionAtom = (authClient: AuthClient, sessionData: unknown) => {
  const sessionAtom = authClient.$store?.atoms?.session;
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

const hydrateReturnedSession = async (
  authClient: AuthClient,
  value: unknown
) => {
  const token = readReturnedToken(value);
  if (!token || typeof authClient.getSession !== 'function') {
    return;
  }

  const session = (await authClient.getSession({
    fetchOptions: {
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })) as AuthResponse;

  if (session?.data) {
    syncSessionAtom(authClient, session.data);
    writeAuthSessionFallbackData(session.data);
  }
};

const withDisabledSessionSignal = <T>(
  args: T
): T & MutationArgsWithFetchOptions => {
  const record =
    args && typeof args === 'object'
      ? (args as MutationArgsWithFetchOptions)
      : ({} as MutationArgsWithFetchOptions);

  return {
    ...(record as object),
    fetchOptions: {
      ...record.fetchOptions,
      disableSignal: true,
    },
  } as T & MutationArgsWithFetchOptions;
};

/**
 * Create mutation option hooks from a better-auth client.
 *
 * @example
 * ```tsx
 * // lib/auth-client.ts
 * import { createAuthMutations } from 'kitcn/react';
 *
 * export const authClient = createAuthClient({...});
 *
 * export const {
 *   useSignOutMutationOptions,
 *   useSignInSocialMutationOptions,
 *   useSignInMutationOptions,
 *   useSignUpMutationOptions,
 * } = createAuthMutations(authClient);
 *
 * // components/header.tsx
 * const signOutMutation = useMutation(useSignOutMutationOptions({
 *   onSuccess: () => router.push('/login'),
 * }));
 * ```
 */
type AuthMutationsResult = {
  useSignOutMutationOptions: MutationOptionsHook<
    unknown,
    // biome-ignore lint/suspicious/noConfusingVoidType: allows mutate() or mutate(options)
    MutationArgsWithFetchOptions | void
  >;
  useSignInSocialMutationOptions: MutationOptionsHook<unknown, unknown>;
  useSignInMutationOptions: MutationOptionsHook<unknown, unknown>;
  useSignUpMutationOptions: MutationOptionsHook<unknown, unknown>;
};

export function createAuthMutations(
  authClient: AuthClient
): AuthMutationsResult {
  const useSignOutMutationOptions = ((options) => {
    const convexQueryClient = useConvexQueryClient();
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args?: unknown) => {
        if (typeof authClient.signOut !== 'function') {
          throw new Error('Auth client does not expose signOut');
        }
        // Set isAuthenticated: false BEFORE unsubscribing to prevent re-subscriptions
        // (cache events check shouldSkipSubscription which reads isAuthenticated)
        authStoreApi.set('isAuthenticated', false);
        convexQueryClient?.unsubscribeAuthQueries();
        const res = (await authClient.signOut(args)) as AuthResponse;
        if (res?.error) {
          throw toAuthMutationError(res.error);
        }
        authStoreApi.set('token', null);
        authStoreApi.set('expiresAt', null);
        authStoreApi.set('sessionSyncGraceUntil', null);
        clearAuthSessionFallback();
        await convexQueryClient?.resetAuthQueries();
        return res;
      },
    };
  }) as AuthMutationsResult['useSignOutMutationOptions'];

  const useSignInSocialMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();
    const convexQueryClient = useConvexQueryClient();

    return {
      ...options,
      mutationFn: async (args: unknown) => {
        if (typeof authClient.signIn?.social !== 'function') {
          throw new Error('Auth client does not expose signIn.social');
        }
        const res = (await authClient.signIn.social(
          withDisabledSessionSignal(args)
        )) as AuthResponse;
        if (res?.error) {
          throw toAuthMutationError(res.error);
        }
        seedReturnedToken(authStoreApi, res);
        await hydrateReturnedSession(authClient, res);
        await ensureAuth(authStoreApi);
        authStoreApi.set('isAuthenticated', true);
        await convexQueryClient?.resetAuthQueries();
        return res;
      },
    };
  }) as AuthMutationsResult['useSignInSocialMutationOptions'];

  const useSignInMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();
    const convexQueryClient = useConvexQueryClient();

    return {
      ...options,
      mutationFn: async (args: unknown) => {
        if (typeof authClient.signIn?.email !== 'function') {
          throw new Error('Auth client does not expose signIn.email');
        }
        const res = (await authClient.signIn.email(
          withDisabledSessionSignal(args)
        )) as AuthResponse;
        if (res?.error) {
          throw toAuthMutationError(res.error);
        }
        seedReturnedToken(authStoreApi, res);
        await hydrateReturnedSession(authClient, res);
        await ensureAuth(authStoreApi);
        authStoreApi.set('isAuthenticated', true);
        await convexQueryClient?.resetAuthQueries();
        return res;
      },
    };
  }) as AuthMutationsResult['useSignInMutationOptions'];

  const useSignUpMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();
    const convexQueryClient = useConvexQueryClient();

    return {
      ...options,
      mutationFn: async (args: unknown) => {
        if (typeof authClient.signUp?.email !== 'function') {
          throw new Error('Auth client does not expose signUp.email');
        }
        const res = (await authClient.signUp.email(
          withDisabledSessionSignal(args)
        )) as AuthResponse;
        if (res?.error) {
          throw toAuthMutationError(res.error);
        }
        seedReturnedToken(authStoreApi, res);
        await hydrateReturnedSession(authClient, res);
        await ensureAuth(authStoreApi);
        authStoreApi.set('isAuthenticated', true);
        await convexQueryClient?.resetAuthQueries();
        return res;
      },
    };
  }) as AuthMutationsResult['useSignUpMutationOptions'];

  return {
    useSignOutMutationOptions,
    useSignInSocialMutationOptions,
    useSignInMutationOptions,
    useSignUpMutationOptions,
  };
}
