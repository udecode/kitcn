import {
  type ConvexRateLimitDbReader,
  type ConvexRateLimitDbWriter,
  MINUTE,
  Ratelimit,
  type RatelimitResponse,
  SECOND,
} from 'better-convex/plugins/ratelimit';
import { z } from 'zod';
import {
  authAction,
  authQuery,
  privateMutation,
  publicMutation,
  publicQuery,
} from '../lib/crpc';
import { internal } from './_generated/api';
import {
  createStaticProbeResult,
  RATELIMIT_COVERAGE_DEFINITIONS,
  RATELIMIT_LIVE_PROBE_IDS,
  type RateLimitCoverageDefinition,
  type RateLimitCoverageId,
  type RateLimitCoverageProbeResult,
  type RateLimitCoverageStatus,
} from './ratelimitDemo.coverage';

type ProbeResult = RateLimitCoverageProbeResult;

type RateLimitCoverageEntry = RateLimitCoverageDefinition & {
  probe: ProbeResult;
};

type RateLimitCoverageSnapshot = {
  generatedAt: string;
  entries: RateLimitCoverageEntry[];
  summary: Record<RateLimitCoverageStatus, number>;
  validated: number;
  total: number;
};

type InteractiveStatus = {
  ok: boolean;
  remaining: number;
  limit: number;
  reset: number;
  now: number;
  reason: RatelimitResponse['reason'] | null;
};

const INTERACTIVE_WINDOW_MS = 30 * SECOND;
const INTERACTIVE_LIMIT = 3;
const INTERACTIVE_PREFIX = 'demo:ratelimit:interactive:v1';
const TIMEOUT_PROBE_DELAY_MS = 2;
const COVERAGE_IDS = RATELIMIT_COVERAGE_DEFINITIONS.map(
  (entry) => entry.id
) as [RateLimitCoverageId, ...RateLimitCoverageId[]];

type ConvexRateLimitDb = ConvexRateLimitDbReader | ConvexRateLimitDbWriter;

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createProbePrefix(userId: string, id: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `demo:${id}:${userId.slice(-6)}:${Date.now()}:${suffix}`;
}

function busyDelay(ms: number): void {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    // intentional spin for deterministic timeout probes in tests/demo
  }
}

function isWriterDb(db: ConvexRateLimitDb): db is ConvexRateLimitDbWriter {
  return (
    'insert' in db &&
    typeof db.insert === 'function' &&
    'patch' in db &&
    typeof db.patch === 'function' &&
    'delete' in db &&
    typeof db.delete === 'function'
  );
}

function createSlowDb(
  db: ConvexRateLimitDb,
  delayMs = TIMEOUT_PROBE_DELAY_MS
): ConvexRateLimitDb {
  const wrappedReader: ConvexRateLimitDbReader = {
    query(tableName) {
      busyDelay(delayMs);
      return db.query(tableName);
    },
  };

  if (!isWriterDb(db)) {
    return wrappedReader;
  }

  return {
    ...wrappedReader,
    insert: async (...args) => {
      busyDelay(delayMs);
      return db.insert(...args);
    },
    patch: async (...args) => {
      busyDelay(delayMs);
      return db.patch(...args);
    },
    delete: async (...args) => {
      busyDelay(delayMs);
      return db.delete(...args);
    },
  };
}

function isPromiseLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('then' in value)) {
    return false;
  }
  const thenValue = (value as { then?: unknown }).then;
  return typeof thenValue === 'function';
}

function toSerializableProbeValue(value: unknown): unknown {
  const serialized = JSON.stringify(value, (key, current) => {
    if (key === 'pending' || isPromiseLike(current)) {
      return undefined;
    }
    return current;
  });

  if (serialized === undefined) {
    return null;
  }
  return JSON.parse(serialized);
}

function createInteractiveLimiter(
  db: ConvexRateLimitDbReader | ConvexRateLimitDbWriter
) {
  return new Ratelimit({
    db,
    prefix: INTERACTIVE_PREFIX,
    limiter: Ratelimit.fixedWindow(INTERACTIVE_LIMIT, INTERACTIVE_WINDOW_MS),
  });
}

const interactiveHookLimiter = new Ratelimit({
  prefix: INTERACTIVE_PREFIX,
  limiter: Ratelimit.fixedWindow(INTERACTIVE_LIMIT, INTERACTIVE_WINDOW_MS),
});

