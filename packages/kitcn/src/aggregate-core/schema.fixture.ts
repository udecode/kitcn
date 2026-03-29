import { defineSchema, defineTable } from 'convex/server';
import { type Value as ConvexValue, type Infer, v } from 'convex/values';
import { AGGREGATE_NODE_TABLE, AGGREGATE_TREE_TABLE } from './schema.js';

const item = v.object({
  k: v.any(),
  v: v.any(),
  s: v.number(),
});

export type Item = {
  k: ConvexValue;
  v: ConvexValue;
  s: number;
};

export const aggregate = v.object({
  count: v.number(),
  sum: v.number(),
});

export type Aggregate = Infer<typeof aggregate>;

export default defineSchema({
  [AGGREGATE_TREE_TABLE]: defineTable({
    aggregateName: v.string(),
    root: v.id(AGGREGATE_NODE_TABLE),
    namespace: v.optional(v.any()),
    maxNodeSize: v.number(),
  })
    .index('by_namespace', ['namespace'])
    .index('by_aggregate_name', ['aggregateName']),
  [AGGREGATE_NODE_TABLE]: defineTable({
    items: v.array(item),
    subtrees: v.array(v.id(AGGREGATE_NODE_TABLE)),
    aggregate: v.optional(aggregate),
  }),
});
