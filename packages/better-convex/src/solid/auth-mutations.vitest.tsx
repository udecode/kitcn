/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { renderHook } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  AuthMutationError,
  createAuthMutations,
  isAuthMutationError,
} from './auth-mutations';
import type { AuthStore } from './auth-store';
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
  let useConvexQueryClientSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    useConvexQueryClientSpy?.mockRestore();
  });

  function makeWrapper(initialValues?: Record<string, unknown>) {
    return (props: { children: JSX.Element }) => (
      <AuthProvider initialValues={initialValues as any}>
        {props.children}
      </AuthProvider>
    );
  }

  function makeMutationCtx() {
    return {} as any;
  }

  test('signOut: sets isAuthenticated=false, unsubscribes auth queries, and waits for token to clear', async () => {
    const unsubscribeAuthQueries = vi.fn(() => {});
    useConvexQueryClientSpy = vi
      .spyOn(contextModule, 'useConvexQueryClient')
      .mockReturnValue({ unsubscribeAuthQueries } as any);

    const authClient = {
      signOut: vi.fn(async (_args: unknown) => ({ ok: true })),
      signIn: {
        social: vi.fn(async () => ({})),
        email: vi.fn(async () => ({})),
      },
      signUp: { email: vi.fn(async () => ({})) },
    };

    const { useSignOutMutationOptions } = createAuthMutations(
      authClient as any
    );

    const wrapper = makeWrapper({ token: 'tok', isAuthenticated: true });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignOutMutationOptions() }),
      { wrapper }
    );

    // Clear the token as part of the authClient call to simulate auth completion.
    (authClient.signOut as any).mockImplementation(async (args: unknown) => {
      result.store.set('token', null as any);
      return { ok: true, args };
    });

    const res = await result.opts.mutationFn?.(
      { reason: 'logout' },
      makeMutationCtx()
    );
    expect(res).toMatchObject({ ok: true });

    expect(unsubscribeAuthQueries).toHaveBeenCalledTimes(1);
    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(authClient.signOut).toHaveBeenCalledWith({ reason: 'logout' });

    expect(result.store.get('isAuthenticated')).toBe(false);
    expect(result.store.get('token')).toBeNull();
  });

  test('signIn(email): throws AuthMutationError when better-auth returns an error payload', async () => {
    useConvexQueryClientSpy = vi
      .spyOn(contextModule, 'useConvexQueryClient')
      .mockReturnValue(null as any);

    const authClient = {
      signOut: vi.fn(async () => ({})),
      signIn: {
        social: vi.fn(async () => ({})),
        email: vi.fn(async () => ({
          error: { status: 401, statusText: 'Unauthorized', code: 'NOPE' },
        })),
      },
      signUp: { email: vi.fn(async () => ({})) },
    };

    const { useSignInMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => ({ store: useAuthStore(), opts: useSignInMutationOptions() }),
      { wrapper }
    );

    await expect(
      result.opts.mutationFn?.(
        { email: 'a@b.com', password: 'pw' },
        makeMutationCtx()
      )
    ).rejects.toBeInstanceOf(AuthMutationError);
  });

  test('signUp(email): waits for auth token before returning', async () => {
    useConvexQueryClientSpy = vi
      .spyOn(contextModule, 'useConvexQueryClient')
      .mockReturnValue(null as any);

    let storeRef: AuthStore | null = null;

    const authClient = {
      signOut: vi.fn(async () => ({})),
      signIn: {
        social: vi.fn(async () => ({})),
        email: vi.fn(async () => ({})),
      },
      signUp: {
        email: vi.fn(async (args: unknown) => {
          storeRef?.set('token', 'new-token');
          return { ok: true, args };
        }),
      },
    };

    const { useSignUpMutationOptions } = createAuthMutations(authClient as any);

    const wrapper = makeWrapper({ token: null });

    const { result } = renderHook(
      () => {
        const store = useAuthStore();
        storeRef = store;
        return { store, opts: useSignUpMutationOptions() };
      },
      { wrapper }
    );

    const res = await result.opts.mutationFn?.(
      {
        email: 'a@b.com',
        password: 'pw',
      },
      makeMutationCtx()
    );
    expect(res).toMatchObject({ ok: true });

    expect(result.store.get('token')).toBe('new-token');
    expect(authClient.signUp.email).toHaveBeenCalledTimes(1);
  });
});
