import {
  convexTable,
  defineRelations,
  defineSchema,
  defineSchemaExtension,
  getSchemaRelations,
  getSchemaTriggers,
  getTableConfig,
  id,
  text,
  timestamp,
} from './index';
import {
  OrmSchemaDefinition,
  OrmSchemaExtensions,
  OrmSchemaOptions,
} from './symbols';

function ratelimitExtension() {
  return defineSchemaExtension('ratelimit', {
    ratelimitState: convexTable('ratelimit_state', {
      name: text().notNull(),
    }),
    ratelimitDynamicLimit: convexTable('ratelimit_dynamic_limit', {
      prefix: text().notNull(),
    }),
    ratelimitProtectionHit: convexTable('ratelimit_protection_hit', {
      value: text().notNull(),
    }),
  });
}

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

  expect(schema.tables).not.toHaveProperty('ratelimitState');
  expect(schema.tables).not.toHaveProperty('ratelimitDynamicLimit');
  expect(schema.tables).not.toHaveProperty('ratelimitProtectionHit');
});

test('defineSchema injects ratelimit storage tables when ratelimitExtension is enabled', () => {
  const users = convexTable('ratelimit_schema_plugin_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users }).extend(ratelimitExtension());

  expect(schema.tables).toHaveProperty('ratelimitState');
  expect(schema.tables).toHaveProperty('ratelimitDynamicLimit');
  expect(schema.tables).toHaveProperty('ratelimitProtectionHit');
});

test('defineSchema stores resolved extension descriptors for downstream codegen', () => {
  const users = convexTable('plugin_descriptor_users', {
    name: text().notNull(),
  });

  const schema = defineSchema({ users }).extend(ratelimitExtension());

  const extensions = (
    schema as { [OrmSchemaExtensions]?: readonly { key: string }[] }
  )[OrmSchemaExtensions];

  expect(extensions?.map((extension) => extension.key)).toEqual(
    expect.arrayContaining(['aggregate', 'migration', 'ratelimit'])
  );
});

test('defineSchema throws for duplicate extension registration', () => {
  const users = convexTable('duplicate_plugin_users', {
    name: text().notNull(),
  });

  expect(() =>
    defineSchema({
      users,
    }).extend(ratelimitExtension(), ratelimitExtension())
  ).toThrow(/duplicate extension/i);
});

test('defineSchema throws when extension-injected table name is already in use', () => {
  const users = convexTable('plugin_collision_users', {
    name: text().notNull(),
  });
  const ratelimitState = convexTable('ratelimit_state', {
    name: text().notNull(),
  });

  expect(() =>
    defineSchema({ users, ratelimitState }).extend(ratelimitExtension())
  ).toThrow(/cannot inject internal table 'ratelimitState'/i);
});

test('defineSchema stores relations metadata from chained relations on default schema export', () => {
  const users = convexTable('schema_meta_users', {
    name: text().notNull(),
  });
  const posts = convexTable('schema_meta_posts', {
    title: text().notNull(),
    userId: id('schema_meta_users')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  });
  const tables = { users, posts } as const;

  const schema = defineSchema(tables).relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
    posts: {
      user: r.one.users({ from: r.posts.userId, to: r.users.id }),
    },
  }));

  const relations = getSchemaRelations(schema);
  expect(relations).toBeDefined();
  expect(relations).toHaveProperty('users');
  expect(relations).toHaveProperty('posts');
});

test('defineRelations(tables) preserves schema metadata from defineSchema(tables)', () => {
  const users = convexTable('schema_tables_users', {
    name: text().notNull(),
  });
  const posts = convexTable('schema_tables_posts', {
    title: text().notNull(),
    userId: id('schema_tables_users').notNull(),
  });
  const tables = { users, posts } as const;

  const schema = defineSchema(tables, {
    defaults: { defaultLimit: 7 },
  });
  const relations = defineRelations(tables, (r) => ({
    users: {
      posts: r.many.posts(),
    },
    posts: {
      user: r.one.users({ from: r.posts.userId, to: r.users.id }),
    },
  }));

  expect(
    (relations as { [OrmSchemaDefinition]?: unknown })[OrmSchemaDefinition]
  ).toBe(schema);
  expect(
    (
      relations as {
        [OrmSchemaOptions]?: { defaults?: { defaultLimit?: number } };
      }
    )[OrmSchemaOptions]?.defaults?.defaultLimit
  ).toBe(7);
});

