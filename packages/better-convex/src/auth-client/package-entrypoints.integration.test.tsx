import { act, renderHook, waitFor } from '@testing-library/react';
import { ConvexAuthProvider } from 'better-convex/auth/client';
import {
  createAuthMutations,
  useAuth,
  useFetchAccessToken,
} from 'better-convex/react';
import type { ReactNode } from 'react';

describe('package entrypoints auth integration', () => {
  test('signUp token seeding from better-convex/react is visible to useAuth under better-convex/auth/client', async () => {
    const client = {
      clearAuth: () => {},
      setAuth: () => {},
    };

    const convexJwt = 'x.eyJleHAiOjQxMDI0NDQ4MDB9.z';
    const authClient = {
      convex: {
        token: mock(async () => ({ data: { token: convexJwt } })),
      },
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
      getSession: async () => null,
      signIn: {
        email: mock(async () => ({ data: null, error: null })),
        social: mock(async () => ({ data: null, error: null })),
      },
      signOut: mock(async () => ({ data: null, error: null })),
      signUp: {
        email: mock(async () => ({
          data: {
            token: 'session-token',
            user: { email: 'entrypoints@example.com' },
          },
          error: null,
        })),
      },
      updateSession: () => {},
      useSession: () => ({ data: null, isPending: false }),
    };

    const { useSignUpMutationOptions } = createAuthMutations(
      authClient as never
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as never}
        client={client as never}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(
      () => ({
        auth: useAuth(),
        fetchAccessToken: useFetchAccessToken(),
        signUp: useSignUpMutationOptions(),
      }),
      { wrapper }
    );

    expect(result.current.auth.hasSession).toBe(false);

    await act(async () => {
      await result.current.signUp.mutationFn?.({
        callbackURL: '/auth',
        email: 'entrypoints@example.com',
        name: 'Entrypoints',
        password: 'BrowserPassword123!',
      });
    });

    await waitFor(() => {
      expect(result.current.auth.hasSession).toBe(true);
    });

    await act(async () => {
      await expect(
        result.current.fetchAccessToken?.({ forceRefreshToken: false })
      ).resolves.toBe(convexJwt);
    });
  });
});
