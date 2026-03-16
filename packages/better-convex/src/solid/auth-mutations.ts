/**
 * Auth Mutations Factory
 *
 * Creates TanStack Query mutation option hooks from auth functions.
 */

import type { DefaultError, SolidMutationOptions } from '@tanstack/solid-query';

import type { AuthStore } from './auth-store';
import { useAuthStore } from './auth-store';
import { useConvexQueryClient } from './context';

export { AuthMutationError, isAuthMutationError } from '../crpc/auth-error';

import { AuthMutationError } from '../crpc/auth-error';

type MutationOptionsHook<TData, TVariables = void> = (
  options?: Omit<
    SolidMutationOptions<TData, DefaultError, TVariables>,
    'mutationFn'
  >
) => SolidMutationOptions<TData, DefaultError, TVariables>;

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
  useSignOutMutationOptions: MutationOptionsHook<
    Awaited<ReturnType<T['signOut']>>,
    // biome-ignore lint/suspicious/noConfusingVoidType: allows mutate() or mutate(options)
    Parameters<T['signOut']>[0] | void
  >;
  useSignInSocialMutationOptions: MutationOptionsHook<
    Awaited<ReturnType<T['signIn']['social']>>,
    Parameters<T['signIn']['social']>[0]
  >;
  useSignInMutationOptions: MutationOptionsHook<
    Awaited<ReturnType<T['signIn']['email']>>,
    Parameters<T['signIn']['email']>[0]
  >;
  useSignUpMutationOptions: MutationOptionsHook<
    Awaited<ReturnType<T['signUp']['email']>>,
    Parameters<T['signUp']['email']>[0]
  >;
};

/**
 * Create mutation option hooks from a better-auth client.
 *
 * @example
 * ```tsx
 * // lib/auth-client.ts
 * import { createAuthMutations } from 'better-convex/solid';
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
 * const signOutMutation = createMutation(() => useSignOutMutationOptions({
 *   onSuccess: () => navigate('/login'),
 * }));
 * ```
 */
export function createAuthMutations<T extends AuthClient>(
  authClient: T
): AuthMutationsResult<T> {
  const useSignOutMutationOptions = ((options) => {
    const convexQueryClient = useConvexQueryClient();
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args?: Parameters<T['signOut']>[0]) => {
        // Set isAuthenticated: false BEFORE unsubscribing to prevent re-subscriptions
        // (cache events check shouldSkipSubscription which reads isAuthenticated)
        authStoreApi.set('isAuthenticated', false);
        convexQueryClient?.unsubscribeAuthQueries();
        const res = await authClient.signOut(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        await waitForTokenClear(authStoreApi);
        return res;
      },
    };
  }) as AuthMutationsResult<T>['useSignOutMutationOptions'];

  const useSignInSocialMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signIn']['social']>[0]) => {
        const res = await authClient.signIn.social(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        await ensureAuth(authStoreApi);
        return res;
      },
    };
  }) as AuthMutationsResult<T>['useSignInSocialMutationOptions'];

  const useSignInMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signIn']['email']>[0]) => {
        const res = await authClient.signIn.email(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        await ensureAuth(authStoreApi);
        return res;
      },
    };
  }) as AuthMutationsResult<T>['useSignInMutationOptions'];

  const useSignUpMutationOptions = ((options) => {
    const authStoreApi = useAuthStore();

    return {
      ...options,
      mutationFn: async (args: Parameters<T['signUp']['email']>[0]) => {
        const res = await authClient.signUp.email(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        await ensureAuth(authStoreApi);
        return res;
      },
    };
  }) as AuthMutationsResult<T>['useSignUpMutationOptions'];

  return {
    useSignOutMutationOptions,
    useSignInSocialMutationOptions,
    useSignInMutationOptions,
    useSignUpMutationOptions,
  };
}
