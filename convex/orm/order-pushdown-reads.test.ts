/**
 * Read bounds for multi-field `orderBy`.
 *
 * A compound index that already produces the requested order must be walked,
 * not collected and re-sorted in JavaScript. Every bound here is asserted at
 * two table sizes on purpose: a scan-shaped plan cannot satisfy both.
 *
 * `posts.numLikesAndType` is keyed `(type, numLikes)` — the name reverses the
 * key order, so read the schema, not the name.
 */

import { expect, test } from 'vitest';
import schema from '../schema';
import { convexTest, countDocumentReads, runCtx } from '../setup.testing';

const TYPES = ['a', 'b', 'c', 'd'] as const;

async function seedPosts(
  baseCtx: {
    db: {
      insert: (table: 'posts', doc: Record<string, unknown>) => Promise<any>;
    };
  },
  count: number,
  authorId?: string
) {
  for (let i = 0; i < count; i += 1) {
    await baseCtx.db.insert('posts', {
      text: `p${i}`,
      // Interleaved so no prefix of table order is already sorted.
      numLikes: (i * 37) % count,
      type: TYPES[i % TYPES.length],
      ...(authorId ? { authorId } : {}),
    });
  }
}

type Ctx = Awaited<ReturnType<typeof runCtx>>;

const measure = async (
  seed: (baseCtx: any) => Promise<unknown>,
  run: (ctx: Ctx) => Promise<any>
) => {
  const t = convexTest(schema);
  await t.run(seed);
  return await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const reads = countDocumentReads(baseCtx);
    const rows = await run(ctx);
    return { documents: reads.documents, rows };
  });
};

const atBothSizes = async (run: (ctx: Ctx) => Promise<any>) => ({
  small: await measure((baseCtx) => seedPosts(baseCtx, 60), run),
  large: await measure((baseCtx) => seedPosts(baseCtx, 200), run),
});

test('two-field orderBy served by a compound index stays limit-bound', async () => {
  const { small, large } = await atBothSizes((ctx) =>
    ctx.orm.query.posts.findMany({
      orderBy: (posts: any, { asc }: any) => [
        asc(posts.type),
        asc(posts.numLikes),
      ],
      limit: 5,
    })
  );

  expect(small.rows).toHaveLength(5);
  expect(large.rows).toHaveLength(5);
  expect(small.documents).toBe(5);
  expect(large.documents).toBe(5);
});

test('two-field orderBy stays limit-bound descending', async () => {
  const { small, large } = await atBothSizes((ctx) =>
    ctx.orm.query.posts.findMany({
      orderBy: (posts: any, { desc }: any) => [
        desc(posts.type),
        desc(posts.numLikes),
      ],
      limit: 5,
    })
  );

  expect(small.documents).toBe(5);
  expect(large.documents).toBe(5);
});

test('an eq-pinned leading sort field does not cost the bound', async () => {
  // `type` is pinned by the where, so the scan is already constant in it and
  // only `numLikes` moves — including when the two point opposite ways.
  const { small, large } = await atBothSizes((ctx) =>
    ctx.orm.query.posts.findMany({
      where: { type: 'a' },
      orderBy: (posts: any, { asc, desc }: any) => [
        asc(posts.type),
        desc(posts.numLikes),
      ],
      limit: 3,
    })
  );

  expect(small.documents).toBe(3);
  expect(large.documents).toBe(3);
  expect((large.rows as any[]).map((row) => row.numLikes)).toEqual(
    [...(large.rows as any[])].map((row) => row.numLikes).sort((a, b) => b - a)
  );
});

test('two-field orderBy returns the same page a post-fetch sort would', async () => {
  const t = convexTest(schema);
  await t.run((baseCtx) => seedPosts(baseCtx, 60));
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const page = await ctx.orm.query.posts.findMany({
      orderBy: (posts: any, { asc }: any) => [
        asc(posts.type),
        asc(posts.numLikes),
      ],
      limit: 7,
    });
    const all = await ctx.orm.query.posts.findMany({ limit: 1000 });
    const expected = [...all]
      .sort(
        (a: any, b: any) =>
          (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
          a.numLikes - b.numLikes
      )
      .slice(0, 7);
    expect(page.map((r: any) => [r.type, r.numLikes])).toEqual(
      expected.map((r: any) => [r.type, r.numLikes])
    );
  });
});

