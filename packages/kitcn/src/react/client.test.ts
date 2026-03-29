import type { QueryFunctionContext } from '@tanstack/react-query';

describe('ConvexQueryClient (server mode)', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  async function getServerConvexQueryClient(id: string) {
    // Bun supports cache-busting import specifiers; TypeScript doesn't understand them.
    // This is required so we can evaluate the module with `window` undefined.
    const mod = await import(`./client.ts?server=${id}`);
    return mod.ConvexQueryClient as any;
  }

  test('queryClient getter throws when not connected', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('getter');
    const client = new ConvexQueryClient({
      url: 'https://example.convex.cloud',
    } as any);
    expect(() => client.queryClient).toThrow(
      'ConvexQueryClient not connected to TanStack QueryClient.'
    );
  });

  test('queryFn executes Convex queries via serverHttpClient (consistent by default)', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('consistent');
    const client = new ConvexQueryClient({
      url: 'https://example.convex.cloud',
    } as any);

    const calls: string[] = [];
    client.serverHttpClient = {
      action: async () => {
        throw new Error('unexpected action');
      },
      consistentQuery: async (_fn: unknown, args: unknown) => {
        calls.push('consistentQuery');
        return { args, ok: true };
      },
      query: async () => {
        calls.push('query');
        return { ok: false };
      },
    } as any;

    const fn = client.queryFn();
    const result = await fn({
      meta: { authType: 'required' },
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual(['consistentQuery']);
    expect(result).toEqual({ args: { status: 'open' }, ok: true });
  });

  test('queryFn uses serverHttpClient.query when dangerouslyUseInconsistentQueriesDuringSSR is enabled', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('inconsistent');
    const client = new ConvexQueryClient(
      {
        url: 'https://example.convex.cloud',
      } as any,
      { dangerouslyUseInconsistentQueriesDuringSSR: true }
    );

    const calls: string[] = [];
    client.serverHttpClient = {
      action: async () => {
        throw new Error('unexpected action');
      },
      consistentQuery: async () => {
        calls.push('consistentQuery');
        return { ok: false };
      },
      query: async (_fn: unknown, args: unknown) => {
        calls.push('query');
        return { args, ok: true };
      },
    } as any;

    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual(['query']);
    expect(result).toEqual({ args: { status: 'open' }, ok: true });
  });

  test('queryFn executes Convex actions via serverHttpClient.action', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('action');
    const client = new ConvexQueryClient({
      url: 'https://example.convex.cloud',
    } as any);

    const calls: Array<{ args: unknown; name: string }> = [];
    client.serverHttpClient = {
      action: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'action' });
        return { args, ok: true };
      },
      consistentQuery: async () => {
        throw new Error('unexpected query');
      },
      query: async () => {
        throw new Error('unexpected query');
      },
    } as any;

    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexAction', 'ai:generate', { prompt: 'hi' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { prompt: 'hi' }, name: 'action' }]);
    expect(result).toEqual({ args: { prompt: 'hi' }, ok: true });
  });

  test('queryFn throws if a skipped query ever runs', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('skip');
    const client = new ConvexQueryClient({
      url: 'https://example.convex.cloud',
    } as any);

    const fn = client.queryFn();
    await expect(
      fn({
        queryKey: ['convexQuery', 'todos:list', 'skip'],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).rejects.toThrow('Skipped query should not actually run');
  });

  test('hashFn uses Convex serialization for convexQuery/convexAction keys', async () => {
    const ConvexQueryClient = await getServerConvexQueryClient('hash');
    const client = new ConvexQueryClient({
      url: 'https://example.convex.cloud',
    } as any);
    const hash = client.hashFn();

    expect(hash(['convexQuery', 'todos:list', { a: 1, b: 2 }])).toBe(
      `convexQuery|todos:list|${JSON.stringify({ a: 1, b: 2 })}`
    );
    expect(hash(['convexAction', 'ai:generate', { prompt: 'hi' }])).toBe(
      `convexAction|ai:generate|${JSON.stringify({ prompt: 'hi' })}`
    );
  });
});

