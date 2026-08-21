/**
 * M4 Where Filtering - Comprehensive Test Suite
 *
 * Tests complete filtering functionality:
 * - Binary operators (eq, ne, gt, gte, lt, lte)
 * - Logical operators (and, or, not)
 * - Array operators (inArray, notInArray)
 * - Null operators (isNull, isNotNull)
 * - Index selection and scoring
 * - Filter splitting algorithm
 * - Convex query generation
 */

import { and, eq, inArray, notInArray, or } from 'kitcn/orm';
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
// Binary Operators
// ============================================================================

describe('M4 Where Filtering - Binary Operators', () => {
  test('should filter with eq operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { name: 'Alice' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with ne operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: { status: { ne: 'deleted' } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with gt operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 17,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { age: { gt: 18 } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('should filter with gte operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 20,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 21,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { age: { gte: 21 } },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie']);
  });

  test('should filter with lt operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 60,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { age: { lt: 65 } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with lte operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 99,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 100,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 101,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { age: { lte: 100 } },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  test('should filter with between operator (inclusive)', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 18,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 65,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'David',
      email: 'david@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { age: { between: [18, 65] } },
    });

    expect(result.map((u: any) => u.name).sort()).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);
  });

  test('should filter with notBetween operator (strict outside range)', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 18,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 65,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'David',
      email: 'david@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.withIndex('by_age').findMany({
      where: { age: { notBetween: [18, 65] } },
    });

    expect(result.map((u: any) => u.name).sort()).toEqual(['David']);
  });
});

// ============================================================================
// Logical Operators
// ============================================================================

