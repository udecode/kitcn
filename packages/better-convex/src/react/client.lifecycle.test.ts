import { QueryObserver } from '@tanstack/query-core';
import type { QueryFunctionContext } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { CRPCClientError } from '../crpc/error';

describe('ConvexQueryClient (client mode lifecycle)', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  async function getClientConvexQueryClient(id: string) {
    (globalThis as any).window = {};
    // Bun supports cache-busting import specifiers; TypeScript doesn't understand them.
    // This is required so we can evaluate the module with `window` defined.
    const mod = await import(`./client.ts?client=${id}`);
    return mod.ConvexQueryClient as any;
  }

  test('connect is idempotent for the same queryClient and unsubscribes when switching clients', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('connect');

    const queryClient1 = new QueryClient();
    let unsub1Calls = 0;
    spyOn(queryClient1.getQueryCache(), 'subscribe').mockImplementation(
      () => () => {
        unsub1Calls++;
      }
    );

    const queryClient2 = new QueryClient();
    let unsub2Calls = 0;
    spyOn(queryClient2.getQueryCache(), 'subscribe').mockImplementation(
      () => () => {
        unsub2Calls++;
      }
    );

    const convexClient = {
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };

    const client = new ConvexQueryClient(convexClient, {
      queryClient: queryClient1,
      unsubscribeDelay: 0,
    });

    client.connect(queryClient1);
    expect(unsub1Calls).toBe(0);

    client.connect(queryClient2);
    expect(unsub1Calls).toBe(1);

    client.destroy();
    expect(unsub2Calls).toBe(1);
  });

  test('unsubscribeAuthQueries unsubscribes only authType=required subscriptions', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('auth-queries');

    const unsubCalls: Record<string, number> = {
      required: 0,
      optional: 0,
    };
    const convexClient = {
      watchQuery: (fn: unknown) => {
        const name = String(fn);
        const bucket = name.includes('required')
          ? 'required'
          : name.includes('optional')
            ? 'optional'
            : 'optional';
        return {
          localQueryResult: () => undefined,
          onUpdate: () => () => {
            unsubCalls[bucket]++;
          },
        };
      },
    };

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    const requiredKey = [
      'convexQuery',
      'todos:required',
      { status: 'open' },
    ] as const;
    const optionalKey = [
      'convexQuery',
      'todos:optional',
      { status: 'open' },
    ] as const;

    const requiredObserver = new QueryObserver(queryClient as any, {
      meta: { authType: 'required' },
      queryFn: async () => ({ ok: true }),
      queryKey: requiredKey,
    });
    const unsubRequired = requiredObserver.subscribe(() => {});

    const optionalObserver = new QueryObserver(queryClient as any, {
      meta: { authType: 'optional' },
      queryFn: async () => ({ ok: true }),
      queryKey: optionalKey,
    });
    const unsubOptional = optionalObserver.subscribe(() => {});

    expect(Object.keys(client.subscriptions).length).toBe(2);

    client.unsubscribeAuthQueries();

    expect(unsubCalls.required).toBe(1);
    expect(unsubCalls.optional).toBe(0);
    expect(Object.keys(client.subscriptions).length).toBe(1);

    unsubRequired();
    unsubOptional();
  });

  test('onUpdateQueryKeyHash does not overwrite existing data with null/undefined subscription values', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('update-values');

    const queryClient = new QueryClient();
    const convexClient = {
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    queryClient.setQueryData(queryKey as any, { existing: true });

    const observer = new QueryObserver(queryClient as any, {
      meta: { subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    const query =
      queryClient
        .getQueryCache()
        .getAll()
        .find((q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)) ??
      null;
    expect(query).not.toBeNull();

    let localQueryValue: unknown;
    client.subscriptions[(query as any).queryHash] = {
      queryKey: queryKey as any,
      watch: {
        localQueryResult: () => localQueryValue,
      } as any,
      unsubscribe: () => {},
    };

    const setQueryData = spyOn(queryClient, 'setQueryData');

    // undefined -> should NOT overwrite existing data
    client.onUpdateQueryKeyHash((query as any).queryHash);
    expect(setQueryData).not.toHaveBeenCalled();

    // null -> should NOT overwrite existing data
    localQueryValue = null;
    client.onUpdateQueryKeyHash((query as any).queryHash);
    expect(setQueryData).not.toHaveBeenCalled();

    // non-nullish -> should update
    localQueryValue = { updated: true };
    client.onUpdateQueryKeyHash((query as any).queryHash);
    expect(setQueryData).toHaveBeenCalledTimes(1);
    expect(setQueryData).toHaveBeenCalledWith(queryKey as any, {
      updated: true,
    });

    unsubObserver();
  });

  test('onUpdateQueryKeyHash pushes error state and calls onQueryUnauthorized when server returns auth error', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('update-errors');

    const onQueryUnauthorized = mock(async () => undefined);
    const authStore = {
      get: (key: string) => {
        if (key === 'isLoading') return false;
        if (key === 'isAuthenticated') return true;
        if (key === 'onQueryUnauthorized') return onQueryUnauthorized;
        if (key === 'isUnauthorized') {
          return (error: unknown) =>
            error instanceof Error && error.message === 'unauthorized';
        }
        return;
      },
    };

    const queryClient = new QueryClient();
    const convexClient = {
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };
    const client = new ConvexQueryClient(convexClient, {
      authStore,
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { authType: 'required', subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    const query =
      queryClient
        .getQueryCache()
        .getAll()
        .find((q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)) ??
      null;
    expect(query).not.toBeNull();

    client.subscriptions[(query as any).queryHash] = {
      queryKey: queryKey as any,
      watch: {
        localQueryResult: () => {
          throw new Error('unauthorized');
        },
      } as any,
      unsubscribe: () => {},
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'todos:list',
    });

    unsubObserver();
  });

  test('onUpdateQueryKeyHash resolves skipUnauth auth errors to null without onQueryUnauthorized', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient(
      'update-errors-skip-unauth'
    );

    const onQueryUnauthorized = mock(async () => undefined);
    const authStore = {
      get: (key: string) => {
        if (key === 'isLoading') return false;
        if (key === 'isAuthenticated') return true;
        if (key === 'onQueryUnauthorized') return onQueryUnauthorized;
        if (key === 'isUnauthorized') {
          return (error: unknown) =>
            error instanceof Error && error.message === 'unauthorized';
        }
        return;
      },
    };

    const queryClient = new QueryClient();
    const convexClient = {
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };
    const client = new ConvexQueryClient(convexClient, {
      authStore,
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'user:getCurrentUser', {}] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { authType: 'required', skipUnauth: true, subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    const query =
      queryClient
        .getQueryCache()
        .getAll()
        .find((q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)) ??
      null;
    expect(query).not.toBeNull();

    client.subscriptions[(query as any).queryHash] = {
      queryKey: queryKey as any,
      watch: {
        localQueryResult: () => {
          throw new Error('unauthorized');
        },
      } as any,
      unsubscribe: () => {},
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKey as any)).toBeNull();
    expect((query as any).state.status).toBe('success');

    unsubObserver();
  });

  test('onUpdateQueryKeyHash does not call onQueryUnauthorized when already unauthenticated', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient(
      'update-errors-logout'
    );

    const onQueryUnauthorized = mock(async () => undefined);
    const authStore = {
      get: (key: string) => {
        if (key === 'isLoading') return false;
        if (key === 'isAuthenticated') return false;
        if (key === 'onQueryUnauthorized') return onQueryUnauthorized;
        if (key === 'isUnauthorized') {
          return (error: unknown) =>
            error instanceof Error && error.message === 'unauthorized';
        }
        return;
      },
    };

    const queryClient = new QueryClient();
    const convexClient = {
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };
    const client = new ConvexQueryClient(convexClient, {
      authStore,
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { authType: 'required', subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    const query =
      queryClient
        .getQueryCache()
        .getAll()
        .find((q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)) ??
      null;
    expect(query).not.toBeNull();

    client.subscriptions[(query as any).queryHash] = {
      queryKey: queryKey as any,
      watch: {
        localQueryResult: () => {
          throw new Error('unauthorized');
        },
      } as any,
      unsubscribe: () => {},
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).not.toHaveBeenCalled();
    expect((query as any).state.status).toBe('error');

    unsubObserver();
  });

  test('queryFn enforces authType=required on client and throws CRPCClientError', async () => {
    const ConvexQueryClient = await getClientConvexQueryClient('queryfn-auth');

    const onQueryUnauthorized = mock(async () => undefined);
    const authStore = {
      get: (key: string) => {
        if (key === 'isLoading') return false;
        if (key === 'isAuthenticated') return false;
        if (key === 'onQueryUnauthorized') return onQueryUnauthorized;
        if (key === 'isUnauthorized') return () => false;
        return;
      },
    };

    const convexClient = {
      action: async () => {
        throw new Error('unexpected action');
      },
      query: async () => {
        throw new Error('unexpected query');
      },
      watchQuery: () => ({
        onUpdate: () => () => {},
      }),
    };
    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      authStore,
      queryClient,
      unsubscribeDelay: 0,
    });

    const fn = client.queryFn();
    await expect(
      fn({
        meta: { authType: 'required' },
        queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).rejects.toBeInstanceOf(CRPCClientError);
    await expect(
      fn({
        meta: { authType: 'required' },
        queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      functionName: 'todos:list',
    });
    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'todos:list',
    });
  });
});
