/** biome-ignore-all lint/performance/noBarrelFile: package entry */

export {
  applyDynamicLimit,
  fixedWindow,
  slidingWindow,
  tokenBucket,
} from './core/algorithms';
export { calculateRatelimit } from './core/calculate-rate-limit';
export type {
  Duration,
  DurationString,
  DurationUnit,
} from './duration';
export { toMs } from './duration';
export type { RatelimitPluginOptions } from './plugin';
export { RatelimitPlugin } from './plugin';
export { Ratelimit } from './ratelimit';
export {
  RATE_LIMIT_DYNAMIC_TABLE,
  RATE_LIMIT_HIT_TABLE,
  RATE_LIMIT_STATE_TABLE,
} from './store/convex-store';
export type {
  CheckRequest,
  ConvexQueryBuilder,
  ConvexRatelimitDbReader,
  ConvexRatelimitDbWriter,
  DynamicLimitResponse,
  FixedWindowAlgorithm,
  HookAPIOptions,
  HookCheckValue,
  LimitRequest,
  RatelimitConfig,
  RatelimitReason,
  RatelimitResponse,
  RatelimitRow,
  RatelimitSnapshot,
  RatelimitState,
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
