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
  });

  afterEach(() => {
    useAuthStoreSpy.mockRestore();
    useFetchAccessTokenSpy.mockRestore();
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
});