describe('M4 Where Filtering - Logical Operators', () => {
  test('should combine filters with and operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: {
        status: 'active',
        age: { gt: 18 },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should combine filters with or operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: {
        status: { OR: ['active', 'pending'] },
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  test('should negate filter with not operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: {
        NOT: { status: 'deleted' },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should handle complex nested logical expressions', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: {
        OR: [{ status: 'active' }, { status: 'pending' }],
        age: { gt: 18, lt: 65 },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('supports filtering by non-leading compound index field without .withIndex()', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('posts', {
      text: 'post-a',
      numLikes: 10,
      type: 'news',
    });
    await ctx.db.insert('posts', {
      text: 'post-b',
      numLikes: 10,
      type: 'blog',
    });
    await ctx.db.insert('posts', {
      text: 'post-c',
      numLikes: 99,
      type: 'news',
    });

    const autoPlanned = await db.query.posts.findMany({
      where: { numLikes: 10 },
    });

    expect(autoPlanned).toHaveLength(2);
    expect(autoPlanned.map((post: any) => post.text).sort()).toEqual([
      'post-a',
      'post-b',
    ]);

    const result = await db.query.posts.withIndex('numLikesAndType').findMany({
      where: { numLikes: 10 },
    });

    expect(result).toHaveLength(2);
    expect(result.map((post: any) => post.text).sort()).toEqual([
      'post-a',
      'post-b',
    ]);
  });

  test('supports where spanning multiple single-field indexes without .withIndex()', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice+2@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });

    const autoPlanned = await db.query.users.findMany({
      where: { name: 'Alice', age: 25 },
    });

    expect(autoPlanned).toHaveLength(1);
    expect(autoPlanned[0].email).toBe('alice@example.com');

    const result = await db.query.users
      .withIndex('by_name', (q) => q.eq('name', 'Alice'))
      .findMany({
        where: { age: 25 },
      });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('alice@example.com');
  });

  test('supports callback where spanning multiple single-field indexes without .withIndex()', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice+2@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (users, { and, eq }) =>
        and(eq(users.name, 'Alice'), eq(users.age, 25)),
    });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('alice@example.com');
  });

  test('normalizes reversed AND equality clauses to valid compound index order', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('posts', {
      text: 'post-a',
      numLikes: 10,
      type: 'news',
    });
    await ctx.db.insert('posts', {
      text: 'post-b',
      numLikes: 10,
      type: 'blog',
    });
    await ctx.db.insert('posts', {
      text: 'post-c',
      numLikes: 50,
      type: 'news',
    });

    const result = await db.query.posts.findMany({
      where: {
        AND: [{ numLikes: 10 }, { type: 'news' }],
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('post-a');
  });

  test('should filter out undefined expressions in and()', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const condition = false;

    const result = await db.query.users
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .findMany({
        where: condition ? { age: 25 } : {},
      });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter out undefined expressions in or()', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const condition = false;

    const orFilters = [
      { status: 'active' },
      ...(condition ? [{ status: 'pending' }] : []),
    ];

    const result = await db.query.users.findMany({
      where: {
        OR: orFilters,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });
});

// ============================================================================
// Column-Level Logical Operators
// ============================================================================

describe('M4 Where Filtering - Column Logical Operators', () => {
  test('should apply OR within a single column filter', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 10,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.withIndex('by_age').findMany({
      where: {
        age: { OR: [{ lt: 18 }, { gt: 65 }] },
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);
  });

  test('should apply AND within a single column filter', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 10,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: {
        age: { AND: [{ gt: 18 }, { lt: 65 }] },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('should apply NOT within a single column filter', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 10,
      status: 'active',
      deletedAt: 123,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'active',
      deletedAt: 456,
    });

    const result = await db.query.users.withIndex('by_deleted_at').findMany({
      where: {
        deletedAt: { NOT: { isNull: true } },
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie']);
  });
});

// ============================================================================
// Array Operators
// ============================================================================

describe('M4 Where Filtering - Array Operators', () => {
  test('should filter with inArray operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: { status: { in: ['active', 'pending'] } },
    });

    expect(result).toHaveLength(2);
    expect(result.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  test('should filter with notInArray operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: { status: { notIn: ['deleted'] } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should return zero rows for inArray with empty array', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: { status: { in: [] } },
    });

    expect(result).toHaveLength(0);
  });

  test('should throw error for notInArray with empty array', () => {
    expect(() =>
      notInArray({ __brand: 'FieldReference', fieldName: 'status' } as any, [])
    ).toThrow('notInArray requires a non-empty array');
  });
});

// ============================================================================
// Null Operators
// ============================================================================

describe('M4 Where Filtering - Null Operators', () => {
  test('should filter with isNull operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: { deletedAt: { isNull: true } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('isNull matches rows whose column is absent, indexed or not', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    // Column omitted entirely: the normal state for a nullable column that was
    // never written. Convex stores this as a missing field, not as null.
    await ctx.db.insert('users', {
      name: 'Absent',
      email: 'absent@example.com',
      age: 25,
      status: 'active',
    });
    await ctx.db.insert('users', {
      name: 'ExplicitNull',
      email: 'null@example.com',
      age: 26,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Deleted',
      email: 'deleted@example.com',
      age: 27,
      status: 'deleted',
      deletedAt: 123_456,
    });

    const withoutIndex = await db.query.users.findMany({
      where: { deletedAt: { isNull: true } },
    });
    // `by_deleted_at` makes the compiler take the index path; both paths must agree.
    const withIndex = await db.query.users.withIndex('by_deleted_at').findMany({
      where: { deletedAt: { isNull: true } },
    });

    const names = (rows: { name: string }[]) =>
      rows.map((row) => row.name).sort();

    expect(names(withoutIndex)).toEqual(['Absent', 'ExplicitNull']);
    expect(names(withIndex)).toEqual(['Absent', 'ExplicitNull']);
  });

  test('should filter with isNotNull operator', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.withIndex('by_deleted_at').findMany({
      where: { deletedAt: { isNotNull: true } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });
});

// ============================================================================
// Pagination Fix
// ============================================================================

describe('M4 Where Filtering - Pagination', () => {
  // TODO M4.5: Convex doesn't have skip() - need cursor-based pagination
  test.skip('should use skip() before take() for offset', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 20,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'David',
      email: 'david@example.com',
      age: 35,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      limit: 2,
      offset: 2,
    });

    expect(result).toHaveLength(2);
    // Results should be 3rd and 4th users (Charlie and David)
    const names = result.map((u: any) => u.name).sort();
    expect(names).toEqual(['Charlie', 'David']);
  });

  test('should not apply offset when not provided', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      limit: 10,
    });

    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('M4 Where Filtering - Edge Cases', () => {
  test('should handle undefined where clause', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany();

    expect(result).toHaveLength(1);
  });

  test('should handle and() with no expressions', () => {
    const result = and();
    expect(result).toBeUndefined();
  });

  test('should handle and() with single expression', () => {
    const expr = eq(
      { __brand: 'FieldReference', fieldName: 'name' } as any,
      'Alice'
    );
    const result = and(expr);

    // Single expression should be returned as-is (optimization)
    expect(result).toBe(expr);
  });

  test('should handle or() with no expressions', () => {
    const result = or();
    expect(result).toBeUndefined();
  });

  test('should handle or() with single expression', () => {
    const expr = eq(
      { __brand: 'FieldReference', fieldName: 'name' } as any,
      'Alice'
    );
    const result = or(expr);

    // Single expression should be returned as-is (optimization)
    expect(result).toBe(expr);
  });

  test('should handle complex filter with all operator types', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: 123456,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'deleted',
      deletedAt: null,
    });

    const result = await db.query.users.withIndex('by_status').findMany({
      where: {
        status: { in: ['active', 'pending'] },
        OR: [{ age: { gt: 18 } }, { age: { lt: 65 } }],
        deletedAt: { isNotNull: true },
        name: 'Alice',
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should throw when RAW filter is provided', async ({ ctx }) => {
    const db = ctx.orm;

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    await expect(
      db.query.users.withIndex('by_name').findMany({
        where: {
          RAW: () => ({}) as any,
        },
      })
    ).rejects.toThrow('RAW filters are not supported');
  });
});

