/**
 * M5 OrderBy - Comprehensive Test Suite
 *
 * Tests orderBy functionality:
 * - asc() and desc() helpers
 * - Single-field ordering
 * - Combined with where filtering
 * - Combined with pagination (limit/offset)
 * - Index-aware optimization
 */

import { test as baseTest, describe, expect } from 'vitest';
import schema from '../schema';
import {
  convexTest,
  countDocumentReads,
  runCtx,
  type TestCtx,
} from '../setup.testing';

// ============================================================================
// Test Setup
// ============================================================================

const test = baseTest.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

// ============================================================================
// Basic OrderBy Tests
// ============================================================================

describe('M5: OrderBy - Basic Ordering', () => {
  test('asc() orders by field ascending', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data with different creation times
    const user1 = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    const user2 = await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    const user3 = await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user1,
      publishedAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user2,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user3,
      publishedAt: 2000,
    });

    // Query with ascending order by publishedAt
    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { asc }: any) => asc(posts.publishedAt),
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].publishedAt).toBe(1000);
    expect(posts[1].publishedAt).toBe(2000);
    expect(posts[2].publishedAt).toBe(3000);
  });

  test('desc() orders by field descending', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data
    const user1 = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    const user2 = await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    const user3 = await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user1,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user2,
      publishedAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user3,
      publishedAt: 3000,
    });

    // Query with descending order by publishedAt
    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { desc }: any) => desc(posts.publishedAt),
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].publishedAt).toBe(3000);
    expect(posts[1].publishedAt).toBe(2000);
    expect(posts[2].publishedAt).toBe(1000);
  });

  test('orderBy callback accepts column builder (defaults to asc)', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user,
      publishedAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any) => posts.publishedAt,
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].publishedAt).toBe(1000);
    expect(posts[1].publishedAt).toBe(2000);
    expect(posts[2].publishedAt).toBe(3000);
  });

  test('orderBy by createdAt uses default index', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data
    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'First',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Second',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Third',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 3000,
    });

    // Query ordered by createdAt (has default index)
    const postsAsc = await db.query.posts.findMany({
      orderBy: { createdAt: 'asc' },
    });

    expect(postsAsc).toHaveLength(3);
    expect(postsAsc[0].title).toBe('First');
    expect(postsAsc[2].title).toBe('Third');

    const postsDesc = await db.query.posts.findMany({
      orderBy: { createdAt: 'desc' },
    });

    expect(postsDesc).toHaveLength(3);
    expect(postsDesc[0].title).toBe('Third');
    expect(postsDesc[2].title).toBe('First');
  });
});

// ============================================================================
// OrderBy with Filtering
// ============================================================================

describe('M5: OrderBy - Combined with WHERE', () => {
  test('orderBy works with where filtering', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 3',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Draft 1',
      content: 'Content',
      published: false,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 2',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 1',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1500,
    });

    // Query published posts ordered by publishedAt
    const posts = await db.query.posts.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'asc' },
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('Published 1');
    expect(posts[1].title).toBe('Published 2');
    expect(posts[2].title).toBe('Published 3');
  });
});

// ============================================================================
// OrderBy with Pagination
// ============================================================================

describe('M5: OrderBy - Combined with Pagination', () => {
  test('orderBy works with limit', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 4',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 4000,
    });

    // Get top 2 oldest posts
    const posts = await db.query.posts.findMany({
      orderBy: { publishedAt: 'asc' },
      limit: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Post 1');
    expect(posts[1].title).toBe('Post 2');
  });

  test('orderBy works with offset', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 4',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 4000,
    });

    // Get page 2 (skip first 2, take 2)
    const posts = await db.query.posts.findMany({
      orderBy: { publishedAt: 'asc' },
      limit: 2,
      offset: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Post 3');
    expect(posts[1].title).toBe('Post 4');
  });
});

// ============================================================================
// Multi-field Ordering
// ============================================================================

describe('M5: OrderBy - Multiple Fields', () => {
  test('orderBy callback supports multiple fields', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'B Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'A Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'C Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { asc, desc }: any) => [
        desc(posts.publishedAt),
        asc(posts.title),
      ],
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('C Title'); // publishedAt 2000
    expect(posts[1].title).toBe('A Title'); // publishedAt 1000, title asc
    expect(posts[2].title).toBe('B Title');
  });

  test('multi-field orderBy applies sort before offset/limit', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    // Same primary sort value to force secondary sort to determine ordering.
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'C Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'A Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'D Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'B Title',
      content: 'Content',
      published: true,
      authorId: user,
      publishedAt: 1000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { desc, asc }: any) => [
        desc(posts.publishedAt),
        asc(posts.title),
      ],
      offset: 1,
      limit: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('B Title');
    expect(posts[1].title).toBe('C Title');
  });
});

