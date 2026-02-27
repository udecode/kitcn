export type RateLimitCoverageStatus =
  | 'supported'
  | 'partial'
  | 'blocked'
  | 'missing';

export type RateLimitCoverageId =
  | 'fixed-window-limit'
  | 'sliding-window-limit'
  | 'check-non-consuming'
  | 'token-bucket-reserve'
  | 'get-remaining'
  | 'reset-used-tokens'
  | 'dynamic-limit-override'
  | 'deny-list-reason'
  | 'timeout-open-mode'
  | 'block-until-ready-mutation-blocked'
  | 'get-value-snapshot';

export type RateLimitCoverageDefinition = {
  id: RateLimitCoverageId;
  feature: string;
  status: RateLimitCoverageStatus;
  reason: string;
  example: string;
  errorCode?: string;
};

export type RateLimitCoverageProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

export const RATELIMIT_COVERAGE_DEFINITIONS: readonly RateLimitCoverageDefinition[] =
  [
    {
      id: 'fixed-window-limit',
      feature: 'fixed window consume + rejection',
      status: 'supported',
      reason: 'Consumes up to limit and returns retry metadata when exceeded.',
      example: "Ratelimit.fixedWindow(1, '1 m') + 2nd request denied",
    },
    {
      id: 'sliding-window-limit',
      feature: 'sliding window consume + rejection',
      status: 'supported',
      reason:
        'Sliding window limits bursty access without fixed reset boundaries.',
      example: "Ratelimit.slidingWindow(1, '1 m') + 2nd request denied",
    },
    {
      id: 'check-non-consuming',
      feature: 'check() does not consume tokens',
      status: 'supported',
      reason: 'check computes status without mutating stored usage state.',
      example: 'check(user) -> limit(user) still succeeds',
    },
    {
      id: 'token-bucket-reserve',
      feature: 'token bucket reserve semantics',
      status: 'supported',
      reason:
        'reserve=true allows controlled deficit with retryAfter guidance.',
      example: "Ratelimit.tokenBucket(1, '1 m', 1) with reserve",
    },
    {
      id: 'get-remaining',
      feature: 'getRemaining() API',
      status: 'supported',
      reason: 'Returns computed remaining/reset/limit for current identifier.',
      example: 'getRemaining(user)',
    },
    {
      id: 'reset-used-tokens',
      feature: 'resetUsedTokens() API',
      status: 'supported',
      reason: 'Clears consumed state so next request can pass immediately.',
      example: 'limit -> denied -> resetUsedTokens -> limit succeeds',
    },
    {
      id: 'dynamic-limit-override',
      feature: 'dynamic limit set/get override',
      status: 'supported',
      reason: 'dynamicLimits can override effective limits at runtime.',
      example: 'setDynamicLimit({ limit: 1 }) then second request denied',
    },
    {
      id: 'deny-list-reason',
      feature: 'deny list response reason',
      status: 'supported',
      reason: 'Configured deny lists return reason=denyList with deniedValue.',
      example: "limit('u', { ip: '10.0.0.1' }) => reason=denyList",
    },
    {
      id: 'timeout-open-mode',
      feature: 'timeout fail-open behavior',
      status: 'supported',
      reason:
        'failureMode=open converts timeout into success with timeout reason.',
      example: 'timeout:0.0001 + failureMode:open',
    },
    {
      id: 'block-until-ready-mutation-blocked',
      feature: 'blockUntilReady in mutations',
      status: 'blocked',
      reason:
        'Uses timers internally and should run in actions/non-Convex runtimes, not queries/mutations.',
      errorCode: 'PROBE_FAILED',
      example:
        'blockUntilReady() from mutation context throws because setTimeout is disallowed',
    },
    {
      id: 'get-value-snapshot',
      feature: 'getValue snapshot API',
      status: 'supported',
      reason: 'Returns value/ts/shard/config for reactive UI checks.',
      example: 'getValue(user, { sampleShards: 1 })',
    },
  ] as const;

export const RATELIMIT_LIVE_PROBE_IDS = new Set<RateLimitCoverageId>([
  'fixed-window-limit',
  'sliding-window-limit',
  'check-non-consuming',
  'token-bucket-reserve',
  'get-remaining',
]);

export function createStaticProbeResult(
  definition: RateLimitCoverageDefinition
): RateLimitCoverageProbeResult {
  if (definition.status === 'blocked') {
    return {
      ok: false,
      elapsedMs: 0,
      error:
        'Intentionally blocked in mutation context; see reason column for constraints.',
      errorCode: definition.errorCode ?? 'PROBE_FAILED',
    };
  }

  return {
    ok: true,
    elapsedMs: 0,
    error: null,
    errorCode: null,
  };
}
