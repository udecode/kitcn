import type { Duration } from './duration';

export type RatelimitReason = 'timeout' | 'cacheBlock' | 'denyList';

export type RatelimitResponse = {
  success: boolean;
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
  reason?: RatelimitReason;
  deniedValue?: string;
};

export type RemainingResponse = {
  remaining: number;
  reset: number;
  limit: number;
};

export type DynamicLimitResponse = {
  dynamicLimit: number | null;
};

export type RateLimitState = {
  value: number;
  ts: number;
  auxValue?: number;
  auxTs?: number;
};

export type RateLimitSnapshot = {
  value: number;
  ts: number;
  shard: number;
  config: ResolvedAlgorithm;
};

export type BaseAlgorithmOptions = {
  shards?: number;
  maxReserved?: number;
};

export type FixedWindowAlgorithm = {
  kind: 'fixedWindow';
  limit: number;
  window: number;
  capacity: number;
  start?: number;
  maxReserved?: number;
  shards: number;
};

export type SlidingWindowAlgorithm = {
  kind: 'slidingWindow';
  limit: number;
  window: number;
  maxReserved?: number;
  shards: number;
};

export type TokenBucketAlgorithm = {
  kind: 'tokenBucket';
  refillRate: number;
  interval: number;
  maxTokens: number;
  maxReserved?: number;
  shards: number;
};

export type ResolvedAlgorithm =
  | FixedWindowAlgorithm
  | SlidingWindowAlgorithm
  | TokenBucketAlgorithm;

export type AlgorithmOptions = BaseAlgorithmOptions & {
  capacity?: number;
  start?: number;
};

export type LimitRequest = {
  rate?: number;
  count?: number;
  reserve?: boolean;
  ip?: string;
  userAgent?: string;
  country?: string;
  geo?: unknown;
};

export type CheckRequest = Omit<LimitRequest, 'reserve'> & {
  reserve?: boolean;
};

export type FailureMode = 'closed' | 'open';

export type DedupeCache = Map<string, Promise<RateLimitRow | null>>;

export type ProtectionLists = {
  identifiers?: readonly string[];
  ips?: readonly string[];
  userAgents?: readonly string[];
  countries?: readonly string[];
};

export type RatelimitConfig = {
  db?: ConvexRateLimitDbReader | ConvexRateLimitDbWriter;
  limiter: ResolvedAlgorithm;
  prefix?: string;
  dynamicLimits?: boolean;
  ephemeralCache?: Map<string, number> | false;
  timeout?: number;
  failureMode?: FailureMode;
  enableProtection?: boolean;
  denyListThreshold?: number;
  denyList?: ProtectionLists;
};

export type RateLimitRow = {
  _id: string;
  _creationTime?: number;
  name: string;
  key?: string;
  shard: number;
  value: number;
  ts: number;
  auxValue?: number;
  auxTs?: number;
};

export type DynamicLimitRow = {
  _id: string;
  _creationTime?: number;
  prefix: string;
  limit: number;
  updatedAt: number;
};

export type DenyListHitRow = {
  _id: string;
  _creationTime?: number;
  prefix: string;
  value: string;
  kind: 'identifier' | 'ip' | 'userAgent' | 'country';
  hits: number;
  blockedUntil?: number;
  updatedAt: number;
};

export type ConvexQueryBuilder = {
  withIndex: (
    name: any,
    cb: any
  ) => {
    unique: () => Promise<any>;
    collect: () => Promise<any[]>;
  };
};

export type ConvexRateLimitDbReader = {
  query: (tableName: string) => ConvexQueryBuilder;
};

export type ConvexRateLimitDbWriter = ConvexRateLimitDbReader & {
  insert: (...args: any[]) => Promise<any>;
  patch: (...args: any[]) => Promise<void>;
  delete: (...args: any[]) => Promise<void>;
};

export type HookAPIOptions = {
  identifier?:
    | string
    | ((ctx: unknown, fromClient?: string) => string | Promise<string>);
  sampleShards?: number;
};

export type HookCheckValue = {
  value: number;
  ts: number;
  config: ResolvedAlgorithm;
  shard: number;
  ok: boolean;
  retryAt?: number;
};

export type BuildAlgorithmFn = (
  limit: number,
  window: Duration,
  options?: AlgorithmOptions
) => ResolvedAlgorithm;
