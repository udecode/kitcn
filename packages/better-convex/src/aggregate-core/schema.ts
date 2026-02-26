import { type Infer, v } from 'convex/values';
import { custom, id, integer, text } from '../orm/builders';
import { index } from '../orm/indexes';
import { convexTable } from '../orm/table';

export const AGGREGATE_TREE_TABLE = 'aggregate_rank_tree';
export const AGGREGATE_NODE_TABLE = 'aggregate_rank_node';

export const aggregateCounterValidator = v.object({
  count: v.number(),
  sum: v.number(),
});

export const aggregateItemValidator = v.object({
  k: v.any(),
  v: v.any(),
  s: v.number(),
});

export type AggregateCounter = Infer<typeof aggregateCounterValidator>;
export type AggregateItem = Infer<typeof aggregateItemValidator>;

export const aggregateTreeTable = convexTable(
  AGGREGATE_TREE_TABLE,
  {
    aggregateName: text().notNull(),
    maxNodeSize: integer().notNull(),
    namespace: custom(v.any()),
    root: id(AGGREGATE_NODE_TABLE).notNull(),
  },
  (tree) => [
    index('by_namespace').on(tree.namespace),
    index('by_aggregate_name').on(tree.aggregateName),
  ]
);

export const aggregateNodeTable = convexTable(AGGREGATE_NODE_TABLE, {
  aggregate: custom(aggregateCounterValidator),
  items: custom(v.array(aggregateItemValidator)).notNull(),
  subtrees: custom(v.array(v.string())).notNull(),
});

export const aggregateStorageTables = {
  [AGGREGATE_NODE_TABLE]: aggregateNodeTable,
  [AGGREGATE_TREE_TABLE]: aggregateTreeTable,
} as const;
