import { QueryClient } from '@tanstack/react-query';
import {
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
} from './singleton';

const unsetWindow = () => {
  Reflect.deleteProperty(globalThis, 'window');
};

const setWindow = () => {
  (globalThis as any).window = {};
};

describe('getQueryClientSingleton', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      unsetWindow();
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  test('returns a fresh client on server', () => {
    unsetWindow();
    let count = 0;
    const factory = () => {
      count++;
      return new QueryClient();
    };

    const first = getQueryClientSingleton(factory, 'test.query.server');
    const second = getQueryClientSingleton(factory, 'test.query.server');

    expect(first).not.toBe(second);
    expect(count).toBe(2);
  });

  test('returns a singleton on client', () => {
    setWindow();
    let count = 0;
    const factory = () => {
      count++;
      return new QueryClient();
    };

    const first = getQueryClientSingleton(factory, 'test.query.client');
    const second = getQueryClientSingleton(factory, 'test.query.client');

    expect(first).toBe(second);
    expect(count).toBe(1);
  });
});

describe('getConvexQueryClientSingleton', () => {
  const originalWindow = (globalThis as any).window;
  const convexStub = { url: 'https://example.convex.cloud' } as any;

  afterEach(() => {
    if (originalWindow === undefined) {
      unsetWindow();
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  test('creates a fresh ConvexQueryClient on server', () => {
    unsetWindow();

    const queryClient = new QueryClient();
    const first = getConvexQueryClientSingleton({
      convex: convexStub,
      queryClient,
      symbolKey: 'test.convex.server',
    });
    const second = getConvexQueryClientSingleton({
      convex: convexStub,
      queryClient,
      symbolKey: 'test.convex.server',
    });

    expect(first).not.toBe(second);
    const defaults = queryClient.getDefaultOptions().queries;
    expect(typeof defaults?.queryFn).toBe('function');
    expect(typeof defaults?.queryKeyHashFn).toBe('function');
  });

  test('reuses ConvexQueryClient singleton on client and updates auth store', () => {
    setWindow();

    const queryClient = new QueryClient();
    const authStoreA = {
      get: (_key: string) => null,
      set: (_key: string, _value: unknown) => {},
    } as any;
    const authStoreB = {
      get: (_key: string) => null,
      set: (_key: string, _value: unknown) => {},
    } as any;

    const first = getConvexQueryClientSingleton({
      authStore: authStoreA,
      convex: convexStub,
      queryClient,
      symbolKey: 'test.convex.client',
    });
    const updateSpy = spyOn(first, 'updateAuthStore');

    const second = getConvexQueryClientSingleton({
      authStore: authStoreB,
      convex: convexStub,
      queryClient,
      symbolKey: 'test.convex.client',
    });

    expect(first).toBe(second);
    expect(updateSpy).toHaveBeenCalledWith(authStoreB);

    const defaults = queryClient.getDefaultOptions().queries;
    expect(typeof defaults?.queryFn).toBe('function');
    expect(typeof defaults?.queryKeyHashFn).toBe('function');
  });
});