// ============================================================================
// Explicit withIndex() precedence
// ============================================================================

describe('M4 Where Filtering - explicit withIndex() precedence', () => {
  const seedTenants = async (ctx: TestCtx) => {
    const cityA = await ctx.db.insert('cities', { name: 'A' });
    const cityB = await ctx.db.insert('cities', { name: 'B' });
    await ctx.db.insert('users', {
      name: 'ua',
      email: 'ua@example.com',
      cityId: cityA,
      status: 'active',
      age: 40,
    });
    await ctx.db.insert('users', {
      name: 'ub',
      email: 'ub@example.com',
      cityId: cityB,
      status: 'active',
      age: 20,
    });
    return { cityA, cityB };
  };

  test('withIndex() range survives a where that compiles to another index', async ({
    ctx,
  }) => {
    const { cityA } = await seedTenants(ctx);

    const users = await ctx.orm.query.users
      .withIndex('by_city', (q) => q.eq('cityId', cityA))
      .findMany({ where: { status: 'active' }, limit: 50 });

    expect(users.map((user) => user.name)).toEqual(['ua']);
  });

  test('withIndex() range survives in the select() pipeline', async ({
    ctx,
  }) => {
    const { cityA } = await seedTenants(ctx);

    const users = await ctx.orm.query.users
      .withIndex('by_city', (q) => q.eq('cityId', cityA))
      .select()
      .where({ status: 'active' })
      .limit(50);

    expect(users.map((user) => user.name)).toEqual(['ua']);
  });

  test('withIndex() bounds survive an inequality where', async ({ ctx }) => {
    await seedTenants(ctx);

    const users = await ctx.orm.query.users
      .withIndex('by_age', (q) => q.gte('age', 30))
      .findMany({ where: { status: 'active' }, limit: 50 });

    expect(users.map((user) => user.name)).toEqual(['ua']);
  });

  test('withIndex() range survives cursor pagination with maxScan', async ({
    ctx,
  }) => {
    const { cityA } = await seedTenants(ctx);
    // Enough rows in the other city that a page built without the index range
    // would be filled from it.
    for (let i = 0; i < 10; i += 1) {
      await ctx.db.insert('users', {
        name: `other-${i}`,
        email: `other-${i}@example.com`,
        cityId: 'city_other',
        status: 'active',
      });
    }

    const page = await ctx.orm.query.users
      .withIndex('by_city', (q) => q.eq('cityId', cityA))
      .findMany({
        where: { status: 'active' },
        cursor: null,
        limit: 5,
        maxScan: 50,
      });

    expect(page.page.map((user) => user.name)).toEqual(['ua']);
  });

  test('withIndex() range survives cursor pagination with a residual filter', async ({
    ctx,
  }) => {
    const { cityA } = await seedTenants(ctx);
    for (let i = 0; i < 10; i += 1) {
      await ctx.db.insert('users', {
        name: `other-${i}`,
        email: `other-${i}@example.com`,
        cityId: 'city_other',
        status: 'active',
      });
    }

    const page = await ctx.orm.query.users
      .withIndex('by_city', (q) => q.eq('cityId', cityA))
      .findMany({
        where: { name: { like: 'u%' } },
        cursor: null,
        limit: 5,
        maxScan: 50,
      });

    expect(page.page.map((user) => user.name)).toEqual(['ua']);
  });

  test('withIndex() range wins over a where on the same index', async ({
    ctx,
  }) => {
    await ctx.db.insert('users', {
      name: 'active-user',
      email: 'active@example.com',
      status: 'active',
    });
    await ctx.db.insert('users', {
      name: 'pending-user',
      email: 'pending@example.com',
      status: 'pending',
    });

    const users = await ctx.orm.query.users
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .findMany({
        where: { status: { in: ['active', 'pending'] } },
        limit: 50,
      });

    expect(users.map((user) => user.name)).toEqual(['active-user']);
  });
});

