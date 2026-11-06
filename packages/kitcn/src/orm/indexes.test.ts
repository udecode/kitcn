/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import {
  aggregateIndex,
  convexTable,
  defineSchema,
  getTableConfig,
  index,
  integer,
  rankIndex,
  searchIndex,
  text,
  timestamp,
  vector,
  vectorIndex,
} from './index';

const expectExportToThrow = (table: { tableName: string }, error: RegExp) => {
  expect(() =>
    defineSchema({ [table.tableName]: table } as any).export()
  ).toThrow(error);
};

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
  expectExportToThrow(
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('missing_on') as any,
    ]),
    /Did you forget to call \.on/
  );
});

test('vectorIndex requires .on()', () => {
  expectExportToThrow(
    convexTable('posts', { embedding: vector(1536).notNull() }, () => [
      vectorIndex('missing_on') as any,
    ]),
    /Did you forget to call \.on/
  );
});

test('vectorIndex requires dimensions', () => {
  expectExportToThrow(
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('missing_dimensions').on(t.embedding),
    ]),
    /missing dimensions/i
  );
});

test('searchIndex validates search field type', () => {
  expectExportToThrow(
    convexTable('posts', { count: integer().notNull() }, (t) => [
      searchIndex('search_count').on(t.count),
    ]),
    /only supports text\(\) columns/
  );
});

test('vectorIndex validates vector field type', () => {
  expectExportToThrow(
    convexTable('posts', { text: text().notNull() }, (t) => [
      vectorIndex('vec').on(t.text).dimensions(1536),
    ]),
    /requires a vector\(\) column/
  );
});

test('vectorIndex validates dimensions match vector column', () => {
  expectExportToThrow(
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(768),
    ]),
    /dimensions \(768\) do not match vector column/
  );
});

test('vectorIndex validates dimensions values', () => {
  expectExportToThrow(
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(0),
    ]),
    /must be positive/
  );

  expectExportToThrow(
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(1.5),
    ]),
    /must be an integer/
  );
});

test('vector builder validates dimensions values', () => {
  expect(() => vector(0)).toThrow(/must be positive/);
  expect(() => vector(1.25)).toThrow(/must be an integer/);
});

test('searchIndex validates table ownership for columns', () => {
  const users = convexTable('users', { name: text().notNull() });

  expectExportToThrow(
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('search_users').on(users.name),
    ]),
    /references column from 'users'/
  );
});

test('createdAt index is forbidden because createdAt aliases _creationTime', () => {
  expectExportToThrow(
    convexTable(
      'events',
      {
        name: text().notNull(),
        createdAt: integer().notNull(),
      },
      (t) => [index('by_created_at').on(t.createdAt)]
    ),
    /cannot use 'createdAt'/i
  );
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
  expectExportToThrow(
    convexTable('count_index_missing_on', { orgId: text().notNull() }, () => [
      aggregateIndex('missing_on') as any,
    ]),
    /Did you forget to call \.on\(\.\.\.\) or \.all\(\)/
  );
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
  expectExportToThrow(
    convexTable(
      'aggregate_index_missing_on',
      { orgId: text().notNull() },
      () => [aggregateIndex('missing_on') as any]
    ),
    /Did you forget to call \.on\(\.\.\.\) or \.all\(\)/
  );
});

test('rankIndex orderBy accepts documented direction objects', () => {
  const cards = convexTable(
    'rank_index_cards',
    {
      score: integer().notNull(),
      status: text().notNull(),
      updatedAt: timestamp().notNull(),
    },
    (t) => [
      rankIndex('cards_by_status_recent')
        .partitionBy(t.status)
        .orderBy({ column: t.updatedAt, direction: 'desc' })
        .orderBy(t.score),
    ]
  );

  expect(getTableConfig(cards).rankIndexes).toEqual([
    {
      name: 'cards_by_status_recent',
      partitionFields: ['status'],
      orderFields: [
        { field: 'updatedAt', direction: 'desc' },
        { field: 'score', direction: 'asc' },
      ],
      sumField: undefined,
    },
  ]);
});

test('aggregateIndex sum() validates numeric columns', () => {
  expectExportToThrow(
    convexTable(
      'aggregate_index_invalid_sum',
      { orgId: text().notNull(), status: text() },
      (t) => [aggregateIndex('by_org').on(t.orgId).sum(t.status)]
    ),
    /sum\(\) supports integer\(\)\/timestamp\(\) columns only/i
  );
});

test('aggregateIndex avg() validates numeric columns', () => {
  expectExportToThrow(
    convexTable(
      'aggregate_index_invalid_avg',
      { orgId: text().notNull(), status: text() },
      (t) => [aggregateIndex('by_org').on(t.orgId).avg(t.status)]
    ),
    /avg\(\) supports integer\(\)\/timestamp\(\) columns only/i
  );
});
