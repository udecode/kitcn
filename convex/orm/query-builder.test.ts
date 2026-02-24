/**
 * M3 Query Builder - Basic Functionality Tests
 *
 * Tests core query builder functionality:
 * - findMany() and findFirst() methods
 * - Type inference
 * - Promise-based execution
 * - Basic column selection
 */

import {
  convexTable,
  defineRelations,
  defineSchema,
  extractRelationsConfig,
  id,
  index,
  text,
} from 'better-convex/orm';
import { it as baseIt, describe, expect } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx, type TestCtx, withOrmCtx } from '../setup.testing';

// Test setup with convexTest
const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

describe('M3 Query Builder', () => {
  describe('Builder Creation', () => {
    it('should create query builders for tables', ({ ctx }) => {
      const db = ctx.orm;

      expect(db.query).toBeDefined();
      expect(db.query.users).toBeDefined();
      expect(typeof db.query.users.findMany).toBe('function');
      expect(typeof db.query.users.findFirst).toBe('function');
    });

    it('should require explicit index for predicate where', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      await expect(
        (db.query.users.findMany as any)({
          where: (_users: any, ops: any) =>
            ops.predicate((row: any) => row.name === 'Alice'),
        })
      ).rejects.toThrow(/withIndex/i);

      const rows = await db.query.users
        .withIndex('by_name', (q) => q.eq('name', 'Alice'))
        .findMany({
          where: (_users, { predicate }) =>
            predicate((row) => row.name === 'Alice'),
        });

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
    });

    it('should support callback where without explicit index', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = ctx.orm;
      const rows = await db.query.users.findMany({
        where: (users, { eq }) => eq(users.name, 'Alice'),
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
    });

    it('should support withIndex for predicate where without inline index config', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = ctx.orm;
      const rows = await db.query.users
        .withIndex('by_name', (q) => q.eq('name', 'Alice'))
        .findMany({
          where: (_users, { predicate }) =>
            predicate((row) => row.name === 'Alice'),
        });

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
    });
  });

  describe('findMany()', () => {
    it('should return QueryPromise instance', ({ ctx }) => {
      const db = ctx.orm;
      const query = db.query.users.findMany();

      expect(query).toBeDefined();
      expect(typeof query.then).toBe('function');
      expect(typeof query.catch).toBe('function');
      expect(typeof query.finally).toBe('function');
    });

    it('should execute query and return empty array', async ({ ctx }) => {
      const db = ctx.orm;
      const result = await db.query.users.findMany();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should execute query and return results', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('should require explicit sizing when schema has no defaultLimit', async () => {
      const localUsers = convexTable('localUsers', {
        name: text().notNull(),
      });
      const localTables = { localUsers };
      const localSchema = defineSchema(localTables);
      const localRelations = defineRelations(localTables);
      const localEdges = extractRelationsConfig(localRelations);

      await expect(
        withOrmCtx(localSchema, localRelations, async (ctx) => {
          await ctx.db.insert('localUsers', { name: 'Alice' });
          await ctx.orm.query.localUsers.findMany();
        })
      ).rejects.toThrow(/limit|paginate|allowFullScan|defaultLimit/i);
    });

    it('should allow unsized findMany when allowFullScan is true', async () => {
      const localUsers = convexTable('localUsers', {
        name: text().notNull(),
      });
      const localTables = { localUsers };
      const localSchema = defineSchema(localTables);
      const localRelations = defineRelations(localTables);
      const localEdges = extractRelationsConfig(localRelations);

      await withOrmCtx(localSchema, localRelations, async (ctx) => {
        await ctx.db.insert('localUsers', { name: 'Alice' });
        await ctx.db.insert('localUsers', { name: 'Bob' });
        const rows = await ctx.orm.query.localUsers.findMany({
          allowFullScan: true,
        });
        expect(rows).toHaveLength(2);
      });
    });

    it('should apply schema defaultLimit for unsized findMany', async () => {
      const localUsers = convexTable('localUsers', {
        name: text().notNull(),
      });
      const localTables = { localUsers };
      const localSchema = defineSchema(localTables, {
        defaults: { defaultLimit: 1 },
      });
      const localRelations = defineRelations(localTables);
      const localEdges = extractRelationsConfig(localRelations);

      await withOrmCtx(localSchema, localRelations, async (ctx) => {
        await ctx.db.insert('localUsers', { name: 'Alice' });
        await ctx.db.insert('localUsers', { name: 'Bob' });
        const rows = await ctx.orm.query.localUsers.findMany();
        expect(rows).toHaveLength(1);
      });
    });

    it('should fetch by id in list without allowFullScan (db.get fast path)', async () => {
      const localUsers = convexTable('localUsers', {
        name: text().notNull(),
      });
      const localTables = { localUsers };
      const localSchema = defineSchema(localTables);
      const localRelations = defineRelations(localTables);

      await withOrmCtx(localSchema, localRelations, async (ctx) => {
        const id1 = await ctx.db.insert('localUsers', { name: 'Alice' });
        const id2 = await ctx.db.insert('localUsers', { name: 'Bob' });

        const rows = await ctx.orm.query.localUsers.findMany({
          where: { id: { in: [id2, id1, id2] } },
        });

        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.id)).toEqual([id2, id1]);
      });
    });

    it('throws migration error when object where uses _id', async ({ ctx }) => {
      await expect(
        ctx.orm.query.users.findMany({
          where: { _id: 'bad' } as any,
        })
      ).rejects.toThrow('Use `id`');
    });

    it('throws migration error when object orderBy uses _id', async ({
      ctx,
    }) => {
      await expect(
        ctx.orm.query.users.findMany({
          orderBy: { _id: 'asc' } as any,
          limit: 1,
        })
      ).rejects.toThrow('Use `id`');
    });

    it('should require relation limit on nested many when no defaults and no allowFullScan', async () => {
      const localUsers = convexTable('localUsers', {
        name: text().notNull(),
      });
      const localPosts = convexTable(
        'localPosts',
        {
          userId: id('localUsers').notNull(),
          title: text().notNull(),
        },
        (t) => [index('by_user').on(t.userId)]
      );
      const localTables = { localUsers, localPosts };
      const localSchema = defineSchema(localTables);
      const localRelations = defineRelations(localTables, (r) => ({
        localUsers: {
          posts: r.many.localPosts({
            from: r.localUsers.id,
            to: r.localPosts.userId,
          }),
        },
        localPosts: {
          user: r.one.localUsers({
            from: r.localPosts.userId,
            to: r.localUsers.id,
          }),
        },
      }));
      const localEdges = extractRelationsConfig(localRelations);

      await expect(
        withOrmCtx(localSchema, localRelations, async (ctx) => {
          const userId = await ctx.db.insert('localUsers', { name: 'Alice' });
          await ctx.db.insert('localPosts', { userId, title: 'P1' });
          await ctx.db.insert('localPosts', { userId, title: 'P2' });
          await ctx.orm.query.localUsers.findMany({
            limit: 1,
            with: { posts: true },
          });
        })
      ).rejects.toThrow(/limit|allowFullScan|defaultLimit/i);
    });
  });

  describe('findFirst()', () => {
    it('should return first result', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findFirst();

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
    });

    it('should fetch by id without allowFullScan (db.get fast path)', async ({
      ctx,
    }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findFirst({
        where: { id: userId },
      });

      expect(result?.id).toBe(userId);
    });

    it('should return null for empty results', async ({ ctx }) => {
      const db = ctx.orm;
      const result = await db.query.users.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('findFirstOrThrow()', () => {
    it('should return first result', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findFirstOrThrow();

      expect(result).toBeDefined();
      expect(result.name).toBe('Alice');
    });

    it('should throw for empty results', async ({ ctx }) => {
      const db = ctx.orm;
      await expect(db.query.users.findFirstOrThrow()).rejects.toThrow(
        /could not find users/i
      );
    });
  });

  describe('Column Selection', () => {
    it('should select specific columns', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany({
        columns: { name: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('email');
    });

    it('should exclude columns when all selections are false', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany({
        columns: { email: false },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('email');
    });

    it('should return no table columns when columns is empty', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany({
        columns: {},
      });

      expect(result).toHaveLength(1);
      expect(Object.keys(result[0])).toHaveLength(0);
    });
  });

  describe('Extras', () => {
    it('should compute extras on results', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany({
        extras: {
          nameUpper: (row) => row.name.toUpperCase(),
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].nameUpper).toBe('ALICE');
    });

    it('should preserve extras when columns is empty', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const result = await db.query.users.findMany({
        columns: {},
        extras: {
          nameUpper: (row) => row.name.toUpperCase(),
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('nameUpper', 'ALICE');
      expect(Object.keys(result[0])).toEqual(['nameUpper']);
    });

    it('should compute extras from callback form', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      let calls = 0;
      const db = ctx.orm;
      const result = await db.query.users.findMany({
        extras: () => {
          calls += 1;
          return {
            emailDomain: (row) => row.email.split('@')[1],
          };
        },
      });

      expect(calls).toBe(1);
      expect(result).toHaveLength(1);
      expect(result[0].emailDomain).toBe('example.com');
    });
  });
});
