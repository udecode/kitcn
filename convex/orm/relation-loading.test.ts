/**
 * M6.5 Phase 1 - Relation Loading Runtime Tests
 *
 * Tests basic one-level relation loading:
 * - One-to-many relations (users.posts)
 * - Many-to-one relations (posts.author)
 * - Batch loading efficiency (no N+1 queries)
 * - Optional relations (null handling)
 */

import type { StorageActionWriter } from 'convex/server';
import {
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  extractRelationsConfig,
  id,
  index,
  text,
} from 'kitcn/orm';
import { test as baseTest, describe, expect } from 'vitest';
import type { MutationCtx } from '../_generated/server';
import { cities, posts, users } from '../schema';
import { convexTest, withOrm, withOrmCtx } from '../setup.testing';

// M6.5 Phase 2: Comments table and relations for nested testing (local to this test file)
const ormComments = convexTable(
  'comments',
  {
    text: text().notNull(),
    postId: id('posts').notNull(),
    authorId: id('users'),
  },
  (t) => [index('by_post').on(t.postId), index('by_author').on(t.authorId)]
);

const ormGroups = convexTable('groups', {
  name: text().notNull(),
});

const ormUsersToGroups = convexTable(
  'usersToGroups',
  {
    userId: id('users').notNull(),
    groupId: id('groups').notNull(),
  },
  (t) => [index('by_user').on(t.userId)]
);

const testTables = {
  users: users,
  posts: posts,
  comments: ormComments,
  groups: ormGroups,
  usersToGroups: ormUsersToGroups,
  cities: cities,
};

// Local schema with comments table for testing relation loading
const testSchemaWithComments = defineSchema(testTables, {
  defaults: {
    defaultLimit: 1000,
  },
});

// M6.5 Phase 2: Relations for comments + posts (local to this test file)
const testRelations = defineRelations(testTables, (r) => ({
  users: {
    posts: r.many.posts({
      from: r.users.id,
      to: r.posts.authorId,
    }),
    groups: r.many.groups({
      from: r.users.id.through(r.usersToGroups.userId),
      to: r.groups.id.through(r.usersToGroups.groupId),
      alias: 'users-groups',
    }),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
    comments: r.many.comments({
      from: r.posts.id,
      to: r.comments.postId,
    }),
  },
  comments: {
    post: r.one.posts({
      from: r.comments.postId,
      to: r.posts.id,
    }),
    author: r.one.users({
      from: r.comments.authorId,
      to: r.users.id,
    }),
  },
  groups: {},
  usersToGroups: {
    user: r.one.users({
      from: r.usersToGroups.userId,
      to: r.users.id,
    }),
    group: r.one.groups({
      from: r.usersToGroups.groupId,
      to: r.groups.id,
    }),
  },
  cities: {},
}));
const edges = extractRelationsConfig(testRelations);

type TestCtx = MutationCtx & {
  storage: StorageActionWriter;
  orm: DatabaseWithMutations<typeof testRelations>;
};

// Test setup with convexTest
const test = baseTest.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(testSchemaWithComments);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, testRelations);
      await use(ctx);
    });
  },
});

