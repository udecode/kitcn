import { getAggregateIndexes } from '../orm/index-utils';
import type { ConvexCleanedWhere } from './adapter';

/**
 * Better Auth's `createdAt` maps onto `_creationTime` inside the paginated read
 * path, and `_creationTime` cannot back an `aggregateIndex`. Counting on either
 * timestamp would compare against a column the ORM does not index.
 */
const UNBOUNDABLE_FIELDS = new Set(['createdAt', 'updatedAt']);

/**
 * Translate a Better Auth `Where[]` into an ORM `count({ where })` object.
 *
 * Returns `null` for every shape a bounded count cannot serve. `null` is not an
 * error: the caller falls back to walking pages, which returns the same number
 * and is merely linear in matching rows.
 *
 * Only equality on a plain scalar translates. `OR` is excluded because both
 * adapters de-duplicate documents by id across OR clauses, which a scalar count
 * cannot reproduce. The remaining operators (`ne`, `in`, `not_in`, `contains`,
 * `starts_with`, `ends_with`, and any insensitive comparison) are applied as JS
 * post-filters on the read path, so no index can bound them.
 */
export const toOrmCountWhere = (
  where?: ConvexCleanedWhere[]
): Record<string, unknown> | null => {
  if (!where?.length) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const clause of where) {
    if (clause.connector === 'OR' || clause.mode === 'insensitive') {
      return null;
    }
    if ((clause.operator ?? 'eq') !== 'eq') {
      return null;
    }
    if (clause.value === null || Array.isArray(clause.value)) {
      return null;
    }
    if (UNBOUNDABLE_FIELDS.has(clause.field) || clause.field in result) {
      return null;
    }

    result[clause.field] = clause.value;
  }

  return result;
};

/**
 * Whether the table declares an `aggregateIndex` covering exactly `fields`.
 *
 * The ORM's count planner matches an aggregate index as an exact set, not a
 * prefix, so an index on `[organizationId]` serves `{ organizationId }` and
 * nothing else. Checking here keeps the caller's error handling narrow: a
 * declared aggregate index also guarantees the aggregate capability is
 * registered, because `createOrm` fails closed otherwise.
 */
export const hasExactAggregateIndex = (table: unknown, fields: string[]) => {
  const requested = new Set(fields);

  return getAggregateIndexes(table as any).some(
    (index) =>
      index.fields.length === requested.size &&
      index.fields.every((field) => requested.has(field))
  );
};

const BOUNDED_COUNT_REFUSALS = [
  'COUNT_NOT_INDEXED:',
  'COUNT_INDEX_BUILDING:',
  'COUNT_FILTER_UNSUPPORTED:',
  'COUNT_RLS_UNSUPPORTED:',
];

/**
 * Whether the ORM declined to serve a count rather than failing at it.
 *
 * A refusal is safe to swallow: the paginated walk produces the same number.
 * Anything else is a real error and must surface.
 */
export const isBoundedCountRefusal = (error: unknown) =>
  error instanceof Error &&
  BOUNDED_COUNT_REFUSALS.some((code) => error.message.startsWith(code));
