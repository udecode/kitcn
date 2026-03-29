import { QueryObserver } from '@tanstack/query-core';
import type { QueryFunctionContext } from '@tanstack/solid-query';
import { QueryClient } from '@tanstack/solid-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CRPCClientError } from '../crpc/error';
import { ConvexQueryClient } from './client';

/** Create a mock ConvexClient with onUpdate returning an Unsubscribe-like object */
function createMockConvexClient(opts?: {
  onUpdateCb?: (cb: () => void, onError?: (e: Error) => void) => void;
  getCurrentValue?: () => unknown;
  onUnsubscribe?: () => void;
}) {
  return {
    client: { url: 'https://example.convex.cloud' },
    onUpdate: (
      _query: unknown,
      _args: unknown,
      cb: () => void,
      onError?: (e: Error) => void
    ) => {
      opts?.onUpdateCb?.(cb, onError);
      const unsub: any = () => {
        opts?.onUnsubscribe?.();
      };
      unsub.unsubscribe = unsub;
      unsub.getCurrentValue = opts?.getCurrentValue ?? (() => undefined);
      return unsub;
    },
    query: async () => undefined,
    action: async () => undefined,
  } as any;
}

describe('ConvexQueryClient (client mode lifecycle)', () => {
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

  test('connect is idempotent for the same queryClient and unsubscribes when switching clients', () => {
    const queryClient1 = new QueryClient();
    let unsub1Calls = 0;
    vi.spyOn(queryClient1.getQueryCache(), 'subscribe').mockImplementation(
      () => () => {
        unsub1Calls++;
      }
    );

    const queryClient2 = new QueryClient();
    let unsub2Calls = 0;
    vi.spyOn(queryClient2.getQueryCache(), 'subscribe').mockImplementation(
      () => () => {
        unsub2Calls++;
      }
    );

    const convexClient = createMockConvexClient();

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

  test('unsubscribeAuthQueries unsubscribes only authType=required subscriptions', () => {
    const unsubCalls: Record<string, number> = {
      required: 0,
      optional: 0,
    };
    const convexClient = {
      client: { url: 'https://example.convex.cloud' },
      onUpdate: (
        fn: unknown,
        _args: unknown,
        _cb: () => void,
        _onError?: (e: Error) => void
      ) => {
        const name = String(fn);
        const bucket = name.includes('required') ? 'required' : 'optional';
        const unsub: any = () => {
          unsubCalls[bucket]++;
        };
        unsub.unsubscribe = unsub;
        unsub.getCurrentValue = () => undefined;
        return unsub;
      },
      query: async () => undefined,
      action: async () => undefined,
    } as any;

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

  test('onUpdateQueryKeyHash does not overwrite existing data with null/undefined subscription values', () => {
    const queryClient = new QueryClient();
    const convexClient = createMockConvexClient();
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
      getCurrentValue: () => localQueryValue,
      unsubscribe: () => {},
      lastError: undefined,
    };

    const setQueryData = vi.spyOn(queryClient, 'setQueryData');

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

  test('onUpdateQueryKeyHash pushes error state and calls onQueryUnauthorized when server returns auth error', () => {
    const onQueryUnauthorized = vi.fn(async () => undefined);
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
    const convexClient = createMockConvexClient();
    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
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
      getCurrentValue: () => undefined,
      unsubscribe: () => {},
      lastError: new Error('unauthorized'),
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'todos:list',
    });

    unsubObserver();
  });

  test('onUpdateQueryKeyHash resolves skipUnauth auth errors to null without onQueryUnauthorized', () => {
    const onQueryUnauthorized = vi.fn(async () => undefined);
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
    const convexClient = createMockConvexClient();
    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
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
      getCurrentValue: () => undefined,
      unsubscribe: () => {},
      lastError: new Error('unauthorized'),
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKey as any)).toBeNull();
    expect((query as any).state.status).toBe('success');

    unsubObserver();
  });

  test('onUpdateQueryKeyHash does not call onQueryUnauthorized when already unauthenticated', () => {
    const onQueryUnauthorized = vi.fn(async () => undefined);
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
    const convexClient = createMockConvexClient();
    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
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
      getCurrentValue: () => undefined,
      unsubscribe: () => {},
      lastError: new Error('unauthorized'),
    };

    client.onUpdateQueryKeyHash((query as any).queryHash);

    expect(onQueryUnauthorized).not.toHaveBeenCalled();
    expect((query as any).state.status).toBe('error');

    unsubObserver();
  });

  test('queryFn enforces authType=required on client and throws CRPCClientError', async () => {
    const onQueryUnauthorized = vi.fn(async () => undefined);
    const authStore = {
      get: (key: string) => {
        if (key === 'isLoading') return false;
        if (key === 'isAuthenticated') return false;
        if (key === 'onQueryUnauthorized') return onQueryUnauthorized;
        if (key === 'isUnauthorized') return () => false;
        return;
      },
    };

    const convexClient = createMockConvexClient();
    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
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
