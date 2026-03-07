import { type Duration, toMs } from '../duration';
import type {
  AlgorithmOptions,
  FixedWindowAlgorithm,
  ResolvedAlgorithm,
  SlidingWindowAlgorithm,
  TokenBucketAlgorithm,
} from '../types';

const DEFAULT_SHARDS = 1;

export function fixedWindow(
  limit: number,
  window: Duration,
  options?: AlgorithmOptions
): FixedWindowAlgorithm {
  validatePositive(limit, 'limit');
  const shards = normalizeShards(options?.shards);
  const capacity = options?.capacity ?? limit;
  validatePositive(capacity, 'capacity');

  return {
    kind: 'fixedWindow',
    limit,
    window: toMs(window),
    capacity,
    maxReserved: options?.maxReserved,
    start: options?.start,
    shards,
  };
}

export function slidingWindow(
  limit: number,
  window: Duration,
  options?: AlgorithmOptions
): SlidingWindowAlgorithm {
  validatePositive(limit, 'limit');

  return {
    kind: 'slidingWindow',
    limit,
    window: toMs(window),
    maxReserved: options?.maxReserved,
    shards: normalizeShards(options?.shards),
  };
}

export function tokenBucket(
  refillRate: number,
  interval: Duration,
  maxTokens: number,
  options?: AlgorithmOptions
): TokenBucketAlgorithm {
  validatePositive(refillRate, 'refillRate');
  validatePositive(maxTokens, 'maxTokens');

  return {
    kind: 'tokenBucket',
    refillRate,
    interval: toMs(interval),
    maxTokens,
    maxReserved: options?.maxReserved,
    shards: normalizeShards(options?.shards),
  };
}

export function applyDynamicLimit(
  algorithm: ResolvedAlgorithm,
  dynamicLimit: number | null
): ResolvedAlgorithm {
  if (!dynamicLimit || dynamicLimit <= 0) {
    return algorithm;
  }

  if (algorithm.kind === 'tokenBucket') {
    return {
      ...algorithm,
      refillRate: dynamicLimit,
      maxTokens:
        algorithm.maxTokens === algorithm.refillRate
          ? dynamicLimit
          : algorithm.maxTokens,
    };
  }

  if (algorithm.kind === 'fixedWindow') {
    return {
      ...algorithm,
      limit: dynamicLimit,
      capacity:
        algorithm.capacity === algorithm.limit
          ? dynamicLimit
          : algorithm.capacity,
    };
  }

  return {
    ...algorithm,
    limit: dynamicLimit,
  };
}

function normalizeShards(shards: number | undefined): number {
  if (shards === undefined) return DEFAULT_SHARDS;
  const rounded = Math.round(shards);
  if (rounded < 1) {
    throw new Error('shards must be >= 1');
  }
  return rounded;
}

function validatePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
}
