/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import {
  aggregateIndex,
  convexTable,
  defineSchema,
  index,
  integer,
  searchIndex,
  text,
  vector,
  vectorIndex,
} from './index';

test('search and vector index builders export correctly', () => {
  const posts = convexTable(
    'posts',
    {
      text: text().notNull(),
      type: text().notNull(),
      embedding: vector(1536).notNull(),
    },
    (t) => [
      searchIndex('text_search').on(t.text).filter(t.type),
      searchIndex('text_empty_filter').on(t.text).filter(),
      searchIndex('text_search_staged').on(t.text).staged(),
      vectorIndex('embedding_vec')
        .on(t.embedding)
        .dimensions(1536)
        .filter(t.type),
      vectorIndex('embedding_vec_staged')
        .on(t.embedding)
        .dimensions(1536)
        .staged(),
    ]
  );

  const schema = defineSchema({ posts });
  const exported = JSON.parse(
    (schema as unknown as { export(): string }).export()
  ) as {
    tables: Array<{
      tableName: string;
      searchIndexes: unknown[];
      stagedSearchIndexes: unknown[];
      vectorIndexes: unknown[];
      stagedVectorIndexes: unknown[];
    }>;
  };

  const table = exported.tables.find((entry) => entry.tableName === 'posts');
  expect(table).toBeDefined();

  expect(table?.searchIndexes).toEqual([
    {
      indexDescriptor: 'text_search',
      searchField: 'text',
      filterFields: ['type'],
    },
    {
      indexDescriptor: 'text_empty_filter',
      searchField: 'text',
      filterFields: [],
    },
  ]);

  expect(table?.stagedSearchIndexes).toEqual([
    {
      indexDescriptor: 'text_search_staged',
      searchField: 'text',
      filterFields: [],
    },
  ]);

  expect(table?.vectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['type'],
    },
  ]);

  expect(table?.stagedVectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec_staged',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: [],
    },
  ]);
});

test('extraConfig object return works for search and vector indexes', () => {
  const posts = convexTable(
    'posts',
    {
      text: text().notNull(),
      embedding: vector(1536).notNull(),
    },
    (t) => ({
      search: searchIndex('text_search').on(t.text),
      vector: vectorIndex('embedding_vec').on(t.embedding).dimensions(1536),
    })
  );

  const schema = defineSchema({ posts });
  const exported = JSON.parse(
    (schema as unknown as { export(): string }).export()
  ) as {
    tables: Array<{
      tableName: string;
      searchIndexes: unknown[];
      vectorIndexes: unknown[];
    }>;
  };

  const table = exported.tables.find((entry) => entry.tableName === 'posts');
  expect(table?.searchIndexes).toEqual([
    {
      indexDescriptor: 'text_search',
      searchField: 'text',
      filterFields: [],
    },
  ]);
  expect(table?.vectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: [],
    },
  ]);
});

test('searchIndex requires .on()', () => {
  expect(() =>
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('missing_on') as any,
    ])
  ).toThrow(/Did you forget to call \.on/);
});

test('vectorIndex requires .on()', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, () => [
      vectorIndex('missing_on') as any,
    ])
  ).toThrow(/Did you forget to call \.on/);
});

test('vectorIndex requires dimensions', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('missing_dimensions').on(t.embedding),
    ])
  ).toThrow(/missing dimensions/i);
});

test('searchIndex validates search field type', () => {
  expect(() =>
    convexTable('posts', { count: integer().notNull() }, (t) => [
      searchIndex('search_count').on(t.count),
    ])
  ).toThrow(/only supports text\(\) columns/);
});

test('vectorIndex validates vector field type', () => {
  expect(() =>
    convexTable('posts', { text: text().notNull() }, (t) => [
      vectorIndex('vec').on(t.text).dimensions(1536),
    ])
  ).toThrow(/requires a vector\(\) column/);
});

test('vectorIndex validates dimensions match vector column', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(768),
    ])
  ).toThrow(/dimensions \(768\) do not match vector column/);
});

