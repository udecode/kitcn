import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as convexSolid from '../../../solid/convex-solid';
import type { RateLimitSnapshot } from '../types';
import { useRateLimit } from './use-rate-limit';

describe('useRateLimit (solid)', () => {
  let snapshotForTest: RateLimitSnapshot | undefined;

  beforeEach(() => {
    snapshotForTest = undefined;

    vi.spyOn(convexSolid, 'useConvex').mockReturnValue({
      mutation: vi.fn(async () => Date.now()),
      onUpdate: vi.fn(
        (
          _ref: unknown,
          _args: unknown,
          cb: (data: RateLimitSnapshot) => void
        ) => {
          if (snapshotForTest) cb(snapshotForTest);
          return () => {};
        }
      ),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('sliding-window checks recover as time advances without a fresh snapshot', () => {
    const start = Math.floor(Date.now() / 1000) * 1000;
    snapshotForTest = {
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

    const result = useRateLimit('ratelimit/getRateLimit', { count: 1 });

    const immediate = result.check(start, 1);
    const recovered = result.check(start + 1500, 1);

    expect(immediate?.ok).toBe(false);
    expect(recovered?.ok).toBe(true);
  });

  test('sliding-window retryAt uses remaining window time, not a full new window', () => {
    const start = Math.floor(Date.now() / 1000) * 1000;
    snapshotForTest = {
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

    const result = useRateLimit('ratelimit/getRateLimit', { count: 1 });

    const blockedNearBoundary = result.check(start + 900, 1);

    expect(blockedNearBoundary?.ok).toBe(false);
    expect(blockedNearBoundary?.retryAt).toBeDefined();
    expect(blockedNearBoundary!.retryAt!).toBeLessThan(start + 1200);
  });
});
