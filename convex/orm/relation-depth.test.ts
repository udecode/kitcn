import {
  type AnyColumn,
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  index,
  text,
} from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import { describe, expect, it, vi } from 'vitest';
import { convexTest, countDocumentReads } from '../setup.testing';

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;
const passthroughInternalQuery = ((definition: unknown) => definition) as never;

/**
 * A self-referencing thread is the shape that makes relation depth observable:
 * one table, one `many()` edge back to itself, so a `with` config can be nested
 * as deep as the test needs without inventing a table per level.
 */
const threadNodes = convexTable(
  'depthThreadNodes',
  {
    label: text().notNull(),
    parentId: text().references((): AnyColumn => threadNodes.id),
  },
  (t) => [
    index('by_parent_lookup').on(t.parentId),
    aggregateIndex('by_parent').on(t.parentId),
  ]
);

const threadSchema = defineSchema({ depthThreadNodes: threadNodes });
const threadRelations = defineRelations(
  { depthThreadNodes: threadNodes },
  (r) => ({
    depthThreadNodes: {
      replies: r.many.depthThreadNodes({
        from: r.depthThreadNodes.id,
        to: r.depthThreadNodes.parentId,
      }),
      parent: r.one.depthThreadNodes({
        from: r.depthThreadNodes.parentId,
        to: r.depthThreadNodes.id,
      }),
    },
  })
);

const runBackfillToReady = async (api: any, ctx: { db: any }) => {
  await api.aggregateBackfill.handler(
    { db: ctx.db, scheduler: schedulerStub },
    {}
  );

  for (let i = 0; i < 20; i += 1) {
    const status = await api.aggregateBackfillStatus.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await api.aggregateBackfillChunk.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

/** `levels` nested `replies` levels, each asking for its own reply count. */
const repliesWith = (levels: number): any => {
  if (levels <= 0) return;
  const child = repliesWith(levels - 1);
  return {
    limit: 10,
    with: {
      _count: { replies: true },
      ...(child ? { replies: child } : {}),
    },
  };
};

/** Walks the single chain a linear thread produces, root first. */
const walkChain = (root: any) => {
  const chain: { label: string; count: number | undefined }[] = [];
  let node = root;
  while (node) {
    chain.push({ label: node.label, count: node._count?.replies });
    node = node.replies?.[0];
  }
  return chain;
};

const withThread = async (
  chainLength: number,
  run: (ctx: any, reads: { documents: number }) => Promise<void>
) => {
  const t = convexTest(threadSchema);
  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx as any);
    const client = createOrm({
      capabilities: [aggregateCapability()],
      schema: threadRelations,
      ormFunctions: {
        scheduledDelete: {} as any,
        scheduledMutationBatch: {} as any,
      },
      internalMutation: passthroughInternalMutation,
      internalQuery: passthroughInternalQuery,
    });
    const ctx = client.with({
      db: baseCtx.db,
      scheduler: schedulerStub as any,
    });

    let parentId: string | undefined;
    for (let i = 0; i < chainLength; i += 1) {
      parentId = await ctx.db.insert('depthThreadNodes', {
        label: `l${i}`,
        parentId,
      });
    }

    await runBackfillToReady(client.api() as any, baseCtx as any);
    await run(ctx, reads);
  });
};

describe('ORM relation depth', () => {
  it('loads every level the with config asks for', async () => {
    await withThread(6, async (ctx) => {
      const rows: any = await ctx.orm.query.depthThreadNodes.findMany({
        where: { parentId: { isNull: true } },
        limit: 10,
        with: { replies: repliesWith(5) },
      });

      expect(walkChain(rows[0]).map((node) => node.label)).toEqual([
        'l0',
        'l1',
        'l2',
        'l3',
        'l4',
        'l5',
      ]);
    });
  });

  /**
   * The deepest level is exactly where a count matters -- it is the only node
   * whose children were not returned, so `_count` is how a caller learns the
   * thread continues. Resolving it here is what removes the second pass that a
   * caller would otherwise run over every node it already holds.
   */
  it('resolves _count on the deepest level it returns', async () => {
    await withThread(6, async (ctx) => {
      const rows: any = await ctx.orm.query.depthThreadNodes.findMany({
        where: { parentId: { isNull: true } },
        limit: 10,
        with: {
          _count: { replies: true },
          replies: repliesWith(3),
        },
      });

      // l3 is the deepest returned node; it still reports the reply it withheld.
      expect(walkChain(rows[0])).toEqual([
        { label: 'l0', count: 1 },
        { label: 'l1', count: 1 },
        { label: 'l2', count: 1 },
        { label: 'l3', count: 1 },
      ]);
    });
  });

  it('resolves _count without loading the relation it counts', async () => {
    await withThread(3, async (ctx) => {
      const rows: any = await ctx.orm.query.depthThreadNodes.findMany({
        where: { parentId: { isNull: true } },
        limit: 10,
        with: { _count: { replies: true } },
      });

      expect(rows[0]._count.replies).toBe(1);
      expect(Object.hasOwn(rows[0], 'replies')).toBe(false);
    });
  });

  /**
   * A `with` config is a finite object the caller wrote, so the ceiling only
   * exists to stop a self-referential one. Returning a shallower tree instead
   * would be indistinguishable from a thread that genuinely ended there. It
   * takes a thread long enough to still have rows at the ceiling to reach it --
   * a shorter thread simply runs out of children first.
   */
  it('refuses to nest past the ceiling instead of truncating silently', async () => {
    await withThread(12, async (ctx, reads) => {
      const before = reads.documents;
      await expect(
        ctx.orm.query.depthThreadNodes.findMany({
          where: { parentId: { isNull: true } },
          limit: 10,
          with: { replies: repliesWith(11) },
        })
      ).rejects.toThrow(/RELATION_DEPTH_EXCEEDED/);
      expect(reads.documents - before).toBeLessThanOrEqual(2);
    });
  });
});
