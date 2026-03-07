import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import {
  applyDynamicLimit,
  fixedWindow,
  slidingWindow,
  tokenBucket,
} from './core/algorithms';
import { createReadDedupeCache, EphemeralBlockCache } from './core/cache';
import { calculateRatelimit } from './core/calculate-rate-limit';
import {
  clearProtection,
  pickDeniedValue,
  recordRatelimitFailure,
} from './core/deny-list';
import type { Duration } from './duration';
import { ConvexRatelimitStore } from './store/convex-store';
import type {
  AlgorithmOptions,
  CheckRequest,
  DynamicLimitResponse,
  HookAPIOptions,
  LimitRequest,
  RatelimitConfig,
  RatelimitResponse,
  RatelimitSnapshot,
  RatelimitState,
  RemainingResponse,
  ResolvedAlgorithm,
} from './types';

const DEFAULT_PREFIX = 'better-convex/ratelimit';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_THRESHOLD = 30;
const MIN_POWER_OF_TWO_CHOICES = 3;

type EvaluationCandidate = {
  shard: number;
  state: RatelimitState | null;
  evaluated: ReturnType<typeof calculateRatelimit>;
  success: boolean;
};

export class Ratelimit {
  static fixedWindow = fixedWindow;
  static slidingWindow = slidingWindow;
  static tokenBucket = tokenBucket;

  private readonly store: ConvexRatelimitStore;
  private readonly prefix: string;
  private readonly timeout: number;
  private readonly dynamicLimits: boolean;
  private readonly failureMode: 'closed' | 'open';
  private readonly enableProtection: boolean;
  private readonly denyListThreshold: number;
  private readonly denyList?: RatelimitConfig['denyList'];
  private readonly limiter: ResolvedAlgorithm;
  private readonly blockCache?: EphemeralBlockCache;
  private readonly blockCacheSource?: Map<string, number>;
  private readonly checkCache = createReadDedupeCache<RatelimitSnapshot>();

  constructor(private readonly config: RatelimitConfig) {
    this.store = new ConvexRatelimitStore(config.db);
    this.prefix = config.prefix ?? DEFAULT_PREFIX;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.dynamicLimits = config.dynamicLimits ?? false;
    this.failureMode = config.failureMode ?? 'closed';
    this.enableProtection = config.enableProtection ?? false;
    this.denyListThreshold = config.denyListThreshold ?? DEFAULT_THRESHOLD;
    this.denyList = config.denyList;
    this.limiter = config.limiter;

    if (config.ephemeralCache !== false) {
      this.blockCacheSource =
        config.ephemeralCache ?? new Map<string, number>();
      this.blockCache = new EphemeralBlockCache(this.blockCacheSource);
    }
  }

  async limit(
    identifier: string,
    request?: LimitRequest
  ): Promise<RatelimitResponse> {
    return this.runWithTimeout(() => this.evaluate(identifier, request, true));
  }

  async check(
    identifier: string,
    request?: CheckRequest
  ): Promise<RatelimitResponse> {
    return this.runWithTimeout(() => this.evaluate(identifier, request, false));
  }

  async blockUntilReady(
    identifier: string,
    timeoutMs: number
  ): Promise<RatelimitResponse> {
    if (timeoutMs <= 0) {
      throw new Error('timeout must be positive');
    }

    const deadline = Date.now() + timeoutMs;
    let latest = this.timeoutResponse(false);

    while (Date.now() <= deadline) {
      latest = await this.limit(identifier);
      if (latest.success) {
        return latest;
      }

      const waitMs = Math.max(1, Math.min(latest.reset, deadline) - Date.now());
      await sleep(waitMs);
    }

    return latest;
  }

  async resetUsedTokens(identifier: string): Promise<void> {
    await this.store.deleteStates(this.prefix, identifier);
    this.checkCache.clear();
    if (this.blockCache) {
      this.blockCache.clear(identifier);
    }
    clearProtection(this.prefix, identifier);
  }

  async getRemaining(identifier: string): Promise<RemainingResponse> {
    const value = await this.getValue(identifier, {
      sampleShards: this.limiter.shards,
    });
    const evaluated = calculateRatelimit(
      {
        value: value.value,
        ts: value.ts,
      },
      value.config,
      Date.now(),
      0
    );

    return {
      remaining: Math.max(0, evaluated.remaining),
      reset: evaluated.reset,
      limit: evaluated.limit,
    };
  }

