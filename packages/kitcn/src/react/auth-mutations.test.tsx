import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  AuthMutationError,
  createAuthMutations,
  isAuthMutationError,
} from './auth-mutations';
import { AuthProvider, useAuthStore } from './auth-store';
import * as contextModule from './context';

describe('AuthMutationError', () => {
  test('maps better-auth error payload fields', () => {
    const error = new AuthMutationError({
      code: 'INVALID_PASSWORD',
      message: 'Invalid password',
      status: 401,
      statusText: 'Unauthorized',
    });

    expect(error.name).toBe('AuthMutationError');
    expect(error.message).toBe('Invalid password');
    expect(error.code).toBe('INVALID_PASSWORD');
    expect(error.status).toBe(401);
    expect(error.statusText).toBe('Unauthorized');
  });

  test('falls back to statusText as message', () => {
    const error = new AuthMutationError({
      status: 400,
      statusText: 'Bad Request',
    });

    expect(error.message).toBe('Bad Request');
  });
});

describe('isAuthMutationError', () => {
  test('returns true for AuthMutationError instances', () => {
    expect(
      isAuthMutationError(
        new AuthMutationError({
          status: 401,
          statusText: 'Unauthorized',
        })
      )
    ).toBe(true);
  });

  test('returns false for non-AuthMutationError values', () => {
    expect(isAuthMutationError(new Error('x'))).toBe(false);
    expect(isAuthMutationError({ name: 'AuthMutationError' })).toBe(false);
    expect(isAuthMutationError(null)).toBe(false);
  });
});

