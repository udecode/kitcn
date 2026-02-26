import type { GenericDocument } from 'convex/server';
import { defineSchema, defineTable } from 'convex/server';
import { type GenericId, v } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { IndexKey } from './pagination';
import { getPage, paginator } from './pagination';

const schema = defineSchema({
  foo: defineTable({
    a: v.number(),
    b: v.number(),
    c: v.number(),
  }).index('abc', ['a', 'b', 'c']),
});

function stripSystemFields(doc: GenericDocument) {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
}

function dropSystemFields(indexKey: IndexKey) {
  return indexKey.slice(0, -2);
}

const MANY_DOCS: { a: number; b: number; c: number }[] = [];
for (let a = 0; a < 3; a++) {
  for (let b = 0; b < 3; b++) {
    for (let c = 0; c < 3; c++) {
      MANY_DOCS.push({ a, b, c });
    }
  }
}

describe('manual pagination regression', () => {
  beforeEach(() => {});
  afterEach(() => {});

  test('single doc by creation time', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 2, c: 3 });
      const { page, indexKeys, hasMore } = await getPage(ctx, { table: 'foo' });
      expect(page.map(stripSystemFields)).toEqual([{ a: 1, b: 2, c: 3 }]);
      expect(hasMore).toBe(false);
      expect(indexKeys.map(dropSystemFields)).toEqual([[]]);
    });
  });

  test('single doc by abc', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 2, c: 3 });
      const { page, indexKeys, hasMore } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
      });
      expect(page.map(stripSystemFields)).toEqual([{ a: 1, b: 2, c: 3 }]);
      expect(hasMore).toBe(false);
      expect(indexKeys.map(dropSystemFields)).toEqual([[1, 2, 3]]);
    });
  });

  test('middle page with exclusive/inclusive bounds', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert('foo', doc);
      }
      const inclusiveDocs = [
        { a: 1, b: 1, c: 0 },
        { a: 1, b: 1, c: 1 },
        { a: 1, b: 1, c: 2 },
        { a: 1, b: 2, c: 0 },
        { a: 1, b: 2, c: 1 },
        { a: 1, b: 2, c: 2 },
      ];
      const request = {
        table: 'foo' as const,
        index: 'abc' as const,
        schema,
        startIndexKey: [1, 1, 0] as IndexKey,
        endIndexKey: [1, 2, 2] as IndexKey,
      };

      const { page, hasMore } = await getPage(ctx, {
        ...request,
        startInclusive: true,
        endInclusive: true,
      });
      expect(hasMore).toBe(false);
      expect(page.map(stripSystemFields)).toEqual(inclusiveDocs);

      const { page: page2 } = await getPage(ctx, {
        ...request,
        startInclusive: true,
        endInclusive: false,
      });
      expect(page2.map(stripSystemFields)).toEqual(inclusiveDocs.slice(0, -1));

      const { page: page3 } = await getPage(ctx, {
        ...request,
        startInclusive: false,
        endInclusive: true,
      });
      expect(page3.map(stripSystemFields)).toEqual(inclusiveDocs.slice(1));

      const { page: page4 } = await getPage(ctx, {
        ...request,
        startInclusive: false,
        endInclusive: false,
      });
      expect(page4.map(stripSystemFields)).toEqual(inclusiveDocs.slice(1, -1));
    });
  });

  test('three pages with refreshes', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert('foo', doc);
      }

      const { page: page0, indexKeys: indexKeys0 } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
      });
      expect(page0.length).toBe(3);

      const { page: page1, indexKeys: indexKeys1 } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
      });
      expect(page1.length).toBe(3);

      const { page: page2 } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys1[2],
      });
      expect(page2.length).toBe(3);
      expect([...page0, ...page1, ...page2].map(stripSystemFields)).toEqual(
        MANY_DOCS.slice(0, 9)
      );

      await ctx.db.delete('foo', page0[0]!._id as GenericId<'foo'>);
      const { page: page0Refreshed } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        endIndexKey: indexKeys0[2],
      });
      expect(page0Refreshed).toEqual(page0.slice(1));

      await ctx.db.insert('foo', { a: 0, b: 1, c: 1.5 });
      const { page: page1Refreshed } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
        endIndexKey: indexKeys1[2],
      });
      expect(page1Refreshed.map(stripSystemFields)).toEqual([
        { a: 0, b: 1, c: 0 },
        { a: 0, b: 1, c: 1 },
        { a: 0, b: 1, c: 1.5 },
        { a: 0, b: 1, c: 2 },
      ]);

      const { page: page1AbsoluteMax } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
        endIndexKey: indexKeys1[2],
        absoluteMaxRows: 3,
      });
      expect(page1AbsoluteMax.map(stripSystemFields)).toEqual([
        { a: 0, b: 1, c: 0 },
        { a: 0, b: 1, c: 1 },
        { a: 0, b: 1, c: 1.5 },
      ]);
    });
  });

  test('skip forward and scroll back', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert('foo', doc);
      }

      const { page: pageAt } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: [1],
        startInclusive: true,
      });
      expect(pageAt.map(stripSystemFields)).toEqual([
        { a: 1, b: 0, c: 0 },
        { a: 1, b: 0, c: 1 },
        { a: 1, b: 0, c: 2 },
      ]);

      const { page: pagePrev, indexKeys: indexKeysPrev } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: [1],
        startInclusive: false,
        order: 'desc',
      });
      expect(pagePrev.map(stripSystemFields)).toEqual([
        { a: 0, b: 2, c: 2 },
        { a: 0, b: 2, c: 1 },
        { a: 0, b: 2, c: 0 },
      ]);

      const { page: pagePrevRefreshed } = await getPage(ctx, {
        table: 'foo',
        index: 'abc',
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeysPrev[2],
        endIndexKey: [1],
        startInclusive: true,
        endInclusive: false,
      });
      pagePrev.reverse();
      expect(pagePrevRefreshed).toEqual(pagePrev);
    });
  });
});

