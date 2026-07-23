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

  test('refreshes auth queries based on identity changes', () => {
    const api = {} as any;
    const convexClient = {} as any;
    const convexQueryClient = {
      resetAuthQueries: mock(async () => {
        throw new Error('reset failed');
      }),
      softRefreshAuthQueries: mock(async () => {
        throw new Error('refresh failed');
      }),
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

    const makeJwt = (sub: string, tokenId: string) =>
      `a.${Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: tokenId,
          sub,
        })
      ).toString('base64')}.b`;
    const userA1 = makeJwt('user-a', 'token-1');
    const userA2 = makeJwt('user-a', 'token-2');
    const userB = makeJwt('user-b', 'token-3');

    const hook = renderHook(() => useMeta(), { wrapper });
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    // Token expiration is not decodable yet.
    authState = {
      isAuthenticated: false,
      token: 'opaque-session-token',
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).not.toHaveBeenCalled();

    // Anonymous to signed in cannot prove the same identity.
    authState = {
      isAuthenticated: true,
      token: userA1,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // A same-subject token re-mint is handled by the WebSocket layer.
    authState = {
      isAuthenticated: true,
      token: userA2,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);
    expect(convexQueryClient.softRefreshAuthQueries).not.toHaveBeenCalled();

    // A late auth-state settle for the same known subject preserves data.
    authState = {
      isAuthenticated: false,
      token: userA2,
    };
    hook.rerender();
    expect(convexQueryClient.softRefreshAuthQueries).toHaveBeenCalledTimes(1);
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(1);

    // Switching between known users hard-resets.
    authState = {
      isAuthenticated: false,
      token: userB,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(2);

    // A flip with an undecodable identity hard-resets.
    authState = {
      isAuthenticated: true,
      token: `a.${Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64')}.b`,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(3);

    // A token-only change with unknown identity also fails closed.
    authState = {
      isAuthenticated: true,
      token: `a.${Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: 'token-without-sub',
        })
      ).toString('base64')}.b`,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(4);

    // Sign-out remains a hard reset.
    authState = {
      isAuthenticated: false,
      token: null,
    };
    hook.rerender();
    expect(convexQueryClient.resetAuthQueries).toHaveBeenCalledTimes(5);
  });
});
