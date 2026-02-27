import { ratelimitPlugin } from '../plugins/ratelimit';
import { convexTable, defineSchema, getTableConfig, id, text } from './index';

test('convexTable works with defineSchema()', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  const posts = convexTable('posts', {
    title: text().notNull(),
    content: text().notNull(),
  });

  // Should not throw
  const schema = defineSchema({
    users,
    posts,
  });

  expect(schema).toBeDefined();
  expect(schema.tables).toHaveProperty('users');
  expect(schema.tables).toHaveProperty('posts');
});

test('convexTable validator is compatible with Convex schema', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  // Should have validator property
  expect(users.validator).toBeDefined();
  expect(users.tableName).toBe('users');
});

test.each([
  'id',
  '_id',
  '_creationTime',
])('convexTable rejects reserved column name: %s', (columnName) => {
  expect(() =>
    convexTable('users', {
      [columnName]: text().notNull(),
    } as Record<string, ReturnType<typeof text>>)
  ).toThrow(/reserved/i);
});

test('convexTable allows createdAt as user column', () => {
  const users = convexTable('users_with_created_at', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });

  expect((users as any).createdAt?.config?.name).toBe('createdAt');
});

test('references resolves self references via table.id', () => {
  let comments: ReturnType<typeof convexTable>;
  comments = convexTable('comments', {
    content: text().notNull(),
    parentId: text()
      .references(() => comments.id, { onDelete: 'cascade' })
      .notNull(),
  });

  expect(() => defineSchema({ comments })).not.toThrow();

  const config = getTableConfig(comments);
  expect(config.foreignKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        columns: ['parentId'],
        foreignTableName: 'comments',
        foreignColumns: ['_id'],
        onDelete: 'cascade',
      }),
    ])
  );
});

test('references resolves forward references via table.id', () => {
  const posts = convexTable('posts', {
    title: text().notNull(),
    userId: text()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  });

  const users = convexTable('users', {
    name: text().notNull(),
  });

  expect(() => defineSchema({ posts, users })).not.toThrow();

  const config = getTableConfig(posts);
  expect(config.foreignKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        columns: ['userId'],
        foreignTableName: 'users',
        foreignColumns: ['_id'],
        onDelete: 'cascade',
      }),
    ])
  );
});

test('references rejects detached id(table) callbacks', () => {
  const users = convexTable('users', {
    name: text().notNull(),
  });

  const posts = convexTable('posts', {
    title: text().notNull(),
    userId: text()
      .references(() => id('users'), { onDelete: 'cascade' })
      .notNull(),
  });

  expect(() => getTableConfig(posts)).toThrow(/without table metadata/i);
});

test('defineSchema auto-injects internal count storage tables', () => {
  const users = convexTable('count_schema_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users });

  expect(schema.tables).toHaveProperty('aggregate_bucket');
  expect(schema.tables).toHaveProperty('aggregate_member');
  expect(schema.tables).toHaveProperty('aggregate_extrema');
  expect(schema.tables).toHaveProperty('aggregate_state');
});

test('defineSchema auto-injects internal migration storage tables', () => {
  const users = convexTable('migration_schema_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users });

  expect(schema.tables).toHaveProperty('migration_state');
  expect(schema.tables).toHaveProperty('migration_run');
});

test('defineSchema does not inject ratelimit storage tables by default', () => {
  const users = convexTable('ratelimit_schema_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users });

  expect(schema.tables).not.toHaveProperty('ratelimit_state');
  expect(schema.tables).not.toHaveProperty('ratelimit_dynamic_limit');
  expect(schema.tables).not.toHaveProperty('ratelimit_protection_hit');
});

test('defineSchema injects ratelimit storage tables when ratelimitPlugin is enabled', () => {
  const users = convexTable('ratelimit_schema_plugin_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users }, { plugins: [ratelimitPlugin()] });

  expect(schema.tables).toHaveProperty('ratelimit_state');
  expect(schema.tables).toHaveProperty('ratelimit_dynamic_limit');
  expect(schema.tables).toHaveProperty('ratelimit_protection_hit');
});

test('defineSchema throws for duplicate plugin registration', () => {
  const users = convexTable('duplicate_plugin_users', {
    name: text().notNull(),
  });

  expect(() =>
    defineSchema({ users }, { plugins: [ratelimitPlugin(), ratelimitPlugin()] })
  ).toThrow(/duplicate plugin/i);
});

test('defineSchema throws when plugin-injected table name is already in use', () => {
  const users = convexTable('plugin_collision_users', {
    name: text().notNull(),
  });
  const ratelimitState = convexTable('ratelimit_state', {
    name: text().notNull(),
  });

  expect(() =>
    defineSchema(
      { users, ratelimit_state: ratelimitState },
      { plugins: [ratelimitPlugin()] }
    )
  ).toThrow(/cannot inject internal table 'ratelimit_state'/i);
});