describe('ConvexQueryClient (client mode)', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = {};
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  async function getClientConvexQueryClient(id: string) {
    // Bun supports cache-busting import specifiers; TypeScript doesn't understand them.
    // This is required so we can evaluate the module with `window` defined.
    const mod = await import(`./client.ts?client=${id}`);
    return mod.ConvexQueryClient as any;
  }

  test('queryFn executes Convex queries via convexClient.query', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('query');
    const calls: Array<{ args: unknown; name: string }> = [];

    const convexClient = {
      action: async () => {
        throw new Error('unexpected action');
      },
      query: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'query' });
        return { args, ok: true };
      },
    };

    const client = new ConvexQueryClient(convexClient);
    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { status: 'open' }, name: 'query' }]);
    expect(result).toEqual({ args: { status: 'open' }, ok: true });
  });

  test('queryFn throws UNAUTHORIZED and calls onQueryUnauthorized when auth is required and unauthenticated', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('unauth');
    const onUnauthorized = mock((_info: { queryName: string }) => {});

    const convexClient = {
      query: async () => {
        throw new Error('should not execute query');
      },
    };

    const authStore = {
      get: (key: string) => {
        switch (key) {
          case 'isLoading':
            return false;
          case 'isAuthenticated':
            return false;
          case 'onQueryUnauthorized':
            return onUnauthorized;
          case 'isUnauthorized':
            return () => false;
          default:
            return;
        }
      },
    };

    const client = new ConvexQueryClient(convexClient, { authStore });

    const fn = client.queryFn();
    await expect(
      fn({
        meta: { authType: 'required' },
        queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).rejects.toThrow('UNAUTHORIZED');

    expect(onUnauthorized).toHaveBeenCalledWith({ queryName: 'todos:list' });
  });

  test('queryFn returns null when auth is required, unauthenticated, and skipUnauth is true', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('skip-unauth');
    const onUnauthorized = mock((_info: { queryName: string }) => {});

    const convexClient = {
      query: async () => {
        throw new Error('should not execute query');
      },
    };

    const authStore = {
      get: (key: string) => {
        switch (key) {
          case 'isLoading':
            return false;
          case 'isAuthenticated':
            return false;
          case 'onQueryUnauthorized':
            return onUnauthorized;
          case 'isUnauthorized':
            return () => false;
          default:
            return;
        }
      },
    };

    const client = new ConvexQueryClient(convexClient, { authStore });
    const fn = client.queryFn();
    await expect(
      fn({
        meta: { authType: 'required', skipUnauth: true },
        queryKey: ['convexQuery', 'user:getCurrentUser', {}],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).resolves.toBeNull();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  test('queryFn returns null when skipUnauth is true and backend returns UNAUTHORIZED', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient(
      'skip-unauth-backend'
    );

    const convexClient = {
      query: async () => {
        throw { data: { code: 'UNAUTHORIZED' } };
      },
    };

    const authStore = {
      get: (key: string) => {
        switch (key) {
          case 'isLoading':
            return false;
          case 'isAuthenticated':
            return true;
          case 'onQueryUnauthorized':
            return () => {};
          case 'isUnauthorized':
            return () => true;
          default:
            return;
        }
      },
    };

    const client = new ConvexQueryClient(convexClient as any, { authStore });
    const fn = client.queryFn();
    await expect(
      fn({
        meta: { authType: 'required', skipUnauth: true },
        queryKey: ['convexQuery', 'user:getCurrentUser', {}],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).resolves.toBeNull();
  });

  test('queryFn executes Convex actions via convexClient.action', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('action');
    const calls: Array<{ args: unknown; name: string }> = [];

    const convexClient = {
      action: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'action' });
        return { args, ok: true };
      },
      query: async () => {
        throw new Error('unexpected query');
      },
    };

    const client = new ConvexQueryClient(convexClient);
    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexAction', 'ai:generate', { prompt: 'hi' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { prompt: 'hi' }, name: 'action' }]);
    expect(result).toEqual({ args: { prompt: 'hi' }, ok: true });
  });

  test('queryFn falls back to other queryFn for non-Convex keys', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('fallback');
    const client = new ConvexQueryClient({
      query: async () => undefined,
    } as any);

    const otherFetch = mock(async (ctx: any) => ({ ok: true, ctx }));
    const fn = client.queryFn(otherFetch as any);
    const result = await fn({
      queryKey: ['not-convex', 'x'],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(otherFetch).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });
});