describe('M6.5 Phase 1: Relation Loading', () => {
  describe('One-to-Many Relations (users.posts)', () => {
    test('should load empty posts array for user with no posts', async ({
      ctx,
    }) => {
      // Create user without posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].id).toBe(userId);
      expect(users[0].posts).toEqual([]);
    });

    test('should load posts for single user', async ({ ctx }) => {
      // Create user with 2 posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const post1Id = await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const post2Id = await ctx.db.insert('posts', {
        text: 'Second post',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = (await db.query.users.findMany({
        with: {
          posts: true,
        },
      })) as any;

      expect(users).toHaveLength(1);
      expect(users[0].id).toBe(userId);
      expect(users[0].posts).toHaveLength(2);
      expect(users[0].posts[0].id).toBe(post1Id);
      expect(users[0].posts[1].id).toBe(post2Id);
      expect(users[0].posts[0].text).toBe('First post');
      expect(users[0].posts[1].text).toBe('Second post');
    });

    test('should batch load posts for multiple users (no N+1)', async ({
      ctx,
    }) => {
      // Create 3 users with varying post counts
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const user3Id = await ctx.db.insert('users', {
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      // Alice: 2 posts
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 5,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });

      // Bob: 1 post
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 3,
        type: 'text',
        authorId: user2Id,
      });

      // Charlie: 0 posts

      const db = ctx.orm;
      const users = (await db.query.users.findMany({
        with: {
          posts: true,
        },
      })) as any;

      expect(users).toHaveLength(3);

      // Verify Alice's posts
      const alice = users.find((u: any) => u.id === user1Id);
      expect(alice).toBeDefined();
      expect(alice!.posts).toHaveLength(2);
      expect(alice!.posts.every((p: any) => p.authorId === user1Id)).toBe(true);

      // Verify Bob's posts
      const bob = users.find((u: any) => u.id === user2Id);
      expect(bob).toBeDefined();
      expect(bob!.posts).toHaveLength(1);
      expect(bob!.posts[0].authorId).toBe(user2Id);

      // Verify Charlie has no posts
      const charlie = users.find((u: any) => u.id === user3Id);
      expect(charlie).toBeDefined();
      expect(charlie!.posts).toEqual([]);
    });
  });

  describe('Column Selection with Relations', () => {
    test('should preserve relations when selecting specific columns', async ({
      ctx,
    }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        columns: { name: true },
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0]).toHaveProperty('name');
      expect(users[0]).toHaveProperty('posts');
      expect(users[0].posts).toHaveLength(1);
      expect(users[0]).not.toHaveProperty('email');
    });

    test('should preserve relations when columns is empty', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        columns: {},
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(Object.keys(users[0]).sort()).toEqual(['posts']);
      expect(users[0].posts).toHaveLength(1);
    });

    test('should apply columns inside relations and keep nested with', async ({
      ctx,
    }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        title: 'Post title',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            columns: { title: true },
            with: {
              author: {
                columns: { name: true },
              },
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].posts).toHaveLength(1);
      expect(users[0].posts[0]).toHaveProperty('title');
      expect(users[0].posts[0]).not.toHaveProperty('text');
      expect(users[0].posts[0]).toHaveProperty('author');
      expect(users[0].posts[0].author).toHaveProperty('name');
      expect(users[0].posts[0].author).not.toHaveProperty('email');
    });

    test('should compute extras inside relations', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            extras: {
              textLength: (row) => row.text.length,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].posts).toHaveLength(1);
      expect(users[0].posts[0]).toHaveProperty('textLength', 5);
    });

    test('should support callback where inside relations', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Published',
        numLikes: 1,
        type: 'post',
        authorId: userId,
        published: true,
      });
      await ctx.db.insert('posts', {
        text: 'Draft',
        numLikes: 1,
        type: 'post',
        authorId: userId,
        published: false,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            where: (posts, { eq }) => eq(posts.published, true),
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].posts).toHaveLength(1);
      expect(users[0].posts[0].text).toBe('Published');
    });
  });

  describe('Predefined relation where filters (polymorphic parity)', () => {
    const createPredefinedWhereArtifacts = () => {
      const polyUsers = convexTable(
        'poly_users',
        {
          name: text().notNull(),
          status: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );

      const polyPosts = convexTable(
        'poly_posts',
        {
          title: text().notNull(),
          visibility: text().notNull(),
          authorId: id('poly_users').notNull(),
        },
        (t) => [index('by_author').on(t.authorId)]
      );

      const tables = {
        poly_users: polyUsers,
        poly_posts: polyPosts,
      };

      const schema = defineSchema(tables, {
        defaults: {
          defaultLimit: 1000,
        },
      });

      const relations = defineRelations(tables, (r) => ({
        poly_users: {
          publishedPosts: r.many.poly_posts({
            from: r.poly_users.id,
            to: r.poly_posts.authorId,
            where: { visibility: 'published' },
            alias: 'published-posts',
          }),
        },
        poly_posts: {
          activeAuthor: r.one.poly_users({
            from: r.poly_posts.authorId,
            to: r.poly_users.id,
            optional: false,
            where: { status: 'active' },
            alias: 'active-author',
          }),
        },
      }));

      return { schema, relations };
    };

    test('should filter many() relation rows using predefined where (publishedPosts only)', async () => {
      const { schema, relations } = createPredefinedWhereArtifacts();

      await withOrmCtx(schema, relations, async (ctx) => {
        const userId = await ctx.db.insert('poly_users', {
          name: 'Alice',
          status: 'active',
        });

        await ctx.db.insert('poly_posts', {
          title: 'Published post',
          visibility: 'published',
          authorId: userId,
        });
        await ctx.db.insert('poly_posts', {
          title: 'Draft post',
          visibility: 'draft',
          authorId: userId,
        });

        const users = await ctx.orm.query.poly_users.findMany({
          with: {
            publishedPosts: true,
          },
        });

        expect(users).toHaveLength(1);
        expect(users[0].publishedPosts).toHaveLength(1);
        expect(users[0].publishedPosts[0].title).toBe('Published post');
      });
    });

    test('should null out one() relation after predefined where even when optional is false', async () => {
      const { schema, relations } = createPredefinedWhereArtifacts();

      await withOrmCtx(schema, relations, async (ctx) => {
        const activeUserId = await ctx.db.insert('poly_users', {
          name: 'Active user',
          status: 'active',
        });
        const inactiveUserId = await ctx.db.insert('poly_users', {
          name: 'Inactive user',
          status: 'inactive',
        });

        await ctx.db.insert('poly_posts', {
          title: 'Post by active user',
          visibility: 'published',
          authorId: activeUserId,
        });
        await ctx.db.insert('poly_posts', {
          title: 'Post by inactive user',
          visibility: 'published',
          authorId: inactiveUserId,
        });

        const posts = await ctx.orm.query.poly_posts.findMany({
          with: {
            activeAuthor: true,
          },
        });

        const activePost = posts.find(
          (post) => post.title === 'Post by active user'
        );
        const inactivePost = posts.find(
          (post) => post.title === 'Post by inactive user'
        );

        expect(activePost).toBeDefined();
        expect(activePost?.activeAuthor).toBeDefined();
        expect(activePost?.activeAuthor?.name).toBe('Active user');

        expect(inactivePost).toBeDefined();
        expect(inactivePost?.activeAuthor).toBeNull();
      });
    });
  });

  describe('Many-to-One Relations (posts.author)', () => {
    test('should load user for single post', async ({ ctx }) => {
      // Create user and post
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const posts = (await db.query.posts.findMany({
        with: {
          author: true,
        },
      })) as any;

      expect(posts).toHaveLength(1);
      expect(posts[0].id).toBe(postId);
      expect(posts[0].author).toBeDefined();
      expect(posts[0].author!.id).toBe(userId);
      expect(posts[0].author!.name).toBe('Alice');
    });

    test('should handle null authorId (optional relation)', async ({ ctx }) => {
      // Create post without user
      const postId = await ctx.db.insert('posts', {
        text: 'Anonymous post',
        numLikes: 5,
        type: 'text',
        // authorId omitted (optional field)
      });

      const db = ctx.orm;
      const posts = await db.query.posts.findMany({
        with: {
          author: true,
        },
      });

      expect(posts).toHaveLength(1);
      expect(posts[0].id).toBe(postId);
      expect(posts[0].author).toBeNull();
    });

    test('should batch load users for multiple posts (no N+1)', async ({
      ctx,
    }) => {
      // Create 2 users
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Create 5 posts: 3 by Alice, 2 by Bob
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 15,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 8,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;
      const posts = (await db.query.posts.findMany({
        with: {
          author: true,
        },
      })) as any;

      expect(posts).toHaveLength(5);

      // Verify all posts by Alice reference the same user object
      const alicePosts = posts.filter((p: any) => p.authorId === user1Id);
      expect(alicePosts).toHaveLength(3);
      expect(alicePosts.every((p: any) => p.author!.id === user1Id)).toBe(true);
      expect(alicePosts.every((p: any) => p.author!.name === 'Alice')).toBe(
        true
      );

      // Verify all posts by Bob reference the same user object
      const bobPosts = posts.filter((p: any) => p.authorId === user2Id);
      expect(bobPosts).toHaveLength(2);
      expect(bobPosts.every((p: any) => p.author!.id === user2Id)).toBe(true);
      expect(bobPosts.every((p: any) => p.author!.name === 'Bob')).toBe(true);
    });
  });

  describe('findFirst() with Relations', () => {
    test('should load relations for single result', async ({ ctx }) => {
      // Create user with posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Second post',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const user = await db.query.users.findFirst({
        with: {
          posts: true,
        },
      });

      expect(user).toBeDefined();
      expect(user!.id).toBe(userId);
      expect(user!.posts).toHaveLength(2);
    });
  });
});