export const {
  getRateLimit: getInteractiveRateLimit,
  getServerTime: getInteractiveServerTime,
} = interactiveHookLimiter.hookAPI({
  identifier: (_ctx, fromClient) => fromClient ?? 'ratelimit-demo-anonymous',
  sampleShards: 1,
});

function toInteractiveStatus(result: RatelimitResponse): InteractiveStatus {
  return {
    ok: result.success,
    remaining: result.remaining,
    limit: result.limit,
    reset: result.reset,
    now: Date.now(),
    reason: result.reason ?? null,
  };
}

async function runProbe(probe: () => Promise<unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    const value = await probe();
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      error: null,
      errorCode: null,
      value: toSerializableProbeValue(value),
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: asErrorMessage(error),
      errorCode: 'PROBE_FAILED',
    };
  }
}

function buildSummary(
  entries: RateLimitCoverageEntry[]
): Record<RateLimitCoverageStatus, number> {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1;
      return acc;
    },
    {
      supported: 0,
      partial: 0,
      blocked: 0,
      missing: 0,
    } as Record<RateLimitCoverageStatus, number>
  );
}

function matchesExpected(entry: RateLimitCoverageEntry): boolean {
  if (entry.status === 'blocked') {
    return !entry.probe.ok;
  }
  return entry.probe.ok;
}

function buildCoverageProbes(
  db: ConvexRateLimitDbWriter,
  userId: string
): Record<RateLimitCoverageId, () => Promise<unknown>> {
  return {
    'fixed-window-limit': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'fixed-window'),
        limiter: Ratelimit.fixedWindow(1, MINUTE),
      });

      const first = await limiter.limit(userId);
      if (!first.success || first.limit !== 1) {
        throw new Error('Expected fixed window request to consume capacity');
      }

      return first;
    },
    'sliding-window-limit': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'sliding-window'),
        limiter: Ratelimit.slidingWindow(1, MINUTE),
      });

      const first = await limiter.limit(userId);
      if (!first.success || first.limit !== 1) {
        throw new Error('Expected sliding window request to consume capacity');
      }

      return first;
    },
    'check-non-consuming': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'check'),
        limiter: Ratelimit.fixedWindow(1, MINUTE),
      });

      const checked = await limiter.check(userId);
      const first = await limiter.limit(userId);

      if (!checked.success || !first.success) {
        throw new Error('Expected check to be non-consuming');
      }

      return { checked, first };
    },
    'token-bucket-reserve': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'reserve'),
        limiter: Ratelimit.tokenBucket(1, MINUTE, 1, { maxReserved: 2 }),
      });

      const reserved = await limiter.limit(userId, {
        count: 2,
        reserve: true,
      });

      if (!reserved.success || !reserved.reset) {
        throw new Error(
          'Expected reserve request to succeed with retry guidance'
        );
      }

      return reserved;
    },
    'get-remaining': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'remaining'),
        limiter: Ratelimit.fixedWindow(2, MINUTE),
      });

      const remaining = await limiter.getRemaining(userId);

      if (
        remaining.limit !== 2 ||
        remaining.remaining < 0 ||
        remaining.remaining > 2
      ) {
        throw new Error('Expected remaining API to return bounded values');
      }

      return remaining;
    },
    'reset-used-tokens': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'reset'),
        limiter: Ratelimit.fixedWindow(1, MINUTE),
      });

      const first = await limiter.limit(userId);
      await limiter.resetUsedTokens(userId);
      const afterReset = await limiter.limit(userId);

      if (!first.success || !afterReset.success) {
        throw new Error('Expected resetUsedTokens to restore availability');
      }

      return { first, afterReset };
    },
    'dynamic-limit-override': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'dynamic'),
        dynamicLimits: true,
        limiter: Ratelimit.fixedWindow(5, MINUTE),
      });

      await limiter.setDynamicLimit({ limit: 1 });
      const current = await limiter.getDynamicLimit();

      if (current.dynamicLimit !== 1) {
        throw new Error('Expected dynamic limit override to be persisted');
      }
      return current;
    },
    'deny-list-reason': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'deny'),
        enableProtection: true,
        denyList: {
          ips: ['10.0.0.1'],
        },
        limiter: Ratelimit.fixedWindow(2, MINUTE),
      });

      const denied = await limiter.limit(userId, { ip: '10.0.0.1' });
      if (denied.success || denied.reason !== 'denyList') {
        throw new Error('Expected deny list rejection');
      }

      return denied;
    },
    'timeout-open-mode': async () => {
      const slowLimiter = new Ratelimit({
        db: createSlowDb(db),
        prefix: createProbePrefix(userId, 'timeout-open'),
        timeout: 1,
        failureMode: 'open',
        limiter: Ratelimit.fixedWindow(1, MINUTE),
      });

      const result = await slowLimiter.limit(userId);
      if (!result.success || result.reason !== 'timeout') {
        throw new Error('Expected open mode timeout response');
      }

      return result;
    },
    'block-until-ready-mutation-blocked': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'block-until-ready'),
        limiter: Ratelimit.fixedWindow(1, MINUTE),
      });

      await limiter.limit(userId);
      return limiter.blockUntilReady(userId, 100);
    },
    'get-value-snapshot': async () => {
      const limiter = new Ratelimit({
        db,
        prefix: createProbePrefix(userId, 'value'),
        limiter: Ratelimit.fixedWindow(2, MINUTE, { shards: 2 }),
      });

      const value = await limiter.getValue(userId, { sampleShards: 1 });

      if (typeof value.value !== 'number' || typeof value.ts !== 'number') {
        throw new Error('Expected value snapshot fields');
      }

      return value;
    },
  };
}

