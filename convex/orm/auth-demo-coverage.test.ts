import { describe, expect, it } from 'vitest';
import {
  AUTH_COVERAGE_DEFINITIONS,
  type AuthCoverageExpectation,
  type AuthCoverageStatus,
} from '../../example/convex/functions/authDemo.coverage';

const REQUIRED_IDS = [
  'anonymous-sign-in',
  'anonymous-flag',
  'anonymous-email-domain',
  'anonymous-generate-name',
  'link-account-non-anonymous',
  'on-link-account-bio-migration',
  'linked-source-anonymous-deleted',
  'disable-delete-anonymous-user-option',
  'generate-random-email-precedence',
] as const;

const VALID_STATUSES: AuthCoverageStatus[] = [
  'supported',
  'partial',
  'blocked',
  'missing',
];

const VALID_EXPECTATIONS: AuthCoverageExpectation[] = ['success', 'failure'];

describe('auth demo coverage definitions', () => {
  it('covers every required auth scenario exactly once', () => {
    const ids = AUTH_COVERAGE_DEFINITIONS.map((entry) => entry.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);

    for (const id of REQUIRED_IDS) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });

  it('keeps statuses and expectation metadata valid', () => {
    for (const entry of AUTH_COVERAGE_DEFINITIONS) {
      expect(VALID_STATUSES.includes(entry.status)).toBe(true);
      expect(VALID_EXPECTATIONS.includes(entry.expectation)).toBe(true);
      expect(['live', 'static'].includes(entry.probeMode)).toBe(true);
    }
  });
});
