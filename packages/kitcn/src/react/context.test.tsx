import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import * as authStoreModule from './auth-store';
import {
  createCRPCContext,
  useConvexQueryClient,
  useFnMeta,
  useMeta,
} from './context';
import * as httpProxyModule from './http-proxy';
import * as proxyModule from './proxy';
import * as vanillaClientModule from './vanilla-client';

describe('createCRPCContext', () => {
  let useAuthStoreSpy: ReturnType<typeof spyOn>;
  let useFetchAccessTokenSpy: ReturnType<typeof spyOn>;
  let useAuthValueSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useAuthStoreSpy = spyOn(authStoreModule, 'useAuthStore').mockImplementation(
      () =>
        ({
          get: () => null,
        }) as any
    );
    useFetchAccessTokenSpy = spyOn(
      authStoreModule,
      'useFetchAccessToken'
    ).mockImplementation(() => null);
    useAuthValueSpy = spyOn(authStoreModule, 'useAuthValue').mockImplementation(
      () => null as any
    );
  });

  afterEach(() => {
    useAuthStoreSpy.mockRestore();
    useFetchAccessTokenSpy.mockRestore();
    useAuthValueSpy.mockRestore();
  });

  test('useCRPC/useCRPCClient throw when used outside CRPCProvider', () => {
    const api = {} as any;
    const { useCRPC, useCRPCClient } = createCRPCContext({
      api,
    });

    expect(() => renderHook(() => useCRPC())).toThrow(
      'useCRPC must be used within CRPCProvider'
    );
    expect(() => renderHook(() => useCRPCClient())).toThrow(
      'useCRPCClient must be used within CRPCProvider'
    );
  });

  test('provides meta and ConvexQueryClient via context', () => {
    const api = {
      users: {
        list: {
          type: 'query',
          auth: 'optional',
        },
      },
    } as any;
    const convexQueryClient = { kind: 'queryClient' } as any;
    const convexClient = {} as any;

    const { CRPCProvider } = createCRPCContext({ api });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CRPCProvider
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProvider>
    );

    const metaResult = renderHook(() => useMeta(), { wrapper });
    expect(metaResult.result.current).toEqual({
      users: {
        list: {
          type: 'query',
          auth: 'optional',
        },
      },
    });

    const fnMetaResult = renderHook(() => useFnMeta()('users', 'list'), {
      wrapper,
    });
    expect(fnMetaResult.result.current).toEqual({
      type: 'query',
      auth: 'optional',
    });

    const queryClientResult = renderHook(() => useConvexQueryClient(), {
      wrapper,
    });
    expect(queryClientResult.result.current).toBe(convexQueryClient);
  });

  test('injects http namespace when http proxy is configured', () => {
    const httpProxyStub = { todos: { get: { queryKey: () => ['x'] } } };

    const createHttpProxySpy = spyOn(
      httpProxyModule,
      'createHttpProxy'
    ).mockReturnValue(httpProxyStub as any);
    const createOptionsProxySpy = spyOn(
      proxyModule,
      'createCRPCOptionsProxy'
    ).mockReturnValue({ foo: 'bar' } as any);
    const createVanillaProxySpy = spyOn(
      vanillaClientModule,
      'createVanillaCRPCProxy'
    ).mockReturnValue({ foo: 'baz' } as any);

    const meta = {
      _http: { 'todos.get': { method: 'GET', path: '/todos/:id' } },
    } as any;
    const api = {
      _http: meta._http,
    } as any;

    try {
      const convexQueryClient = {} as any;
      const convexClient = {} as any;

      const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
        api,
        convexSiteUrl: 'https://example.convex.site',
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <CRPCProvider
          convexClient={convexClient}
          convexQueryClient={convexQueryClient}
        >
          {children}
        </CRPCProvider>
      );

      const crpcResult = renderHook(
        () => {
          const crpc = useCRPC() as any;
          return { foo: crpc.foo, http: crpc.http };
        },
        { wrapper }
      );

      expect(crpcResult.result.current.foo).toBe('bar');
      expect(crpcResult.result.current.http).toBe(httpProxyStub);

      const clientResult = renderHook(
        () => {
          const client = useCRPCClient() as any;
          return { foo: client.foo, http: client.http };
        },
        { wrapper }
      );

      expect(clientResult.result.current.foo).toBe('baz');
      expect(clientResult.result.current.http).toBe(httpProxyStub);

      expect(createHttpProxySpy).toHaveBeenCalled();
      const args = createHttpProxySpy.mock.calls[0]?.[0];
      expect(args).toMatchObject({
        convexSiteUrl: 'https://example.convex.site',
        routes: meta._http,
      });
    } finally {
      createHttpProxySpy.mockRestore();
      createOptionsProxySpy.mockRestore();
      createVanillaProxySpy.mockRestore();
    }
  });

  test('forwards transformer option to CRPC proxies', () => {
    const createOptionsProxySpy = spyOn(
      proxyModule,
      'createCRPCOptionsProxy'
    ).mockReturnValue({ foo: 'bar' } as any);
    const createVanillaProxySpy = spyOn(
      vanillaClientModule,
      'createVanillaCRPCProxy'
    ).mockReturnValue({ foo: 'baz' } as any);

    const transformer = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const api = {} as any;

    try {
      const convexQueryClient = {} as any;
      const convexClient = {} as any;

      const { CRPCProvider } = createCRPCContext({
        api,
        transformer,
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <CRPCProvider
          convexClient={convexClient}
          convexQueryClient={convexQueryClient}
        >
          {children}
        </CRPCProvider>
      );

      renderHook(() => useMeta(), { wrapper });

      expect(createOptionsProxySpy).toHaveBeenCalledWith(api, {}, transformer);
      expect(createVanillaProxySpy).toHaveBeenCalledWith(
        api,
        {},
        convexClient,
        transformer
      );
    } finally {
      createOptionsProxySpy.mockRestore();
      createVanillaProxySpy.mockRestore();
    }
  });

  test('resets auth queries on an account change but not on a token refresh', () => {
    const api = {} as any;
    const convexClient = {} as any;
    const convexQueryClient = {
      resetAuthQueries: mock(async () => {}),
    } as any;

    let authState = {
      isAuthenticated: false,
      token: null as string | null,
    };
    useAuthValueSpy.mockImplementation(
      ((key: 'token' | 'isAuthenticated') => authState[key]) as any
    );

    const { CRPCProvider } = createCRPCContext({ api });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CRPCProvider
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProvider>
    );

    let serial = 0;
    const makeJwt = (sub: string) =>
      `a.${Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: `token-${++serial}`,
          sub,
        })
      ).toString('base64')}.b`;

    const hook = renderHook(() => useMeta(), { wrapper });
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    authState = {
      isAuthenticated: false,
      token: 'opaque-session-token',
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    authState = {
      isAuthenticated: true,
      token: makeJwt('account-a'),
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // A scheduled refresh mints a new JWT for the same account. Treating that
    // as a transition would drop every auth-bound entry — and every paginated
    // cursor chain keyed on the account — once an hour.
    authState = {
      isAuthenticated: true,
      token: makeJwt('account-a'),
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // Signing in as someone else without signing out first keeps
    // `isAuthenticated` true, so the account is the only thing that changed.
    authState = {
      isAuthenticated: true,
      token: makeJwt('account-b'),
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(2);

    authState = {
      isAuthenticated: false,
      token: null,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(3);
  });

  test('keeps hydrated queries when Convex confirms the same token', () => {
    const api = {} as any;
    const convexClient = {} as any;
    const convexQueryClient = {
      resetAuthQueries: mock(async () => {}),
    } as any;

    // A server-rendered page reaches the browser carrying a token. The auth
    // state reports it as unauthenticated while Convex checks it, then as
    // authenticated once Convex accepts it. The reader did not change, so the
    // queries the server render hydrated must stay in the cache.
    const ssrToken = `a.${Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'ssr-token',
        sub: 'account-a',
      })
    ).toString('base64')}.b`;

    let authState = {
      isAuthenticated: false,
      token: ssrToken as string | null,
    };
    useAuthValueSpy.mockImplementation(
      ((key: 'token' | 'isAuthenticated') => authState[key]) as any
    );

    const { CRPCProvider } = createCRPCContext({ api });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CRPCProvider
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProvider>
    );

    const hook = renderHook(() => useMeta(), { wrapper });
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    authState = { isAuthenticated: true, token: ssrToken };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    // Signing out drops the token, which is a different identity.
    authState = { isAuthenticated: false, token: null };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);
  });

  test('resets auth queries when Convex rejects an existing token', () => {
    const api = {} as any;
    const convexClient = {} as any;
    const convexQueryClient = {
      resetAuthQueries: mock(async () => {}),
    } as any;
    const token = `a.${Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'account-a',
      })
    ).toString('base64')}.b`;

    let authState = {
      isAuthenticated: true,
      token: token as string | null,
    };
    useAuthValueSpy.mockImplementation(
      ((key: 'token' | 'isAuthenticated') => authState[key]) as any
    );

    const { CRPCProvider } = createCRPCContext({ api });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CRPCProvider
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProvider>
    );

    const hook = renderHook(() => useMeta(), { wrapper });
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    authState = { isAuthenticated: false, token };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);
  });

  test('ignores token rotation but resets when identity claims change', () => {
    const api = {} as any;
    const convexClient = {} as any;
    const convexQueryClient = {
      resetAuthQueries: mock(async () => {}),
    } as any;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const makeJwt = (payload: Record<string, unknown>) =>
      `a.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.b`;

    // Same identity, freshly minted: Convex rotates roughly every 15 minutes
    // and kitcn stamps a new `iat` into every payload.
    const signedIn = {
      activeOrganizationId: 'org_1',
      email: 'zoe@example.com',
      exp: nowSeconds + 900,
      iat: nowSeconds,
      sessionId: 'sess_1',
      sub: 'user_1',
    };
    const rotated = {
      ...signedIn,
      exp: nowSeconds + 1800,
      iat: nowSeconds + 890,
    };
    // Same session, different organization: a real identity change.
    const switchedOrg = { ...rotated, activeOrganizationId: 'org_2' };

    let authState = {
      isAuthenticated: false,
      token: null as string | null,
    };
    useAuthValueSpy.mockImplementation(
      ((key: 'token' | 'isAuthenticated') => authState[key]) as any
    );

    const { CRPCProvider } = createCRPCContext({ api });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CRPCProvider
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProvider>
    );

    const hook = renderHook(() => useMeta(), { wrapper });

    authState = { isAuthenticated: true, token: makeJwt(signedIn) };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // Routine rotation: different string, identical claims -> no reset.
    authState = { isAuthenticated: true, token: makeJwt(rotated) };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // Claim order must not matter either.
    authState = {
      isAuthenticated: true,
      token: makeJwt({
        sub: rotated.sub,
        sessionId: rotated.sessionId,
        iat: nowSeconds + 895,
        exp: nowSeconds + 2700,
        email: rotated.email,
        activeOrganizationId: rotated.activeOrganizationId,
      }),
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // Organization switch: same session, different claims -> reset.
    authState = { isAuthenticated: true, token: makeJwt(switchedOrg) };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(2);
  });

  test('useCRPC/useCRPCClient keep a stable identity across renders', () => {
    const httpProxyStub = { todos: { get: { queryKey: () => ['x'] } } };

    const createHttpProxySpy = spyOn(
      httpProxyModule,
      'createHttpProxy'
    ).mockReturnValue(httpProxyStub as any);
    const createOptionsProxySpy = spyOn(
      proxyModule,
      'createCRPCOptionsProxy'
    ).mockReturnValue({ foo: 'bar' } as any);
    const createVanillaProxySpy = spyOn(
      vanillaClientModule,
      'createVanillaCRPCProxy'
    ).mockReturnValue({ foo: 'baz' } as any);

    // jotai-x memoizes the store api per provider, so mirror that here: the
    // default mock hands back a fresh object per call.
    const authStore = { get: () => null } as any;
    useAuthStoreSpy.mockImplementation(() => authStore);

    try {
      const api = { _http: { 'todos.get': { method: 'GET', path: '/x' } } };
      const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
        api: api as any,
        convexSiteUrl: 'https://example.convex.site',
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <CRPCProvider convexClient={{} as any} convexQueryClient={{} as any}>
          {children}
        </CRPCProvider>
      );

      const hook = renderHook(
        () => ({ client: useCRPCClient(), crpc: useCRPC() }),
        { wrapper }
      );

      const first = hook.result.current;
      hook.rerender();

      expect(hook.result.current.crpc).toBe(first.crpc);
      expect(hook.result.current.client).toBe(first.client);
      expect((hook.result.current.crpc as any).http).toBe(httpProxyStub);
    } finally {
      createHttpProxySpy.mockRestore();
      createOptionsProxySpy.mockRestore();
      createVanillaProxySpy.mockRestore();
    }
  });
});