describe('paginator regression', () => {
  test('full table scan', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 2, c: 3 });
      await ctx.db.insert('foo', { a: 1, b: 2, c: 4 });
      await ctx.db.insert('foo', { a: 1, b: 2, c: 5 });

      const result1 = await paginator(ctx.db, schema)
        .query('foo')
        .paginate({ limit: 100, cursor: null });

      expect(result1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 2, c: 4 },
        { a: 1, b: 2, c: 5 },
      ]);
      expect(result1.isDone).toBe(true);
      expect(result1.continueCursor).toBe('[]');
    });
  });

  test('paginated table scan', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 2, c: 3 });
      await ctx.db.insert('foo', { a: 1, b: 2, c: 4 });
      await ctx.db.insert('foo', { a: 1, b: 2, c: 5 });

      const result1 = await paginator(ctx.db, schema)
        .query('foo')
        .paginate({ limit: 2, cursor: null });
      expect(result1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 2, c: 4 },
      ]);
      expect(result1.isDone).toBe(false);

      const result2 = await paginator(ctx.db, schema)
        .query('foo')
        .paginate({ limit: 2, cursor: result1.continueCursor });
      expect(result2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 5 },
      ]);
      expect(result2.isDone).toBe(true);
    });
  });

  test('index range and desc ordering', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 5, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 6, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 3, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 4, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 4, c: 2 });

      const result1 = await paginator(ctx.db, schema)
        .query('foo')
        .withIndex('abc', (q) => q.eq('a', 1).gt('b', 3).lte('b', 5))
        .paginate({ cursor: null, limit: 100 });
      expect(result1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 1 },
        { a: 1, b: 4, c: 2 },
        { a: 1, b: 5, c: 1 },
      ]);
      expect(result1.isDone).toBe(true);

      const result2 = await paginator(ctx.db, schema)
        .query('foo')
        .withIndex('abc', (q) => q.eq('a', 1).gt('b', 3).lte('b', 5))
        .order('desc')
        .paginate({ cursor: null, limit: 100 });
      expect(result2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 5, c: 1 },
        { a: 1, b: 4, c: 2 },
        { a: 1, b: 4, c: 1 },
      ]);
      expect(result2.isDone).toBe(true);
    });
  });

  test('invalid index range', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      expect(() =>
        paginator(ctx.db, schema)
          .query('foo')
          .withIndex('abc', (q) => q.gt('c' as any, 3))
      ).toThrow("Cannot use gt on field 'c'");

      expect(() =>
        paginator(ctx.db, schema)
          .query('foo')
          .withIndex('abc', (q) => q.eq('a', 1).eq('c' as any, 3))
      ).toThrow("Cannot use eq on field 'c'");

      expect(() =>
        paginator(ctx.db, schema)
          .query('foo')
          .withIndex('abc', (q) => (q.gt('a', 1) as any).gt('b', 3))
      ).toThrow("Cannot use gt on field 'b'");
    });
  });

  test('endCursor keeps pages adjacent when data changes', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert('foo', { a: 1, b: 5, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 6, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 3, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 4, c: 1 });
      await ctx.db.insert('foo', { a: 1, b: 4, c: 3 });

      const result1 = await paginator(ctx.db, schema)
        .query('foo')
        .withIndex('abc', (q) => q.eq('a', 1).gt('b', 3).lte('b', 5))
        .paginate({ cursor: null, limit: 2 });
      expect(result1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 1 },
        { a: 1, b: 4, c: 3 },
      ]);
      expect(result1.isDone).toBe(false);

      await ctx.db.insert('foo', { a: 1, b: 4, c: 2 });
      const result2 = await paginator(ctx.db, schema)
        .query('foo')
        .withIndex('abc', (q) => q.eq('a', 1).gt('b', 3).lte('b', 5))
        .paginate({
          cursor: null,
          endCursor: result1.continueCursor,
          limit: 2,
        });
      expect(result2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 1 },
        { a: 1, b: 4, c: 2 },
        { a: 1, b: 4, c: 3 },
      ]);
      expect(result2.isDone).toBe(false);
      expect(result1.continueCursor).toStrictEqual(result2.continueCursor);
    });
  });
});