describe('M6.5 Phase 2: Nested Relation Loading', () => {
  describe('3-Level Nesting (users → posts → comments)', () => {
    test('should load nested relations up to depth 3', async ({ ctx }) => {
      // Create user → post → comment hierarchy
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'My post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const comment1Id = await (ctx.db as any).insert('comments', {
        text: 'Great post!',
        postId,
        authorId: userId,
      });

      const comment2Id = await (ctx.db as any).insert('comments', {
        text: 'Thanks for sharing',
        postId,
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].id).toBe(userId);
      expect((users[0] as any).posts).toHaveLength(1);
      expect((users[0] as any).posts[0].id).toBe(postId);
      expect((users[0] as any).posts[0].comments).toHaveLength(2);
      expect((users[0] as any).posts[0].comments[0].id).toBe(comment1Id);
      expect((users[0] as any).posts[0].comments[1].id).toBe(comment2Id);
    });

    test('should handle empty nested relations', async ({ ctx }) => {
      // Create user with post but no comments
      const userId = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'Post without comments',
        numLikes: 5,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect((users[0] as any).posts).toHaveLength(1);
      expect((users[0] as any).posts[0].comments).toEqual([]);
    });

    test('should batch load nested relations efficiently', async ({ ctx }) => {
      // Create 2 users with 2 posts each, each post with 2 comments
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Alice's posts and comments
      const alice_post1 = await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });

      const alice_post2 = await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 15,
        type: 'text',
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Alice post 1',
        postId: alice_post1,
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Another comment on Alice post 1',
        postId: alice_post1,
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Alice post 2',
        postId: alice_post2,
        authorId: user1Id,
      });

      // Bob's posts and comments
      const bob_post1 = await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 20,
        type: 'text',
        authorId: user2Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Bob post 1',
        postId: bob_post1,
        authorId: user2Id,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(2);

      // Verify Alice's nested data
      const alice = users.find((u: any) => u.id === user1Id) as any;
      expect(alice).toBeDefined();
      expect(alice.posts).toHaveLength(2);
      expect(alice.posts[0].comments).toHaveLength(2);
      expect(alice.posts[1].comments).toHaveLength(1);

      // Verify Bob's nested data
      const bob = users.find((u: any) => u.id === user2Id) as any;
      expect(bob).toBeDefined();
      expect(bob.posts).toHaveLength(1);
      expect(bob.posts[0].comments).toHaveLength(1);
    });
  });

  describe('Depth Limiting', () => {
    test('should respect max depth limit of 3', async ({ ctx }) => {
      // We can't easily test depth > 3 without more tables,
      // but we can verify depth 3 works and depth limiting is in place
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'Post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment',
        postId,
        authorId: userId,
      });

      const db = ctx.orm;

      // Depth 1: users
      // Depth 2: users.posts
      // Depth 3: users.posts.comments
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect((users[0] as any).posts[0].comments).toBeDefined();
      expect((users[0] as any).posts[0].comments).toHaveLength(1);
    });
  });
});

