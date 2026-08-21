import { createOrm, type OrmWriter } from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import { expect, test, vi } from 'vitest';
import {
  buildRepliesWith,
  CommentRowWithRepliesSchema,
  MAX_REPLY_DEPTH,
  toReply,
} from '../../example/convex/functions/_helpers/comment_tree';
import schema, {
  todoCommentsTable,
  todosTable,
  userTable,
} from '../../example/convex/functions/schema';
import { convexTest, countDocumentReads, withOrm } from '../setup.testing';

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

const schedulerStub = { runAfter: vi.fn(async () => undefined) };

/**
 * `withOrmCtx` hands back a context, not the ORM client, and the aggregate
 * backfill mutations hang off the client. They only need `{ db, scheduler }`,
 * so a second client over the same schema can drive them against the same `db`.
 */
const backfillApi = createOrm({
  capabilities: [aggregateCapability()],
  schema,
  ormFunctions: {
    scheduledDelete: {} as any,
    scheduledMutationBatch: {} as any,
  },
  internalMutation: ((definition: unknown) => definition) as never,
  internalQuery: ((definition: unknown) => definition) as never,
}).api() as any;

const runBackfillToReady = async (ctx: { db: any }) => {
  const handlerCtx = { db: ctx.db, scheduler: schedulerStub };
  await backfillApi.aggregateBackfill.handler(handlerCtx, {});

  for (let i = 0; i < 20; i += 1) {
    const status = await backfillApi.aggregateBackfillStatus.handler(
      handlerCtx,
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await backfillApi.aggregateBackfillChunk.handler(handlerCtx, {});
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

type ExampleCtx = { orm: OrmWriter<typeof schema>; db: any };

/**
 * `countDocumentReads` swaps `db.get`/`db.query`, but the ORM binds both when it
 * is constructed -- so the counter has to be installed before `withOrm`, or it
 * silently reports zero for every read the ORM issues.
 */
const withCountedExampleOrm = async (
  run: (ctx: ExampleCtx, reads: { documents: number }) => Promise<void>
) => {
  await withExampleEnv(async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const reads = countDocumentReads(baseCtx as any);
      const ctx = withOrm(baseCtx as any, schema) as unknown as ExampleCtx;
      await run(ctx, reads);
    });
  });
};

const seedUser = async (ctx: ExampleCtx, email: string) => {
  const [user] = await ctx.orm
    .insert(userTable)
    .values({
      name: 'Commenter',
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: userTable.id });

  return user.id as string;
};

const seedTodo = async (ctx: ExampleCtx, userId: string) => {
  const [todo] = await ctx.orm
    .insert(todosTable)
    .values({ title: 'Thread', completed: false, userId })
    .returning({ id: todosTable.id });

  return todo.id as string;
};

const seedComment = async (
  ctx: ExampleCtx,
  todoId: string,
  userId: string,
  content: string,
  parentId?: string
) => {
  const [row] = await ctx.orm
    .insert(todoCommentsTable)
    .values({ content, todoId, userId, parentId })
    .returning({ id: todoCommentsTable.id });

  return row.id as string;
};

/** `roots` root comments, each carrying a `MAX_REPLY_DEPTH`-long reply chain. */
const seedThreads = async (
  ctx: ExampleCtx,
  todoId: string,
  userId: string,
  roots: number
) => {
  for (let root = 0; root < roots; root += 1) {
    let parentId = await seedComment(ctx, todoId, userId, `root-${root}`);
    for (let level = 1; level <= MAX_REPLY_DEPTH; level += 1) {
      parentId = await seedComment(
        ctx,
        todoId,
        userId,
        `root-${root}-l${level}`,
        parentId
      );
    }
  }
};