  async getValue(
    identifier: string,
    options?: { sampleShards?: number }
  ): Promise<RatelimitSnapshot> {
    const cacheKey = `${identifier}:${options?.sampleShards ?? 0}`;
    const cached = this.checkCache.get(cacheKey);
    if (cached) {
      const snapshot = await cached;
      if (snapshot) {
        return snapshot;
      }
    }

    const algorithm = await this.resolveAlgorithm();
    const sampleShards = Math.max(
      1,
      Math.min(options?.sampleShards ?? 1, algorithm.shards)
    );
    const shards = pickSampleShards(algorithm.shards, sampleShards);
    const now = Date.now();

    let best: RatelimitSnapshot | null = null;

    for (const shard of shards) {
      const state = normalizeState(
        await this.store.getState(this.prefix, identifier, shard)
      );
      const evaluated = calculateRatelimit(state, algorithm, now, 0);
      const value =
        algorithm.kind === 'slidingWindow'
          ? evaluated.remaining
          : evaluated.state.value;

      const current: RatelimitSnapshot = {
        value,
        ts: evaluated.state.ts,
        shard,
        config: algorithm,
      };

      if (!best || current.value > best.value) {
        best = current;
      }
    }

    const result =
      best ??
      ({
        value:
          algorithm.kind === 'tokenBucket'
            ? algorithm.maxTokens
            : algorithm.limit,
        ts: now,
        shard: 0,
        config: algorithm,
      } as RatelimitSnapshot);

    this.checkCache.set(cacheKey, Promise.resolve(result));
    return result;
  }

  async setDynamicLimit(options: { limit: number | false }): Promise<void> {
    if (!this.dynamicLimits) {
      throw new Error(
        'dynamicLimits must be enabled in the Ratelimit constructor to use setDynamicLimit()'
      );
    }

    await this.store.setDynamicLimit(this.prefix, options.limit);
  }

  async getDynamicLimit(): Promise<DynamicLimitResponse> {
    if (!this.dynamicLimits) {
      throw new Error(
        'dynamicLimits must be enabled in the Ratelimit constructor to use getDynamicLimit()'
      );
    }

    return { dynamicLimit: await this.store.getDynamicLimit(this.prefix) };
  }

  hookAPI(options?: HookAPIOptions) {
    return {
      getRatelimit: queryGeneric({
        args: {
          identifier: v.optional(v.string()),
          sampleShards: v.optional(v.number()),
        },
        returns: v.object({
          value: v.number(),
          ts: v.number(),
          shard: v.number(),
          config: v.any(),
        }),
        handler: async (ctx, args): Promise<RatelimitSnapshot> => {
          const identifier = await resolveIdentifier(
            options?.identifier,
            ctx,
            args.identifier
          );
          const limiter = this.withDb(
            (ctx as { db: RatelimitConfig['db'] }).db
          );
          return limiter.getValue(identifier, {
            sampleShards: args.sampleShards ?? options?.sampleShards,
          });
        },
      }),
      getServerTime: mutationGeneric({
        args: {},
        returns: v.number(),
        handler: async () => Date.now(),
      }),
    };
  }

  private withDb(db: RatelimitConfig['db']): Ratelimit {
    return new Ratelimit({
      ...this.config,
      db,
      ephemeralCache: this.blockCacheSource,
    });
  }

  private async evaluate(
    identifier: string,
    request: LimitRequest | CheckRequest | undefined,
    consume: boolean
  ): Promise<RatelimitResponse> {
    const deniedValue = this.enableProtection
      ? pickDeniedValue({
          prefix: this.prefix,
          identifier,
          request,
          lists: this.denyList,
        })
      : undefined;

    if (deniedValue) {
      return {
        success: false,
        ok: false,
        limit: this.rawLimit(this.limiter),
        remaining: 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
        reason: 'denyList',
        deniedValue,
      };
    }

    const algorithm = await this.resolveAlgorithm();
    const count = consume ? normalizeCount(request) : 0;
    const reserveRequested = consume && Boolean(request?.reserve);

    if (this.blockCache && count > 0) {
      const cacheKey = `${this.prefix}:${identifier}`;
      const blocked = this.blockCache.isBlocked(cacheKey);
      if (blocked.blocked) {
        return {
          success: false,
          ok: false,
          limit: this.rawLimit(algorithm),
          remaining: 0,
          reset: blocked.reset,
          pending: Promise.resolve(),
          reason: 'cacheBlock',
        };
      }
    }

    const now = Date.now();
    const candidates = await this.evaluateCandidates(
      identifier,
      algorithm,
      now,
      count,
      reserveRequested
    );
    const successful = candidates.filter((candidate) => candidate.success);

    if (successful.length > 0) {
      const best = successful.sort(
        (a, b) => b.evaluated.remaining - a.evaluated.remaining
      )[0];

      if (consume && count !== 0) {
        await this.store.upsertState({
          name: this.prefix,
          key: identifier,
          shard: best.shard,
          state: best.evaluated.state,
        });
      }

      if (this.blockCache) {
        this.blockCache.clear(`${this.prefix}:${identifier}`);
      }
      clearProtection(this.prefix, identifier);
      this.checkCache.clear();

      return {
        success: true,
        ok: true,
        limit: best.evaluated.limit,
        remaining: best.evaluated.remaining,
        reset: best.evaluated.reset,
        pending: Promise.resolve(),
      };
    }

    const failure =
      candidates
        .filter((candidate) => candidate.evaluated.retryAfter !== undefined)
        .sort(
          (a, b) =>
            (a.evaluated.retryAfter ?? Number.MAX_SAFE_INTEGER) -
            (b.evaluated.retryAfter ?? Number.MAX_SAFE_INTEGER)
        )[0] ?? candidates[0];

    const retryAfter = failure.evaluated.retryAfter ?? 1;
    const reset = now + retryAfter;

    if (consume && this.blockCache && count > 0) {
      this.blockCache.blockUntil(`${this.prefix}:${identifier}`, reset);
    }

    if (consume && this.enableProtection) {
      recordRatelimitFailure({
        prefix: this.prefix,
        identifier,
        request,
        threshold: this.denyListThreshold,
      });
    }

    return {
      success: false,
      ok: false,
      limit: failure.evaluated.limit,
      remaining: 0,
      reset,
      pending: Promise.resolve(),
    };
  }

