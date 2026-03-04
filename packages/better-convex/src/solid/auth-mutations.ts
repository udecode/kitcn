/**
 * Auth Mutations Factory (SolidJS)
 *
 * Creates TanStack Query mutation option objects from auth functions.
 */

import type {
  DefaultError,
  MutationObserverOptions,
} from '@tanstack/query-core';

import type { AuthStore } from './auth-store';
import { useAuthStore } from './auth-store';
import { useConvexQueryClient } from './context';

/**
 * Error thrown when a Better Auth mutation fails.
 * Contains the original error details from Better Auth.
 */
export class AuthMutationError extends Error {
  /** Error code from Better Auth (e.g., 'INVALID_PASSWORD', 'EMAIL_ALREADY_REGISTERED') */
  code?: string;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;

  constructor(authError: {
    message?: string;
    status: number;
    statusText: string;
    code?: string;
  }) {
    super(authError.message || authError.statusText);
    this.name = 'AuthMutationError';
    this.code = authError.code;
    this.status = authError.status;
    this.statusText = authError.statusText;
  }
}

/**
 * Type guard to check if an error is an AuthMutationError.
 */
export function isAuthMutationError(
  error: unknown
): error is AuthMutationError {
  return error instanceof AuthMutationError;
}

type MutationOptionsFn<TData, TVariables = void> = (
  options?: Omit<
    MutationObserverOptions<TData, DefaultError, TVariables>,
    'mutationFn'
  >
) => MutationObserverOptions<TData, DefaultError, TVariables>;

/** Poll until token is null (max 5s) */
const waitForTokenClear = async (
  store: AuthStore,
  timeout = 5000
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!store.get('token')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
};

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

type AnyFn = (...args: any[]) => Promise<any>;

type AuthClient = {
  signOut: AnyFn;
  signIn: {
    social: AnyFn;
    email: AnyFn;
  };
  signUp: {
    email: AnyFn;
  };
};

type AuthMutationsResult<T extends AuthClient> = {
  createSignOutMutationOptions: MutationOptionsFn<
    Awaited<ReturnType<T['signOut']>>,
    // biome-ignore lint/suspicious/noConfusingVoidType: allows mutate() or mutate(options)
    Parameters<T['signOut']>[0] | void
  >;
  createSignInSocialMutationOptions: MutationOptionsFn<
    Awaited<ReturnType<T['signIn']['social']>>,
    Parameters<T['signIn']['social']>[0]
  >;
  createSignInMutationOptions: MutationOptionsFn<
    Awaited<ReturnType<T['signIn']['email']>>,
    Parameters<T['signIn']['email']>[0]
  >;
  createSignUpMutationOptions: MutationOptionsFn<
    Awaited<ReturnType<T['signUp']['email']>>,
    Parameters<T['signUp']['email']>[0]
  >;
};

/**
 * Create mutation option factories from a better-auth client (SolidJS).
 *
 * Returns plain option objects (not hooks) for use with createMutation(() => options).
 *
 * @example
 * ```tsx
 * // lib/auth-client.ts
 * import { createAuthMutations } from 'better-convex/solid';
 *
 * export const authClient = createAuthClient({...});
 *
 * export const {
 *   createSignOutMutationOptions,
 *   createSignInMutationOptions,
 * } = createAuthMutations(authClient);
 *
 * // components/header.tsx
 * const signOutMutation = createMutation(() => createSignOutMutationOptions({
 *   onSuccess: () => navigate('/login'),
 * }));
 * ```
 */
export function createAuthMutations<T extends AuthClient>(
  authClient: T
): AuthMutationsResult<T> {
  const createSignOutMutationOptions = ((options) => {
    const convexQueryClient = useConvexQueryClient();
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args?: Parameters<T['signOut']>[0]) => {
        if (authStoreApi) {
          authStoreApi.set('isAuthenticated', false);
        }
        convexQueryClient?.unsubscribeAuthQueries();
        const res = await authClient.signOut(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        if (authStoreApi) {
          await waitForTokenClear(authStoreApi);
        }
        return res;
      },
    };
  }) as AuthMutationsResult<T>['createSignOutMutationOptions'];

  const createSignInSocialMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signIn']['social']>[0]) => {
        const res = await authClient.signIn.social(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        if (authStoreApi) {
          await ensureAuth(authStoreApi);
        }
        return res;
      },
    };
  }) as AuthMutationsResult<T>['createSignInSocialMutationOptions'];

  const createSignInMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signIn']['email']>[0]) => {
        const res = await authClient.signIn.email(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        if (authStoreApi) {
          await ensureAuth(authStoreApi);
        }
        return res;
      },
    };
  }) as AuthMutationsResult<T>['createSignInMutationOptions'];

  const createSignUpMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signUp']['email']>[0]) => {
        const res = await authClient.signUp.email(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        if (authStoreApi) {
          await ensureAuth(authStoreApi);
        }
        return res;
      },
    };
  }) as AuthMutationsResult<T>['createSignUpMutationOptions'];

  return {
    createSignOutMutationOptions,
    createSignInSocialMutationOptions,
    createSignInMutationOptions,
    createSignUpMutationOptions,
  };
}