test('defineSchema stores trigger metadata from chained triggers on default schema export', () => {
  const users = convexTable('schema_meta_trigger_users', {
    name: text().notNull(),
    updatedAt: timestamp().notNull().defaultNow(),
  });
  const tables = { users } as const;

  const schema = defineSchema(tables)
    .relations(() => ({
      users: {},
    }))
    .triggers({
      users: {
        change: async () => {},
      },
    });

  const triggers = getSchemaTriggers(schema);
  expect(triggers).toBeDefined();
  expect(triggers).toHaveProperty('users');
});

test('defineSchema composes extension-provided relations when app relations are not provided', () => {
  const users = convexTable('schema_plugin_ext_users', {
    name: text().notNull(),
  });
  const posts = convexTable('schema_plugin_ext_posts', {
    title: text().notNull(),
    userId: id('schema_plugin_ext_users')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  });

  const relationExtension = defineSchemaExtension('relation-plugin', {
    users,
    posts,
  }).relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
    posts: {
      user: r.one.users({
        from: r.posts.userId,
        to: r.users.id,
      }),
    },
  }));

  const schema = defineSchema({}).extend(relationExtension);
  const relations = getSchemaRelations(schema);

  expect(relations).toBeDefined();
  expect(relations?.users?.relations).toHaveProperty('posts');
});

test('defineSchema composes extension relations with app relations', () => {
  const users = convexTable('schema_plugin_ext_merge_users', {
    name: text().notNull(),
  });
  const posts = convexTable('schema_plugin_ext_merge_posts', {
    title: text().notNull(),
    userId: id('schema_plugin_ext_merge_users')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  });

  const relationExtension = defineSchemaExtension('relation-merge-plugin', {
    users,
    posts,
  }).relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
  }));
  const extensions = [relationExtension] as const;

  const schema = defineSchema({})
    .extend(...extensions)
    .relations((r) => ({
      posts: {
        user: r.one.users({
          from: r.posts.userId,
          to: r.users.id,
        }),
      },
    }));
  const relations = getSchemaRelations(schema);

  expect(relations?.users?.relations).toHaveProperty('posts');
  expect(relations?.posts?.relations).toHaveProperty('user');
});

test('defineSchema throws when extension relations collide with app relation fields', () => {
  const users = convexTable('schema_plugin_ext_collision_users', {
    name: text().notNull(),
  });
  const posts = convexTable('schema_plugin_ext_collision_posts', {
    title: text().notNull(),
    userId: id('schema_plugin_ext_collision_users')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  });

  const relationExtension = defineSchemaExtension('relation-collision-plugin', {
    users,
    posts,
  }).relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
    posts: {
      user: r.one.users({
        from: r.posts.userId,
        to: r.users.id,
      }),
    },
  }));
  const extensions = [relationExtension] as const;

  expect(() =>
    defineSchema({})
      .extend(...extensions)
      .relations((r) => ({
        users: {
          posts: r.many.posts(),
        },
      }))
  ).toThrow(/relation field 'users\.posts' is defined more than once/i);
});

test('defineSchema composes extension triggers with app triggers', () => {
  const users = convexTable('schema_extension_trigger_users', {
    name: text().notNull(),
  });

  const triggerExtension = defineSchemaExtension('trigger-extension', { users })
    .relations((r) => ({
      users: {},
    }))
    .triggers({
      users: {
        change: async () => {},
      },
    });

  const schema = defineSchema({})
    .extend(triggerExtension)
    .triggers({
      users: {
        create: {
          after: async () => {},
        },
      },
    });

  const triggers = getSchemaTriggers(schema);
  expect(triggers?.users?.change).toBeFunction();
  expect(triggers?.users?.create?.after).toBeFunction();
});