  private async evaluateCandidates(
    identifier: string,
    algorithm: ResolvedAlgorithm,
    now: number,
    count: number,
    reserveRequested: boolean
  ): Promise<EvaluationCandidate[]> {
    const shards = pickCandidateShards(algorithm.shards);

    const result: EvaluationCandidate[] = [];

    for (const shard of shards) {
      const state = normalizeState(
        await this.store.getState(this.prefix, identifier, shard)
      );
      const evaluated = calculateRatelimit(state, algorithm, now, count);

      const canReserve =
        reserveRequested &&
        evaluated.retryAfter !== undefined &&
        algorithm.kind !== 'slidingWindow' &&
        (algorithm.maxReserved === undefined ||
          Math.abs(evaluated.state.value) <= algorithm.maxReserved);

      const success = evaluated.retryAfter === undefined || canReserve;

      result.push({
        shard,
        state,
        evaluated,
        success,
      });
    }

    return result;
  }

  private async resolveAlgorithm(): Promise<ResolvedAlgorithm> {
    if (!this.dynamicLimits) {
      return this.limiter;
    }

    const dynamicLimit = await this.store.getDynamicLimit(this.prefix);
    return applyDynamicLimit(this.limiter, dynamicLimit);
  }

  private rawLimit(algorithm: ResolvedAlgorithm): number {
    if (algorithm.kind === 'tokenBucket') {
      return algorithm.maxTokens;
    }
    return algorithm.limit;
  }

  private async runWithTimeout(
    operation: () => Promise<RatelimitResponse>
  ): Promise<RatelimitResponse> {
    if (this.timeout <= 0) {
      return operation();
    }

    const startedAt = Date.now();
    try {
      const result = await operation();
      if (Date.now() - startedAt > this.timeout) {
        return this.timeoutResponse(this.failureMode === 'open');
      }
      return result;
    } catch (error) {
      if (Date.now() - startedAt > this.timeout) {
        return this.timeoutResponse(this.failureMode === 'open');
      }
      throw error;
    }
  }

  private timeoutResponse(success: boolean): RatelimitResponse {
    return {
      success,
      ok: success,
      limit: 0,
      remaining: 0,
      reset: Date.now(),
      pending: Promise.resolve(),
      reason: 'timeout',
    };
  }
}

function normalizeCount(request?: LimitRequest | CheckRequest): number {
  if (!request) {
    return 1;
  }
  const value = request.rate ?? request.count ?? 1;
  if (!Number.isFinite(value)) {
    throw new Error('count/rate must be a finite number');
  }
  return value;
}

function normalizeState(
  row: {
    value: number;
    ts: number;
    auxValue?: number;
    auxTs?: number;
  } | null
): RatelimitState | null {
  if (!row) {
    return null;
  }
  return {
    value: row.value,
    ts: row.ts,
    auxValue: row.auxValue,
    auxTs: row.auxTs,
  };
}

function pickCandidateShards(shards: number): number[] {
  const first = Math.floor(Math.random() * shards);
  if (shards < MIN_POWER_OF_TWO_CHOICES) {
    return [first];
  }
  const second =
    (first + 1 + Math.floor(Math.random() * (shards - 1))) % shards;
  return [first, second];
}

function pickSampleShards(total: number, sample: number): number[] {
  const all = Array.from({ length: total }, (_, index) => index);
  const selected: number[] = [];

  while (all.length > 0 && selected.length < sample) {
    const randomIndex = Math.floor(Math.random() * all.length);
    const [shard] = all.splice(randomIndex, 1);
    if (shard !== undefined) {
      selected.push(shard);
    }
  }

  return selected.length > 0 ? selected : [0];
}

async function sleep(ms: number): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  } catch (error) {
    if (isTimerUnsupportedError(error)) {
      throw new Error(
        'blockUntilReady is not supported in Convex queries/mutations. Use an action or non-Convex runtime.'
      );
    }
    throw error;
  }
}

function isTimerUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("can't use settimeout in queries and mutations") ||
    message.includes('settimeout')
  );
}

async function resolveIdentifier(
  identifierOption: HookAPIOptions['identifier'],
  ctx: unknown,
  fromClient?: string
): Promise<string> {
  if (!identifierOption) {
    if (!fromClient) {
      throw new Error('hookAPI requires identifier in options or request args');
    }
    return fromClient;
  }

  if (typeof identifierOption === 'function') {
    return await identifierOption(ctx, fromClient);
  }

  return identifierOption;
}

export function createFixedWindow(
  limit: number,
  window: Duration,
  options?: AlgorithmOptions
): ResolvedAlgorithm {
  return fixedWindow(limit, window, options);
}
