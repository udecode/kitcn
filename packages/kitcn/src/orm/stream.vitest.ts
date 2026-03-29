/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import { expect, test } from 'vitest';
import schema from '../../../../convex/schema';
import { convexTest } from '../../../../convex/setup.testing';
import { mergedStream, stream } from './stream';

test('stream.filter() throws guidance error and filterWith works', async () => {
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
  });

  await t.run(async (ctx) => {
    const users = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name');

    expect(() => users.filter(() => true)).toThrow(
      /Cannot call \.filter\(\) directly/
    );

    const filtered = await users
      .order('asc')
      .filterWith(async (row) => row.name !== 'Bob')
      .collect();

    expect(filtered.map((row) => row.name)).toEqual(['Alice']);
  });
});

test('stream reader unsupported APIs throw and withSearchIndex is blocked', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    const db = stream(ctx.db as any, schema);

    expect(() => db.get('x' as any)).toThrow(/not supported/i);
    expect(() => db.normalizeId('users' as any, 'x' as any)).toThrow(
      /not supported/i
    );

    expect(() =>
      db.query('posts').withSearchIndex('text_search' as any, () => null)
    ).toThrow(/Cannot paginate withSearchIndex/i);
  });
});

test('stream.paginate validates limit=0 behavior', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  await t.run(async (ctx) => {
    const users = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name');

    await expect(
      users.paginate({
        cursor: null,
        limit: 0,
      })
    ).rejects.toThrow(/not supported/i);

    const page = await users.paginate({
      cursor: '[]',
      limit: 0,
    });

    expect(page.page).toEqual([]);
    expect(page.isDone).toBe(false);
    expect(page.continueCursor).toBe('[]');
  });
});

test('stream.paginate exposes split metadata when maxScan is hit', async () => {
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
  });

  await t.run(async (ctx) => {
    const users = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name');
    const page = await users.paginate({
      cursor: null,
      limit: 2,
      maxScan: 1,
    });

    expect(page.isDone).toBe(false);
    expect(page.pageStatus).toBe('SplitRequired');
    expect(page.splitCursor).toBeTruthy();
  });
});

test('stream.unique throws when query is not unique', async () => {
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
  });

  await t.run(async (ctx) => {
    const users = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name');
    await expect(users.unique()).rejects.toThrow(/not unique/i);
  });
});

test('stream map/distinct/iterator APIs produce ordered values', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      status: 'active',
    });
    await ctx.db.insert('users', {
      name: 'Aaron',
      email: 'aaron@example.com',
      status: 'active',
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      status: 'pending',
    });
  });

  await t.run(async (ctx) => {
    const users = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_status')
      .order('asc');

    const mapped = await users.map(async (row) => row.name).collect();
    expect(mapped).toContain('Alice');
    expect(mapped).toContain('Aaron');
    expect(mapped).toContain('Bob');

    const distinct = await users.distinct(['status']).collect();
    expect(distinct.map((row) => row.status)).toEqual(['active', 'pending']);

    const iterated: string[] = [];
    for await (const row of users) {
      if (iterated.length >= 2) break;
      iterated.push(row.name);
    }
    expect(iterated.length).toBe(2);
  });
});

test('flatMap validates inner stream index fields', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  await t.run(async (ctx) => {
    const outer = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name')
      .order('asc');

    const badFlatMap = outer.flatMap(
      async () =>
        stream(ctx.db as any, schema)
          .query('users')
          .withIndex('by_email')
          .order('asc'),
      ['name', '_creationTime', '_id']
    );

    await expect(badFlatMap.take(1)).rejects.toThrow(/different index fields/i);
  });
});

test('flatMap validates inner stream ordering', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  await t.run(async (ctx) => {
    const outer = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name')
      .order('asc');

    const badFlatMap = outer.flatMap(
      async () =>
        stream(ctx.db as any, schema)
          .query('users')
          .withIndex('by_name')
          .order('desc'),
      ['name', '_creationTime', '_id']
    );

    await expect(badFlatMap.take(1)).rejects.toThrow(/different order/i);
  });
});

test('mergedStream validates stream array and order', async () => {
  expect(() => mergedStream([], ['name'])).toThrow(/empty array of streams/i);

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
  });

  await t.run(async (ctx) => {
    const ascUsers = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name')
      .order('asc');
    const descUsers = stream(ctx.db as any, schema)
      .query('users')
      .withIndex('by_name')
      .order('desc');

    expect(() =>
      mergedStream([ascUsers as any, descUsers as any], ['name'])
    ).toThrow(/different orders/i);
  });
});
