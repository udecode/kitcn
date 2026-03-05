import { renderHook } from '@testing-library/react';
import * as convexReact from 'convex/react';
import type { RateLimitSnapshot } from '../types';
import { useRateLimit } from './use-rate-limit';

describe('useRateLimit', () => {
  let useQuerySpy: ReturnType<typeof spyOn>;
  let useConvexSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useQuerySpy = spyOn(convexReact, 'useQuery');
    useConvexSpy = spyOn(convexReact, 'useConvex').mockReturnValue({
      mutation: mock(async () => Date.now()),
    } as any);
  });

  afterEach(() => {
    useQuerySpy.mockRestore();
    useConvexSpy.mockRestore();
  });

  test('sliding-window checks recover as time advances without a fresh snapshot', () => {
    const start = Math.floor(Date.now() / 1000) * 1000;
    const snapshot: RateLimitSnapshot = {
      value: 0,
      ts: start,
      shard: 0,
      config: {
        kind: 'slidingWindow',
        limit: 10,
        window: 1000,
        shards: 1,
      },
    };
    useQuerySpy.mockReturnValue(snapshot as any);

    const { result } = renderHook(() =>
      useRateLimit('ratelimit/getRateLimit', { count: 1 })
    );

    const immediate = result.current.check(start, 1);
    const recovered = result.current.check(start + 1500, 1);

    expect(immediate?.ok).toBe(false);
    expect(recovered?.ok).toBe(true);
  });

  test('sliding-window retryAt uses remaining window time, not a full new window', () => {
    const start = Math.floor(Date.now() / 1000) * 1000;
    const snapshot: RateLimitSnapshot = {
      value: 0,
      ts: start,
      shard: 0,
      config: {
        kind: 'slidingWindow',
        limit: 10,
        window: 1000,
        shards: 1,
      },
    };
    useQuerySpy.mockReturnValue(snapshot as any);

    const { result } = renderHook(() =>
      useRateLimit('ratelimit/getRateLimit', { count: 1 })
    );

    const blockedNearBoundary = result.current.check(start + 900, 1);

    expect(blockedNearBoundary?.ok).toBe(false);
    expect(blockedNearBoundary?.retryAt).toBeDefined();
    expect(blockedNearBoundary!.retryAt!).toBeLessThan(start + 1200);
  });
});
