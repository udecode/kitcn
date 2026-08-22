/**
 * Read bounds and semantics for relation-existence `where` filters.
 *
 * `where: { posts: { type: 'wanted' } }` asks whether a matching child exists.
 * The predicate reaches the read plan, so the load stops at the first match
 * instead of draining the whole per-parent child window.
 *
 * Stopping early is only sound while the *window* stays the same. These tests
 * pin both halves: the read count must drop, and every answer must match what
 * the unbounded load produced.
 */

import {
  boolean,
  convexTable,
  defineRelations,
  defineSchema,
  index,
  integer,
  text,
} from 'kitcn/orm';
import { expect, test } from 'vitest';
import schema from '../schema';
import {
  convexTest,
  countDocumentReads,
  runCtx,
  withOrm,
} from '../setup.testing';

const POST_COUNT = 61;

const seedUserWithPosts = async (
  ctx: { db: any },
  { matchAt }: { matchAt: number }
) => {
  const userId = await ctx.db.insert('users', {
    name: 'Author',
    email: 'author@example.com',
    status: 'active',
  });

  for (let index = 0; index < POST_COUNT; index += 1) {
    await ctx.db.insert('posts', {
      text: `post-${index}`,
      numLikes: 0,
      type: index === matchAt ? 'wanted' : 'other',
      authorId: userId,
    });
  }

  return userId;
};

test('relation-existence where stops at the first matching child', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.users.findMany({
      where: { posts: { type: 'wanted' } },
    });

    expect(rows).toHaveLength(1);
    // One parent plus the first matching child. Draining the whole
    // `defaultLimit` window would cost POST_COUNT child reads instead.
    expect(reads.documents).toBeLessThanOrEqual(2);
  });
});

test('hand-written with: { where, limit: 1 } is the read floor', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.users.findMany({
      with: { posts: { where: { type: 'wanted' }, limit: 1 } },
    });

    expect(rows).toHaveLength(1);
    expect(reads.documents).toBeLessThanOrEqual(2);
  });
});

test('a match that sorts last is still found', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: POST_COUNT - 1 });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.users.findMany({ where: { posts: { type: 'wanted' } } })
    ).resolves.toHaveLength(1);
  });
});

test('boolean relation existence reads one child, not the window', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.users.findMany({
      where: { posts: true },
    });

    expect(rows).toHaveLength(1);
    expect(reads.documents).toBeLessThanOrEqual(2);
  });
});

test('NOT over a relation existence filter reads one child', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
    const quietId = await baseCtx.db.insert('users', {
      name: 'Quiet',
      email: 'quiet@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('posts', {
      text: 'nothing wanted here',
      numLikes: 0,
      type: 'other',
      authorId: quietId,
    });
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);

    // `.withIndex(...)` only to satisfy `findMany`'s overload resolution, which
    // cannot infer a bare object `where` containing `NOT`.
    const rows = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({ where: { NOT: { posts: { type: 'wanted' } } } });

    expect(rows.map((row) => row.name)).toEqual(['Quiet']);
    // Two parents, and one child probe each. The author's own probe stops on
    // its first `wanted` post; the quiet user's drains a single `other` post.
    expect(reads.documents).toBeLessThanOrEqual(4);
  });
});

test('a nested relation-existence where still evaluates the child predicate', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Commented',
      email: 'commented@example.com',
      status: 'active',
    });
    for (let index = 0; index < 20; index += 1) {
      const postId = await baseCtx.db.insert('posts', {
        text: `post-${index}`,
        numLikes: 0,
        type: 'other',
        authorId,
      });
      await baseCtx.db.insert('comments', {
        postId,
        authorId,
        text: index === 0 ? 'hit' : 'miss',
      });
    }

    const silentId = await baseCtx.db.insert('users', {
      name: 'Silent',
      email: 'silent@example.com',
      status: 'active',
    });
    const silentPostId = await baseCtx.db.insert('posts', {
      text: 'silent post',
      numLikes: 0,
      type: 'other',
      authorId: silentId,
    });
    await baseCtx.db.insert('comments', {
      postId: silentPostId,
      authorId: silentId,
      text: 'miss',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // The bounded filter load strips the child's own relation keys before the
    // outer predicate re-reads them, so the lowering has to ask for them back.
    const rows = await ctx.orm.query.users.findMany({
      where: { posts: { comments: { text: 'hit' } } },
    });

    expect(rows.map((row) => row.name)).toEqual(['Commented']);
  });
});

