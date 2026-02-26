import { describe, expect, it } from 'vitest';
import {
  AGGREGATE_PARITY_DEFINITIONS,
  type AggregateParityStatus,
} from '../../example/convex/functions/aggregateDemo.parity';

const REQUIRED_PARITY_IDS = [
  'aggregate-core',
  'aggregate-sum-nullability',
  'groupby-core',
  'groupby-advanced-args',
  'groupby-window-order-required',
  'groupby-having-conjunction-only',
  'groupby-orderby-selected-metrics-only',
  'count-basic',
  'count-filtered',
  'count-select',
  'relation-count-unfiltered',
  'relation-count-filtered-direct',
  'aggregate-window-args',
  'aggregate-count-filter-subset',
  'relation-count-nested-filter',
  'distinct-query',
  'relation-count-through-filter',
  'mutation-return-count',
] as const;

const VALID_STATUSES: AggregateParityStatus[] = [
  'supported',
  'partial',
  'blocked',
  'missing',
];

describe('aggregate demo parity definitions', () => {
  it('covers every scoped Prisma aggregate/count parity entry exactly once', () => {
    const ids = AGGREGATE_PARITY_DEFINITIONS.map((entry) => entry.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);

    for (const id of REQUIRED_PARITY_IDS) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });

  it('tags blocked entries with deterministic error codes', () => {
    for (const entry of AGGREGATE_PARITY_DEFINITIONS) {
      expect(VALID_STATUSES.includes(entry.status)).toBe(true);

      if (entry.status === 'blocked') {
        expect(typeof entry.errorCode).toBe('string');
        expect((entry.errorCode ?? '').length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps partial/blocked statuses aligned with current no-scan runtime', () => {
    const byId = new Map(
      AGGREGATE_PARITY_DEFINITIONS.map((entry) => [entry.id, entry])
    );

    expect(byId.get('aggregate-window-args')?.status).toBe('partial');
    expect(byId.get('aggregate-count-filter-subset')?.status).toBe('partial');
    expect(byId.get('groupby-core')?.status).toBe('supported');
    expect(byId.get('groupby-advanced-args')?.status).toBe('partial');
    expect(byId.get('groupby-window-order-required')?.status).toBe('blocked');
    expect(byId.get('groupby-having-conjunction-only')?.status).toBe('blocked');
    expect(byId.get('groupby-orderby-selected-metrics-only')?.status).toBe(
      'blocked'
    );
    expect(byId.get('relation-count-nested-filter')?.status).toBe('blocked');
    expect(byId.get('distinct-query')?.status).toBe('blocked');
  });
});
