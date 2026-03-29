/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import { expect, test } from 'vitest';
import schema from '../../../../convex/schema';
import { convexTest } from '../../../../convex/setup.testing';
import { getPage, paginator, streamQuery } from './pagination';

test('getPage accepts explicit indexFields without schema', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
  });

  await t.run(async (ctx) => {
    const page = await getPage(
      { db: ctx.db as any },
      {
        table: 'users' as any,
        index: 'by_name' as any,
        indexFields: ['name'],
        targetMaxRows: 10,
      }
    );

    expect(page.page.map((row: any) => row.name)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.indexKeys).toHaveLength(3);
  });
});

test('streamQuery rejects index keys longer than index fields', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    const stream = streamQuery(
      { db: ctx.db as any },
      {
        table: 'users' as any,
        index: 'by_id' as any,
        startIndexKey: ['x', 'y'] as any,
      }
    );

    const readAll = async () => {
      for await (const _ of stream) {
        // noop
      }
    };

    await expect(readAll()).rejects.toThrow(
      /Index key length exceeds index fields length/
    );
  });
});

test('paginator returns stream reader and paginates query', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
  });

  await t.run(async (ctx) => {
    const db = paginator(ctx.db as any, schema);
    const page = await db
      .query('users')
      .withIndex('by_name')
      .paginate({ cursor: null, limit: 2 });

    expect(page.page.map((row: any) => row.name)).toEqual(['Alice', 'Bob']);
    expect(page.isDone).toBe(false);
    expect(page.continueCursor).toBeTruthy();
  });
});