test('an `in` union keeps the requested order over the whole union', async () => {
  // Each probe pins `type` to a different value, so the field is constant
  // inside a probe but not across the union. The per-probe truncation is still
  // sound — the global comparator restricted to one probe is that probe's own
  // scan order — but only if the union is re-sorted before it is sliced.
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    // 'a' holds the high scores and 'b' the low ones, so a union that kept
    // probe order, or merged on `numLikes` alone, would interleave them.
    for (const [type, likes] of [
      ['a', [10, 20, 30]],
      ['b', [1, 2, 3]],
    ] as const) {
      for (const numLikes of likes) {
        await baseCtx.db.insert('posts', {
          text: `${type}${numLikes}`,
          numLikes,
          type,
        });
      }
    }
  });
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const rows = await ctx.orm.query.posts.findMany({
      where: { type: { in: ['a', 'b'] } },
      orderBy: (posts: any, { asc, desc }: any) => [
        asc(posts.type),
        desc(posts.numLikes),
      ],
      limit: 4,
    });
    expect(rows.map((row: any) => `${row.type}${row.numLikes}`)).toEqual([
      'a30',
      'a20',
      'a10',
      'b3',
    ]);

    // Same union, but now the leading sort field is the one the probes do not
    // pin, so the page has to be assembled across probes rather than taken
    // from the first one.
    const byLikes = await ctx.orm.query.posts.findMany({
      where: { type: { in: ['a', 'b'] } },
      orderBy: (posts: any, { asc }: any) => [
        asc(posts.numLikes),
        asc(posts.createdAt),
      ],
      limit: 4,
    });
    expect(byLikes.map((row: any) => `${row.type}${row.numLikes}`)).toEqual([
      'b1',
      'b2',
      'b3',
      'a10',
    ]);
  });
});

test('cursor pages honour a sort whose leading field is eq-pinned the other way', async () => {
  // `type` is pinned by the where and `numLikes` runs the other way, so the
  // direction the scan needs is the second spec's, not the first's.
  const t = convexTest(schema);
  await t.run((baseCtx) => seedPosts(baseCtx, 40));
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const page = await ctx.orm.query.posts.findMany({
      where: { type: 'a' },
      orderBy: (posts: any, { asc, desc }: any) => [
        asc(posts.type),
        desc(posts.numLikes),
      ],
      cursor: null,
      limit: 3,
    });
    const all = await ctx.orm.query.posts.findMany({
      where: { type: 'a' },
      limit: 1000,
    });
    const expected = [...all]
      .map((row: any) => row.numLikes)
      .sort((left, right) => right - left)
      .slice(0, 3);
    expect(page.page.map((row: any) => row.numLikes)).toEqual(expected);
  });
});

test('a relation orderBy served by the FK index stays per-parent bound', async () => {
  // `by_author_likes` is (authorId, numLikes); the FK pins authorId, so the
  // scan is already in numLikes order and then `_creationTime` order.
  const seed = (count: number) => async (baseCtx: any) => {
    const author = await baseCtx.db.insert('users', {
      name: 'A',
      email: 'relation-order@example.com',
    });
    await seedPosts(baseCtx, count, author);
  };
  const run = (ctx: Ctx) =>
    ctx.orm.query.users.findMany({
      limit: 1,
      with: {
        posts: { orderBy: { numLikes: 'asc', createdAt: 'asc' }, limit: 2 },
      },
    });

  const small = await measure(seed(60), run);
  const large = await measure(seed(200), run);

  // 1 parent + exactly 2 children, at any table size.
  expect(small.documents).toBe(3);
  expect(large.documents).toBe(3);
  expect((large.rows as any[])[0].posts.map((p: any) => p.numLikes)).toEqual([
    0, 1,
  ]);
});

test('a nullable sort column keeps the post-fetch null placement', async () => {
  // Convex sorts absent/null first in an ascending index scan while the
  // post-fetch comparator sorts them last. The two disagree, so this sort must
  // not move into the index no matter how well the key shape lines up.
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('users', { name: 'A', email: 'a@x.com' });
    await baseCtx.db.insert('users', {
      name: 'B',
      email: 'b@x.com',
      deletedAt: 5,
    });
    await baseCtx.db.insert('users', { name: 'C', email: 'c@x.com' });
    await baseCtx.db.insert('users', {
      name: 'D',
      email: 'd@x.com',
      deletedAt: 1,
    });
  });
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const rows = await ctx.orm.query.users.findMany({
      orderBy: (users: any, { asc }: any) => [
        asc(users.deletedAt),
        asc(users.name),
      ],
      limit: 10,
    });
    expect(rows.map((row: any) => row.name)).toEqual(['D', 'B', 'A', 'C']);
  });
});
