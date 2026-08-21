import { describe, expect, test } from 'bun:test';
import {
  hasExactAggregateIndex,
  isBoundedCountRefusal,
  toOrmCountWhere,
} from './count-plan';

const clause = (overrides: Record<string, unknown>) =>
  ({
    field: 'organizationId',
    operator: 'eq',
    value: 'org-1',
    ...overrides,
  }) as any;

describe('toOrmCountWhere', () => {
  test('treats a missing or empty where as the whole table', () => {
    expect(toOrmCountWhere(undefined)).toEqual({});
    expect(toOrmCountWhere([])).toEqual({});
  });

  test('translates equality clauses, including an implicit operator', () => {
    expect(toOrmCountWhere([clause({})])).toEqual({ organizationId: 'org-1' });
    expect(toOrmCountWhere([clause({ operator: undefined })])).toEqual({
      organizationId: 'org-1',
    });
    expect(
      toOrmCountWhere([
        clause({}),
        clause({ field: 'status', value: 'pending' }),
      ])
    ).toEqual({ organizationId: 'org-1', status: 'pending' });
  });

  test('preserves non-string scalars', () => {
    expect(toOrmCountWhere([clause({ field: 'banned', value: true })])).toEqual(
      {
        banned: true,
      }
    );
    expect(toOrmCountWhere([clause({ field: 'seats', value: 0 })])).toEqual({
      seats: 0,
    });
  });

  test.each([
    'contains',
    'ends_with',
    'gt',
    'gte',
    'in',
    'lt',
    'lte',
    'ne',
    'not_in',
    'starts_with',
  ])('refuses the %s operator', (operator) => {
    expect(toOrmCountWhere([clause({ operator })])).toBeNull();
  });

  test('refuses shapes no aggregate index can serve', () => {
    // OR is de-duplicated by document id, which a scalar count cannot do.
    expect(toOrmCountWhere([clause({ connector: 'OR' })])).toBeNull();
    // Insensitive comparison is a JS post-filter on the read path.
    expect(toOrmCountWhere([clause({ mode: 'insensitive' })])).toBeNull();
    // createdAt / updatedAt map onto _creationTime, which cannot be indexed.
    expect(
      toOrmCountWhere([clause({ field: 'createdAt', value: 1 })])
    ).toBeNull();
    expect(
      toOrmCountWhere([clause({ field: 'updatedAt', value: 1 })])
    ).toBeNull();
    // A null value is ambiguous between "equals null" and "is unset".
    expect(toOrmCountWhere([clause({ value: null })])).toBeNull();
    // An array value under eq is not a scalar key.
    expect(toOrmCountWhere([clause({ value: ['a', 'b'] })])).toBeNull();
    // Two clauses on one field cannot collapse into a single bucket key.
    expect(
      toOrmCountWhere([clause({}), clause({ value: 'org-2' })])
    ).toBeNull();
  });

  test('keeps an explicit AND connector', () => {
    expect(toOrmCountWhere([clause({ connector: 'AND' })])).toEqual({
      organizationId: 'org-1',
    });
  });
});

describe('hasExactAggregateIndex', () => {
  const table = (fields: string[][]) => ({
    getAggregateIndexes: () =>
      fields.map((entry) => ({
        name: entry.join('_'),
        fields: entry,
        countFields: [],
        sumFields: [],
        avgFields: [],
        minFields: [],
        maxFields: [],
      })),
  });

  test('matches only an exact field set', () => {
    const declared = table([['organizationId', 'status']]);

    expect(hasExactAggregateIndex(declared, ['organizationId', 'status'])).toBe(
      true
    );
    expect(hasExactAggregateIndex(declared, ['status', 'organizationId'])).toBe(
      true
    );
    // A prefix does not resolve.
    expect(hasExactAggregateIndex(declared, ['organizationId'])).toBe(false);
    // Neither does a superset.
    expect(
      hasExactAggregateIndex(declared, ['organizationId', 'status', 'role'])
    ).toBe(false);
  });

  test('tolerates a table that declares no aggregate indexes', () => {
    expect(hasExactAggregateIndex(table([]), ['organizationId'])).toBe(false);
    // Plain Convex `defineTable` has no accessor at all.
    expect(hasExactAggregateIndex({}, ['organizationId'])).toBe(false);
  });
});

describe('isBoundedCountRefusal', () => {
  test.each([
    'COUNT_NOT_INDEXED',
    'COUNT_INDEX_BUILDING',
    'COUNT_FILTER_UNSUPPORTED',
    'COUNT_RLS_UNSUPPORTED',
  ])('recognizes %s as a refusal', (code) => {
    expect(isBoundedCountRefusal(new Error(`${code}: nope`))).toBe(true);
  });

  test('lets real failures through', () => {
    expect(isBoundedCountRefusal(new Error('Table user not found'))).toBe(
      false
    );
    expect(
      isBoundedCountRefusal(
        new Error('A filtered count() requires the aggregate capability.')
      )
    ).toBe(false);
    expect(isBoundedCountRefusal('COUNT_NOT_INDEXED: not an Error')).toBe(
      false
    );
  });
});
