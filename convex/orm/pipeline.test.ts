import { expect, test } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx } from '../setup.testing';

test('select chain union can interleave indexed streams', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', {
      name: 'Aaron',
      email: 'aaron@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'Bella',
      email: 'bella@example.com',
      status: 'pending',
    });
    await baseCtx.db.insert('users', {
      name: 'Chris',
      email: 'chris@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'Diana',
      email: 'diana@example.com',
      status: 'pending',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const result = await ctx.orm.query.users
      .withIndex('by_name')
      .select()
      .union([
        { where: { status: 'active' } },
        { where: { status: 'pending' } },
      ])
      .interleaveBy(['name'])
      .paginate({ cursor: null, limit: 10 });

    expect(result.page.map((u) => u.name)).toEqual([
      'Aaron',
      'Bella',
      'Chris',
      'Diana',
    ]);
  });
});

test('select map/filter runs before pagination and supports maxScan metadata', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    for (let i = 0; i < 20; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${String(i).padStart(2, '0')}`,
        email: `pipeline-${i}@example.com`,
      });
    }
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const result = await ctx.orm.query.users
      .select()
      .map(async (row) => ({ ...row, slug: row.name.toLowerCase() }))
      .filter(async (row) => row.slug.endsWith('0'))
      .paginate({ cursor: null, limit: 5, maxScan: 2 });

    expect(result.page.every((u) => u.name.endsWith('0'))).toBe(true);
    expect(result.page.every((u) => typeof u.slug === 'string')).toBe(true);
    expect(result.pageStatus).toBeDefined();
    expect(result.splitCursor).toBeDefined();
  });
});

test('select distinct supports pagination', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', {
      name: 'A',
      email: 'a@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'B',
      email: 'b@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'C',
      email: 'c@example.com',
      status: 'pending',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const result = await ctx.orm.query.users
      .select()
      .orderBy({ status: 'asc' })
      .distinct({ fields: ['status'] })
      .paginate({ cursor: null, limit: 10 });

    expect(result.page.map((u) => u.status)).toEqual(['active', 'pending']);
  });
});

test('findMany distinct is removed and throws deterministic error', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', {
      name: 'A',
      email: 'a-findmany@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'B',
      email: 'b-findmany@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('users', {
      name: 'C',
      email: 'c-findmany@example.com',
      status: 'pending',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await expect(
      (ctx.orm.query.users.findMany as any)({
        orderBy: { status: 'asc' },
        distinct: ['status'],
        limit: 10,
        columns: { status: true },
      })
    ).rejects.toThrow(/DISTINCT_UNSUPPORTED/);
  });
});

test('select flatMap includeParent=true returns parent/child rows', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const user1 = await baseCtx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    const user2 = await baseCtx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'hello',
      numLikes: 1,
      type: 'note',
      authorId: user1,
    });
    await baseCtx.db.insert('posts', {
      text: 'world',
      numLikes: 2,
      type: 'note',
      authorId: user1,
    });
    await baseCtx.db.insert('posts', {
      text: 'skip',
      numLikes: 3,
      type: 'note',
      authorId: user2,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const result = await ctx.orm.query.users
      .select()
      .where({ name: 'Alice' })
      .flatMap('posts', { includeParent: true })
      .paginate({ cursor: null, limit: 10 });

    expect(result.page).toHaveLength(2);
    expect(result.page.every((row) => row.parent.name === 'Alice')).toBe(true);
    expect(result.page.map((row) => row.child.text)).toEqual([
      'hello',
      'world',
    ]);
  });
});

test('select flatMap includeParent=false returns child rows', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const user = await baseCtx.db.insert('users', {
      name: 'Alice',
      email: 'alice-child@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'child-1',
      numLikes: 1,
      type: 'note',
      authorId: user,
    });
    await baseCtx.db.insert('posts', {
      text: 'child-2',
      numLikes: 2,
      type: 'note',
      authorId: user,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const result = await ctx.orm.query.users
      .select()
      .where({ name: 'Alice' })
      .flatMap('posts', { includeParent: false })
      .paginate({ cursor: null, limit: 10 });

    expect(result.page).toHaveLength(2);
    expect(result.page.map((row) => row.text)).toEqual(['child-1', 'child-2']);
  });
});

test('select paginate supports endCursor boundary pinning', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', {
      name: 'A',
      email: 'a@boundary.example.com',
    });
    await baseCtx.db.insert('users', {
      name: 'B',
      email: 'b@boundary.example.com',
    });
    await baseCtx.db.insert('users', {
      name: 'C',
      email: 'c@boundary.example.com',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const first = await ctx.orm.query.users
      .select()
      .orderBy({ name: 'asc' })
      // Keep both queries on stream-backed pagination cursors.
      .map((row) => row)
      .paginate({ cursor: null, limit: 2 });

    await baseCtx.db.insert('users', {
      name: 'AB',
      email: 'ab@boundary.example.com',
    });

    const refreshed = await ctx.orm.query.users
      .select()
      .orderBy({ name: 'asc' })
      .map((row) => row)
      .paginate({
        cursor: null,
        endCursor: first.continueCursor,
        limit: 2,
      });

    expect(refreshed.page.map((u) => u.name)).toEqual(['A', 'AB', 'B']);
    expect(refreshed.continueCursor).toBe(first.continueCursor);
  });
});

test('findMany pageByKey returns page, indexKeys and hasMore', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', {
      name: 'A',
      email: 'a@key.example.com',
    });
    await baseCtx.db.insert('users', {
      name: 'B',
      email: 'b@key.example.com',
    });
    await baseCtx.db.insert('users', {
      name: 'C',
      email: 'c@key.example.com',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const first = await ctx.orm.query.users.findMany({
      pageByKey: {
        index: 'by_name',
        targetMaxRows: 2,
      },
    });

    expect(first.page).toHaveLength(2);
    expect(first.indexKeys).toHaveLength(2);
    expect(first.hasMore).toBe(true);
  });
});

test('findMany pipeline mode is removed', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    expect(() =>
      ctx.orm.query.users.findMany({
        cursor: null,
        limit: 1,
        // Runtime-only check for legacy callers
        pipeline: { stages: [] },
      } as any)
    ).toThrow(/findmany\(\{ pipeline \}\) is removed/i);

    expect(() =>
      ctx.orm.query.users.findFirst({
        // Runtime-only check for legacy callers
        pipeline: { stages: [] },
      } as any)
    ).toThrow(/findmany\(\{ pipeline \}\) is removed/i);

    expect(() =>
      ctx.orm.query.users.findFirstOrThrow({
        // Runtime-only check for legacy callers
        pipeline: { stages: [] },
      } as any)
    ).toThrow(/findmany\(\{ pipeline \}\) is removed/i);
  });
});