export const getSnapshot = authQuery.query(async () => {
  return {
    generatedAt: new Date().toISOString(),
    entries: RATELIMIT_COVERAGE_DEFINITIONS.map((entry) => ({
      ...entry,
      probe: {
        ok: false,
        elapsedMs: 0,
        error: null,
        errorCode: null,
      },
    })),
    summary: buildSummary(
      RATELIMIT_COVERAGE_DEFINITIONS.map((entry) => ({
        ...entry,
        probe: {
          ok: false,
          elapsedMs: 0,
          error: null,
          errorCode: null,
        },
      }))
    ),
    validated: 0,
    total: RATELIMIT_COVERAGE_DEFINITIONS.length,
  } satisfies RateLimitCoverageSnapshot;
});

export const getInteractiveStatus = publicQuery
  .input(
    z.object({
      sessionId: z.string().min(6).max(128),
    })
  )
  .query(async ({ ctx, input }) => {
    const limiter = createInteractiveLimiter(ctx.db);
    return toInteractiveStatus(await limiter.check(input.sessionId));
  });

export const consumeInteractive = publicMutation
  .meta({ rateLimit: 'ratelimit/interactive' })
  .input(
    z.object({
      sessionId: z.string().min(6).max(128),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const limiter = createInteractiveLimiter(ctx.db);
    return toInteractiveStatus(await limiter.limit(input.sessionId));
  });

export const resetInteractive = publicMutation
  .meta({ rateLimit: 'ratelimit/interactive' })
  .input(
    z.object({
      sessionId: z.string().min(6).max(128),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const limiter = createInteractiveLimiter(ctx.db);
    await limiter.resetUsedTokens(input.sessionId);
    return toInteractiveStatus(await limiter.check(input.sessionId));
  });

export const runCoverageProbe = privateMutation
  .input(
    z.object({
      id: z.enum(COVERAGE_IDS),
      userId: z.string().min(1),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const probes = buildCoverageProbes(ctx.db, input.userId);
    return runProbe(probes[input.id]);
  });

export const runCoverage = authAction.action(async ({ ctx }) => {
  const entries = await Promise.all(
    RATELIMIT_COVERAGE_DEFINITIONS.map(async (definition) => {
      if (!RATELIMIT_LIVE_PROBE_IDS.has(definition.id)) {
        return {
          ...definition,
          probe: createStaticProbeResult(definition),
        };
      }

      try {
        const probe = (await ctx.runMutation(
          internal.ratelimitDemo.runCoverageProbe,
          {
            id: definition.id,
            userId: ctx.userId,
          }
        )) as ProbeResult;
        return {
          ...definition,
          probe,
        };
      } catch (error) {
        return {
          ...definition,
          probe: {
            ok: false,
            elapsedMs: 0,
            error: asErrorMessage(error),
            errorCode: 'PROBE_FAILED',
          } satisfies ProbeResult,
        };
      }
    })
  );

  const validated = entries.filter(matchesExpected).length;
  const total = entries.length;

  return {
    generatedAt: new Date().toISOString(),
    entries,
    summary: buildSummary(entries),
    validated,
    total,
  } satisfies RateLimitCoverageSnapshot;
});