// ============================================================================
// Index selection
// ============================================================================

describe('M5: OrderBy - Index Selection', () => {
  test('orderBy on a non-leading index field sorts by that field', async ({
    ctx,
  }) => {
    // numLikesAndType is on (type, numLikes): walking it sorts by type first.
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 900,
      type: 'a',
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 1,
      type: 'b',
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 50,
      type: 'c',
    });

    const posts = await ctx.orm.query.posts.findMany({
      orderBy: { numLikes: 'asc' },
      limit: 3,
    });

    expect(posts.map((post) => post.numLikes)).toEqual([1, 50, 900]);
  });

  test('in + orderBy + limit returns the requested window', async ({ ctx }) => {
    for (let i = 0; i < 6; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: i % 2 === 0 ? 'a' : 'b',
      });
    }

    const users = await ctx.orm.query.users.findMany({
      where: { status: { in: ['a', 'b'] } },
      orderBy: { createdAt: 'desc' },
      limit: 3,
    });

    expect(users.map((user) => user.name)).toEqual(['u5', 'u4', 'u3']);
  });

  test('in + orderBy + limit reads only the requested window', async ({
    ctx,
  }) => {
    for (let i = 0; i < 60; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: i % 2 === 0 ? 'a' : 'b',
      });
    }

    const reads = countDocumentReads(ctx);
    const users = await ctx.orm.query.users.findMany({
      where: { status: { in: ['a', 'b'] } },
      orderBy: { createdAt: 'desc' },
      limit: 2,
    });

    expect(users.map((user) => user.name)).toEqual(['u59', 'u58']);
    // One bounded read per probe, not the whole matching set.
    expect(reads.scanned).toBeLessThanOrEqual(8);
  });

  test('orderBy an index suffix field reads only the requested window', async ({
    ctx,
  }) => {
    // numLikesAndType is (type, numLikes): pinning `type` leaves the scan
    // already sorted by numLikes.
    for (let i = 0; i < 60; i += 1) {
      await ctx.db.insert('posts', {
        text: `p${i}`,
        numLikes: i,
        type: 'a',
      });
    }

    const reads = countDocumentReads(ctx);
    const posts = await ctx.orm.query.posts.findMany({
      where: { type: 'a' },
      orderBy: { numLikes: 'desc' },
      limit: 2,
    });

    expect(posts.map((post) => post.numLikes)).toEqual([59, 58]);
    expect(reads.scanned).toBeLessThanOrEqual(4);
  });

  test('orderBy createdAt under an unpinned index suffix sorts by createdAt', async ({
    ctx,
  }) => {
    // Insertion order is not numLikes order, so ordering by the index suffix
    // instead of creation time would return a different pair.
    for (const numLikes of [50, 10, 90, 20, 70]) {
      await ctx.db.insert('posts', {
        text: `p${numLikes}`,
        numLikes,
        type: 'a',
      });
    }

    const posts = await ctx.orm.query.posts.findMany({
      where: { type: 'a' },
      orderBy: { createdAt: 'desc' },
      limit: 2,
    });

    expect(posts.map((post) => post.numLikes)).toEqual([70, 20]);
  });

  test('configured compound index does not masquerade as creation order', async ({
    ctx,
  }) => {
    for (const numLikes of [50, 10, 90, 20, 70]) {
      await ctx.db.insert('posts', {
        text: `configured-${numLikes}`,
        numLikes,
        type: 'configured',
      });
    }

    const posts = await ctx.orm.query.posts
      .withIndex('numLikesAndType', (q) => q.eq('type', 'configured'))
      .findMany({
        orderBy: { createdAt: 'desc' },
        limit: 2,
      });

    expect(posts.map((post) => post.numLikes)).toEqual([70, 20]);
  });

  test('fully pinned configured index keeps creation-order cursors', async ({
    ctx,
  }) => {
    for (let i = 0; i < 4; i += 1) {
      await ctx.db.insert('users', {
        name: 'Pinned',
        email: `pinned-${i}@example.com`,
      });
    }

    const page = await ctx.orm.query.users
      .withIndex('by_name', (q) => q.eq('name', 'Pinned'))
      .findMany({
        cursor: null,
        orderBy: { createdAt: 'desc' },
        limit: 2,
      });

    expect(page.page.map((user) => user.email)).toEqual([
      'pinned-3@example.com',
      'pinned-2@example.com',
    ]);
  });
});
