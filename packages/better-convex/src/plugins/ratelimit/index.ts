/** biome-ignore-all lint/performance/noBarrelFile: package entry */

export {
  applyDynamicLimit,
  fixedWindow,
  slidingWindow,
  tokenBucket,
} from './core/algorithms';
export { calculateRateLimit } from './core/calculate-rate-limit';
export type {
  Duration,
  DurationString,
  DurationUnit,
} from './duration';
export { toMs } from './duration';
export { Ratelimit } from './ratelimit';
export { ratelimitPlugin } from './schema';
export {
  RATE_LIMIT_DYNAMIC_TABLE,
  RATE_LIMIT_HIT_TABLE,
  RATE_LIMIT_STATE_TABLE,
} from './store/convex-store';
export type {
  CheckRequest,
  ConvexQueryBuilder,
  ConvexRateLimitDbReader,
  ConvexRateLimitDbWriter,
  DynamicLimitResponse,
  FixedWindowAlgorithm,
  HookAPIOptions,
  HookCheckValue,
  LimitRequest,
  RateLimitRow,
  RateLimitSnapshot,
  RateLimitState,
  RatelimitConfig,
  RatelimitReason,
  RatelimitResponse,
  RemainingResponse,
  ResolvedAlgorithm,
  SlidingWindowAlgorithm,
  TokenBucketAlgorithm,
} from './types';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
