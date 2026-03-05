import { describe, expect, test } from 'vitest';
import { fixedWindow, slidingWindow, tokenBucket } from './algorithms';
import { calculateRateLimit } from './calculate-rate-limit';

describe('calculateRateLimit', () => {
  test('fixed window restores capacity over elapsed windows', () => {
    const config = fixedWindow(5, '1 s');

    const first = calculateRateLimit(null, config, 1000, 3);
    expect(first.remaining).toBe(2);

    const second = calculateRateLimit(first.state, config, 1100, 3);
    expect(second.retryAfter).toBeDefined();
    expect(second.remaining).toBe(0);

    const third = calculateRateLimit(first.state, config, 2200, 1);
    expect(third.remaining).toBe(4);
  });

  test('token bucket refills continuously', () => {
    const config = tokenBucket(10, '10 s', 10);

    const first = calculateRateLimit(null, config, 0, 10);
    expect(first.remaining).toBe(0);

    const second = calculateRateLimit(first.state, config, 5000, 1);
    expect(second.remaining).toBe(4);
  });

  test('sliding window accounts for previous window weight', () => {
    const config = slidingWindow(10, '10 s');

    const state = {
      value: 8,
      ts: 0,
      auxValue: 0,
      auxTs: -10_000,
    };

    const evaluated = calculateRateLimit(state, config, 5000, 4);
    expect(evaluated.retryAfter).toBeDefined();
    expect(evaluated.remaining).toBe(0);
  });
});
