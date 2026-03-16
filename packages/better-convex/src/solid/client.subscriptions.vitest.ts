import { QueryObserver } from '@tanstack/query-core';
import { QueryClient } from '@tanstack/solid-query';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ConvexQueryClient } from './client';

/** Create a mock onUpdate returning an Unsubscribe-like object */
function createMockOnUpdate(opts?: {
  onUnsubscribe?: () => void;
  trackCalls?: unknown[];
}) {
  return (
    _query: unknown,
    _args: unknown,
    _cb: () => void,
    _onError?: (e: Error) => void
  ) => {
    opts?.trackCalls?.push([_query, _args, _cb, _onError]);
    const unsub: any = () => {
      opts?.onUnsubscribe?.();
    };
    unsub.unsubscribe = unsub;
    unsub.getCurrentValue = () => undefined;
    return unsub;
  };
}

describe('ConvexQueryClient (client mode subscriptions)', () => {
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

  test('subscribes via onUpdate when the first observer is added', async () => {
    const onUpdateCalls: unknown[] = [];
    let unsubscribeCalls = 0;

    const convexClient = {
      client: { url: 'https://example.convex.cloud' },
      onUpdate: createMockOnUpdate({
        trackCalls: onUpdateCalls,
        onUnsubscribe: () => {
          unsubscribeCalls++;
        },
      }),
      query: async () => undefined,
      action: async () => undefined,
    } as any;

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { authType: 'optional', subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    expect(onUpdateCalls.length).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(1);

    unsubObserver();
    // unsubscribeDelay: 0 -> next tick cleanup
    await new Promise((r) => setTimeout(r, 0));

    expect(unsubscribeCalls).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(0);
  });

  test('does not subscribe when meta.subscribe is false', () => {
    const convexClient = {
      client: { url: 'https://example.convex.cloud' },
      onUpdate: () => {
        throw new Error('should not subscribe');
      },
      query: async () => undefined,
      action: async () => undefined,
    } as any;

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { authType: 'optional', subscribe: false },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    expect(Object.keys(client.subscriptions).length).toBe(0);
    unsubObserver();
  });

  test('unsubscribes immediately when query is removed from cache', () => {
    let unsubscribeCalls = 0;
    const convexClient = {
      client: { url: 'https://example.convex.cloud' },
      onUpdate: createMockOnUpdate({
        onUnsubscribe: () => {
          unsubscribeCalls++;
        },
      }),
      query: async () => undefined,
      action: async () => undefined,
    } as any;

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 50,
    });

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    expect(Object.keys(client.subscriptions).length).toBe(1);

    // Force removal from cache -> should unsubscribe immediately
    queryClient.removeQueries({ queryKey: queryKey as any });

    expect(unsubscribeCalls).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(0);

    unsubObserver();
  });

  test('recreates pending unsubscribe map if missing during observer cleanup', async () => {
    let unsubscribeCalls = 0;
    const convexClient = {
      client: { url: 'https://example.convex.cloud' },
      onUpdate: createMockOnUpdate({
        onUnsubscribe: () => {
          unsubscribeCalls++;
        },
      }),
      query: async () => undefined,
      action: async () => undefined,
    } as any;

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    // Simulate stale/HMR instance shape where the map is absent at runtime.
    (client as any).pendingUnsubscribes = undefined;

    const queryKey = ['convexQuery', 'todos:list', { status: 'open' }] as const;
    const observer = new QueryObserver(queryClient as any, {
      meta: { subscribe: true },
      queryFn: async () => ({ ok: true }),
      queryKey,
    });
    const unsubObserver = observer.subscribe(() => {});

    expect(Object.keys(client.subscriptions).length).toBe(1);

    unsubObserver();
    await new Promise((r) => setTimeout(r, 0));

    expect(unsubscribeCalls).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(0);
  });
});
