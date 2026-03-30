import { expect, test } from 'vitest';
import schema, {
  tagsTable,
  todosTable,
  todoTagsTable,
  userTable,
} from '../../example/convex/functions/schema';
import { withOrmCtx } from '../setup.testing';

const EXAMPLE_ENV_DEFAULTS = {
  ADMIN: 'admin@example.com',
  BETTER_AUTH_SECRET: 'test-secret',
  GITHUB_CLIENT_ID: 'github-client-id',
  GITHUB_CLIENT_SECRET: 'github-client-secret',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
} as const;

const withExampleEnv = async (run: () => Promise<void>) => {
  const original = Object.fromEntries(
    Object.keys(EXAMPLE_ENV_DEFAULTS).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(EXAMPLE_ENV_DEFAULTS)) {
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
};

test('example schema applies defaultLimit to unsized findMany', async () => {
  await withExampleEnv(async () => {
    await withOrmCtx(schema, schema, async (ctx) => {
      await expect(
        ctx.orm.query.tags.findMany({
          where: { createdBy: 'missing-user' },
          orderBy: { createdAt: 'asc' },
        })
      ).resolves.toEqual([]);
    });
  });
});

test('example schema applies defaultLimit to relation loading', async () => {
  await withExampleEnv(async () => {
    await withOrmCtx(schema, schema, async (ctx) => {
      const [{ id: userId }] = await ctx.orm
        .insert(userTable)
        .values({
          name: 'Example User',
          email: 'example-default-limit@test.dev',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: userTable.id });

      const [{ id: todoId }] = await ctx.orm
        .insert(todosTable)
        .values({
          title: 'Default limit relation regression',
          completed: false,
          userId,
        })
        .returning({ id: todosTable.id });

      const [{ id: tagId }] = await ctx.orm
        .insert(tagsTable)
        .values({
          name: 'regression',
          color: '#111111',
          createdBy: userId,
        })
        .returning({ id: tagsTable.id });

      await ctx.orm.insert(todoTagsTable).values({
        todoId,
        tagId,
      });

      const todos = await ctx.orm.query.todos.findMany({
        where: { userId },
        limit: 20,
        with: { tags: true },
      });

      expect(todos).toHaveLength(1);
      expect(todos[0]?.tags.map((tag) => tag.id)).toEqual([tagId]);
    });
  });
});
