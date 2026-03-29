import { QueryObserver } from '@tanstack/query-core';
import { QueryClient } from '@tanstack/react-query';

describe('ConvexQueryClient (client mode subscriptions)', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  test('subscribes via watchQuery when the first observer is added', async () => {
    (globalThis as any).window = {};
    // Bun supports cache-busting import specifiers; TypeScript doesn't understand them.
    // This is required so we can evaluate the module with `window` defined.
    // @ts-expect-error
    const mod = await import('./client.ts?subscriptions');
    const ConvexQueryClient = mod.ConvexQueryClient as any;

    const watchQueryCalls: unknown[] = [];
    let unsubscribeCalls = 0;

    const convexClient = {
      watchQuery: (...args: unknown[]) => {
        watchQueryCalls.push(args);
        return {
          onUpdate: (_cb: () => void) => () => {
            unsubscribeCalls++;
          },
        };
      },
    };

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

    expect(watchQueryCalls.length).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(1);

    unsubObserver();
    // unsubscribeDelay: 0 -> next tick cleanup
    await new Promise((r) => setTimeout(r, 0));

    expect(unsubscribeCalls).toBe(1);
    expect(Object.keys(client.subscriptions).length).toBe(0);
  });

  test('does not subscribe when meta.subscribe is false', async () => {
    (globalThis as any).window = {};
    // @ts-expect-error
    const mod = await import('./client.ts?subscriptions2');
    const ConvexQueryClient = mod.ConvexQueryClient as any;

    const convexClient = {
      watchQuery: () => {
        throw new Error('should not subscribe');
      },
    };

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

  test('unsubscribes immediately when query is removed from cache', async () => {
    (globalThis as any).window = {};
    // @ts-expect-error
    const mod = await import('./client.ts?subscriptions3');
    const ConvexQueryClient = mod.ConvexQueryClient as any;

    let unsubscribeCalls = 0;
    const convexClient = {
      watchQuery: () => ({
        onUpdate: (_cb: () => void) => () => {
          unsubscribeCalls++;
        },
      }),
    };

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
    (globalThis as any).window = {};
    // @ts-expect-error
    const mod = await import('./client.ts?subscriptions4');
    const ConvexQueryClient = mod.ConvexQueryClient as any;

    let unsubscribeCalls = 0;
    const convexClient = {
      watchQuery: () => ({
        onUpdate: (_cb: () => void) => () => {
          unsubscribeCalls++;
        },
      }),
    };

    const queryClient = new QueryClient();
    const client = new ConvexQueryClient(convexClient, {
      queryClient,
      unsubscribeDelay: 0,
    });

    // Simulate stale/HMR instance shape where the map is absent at runtime.
    delete (client as any).pendingUnsubscribes;

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
