import type { QueryFunctionContext } from '@tanstack/solid-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ConvexQueryClient } from './client';

/** Create a mock ConvexClient stub */
function createConvexStub(overrides?: Record<string, unknown>) {
  return {
    client: { url: 'https://example.convex.cloud' },
    onUpdate: () => {
      const unsub: any = () => {};
      unsub.unsubscribe = unsub;
      unsub.getCurrentValue = () => undefined;
      return unsub;
    },
    query: async () => undefined,
    action: async () => undefined,
    ...overrides,
  } as any;
}

describe('ConvexQueryClient (server mode)', () => {
  test('queryClient getter throws when not connected', () => {
    const client = new ConvexQueryClient(createConvexStub());
    expect(() => client.queryClient).toThrow(
      'ConvexQueryClient not connected to TanStack QueryClient.'
    );
  });

  test('queryFn executes Convex queries via convexClient.query on client', async () => {
    const calls: Array<{ args: unknown; name: string }> = [];

    const convexClient = createConvexStub({
      query: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'query' });
        return { args, ok: true };
      },
    });
    const client = new ConvexQueryClient(convexClient);
    const fn = client.queryFn();
    const result = await fn({
      meta: { authType: 'required' },
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { status: 'open' }, name: 'query' }]);
    expect(result).toEqual({ args: { status: 'open' }, ok: true });
  });

  test('queryFn throws if a skipped query ever runs', async () => {
    const client = new ConvexQueryClient(createConvexStub());

    const fn = client.queryFn();
    await expect(
      fn({
        queryKey: ['convexQuery', 'todos:list', 'skip'],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).rejects.toThrow('Skipped query should not actually run');
  });

  test('hashFn uses Convex serialization for convexQuery/convexAction keys', () => {
    const client = new ConvexQueryClient(createConvexStub());
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

  test('queryFn executes Convex queries via convexClient.query', async () => {
    const calls: Array<{ args: unknown; name: string }> = [];

    const convexClient = createConvexStub({
      query: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'query' });
        return { args, ok: true };
      },
    });

    const client = new ConvexQueryClient(convexClient);
    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { status: 'open' }, name: 'query' }]);
    expect(result).toEqual({ args: { status: 'open' }, ok: true });
  });

  test('queryFn throws UNAUTHORIZED and calls onQueryUnauthorized when auth is required and unauthenticated', async () => {
    const onUnauthorized = vi.fn((_info: { queryName: string }) => {});

    const convexClient = createConvexStub({
      query: async () => {
        throw new Error('should not execute query');
      },
    });

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

    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
    });

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
    const onUnauthorized = vi.fn((_info: { queryName: string }) => {});

    const convexClient = createConvexStub({
      query: async () => {
        throw new Error('should not execute query');
      },
    });

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

    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
    });
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
    const convexClient = createConvexStub({
      query: async () => {
        // biome-ignore lint/style/useThrowOnlyError: testing convex error shape
        throw { data: { code: 'UNAUTHORIZED' } };
      },
    });

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

    const client = new ConvexQueryClient(convexClient, {
      authStore: authStore as any,
    });
    const fn = client.queryFn();
    await expect(
      fn({
        meta: { authType: 'required', skipUnauth: true },
        queryKey: ['convexQuery', 'user:getCurrentUser', {}],
      } as unknown as QueryFunctionContext<readonly unknown[]>)
    ).resolves.toBeNull();
  });

  test('queryFn executes Convex actions via convexClient.action', async () => {
    const calls: Array<{ args: unknown; name: string }> = [];

    const convexClient = createConvexStub({
      action: async (_fn: unknown, args: unknown) => {
        calls.push({ args, name: 'action' });
        return { args, ok: true };
      },
    });

    const client = new ConvexQueryClient(convexClient);
    const fn = client.queryFn();
    const result = await fn({
      queryKey: ['convexAction', 'ai:generate', { prompt: 'hi' }],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(calls).toEqual([{ args: { prompt: 'hi' }, name: 'action' }]);
    expect(result).toEqual({ args: { prompt: 'hi' }, ok: true });
  });

  test('queryFn falls back to other queryFn for non-Convex keys', async () => {
    const client = new ConvexQueryClient(createConvexStub());

    const otherFetch = vi.fn(async (ctx: any) => ({ ok: true, ctx }));
    const fn = client.queryFn(otherFetch as any);
    const result = await fn({
      queryKey: ['not-convex', 'x'],
    } as unknown as QueryFunctionContext<readonly unknown[]>);

    expect(otherFetch).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });
});