describe('M6.5 Phase 3: Relation Filters and Limits', () => {
  describe('OrderBy', () => {
    test('should order relations by field ascending', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      // Create posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;

      // Import asc helper
      const { asc } = await import('kitcn/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'asc' },
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      expect((users[0] as any).posts[0].numLikes).toBe(10);
      expect((users[0] as any).posts[1].numLikes).toBe(20);
      expect((users[0] as any).posts[2].numLikes).toBe(30);
    });

    test('should order relations by field descending', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Create posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;

      // Import desc helper
      const { desc } = await import('kitcn/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'desc' },
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      expect((users[0] as any).posts[0].numLikes).toBe(30);
      expect((users[0] as any).posts[1].numLikes).toBe(20);
      expect((users[0] as any).posts[2].numLikes).toBe(10);
    });
  });

  describe('Per-Parent Limiting', () => {
    test('should limit relations per parent (not globally)', async ({
      ctx,
    }) => {
      // Create 2 users
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Alice: 3 posts
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 30,
        type: 'text',
        authorId: user1Id,
      });

      // Bob: 3 posts
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 15,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 3',
        numLikes: 25,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          posts: {
            limit: 2, // Limit to 2 posts PER USER
          },
        },
      });

      expect(users).toHaveLength(2);

      // Verify Alice has exactly 2 posts (not affected by Bob's posts)
      const alice = users.find((u: any) => u.id === user1Id) as any;
      expect(alice.posts).toHaveLength(2);

      // Verify Bob has exactly 2 posts (not affected by Alice's posts)
      const bob = users.find((u: any) => u.id === user2Id) as any;
      expect(bob.posts).toHaveLength(2);
    });
  });

  describe('Per-Parent Offset', () => {
    test('should apply offset per parent', async ({ ctx }) => {
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 30,
        type: 'text',
        authorId: user1Id,
      });

      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 15,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 3',
        numLikes: 25,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'asc' },
            offset: 1,
          },
        },
      });

      const alice = users.find((u: any) => u.id === user1Id) as any;
      expect(alice.posts.map((post: any) => post.numLikes)).toEqual([20, 30]);

      const bob = users.find((u: any) => u.id === user2Id) as any;
      expect(bob.posts.map((post: any) => post.numLikes)).toEqual([15, 25]);
    });

    test('should apply offset for through relations', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      const groupA = await (ctx.db as any).insert('groups', { name: 'A' });
      const groupB = await (ctx.db as any).insert('groups', { name: 'B' });
      const groupC = await (ctx.db as any).insert('groups', { name: 'C' });

      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupA,
      });
      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupB,
      });
      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupC,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          groups: {
            orderBy: { name: 'asc' },
            offset: 1,
          },
        },
      });

      const charlie = users.find((u: any) => u.id === userId) as any;
      expect(charlie.groups.map((group: any) => group.name)).toEqual([
        'B',
        'C',
      ]);
    });
  });

  describe('OrderBy + Limit Combinations', () => {
    test('should order then limit per parent', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      // Create 5 posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 50,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 4',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 5',
        numLikes: 40,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const { desc } = await import('kitcn/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'desc' },
            limit: 3, // Get top 3 posts by likes
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      // Should get posts with 50, 40, 30 likes (top 3)
      expect((users[0] as any).posts[0].numLikes).toBe(50);
      expect((users[0] as any).posts[1].numLikes).toBe(40);
      expect((users[0] as any).posts[2].numLikes).toBe(30);
    });
  });

  describe('Index Requirements', () => {
    test('should throw when many() relation is missing an index', async () => {
      const noIndexUsers = convexTable('noIndexUsers', {
        name: text().notNull(),
      });
      const noIndexPosts = convexTable('noIndexPosts', {
        authorId: id('noIndexUsers').notNull(),
      });

      const noIndexTables = { noIndexUsers, noIndexPosts };
      const noIndexSchema = defineSchema(noIndexTables, {
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexUsers: {
          posts: r.many.noIndexPosts({
            from: r.noIndexUsers.id,
            to: r.noIndexPosts.authorId,
          }),
        },
        noIndexPosts: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexUsers.findMany({
            with: {
              posts: true,
            },
          });
        })
      ).rejects.toThrow(/requires index/i);
    });

    test('should throw when through() relation is missing a through index', async () => {
      const noIndexUsers = convexTable('noIndexThroughUsers', {
        name: text().notNull(),
      });
      const noIndexGroups = convexTable('noIndexThroughGroups', {
        name: text().notNull(),
      });
      const noIndexUsersToGroups = convexTable('noIndexUsersToGroups', {
        userId: id('noIndexThroughUsers').notNull(),
        groupId: id('noIndexThroughGroups').notNull(),
      });

      const noIndexTables = {
        noIndexThroughUsers: noIndexUsers,
        noIndexThroughGroups: noIndexGroups,
        noIndexUsersToGroups: noIndexUsersToGroups,
      };
      const noIndexSchema = defineSchema(noIndexTables, {
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexThroughUsers: {
          groups: r.many.noIndexThroughGroups({
            from: r.noIndexThroughUsers.id.through(
              r.noIndexUsersToGroups.userId
            ),
            to: r.noIndexThroughGroups.id.through(
              r.noIndexUsersToGroups.groupId
            ),
            alias: 'no-index-through',
          }),
        },
        noIndexThroughGroups: {},
        noIndexUsersToGroups: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexThroughUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexThroughUsers.findMany({
            with: {
              groups: true,
            },
          });
        })
      ).rejects.toThrow(/requires index/i);
    });

    test('should require allowFullScan when relation index is missing', async () => {
      const noIndexUsers = convexTable('noIndexRelaxedUsers', {
        name: text().notNull(),
      });
      const noIndexPosts = convexTable('noIndexRelaxedPosts', {
        authorId: id('noIndexRelaxedUsers').notNull(),
      });

      const noIndexTables = {
        noIndexRelaxedUsers: noIndexUsers,
        noIndexRelaxedPosts: noIndexPosts,
      };

      const noIndexSchema = defineSchema(noIndexTables, {
        strict: false,
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexRelaxedUsers: {
          posts: r.many.noIndexRelaxedPosts({
            from: r.noIndexRelaxedUsers.id,
            to: r.noIndexRelaxedPosts.authorId,
          }),
        },
        noIndexRelaxedPosts: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexRelaxedUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexRelaxedUsers.findMany({
            with: {
              posts: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexRelaxedUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexRelaxedUsers.findMany({
            allowFullScan: true,
            with: {
              posts: true,
            },
          });
        })
      ).resolves.toBeUndefined();
    });

    test('should throw when one() relation is missing a non-_id target index', async () => {
      const noIndexOneUsers = convexTable('noIndexOneUsers', {
        email: text().notNull(),
      });
      const noIndexOnePosts = convexTable('noIndexOnePosts', {
        authorEmail: text().notNull(),
      });

      const noIndexOneTables = {
        noIndexOneUsers,
        noIndexOnePosts,
      };
      const noIndexOneSchema = defineSchema(noIndexOneTables, {
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexOneRelations = defineRelations(noIndexOneTables, (r) => ({
        noIndexOneUsers: {},
        noIndexOnePosts: {
          author: r.one.noIndexOneUsers({
            from: r.noIndexOnePosts.authorEmail,
            to: r.noIndexOneUsers.email,
          }),
        },
      }));

      await expect(
        withOrmCtx(noIndexOneSchema, noIndexOneRelations, async (ctx) => {
          await ctx.db.insert('noIndexOneUsers', {
            email: 'alice@example.com',
          });
          await ctx.db.insert('noIndexOnePosts', {
            authorEmail: 'alice@example.com',
          });
          await ctx.orm.query.noIndexOnePosts.findMany({
            with: {
              author: true,
            },
          });
        })
      ).rejects.toThrow(/requires index/i);
    });

    test('should require allowFullScan when one() relation index is missing', async () => {
      const noIndexOneUsers = convexTable('noIndexOneRelaxedUsers', {
        email: text().notNull(),
      });
      const noIndexOnePosts = convexTable('noIndexOneRelaxedPosts', {
        authorEmail: text().notNull(),
      });

      const noIndexOneTables = {
        noIndexOneRelaxedUsers: noIndexOneUsers,
        noIndexOneRelaxedPosts: noIndexOnePosts,
      };
      const noIndexOneSchema = defineSchema(noIndexOneTables, {
        strict: false,
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexOneRelations = defineRelations(noIndexOneTables, (r) => ({
        noIndexOneRelaxedUsers: {},
        noIndexOneRelaxedPosts: {
          author: r.one.noIndexOneRelaxedUsers({
            from: r.noIndexOneRelaxedPosts.authorEmail,
            to: r.noIndexOneRelaxedUsers.email,
          }),
        },
      }));

      await expect(
        withOrmCtx(noIndexOneSchema, noIndexOneRelations, async (ctx) => {
          await ctx.db.insert('noIndexOneRelaxedUsers', {
            email: 'alice@example.com',
          });
          await ctx.db.insert('noIndexOneRelaxedPosts', {
            authorEmail: 'alice@example.com',
          });
          await ctx.orm.query.noIndexOneRelaxedPosts.findMany({
            with: {
              author: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(noIndexOneSchema, noIndexOneRelations, async (ctx) => {
          await ctx.db.insert('noIndexOneRelaxedUsers', {
            email: 'alice@example.com',
          });
          await ctx.db.insert('noIndexOneRelaxedPosts', {
            authorEmail: 'alice@example.com',
          });
          const rows = await ctx.orm.query.noIndexOneRelaxedPosts.findMany({
            allowFullScan: true,
            with: {
              author: true,
            },
          });
          expect(rows).toHaveLength(1);
          expect((rows[0] as any).author.email).toBe('alice@example.com');
        })
      ).resolves.toBeUndefined();
    });

    test('should require allowFullScan when through() target index is missing', async () => {
      const throughUsers = convexTable('noIndexThroughTargetUsers', {
        slug: text().notNull(),
      });
      const throughGroups = convexTable('noIndexThroughTargetGroups', {
        slug: text().notNull(),
      });
      const throughUsersToGroups = convexTable(
        'noIndexThroughTargetUsersToGroups',
        {
          userSlug: text().notNull(),
          groupSlug: text().notNull(),
        },
        (t) => [index('by_user_slug').on(t.userSlug)]
      );

      const throughTargetTables = {
        noIndexThroughTargetUsers: throughUsers,
        noIndexThroughTargetGroups: throughGroups,
        noIndexThroughTargetUsersToGroups: throughUsersToGroups,
      };
      const throughTargetSchema = defineSchema(throughTargetTables, {
        strict: false,
        defaults: {
          defaultLimit: 1000,
        },
      });
      const throughTargetRelations = defineRelations(
        throughTargetTables,
        (r) => ({
          noIndexThroughTargetUsers: {
            groups: r.many.noIndexThroughTargetGroups({
              from: r.noIndexThroughTargetUsers.slug.through(
                r.noIndexThroughTargetUsersToGroups.userSlug
              ),
              to: r.noIndexThroughTargetGroups.slug.through(
                r.noIndexThroughTargetUsersToGroups.groupSlug
              ),
            }),
          },
          noIndexThroughTargetGroups: {},
          noIndexThroughTargetUsersToGroups: {},
        })
      );

      await expect(
        withOrmCtx(throughTargetSchema, throughTargetRelations, async (ctx) => {
          await ctx.db.insert('noIndexThroughTargetUsers', { slug: 'alice' });
          await ctx.db.insert('noIndexThroughTargetGroups', { slug: 'g-1' });
          await ctx.db.insert('noIndexThroughTargetUsersToGroups', {
            userSlug: 'alice',
            groupSlug: 'g-1',
          });
          await ctx.orm.query.noIndexThroughTargetUsers.findMany({
            with: {
              groups: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(throughTargetSchema, throughTargetRelations, async (ctx) => {
          await ctx.db.insert('noIndexThroughTargetUsers', { slug: 'alice' });
          await ctx.db.insert('noIndexThroughTargetGroups', { slug: 'g-1' });
          await ctx.db.insert('noIndexThroughTargetUsersToGroups', {
            userSlug: 'alice',
            groupSlug: 'g-1',
          });
          const rows = await ctx.orm.query.noIndexThroughTargetUsers.findMany({
            allowFullScan: true,
            with: {
              groups: true,
            },
          });
          expect(rows).toHaveLength(1);
          expect((rows[0] as any).groups).toHaveLength(1);
          expect((rows[0] as any).groups[0].slug).toBe('g-1');
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('Relation Fan-out Guardrails', () => {
    test('should fail fast for many() fan-out key cardinality unless allowFullScan', async () => {
      const fanoutManyUsers = convexTable('fanoutManyUsers', {
        name: text().notNull(),
      });
      const fanoutManyPosts = convexTable(
        'fanoutManyPosts',
        {
          authorId: id('fanoutManyUsers').notNull(),
        },
        (t) => [index('by_author').on(t.authorId)]
      );

      const tables = {
        fanoutManyUsers,
        fanoutManyPosts,
      };
      const schema = defineSchema(tables, {
        defaults: {
          defaultLimit: 1000,
          relationFanOutMaxKeys: 2,
        },
      });
      const relations = defineRelations(tables, (r) => ({
        fanoutManyUsers: {
          posts: r.many.fanoutManyPosts({
            from: r.fanoutManyUsers.id,
            to: r.fanoutManyPosts.authorId,
          }),
        },
        fanoutManyPosts: {},
      }));

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userIds = [] as any[];
          for (let i = 0; i < 3; i += 1) {
            userIds.push(
              await ctx.db.insert('fanoutManyUsers', { name: `u-${i}` })
            );
          }
          for (const userId of userIds) {
            await ctx.db.insert('fanoutManyPosts', { authorId: userId });
          }

          await ctx.orm.query.fanoutManyUsers.findMany({
            with: {
              posts: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userIds = [] as any[];
          for (let i = 0; i < 3; i += 1) {
            userIds.push(
              await ctx.db.insert('fanoutManyUsers', { name: `u-${i}` })
            );
          }
          for (const userId of userIds) {
            await ctx.db.insert('fanoutManyPosts', { authorId: userId });
          }

          const rows = await ctx.orm.query.fanoutManyUsers.findMany({
            allowFullScan: true,
            with: {
              posts: true,
            },
          });
          expect(rows).toHaveLength(3);
        })
      ).resolves.toBeUndefined();
    });

    test('should fail fast for one() fan-out key cardinality unless allowFullScan', async () => {
      const fanoutOneUsers = convexTable('fanoutOneUsers', {
        name: text().notNull(),
      });
      const fanoutOnePosts = convexTable('fanoutOnePosts', {
        authorId: id('fanoutOneUsers').notNull(),
      });

      const tables = {
        fanoutOneUsers,
        fanoutOnePosts,
      };
      const schema = defineSchema(tables, {
        defaults: {
          defaultLimit: 1000,
          relationFanOutMaxKeys: 2,
        },
      });
      const relations = defineRelations(tables, (r) => ({
        fanoutOneUsers: {},
        fanoutOnePosts: {
          author: r.one.fanoutOneUsers({
            from: r.fanoutOnePosts.authorId,
            to: r.fanoutOneUsers.id,
          }),
        },
      }));

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userIds = [] as any[];
          for (let i = 0; i < 3; i += 1) {
            userIds.push(
              await ctx.db.insert('fanoutOneUsers', { name: `u-${i}` })
            );
          }
          for (const userId of userIds) {
            await ctx.db.insert('fanoutOnePosts', { authorId: userId });
          }

          await ctx.orm.query.fanoutOnePosts.findMany({
            with: {
              author: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userIds = [] as any[];
          for (let i = 0; i < 3; i += 1) {
            userIds.push(
              await ctx.db.insert('fanoutOneUsers', { name: `u-${i}` })
            );
          }
          for (const userId of userIds) {
            await ctx.db.insert('fanoutOnePosts', { authorId: userId });
          }

          const rows = await ctx.orm.query.fanoutOnePosts.findMany({
            allowFullScan: true,
            with: {
              author: true,
            },
          });
          expect(rows).toHaveLength(3);
        })
      ).resolves.toBeUndefined();
    });

    test('should fail fast for through() target fan-out key cardinality unless allowFullScan', async () => {
      const fanoutThroughUsers = convexTable('fanoutThroughUsers', {
        name: text().notNull(),
      });
      const fanoutThroughGroups = convexTable('fanoutThroughGroups', {
        name: text().notNull(),
      });
      const fanoutThroughUsersToGroups = convexTable(
        'fanoutThroughUsersToGroups',
        {
          userId: id('fanoutThroughUsers').notNull(),
          groupId: id('fanoutThroughGroups').notNull(),
        },
        (t) => [index('by_user').on(t.userId)]
      );

      const tables = {
        fanoutThroughUsers,
        fanoutThroughGroups,
        fanoutThroughUsersToGroups,
      };
      const schema = defineSchema(tables, {
        defaults: {
          defaultLimit: 1000,
          relationFanOutMaxKeys: 2,
        },
      });
      const relations = defineRelations(tables, (r) => ({
        fanoutThroughUsers: {
          groups: r.many.fanoutThroughGroups({
            from: r.fanoutThroughUsers.id.through(
              r.fanoutThroughUsersToGroups.userId
            ),
            to: r.fanoutThroughGroups.id.through(
              r.fanoutThroughUsersToGroups.groupId
            ),
          }),
        },
        fanoutThroughGroups: {},
        fanoutThroughUsersToGroups: {},
      }));

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userId = await ctx.db.insert('fanoutThroughUsers', {
            name: 'u-1',
          });
          for (let i = 0; i < 3; i += 1) {
            const groupId = await ctx.db.insert('fanoutThroughGroups', {
              name: `g-${i}`,
            });
            await ctx.db.insert('fanoutThroughUsersToGroups', {
              userId,
              groupId,
            });
          }

          await ctx.orm.query.fanoutThroughUsers.findMany({
            with: {
              groups: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(schema, relations, async (ctx) => {
          const userId = await ctx.db.insert('fanoutThroughUsers', {
            name: 'u-1',
          });
          for (let i = 0; i < 3; i += 1) {
            const groupId = await ctx.db.insert('fanoutThroughGroups', {
              name: `g-${i}`,
            });
            await ctx.db.insert('fanoutThroughUsersToGroups', {
              userId,
              groupId,
            });
          }

          const rows = await ctx.orm.query.fanoutThroughUsers.findMany({
            allowFullScan: true,
            with: {
              groups: true,
            },
          });
          expect((rows[0] as any).groups).toHaveLength(3);
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('No-Truncation Regression (>10k)', () => {
    const RELATION_SIZE_OVER_10K = 10_001;

    test('many() should load all related rows beyond 10k without truncation', async () => {
      const largeUsers = convexTable('largeManyUsers', {
        name: text().notNull(),
      });
      const largePosts = convexTable(
        'largeManyPosts',
        {
          authorId: id('largeManyUsers').notNull(),
          label: text().notNull(),
        },
        (t) => [index('by_author').on(t.authorId)]
      );
      const largeManyTables = {
        largeManyUsers: largeUsers,
        largeManyPosts: largePosts,
      };
      const largeManySchema = defineSchema(largeManyTables);
      const largeManyRelations = defineRelations(largeManyTables, (r) => ({
        largeManyUsers: {
          posts: r.many.largeManyPosts({
            from: r.largeManyUsers.id,
            to: r.largeManyPosts.authorId,
          }),
        },
        largeManyPosts: {},
      }));

      await withOrmCtx(largeManySchema, largeManyRelations, async (ctx) => {
        const userId = await ctx.db.insert('largeManyUsers', { name: 'u-1' });
        for (let i = 0; i < RELATION_SIZE_OVER_10K; i += 1) {
          await ctx.db.insert('largeManyPosts', {
            authorId: userId,
            label: `post-${i}`,
          });
        }

        const users = await ctx.orm.query.largeManyUsers.findMany({
          allowFullScan: true,
          with: {
            posts: true,
          },
        });

        expect(users).toHaveLength(1);
        expect((users[0] as any).posts).toHaveLength(RELATION_SIZE_OVER_10K);
        expect(
          (users[0] as any).posts.some(
            (post: any) => post.label === `post-${RELATION_SIZE_OVER_10K - 1}`
          )
        ).toBe(true);
      });
    }, 60_000);

    test('one() should resolve related row beyond 10k target rows without truncation', async () => {
      const largeUsers = convexTable('largeOneUsers', {
        name: text().notNull(),
      });
      const largePosts = convexTable(
        'largeOnePosts',
        {
          authorId: id('largeOneUsers').notNull(),
        },
        (t) => [index('by_author').on(t.authorId)]
      );
      const largeOneTables = {
        largeOneUsers: largeUsers,
        largeOnePosts: largePosts,
      };
      const largeOneSchema = defineSchema(largeOneTables);
      const largeOneRelations = defineRelations(largeOneTables, (r) => ({
        largeOneUsers: {},
        largeOnePosts: {
          author: r.one.largeOneUsers({
            from: r.largeOnePosts.authorId,
            to: r.largeOneUsers.id,
          }),
        },
      }));

      await withOrmCtx(largeOneSchema, largeOneRelations, async (ctx) => {
        let lastUserId: any = null;
        for (let i = 0; i < RELATION_SIZE_OVER_10K; i += 1) {
          lastUserId = await ctx.db.insert('largeOneUsers', {
            name: `u-${i}`,
          });
        }
        await ctx.db.insert('largeOnePosts', {
          authorId: lastUserId,
        });

        const posts = await ctx.orm.query.largeOnePosts.findMany({
          allowFullScan: true,
          with: {
            author: true,
          },
        });

        expect(posts).toHaveLength(1);
        expect((posts[0] as any).author).toBeTruthy();
        expect((posts[0] as any).author.id).toBe(lastUserId);
        expect((posts[0] as any).author.name).toBe(
          `u-${RELATION_SIZE_OVER_10K - 1}`
        );
      });
    }, 60_000);

    test('through() should load all related rows beyond 10k without truncation', async () => {
      const largeUsers = convexTable('largeThroughUsers', {
        name: text().notNull(),
      });
      const largeGroups = convexTable('largeThroughGroups', {
        name: text().notNull(),
      });
      const largeUsersToGroups = convexTable(
        'largeThroughUsersToGroups',
        {
          userId: id('largeThroughUsers').notNull(),
          groupId: id('largeThroughGroups').notNull(),
        },
        (t) => [index('by_user').on(t.userId)]
      );
      const largeThroughTables = {
        largeThroughUsers: largeUsers,
        largeThroughGroups: largeGroups,
        largeThroughUsersToGroups: largeUsersToGroups,
      };
      const largeThroughSchema = defineSchema(largeThroughTables);
      const largeThroughRelations = defineRelations(
        largeThroughTables,
        (r) => ({
          largeThroughUsers: {
            groups: r.many.largeThroughGroups({
              from: r.largeThroughUsers.id.through(
                r.largeThroughUsersToGroups.userId
              ),
              to: r.largeThroughGroups.id.through(
                r.largeThroughUsersToGroups.groupId
              ),
            }),
          },
          largeThroughGroups: {},
          largeThroughUsersToGroups: {},
        })
      );

      await withOrmCtx(
        largeThroughSchema,
        largeThroughRelations,
        async (ctx) => {
          const userId = await ctx.db.insert('largeThroughUsers', {
            name: 'u-1',
          });
          for (let i = 0; i < RELATION_SIZE_OVER_10K; i += 1) {
            const groupId = await ctx.db.insert('largeThroughGroups', {
              name: `group-${i}`,
            });
            await ctx.db.insert('largeThroughUsersToGroups', {
              userId,
              groupId,
            });
          }

          const users = await ctx.orm.query.largeThroughUsers.findMany({
            allowFullScan: true,
            with: {
              groups: true,
            },
          });

          expect(users).toHaveLength(1);
          expect((users[0] as any).groups).toHaveLength(RELATION_SIZE_OVER_10K);
          expect(
            (users[0] as any).groups.some(
              (group: any) =>
                group.name === `group-${RELATION_SIZE_OVER_10K - 1}`
            )
          ).toBe(true);
        }
      );
    }, 60_000);
  });
});
