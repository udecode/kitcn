import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  useAuth,
  useAuthStore,
  useFetchAccessToken,
} from '../react/auth-store';
import { ConvexAuthProvider } from './convex-auth-provider';

const makeJwt = (expSecondsFromNow: number) => {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = btoa(JSON.stringify({ exp }));
  return `x.${payload}.z`;
};

describe('ConvexAuthProvider', () => {
  let originalHref = window.location.href;

  beforeEach(() => {
    originalHref = window.location.href;
  });

  afterEach(() => {
    try {
      window.history.replaceState({}, '', originalHref);
    } catch {
      // Happy DOM may reject some URL transitions; don't let cleanup fail the suite.
    }
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