test('a relation key used by two branches keeps the unbounded load', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const userId = await baseCtx.db.insert('users', {
      name: 'OnlyOther',
      email: 'only-other@example.com',
      status: 'active',
    });
    await baseCtx.db.insert('posts', {
      text: 'other post',
      numLikes: 0,
      type: 'other',
      authorId: userId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // Both branches read the same load. Pushing either predicate into it would
    // starve the other -- here `posts: true` is what matches.
    await expect(
      ctx.orm.query.users.findMany({
        where: { OR: [{ posts: true }, { posts: { type: 'wanted' } }] },
      })
    ).resolves.toHaveLength(1);

    await expect(
      ctx.orm.query.users.findMany({
        where: {
          OR: [{ posts: { type: 'wanted' } }, { posts: { type: 'other' } }],
        },
      })
    ).resolves.toHaveLength(1);
  });
});

test('a through-relation existence where stops at the first matching link', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const bookId = await baseCtx.db.insert('books', { name: 'Anthology' });
    for (let index = 0; index < 25; index += 1) {
      const authorId = await baseCtx.db.insert('users', {
        name: index === 0 ? 'Ada' : `Ghost ${index}`,
        email: `through-${index}@example.com`,
        status: 'active',
      });
      await baseCtx.db.insert('bookAuthors', {
        bookId,
        authorId,
        role: 'author',
      });
    }
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.books.findMany({
      where: { authors: { name: 'Ada' } },
    });

    expect(rows).toHaveLength(1);
    // The book, its first junction row, and that row's author. Reading every
    // link would cost 25 junction rows and 25 users.
    expect(reads.documents).toBeLessThanOrEqual(4);
  });
});

test('relation-existence where drops the filter-loaded children from the row', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.users.findMany({
      where: { posts: { type: 'wanted' } },
    });

    expect(rows).toHaveLength(1);
    expect('posts' in (rows[0] as any)).toBe(false);
  });
});

test('relation-existence where still returns the full requested relation', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await seedUserWithPosts(baseCtx, { matchAt: 0 });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.users.findMany({
      where: { posts: { type: 'wanted' } },
      with: { posts: true },
    });

    expect(rows).toHaveLength(1);
    // The filter load is bounded, but `with` still owns the returned list.
    expect((rows[0] as any).posts).toHaveLength(POST_COUNT);
  });
});

test('a through-relation match beyond the first link is still found', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const bookId = await baseCtx.db.insert('books', { name: 'Anthology' });
    for (let index = 0; index < 25; index += 1) {
      const authorId = await baseCtx.db.insert('users', {
        name: index === 12 ? 'Ada' : `Ghost ${index}`,
        email: `late-through-${index}@example.com`,
        status: 'active',
      });
      await baseCtx.db.insert('bookAuthors', {
        bookId,
        authorId,
        role: 'author',
      });
    }
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // Stopping at the first *surviving* link is not stopping at the first link.
    await expect(
      ctx.orm.query.books.findMany({ where: { authors: { name: 'Ada' } } })
    ).resolves.toHaveLength(1);
  });
});

test('a repeated relation key disables the bound for its whole subtree', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Threaded',
      email: 'threaded@example.com',
      status: 'active',
    });
    const postId = await baseCtx.db.insert('posts', {
      text: 'one post',
      numLikes: 0,
      type: 'other',
      authorId,
    });
    await baseCtx.db.insert('comments', {
      postId,
      authorId,
      text: 'b',
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // `posts` repeats, so both branches share one load of it -- and therefore
    // one load of `comments` underneath it. Bounding that grandchild by either
    // branch's predicate would decide what the other branch gets to see.
    await expect(
      ctx.orm.query.users.findMany({
        where: {
          OR: [
            { posts: { comments: { text: 'a' } } },
            { posts: { comments: { text: 'b' } } },
          ],
        },
      })
    ).resolves.toHaveLength(1);
  });
});

// A schema of its own: the shared one sets `defaultLimit: 1000`, and the window
// this pins is the default limit itself.
const windowUsers = convexTable('probeUsers', {
  name: text().notNull(),
});
const windowPosts = convexTable(
  'probePosts',
  {
    type: text().notNull(),
    rank: integer().notNull(),
    published: boolean(),
    authorId: text(),
  },
  (t) => [index('by_author').on(t.authorId)]
);
const windowBooks = convexTable('probeBooks', {
  name: text().notNull(),
});
const windowBookAuthors = convexTable(
  'probeBookAuthors',
  {
    bookId: text().notNull(),
    authorId: text().notNull(),
  },
  (t) => [index('by_book').on(t.bookId), index('by_author').on(t.authorId)]
);
const windowTables = {
  probeUsers: windowUsers,
  probePosts: windowPosts,
  probeBooks: windowBooks,
  probeBookAuthors: windowBookAuthors,
};
const windowSchema = defineSchema(windowTables, {
  defaults: { defaultLimit: 3 },
});
const windowRelations = defineRelations(windowTables, (r) => ({
  probeUsers: {
    posts: r.many.probePosts({
      from: r.probeUsers.id,
      to: r.probePosts.authorId,
    }),
    publishedPosts: r.many.probePosts({
      from: r.probeUsers.id,
      to: r.probePosts.authorId,
      where: { published: true },
      alias: 'probe-published-posts',
    }),
  },
  probePosts: {
    author: r.one.probeUsers({
      from: r.probePosts.authorId,
      to: r.probeUsers.id,
    }),
  },
  probeBooks: {
    authors: r.many.probeUsers({
      from: r.probeBooks.id.through(r.probeBookAuthors.bookId),
      to: r.probeUsers.id.through(r.probeBookAuthors.authorId),
    }),
  },
  probeBookAuthors: {},
}));

