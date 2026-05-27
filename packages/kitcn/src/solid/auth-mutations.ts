/**
 * Auth Mutations Factory
 *
 * Creates TanStack Query mutation option hooks from auth functions.
 */

import type { DefaultError, SolidMutationOptions } from '@tanstack/solid-query';

import type { AuthStore } from './auth-store';
import { decodeJwtExp, useAuthStore } from './auth-store';
import { useConvexQueryClient } from './context';

export { AuthMutationError, isAuthMutationError } from '../crpc/auth-error';

import { AuthMutationError } from '../crpc/auth-error';

type MutationOptionsHook<TData, TVariables = void> = (
  options?: Omit<
    SolidMutationOptions<TData, DefaultError, TVariables>,
    'mutationFn'
  >
) => SolidMutationOptions<TData, DefaultError, TVariables>;

type SignInMethod<T extends AuthClient> = Extract<keyof T['signIn'], string>;

type EmailSignInMutationOptions<T extends AuthClient> = Omit<
  SolidMutationOptions<
    Awaited<ReturnType<T['signIn']['email']>>,
    DefaultError,
    Parameters<T['signIn']['email']>[0]
  >,
  'mutationFn'
> & {
  signInMethod?: 'email';
};

type CustomSignInMutationOptions<
  T extends AuthClient,
  TMethod extends SignInMethod<T>,
> = Omit<
  SolidMutationOptions<
    Awaited<ReturnType<T['signIn'][TMethod]>>,
    DefaultError,
    Parameters<T['signIn'][TMethod]>[0]
  >,
  'mutationFn'
> & {
  signInMethod: TMethod;
};

type SignInMutationOptionsHook<T extends AuthClient> = {
  (
    options?: EmailSignInMutationOptions<T>
  ): SolidMutationOptions<
    Awaited<ReturnType<T['signIn']['email']>>,
    DefaultError,
    Parameters<T['signIn']['email']>[0]
  >;
  <TMethod extends Exclude<SignInMethod<T>, 'email'>>(
    options: CustomSignInMutationOptions<T, TMethod>
  ): SolidMutationOptions<
    Awaited<ReturnType<T['signIn'][TMethod]>>,
    DefaultError,
    Parameters<T['signIn'][TMethod]>[0]
  >;
};

type SignInOptions<T extends AuthClient> =
  | EmailSignInMutationOptions<T>
  | CustomSignInMutationOptions<T, Exclude<SignInMethod<T>, 'email'>>;

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
};

type AnyFn = (...args: any[]) => Promise<any>;

type AuthClient = {
  signOut: AnyFn;
  signIn: Record<string, AnyFn> & {
    email: AnyFn;
    social: AnyFn;
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
  useSignInMutationOptions: SignInMutationOptionsHook<T>;
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
 * import { createAuthMutations } from 'kitcn/solid';
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
        authStoreApi.set('token', null);
        authStoreApi.set('expiresAt', null);
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
        seedReturnedToken(authStoreApi, res);
        await ensureAuth(authStoreApi);
        return res;
      },
    };
  }) as AuthMutationsResult<T>['useSignInSocialMutationOptions'];

  const useSignInMutationOptions = ((options?: SignInOptions<T>) => {
    const authStoreApi = useAuthStore();
    const { signInMethod = 'email', ...mutationOptions } = (options ??
      {}) as SignInOptions<T> & { signInMethod?: string };

    return {
      ...mutationOptions,
      mutationFn: async (args: Parameters<T['signIn']['email']>[0]) => {
        const signIn = authClient.signIn[signInMethod];
        if (typeof signIn !== 'function') {
          throw new Error(`Auth client does not expose signIn.${signInMethod}`);
        }
        const res = await signIn(args);
        if (res?.error) {
          throw new AuthMutationError(res.error);
        }
        seedReturnedToken(authStoreApi, res);
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
        seedReturnedToken(authStoreApi, res);
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
