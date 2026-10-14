import { act, renderHook } from '@testing-library/react';
import { ConvexAuthProvider } from 'kitcn/auth/client';
import { syncConvexAuthForStartLoader } from 'kitcn/auth/start';
import { createCRPCContext, useAuth, useAuthStore } from 'kitcn/react';
import { type ReactNode, useEffect } from 'react';
import {
  isDocumentTripped,
  resetDocumentTripForTests,
  tripDocument,
} from '../react/identity-guard-registry';

// Built entries: `kitcn/auth/start` is bundled apart from `kitcn/auth/client`
// and `kitcn/react`, so the identity guard's page state must be shared
// across bundles, not per module copy.
const identityJwt = (sub: string, sessionId: string, expSeconds = 3600) =>
  `x.${btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + expSeconds,
      sessionId,
      sub,
    })
  )}.z`;

type FetchToken = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

const mountProvider = ({
  baseline,
  client,
  extraHook = () => null,
  guard = true,
  initialToken,
  optimisticAuth = false,
  session = 'active',
  tokens = [],
}: {
  baseline?: string | (() => string | null);
  client: { setAuth: (fetchToken: FetchToken) => void };
  extraHook?: () => unknown;
  guard?: boolean;
  initialToken?: string;
  optimisticAuth?: boolean;
  session?: 'active' | 'pending';
  tokens?: string[];
}) => {
  const queue = [...tokens];
  const onTokenIdentityChange = mock(() => {});
  const exchange = mock(async (_options: unknown) => ({
    data: { token: queue.shift() ?? null },
  }));
  const authClient = {
    convex: { token: exchange },
    crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    getSession: async () => null,
    updateSession: () => {},
    useSession: () =>
      session === 'active'
        ? {
            data: { session: { id: 's' }, user: { id: 'u' } },
            isPending: false,
          }
        : { data: null, isPending: true },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConvexAuthProvider
      authClient={authClient as never}
      client={client as never}
      initialToken={initialToken}
      onTokenIdentityChange={guard ? onTokenIdentityChange : undefined}
      optimisticAuth={optimisticAuth}
      tokenIdentityBaseline={baseline}
    >
      {children}
    </ConvexAuthProvider>
  );
  return {
    exchange,
    onTokenIdentityChange,
    ...renderHook(
      () => {
        extraHook();
        return useAuth();
      },
      { wrapper }
    ),
  };
};