const seedWindow = async (ctx: { db: any }, matchAt: number) => {
  const userId = await ctx.db.insert('probeUsers', { name: 'Windowed' });
  for (let rank = 0; rank < 6; rank += 1) {
    await ctx.db.insert('probePosts', {
      type: rank === matchAt ? 'wanted' : 'other',
      rank,
      authorId: userId,
    });
  }
};

test('the existence probe never looks past the default-limit window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedWindow(baseCtx, 5);
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, windowRelations);

    // `defaultLimit: 3` is the window the unbounded load decided from, so a
    // match at rank 5 is outside it and stays outside it.
    await expect(
      ctx.orm.query.probeUsers.findMany({
        where: { posts: { type: 'wanted' } },
      })
    ).resolves.toHaveLength(0);
    // One parent plus the three-row window. Never the whole child set.
    expect(reads.documents).toBeLessThanOrEqual(4);
  });
});

test('the existence probe finds a match inside the default-limit window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedWindow(baseCtx, 2);
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, windowRelations);

    await expect(
      ctx.orm.query.probeUsers.findMany({
        where: { posts: { type: 'wanted' } },
      })
    ).resolves.toHaveLength(1);
    expect(reads.documents).toBeLessThanOrEqual(4);
  });
});

/**
 * A relation carrying its own `where` filters after the read, so the unbounded
 * load counted *surviving* children against the default limit rather than
 * scanned ones. The probe has to bound the same count, or it reaches matches
 * the unbounded load never saw.
 */
const seedAmbientWindow = async (ctx: { db: any }, wantedAt: number) => {
  const userId = await ctx.db.insert('probeUsers', { name: 'Windowed' });
  // Index 0 is filtered out by the relation's own `where`, so the three-row
  // window covers ranks 1, 2 and 3.
  const published = [false, true, true, true, true, true];
  for (let rank = 0; rank < published.length; rank += 1) {
    await ctx.db.insert('probePosts', {
      type: rank === wantedAt ? 'wanted' : 'other',
      rank,
      published: published[rank],
      authorId: userId,
    });
  }
};

test('a relation-filtered probe never looks past its own default-limit window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedAmbientWindow(baseCtx, 4);
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, windowRelations);

    // Rank 4 is the fourth published post, one past the window.
    await expect(
      ctx.orm.query.probeUsers.findMany({
        where: { publishedPosts: { type: 'wanted' } },
      })
    ).resolves.toHaveLength(0);
    // The parent plus ranks 0-3: one filtered out, then the three-row window.
    expect(reads.documents).toBeLessThanOrEqual(5);
  });
});

test('a relation-filtered probe finds a match inside its window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedAmbientWindow(baseCtx, 3);
  });

  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, windowRelations);

    await expect(
      ctx.orm.query.probeUsers.findMany({
        where: { publishedPosts: { type: 'wanted' } },
      })
    ).resolves.toHaveLength(1);
  });
});

const seedThroughWindow = async (ctx: { db: any }, adaAt: number) => {
  const bookId = await ctx.db.insert('probeBooks', { name: 'Anthology' });
  for (let link = 0; link < 6; link += 1) {
    const authorId = await ctx.db.insert('probeUsers', {
      name: link === adaAt ? 'Ada' : `Ghost ${link}`,
    });
    await ctx.db.insert('probeBookAuthors', { bookId, authorId });
  }
};

test('a through-relation probe never looks past the default-limit window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedThroughWindow(baseCtx, 5);
  });

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, windowRelations);

    // The unbounded read decided from the first three junction links, so a
    // match on the sixth stays out of reach.
    await expect(
      ctx.orm.query.probeBooks.findMany({
        where: { authors: { name: 'Ada' } },
      })
    ).resolves.toHaveLength(0);
    // The book, three links and their three authors. Not all six of each.
    expect(reads.documents).toBeLessThanOrEqual(7);
  });
});

test('a through-relation probe finds a match inside the window', async () => {
  const t = convexTest(windowSchema);

  await t.run(async (baseCtx) => {
    await seedThroughWindow(baseCtx, 2);
  });

  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, windowRelations);

    await expect(
      ctx.orm.query.probeBooks.findMany({
        where: { authors: { name: 'Ada' } },
      })
    ).resolves.toHaveLength(1);
  });
});
