import type { OrmWriter } from 'kitcn/orm';
import { expect, test } from 'vitest';
import { mergeTags } from '../../example/convex/functions/_helpers/tag_merge';
import schema, {
  tagsTable,
  todosTable,
  todoTagsTable,
  userTable,
} from '../../example/convex/functions/schema';
import { convexTest, countDocumentReads, withOrm } from '../setup.testing';

/**
 * `countDocumentReads` swaps `db.query`/`db.get`, and the ORM binds both when it
 * is built, so the counter has to be installed *before* `withOrm`. Installed on
 * a context that already carries an ORM it counts only reads issued directly
 * through `ctx.db` -- a constant zero for an ORM-only test, which makes every
 * bound below pass vacuously.
 */
const withCountedOrmCtx = async (
  run: (
    ctx: {
      db: Parameters<typeof countDocumentReads>[0]['db'];
      orm: ReturnType<typeof withOrm<any, typeof schema>>['orm'];
    },
    reads: ReturnType<typeof countDocumentReads>
  ) => Promise<void>
): Promise<void> => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, schema);
    await run(ctx, reads);
  });
};

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

const TARGET_TAG_TODOS = 40;

type ExampleCtx = { orm: OrmWriter<typeof schema> };

const seedUser = async (ctx: ExampleCtx, email: string) => {
  const [user] = await ctx.orm
    .insert(userTable)
    .values({
      name: 'Merger',
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: userTable.id });

  return user.id as string;
};

const seedTag = async (ctx: ExampleCtx, userId: string, name: string) => {
  const [tag] = await ctx.orm
    .insert(tagsTable)
    .values({ color: '#fff', name, createdBy: userId })
    .returning({ id: tagsTable.id });

  return tag.id as string;
};

const seedTodo = async (ctx: ExampleCtx, userId: string, title: string) => {
  const [todo] = await ctx.orm
    .insert(todosTable)
    .values({ title, completed: false, userId })
    .returning({ id: todosTable.id });

  return todo.id as string;
};

/**
 * `tags.merge` moves the source tag's join rows onto the target and deletes the
 * source. Only the source's rows are written, so only the source may bound the
 * transaction.
 *
 * The dedupe that stops a todo already carrying the target tag from gaining a
 * second join row must therefore probe `todoId_tagId` per source row rather
 * than materialize the target's rows: reading the whole target set forces a
 * budget on a read that writes nothing, which refuses cheap merges into exactly
 * the popular tag users merge duplicates into.
 */
test('merge cost does not track the target tag size', async () => {
  await withExampleEnv(async () => {
    await withCountedOrmCtx(async (ctx, reads) => {
      const userId = await seedUser(ctx, 'merge-reads@test.dev');
      const sourceTagId = await seedTag(ctx, userId, 'Work');
      const targetTagId = await seedTag(ctx, userId, 'work');

      // A popular target: many todos already carry it.
      for (let index = 0; index < TARGET_TAG_TODOS; index += 1) {
        const todoId = await seedTodo(ctx, userId, `target-${index}`);
        await ctx.orm
          .insert(todoTagsTable)
          .values({ todoId, tagId: targetTagId });
      }

      // A tiny source: one todo, not already on the target.
      const sourceTodoId = await seedTodo(ctx, userId, 'source-only');
      await ctx.orm
        .insert(todoTagsTable)
        .values({ todoId: sourceTodoId, tagId: sourceTagId });

      const readsBefore = reads.scanned;

      await mergeTags(ctx, userId, {
        sourceTagId,
        targetTagId,
      });
      const mergeReads = reads.scanned - readsBefore;

      const [sourceTag, targetJoins] = await Promise.all([
        ctx.orm.query.tags.findFirst({ where: { id: sourceTagId } }),
        ctx.orm.query.todoTags.findMany({
          where: { tagId: targetTagId },
          limit: TARGET_TAG_TODOS + 1,
          columns: { todoId: true },
        }),
      ]);

      expect(sourceTag).toBeNull();
      expect(targetJoins).toHaveLength(TARGET_TAG_TODOS + 1);
      expect(
        targetJoins.some(
          (join: { todoId: string }) => join.todoId === sourceTodoId
        )
      ).toBe(true);
      // The merge reads its two tags, one source join, one indexed target
      // probe, and aggregate bookkeeping. It never materializes the target rows.
      //
      // 16 is measured, and it is the same at TARGET_TAG_TODOS 40 and 120, which
      // is what this test exists to pin. The previous bound of 12 was never
      // exercised: the counter was installed after the ORM was built, so it
      // reported a constant zero and the assertion passed against nothing.
      expect(mergeReads).toBeLessThanOrEqual(16);
      expect(mergeReads).toBeLessThan(TARGET_TAG_TODOS);
    });
  });
});

test('merge probe finds a target row the source todo already carries', async () => {
  await withExampleEnv(async () => {
    await withCountedOrmCtx(async (ctx, reads) => {
      const userId = await seedUser(ctx, 'merge-reads-2@test.dev');
      const sourceTagId = await seedTag(ctx, userId, 'Work');
      const targetTagId = await seedTag(ctx, userId, 'work');

      for (let index = 0; index < TARGET_TAG_TODOS; index += 1) {
        const todoId = await seedTodo(ctx, userId, `target-${index}`);
        await ctx.orm
          .insert(todoTagsTable)
          .values({ todoId, tagId: targetTagId });
      }

      // This todo carries both tags, so the merge must not insert a duplicate.
      const sharedTodoId = await seedTodo(ctx, userId, 'shared');
      await ctx.orm
        .insert(todoTagsTable)
        .values({ todoId: sharedTodoId, tagId: targetTagId });
      await ctx.orm
        .insert(todoTagsTable)
        .values({ todoId: sharedTodoId, tagId: sourceTagId });

      const readsBefore = reads.scanned;

      await mergeTags(ctx, userId, {
        sourceTagId,
        targetTagId,
      });

      const [sourceTag, targetJoins] = await Promise.all([
        ctx.orm.query.tags.findFirst({ where: { id: sourceTagId } }),
        ctx.orm.query.todoTags.findMany({
          where: { todoId: sharedTodoId, tagId: targetTagId },
          limit: 2,
          columns: { id: true },
        }),
      ]);

      expect(sourceTag).toBeNull();
      expect(targetJoins).toHaveLength(1);
      // The probe is index-backed: the merge must not scan the target's other
      // rows or insert a duplicate for the shared todo.
      expect(reads.scanned - readsBefore).toBeLessThanOrEqual(20);
    });
  });
});
