import { v } from 'convex/values';
import { custom, integer, text } from '../builders';
import { index } from '../indexes';
import { convexTable } from '../table';

export const AGGREGATE_BUCKET_TABLE = 'aggregate_bucket';
export const AGGREGATE_MEMBER_TABLE = 'aggregate_member';
export const AGGREGATE_EXTREMA_TABLE = 'aggregate_extrema';
export const AGGREGATE_STATE_TABLE = 'aggregate_state';

export const countBucketTable = convexTable(
  AGGREGATE_BUCKET_TABLE,
  {
    tableKey: text().notNull(),
    indexName: text().notNull(),
    keyHash: text().notNull(),
    keyParts: custom(v.array(v.any())).notNull(),
    count: integer().notNull(),
    sumValues: custom(v.record(v.string(), v.number())).notNull(),
    nonNullCountValues: custom(v.record(v.string(), v.number())).notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('by_table_index_hash').on(t.tableKey, t.indexName, t.keyHash),
    index('by_table_index').on(t.tableKey, t.indexName),
  ]
);

export const countMemberTable = convexTable(
  AGGREGATE_MEMBER_TABLE,
  {
    tableKey: text().notNull(),
    indexName: text().notNull(),
    docId: text().notNull(),
    keyHash: text().notNull(),
    keyParts: custom(v.array(v.any())).notNull(),
    sumValues: custom(v.record(v.string(), v.number())).notNull(),
    nonNullCountValues: custom(v.record(v.string(), v.number())).notNull(),
    extremaValues: custom(v.record(v.string(), v.any())).notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('by_table_index_doc').on(t.tableKey, t.indexName, t.docId),
    index('by_table_index').on(t.tableKey, t.indexName),
  ]
);

export const countExtremaTable = convexTable(
  AGGREGATE_EXTREMA_TABLE,
  {
    tableKey: text().notNull(),
    indexName: text().notNull(),
    keyHash: text().notNull(),
    fieldName: text().notNull(),
    valueHash: text().notNull(),
    value: custom(v.any()).notNull(),
    sortKey: text().notNull(),
    count: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('by_table_index').on(t.tableKey, t.indexName),
    index('by_table_index_hash_field_value').on(
      t.tableKey,
      t.indexName,
      t.keyHash,
      t.fieldName,
      t.valueHash
    ),
    index('by_table_index_hash_field_sort').on(
      t.tableKey,
      t.indexName,
      t.keyHash,
      t.fieldName,
      t.sortKey
    ),
  ]
);

export const countStateTable = convexTable(
  AGGREGATE_STATE_TABLE,
  {
    tableKey: text().notNull(),
    indexName: text().notNull(),
    keyDefinitionHash: text().notNull(),
    metricDefinitionHash: text().notNull(),
    status: text().notNull(),
    cursor: text(),
    processed: integer().notNull(),
    startedAt: integer().notNull(),
    updatedAt: integer().notNull(),
    completedAt: integer(),
    lastError: text(),
  },
  (t) => [
    index('by_table_index').on(t.tableKey, t.indexName),
    index('by_status').on(t.status),
  ]
);

export const aggregateStorageTables = {
  [AGGREGATE_BUCKET_TABLE]: countBucketTable,
  [AGGREGATE_MEMBER_TABLE]: countMemberTable,
  [AGGREGATE_EXTREMA_TABLE]: countExtremaTable,
  [AGGREGATE_STATE_TABLE]: countStateTable,
} as const;

export const AGGREGATE_STORAGE_TABLE_NAMES = new Set([
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_MEMBER_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_STATE_TABLE,
]);

export function injectAggregateStorageTables<
  TSchema extends Record<string, unknown>,
>(schema: TSchema): TSchema & typeof aggregateStorageTables {
  const merged = {
    ...schema,
  } as TSchema & typeof aggregateStorageTables;

  for (const [tableName, tableDef] of Object.entries(aggregateStorageTables)) {
    if (
      tableName in schema &&
      (schema as Record<string, unknown>)[tableName] !== tableDef
    ) {
      throw new Error(
        `defineSchema cannot inject internal table '${tableName}' because the name is already in use.`
      );
    }
    (merged as Record<string, unknown>)[tableName] = tableDef;
  }

  return merged;
}