const makeClient = () => {
  const fetchers: FetchToken[] = [];
  const reports: Array<(isAuthenticated: boolean) => void> = [];
  return {
    fetchers,
    reports,
    client: {
      clearAuth: () => {},
      close: mock(async () => {}),
      setAuth: (
        fetchToken: FetchToken,
        onChange?: (isAuthenticated: boolean) => void
      ) => {
        fetchers.push(fetchToken);
        if (onChange) reports.push(onChange);
      },
    },
  };
};

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('identity guard across built entrypoints', () => {
  afterEach(() => {
    resetDocumentTripForTests();
  });

  test('a client kitcn/auth/start authenticated gets no optimistic window in kitcn/auth/client', async () => {
    const token = identityJwt('user_a', 'session_a');
    const { client } = makeClient();
    await syncConvexAuthForStartLoader({
      convex: client,
      getToken: async () => token,
    });

    const { result } = mountProvider({
      client,
      initialToken: token,
      optimisticAuth: true,
      session: 'pending',
    });
    await flush();

    expect(result.current.isAuthenticated).toBe(false);
  });

  test('the page identity from kitcn/auth/client holds kitcn/auth/start', async () => {
    const { client } = makeClient();
    mountProvider({ baseline: 'user_a|session_a', client, session: 'pending' });
    await flush();

    const fresh = makeClient();
    let state: unknown;
    await act(async () => {
      state = await syncConvexAuthForStartLoader({
        convex: fresh.client,
        getToken: async () => identityJwt('user_b', 'session_b'),
      });
    });

    expect(state).toEqual({ isAuthenticated: false, token: null });
  });

  test('a trip in kitcn/auth/client stops kitcn/auth/start', async () => {
    const tokenForA = identityJwt('user_a', 'session_a');
    const { client, fetchers } = makeClient();
    const provider = mountProvider({
      client,
      initialToken: tokenForA,
      tokens: [identityJwt('user_b', 'session_b')],
    });
    await flush();
    await act(async () => {
      await fetchers.at(-1)!({ forceRefreshToken: false });
      await fetchers.at(-1)!({ forceRefreshToken: true });
    });
    expect(provider.onTokenIdentityChange).toHaveBeenCalledTimes(1);

    const fresh = makeClient();
    let state: unknown;
    await act(async () => {
      state = await syncConvexAuthForStartLoader({
        convex: fresh.client,
        getToken: async () => tokenForA,
      });
    });

    expect(state).toEqual({ isAuthenticated: false, token: null });
  });

  test("a sibling in kitcn/auth/client is bound by another guard's current getter", async () => {
    const page = { identity: 'user_a|session_a' };
    const tokenForA = identityJwt('user_a', 'session_a');
    const first = makeClient();
    mountProvider({
      baseline: () => page.identity,
      client: first.client,
      tokens: [tokenForA],
    });
    const second = makeClient();
    const sibling = mountProvider({
      client: second.client,
      tokens: [tokenForA],
    });
    await flush();
    let handed: string | null = null;
    await act(async () => {
      handed = await second.fetchers.at(-1)!({ forceRefreshToken: false });
    });
    expect(handed).toBe(tokenForA);

    page.identity = 'user_b|session_b';
    await act(async () => {
      handed = await second.fetchers.at(-1)!({ forceRefreshToken: false });
    });

    expect(handed).toBeNull();
    expect(isDocumentTripped()).toBe(true);
    expect(sibling.onTokenIdentityChange).toHaveBeenCalledTimes(1);
  });

  test('an SSR token in kitcn/auth/client is reconciled against the page identity', async () => {
    const first = mountProvider({
      baseline: 'user_a|session_a',
      client: makeClient().client,
      session: 'pending',
    });
    await flush();

    const later = makeClient();
    const second = mountProvider({
      baseline: 'user_b|session_b',
      client: later.client,
      initialToken: identityJwt('user_b', 'session_b'),
      session: 'pending',
    });
    await flush();

    // Refused and tripped on mount, before anything asks for a token.
    expect(isDocumentTripped()).toBe(true);
    expect(first.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    expect(second.onTokenIdentityChange).toHaveBeenCalledTimes(1);
    // Any fetcher Convex was handed hands out nothing.
    for (const fetchToken of later.fetchers) {
      let handed: string | null = 'unset';
      await act(async () => {
        handed = await fetchToken({ forceRefreshToken: false });
      });
      expect(handed).toBeNull();
    }
  });

  test('kitcn/react HTTP sends no kitcn token once the page trips while per-call headers load', async () => {
    const tokenForA = identityJwt('user_a', 'session_a');
    const sent: Array<Record<string, string>> = [];
    const { CRPCProvider, useCRPC } = createCRPCContext({
      api: {
        _http: { 'todos.get': { method: 'GET', path: '/todos' } },
      } as never,
      convexSiteUrl: 'https://example.convex.site',
      fetch: (async (_url: string, init: RequestInit) => {
        sent.push(init.headers as Record<string, string>);
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    const { client } = makeClient();
    const queue = [tokenForA];
    const authClient = {
      convex: {
        token: async () => ({ data: { token: queue.shift() ?? tokenForA } }),
      },
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
      getSession: async () => null,
      updateSession: () => {},
      useSession: () => ({
        data: { session: { id: 's' }, user: { id: 'u' } },
        isPending: false,
      }),
    };
    const onTokenIdentityChange = mock(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as never}
        client={client as never}
        onTokenIdentityChange={onTokenIdentityChange}
      >
        <CRPCProvider
          convexClient={client as never}
          convexQueryClient={{ resetAuthQueries: async () => {} } as never}
        >
          {children}
        </CRPCProvider>
      </ConvexAuthProvider>
    );
    const { result } = renderHook(() => useCRPC() as any, { wrapper });
    await flush();

    await act(async () => {
      await result.current.http.todos.get.query({});
    });
    expect(sent.at(-1)?.Authorization).toBe(`Bearer ${tokenForA}`);

    let release!: (headers: Record<string, string>) => void;
    let request!: Promise<unknown>;
    await act(async () => {
      request = result.current.http.todos.get.query({
        headers: () =>
          new Promise<Record<string, string>>((resolve) => {
            release = resolve;
          }),
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      tripDocument();
      release({ 'x-call': '1' });
      await request;
    });

    expect(sent.at(-1)).toEqual({ 'x-call': '1' });
    expect(onTokenIdentityChange).toHaveBeenCalledTimes(1);
  });

  test('a cached opaque credential in kitcn/auth/client: direct with no guard, exchanged with one', async () => {
    const opaque = `opaque.${btoa(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
    )}`;
    const tokenForA = identityJwt('user_a', 'session_a');

    const plain = makeClient();
    const unguarded = mountProvider({
      client: plain.client,
      guard: false,
      initialToken: opaque,
      session: 'pending',
      tokens: [tokenForA],
    });
    await flush();
    let handed: string | null = null;
    await act(async () => {
      handed = await plain.fetchers.at(-1)!({ forceRefreshToken: false });
    });
    expect(handed).toBe(opaque);
    expect(unguarded.exchange).not.toHaveBeenCalled();
    unguarded.unmount();

    const guardedClient = makeClient();
    const guarded = mountProvider({
      client: guardedClient.client,
      initialToken: opaque,
      tokens: [tokenForA],
    });
    await flush();
    await act(async () => {
      handed = await guardedClient.fetchers.at(-1)!({
        forceRefreshToken: false,
      });
    });
    expect(handed).toBe(tokenForA);
    expect(guarded.exchange).toHaveBeenCalledTimes(1);
  });

  test("kitcn/auth/start's first JWT claims the identity of a page kitcn/auth/client guards", async () => {
    const { client } = makeClient();
    const provider = mountProvider({ client, session: 'pending' });
    await flush();
    const tokenForA = identityJwt('user_a', 'session_a');
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await syncConvexAuthForStartLoader({
        convex: client,
        getToken: async () => tokenForA,
      });
      second = await syncConvexAuthForStartLoader({
        convex: client,
        getToken: async () => identityJwt('user_b', 'session_b'),
      });
    });

    expect(first).toEqual({ isAuthenticated: true, token: tokenForA });
    expect(second).toEqual({ isAuthenticated: false, token: null });
    expect(isDocumentTripped()).toBe(true);
    expect(provider.onTokenIdentityChange).toHaveBeenCalledTimes(1);
  });

  test('kitcn/auth/client admits the held token again right before publishing authenticated', async () => {
    const tokenForA = identityJwt('user_a', 'session_a');
    const tokenForB = identityJwt('user_b', 'session_b');
    const published: Array<{ auth: boolean; token: string | null }> = [];
    const useSwapWhenLoaded = () => {
      const store = useAuthStore();
      useEffect(() => {
        const offLoading = store.subscribe('isLoading', (loading: boolean) => {
          if (!loading && store.get('token') === tokenForA) {
            store.set('token', tokenForB);
          }
        });
        const offAuth = store.subscribe('isAuthenticated', (auth: boolean) => {
          published.push({ auth, token: store.get('token') });
        });
        return () => {
          offLoading();
          offAuth();
        };
      }, [store]);
    };
    const { client, fetchers, reports } = makeClient();
    mountProvider({
      client,
      extraHook: useSwapWhenLoaded,
      tokens: [tokenForA],
    });
    await flush();
    await act(async () => {
      await fetchers.at(-1)!({ forceRefreshToken: false });
    });
    await act(async () => {
      reports.at(-1)!(true);
    });

    expect(
      published.some((entry) => entry.auth && entry.token === tokenForB)
    ).toBe(false);
    expect(isDocumentTripped()).toBe(true);
  });
});
