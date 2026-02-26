import {
  aggregateIndex,
  Columns,
  check,
  convexTable,
  getTableColumns,
  getTableConfig,
  id,
  index,
  isNotNull,
  TableName,
  text,
  uniqueIndex,
} from './index';

test('getTableColumns includes system fields', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  const columns = getTableColumns(users);

  expect(columns).toHaveProperty('name');
  expect(columns).toHaveProperty('email');
  expect(columns).toHaveProperty('id');
  expect(columns).toHaveProperty('createdAt');
  expect(columns).not.toHaveProperty('_creationTime');
});

test('getTableColumns reserves createdAt as system _creationTime when present', () => {
  const users = convexTable('users_with_created_at_introspection', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });

  const columns = getTableColumns(users) as any;
  expect(columns).toHaveProperty('createdAt');
  expect(columns.createdAt.config.name).toBe('_creationTime');
  expect(columns).not.toHaveProperty('_creationTime');
});

test('getTableConfig includes indexes/unique/fk/rls/checks', () => {
  const users = convexTable.withRLS(
    'users',
    {
      name: text().notNull(),
      email: text().notNull(),
    },
    (t) => [
      index('by_name').on(t.name),
      aggregateIndex('by_name_count').on(t.name),
      aggregateIndex('all_name_metrics').all().min(t.name).max(t.name),
      uniqueIndex('unique_email').on(t.email),
      check('name_present', isNotNull(t.name)),
    ]
  );

  const posts = convexTable('posts', {
    userId: id('users').notNull(),
    title: text().notNull(),
  });

  const usersConfig = getTableConfig(users);
  expect(usersConfig.name).toBe('users');
  expect(usersConfig.indexes.some((idx) => idx.name === 'by_name')).toBe(true);
  expect(
    usersConfig.uniqueIndexes.some((idx) => idx.name === 'unique_email')
  ).toBe(true);
  expect(
    usersConfig.aggregateIndexes.some((idx) => idx.name === 'all_name_metrics')
  ).toBe(true);
  expect(
    usersConfig.aggregateIndexes.some((idx) => idx.name === 'by_name_count')
  ).toBe(true);
  expect(usersConfig.rls.enabled).toBe(true);
  expect(usersConfig.checks.some((c) => c.name === 'name_present')).toBe(true);

  const postsConfig = getTableConfig(posts);
  expect(postsConfig.foreignKeys.length).toBe(1);
  expect(postsConfig.foreignKeys[0].foreignTableName).toBe('users');
  expect(postsConfig.foreignKeys[0].foreignColumns).toEqual(['_id']);
});

test('getTableColumns synthesizes system fields when table metadata is partial', () => {
  const table = {
    [TableName]: 'users',
    [Columns]: {
      name: text().notNull(),
    },
  } as any;

  const columns = getTableColumns(table);
  expect(columns).toHaveProperty('name');
  expect(columns).toHaveProperty('id');
  expect(columns).toHaveProperty('createdAt');
  expect(columns).not.toHaveProperty('_creationTime');

  expect((columns.id as any).config.table).toBe(table);
  expect((columns.createdAt as any).config.table).toBe(table);
});