describe('createAuthMutations', () => {
  let useConvexQueryClientSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    useConvexQueryClientSpy?.mockRestore();
    window.sessionStorage.clear();
  });

  function makeWrapper(initialValues?: Record<string, unknown>) {
    return ({ children }: { children: ReactNode }) => (
      <AuthProvider initialValues={initialValues as any}>
        {children}
      </AuthProvider>
    );
  }

  function makeMutationCtx() {
    return { client: new QueryClient(), meta: undefined } as any;
  }

  test('signOut: sets isAuthenticated=false, resets auth queries, and clears auth state after success', async () => {
    const unsubscribeAuthQueries = mock(() => {});
    const resetAuthQueries = mock(() => {});
    useConvexQueryClientSpy = spyOn(
      contextModule,
      'useConvexQueryClient'
    ).mockReturnValue({ resetAuthQueries, unsubscribeAuthQueries } as any);

    const authClient = {
      signOut: mock(async (_args: unknown) => ({ ok: true })),
      signIn: { social: mock(async () => ({})), email: mock(async () => ({})) },
      signUp: { email: mock(async () => ({})) },
    };

    const { useSignOutMutationOptions } = createAuthMutations(
      authClient as any
    );

    const wrapper = makeWrapper({ token: 'tok', isAuthenticated: true });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignOutMutationOptions() }),
      { wrapper }
    );

    window.sessionStorage.setItem('kitcn.auth.session-token', 'session-token');

    (authClient.signOut as any).mockImplementation(async (args: unknown) => ({
      ok: true,
      args,
    }));

    await act(async () => {
      const res = await result.current.opts.mutationFn?.(
        { reason: 'logout' },
        makeMutationCtx()
      );
      expect(res).toMatchObject({ ok: true });
    });

    expect(unsubscribeAuthQueries).toHaveBeenCalledTimes(1);
    expect(resetAuthQueries).toHaveBeenCalledTimes(1);
    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(authClient.signOut).toHaveBeenCalledWith({ reason: 'logout' });

    expect(result.current.store.get('isAuthenticated')).toBe(false);
    expect(result.current.store.get('token')).toBeNull();
    expect(
      window.sessionStorage.getItem('kitcn.auth.session-token')
    ).toBeNull();
    expect(result.current.store.get('expiresAt')).toBeNull();
  });

  test('signIn(email): throws AuthMutationError when better-auth returns an error payload', async () => {
    useConvexQueryClientSpy = spyOn(
      contextModule,
      'useConvexQueryClient'
    ).mockReturnValue(null as any);

    const authClient = {
      signOut: mock(async () => ({})),
      signIn: {
        social: mock(async () => ({})),
        email: mock(async () => ({
          error: { status: 401, statusText: 'Unauthorized', code: 'NOPE' },
        })),
      },
      signUp: { email: mock(async () => ({})) },
    };

    const { useSignInMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignInMutationOptions() }),
      { wrapper }
    );

    await act(async () => {
      await expect(
        result.current.opts.mutationFn?.(
          { email: 'a@b.com', password: 'pw' },
          makeMutationCtx()
        )
      ).rejects.toBeInstanceOf(AuthMutationError);
    });
  });

  test('signIn(email): seeds the auth store from a returned token', async () => {
    const resetAuthQueries = mock(() => {});
    useConvexQueryClientSpy = spyOn(
      contextModule,
      'useConvexQueryClient'
    ).mockReturnValue({ resetAuthQueries } as any);

    const authClient = {
      signOut: mock(async () => ({})),
      signIn: {
        social: mock(async () => ({})),
        email: mock(async (args: unknown) => ({
          args,
          token: 'returned-sign-in-token',
        })),
      },
      signUp: { email: mock(async () => ({})) },
    };

    const { useSignInMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignInMutationOptions() }),
      { wrapper }
    );

    await act(async () => {
      const res = await result.current.opts.mutationFn?.(
        {
          email: 'a@b.com',
          password: 'pw',
        },
        makeMutationCtx()
      );
      expect(res).toMatchObject({ token: 'returned-sign-in-token' });
    });

    expect(result.current.store.get('token')).toBe('returned-sign-in-token');
    expect(result.current.store.get('isAuthenticated')).toBe(true);
    expect(authClient.signIn.email).toHaveBeenCalledTimes(1);
    expect(resetAuthQueries).toHaveBeenCalledTimes(1);
  });

  test('signUp(email): seeds the auth store from a returned token', async () => {
    const resetAuthQueries = mock(() => {});
    useConvexQueryClientSpy = spyOn(
      contextModule,
      'useConvexQueryClient'
    ).mockReturnValue({ resetAuthQueries } as any);

    const authClient = {
      signOut: mock(async () => ({})),
      signIn: { social: mock(async () => ({})), email: mock(async () => ({})) },
      signUp: {
        email: mock(async (args: unknown) => ({
          args,
          token: 'returned-sign-up-token',
        })),
      },
    };

    const { useSignUpMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignUpMutationOptions() }),
      { wrapper }
    );

    await act(async () => {
      const res = await result.current.opts.mutationFn?.(
        {
          email: 'a@b.com',
          password: 'pw',
        },
        makeMutationCtx()
      );
      expect(res).toMatchObject({ token: 'returned-sign-up-token' });
    });

    expect(result.current.store.get('token')).toBe('returned-sign-up-token');
    expect(result.current.store.get('isAuthenticated')).toBe(true);
    expect(window.sessionStorage.getItem('kitcn.auth.session-token')).toBe(
      'returned-sign-up-token'
    );
    expect(authClient.signUp.email).toHaveBeenCalledTimes(1);
    expect(authClient.signUp.email).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
      fetchOptions: {
        disableSignal: true,
      },
    });
    expect(resetAuthQueries).toHaveBeenCalledTimes(1);
  });

  test('signUp(email): hydrates Better Auth session state from the returned bearer token', async () => {
    useConvexQueryClientSpy = spyOn(
      contextModule,
      'useConvexQueryClient'
    ).mockReturnValue(null as any);

    const sessionAtom = {
      get: () => ({
        data: null,
        error: null,
        isPending: true,
        isRefetching: false,
        refetch: async () => {},
      }),
      set: mock((_value: unknown) => {}),
    };

    const authClient = {
      $store: { atoms: { session: sessionAtom } },
      getSession: mock(async (args: unknown) => ({
        args,
        data: {
          session: { id: 'session-1' },
          user: { email: 'a@b.com' },
        },
      })),
      signOut: mock(async () => ({})),
      signIn: { social: mock(async () => ({})), email: mock(async () => ({})) },
      signUp: {
        email: mock(async () => ({
          data: {
            token: 'returned-sign-up-token',
            user: { email: 'a@b.com' },
          },
          error: null,
        })),
      },
    };

    const { useSignUpMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignUpMutationOptions() }),
      { wrapper }
    );

    await act(async () => {
      await result.current.opts.mutationFn?.({
        email: 'a@b.com',
        password: 'pw',
      });
    });

    expect(authClient.getSession).toHaveBeenCalledWith({
      fetchOptions: {
        credentials: 'omit',
        headers: {
          Authorization: 'Bearer returned-sign-up-token',
        },
      },
    });
    expect(authClient.signUp.email).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
      fetchOptions: {
        disableSignal: true,
      },
    });
    expect(sessionAtom.set).toHaveBeenCalledWith({
      data: {
        session: { id: 'session-1' },
        user: { email: 'a@b.com' },
      },
      error: null,
      isPending: false,
      isRefetching: false,
      refetch: expect.any(Function),
    });
  });
});
