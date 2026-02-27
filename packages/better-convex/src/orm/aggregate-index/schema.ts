import { v } from 'convex/values';
import { custom, id, integer, text } from '../builders';
import { index } from '../indexes';
import type { OrmSchemaPlugin } from '../symbols';
import { convexTable } from '../table';

export const AGGREGATE_BUCKET_TABLE = 'aggregate_bucket';
export const AGGREGATE_MEMBER_TABLE = 'aggregate_member';
export const AGGREGATE_EXTREMA_TABLE = 'aggregate_extrema';
export const AGGREGATE_RANK_TREE_TABLE = 'aggregate_rank_tree';
export const AGGREGATE_RANK_NODE_TABLE = 'aggregate_rank_node';
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
    kind: text().notNull(),
    tableKey: text().notNull(),
    indexName: text().notNull(),
    docId: text().notNull(),
    keyHash: text().notNull(),
    keyParts: custom(v.array(v.any())).notNull(),
    sumValues: custom(v.record(v.string(), v.number())).notNull(),
    nonNullCountValues: custom(v.record(v.string(), v.number())).notNull(),
    extremaValues: custom(v.record(v.string(), v.any())).notNull(),
    rankNamespace: custom(v.any()),
    rankKey: custom(v.any()),
    rankSumValue: integer(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('by_kind_table_index_doc').on(
      t.kind,
      t.tableKey,
      t.indexName,
      t.docId
    ),
    index('by_kind_table_index').on(t.kind, t.tableKey, t.indexName),
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
    kind: text().notNull(),
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
    index('by_kind_table_index').on(t.kind, t.tableKey, t.indexName),
    index('by_kind_status').on(t.kind, t.status),
  ]
);

const aggregateCounterValidator = v.object({
  count: v.number(),
  sum: v.number(),
});

const aggregateItemValidator = v.object({
  k: v.any(),
  v: v.any(),
  s: v.number(),
});

export const rankTreeTable = convexTable(
  AGGREGATE_RANK_TREE_TABLE,
  {
    aggregateName: text().notNull(),
    maxNodeSize: integer().notNull(),
    namespace: custom(v.any()),
    root: id(AGGREGATE_RANK_NODE_TABLE).notNull(),
  },
  (tree) => [
    index('by_namespace').on(tree.namespace),
    index('by_aggregate_name').on(tree.aggregateName),
  ]
);

export const rankNodeTable = convexTable(AGGREGATE_RANK_NODE_TABLE, {
  aggregate: custom(aggregateCounterValidator),
  items: custom(v.array(aggregateItemValidator)).notNull(),
  subtrees: custom(v.array(v.string())).notNull(),
});

export const aggregateStorageTables = {
  [AGGREGATE_BUCKET_TABLE]: countBucketTable,
  [AGGREGATE_MEMBER_TABLE]: countMemberTable,
  [AGGREGATE_EXTREMA_TABLE]: countExtremaTable,
  [AGGREGATE_RANK_TREE_TABLE]: rankTreeTable,
  [AGGREGATE_RANK_NODE_TABLE]: rankNodeTable,
  [AGGREGATE_STATE_TABLE]: countStateTable,
} as const;

export const AGGREGATE_STORAGE_TABLE_NAMES = new Set([
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_MEMBER_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_RANK_TREE_TABLE,
  AGGREGATE_RANK_NODE_TABLE,
  AGGREGATE_STATE_TABLE,
]);

const AGGREGATE_PLUGIN_TABLE_NAMES = [
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_MEMBER_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_RANK_TREE_TABLE,
  AGGREGATE_RANK_NODE_TABLE,
  AGGREGATE_STATE_TABLE,
] as const;

export function aggregatePlugin(): OrmSchemaPlugin {
  return {
    key: 'aggregate',
    tableNames: AGGREGATE_PLUGIN_TABLE_NAMES,
    inject: injectAggregateStorageTables,
  };
}

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
