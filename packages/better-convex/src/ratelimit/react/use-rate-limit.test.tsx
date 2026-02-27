import { act, renderHook } from '@testing-library/react';
import * as convexReact from 'convex/react';
import { getFunctionName } from 'convex/server';
import { useRateLimit } from './use-rate-limit';

const getRateLimitRef = 'ratelimitDemo:getInteractiveRateLimit' as const;
const getServerTimeRef = 'ratelimitDemo:getInteractiveServerTime' as const;

describe('useRateLimit', () => {
  let useQuerySpy: ReturnType<typeof spyOn>;
  let useConvexSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useConvexSpy = spyOn(convexReact, 'useConvex').mockReturnValue({
      mutation: mock(async () => Date.now()),
    } as any);
    useQuerySpy = spyOn(convexReact, 'useQuery').mockReturnValue(
      undefined as any
    );
  });

  afterEach(() => {
    useQuerySpy.mockRestore();
    useConvexSpy.mockRestore();
  });

  test('returns undefined status while the rate-limit snapshot is loading', () => {
    const { result } = renderHook(() => useRateLimit(getRateLimitRef));

    expect(result.current.status).toBeUndefined();
    expect(result.current.check()).toBeUndefined();
  });

  test('projects fixed-window snapshots and returns allowed status', () => {
    const now = 1_000_000;
    const nowSpy = spyOn(Date, 'now').mockReturnValue(now);
    useQuerySpy.mockReturnValue({
      value: 5,
      ts: now,
      shard: 0,
      config: {
        kind: 'fixedWindow',
        limit: 10,
        window: 60_000,
        capacity: 10,
        shards: 1,
      },
    } as any);

    try {
      const { result } = renderHook(() =>
        useRateLimit(getRateLimitRef, { count: 1 })
      );

      expect(result.current.status).toEqual({ ok: true, retryAt: undefined });

      const projected = result.current.check(now, 1);
      expect(projected?.ok).toBe(true);
      expect(projected?.value).toBe(4);
      expect(projected?.retryAt).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('returns blocked status and retryAt for sliding-window snapshots', () => {
    const now = 2_000_000;
    const nowSpy = spyOn(Date, 'now').mockReturnValue(now);
    useQuerySpy.mockReturnValue({
      value: 0,
      ts: now,
      shard: 0,
      config: {
        kind: 'slidingWindow',
        limit: 1,
        window: 30_000,
        maxReserved: undefined,
        shards: 1,
      },
    } as any);

    try {
      const { result } = renderHook(() =>
        useRateLimit(getRateLimitRef, { count: 1 })
      );

      expect(result.current.status).toEqual({
        ok: false,
        retryAt: now + 30_000,
      });

      const projected = result.current.check(now, 1);
      expect(projected?.ok).toBe(false);
      expect(projected?.value).toBe(-1);
      expect(projected?.retryAt).toBe(now + 30_000);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('applies server-time offset when getServerTimeMutation is provided', async () => {
    const now = 5_000;
    const nowSpy = spyOn(Date, 'now').mockReturnValue(now);
    const mutation = mock(
      async (_ref: unknown, _args: Record<string, never>) => now + 1_000
    );
    useConvexSpy.mockReturnValue({ mutation } as any);
    useQuerySpy.mockReturnValue({
      value: 0,
      ts: 0,
      shard: 0,
      config: {
        kind: 'tokenBucket',
        refillRate: 1,
        interval: 1000,
        maxTokens: 1,
        maxReserved: undefined,
        shards: 1,
      },
    } as any);

    try {
      const { result } = renderHook(() =>
        useRateLimit(getRateLimitRef, {
          count: 1,
          getServerTimeMutation: getServerTimeRef,
        })
      );

      expect(result.current.check(500, 1)?.ok).toBe(false);

      await act(async () => {
        await Promise.resolve();
      });

      const [calledRef, calledArgs] = mutation.mock.calls[0] ?? [];
      expect(calledArgs).toEqual({});
      expect(getFunctionName(calledRef as any)).toBe(getServerTimeRef);
      expect(result.current.check(500, 1)?.ok).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