/** The exact read `todoComments.getTodoComments` issues, counting documents. */
const readCommentTree = async (
  ctx: ExampleCtx,
  reads: { documents: number },
  todoId: string
) => {
  const before = reads.documents;

  const results = await ctx.orm.query.todoComments.findMany({
    where: { todoId, parentId: { isNull: true } },
    orderBy: { createdAt: 'desc' },
    cursor: null,
    limit: 20,
    with: {
      user: true,
      _count: { replies: true },
      replies: buildRepliesWith(MAX_REPLY_DEPTH),
    },
  });

  const documents = reads.documents - before;
  const rows = CommentRowWithRepliesSchema.array().parse(results.page);
  return { documents, page: rows.map(toReply) };
};

const countNodes = (replies: { replies: any[] }[]): number =>
  replies.reduce((total, reply) => total + 1 + countNodes(reply.replies), 0);

/**
 * The tree is loaded in one pass. Attaching `replyCount` afterwards by
 * re-reading every node already in the returned tree costs a second read plus a
 * second count per node, and buys nothing: the relation loader resolves `_count`
 * at every level it returns, including the deepest.
 *
 * Measured marginal cost over 30 extra nodes: 100 documents for the second pass
 * versus 50 for one pass. Fixed setup cost (the author, the root index scan)
 * does not scale, so the bound is on the marginal document cost per node.
 */
const MAX_DOCUMENTS_PER_COMMENT = 2;

test('comment tree cost does not track the number of comments returned', async () => {
  await withCountedExampleOrm(async (ctx, reads) => {
    const userId = await seedUser(ctx, 'comment-tree-reads@test.dev');
    const smallTodoId = await seedTodo(ctx, userId);
    const largeTodoId = await seedTodo(ctx, userId);

    await seedThreads(ctx, smallTodoId, userId, 1);
    await seedThreads(ctx, largeTodoId, userId, 6);
    await runBackfillToReady(ctx);

    const small = await readCommentTree(ctx, reads, smallTodoId);
    const large = await readCommentTree(ctx, reads, largeTodoId);

    // 6 nodes vs 36, same single author.
    const smallNodes = countNodes(small.page);
    const largeNodes = countNodes(large.page);
    expect(smallNodes).toBe(MAX_REPLY_DEPTH + 1);
    expect(largeNodes).toBe(6 * (MAX_REPLY_DEPTH + 1));

    expect(large.documents - small.documents).toBeLessThanOrEqual(
      MAX_DOCUMENTS_PER_COMMENT * (largeNodes - smallNodes)
    );
  });
});

test('every returned node reports its reply count, including the deepest', async () => {
  await withCountedExampleOrm(async (ctx, reads) => {
    const userId = await seedUser(ctx, 'comment-tree-counts@test.dev');
    const todoId = await seedTodo(ctx, userId);

    await seedThreads(ctx, todoId, userId, 1);
    await runBackfillToReady(ctx);

    const { page } = await readCommentTree(ctx, reads, todoId);

    const chain: { content: string; replyCount: number }[] = [];
    let node = page[0];
    while (node) {
      chain.push({ content: node.content, replyCount: node.replyCount });
      node = node.replies[0];
    }

    // The deepest reply the write cap allows is the last one returned, and it
    // correctly reports that nothing follows it.
    expect(chain).toEqual([
      { content: 'root-0', replyCount: 1 },
      { content: 'root-0-l1', replyCount: 1 },
      { content: 'root-0-l2', replyCount: 1 },
      { content: 'root-0-l3', replyCount: 1 },
      { content: 'root-0-l4', replyCount: 1 },
      { content: 'root-0-l5', replyCount: 0 },
    ]);
  });
});

test('getCommentThread keeps accepting the previous explicit maxDepth', async () => {
  await withExampleEnv(async () => {
    const { getCommentThread } = await import(
      '../../example/convex/functions/todoComments'
    );
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      await expect(
        (getCommentThread as any)._handler(baseCtx, {
          commentId: 'missing-comment',
          maxDepth: 10,
        })
      ).resolves.toBeNull();
    });
  });
});
