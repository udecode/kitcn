import { describe, expect, it } from 'vitest';
import {
  TRIGGER_COVERAGE_DEFINITIONS,
  type TriggerCoverageStatus,
} from '../../example/convex/functions/triggerDemo.coverage';

const REQUIRED_IDS = [
  'create-before-normalization',
  'create-before-cancel',
  'create-after-side-effects',
  'update-before-normalization',
  'update-before-cancel',
  'update-after-side-effects',
  'delete-before-cancel',
  'delete-after-side-effects',
  'change-hook-all-ops',
  'recursive-write-queue',
  'innerdb-bypass',
  'user-create-after-bootstrap',
  'session-create-after-bootstrap',
] as const;

const VALID_STATUSES: TriggerCoverageStatus[] = [
  'supported',
  'partial',
  'blocked',
  'missing',
];

describe('trigger demo coverage definitions', () => {
  it('covers every required trigger feature exactly once', () => {
    const ids = TRIGGER_COVERAGE_DEFINITIONS.map((entry) => entry.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);

    for (const id of REQUIRED_IDS) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });

  it('keeps statuses valid', () => {
    for (const entry of TRIGGER_COVERAGE_DEFINITIONS) {
      expect(VALID_STATUSES.includes(entry.status)).toBe(true);
    }
  });
});
