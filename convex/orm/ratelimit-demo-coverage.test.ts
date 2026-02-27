import { describe, expect, it } from 'vitest';
import {
  RATELIMIT_COVERAGE_DEFINITIONS,
  type RateLimitCoverageStatus,
} from '../../example/convex/functions/ratelimitDemo.coverage';

const REQUIRED_IDS = [
  'fixed-window-limit',
  'sliding-window-limit',
  'check-non-consuming',
  'token-bucket-reserve',
  'get-remaining',
  'reset-used-tokens',
  'dynamic-limit-override',
  'deny-list-reason',
  'timeout-open-mode',
  'block-until-ready-mutation-blocked',
  'get-value-snapshot',
] as const;

const VALID_STATUSES: RateLimitCoverageStatus[] = [
  'supported',
  'partial',
  'blocked',
  'missing',
];

describe('ratelimit demo coverage definitions', () => {
  it('covers every required ratelimit feature exactly once', () => {
    const ids = RATELIMIT_COVERAGE_DEFINITIONS.map((entry) => entry.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);

    for (const id of REQUIRED_IDS) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });

  it('keeps statuses valid', () => {
    for (const entry of RATELIMIT_COVERAGE_DEFINITIONS) {
      expect(VALID_STATUSES.includes(entry.status)).toBe(true);
    }
  });
});
