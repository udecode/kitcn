import { act, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { syncConvexAuthForStartLoader } from '../auth-start';
import { AuthMutationError } from '../crpc/auth-error';
import { createAuthMutations } from '../react/auth-mutations';
import { writeAuthSessionFallbackToken } from '../react/auth-session-fallback';
import type { AuthStore } from '../react/auth-store';
import {
  decodeJwtExp,
  useAuth,
  useAuthStore,
  useAuthValue,
  useConvexAuthRecovery,
  useFetchAccessToken,
} from '../react/auth-store';
import {
  isDocumentTripped,
  resetDocumentTripForTests,
  tripDocument,
} from '../react/identity-guard-registry';
import { isClientSettled } from './client-settlement';
import { ConvexAuthProvider } from './convex-auth-provider';

const makeJwt = (expSecondsFromNow: number) => {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = btoa(JSON.stringify({ exp }));
  return `x.${payload}.z`;
};

// Fake timers move Date.now() too, so the grace window closes without the test
// spending ten real seconds on it. Stepping a second at a time lets React flush
// between the awaited backoff and the next probe.
const advanceSeconds = async (seconds: number) => {
  for (let step = 0; step < seconds; step += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
  }
};

describe('ConvexAuthProvider', () => {
  let originalHref = window.location.href;

  beforeEach(() => {
    originalHref = window.location.href;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    resetDocumentTripForTests();
    window.sessionStorage.clear();
    try {
      window.history.replaceState({}, '', originalHref);
    } catch {
      // Happy DOM may reject some URL transitions; don't let cleanup fail the suite.
    }
  });

  test('recovers Better Auth after a transient token refresh failure', async () => {
    const bindings: Array<{
      fetchToken: (args: {
        forceRefreshToken: boolean;
      }) => Promise<string | null>;
      onChange: (isAuthenticated: boolean) => void;
    }> = [];
    const client = {
      clearAuth: mock(() => {}),
      setAuth: mock(
        (
          fetchToken: (args: {
            forceRefreshToken: boolean;
          }) => Promise<string | null>,
          onChange: (isAuthenticated: boolean) => void
        ) => {
          bindings.push({ fetchToken, onChange });
        }
      ),
    };
    const recoveredToken = makeJwt(7200);
    const token = mock()
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { token: recoveredToken } });
    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    let recovery: ReturnType<typeof useConvexAuthRecovery> | undefined;
    expect(() => {
      renderHook(
        () => {
          recovery = useConvexAuthRecovery();
        },
        { wrapper }
      );
    }).not.toThrow();

    await waitFor(() => {
      expect(bindings).toHaveLength(1);
    });
    let failedToken: string | null = null;
    await act(async () => {
      failedToken = await bindings[0]!.fetchToken({
        forceRefreshToken: true,
      });
    });
    expect(failedToken).toBeNull();
    act(() => {
      bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = recovery!.recover({ timeoutMs: 1_000 });
    });
    await waitFor(() => {
      expect(bindings).toHaveLength(2);
    });
    let freshToken: string | null = null;
    await act(async () => {
      freshToken = await bindings[1]!.fetchToken({
        forceRefreshToken: false,
      });
    });
    expect(freshToken).toBe(recoveredToken);
    act(() => {
      bindings[1]!.onChange(true);
    });

    await expect(recovered).resolves.toBeUndefined();
    expect(token).toHaveBeenCalledTimes(2);
  });

  test('syncs ConvexQueryClient with the auth store before children render', () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: mock(async () => ({ data: { token: makeJwt(7200) } })) },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    let syncedStore: ReturnType<typeof useAuthStore> | undefined;
    const convexQueryClient = {
      updateAuthStore: mock((authStore: ReturnType<typeof useAuthStore>) => {
        syncedStore = authStore;
      }),
    };

    function StoreProbe() {
      const authStore = useAuthStore();
      expect(syncedStore?.store).toBe(authStore.store);
      return null;
    }

    render(
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        convexQueryClient={convexQueryClient}
      >
        <StoreProbe />
      </ConvexAuthProvider>
    );

    expect(convexQueryClient.updateAuthStore).toHaveBeenCalled();
  });

  test('provides fetchAccessToken that returns cached SSR token while session is pending', async () => {
    const initialToken = makeJwt(3600);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current!({ forceRefreshToken: false });
    });

    // Assignment happens inside `act` callback; widen back to the declared union.
    expect(fetched as string | null).toBe(initialToken);
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('fetches a fresh token when forceRefreshToken=true while session is pending', async () => {
    const initialToken = makeJwt(3600);
    const freshToken = makeJwt(7200);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: { token: freshToken } }));

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current!({ forceRefreshToken: true });
    });

    expect(fetched as string | null).toBe(freshToken);
    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: { throw: false },
    });
  });

  test('falls back to SSR token when forced refresh fails while session is pending', async () => {
    const initialToken = makeJwt(3600);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: {} }));

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let forcedFetched: string | null = null;
    await act(async () => {
      forcedFetched = await result.current!({ forceRefreshToken: true });
    });

    let nonForcedFetched: string | null = null;
    await act(async () => {
      nonForcedFetched = await result.current!({ forceRefreshToken: false });
    });

    expect(forcedFetched as string | null).toBe(initialToken);
    expect(nonForcedFetched as string | null).toBe(initialToken);
    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: { throw: false },
    });
  });

  test('retries forced refresh when pending in-flight refresh resolves null', async () => {
    const initialToken = makeJwt(3600);
    const freshToken = makeJwt(7200);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    let callCount = 0;
    let resolveFirstCallGate!: () => void;
    const firstCallGate = new Promise<void>((resolve) => {
      resolveFirstCallGate = resolve;
    });

    const convexToken = mock(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return { data: {} };
      }
      return { data: { token: freshToken } };
    });

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    const firstForcedPromise = result.current!({ forceRefreshToken: true });
    await Promise.resolve();
    const secondForcedPromise = result.current!({ forceRefreshToken: true });

    resolveFirstCallGate();

    let firstResult: string | null = null;
    let secondResult: string | null = null;
    await act(async () => {
      firstResult = await firstForcedPromise;
      secondResult = await secondForcedPromise;
    });

    expect(firstResult as string | null).toBe(initialToken);
    expect(secondResult as string | null).toBe(freshToken);
    expect(convexToken).toHaveBeenCalledTimes(2);
  });

  test('passes throw=false when fetching a fresh token', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const jwt = makeJwt(7200);
    const convexToken = mock(async (_opts?: unknown) => ({
      data: { token: jwt },
    }));

    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    await act(async () => {
      const fetched = await result.current!({ forceRefreshToken: true });
      expect(fetched).toBe(jwt);
    });

    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: { throw: false },
    });
  });

  test('passes the cached session token as bearer auth when it is not a JWT', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexJwt = makeJwt(7200);
    const convexToken = mock(async (_opts?: unknown) => ({
      data: { token: convexJwt },
    }));

    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(
      () => ({
        fetchAccessToken: useFetchAccessToken(),
        store: useAuthStore(),
      }),
      { wrapper }
    );

    await act(async () => {
      result.current.store.set('token', 'session-token');
      result.current.store.set('expiresAt', null);
    });

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current.fetchAccessToken!({
        forceRefreshToken: true,
      });
    });

    expect(fetched as string | null).toBe(convexJwt);
    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: {
        credentials: 'omit',
        headers: {
          Authorization: 'Bearer session-token',
        },
        throw: false,
      },
    });
  });

  test('rehydrates auth from a persisted session token fallback on reload', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const sessionAtomState = {
      data: null as unknown,
      error: null as unknown,
      isPending: false,
      isRefetching: false,
      refetch: async () => {},
    };
    const sessionAtom = {
      get: () => sessionAtomState,
      set: mock((value: typeof sessionAtomState) => {
        sessionAtomState.data = value.data;
        sessionAtomState.error = value.error;
        sessionAtomState.isPending = value.isPending;
        sessionAtomState.isRefetching = value.isRefetching;
        sessionAtomState.refetch = value.refetch;
      }),
    };

    const authFetch = mock(async () => ({
      data: {
        session: { id: 'session-1' },
        user: { email: 'persisted@example.com' },
      },
    }));

    const authClient = {
      $store: { atoms: { session: sessionAtom } },
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: makeJwt(7200) } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    renderHook(
      () => ({
        auth: useAuth(),
        fetchAccessToken: useFetchAccessToken(),
        store: useAuthStore(),
      }),
      { wrapper }
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(authFetch).toHaveBeenCalledWith('/get-session', {
      credentials: 'omit',
      headers: {
        Authorization: 'Bearer persisted-session-token',
      },
    });
    // A live token costs exactly one immediate request, with no pre-delay.
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  test('clears seeded session atom when persisted token recheck fails', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );
    window.sessionStorage.setItem(
      'kitcn.auth.session-data',
      JSON.stringify({
        session: { id: 'session-1' },
        user: { email: 'persisted@example.com' },
      })
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const sessionAtomState = {
      data: null as unknown,
      error: null as unknown,
      isPending: false,
      isRefetching: false,
      refetch: async () => {},
    };
    const sessionAtom = {
      get: () => sessionAtomState,
      set: mock((value: typeof sessionAtomState) => {
        sessionAtomState.data = value.data;
        sessionAtomState.error = value.error;
        sessionAtomState.isPending = value.isPending;
        sessionAtomState.isRefetching = value.isRefetching;
        sessionAtomState.refetch = value.refetch;
      }),
    };

    const authFetch = mock(async () => ({ data: null }));
    const authClient = {
      $store: { atoms: { session: sessionAtom } },
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: makeJwt(7200) } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(sessionAtomState.data).toBeNull();
    expect(
      window.sessionStorage.getItem('kitcn.auth.session-token')
    ).toBeNull();
    expect(window.sessionStorage.getItem('kitcn.auth.session-data')).toBeNull();
    // 200 with a null body is definitive: no retry storm.
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  test('keeps the persisted token when every session recheck fails in transport', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );
    window.sessionStorage.setItem(
      'kitcn.auth.session-data',
      JSON.stringify({
        session: { id: 'session-1' },
        user: { email: 'persisted@example.com' },
      })
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const sessionAtomState = {
      data: null as unknown,
      error: null as unknown,
      isPending: false,
      isRefetching: false,
      refetch: async () => {},
    };
    const sessionAtom = {
      get: () => sessionAtomState,
      set: mock((value: typeof sessionAtomState) => {
        sessionAtomState.data = value.data;
        sessionAtomState.error = value.error;
        sessionAtomState.isPending = value.isPending;
        sessionAtomState.isRefetching = value.isRefetching;
        sessionAtomState.refetch = value.refetch;
      }),
    };

    const authFetch = mock(async () => ({
      data: null,
      error: { status: 0, statusText: 'Failed to fetch' },
    }));
    const authClient = {
      $store: { atoms: { session: sessionAtom } },
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: makeJwt(7200) } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    const token = window.sessionStorage.getItem('kitcn.auth.session-token');
    const data = window.sessionStorage.getItem('kitcn.auth.session-data');

    // A dropped request must not sign the user out.
    expect(token).toBe('persisted-session-token');
    expect(data).not.toBeNull();
    expect(authFetch).toHaveBeenCalledTimes(3);
  });

  test('resolves the auth state when the grace window closes with no answer', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authFetch = mock(async () => ({
      data: null,
      error: { status: 0, statusText: 'Failed to fetch' },
    }));
    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    jest.useFakeTimers();
    let result: {
      current: { auth: ReturnType<typeof useAuth>; store: AuthStore };
    };
    try {
      result = renderHook(() => ({ auth: useAuth(), store: useAuthStore() }), {
        wrapper,
      }).result;

      // Well past AUTH_SESSION_SYNC_GRACE_MS.
      await advanceSeconds(40);
    } finally {
      jest.useRealTimers();
    }

    // The optimistic state the restore created must not outlive its own grace
    // window, or the app hangs on `isLoading` forever.
    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.store.get('token')).toBeNull();
    expect(result.current.store.get('sessionSyncGraceUntil')).toBeNull();
    // The credential still survives, so the next mount can retry it.
    expect(window.sessionStorage.getItem('kitcn.auth.session-token')).toBe(
      'persisted-session-token'
    );
  });

  test('restores the session in the same mount when the transport recovers', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const restored = {
      session: { id: 'session-1' },
      user: { email: 'persisted@example.com' },
    };
    let online = false;
    const authFetch = mock(async () =>
      online
        ? { data: restored }
        : { data: null, error: { status: 0, statusText: 'Failed to fetch' } }
    );
    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    jest.useFakeTimers();
    let result: {
      current: { auth: ReturnType<typeof useAuth>; store: AuthStore };
    };
    try {
      result = renderHook(() => ({ auth: useAuth(), store: useAuthStore() }), {
        wrapper,
      }).result;

      await advanceSeconds(3);
      online = true;
      await advanceSeconds(4);
    } finally {
      jest.useRealTimers();
    }

    // Connectivity returned inside the window, so no remount is needed.
    expect(window.sessionStorage.getItem('kitcn.auth.session-data')).toBe(
      JSON.stringify(restored)
    );
    expect(result.current.store.get('token')).toBe('persisted-session-token');
  });

  test('stops the persisted-token recovery once a Convex JWT takes over', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authFetch = mock(async () => ({
      data: null,
      error: { status: 0, statusText: 'Failed to fetch' },
    }));
    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const jwt = makeJwt(7200);
    jest.useFakeTimers();
    let result: {
      current: { auth: ReturnType<typeof useAuth>; store: AuthStore };
    };
    let callsAtTakeover = 0;
    try {
      result = renderHook(() => ({ auth: useAuth(), store: useAuthStore() }), {
        wrapper,
      }).result;

      await advanceSeconds(2);
      // Stand in for fetchAccessToken exchanging the opaque token for a JWT.
      await act(async () => {
        result.current.store.set('token', jwt);
        result.current.store.set('expiresAt', decodeJwtExp(jwt));
        result.current.store.set('sessionSyncGraceUntil', null);
      });
      callsAtTakeover = authFetch.mock.calls.length;
      await advanceSeconds(40);
    } finally {
      jest.useRealTimers();
    }

    // The restore stands down instead of racing the live token.
    expect(authFetch).toHaveBeenCalledTimes(callsAtTakeover);
    expect(result.current.store.get('token')).toBe(jwt);
  });

  test('ignores a restored session after the persisted token loses ownership', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };
    const restored = {
      session: { id: 'stale-session' },
      user: { email: 'stale@example.com' },
    };
    let resolveFetch!: (value: { data: typeof restored }) => void;
    const authFetch = mock(
      () =>
        new Promise<{ data: typeof restored }>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );
    const { result } = renderHook(() => useAuthStore(), { wrapper });

    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.set('token', null);
      result.current.set('expiresAt', null);
      result.current.set('sessionSyncGraceUntil', null);
    });
    await act(async () => {
      resolveFetch({ data: restored });
      await Promise.resolve();
    });

    expect(result.current.get('token')).toBeNull();
    expect(window.sessionStorage.getItem('kitcn.auth.session-data')).toBeNull();
  });

  test('accepts a restored session when the seeded session was cloned', async () => {
    const persisted = {
      session: { id: 'persisted-session' },
      user: { email: 'persisted@example.com' },
    };
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );
    window.sessionStorage.setItem(
      'kitcn.auth.session-data',
      JSON.stringify(persisted)
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };
    const restored = {
      session: { id: 'persisted-session' },
      user: { email: 'fresh@example.com' },
    };
    let currentSession: unknown = null;
    let resolveFetch!: (value: { data: typeof restored }) => void;
    const authFetch = mock(
      () =>
        new Promise<{ data: typeof restored }>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const sessionAtom = {
      get: () => ({ refetch: async () => {} }),
      set: mock((value: { data: unknown }) => {
        currentSession = structuredClone(value.data);
      }),
    };
    const authClient = {
      $store: { atoms: { session: sessionAtom } },
      useSession: () => ({ data: currentSession, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );
    const { rerender } = renderHook(() => useAuthStore(), { wrapper });

    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
    rerender();
    await act(async () => {
      resolveFetch({ data: restored });
      await Promise.resolve();
    });

    expect(window.sessionStorage.getItem('kitcn.auth.session-data')).toBe(
      JSON.stringify(restored)
    );
  });

  test('ignores a restored session after a different session takes over', async () => {
    const persisted = {
      session: { id: 'persisted-session' },
      user: { email: 'persisted@example.com' },
    };
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );
    window.sessionStorage.setItem(
      'kitcn.auth.session-data',
      JSON.stringify(persisted)
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };
    const stale = {
      session: { id: 'persisted-session' },
      user: { email: 'stale@example.com' },
    };
    let currentSession: unknown = null;
    let resolveFetch!: (value: { data: typeof stale }) => void;
    const authFetch = mock(
      () =>
        new Promise<{ data: typeof stale }>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const authClient = {
      useSession: () => ({ data: currentSession, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );
    const { rerender } = renderHook(() => useAuthStore(), { wrapper });

    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
    currentSession = {
      session: { id: 'new-session' },
      user: { email: 'new@example.com' },
    };
    rerender();
    await act(async () => {
      resolveFetch({ data: stale });
      await Promise.resolve();
    });

    expect(window.sessionStorage.getItem('kitcn.auth.session-data')).toBe(
      JSON.stringify(persisted)
    );
  });

  test('expires persisted-token recovery when a request never settles', async () => {
    window.sessionStorage.setItem(
      'kitcn.auth.session-token',
      'persisted-session-token'
    );

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };
    const authFetch = mock(() => new Promise(() => {}));
    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      $fetch: authFetch,
      convex: { token: mock(async () => ({ data: { token: null } })) },
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    jest.useFakeTimers();
    let result: {
      current: { auth: ReturnType<typeof useAuth>; store: AuthStore };
    };
    try {
      result = renderHook(() => ({ auth: useAuth(), store: useAuthStore() }), {
        wrapper,
      }).result;
      await advanceSeconds(40);
    } finally {
      jest.useRealTimers();
    }

    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.store.get('token')).toBeNull();
    expect(result.current.store.get('sessionSyncGraceUntil')).toBeNull();
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  test('keeps a cached JWT when a later token refresh returns null', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const firstJwt = makeJwt(7200);
    const convexToken = mock(async () => ({ data: { token: firstJwt } }));

    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(
      () => ({
        fetchAccessToken: useFetchAccessToken(),
        store: useAuthStore(),
      }),
      { wrapper }
    );

    await act(async () => {
      const fetched = await result.current.fetchAccessToken!({
        forceRefreshToken: true,
      });
      expect(fetched).toBe(firstJwt);
    });

    convexToken.mockImplementationOnce(async () => ({ data: {} }));

    await act(async () => {
      const fetched = await result.current.fetchAccessToken!({
        forceRefreshToken: true,
      });
      expect(fetched).toBe(firstJwt);
    });

    expect(result.current.store.get('token')).toBe(firstJwt);
  });

  test('does not fall back to an expired cached JWT when refresh returns null', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const expiredJwt = makeJwt(-60);
    const convexToken = mock(async () => ({ data: {} }));

    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(
      () => ({
        fetchAccessToken: useFetchAccessToken(),
        store: useAuthStore(),
      }),
      { wrapper }
    );

    act(() => {
      result.current.store.set('token', expiredJwt);
      result.current.store.set('expiresAt', decodeJwtExp(expiredJwt));
    });

    let fetched: string | null = 'placeholder';
    await act(async () => {
      fetched = await result.current.fetchAccessToken!({
        forceRefreshToken: true,
      });
    });

    expect(fetched as string | null).toBeNull();
    expect(result.current.store.get('token')).toBeNull();
    expect(result.current.store.get('expiresAt')).toBeNull();
  });

  test('deduplicates concurrent token fetches', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const jwt = makeJwt(7200);
    const convexToken = mock(async (_opts?: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { data: { token: jwt } };
    });

    const authClient = {
      useSession: () => ({
        data: { session: { id: 'session-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    await act(async () => {
      const tokens = (await Promise.all([
        result.current!({ forceRefreshToken: false }),
        result.current!({ forceRefreshToken: false }),
      ])) as Array<string | null>;
      expect(tokens).toEqual([jwt, jwt]);
    });
    expect(convexToken).toHaveBeenCalledTimes(1);
  });

  test('treats empty session payload as unauthenticated', async () => {
    const initialToken = makeJwt(3600);
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => ({ data: {}, isPending: false }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current!({ forceRefreshToken: false });
    });

    expect(fetched).toBeNull();
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('treats user-only payload as unauthenticated when session object is missing', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => ({
        data: { user: { id: 'user-1' } },
        isPending: false,
      }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current!({ forceRefreshToken: false });
    });

    expect(fetched).toBeNull();
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  describe('onTokenIdentityChange', () => {
    type FetchToken = (args: {
      forceRefreshToken: boolean;
    }) => Promise<string | null>;

    const identityJwt = (sub: string, sessionId: string, expSeconds = 3600) => {
      const payload = btoa(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + expSeconds,
          sessionId,
          sub,
        })
      );
      return `x.${payload}.z`;
    };

    const fetchWithAct = async (
      fetchToken: FetchToken,
      forceRefreshToken: boolean
    ) => {
      let token: string | null = null;
      await act(async () => {
        token = await fetchToken({ forceRefreshToken });
      });
      return token;
    };

    const guardHarness = ({
      guard,
      refreshed,
      throws = false,
    }: {
      guard: boolean;
      refreshed: string;
      throws?: boolean;
    }) => {
      let fetchToken:
        | ((args: { forceRefreshToken: boolean }) => Promise<string | null>)
        | null = null;
      const close = mock(async () => {});
      const client = {
        setAuth: (fetcher: typeof fetchToken) => {
          fetchToken = fetcher;
        },
        clearAuth: () => {},
        close,
      };
      const authClient = {
        useSession: () => ({ data: null, isPending: true }),
        convex: { token: async () => ({ data: { token: refreshed } }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const onTokenIdentityChange = mock(() => {
        if (throws) throw new Error('identity callback failed');
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthProvider
          authClient={authClient as any}
          client={client as any}
          initialToken={identityJwt('user_a', 'session_a')}
          onTokenIdentityChange={guard ? onTokenIdentityChange : undefined}
        >
          {children}
        </ConvexAuthProvider>
      );
      renderHook(() => useAuth(), { wrapper });
      return {
        close,
        onTokenIdentityChange,
        fetch: (forceRefreshToken: boolean) => {
          if (!fetchToken) throw new Error('setAuth was not called');
          return fetchWithAct(fetchToken, forceRefreshToken);
        },
      };
    };

    const flush = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

    test("the reviewer's sequence: SSR token A near expiry, the first fetch returns B", async () => {
      let fetchToken:
        | ((args: { forceRefreshToken: boolean }) => Promise<string | null>)
        | null = null;
      const close = mock(async () => {});
      const client = {
        setAuth: (fetcher: typeof fetchToken) => {
          fetchToken = fetcher;
        },
        clearAuth: () => {},
        close,
      };
      const tokenForB = identityJwt('user_b', 'session_b');
      const authClient = {
        useSession: () => ({
          data: { session: { id: 'session_a' }, user: { id: 'user_a' } },
          isPending: false,
        }),
        convex: { token: async () => ({ data: { token: tokenForB } }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const onTokenIdentityChange = mock(() => {});
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthProvider
          authClient={authClient as any}
          client={client as any}
          initialToken={identityJwt('user_a', 'session_a', 30)}
          onTokenIdentityChange={onTokenIdentityChange}
        >
          {children}
        </ConvexAuthProvider>
      );
      const { result } = renderHook(() => useAuthStore(), { wrapper });
      await flush();
      if (!fetchToken) throw new Error('setAuth was not called');

      expect(await fetchWithAct(fetchToken, false)).toBeNull();
      expect(onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(result.current.get('token')).not.toBe(tokenForB);
      expect(await fetchWithAct(fetchToken, true)).toBeNull();
    });

    test('no SSR token: the first token a sign-in obtains sets the identity', async () => {
      let fetchToken:
        | ((args: { forceRefreshToken: boolean }) => Promise<string | null>)
        | null = null;
      const close = mock(async () => {});
      const client = {
        setAuth: (fetcher: typeof fetchToken) => {
          fetchToken = fetcher;
        },
        clearAuth: () => {},
        close,
      };
      const tokenForC = identityJwt('user_c', 'session_c');
      const authClient = {
        useSession: () => ({
          data: { session: { id: 'session_c' }, user: { id: 'user_c' } },
          isPending: false,
        }),
        convex: { token: async () => ({ data: { token: tokenForC } }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const onTokenIdentityChange = mock(() => {});
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthProvider
          authClient={authClient as any}
          client={client as any}
          onTokenIdentityChange={onTokenIdentityChange}
        >
          {children}
        </ConvexAuthProvider>
      );
      renderHook(() => useAuth(), { wrapper });
      await flush();
      if (!fetchToken) throw new Error('setAuth was not called');

      expect(await fetchWithAct(fetchToken, false)).toBe(tokenForC);
      expect(onTokenIdentityChange).toHaveBeenCalledTimes(0);
      expect(close).toHaveBeenCalledTimes(0);
    });

    test('never hands Convex a token for another user or session', async () => {
      const harness = guardHarness({
        guard: true,
        refreshed: identityJwt('user_b', 'session_b'),
      });
      await flush();

      expect(await harness.fetch(false)).not.toBeNull();
      expect(await harness.fetch(true)).toBeNull();
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(harness.close).toHaveBeenCalledTimes(1);
    });

    test('closes the client even when the identity-change callback throws', async () => {
      const harness = guardHarness({
        guard: true,
        refreshed: identityJwt('user_b', 'session_b'),
        throws: true,
      });
      await flush();

      expect(await harness.fetch(false)).not.toBeNull();
      expect(await harness.fetch(true)).toBeNull();
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(harness.close).toHaveBeenCalledTimes(1);
    });

    test('passes a refreshed token for the same session through', async () => {
      const refreshed = identityJwt('user_a', 'session_a', 7200);
      const harness = guardHarness({ guard: true, refreshed });
      await flush();

      await harness.fetch(false);
      expect(await harness.fetch(true)).toBe(refreshed);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
      expect(harness.close).toHaveBeenCalledTimes(0);
    });

    describe('tokenIdentityBaseline', () => {
      const remount = ({
        baseline,
        obtained,
      }: {
        baseline: string | null | undefined;
        obtained: string;
      }) => {
        let fetchToken:
          | ((args: { forceRefreshToken: boolean }) => Promise<string | null>)
          | null = null;
        const close = mock(async () => {});
        const client = {
          setAuth: (fetcher: typeof fetchToken) => {
            fetchToken = fetcher;
          },
          clearAuth: () => {},
          close,
        };
        const authClient = {
          useSession: () => ({
            data: { session: { id: 'session' }, user: { id: 'user' } },
            isPending: false,
          }),
          convex: { token: async () => ({ data: { token: obtained } }) },
          getSession: async () => null,
          updateSession: () => {},
          crossDomain: {
            oneTimeToken: { verify: async () => ({ data: {} }) },
          },
        };
        const onTokenIdentityChange = mock(() => {});
        const wrapper = ({ children }: { children: ReactNode }) => (
          <ConvexAuthProvider
            authClient={authClient as any}
            client={client as any}
            onTokenIdentityChange={onTokenIdentityChange}
            tokenIdentityBaseline={baseline}
          >
            {children}
          </ConvexAuthProvider>
        );
        renderHook(() => useAuth(), { wrapper });
        return {
          close,
          onTokenIdentityChange,
          fetch: (forceRefreshToken: boolean) => {
            if (!fetchToken) throw new Error('setAuth was not called');
            return fetchWithAct(fetchToken, forceRefreshToken);
          },
        };
      };

      test('a remount without a token refuses a first token of another identity', async () => {
        const harness = remount({
          baseline: 'user_a|session_a',
          obtained: identityJwt('user_b', 'session_b'),
        });
        await flush();

        expect(await harness.fetch(false)).toBeNull();
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(await harness.fetch(true)).toBeNull();
      });

      test('a remount without a token admits a token of the same identity', async () => {
        const sameSession = identityJwt('user_a', 'session_a');
        const harness = remount({
          baseline: 'user_a|session_a',
          obtained: sameSession,
        });
        await flush();

        expect(await harness.fetch(false)).toBe(sameSession);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
        expect(harness.close).toHaveBeenCalledTimes(0);
      });

      test('without a baseline the first token obtained sets the identity, as before', async () => {
        const first = identityJwt('user_b', 'session_b');
        for (const baseline of [undefined, null]) {
          const harness = remount({ baseline, obtained: first });
          await flush();

          expect(await harness.fetch(false)).toBe(first);
          expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
          expect(harness.close).toHaveBeenCalledTimes(0);
        }
      });
    });

    describe('tokenIdentityBaseline getter and onTokenIdentityAdmitted', () => {
      const documentHarness = ({
        getter = true,
        guard = true,
        identity,
        obtained,
      }: {
        getter?: boolean;
        guard?: boolean;
        identity: string | null;
        obtained: string[];
      }) => {
        let fetchToken:
          | ((args: { forceRefreshToken: boolean }) => Promise<string | null>)
          | null = null;
        const setAuth = mock((fetcher: typeof fetchToken) => {
          fetchToken = fetcher;
        });
        const close = mock(async () => {});
        const client = { setAuth, clearAuth: () => {}, close };
        const queue = [...obtained];
        const convexToken = mock(async () => ({
          data: { token: queue.shift() ?? null },
        }));
        const authClient = {
          useSession: () => ({
            data: { session: { id: 'session' }, user: { id: 'user' } },
            isPending: false,
          }),
          convex: { token: convexToken },
          getSession: async () => null,
          updateSession: () => {},
          crossDomain: {
            oneTimeToken: { verify: async () => ({ data: {} }) },
          },
        };
        const document = { identity };
        const readBaseline = mock(() => document.identity);
        const onTokenIdentityChange = mock(() => {});
        const onTokenIdentityAdmitted = mock((_token: string) => {});
        const Provider = ({
          children,
          onAdmitted,
        }: {
          children: ReactNode;
          onAdmitted: (token: string) => void;
        }) => (
          <ConvexAuthProvider
            authClient={authClient as any}
            client={client as any}
            onTokenIdentityAdmitted={onAdmitted}
            onTokenIdentityChange={guard ? onTokenIdentityChange : undefined}
            tokenIdentityBaseline={getter ? readBaseline : identity}
          >
            {children}
          </ConvexAuthProvider>
        );
        let onAdmitted: (token: string) => void = onTokenIdentityAdmitted;
        const view = renderHook(() => useAuth(), {
          wrapper: ({ children }: { children: ReactNode }) => (
            <Provider onAdmitted={onAdmitted}>{children}</Provider>
          ),
        });
        return {
          close,
          convexToken,
          document,
          onTokenIdentityAdmitted,
          onTokenIdentityChange,
          readBaseline,
          setAuth,
          fetch: (forceRefreshToken: boolean) => {
            if (!fetchToken) throw new Error('setAuth was not called');
            return fetchWithAct(fetchToken, forceRefreshToken);
          },
          replaceOnAdmitted: (next: (token: string) => void) => {
            onAdmitted = next;
            view.rerender();
          },
        };
      };

      test('the getter is read at admission, not at mount: a remount refuses a token of another identity', async () => {
        const harness = documentHarness({
          identity: null,
          obtained: [identityJwt('user_b', 'session_b')],
        });
        await flush();
        expect(harness.readBaseline).toHaveBeenCalledTimes(0);
        harness.document.identity = 'user_a|session_a';

        expect(await harness.fetch(false)).toBeNull();
        expect(harness.readBaseline).toHaveBeenCalled();
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityAdmitted).toHaveBeenCalledTimes(0);
        expect(await harness.fetch(true)).toBeNull();
      });

      test('the getter current identity owns the first admission', async () => {
        const tokenForB = identityJwt('user_b', 'session_b');
        const harness = documentHarness({
          identity: 'user_a|session_a',
          obtained: [tokenForB],
        });
        await flush();
        expect(harness.readBaseline).toHaveBeenCalledTimes(0);
        harness.document.identity = 'user_b|session_b';

        expect(await harness.fetch(false)).toBe(tokenForB);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
        expect(harness.close).toHaveBeenCalledTimes(0);
      });

      test('a cached token is refused once the document moved to another identity', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const harness = documentHarness({
          identity: 'user_a|session_a',
          obtained: [tokenForA],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(tokenForA);
        harness.document.identity = 'user_b|session_b';

        expect(await harness.fetch(false)).toBeNull();
        expect(harness.convexToken).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityAdmitted).toHaveBeenCalledTimes(1);
      });

      test('a getter answering null does not constrain; the guard keeps the identity it admitted', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const harness = documentHarness({
          identity: null,
          obtained: [tokenForA, identityJwt('user_b', 'session_b')],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(tokenForA);
        expect(await harness.fetch(true)).toBeNull();
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityAdmitted.mock.calls).toEqual([
          [tokenForA],
        ]);
      });

      test('onTokenIdentityAdmitted hears every admitted token once, cached ones included', async () => {
        const first = identityJwt('user_a', 'session_a');
        const refreshed = identityJwt('user_a', 'session_a', 7200);
        const harness = documentHarness({
          identity: 'user_a|session_a',
          obtained: [first, refreshed],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(first);
        expect(await harness.fetch(false)).toBe(first);
        expect(await harness.fetch(true)).toBe(refreshed);
        expect(harness.convexToken).toHaveBeenCalledTimes(2);
        expect(harness.onTokenIdentityAdmitted.mock.calls).toEqual([
          [first],
          [first],
          [refreshed],
        ]);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
      });

      test('onTokenIdentityAdmitted is never called for a refused token, nor after the guard tripped', async () => {
        const harness = documentHarness({
          getter: false,
          identity: 'user_a|session_a',
          obtained: [
            identityJwt('user_b', 'session_b'),
            identityJwt('user_a', 'session_a'),
          ],
        });
        await flush();

        expect(await harness.fetch(false)).toBeNull();
        expect(await harness.fetch(true)).toBeNull();
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityAdmitted).toHaveBeenCalledTimes(0);
      });

      test('a new onTokenIdentityAdmitted is used without handing Convex a new fetcher', async () => {
        const token = identityJwt('user_a', 'session_a');
        const harness = documentHarness({
          identity: 'user_a|session_a',
          obtained: [token],
        });
        await flush();
        const setAuthCalls = harness.setAuth.mock.calls.length;
        const next = mock((_token: string) => {});
        harness.replaceOnAdmitted(next);
        await flush();

        expect(await harness.fetch(false)).toBe(token);
        expect(harness.setAuth).toHaveBeenCalledTimes(setAuthCalls);
        expect(next.mock.calls).toEqual([[token]]);
        expect(harness.onTokenIdentityAdmitted).toHaveBeenCalledTimes(0);
      });

      test('onTokenIdentityAdmitted needs onTokenIdentityChange', async () => {
        const token = identityJwt('user_b', 'session_b');
        const harness = documentHarness({
          guard: false,
          identity: 'user_a|session_a',
          obtained: [token],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(token);
        expect(harness.onTokenIdentityAdmitted).toHaveBeenCalledTimes(0);
        expect(harness.close).toHaveBeenCalledTimes(0);
      });
    });

    test('changes nothing without the option', async () => {
      const refreshed = identityJwt('user_b', 'session_b');
      const harness = guardHarness({ guard: false, refreshed });
      await flush();

      await harness.fetch(false);
      expect(await harness.fetch(true)).toBe(refreshed);
      expect(harness.close).toHaveBeenCalledTimes(0);
    });
  });

  describe('optimisticAuth', () => {
    const optimisticHarness = (
      initialToken: string,
      optimisticAuth: boolean
    ) => {
      let reportAuth: ((isAuthenticated: boolean) => void) | null = null;
      const client = {
        setAuth: (_fetchToken: unknown, onChange: (value: boolean) => void) => {
          reportAuth = onChange;
        },
        clearAuth: () => {},
      };
      const authClient = {
        useSession: () => ({ data: null, isPending: true }),
        convex: { token: async () => ({ data: {} }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthProvider
          authClient={authClient as any}
          client={client as any}
          initialToken={initialToken}
          optimisticAuth={optimisticAuth}
        >
          {children}
        </ConvexAuthProvider>
      );
      const hook = renderHook(
        () => ({ auth: useAuth(), store: useAuthStore() }),
        { wrapper }
      );
      return { ...hook, report: (value: boolean) => reportAuth?.(value) };
    };

    const flush = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

    test('opens the gate on a held, unexpired JWT before Convex confirms it', async () => {
      const { result } = optimisticHarness(makeJwt(3600), true);
      await flush();

      expect(result.current.auth.isLoading).toBe(false);
      expect(result.current.auth.isAuthenticated).toBe(true);
    });

    test('waits for the confirmation without the option', async () => {
      const { result } = optimisticHarness(makeJwt(3600), false);
      await flush();

      expect(result.current.auth.isLoading).toBe(true);
      expect(result.current.auth.isAuthenticated).toBe(false);
    });

    test('keeps the gate closed for an expired JWT', async () => {
      const { result } = optimisticHarness(makeJwt(-10), true);
      await flush();

      expect(result.current.auth.isLoading).toBe(true);
      expect(result.current.auth.isAuthenticated).toBe(false);
    });

    test('a refused token closes the gate and never reopens it', async () => {
      const { result, report } = optimisticHarness(makeJwt(3600), true);
      await flush();
      expect(result.current.auth.isAuthenticated).toBe(true);

      await act(async () => report(false));

      expect(result.current.auth.isAuthenticated).toBe(false);
      expect(result.current.auth.isLoading).toBe(true);

      await act(async () => {
        result.current.store.set('isLoading', true);
      });
      await flush();
      expect(result.current.auth.isAuthenticated).toBe(false);
    });

    test('the confirmed state takes over once Convex confirms', async () => {
      const { result, report } = optimisticHarness(makeJwt(3600), true);
      await flush();

      await act(async () => report(true));

      expect(result.current.auth.isLoading).toBe(false);
      expect(result.current.auth.isAuthenticated).toBe(true);
    });
  });

  describe('identity guard admission', () => {
    const identityJwt = (sub: string, sessionId: string, expSeconds = 3600) =>
      `x.${btoa(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + expSeconds,
          sessionId,
          sub,
        })
      )}.z`;
    const claim = (token: string) => {
      const payload = JSON.parse(atob(token.split('.')[1]!));
      return `${payload.sub}|${payload.sessionId}`;
    };

    type Binding = {
      fetchToken: (args: {
        forceRefreshToken: boolean;
      }) => Promise<string | null>;
      onChange: (isAuthenticated: boolean) => void;
    };

    /**
     * A Convex client stub that records every binding (the fetcher and
     * confirmation callback Convex receives), so a test drives the real
     * confirmation transitions. Several providers may share one.
     */
    const makeConvexClient = () => {
      const bindings: Binding[] = [];
      const close = mock(async () => {});
      const client = {
        setAuth: (
          fetchToken: Binding['fetchToken'],
          onChange: Binding['onChange']
        ) => {
          bindings.push({ fetchToken, onChange });
        },
        clearAuth: () => {},
        close,
      };
      return { bindings, client, close };
    };

    /**
     * A provider over `convex` (a fresh client stub by default). `tokens` are
     * what the token endpoint answers, in order.
     */
    const convexHarness = ({
      authClientExtras = {},
      baseline,
      baselineHolder,
      convex = makeConvexClient(),
      extraHook = () => null,
      guard = true,
      guardHolder,
      initialToken,
      onTokenIdentityAdmitted,
      onTokenIdentityChange = mock(() => {}),
      optimisticAuth = false,
      persistedSessionAnswer = { data: null, error: null },
      session = 'active',
      sessionRef = { current: session },
      tokenEndpoint,
      tokens = [],
    }: {
      authClientExtras?: Record<string, unknown>;
      baseline?: string | null | (() => string | null);
      /** A baseline prop the test changes; rerender the harness after. */
      baselineHolder?: { current: string | null };
      convex?: Pick<
        ReturnType<typeof makeConvexClient>,
        'bindings' | 'client' | 'close'
      >;
      extraHook?: () => unknown;
      guard?: boolean;
      /** Guardedness the test changes; rerender the harness after. */
      guardHolder?: { current: boolean };
      initialToken?: string;
      onTokenIdentityAdmitted?: (token: string) => void;
      onTokenIdentityChange?: () => void;
      optimisticAuth?: boolean;
      persistedSessionAnswer?: unknown;
      session?: 'active' | 'none' | 'pending';
      /** Mutable session state; rerender the harness after changing it. */
      sessionRef?: { current: 'active' | 'none' | 'pending' };
      /** Replaces the `tokens` queue, e.g. to hold a request in flight. */
      tokenEndpoint?: () => Promise<{ data: { token: string | null } }>;
      tokens?: Array<string | null>;
    }) => {
      const { bindings, client, close } = convex;
      const queue = [...tokens];
      const convexToken = mock(
        tokenEndpoint ??
          (async () => ({
            data: { token: queue.shift() ?? null },
          }))
      );
      const getSession = mock(async () => null);
      const $fetch = mock(
        async (..._args: unknown[]) => persistedSessionAnswer
      );
      const sessionResults = {
        active: {
          data: { session: { id: 'session' }, user: { id: 'user' } },
          isPending: false,
        },
        none: { data: null, isPending: false },
        pending: { data: null, isPending: true },
      };
      const authClient = {
        useSession: () => sessionResults[sessionRef.current],
        convex: { token: convexToken },
        getSession,
        $fetch,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
        ...authClientExtras,
      };
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthProvider
          authClient={authClient as any}
          client={client as any}
          initialToken={initialToken}
          onTokenIdentityAdmitted={onTokenIdentityAdmitted}
          onTokenIdentityChange={
            (guardHolder ? guardHolder.current : guard)
              ? onTokenIdentityChange
              : undefined
          }
          optimisticAuth={optimisticAuth}
          tokenIdentityBaseline={
            baselineHolder ? baselineHolder.current : baseline
          }
        >
          {children}
        </ConvexAuthProvider>
      );
      let recovery: ReturnType<typeof useConvexAuthRecovery> | undefined;
      const view = renderHook(
        () => {
          recovery = useConvexAuthRecovery();
          return { auth: useAuth(), extra: extraHook(), store: useAuthStore() };
        },
        { wrapper }
      );
      const latest = () => {
        const binding = bindings.at(-1);
        if (!binding) throw new Error('setAuth was not called');
        return binding;
      };
      return {
        $fetch,
        bindings,
        close,
        convexToken,
        getSession,
        onTokenIdentityChange,
        rerender: () => view.rerender(),
        result: view.result,
        unmount: view.unmount,
        fetch: async (forceRefreshToken: boolean) => {
          let token: string | null = null;
          await act(async () => {
            token = await latest().fetchToken({ forceRefreshToken });
          });
          return token;
        },
        recover: async () => {
          const before = bindings.length;
          await act(async () => {
            void recovery!.recover({ timeoutMs: 1000 }).catch(() => {});
          });
          await waitFor(() => {
            expect(bindings.length).toBeGreaterThan(before);
          });
        },
        report: (isAuthenticated: boolean) =>
          act(async () => {
            latest().onChange(isAuthenticated);
          }),
      };
    };

    const flush = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

    test('a held SSR token of another identity never opens the optimistic gate and trips the guard', async () => {
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        initialToken: identityJwt('user_b', 'session_b'),
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(harness.result.current.store.get('token')).toBeNull();
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(harness.close).toHaveBeenCalledTimes(1);
      // With the token withheld and the session pending, Convex is not even
      // bound yet: it is never handed the refused token.
      expect(harness.bindings).toHaveLength(0);
    });

    test('a held SSR token of the baseline identity still opens the optimistic gate', async () => {
      const token = identityJwt('user_a', 'session_a');
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(harness.result.current.store.get('token')).toBe(token);
      expect(harness.result.current.auth.isAuthenticated).toBe(true);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
    });

    test('a token seeded into the store opens the optimistic gate only if the guard admits it', async () => {
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      await act(async () => {
        harness.result.current.store.set(
          'token',
          identityJwt('user_a', 'session_a')
        );
      });
      expect(harness.result.current.auth.isAuthenticated).toBe(true);

      // The gate admits through the one admission: another identity is
      // refused there and trips the page.
      await act(async () => {
        harness.result.current.store.set(
          'token',
          identityJwt('user_b', 'session_b')
        );
      });
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
      expect(isDocumentTripped()).toBe(true);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('an opaque persisted session token is not restored while an identity is established', async () => {
      writeAuthSessionFallbackToken('opaque-session-token');
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        session: 'none',
      });
      await flush();

      expect(harness.getSession).toHaveBeenCalledTimes(0);
      expect(harness.$fetch).toHaveBeenCalledTimes(0);
      expect(harness.result.current.store.get('token')).toBeNull();
    });

    test('a persisted JWT of the established identity is restored', async () => {
      const tokenForA = identityJwt('user_a', 'session_a');
      writeAuthSessionFallbackToken(tokenForA);
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        persistedSessionAnswer: {
          data: { session: { id: 'session_a' }, user: { id: 'user_a' } },
          error: null,
        },
        session: 'none',
      });
      await flush();

      expect(harness.$fetch).toHaveBeenCalledTimes(1);
      expect(harness.$fetch.mock.calls[0]![1]).toMatchObject({
        headers: { Authorization: `Bearer ${tokenForA}` },
      });
      expect(harness.result.current.store.get('token')).toBe(tokenForA);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
    });

    test('a persisted JWT of another identity is not restored', async () => {
      writeAuthSessionFallbackToken(identityJwt('user_b', 'session_b'));
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        session: 'none',
      });
      await flush();

      expect(harness.$fetch).toHaveBeenCalledTimes(0);
      expect(harness.result.current.store.get('token')).toBeNull();
    });

    test('concurrent first tokens: the losing identity is never cached', async () => {
      const document: { identity: string | null } = { identity: null };
      const claimDocument = (token: string) => {
        document.identity ??= claim(token);
      };
      const tokenForA = identityJwt('user_a', 'session_a');
      const tokenForB = identityJwt('user_b', 'session_b');
      const first = convexHarness({
        baseline: () => document.identity,
        onTokenIdentityAdmitted: claimDocument,
        tokens: [tokenForA],
      });
      const second = convexHarness({
        baseline: () => document.identity,
        onTokenIdentityAdmitted: claimDocument,
        tokens: [tokenForB],
      });
      await flush();
      const published: Array<string | null> = [];
      const unsubscribe = second.result.current.store.subscribe(
        'token',
        (value: string | null) => {
          published.push(value);
        }
      );

      let results: Array<string | null> = [];
      await act(async () => {
        results = await Promise.all([
          first.bindings.at(-1)!.fetchToken({ forceRefreshToken: false }),
          second.bindings.at(-1)!.fetchToken({ forceRefreshToken: false }),
        ]);
      });
      unsubscribe();

      // B is refused before it is ever cached. Its refusal trips the
      // document, so the first provider's hand-out answers null too.
      expect(results).toEqual([null, null]);
      expect(published).not.toContain(tokenForB);
      // The trip reaches every mounted guarded provider once.
      expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(first.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('a trip publishes a terminal unauthenticated state that Convex cannot reopen', async () => {
      const harness = convexHarness({
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      expect(await harness.fetch(false)).not.toBeNull();
      await harness.report(true);
      expect(harness.result.current.store.get('isAuthenticated')).toBe(true);

      expect(await harness.fetch(true)).toBeNull();

      expect(harness.result.current.store.get('token')).toBeNull();
      expect(harness.result.current.store.get('isAuthenticated')).toBe(false);
      expect(harness.result.current.store.get('isLoading')).toBe(false);
      await harness.report(true);
      expect(harness.result.current.store.get('isAuthenticated')).toBe(false);
    });

    test('a later provider over a tripped client starts tripped and still reports the trip once', async () => {
      const convex = makeConvexClient();
      const first = convexHarness({
        convex,
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      await first.fetch(false);
      expect(await first.fetch(true)).toBeNull();
      first.unmount();

      // A remount in the same document, over the same (closed) client.
      const second = convexHarness({
        baseline: 'user_a|session_a',
        convex,
        initialToken: identityJwt('user_a', 'session_a'),
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(second.result.current.store.get('token')).toBeNull();
      expect(second.result.current.auth.isAuthenticated).toBe(false);
      // A guarded provider joining a page tripped earlier reports the trip
      // too, so the app learns of a trip even one that happened while no
      // guarded provider was mounted (once; a rerender does not report it
      // again).
      expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(convex.close).toHaveBeenCalledTimes(2);
      second.rerender();
      await flush();
      expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('a sign-in on a tripped document surfaces an error and publishes nothing', async () => {
      const signedIn = identityJwt('user_a', 'session_a', 7200);
      const authClientExtras = {
        signIn: { email: async () => ({ data: { token: signedIn } }) },
      };
      const mutations = createAuthMutations(authClientExtras as any);
      const harness = convexHarness({
        authClientExtras,
        extraHook: () => mutations.useSignInMutationOptions(),
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      await harness.fetch(false);
      expect(await harness.fetch(true)).toBeNull();

      const published: unknown[] = [];
      const store = harness.result.current.store;
      const unsubscribeAuth = store.subscribe(
        'isAuthenticated',
        (value: boolean) => published.push(value)
      );
      const unsubscribeToken = store.subscribe(
        'token',
        (value: string | null) => published.push(value)
      );
      const options = harness.result.current.extra as {
        mutationFn: (args: unknown) => Promise<unknown>;
      };
      let failure: unknown;
      await act(async () => {
        failure = await options
          .mutationFn({ email: 'a@example.invalid', password: 'x' })
          .then(
            () => null,
            (error: unknown) => error
          );
      });
      unsubscribeAuth();
      expect(failure).toBeInstanceOf(AuthMutationError);
      expect((failure as AuthMutationError).code).toBe(
        'TOKEN_IDENTITY_CHANGED'
      );
      unsubscribeToken();

      expect(published).not.toContain(true);
      expect(published).not.toContain(signedIn);
      expect(store.get('isAuthenticated')).toBe(false);
      expect(store.get('token')).toBeNull();
    });

    test('nothing writes a token back after a trip, not even the hydration fallback', async () => {
      const tokenForA = identityJwt('user_a', 'session_a');
      const harness = convexHarness({
        initialToken: tokenForA,
        session: 'pending',
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();

      expect(await harness.fetch(true)).toBeNull();
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(harness.result.current.store.get('token')).toBeNull();
      expect(harness.result.current.store.get('isAuthenticated')).toBe(false);
    });

    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    test('an in-flight fetch in an unguarded provider hands out nothing after a trip', async () => {
      const response = deferred<{ data: { token: string | null } }>();
      const unguarded = convexHarness({
        guard: false,
        tokenEndpoint: () => response.promise,
      });
      const guarded = convexHarness({
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      let pending!: Promise<string | null>;
      act(() => {
        pending = unguarded.bindings.at(-1)!.fetchToken({
          forceRefreshToken: true,
        });
      });
      await guarded.fetch(false);
      expect(await guarded.fetch(true)).toBeNull();

      let handedOut: string | null = 'unset';
      await act(async () => {
        response.resolve({ data: { token: makeJwt(3600) } });
        handedOut = await pending;
      });
      expect(handedOut).toBeNull();
      expect(unguarded.result.current.store.get('token')).toBeNull();
    });

    const signInCases = [
      ['sign-in', 'email'],
      ['social sign-in', 'social'],
      ['sign-up', 'signUp'],
    ] as const;

    test('a trip during a sign-in, sign-up or social sign-in fails it before anything is published', async () => {
      for (const [, method] of signInCases) {
        resetDocumentTripForTests();
        const tokenForA = identityJwt('user_a', 'session_a', 7200);
        const session = deferred<unknown>();
        const authClientExtras = {
          getSession: () => session.promise,
          signIn: {
            email: async () => ({ data: { token: tokenForA } }),
            social: async () => ({ data: { token: tokenForA } }),
          },
          signUp: { email: async () => ({ data: { token: tokenForA } }) },
        };
        const mutations = createAuthMutations(authClientExtras as any);
        const useSignInHooks = () => ({
          email: mutations.useSignInMutationOptions(),
          signUp: mutations.useSignUpMutationOptions(),
          social: mutations.useSignInSocialMutationOptions(),
        });
        const harness = convexHarness({
          authClientExtras,
          extraHook: useSignInHooks,
          initialToken: identityJwt('user_a', 'session_a'),
        });
        await flush();
        const store = harness.result.current.store;
        const published: unknown[] = [];
        const unsubscribe = store.subscribe(
          'isAuthenticated',
          (value: boolean) => published.push(value)
        );
        const hooks = harness.result.current.extra as Record<
          string,
          { mutationFn: (args: unknown) => Promise<unknown> }
        >;
        let outcome!: Promise<unknown>;
        act(() => {
          outcome = hooks[method]!.mutationFn({}).then(
            () => null,
            (error: unknown) => error
          );
        });
        let failure: unknown;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
          tripDocument();
          session.resolve({ data: null });
          failure = await outcome;
        });
        unsubscribe();

        expect((failure as AuthMutationError)?.code).toBe(
          'TOKEN_IDENTITY_CHANGED'
        );
        expect(published).not.toContain(true);
        harness.unmount();
      }
    });

    test('waiting for auth after a sign-in fails at once when the document trips', async () => {
      const authClientExtras = {
        signIn: { email: async () => ({ data: {} }) },
      };
      const mutations = createAuthMutations(authClientExtras as any);
      const harness = convexHarness({
        authClientExtras,
        extraHook: () => mutations.useSignInMutationOptions(),
      });
      await flush();
      const options = harness.result.current.extra as {
        mutationFn: (args: unknown) => Promise<unknown>;
      };
      const started = Date.now();
      let outcome!: Promise<unknown>;
      act(() => {
        outcome = options.mutationFn({}).then(
          () => null,
          (error: unknown) => error
        );
      });
      let failure: unknown;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
        tripDocument();
        failure = await outcome;
      });

      expect((failure as AuthMutationError)?.code).toBe(
        'TOKEN_IDENTITY_CHANGED'
      );
      expect(Date.now() - started).toBeLessThan(2000);
    }, 10_000);

    test('a JWT a sign-in returns for another identity is refused and trips the document', async () => {
      const tokenForB = identityJwt('user_b', 'session_b', 7200);
      const authClientExtras = {
        signIn: { email: async () => ({ data: { token: tokenForB } }) },
      };
      const mutations = createAuthMutations(authClientExtras as any);
      const harness = convexHarness({
        authClientExtras,
        extraHook: () => mutations.useSignInMutationOptions(),
        initialToken: identityJwt('user_a', 'session_a'),
      });
      await flush();
      const store = harness.result.current.store;
      const published: unknown[] = [];
      const unsubscribeToken = store.subscribe(
        'token',
        (value: string | null) => published.push(value)
      );
      const unsubscribeAuth = store.subscribe(
        'isAuthenticated',
        (value: boolean) => published.push(value)
      );
      const options = harness.result.current.extra as {
        mutationFn: (args: unknown) => Promise<unknown>;
      };
      let failure: unknown;
      await act(async () => {
        failure = await options.mutationFn({}).then(
          () => null,
          (error: unknown) => error
        );
      });
      unsubscribeToken();
      unsubscribeAuth();

      expect((failure as AuthMutationError)?.code).toBe(
        'TOKEN_IDENTITY_CHANGED'
      );
      expect(published).not.toContain(tokenForB);
      expect(published).not.toContain(true);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(store.get('token')).toBeNull();
    });

    test("a client's auth result reported before React commits still ends its optimistic window", async () => {
      for (const result of [false, true]) {
        const token = makeJwt(3600);
        const convex = makeConvexClient();
        const first = convexHarness({
          convex,
          guard: false,
          initialToken: token,
          optimisticAuth: true,
          session: 'pending',
        });
        await flush();
        act(() => {
          convex.bindings.at(-1)!.onChange(result);
          first.unmount();
        });

        const second = convexHarness({
          convex,
          guard: false,
          initialToken: token,
          optimisticAuth: true,
          session: 'pending',
        });
        await flush();
        expect(second.result.current.auth.isAuthenticated).toBe(false);
        second.unmount();
      }
    });

    test("one provider's refusal ends the optimistic window of another over the same client", async () => {
      const token = makeJwt(3600);
      const convex = makeConvexClient();
      const first = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      const second = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(first.result.current.auth.isAuthenticated).toBe(true);
      expect(second.result.current.auth.isAuthenticated).toBe(true);

      await act(async () => {
        convex.bindings[0]!.onChange(false);
      });
      await flush();

      expect(second.result.current.auth.isAuthenticated).toBe(false);
    });

    test('losing the local session does not end a fresh client optimistic window', async () => {
      const token = makeJwt(3600);
      const convex = makeConvexClient();
      const sessionRef = { current: 'active' as 'active' | 'none' | 'pending' };
      const first = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        sessionRef,
      });
      await flush();
      expect(first.result.current.auth.isAuthenticated).toBe(true);
      sessionRef.current = 'none';
      await act(async () => first.rerender());
      await flush();
      first.unmount();

      const second = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(second.result.current.auth.isAuthenticated).toBe(true);
    });

    test('the settlement wrapper is installed only with optimisticAuth, once', async () => {
      class StubClient {
        setAuth(_fetchToken: unknown, _onChange?: unknown) {}
        clearAuth() {}
        close = async () => {};
      }
      const authClient = {
        useSession: () => ({ data: null, isPending: true }),
        convex: { token: async () => ({ data: {} }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const mount = (client: StubClient, optimisticAuth: boolean) =>
        renderHook(() => useAuth(), {
          wrapper: ({ children }: { children: ReactNode }) => (
            <ConvexAuthProvider
              authClient={authClient as any}
              client={client as any}
              initialToken={makeJwt(3600)}
              optimisticAuth={optimisticAuth}
            >
              {children}
            </ConvexAuthProvider>
          ),
        });

      const plain = new StubClient();
      mount(plain, false);
      await flush();
      expect(Object.hasOwn(plain, 'setAuth')).toBe(false);
      expect(plain.setAuth).toBe(StubClient.prototype.setAuth);

      const optimistic = new StubClient();
      mount(optimistic, true);
      await flush();
      const wrapped = optimistic.setAuth;
      expect(Object.hasOwn(optimistic, 'setAuth')).toBe(true);
      mount(optimistic, true);
      await flush();
      expect(optimistic.setAuth).toBe(wrapped);
    });

    test('the Start loader hands no token to a fresh client after a trip', async () => {
      const tokenForB = identityJwt('user_b', 'session_b');
      const harness = convexHarness({
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [tokenForB],
      });
      await flush();
      await harness.fetch(false);
      expect(await harness.fetch(true)).toBeNull();

      const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
      const state = await syncConvexAuthForStartLoader({
        convex: fresh,
        getToken: async () => tokenForB,
      });

      expect(state).toEqual({ isAuthenticated: false, token: null });
      expect(fresh.setAuth).toHaveBeenCalledTimes(0);
    });

    test('the Start loader refuses a token of another identity than the document admitted', async () => {
      const harness = convexHarness({
        initialToken: identityJwt('user_a', 'session_a'),
      });
      await flush();
      expect(await harness.fetch(false)).not.toBeNull();

      const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
      let state: unknown;
      // Refusing trips the page, which quarantines the mounted provider.
      await act(async () => {
        state = await syncConvexAuthForStartLoader({
          convex: fresh,
          getToken: async () => identityJwt('user_b', 'session_b'),
        });
      });

      expect(state).toEqual({ isAuthenticated: false, token: null });
      expect(fresh.setAuth).toHaveBeenCalledTimes(0);
    });

    test('a trip in a descendant effect is not overwritten by a stale optimistic publication', async () => {
      const published: boolean[] = [];
      const useTripOnMount = () => {
        const store = useAuthStore();
        useEffect(() => {
          const unsubscribe = store.subscribe(
            'isAuthenticated',
            (value: boolean) => published.push(value)
          );
          tripDocument();
          return unsubscribe;
        }, [store]);
      };
      const harness = convexHarness({
        extraHook: useTripOnMount,
        guard: false,
        initialToken: makeJwt(3600),
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(published).not.toContain(true);
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
    });

    test('a settlement in a descendant effect is not overwritten by a stale optimistic publication', async () => {
      const first = makeJwt(3600);
      const second = makeJwt(3500);
      const convex = makeConvexClient();
      const published: boolean[] = [];
      const useSettleOnSecondToken = () => {
        const store = useAuthStore();
        const token = useAuthValue('token');
        useEffect(() => {
          if (token !== second) return;
          const unsubscribe = store.subscribe(
            'isAuthenticated',
            (value: boolean) => published.push(value)
          );
          convex.bindings.at(-1)!.onChange(false);
          // Published before AuthStateSync's effect in the same commit runs,
          // so a stale optimistic publication would show up as `true`.
          store.set('isAuthenticated', false);
          return unsubscribe;
        }, [store, token]);
      };
      const harness = convexHarness({
        convex,
        extraHook: useSettleOnSecondToken,
        guard: false,
        initialToken: first,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(true);

      await act(async () => {
        harness.result.current.store.set('token', second);
      });
      await flush();

      expect(published).not.toContain(true);
    });

    test('a sign-in fails if the document moved identity before authenticated is published', async () => {
      const document = { identity: 'user_a|session_a' };
      const tokenForA = identityJwt('user_a', 'session_a', 7200);
      const session = deferred<unknown>();
      const authClientExtras = {
        getSession: () => session.promise,
        signIn: { email: async () => ({ data: { token: tokenForA } }) },
      };
      const mutations = createAuthMutations(authClientExtras as any);
      const harness = convexHarness({
        authClientExtras,
        baseline: () => document.identity,
        extraHook: () => mutations.useSignInMutationOptions(),
      });
      await flush();
      const store = harness.result.current.store;
      const published: unknown[] = [];
      const unsubscribe = store.subscribe('isAuthenticated', (value: boolean) =>
        published.push(value)
      );
      const options = harness.result.current.extra as {
        mutationFn: (args: unknown) => Promise<unknown>;
      };
      let outcome!: Promise<unknown>;
      act(() => {
        outcome = options.mutationFn({}).then(
          () => null,
          (error: unknown) => error
        );
      });
      let failure: unknown;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        document.identity = 'user_b|session_b';
        session.resolve({ data: null });
        failure = await outcome;
      });
      unsubscribe();

      expect((failure as AuthMutationError)?.code).toBe(
        'TOKEN_IDENTITY_CHANGED'
      );
      expect(published).not.toContain(true);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('the Start loader refuses another identity before the provider fetches, from its baseline or held token', async () => {
      for (const setup of [
        { baseline: 'user_a|session_a' },
        { initialToken: identityJwt('user_a', 'session_a') },
      ]) {
        resetDocumentTripForTests();
        const harness = convexHarness({ ...setup, session: 'pending' });
        await flush();

        const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
        let state: unknown;
        // Refusing trips the page, which quarantines the mounted provider.
        await act(async () => {
          state = await syncConvexAuthForStartLoader({
            convex: fresh,
            getToken: async () => identityJwt('user_b', 'session_b'),
          });
        });

        expect(state).toEqual({ isAuthenticated: false, token: null });
        expect(fresh.setAuth).toHaveBeenCalledTimes(0);
        expect(isDocumentTripped()).toBe(true);
        harness.unmount();
      }
    });

    test('a client the Start loader authenticated gets no optimistic window; a fresh one does', async () => {
      const token = makeJwt(3600);
      const loaded = makeConvexClient();
      await syncConvexAuthForStartLoader({
        convex: loaded.client as any,
        getToken: async () => token,
      });
      const overLoaded = convexHarness({
        convex: loaded,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(overLoaded.result.current.auth.isAuthenticated).toBe(false);

      const fresh = convexHarness({
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(fresh.result.current.auth.isAuthenticated).toBe(true);
    });

    test('a trip from the Start loader calls the mounted guarded provider once', async () => {
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        session: 'pending',
      });
      await flush();

      await act(async () => {
        await syncConvexAuthForStartLoader({
          convex: { clearAuth: () => {}, setAuth: () => {} },
          getToken: async () => identityJwt('user_b', 'session_b'),
        });
      });

      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(harness.close).toHaveBeenCalledTimes(1);
    });

    test('a trip calls every mounted guarded provider once, even when one callback throws', async () => {
      const consoleError = spyOn(console, 'error').mockImplementation(() => {});
      try {
        const first = convexHarness({
          initialToken: identityJwt('user_a', 'session_a'),
          tokens: [identityJwt('user_b', 'session_b')],
        });
        const throwing = convexHarness({
          initialToken: identityJwt('user_a', 'session_a'),
          onTokenIdentityChange: mock(() => {
            throw new Error('callback failed');
          }),
        });
        const third = convexHarness({
          initialToken: identityJwt('user_a', 'session_a'),
        });
        await flush();
        await first.fetch(false);

        expect(await first.fetch(true)).toBeNull();

        for (const harness of [first, throwing, third]) {
          expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
          expect(harness.close).toHaveBeenCalledTimes(1);
        }
      } finally {
        consoleError.mockRestore();
      }
    });

    const claimsJwt = (claims: Record<string, unknown>) =>
      `x.${btoa(JSON.stringify(claims))}.z`;
    const foreignWithoutExpiry = [
      ['exp 0', claimsJwt({ exp: 0, sessionId: 'session_b', sub: 'user_b' })],
      ['no exp', claimsJwt({ sessionId: 'session_b', sub: 'user_b' })],
    ] as const;

    test('a JWT of another identity is refused whatever its exp: refresh and HTTP', async () => {
      for (const [, tokenForB] of foreignWithoutExpiry) {
        resetDocumentTripForTests();
        const harness = convexHarness({
          extraHook: useFetchAccessToken,
          initialToken: identityJwt('user_a', 'session_a'),
          tokens: [tokenForB],
        });
        await flush();
        const published: Array<string | null> = [];
        const unsubscribe = harness.result.current.store.subscribe(
          'token',
          (value: string | null) => published.push(value)
        );
        await harness.fetch(false);

        expect(await harness.fetch(true)).toBeNull();
        const httpFetcher = harness.result.current.extra as () => Promise<
          string | null
        >;
        let http: string | null = 'unset';
        await act(async () => {
          http = await httpFetcher();
        });
        unsubscribe();

        expect(http).toBeNull();
        expect(published).not.toContain(tokenForB);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        harness.unmount();
      }
    });

    test('a held SSR JWT of another identity is withheld whatever its exp', async () => {
      for (const [, tokenForB] of foreignWithoutExpiry) {
        resetDocumentTripForTests();
        const harness = convexHarness({
          baseline: 'user_a|session_a',
          initialToken: tokenForB,
          session: 'pending',
        });
        await flush();

        expect(harness.result.current.store.get('token')).toBeNull();
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        harness.unmount();
      }
    });

    test('a sign-in returning a JWT of another identity fails whatever its exp', async () => {
      for (const [, tokenForB] of foreignWithoutExpiry) {
        resetDocumentTripForTests();
        const authClientExtras = {
          signIn: { email: async () => ({ data: { token: tokenForB } }) },
        };
        const mutations = createAuthMutations(authClientExtras as any);
        const harness = convexHarness({
          authClientExtras,
          extraHook: () => mutations.useSignInMutationOptions(),
          initialToken: identityJwt('user_a', 'session_a'),
        });
        await flush();
        const options = harness.result.current.extra as {
          mutationFn: (args: unknown) => Promise<unknown>;
        };
        let failure: unknown;
        await act(async () => {
          failure = await options.mutationFn({}).then(
            () => null,
            (error: unknown) => error
          );
        });

        expect((failure as AuthMutationError)?.code).toBe(
          'TOKEN_IDENTITY_CHANGED'
        );
        expect(harness.result.current.store.get('token')).not.toBe(tokenForB);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        harness.unmount();
      }
    });

    test('the Start loader refuses a JWT of another identity whatever its exp', async () => {
      for (const [, tokenForB] of foreignWithoutExpiry) {
        resetDocumentTripForTests();
        const harness = convexHarness({
          baseline: 'user_a|session_a',
          session: 'pending',
        });
        await flush();
        const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
        let state: unknown;
        await act(async () => {
          state = await syncConvexAuthForStartLoader({
            convex: fresh,
            getToken: async () => tokenForB,
          });
        });

        expect(state).toEqual({ isAuthenticated: false, token: null });
        expect(fresh.setAuth).toHaveBeenCalledTimes(0);
        harness.unmount();
      }
    });

    test('a JWT without exp of the established identity is handed out but never opens the optimistic gate', async () => {
      const tokenForA = claimsJwt({ sessionId: 'session_a', sub: 'user_a' });
      const handedOut = convexHarness({
        baseline: 'user_a|session_a',
        tokens: [tokenForA],
      });
      await flush();
      expect(await handedOut.fetch(false)).toBe(tokenForA);
      expect(handedOut.onTokenIdentityChange).toHaveBeenCalledTimes(0);

      const held = convexHarness({
        baseline: 'user_a|session_a',
        initialToken: tokenForA,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();
      expect(held.result.current.auth.isAuthenticated).toBe(false);
    });

    test('with an identity established, a JWT without one is refused', async () => {
      const onTokenIdentityAdmitted = mock((_token: string) => {});
      const harness = convexHarness({
        baseline: 'user_a|session_a',
        onTokenIdentityAdmitted,
        tokens: [makeJwt(3600)],
      });
      await flush();

      expect(await harness.fetch(false)).toBeNull();
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      expect(onTokenIdentityAdmitted).toHaveBeenCalledTimes(0);
    });

    test('an admitted identity refuses a later JWT without one', async () => {
      const tokenForA = identityJwt('user_a', 'session_a');
      const harness = convexHarness({ tokens: [tokenForA, makeJwt(7200)] });
      await flush();

      expect(await harness.fetch(false)).toBe(tokenForA);
      expect(await harness.fetch(true)).toBeNull();
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('before any identity, a JWT without one is handed out and announced without setting it', async () => {
      const identityless = makeJwt(3600);
      const tokenForB = identityJwt('user_b', 'session_b', 7200);
      const onTokenIdentityAdmitted = mock((_token: string) => {});
      const harness = convexHarness({
        onTokenIdentityAdmitted,
        tokens: [identityless, tokenForB],
      });
      await flush();

      expect(await harness.fetch(false)).toBe(identityless);
      expect(await harness.fetch(true)).toBe(tokenForB);
      expect(onTokenIdentityAdmitted.mock.calls).toEqual([
        [identityless],
        [tokenForB],
      ]);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(0);
    });

    /**
     * A client whose auth runs through Convex's own AuthenticationManager, so
     * the SDK's transparent retry (refetch and re-authenticate after an auth
     * error) happens between the provider's token hand-outs and the single
     * refusal React finally sees. `refuse` is the server rejecting the token
     * it was last sent.
     */
    const makeManagedConvexClient = async () => {
      const entry = import.meta.resolve('convex/browser');
      const { AuthenticationManager } = await import(
        new URL('./sync/authentication_manager.js', entry).href
      );
      let authVersion = 0;
      let auth: string | null = null;
      const clear = () => {
        auth = null;
        authVersion += 1;
      };
      const syncState = {
        clearAuth: clear,
        getAuth: () => (auth ? { tokenType: 'User', value: auth } : undefined),
        hasAuth: () => auth !== null,
        isCurrentOrNewerAuthVersion: (version: number) =>
          version >= authVersion,
        isNewAuth: (value: string) => auth !== value,
        markAuthCompletion: () => {},
      };
      const quiet = () => {};
      const manager = new AuthenticationManager(
        syncState,
        {
          authenticate: (token: string) => {
            auth = token;
            authVersion += 1;
          },
          clearAuth: clear,
          pauseSocket: quiet,
          resumeSocket: quiet,
          stopSocket: async () => {},
          tryRestartSocket: quiet,
        },
        {
          initialAuthTokenReuse: false,
          logger: { error: quiet, log: quiet, logVerbose: quiet, warn: quiet },
          refreshTokenLeewaySeconds: 10,
        }
      );
      const bindings: Binding[] = [];
      const close = mock(async () => {});
      const client = {
        setAuth: (
          fetchToken: Binding['fetchToken'],
          onChange: Binding['onChange']
        ) => {
          bindings.push({ fetchToken, onChange });
          void manager.setConfig(fetchToken, onChange);
        },
        clearAuth: () => manager.stop(),
        close,
      };
      const refuse = () =>
        act(async () => {
          manager.onAuthError({
            authUpdateAttempted: true,
            baseVersion: authVersion - 1,
            error: 'invalid token',
            type: 'AuthError',
          });
          await new Promise((r) => setTimeout(r, 0));
        });
      // The server confirms the token it was last sent.
      const confirm = () =>
        act(async () => {
          manager.onTransition({
            clientClockSkew: 0,
            endVersion: { identity: authVersion },
            startVersion: { identity: authVersion - 1 },
          });
          await new Promise((r) => setTimeout(r, 0));
        });
      return { bindings, client, close, confirm, refuse };
    };

    test('a refused token after a prior confirmation never reopens the gate', async () => {
      const tokenA = makeJwt(3600);
      const tokenB = makeJwt(3500);
      // Under a minute left: the recovery fetch goes back to the endpoint.
      const tokenC = makeJwt(30);
      const convex = await makeManagedConvexClient();
      const harness = convexHarness({
        convex,
        guard: false,
        initialToken: tokenA,
        optimisticAuth: true,
        tokens: [tokenB, tokenC, null, tokenB],
      });
      await flush();
      // The server confirms A; Convex refreshes to B.
      await convex.confirm();
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(true);

      // The server refuses B; the SDK retries with C; the server refuses C.
      await convex.refuse();
      await convex.refuse();
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(false);

      // Recovery obtains B again while Convex confirms it.
      await harness.recover();
      await flush();
      expect(harness.result.current.store.get('token')).toBe(tokenB);
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
    });

    test('no number of refusals lets a refused token reopen the gate', async () => {
      const tokens = Array.from({ length: 17 }, (_, index) =>
        makeJwt(3600 - index)
      );
      const harness = convexHarness({
        guard: false,
        initialToken: tokens[0],
        optimisticAuth: true,
        tokens: [...tokens.slice(1), tokens[0]!],
      });
      await flush();
      expect(await harness.fetch(false)).toBe(tokens[0]);
      await harness.report(false);
      for (const token of tokens.slice(1)) {
        await harness.recover();
        expect(await harness.fetch(true)).toBe(token);
        await harness.report(false);
      }

      await harness.recover();
      expect(await harness.fetch(true)).toBe(tokens[0]);
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
    });

    test('a remount over a client that already reported auth gets no optimism', async () => {
      const token = makeJwt(3600);
      const convex = makeConvexClient();
      const first = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
      });
      await flush();
      expect(await first.fetch(false)).toBe(token);
      await first.report(true);
      first.unmount();

      const second = convexHarness({
        convex,
        guard: false,
        initialToken: token,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(second.result.current.auth.isAuthenticated).toBe(false);
      expect(second.result.current.auth.isLoading).toBe(true);
    });

    test('the Start loader holds a token to both the recorded page identity and the current getter', async () => {
      const document = { identity: 'user_a|session_a' };
      const readBaseline = mock(() => document.identity);
      const tokenForA = identityJwt('user_a', 'session_a');
      const harness = convexHarness({
        baseline: readBaseline,
        tokens: [tokenForA],
      });
      await flush();
      expect(await harness.fetch(false)).toBe(tokenForA);
      document.identity = 'user_b|session_b';
      readBaseline.mockClear();

      const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
      let state: unknown;
      await act(async () => {
        state = await syncConvexAuthForStartLoader({
          convex: fresh,
          getToken: async () => tokenForA,
        });
      });

      expect(state).toEqual({ isAuthenticated: false, token: null });
      expect(readBaseline).toHaveBeenCalled();
    });

    test('a sibling provider without a baseline cannot admit another identity after the page admitted one', async () => {
      const first = convexHarness({
        tokens: [identityJwt('user_a', 'session_a')],
      });
      const second = convexHarness({
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      expect(await first.fetch(false)).not.toBeNull();

      expect(await second.fetch(false)).toBeNull();
      expect(second.result.current.store.get('token')).toBeNull();
      expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('auth-state publication reads the held token at the write', async () => {
      const first = makeJwt(3600);
      const second = makeJwt(3500);
      const published: boolean[] = [];
      const useClearOnSecondToken = () => {
        const store = useAuthStore();
        const token = useAuthValue('token');
        useEffect(() => {
          if (token !== second) return;
          store.set('token', null);
          store.set('expiresAt', null);
          store.set('isAuthenticated', false);
          return store.subscribe('isAuthenticated', (value: boolean) =>
            published.push(value)
          );
        }, [store, token]);
      };
      const harness = convexHarness({
        extraHook: useClearOnSecondToken,
        guard: false,
        initialToken: first,
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      await act(async () => {
        harness.result.current.store.set('token', second);
      });
      await flush();

      expect(published).not.toContain(true);
    });

    test('an identity recorded in an abandoned render does not quarantine the page', async () => {
      const never = new Promise<never>(() => {});
      const Suspender = () => {
        throw never;
      };
      const authClient = {
        useSession: () => ({ data: null, isPending: true }),
        convex: { token: async () => ({ data: {} }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };
      const view = render(
        <Suspense fallback={null}>
          <ConvexAuthProvider
            authClient={authClient as any}
            client={makeConvexClient().client as any}
            onTokenIdentityChange={() => {}}
            tokenIdentityBaseline="user_a|session_a"
          >
            <Suspender />
          </ConvexAuthProvider>
        </Suspense>
      );
      await flush();
      view.unmount();

      const tokenForB = identityJwt('user_b', 'session_b');
      const fresh = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };
      let state: unknown;
      await act(async () => {
        state = await syncConvexAuthForStartLoader({
          convex: fresh,
          getToken: async () => tokenForB,
        });
      });

      expect(state).toEqual({ isAuthenticated: true, token: tokenForB });
      expect(isDocumentTripped()).toBe(false);
    });

    test('a baseline changed inside onTokenIdentityAdmitted prevents token publication', async () => {
      let baseline = 'user_a|session_a';
      const tokenForA = identityJwt('user_a', 'session_a');
      const harness = convexHarness({
        baseline: () => baseline,
        onTokenIdentityAdmitted: () => {
          baseline = 'user_b|session_b';
        },
        tokens: [tokenForA],
      });
      await flush();
      const published: Array<string | null> = [];
      const unsubscribe = harness.result.current.store.subscribe(
        'token',
        (token: string | null) => published.push(token)
      );

      expect(await harness.fetch(false)).toBeNull();
      unsubscribe();

      expect(published).not.toContain(tokenForA);
      expect(isDocumentTripped()).toBe(true);
      expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    });

    test('a trip inside onTokenIdentityAdmitted leaves no token in the store', async () => {
      const harness = convexHarness({
        onTokenIdentityAdmitted: () => tripDocument(),
        tokens: [identityJwt('user_a', 'session_a')],
      });
      await flush();

      expect(await harness.fetch(false)).toBeNull();
      expect(harness.result.current.store.get('token')).toBeNull();
    });

    test('a token that is not a JWT never opens the optimistic gate, whatever its payload', async () => {
      const payload = btoa(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
      );
      for (const token of [`opaque.${payload}`, `a.${payload}.b.c`]) {
        const harness = convexHarness({
          guard: false,
          initialToken: token,
          optimisticAuth: true,
          session: 'pending',
        });
        await flush();
        expect(harness.result.current.auth.isAuthenticated).toBe(false);
        harness.unmount();
      }
    });

    describe('one admission for every path', () => {
      const sessionPending = {
        useSession: () => ({ data: null, isPending: true }),
        convex: { token: async () => ({ data: {} }) },
        getSession: async () => null,
        updateSession: () => {},
        crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      };

      test('a later SSR token must match both its baseline and the page identity', async () => {
        const first = convexHarness({ baseline: 'user_a|session_a' });
        await flush();

        const second = convexHarness({
          baseline: 'user_b|session_b',
          initialToken: identityJwt('user_b', 'session_b'),
        });
        await flush();

        expect(second.result.current.store.get('token')).toBeNull();
        expect(isDocumentTripped()).toBe(true);
        expect(first.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test('providers mounted together with SSR tokens of two identities trip the page', async () => {
        for (const baselines of [false, true]) {
          const stores = new Map<'a' | 'b', AuthStore>();
          const Probe = ({ name }: { name: 'a' | 'b' }) => {
            const store = useAuthStore();
            useEffect(() => {
              stores.set(name, store);
            }, [name, store]);
            return null;
          };
          const changes = { a: mock(() => {}), b: mock(() => {}) };
          const provider = (name: 'a' | 'b') => (
            <ConvexAuthProvider
              authClient={sessionPending as any}
              client={makeConvexClient().client as any}
              initialToken={identityJwt(`user_${name}`, `session_${name}`)}
              onTokenIdentityChange={changes[name]}
              tokenIdentityBaseline={
                baselines ? `user_${name}|session_${name}` : undefined
              }
            >
              <Probe name={name} />
            </ConvexAuthProvider>
          );
          const view = render(
            <>
              {provider('a')}
              {provider('b')}
            </>
          );
          await flush();

          expect(isDocumentTripped()).toBe(true);
          expect(stores.get('a')!.get('token')).toBeNull();
          expect(stores.get('b')!.get('token')).toBeNull();
          expect(changes.a).toHaveBeenCalledTimes(1);
          expect(changes.b).toHaveBeenCalledTimes(1);
          view.unmount();
          resetDocumentTripForTests();
        }
      });

      test('a trip inside onTokenIdentityAdmitted at a cached hand-out hands out nothing', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const tokenForB = identityJwt('user_b', 'session_b');
        const container = document.createElement('div');
        const root = createRoot(container);
        let mountRefusing = false;
        const harness = convexHarness({
          onTokenIdentityAdmitted: () => {
            if (!mountRefusing) return;
            mountRefusing = false;
            // A provider mounted synchronously from the callback refuses B
            // against the page identity A and trips the page.
            flushSync(() => {
              root.render(
                <ConvexAuthProvider
                  authClient={sessionPending as any}
                  client={makeConvexClient().client as any}
                  initialToken={tokenForB}
                  onTokenIdentityChange={() => {}}
                >
                  {null}
                </ConvexAuthProvider>
              );
            });
          },
          tokens: [tokenForA],
        });
        await flush();
        expect(await harness.fetch(false)).toBe(tokenForA);

        mountRefusing = true;
        expect(await harness.fetch(false)).toBeNull();
        expect(isDocumentTripped()).toBe(true);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        act(() => root.unmount());
      });

      test("a sibling without a getter is bound by another guard's current getter", async () => {
        const page = { identity: 'user_a|session_a' };
        const tokenForA = identityJwt('user_a', 'session_a');
        const first = convexHarness({
          baseline: () => page.identity,
          tokens: [tokenForA],
        });
        const second = convexHarness({ tokens: [tokenForA, tokenForA] });
        await flush();
        expect(await first.fetch(false)).toBe(tokenForA);
        expect(await second.fetch(false)).toBe(tokenForA);

        page.identity = 'user_b|session_b';

        expect(await second.fetch(false)).toBeNull();
        expect(isDocumentTripped()).toBe(true);
        expect(second.result.current.store.get('token')).toBeNull();
        expect(first.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test('a cached two-segment opaque credential goes to the exchange, never to Convex', async () => {
        const payload = btoa(
          JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
        );
        const opaque = `opaque.${payload}`;
        const tokenForA = identityJwt('user_a', 'session_a');
        const harness = convexHarness({
          baseline: 'user_a|session_a',
          initialToken: opaque,
          session: 'pending',
          tokens: [tokenForA],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(tokenForA);
        expect(harness.convexToken).toHaveBeenCalledTimes(1);
        expect(
          (harness.convexToken.mock.calls[0] as any)[0].fetchOptions.headers
        ).toEqual({ Authorization: `Bearer ${opaque}` });
      });

      describe('on the server', () => {
        const registryKey = Symbol.for('kitcn.identityGuard.v1');
        const scope = globalThis as unknown as Record<symbol, unknown>;
        const withoutWindow = async (run: () => Promise<void>) => {
          const saved = Object.getOwnPropertyDescriptor(globalThis, 'window')!;
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: undefined,
            writable: true,
          });
          try {
            await run();
          } finally {
            Object.defineProperty(globalThis, 'window', saved);
          }
        };

        test('a server-only loader creates, reads and writes no page state', async () => {
          delete scope[registryKey];
          const tokenForB = identityJwt('user_b', 'session_b');
          await withoutWindow(async () => {
            const client = {
              clearAuth: mock(() => {}),
              setAuth: mock(() => {}),
            };
            const state = await syncConvexAuthForStartLoader({
              convex: client,
              getToken: async () => tokenForB,
            });
            expect(state).toEqual({ isAuthenticated: true, token: tokenForB });
            expect(scope[registryKey]).toBeUndefined();
          });
        });

        test('page state left by a torn-down DOM does not reach a server call', async () => {
          const view = convexHarness({ baseline: 'user_a|session_a' });
          await flush();
          view.unmount();
          const tokenForB = identityJwt('user_b', 'session_b');
          const client = { clearAuth: mock(() => {}), setAuth: mock(() => {}) };

          await withoutWindow(async () => {
            const state = await syncConvexAuthForStartLoader({
              convex: client,
              getToken: async () => tokenForB,
            });
            expect(state).toEqual({ isAuthenticated: true, token: tokenForB });
          });

          expect(isClientSettled(client)).toBe(false);
          expect(isDocumentTripped()).toBe(false);
        });
      });
    });

    describe('publication, fixed baselines, opaque routing, registry shape', () => {
      const opaqueWithExp = () =>
        `opaque.${btoa(
          JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
        )}`;

      test('a foreign token seeded after Convex confirmed trips and never publishes authenticated', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const harness = convexHarness({ tokens: [tokenForA] });
        await flush();
        expect(await harness.fetch(false)).toBe(tokenForA);
        await harness.report(true);
        expect(harness.result.current.auth.isAuthenticated).toBe(true);

        await act(async () => {
          harness.result.current.store.set(
            'token',
            identityJwt('user_b', 'session_b')
          );
        });

        expect(harness.result.current.auth.isAuthenticated).toBe(false);
        expect(isDocumentTripped()).toBe(true);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test('an expired foreign token seeded into the store trips the page', async () => {
        const harness = convexHarness({ baseline: 'user_a|session_a' });
        await flush();

        await act(async () => {
          harness.result.current.store.set(
            'token',
            identityJwt('user_b', 'session_b', -60)
          );
        });

        expect(harness.result.current.auth.isAuthenticated).toBe(false);
        expect(isDocumentTripped()).toBe(true);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test('a fixed baseline is read on the first render only', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const baselineHolder = { current: 'user_a|session_a' as string | null };
        const harness = convexHarness({ baselineHolder, tokens: [tokenForA] });
        await flush();
        expect(await harness.fetch(false)).toBe(tokenForA);

        baselineHolder.current = 'user_b|session_b';
        harness.rerender();
        await flush();

        expect(await harness.fetch(false)).toBe(tokenForA);
        expect(isDocumentTripped()).toBe(false);
        expect(harness.onTokenIdentityChange).not.toHaveBeenCalled();
      });

      test('with no guarded provider, a cached opaque credential is handed out as before', async () => {
        const opaque = opaqueWithExp();
        const harness = convexHarness({
          guard: false,
          initialToken: opaque,
          session: 'pending',
          tokens: [identityJwt('user_a', 'session_a')],
        });
        await flush();

        expect(await harness.fetch(false)).toBe(opaque);
        expect(harness.convexToken).not.toHaveBeenCalled();
      });

      test('with a guard, a cached opaque credential is exchanged, whatever the session state', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        for (const session of ['active', 'pending'] as const) {
          const opaque = opaqueWithExp();
          const harness = convexHarness({
            initialToken: opaque,
            session,
            tokens: [tokenForA],
          });
          await flush();

          expect(await harness.fetch(false)).toBe(tokenForA);
          expect(harness.convexToken).toHaveBeenCalledTimes(1);
          expect(
            (harness.convexToken.mock.calls[0] as any)[0].fetchOptions.headers
          ).toEqual({ Authorization: `Bearer ${opaque}` });
          harness.unmount();
          resetDocumentTripForTests();
        }
      });

      test('an incompatible registry under the key fails guarded admissions closed', async () => {
        const key = Symbol.for('kitcn.identityGuard.v2');
        const scope = globalThis as unknown as Record<symbol, unknown>;
        const saved = scope[key];
        scope[key] = {
          admissions: new WeakMap(),
          documentIdentity: null,
          identitySources: new Set(),
          settledClients: new WeakSet(),
          settlementListeners: new WeakMap(),
          tripListeners: new Set(),
          tripped: false,
          watchedClients: new WeakSet(),
        };
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const harness = convexHarness({
            tokens: [identityJwt('user_a', 'session_a')],
          });
          await flush();

          expect(await harness.fetch(false)).toBeNull();
          expect(harness.result.current.store.get('token')).toBeNull();
          expect(warn).toHaveBeenCalled();
          harness.unmount();
        } finally {
          warn.mockRestore();
          if (saved === undefined) delete scope[key];
          else scope[key] = saved;
        }
      });
    });

    describe('late guards, loader claims, publication between writes', () => {
      type Published = {
        auth: boolean;
        token: string | null;
        tripped: boolean;
      };
      const publicationProbe = (
        onLoaded: (store: AuthStore) => void,
        published: Published[]
      ) =>
        function usePublicationProbe() {
          const store = useAuthStore();
          useEffect(() => {
            const offLoading = store.subscribe(
              'isLoading',
              (loading: boolean) => {
                if (!loading) onLoaded(store);
              }
            );
            const offAuth = store.subscribe(
              'isAuthenticated',
              (auth: boolean) => {
                published.push({
                  auth,
                  token: store.get('token'),
                  tripped: isDocumentTripped(),
                });
              }
            );
            return () => {
              offLoading();
              offAuth();
            };
          }, [store]);
        };

      test('a guard enabled after mount binds the identity the provider holds', async () => {
        const guardHolder = { current: false };
        const harness = convexHarness({
          guardHolder,
          initialToken: identityJwt('user_a', 'session_a'),
          tokens: [identityJwt('user_b', 'session_b')],
        });
        await flush();

        guardHolder.current = true;
        harness.rerender();
        await flush();

        expect(await harness.fetch(true)).toBeNull();
        expect(isDocumentTripped()).toBe(true);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.result.current.store.get('token')).toBeNull();
      });

      test('a guard enabled after the page trips closes its client and reports once', async () => {
        const guardHolder = { current: false };
        const harness = convexHarness({
          guardHolder,
          initialToken: identityJwt('user_a', 'session_a'),
        });
        await flush();
        act(() => tripDocument());
        expect(harness.close).not.toHaveBeenCalled();
        expect(harness.onTokenIdentityChange).not.toHaveBeenCalled();

        guardHolder.current = true;
        harness.rerender();
        await flush();

        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
        expect(harness.result.current.store.get('token')).toBeNull();
        expect(harness.result.current.auth.isAuthenticated).toBe(false);
        harness.rerender();
        await flush();
        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test("on a guarded page, the Start loader's first admitted JWT claims the page identity", async () => {
        const convex = makeConvexClient();
        const harness = convexHarness({ convex, session: 'pending' });
        await flush();
        const tokenForA = identityJwt('user_a', 'session_a');
        const tokenForB = identityJwt('user_b', 'session_b');

        let first: unknown;
        let second: unknown;
        await act(async () => {
          first = await syncConvexAuthForStartLoader({
            convex: convex.client as any,
            getToken: async () => tokenForA,
          });
          second = await syncConvexAuthForStartLoader({
            convex: convex.client as any,
            getToken: async () => tokenForB,
          });
        });

        expect(first).toEqual({ isAuthenticated: true, token: tokenForA });
        expect(second).toEqual({ isAuthenticated: false, token: null });
        expect(isDocumentTripped()).toBe(true);
        expect(harness.onTokenIdentityChange).toHaveBeenCalledTimes(1);
      });

      test('a token swapped by a loading subscriber is admitted before authenticated is published', async () => {
        const tokenForA = identityJwt('user_a', 'session_a');
        const tokenForB = identityJwt('user_b', 'session_b');
        const published: Published[] = [];
        const harness = convexHarness({
          extraHook: publicationProbe((store) => {
            if (store.get('token') === tokenForA) store.set('token', tokenForB);
          }, published),
          tokens: [tokenForA],
        });
        await flush();
        expect(await harness.fetch(false)).toBe(tokenForA);
        await harness.report(true);

        expect(
          published.some((entry) => entry.auth && entry.token === tokenForB)
        ).toBe(false);
        expect(isDocumentTripped()).toBe(true);
      });

      test('a trip in a loading subscriber is seen before authenticated is published', async () => {
        const published: Published[] = [];
        const harness = convexHarness({
          extraHook: publicationProbe(() => tripDocument(), published),
          tokens: [identityJwt('user_a', 'session_a')],
        });
        await flush();
        await harness.fetch(false);
        await harness.report(true);

        expect(isDocumentTripped()).toBe(true);
        expect(published.some((entry) => entry.auth && entry.tripped)).toBe(
          false
        );
      });

      test('the Start loader refuses when its setAuth trips the page', async () => {
        const convexClient = {
          clearAuth: mock(() => {}),
          setAuth: mock(() => tripDocument()),
        };
        const serverHttpClient = {
          clearAuth: mock(() => {}),
          setAuth: mock((_token: string) => {}),
        };
        let state: unknown;
        await act(async () => {
          state = await syncConvexAuthForStartLoader({
            convex: { convexClient, serverHttpClient },
            getToken: async () => identityJwt('user_a', 'session_a'),
          });
        });

        expect(state).toEqual({ isAuthenticated: false, token: null });
        expect(serverHttpClient.setAuth).not.toHaveBeenCalled();
      });
    });

    test('a remount with a fresh client cannot reopen the document after a trip', async () => {
      const first = convexHarness({
        initialToken: identityJwt('user_a', 'session_a'),
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      await first.fetch(false);
      expect(await first.fetch(true)).toBeNull();
      first.unmount();

      const second = convexHarness({
        baseline: 'user_a|session_a',
        initialToken: identityJwt('user_a', 'session_a'),
        optimisticAuth: true,
        session: 'pending',
      });
      await flush();

      expect(second.result.current.store.get('token')).toBeNull();
      expect(second.result.current.auth.isAuthenticated).toBe(false);
    });

    test('two mounted providers sharing a client: tripping one quarantines the other', async () => {
      const tokenForA = identityJwt('user_a', 'session_a');
      const convex = makeConvexClient();
      const first = convexHarness({
        convex,
        initialToken: tokenForA,
        tokens: [identityJwt('user_b', 'session_b')],
      });
      await flush();
      const second = convexHarness({
        convex,
        extraHook: useFetchAccessToken,
        initialToken: tokenForA,
      });
      await flush();
      const httpFetcher = second.result.current.extra as (args?: {
        forceRefreshToken?: boolean;
      }) => Promise<string | null>;
      let before: string | null = null;
      await act(async () => {
        before = await httpFetcher();
      });
      expect(before).toBe(tokenForA);

      let refused: string | null = 'unset';
      await act(async () => {
        refused = await convex.bindings[0]!.fetchToken({
          forceRefreshToken: true,
        });
      });
      expect(refused).toBeNull();

      let after: string | null = 'unset';
      await act(async () => {
        after = await httpFetcher();
      });
      expect(after).toBeNull();
      expect(second.result.current.store.get('token')).toBeNull();
      expect(second.result.current.store.get('isAuthenticated')).toBe(false);
    });

    test("a refusal hidden behind the SDK's transparent retry never reopens the gate", async () => {
      const tokenA = makeJwt(3600);
      // Under a minute left: the recovery fetch goes back to the endpoint.
      const tokenB = makeJwt(30);
      const convex = await makeManagedConvexClient();
      const harness = convexHarness({
        convex,
        guard: false,
        initialToken: tokenA,
        optimisticAuth: true,
        tokens: [tokenB, null, tokenA],
      });
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(true);

      // The server refuses A; the SDK refetches B on its own and sends it;
      // the server refuses B; only then does React hear one refusal.
      await convex.refuse();
      await convex.refuse();
      await flush();
      expect(harness.result.current.auth.isAuthenticated).toBe(false);

      // Recovery obtains A again: a token Convex refused never reopens the gate.
      await harness.recover();
      await flush();
      expect(harness.result.current.store.get('token')).toBe(tokenA);
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
    });

    test('a token Convex refused never reopens the optimistic gate, even after another refusal', async () => {
      const tokenA = makeJwt(3600);
      const tokenB = makeJwt(3500);
      const harness = convexHarness({
        guard: false,
        initialToken: tokenA,
        optimisticAuth: true,
        tokens: [tokenB, tokenA],
      });
      await flush();
      expect(await harness.fetch(false)).toBe(tokenA);
      await harness.report(false);
      expect(harness.result.current.auth.isAuthenticated).toBe(false);

      // Convex refuses B too, then the token endpoint answers A again.
      await harness.recover();
      expect(await harness.fetch(true)).toBe(tokenB);
      await harness.report(false);
      await harness.recover();
      expect(await harness.fetch(true)).toBe(tokenA);
      await flush();

      expect(harness.result.current.store.get('token')).toBe(tokenA);
      expect(harness.result.current.auth.isAuthenticated).toBe(false);
    });
  });

  test('useAuth reports unauthenticated when session is confirmed missing, even with SSR token', async () => {
    const initialToken = makeJwt(3600);
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      convex: { token: async () => ({ data: {} }) },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.hasSession).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  test('exchanges a freshly seeded session token for a Convex JWT while session sync catches up', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexJwt = makeJwt(7200);
    const convexToken = mock(async () => ({ data: { token: convexJwt } }));

    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(
      () => ({
        auth: useAuth(),
        fetchAccessToken: useFetchAccessToken(),
        store: useAuthStore(),
      }),
      { wrapper }
    );

    await act(async () => {
      result.current.store.set('token', 'session-token');
      result.current.store.set('expiresAt', null);
      result.current.store.set('sessionSyncGraceUntil', Date.now() + 5_000);
    });

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current.fetchAccessToken!({
        forceRefreshToken: false,
      });
    });

    expect(fetched).toBe(convexJwt);
    expect(result.current.store.get('token')).toBe(convexJwt);
    expect(result.current.auth.hasSession).toBe(true);
    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: {
        credentials: 'omit',
        headers: {
          Authorization: 'Bearer session-token',
        },
        throw: false,
      },
    });
  });

  test('verifies OTT and refreshes session, then removes ott from the URL', async () => {
    const ott = 'OTT123';

    window.history.replaceState({}, '', `/?ott=${ott}`);
    let currentOtt = new URL(window.location.href).searchParams.get('ott');
    if (currentOtt !== ott) {
      try {
        window.location.href = `http://localhost/?ott=${ott}`;
      } catch {
        // Ignore - we'll assert based on actual href below.
      }
      currentOtt = new URL(window.location.href).searchParams.get('ott');
    }
    expect(currentOtt).toBe(ott);

    const verify = mock(async () => {
      expect(new URL(window.location.href).searchParams.get('ott')).toBeNull();
      return {
        data: { session: { token: 'SESSION_TOKEN' } },
      };
    });
    const getSession = mock(async (_opts: any) => null);
    const updateSession = mock(() => {});

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      convex: { token: async () => ({ data: {} }) },
      getSession,
      updateSession,
      crossDomain: { oneTimeToken: { verify } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    renderHook(() => null, { wrapper });

    // Flush the async IIFE started in useEffect().
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(verify.mock.calls.length).toBeGreaterThan(0);
    expect(verify).toHaveBeenCalledWith({ token: ott });
    expect(getSession.mock.calls.length).toBeGreaterThan(0);
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: {
        credentials: 'omit',
        headers: { Authorization: 'Bearer SESSION_TOKEN' },
      },
    });
    expect(updateSession.mock.calls.length).toBeGreaterThan(0);

    const url = new URL(window.location.href);
    expect(url.searchParams.get('ott')).toBeNull();
  });
});
