import type {
  FixedWindowAlgorithm,
  RateLimitState,
  ResolvedAlgorithm,
  SlidingWindowAlgorithm,
  TokenBucketAlgorithm,
} from '../types';

export type EvaluationResult = {
  state: RateLimitState;
  retryAfter?: number;
  remaining: number;
  reset: number;
  limit: number;
};

export function calculateRateLimit(
  state: RateLimitState | null,
  algorithm: ResolvedAlgorithm,
  now: number,
  count: number
): EvaluationResult {
  if (algorithm.kind === 'fixedWindow') {
    return calculateFixedWindow(state, algorithm, now, count);
  }
  if (algorithm.kind === 'tokenBucket') {
    return calculateTokenBucket(state, algorithm, now, count);
  }
  return calculateSlidingWindow(state, algorithm, now, count);
}

function calculateTokenBucket(
  state: RateLimitState | null,
  config: TokenBucketAlgorithm,
  now: number,
  count: number
): EvaluationResult {
  const ratePerMs = config.refillRate / config.interval;
  const initial = state ?? { value: config.maxTokens, ts: now };
  const elapsed = Math.max(0, now - initial.ts);
  const available = Math.min(
    initial.value + elapsed * ratePerMs,
    config.maxTokens
  );
  const nextValue = available - count;
  const retryAfter =
    nextValue < 0 ? Math.ceil(-nextValue / ratePerMs) : undefined;

  return {
    state: { value: nextValue, ts: now },
    retryAfter,
    remaining: Math.max(0, Math.floor(nextValue)),
    reset: retryAfter ? now + retryAfter : now,
    limit: config.maxTokens,
  };
}

function calculateFixedWindow(
  state: RateLimitState | null,
  config: FixedWindowAlgorithm,
  now: number,
  count: number
): EvaluationResult {
  const windowStart = alignWindowStart(now, config.window, config.start);
  const initial = state ?? {
    value: config.capacity,
    ts: windowStart,
  };

  const elapsedWindows = Math.max(
    0,
    Math.floor((now - initial.ts) / config.window)
  );
  const replenished = Math.min(
    initial.value + config.limit * elapsedWindows,
    config.capacity
  );
  const ts = initial.ts + elapsedWindows * config.window;
  const nextValue = replenished - count;

  const retryAfter =
    nextValue < 0
      ? ts + config.window * Math.ceil(-nextValue / config.limit) - now
      : undefined;

  return {
    state: { value: nextValue, ts },
    retryAfter,
    remaining: Math.max(0, Math.floor(nextValue)),
    reset: ts + config.window,
    limit: config.limit,
  };
}

function calculateSlidingWindow(
  state: RateLimitState | null,
  config: SlidingWindowAlgorithm,
  now: number,
  count: number
): EvaluationResult {
  const windowStart = alignWindowStart(now, config.window);
  const previousWindowStart = windowStart - config.window;
  const elapsedInWindow = now - windowStart;
  const previousWeight = Math.max(
    0,
    (config.window - elapsedInWindow) / config.window
  );

  let currentCount = 0;
  let previousCount = 0;

  if (state) {
    if (state.ts === windowStart) {
      currentCount = Math.max(0, state.value);
      if (state.auxTs === previousWindowStart) {
        previousCount = Math.max(0, state.auxValue ?? 0);
      }
    } else if (state.ts === previousWindowStart) {
      previousCount = Math.max(0, state.value);
    }
  }

  const projectedCurrent = currentCount + count;
  const projectedUsed = projectedCurrent + previousCount * previousWeight;
  const remaining = config.limit - projectedUsed;
  const retryAfter =
    remaining < 0 ? Math.max(1, config.window - elapsedInWindow) : undefined;

  return {
    state: {
      value: projectedCurrent,
      ts: windowStart,
      auxValue: previousCount,
      auxTs: previousWindowStart,
    },
    retryAfter,
    remaining: Math.max(0, Math.floor(remaining)),
    reset: windowStart + config.window,
    limit: config.limit,
  };
}

function alignWindowStart(now: number, window: number, start = 0): number {
  const offsetNow = now - start;
  return start + Math.floor(offsetNow / window) * window;
}