test('vectorIndex validates dimensions values', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(0),
    ])
  ).toThrow(/must be positive/);

  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(1.5),
    ])
  ).toThrow(/must be an integer/);
});

test('vector builder validates dimensions values', () => {
  expect(() => vector(0)).toThrow(/must be positive/);
  expect(() => vector(1.25)).toThrow(/must be an integer/);
});

test('searchIndex validates table ownership for columns', () => {
  const users = convexTable('users', { name: text().notNull() });

  expect(() =>
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('search_users').on(users.name),
    ])
  ).toThrow(/references column from 'users'/);
});

test('createdAt index is forbidden because createdAt aliases _creationTime', () => {
  expect(() =>
    convexTable(
      'events',
      {
        name: text().notNull(),
        createdAt: integer().notNull(),
      },
      (t) => [index('by_created_at').on(t.createdAt)]
    )
  ).toThrow(/cannot use 'createdAt'/i);
});

test('aggregateIndex count-only usage exports and stores metadata', () => {
  const users = convexTable(
    'count_index_users',
    {
      orgId: text().notNull(),
      status: text(),
    },
    (t) => [aggregateIndex('by_org_status').on(t.orgId, t.status)]
  );

  const config = (users as any).getAggregateIndexes?.();
  expect(config).toEqual([
    {
      name: 'by_org_status',
      fields: ['orgId', 'status'],
      countFields: [],
      sumFields: [],
      avgFields: [],
      minFields: [],
      maxFields: [],
    },
  ]);
});

test('aggregateIndex requires .on(...) or .all()', () => {
  expect(() =>
    convexTable('count_index_missing_on', { orgId: text().notNull() }, () => [
      aggregateIndex('missing_on') as any,
    ])
  ).toThrow(/Did you forget to call \.on\(\.\.\.\) or \.all\(\)/);
});

test('aggregateIndex builder exports and stores metric metadata', () => {
  const metrics = convexTable(
    'aggregate_index_metrics',
    {
      orgId: text().notNull(),
      status: text(),
      amount: integer(),
      score: integer(),
    },
    (t) => [
      aggregateIndex('all_metrics')
        .all()
        .count(t.status)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
      aggregateIndex('by_org_status')
        .on(t.orgId, t.status)
        .count(t.status)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
    ]
  );

  const config = (metrics as any).getAggregateIndexes?.();
  expect(config).toEqual([
    {
      name: 'all_metrics',
      fields: [],
      countFields: ['status'],
      sumFields: ['amount'],
      avgFields: ['amount'],
      minFields: ['score'],
      maxFields: ['score'],
    },
    {
      name: 'by_org_status',
      fields: ['orgId', 'status'],
      countFields: ['status'],
      sumFields: ['amount'],
      avgFields: ['amount'],
      minFields: ['score'],
      maxFields: ['score'],
    },
  ]);
});

test('aggregateIndex requires .on(...) or .all()', () => {
  expect(() =>
    convexTable(
      'aggregate_index_missing_on',
      { orgId: text().notNull() },
      () => [aggregateIndex('missing_on') as any]
    )
  ).toThrow(/Did you forget to call \.on\(\.\.\.\) or \.all\(\)/);
});

test('aggregateIndex sum() validates numeric columns', () => {
  expect(() =>
    convexTable(
      'aggregate_index_invalid_sum',
      { orgId: text().notNull(), status: text() },
      (t) => [aggregateIndex('by_org').on(t.orgId).sum(t.status)]
    )
  ).toThrow(/sum\(\) supports integer\(\)\/timestamp\(\) columns only/i);
});

test('aggregateIndex avg() validates numeric columns', () => {
  expect(() =>
    convexTable(
      'aggregate_index_invalid_avg',
      { orgId: text().notNull(), status: text() },
      (t) => [aggregateIndex('by_org').on(t.orgId).avg(t.status)]
    )
  ).toThrow(/avg\(\) supports integer\(\)\/timestamp\(\) columns only/i);
});