// ============================================================================
// Type Safety
// ============================================================================

describe('M4 Where Filtering - Type Safety', () => {
  test('should provide typed column access in where clause', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    // TypeScript should allow accessing valid columns
    await db.query.users.findMany({
      where: { name: 'Alice' },
    });

    await db.query.users.findMany({
      where: { age: { gt: 18 } },
    });

    // TODO M4.5: Properly type column proxies for compile-time safety
    // Currently cols is Record<string, any> so invalid columns don't error at compile time
    // TypeScript should prevent accessing invalid columns (compile-time check)
    // TODO(M4.5): Uncomment when column proxy typing implemented
    // // @ts-expect-error - 'invalidColumn' does not exist
    // await db.query.users.findMany({
    //   allowFullScan: true,
    //   where: { invalidColumn: 'value' },
    // });
  });
});

// These bounds are only worth anything if a degraded plan blows through them,
// so the table is seeded far past every bound: a plan that falls back to a
// table scan reads three hundred documents and cannot squeeze under eight.
// `scanned`, not `documents`, is what makes that visible — a `.filter()` drops
// the rows it rejected before they reach any result.
const READ_BOUND_SEED = 300;

describe('M4: Read bounds', () => {
  test('in + limit reads a bounded window per probe', async ({ ctx }) => {
    for (let i = 0; i < READ_BOUND_SEED; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: i % 2 === 0 ? 'a' : 'b',
      });
    }

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.users.findMany({
      where: { status: { in: ['a', 'b'] } },
      limit: 2,
    });

    expect(rows).toHaveLength(2);
    // One bounded window per probe. A table scan would be three hundred.
    expect(reads.scanned).toBeLessThanOrEqual(8);
  });

  test('in under AND uses the index instead of scanning the table', async ({
    ctx,
  }) => {
    for (let i = 0; i < READ_BOUND_SEED; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: i >= READ_BOUND_SEED - 3 ? 'zmatch' : 'other',
      });
    }

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.users.findMany({
      where: { status: { in: ['zmatch'] }, name: { startsWith: 'u' } },
      limit: 2,
    });

    expect(rows).toHaveLength(2);
    // `startsWith` cannot ride the index, so the probe reads its whole bucket:
    // three rows. Scanning the table would be three hundred, and every one of
    // those two hundred and ninety seven rejects is a document Convex bills.
    expect(reads.scanned).toBeLessThanOrEqual(6);
  });
});
