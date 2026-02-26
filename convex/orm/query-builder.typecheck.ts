/* biome-ignore-all lint: compile-time type assertions only */

import type { TestCtx } from '../setup.testing';

declare const db: TestCtx['orm'];

void db.query.users
  .withIndex('by_name', (q) => q.eq('name', 'Alice'))
  .findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });

void db.query.users
  .withIndex('by_name', (q) => q.eq('name', 'Alice'))
  .findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });

void db.query.users.findMany({
  where: (users, { eq }) => eq(users.email, 'alice@example.com'),
});

void db.query.users.findMany({
  // @ts-expect-error row callback is removed; use where(table, ops) + ops.predicate(...)
  where: (row: { name: string }) => row.name === 'Alice',
});

void db.query.users.findMany({
  where: (users, { eq }) => eq(users.name, 'Alice'),
  // @ts-expect-error top-level index config is removed; use .withIndex(...)
  index: { name: 'by_name' },
});

void db.query.users.withIndex(
  'by_name',
  // @ts-expect-error by_name index range cannot use non-index field
  (q) => q.eq('email', 'alice@example.com')
);

void db.query.posts.withIndex('by_author').findMany({
  // @ts-expect-error withIndex cannot be combined with search mode
  search: { index: 'text_search', query: 'hello' },
});

void db.query.posts.withIndex('by_author').findMany({
  // @ts-expect-error withIndex cannot be combined with vectorSearch mode
  vectorSearch: {
    index: 'embedding_vec',
    vector: [0.1, 0.2, 0.3],
    limit: 3,
  },
});

void db.query.users.withIndex('by_name').findMany({
  where: (users, { eq }) => eq(users.name, 'Alice'),
  // @ts-expect-error withIndex cannot be combined with allowFullScan on reads
  allowFullScan: true,
});

void db.query.users.count();

void db.query.users.count({
  // @ts-expect-error users has no aggregateIndex fields; filtered count requires aggregateIndex
  where: {
    name: 'Alice',
  },
});

void db.query.users.count({
  // @ts-expect-error users has no aggregateIndex fields; filtered count requires aggregateIndex
  where: {
    age: { gte: 18, lt: 65 },
  },
});

void db.query.users.count({
  // @ts-expect-error users has no aggregateIndex fields; filtered count requires aggregateIndex
  where: { OR: [{ name: 'Alice' }] },
});

void db.query.users.count({
  // @ts-expect-error count() requires config object; put filters under where
  name: 'Alice',
});

void db.query.users.count({
  // @ts-expect-error count callback where is removed in v1
  where: (_users, { eq }) => eq(_users.name, 'Alice'),
});

void db.query.users.count({
  // @ts-expect-error count does not support limit
  limit: 1,
});

void db.query.users.count({
  orderBy: { name: 'asc' },
  take: 10,
  skip: 2,
});

void db.query.users.count({
  // @ts-expect-error users has no aggregateIndex fields; filtered count requires aggregateIndex
  where: {
    age: { gte: 18 },
  },
  orderBy: { age: 'asc' },
  cursor: {
    age: 21,
  },
});

void db.query.users.count({
  // @ts-expect-error count does not support with
  with: { posts: true },
});

void db.query.users.count({
  select: {
    _all: true,
    name: true,
  },
});

void db.query.users.aggregate({
  _count: true,
});

void db.query.users.aggregate({
  // @ts-expect-error users has no aggregateIndex fields; aggregate where requires aggregateIndex
  where: {
    name: { in: ['Alice', 'Bob'] },
  },
  _count: {
    _all: true,
    name: true,
  },
  _sum: {
    age: true,
  },
  _avg: {
    age: true,
  },
  _min: {
    name: true,
  },
  _max: {
    name: true,
  },
});

void db.query.users.findMany({
  with: {
    _count: {
      posts: true,
      comments: {
        // @ts-expect-error comments has no aggregateIndex fields; filtered relation _count requires aggregateIndex
        where: {
          text: 'hello',
        },
      },
    },
  },
});

void db.query.users.findMany({
  with: {
    _count: {
      comments: {
        // @ts-expect-error comments has no aggregateIndex fields; filtered relation _count requires aggregateIndex
        where: { OR: [{ text: 'hello' }] },
      },
    },
  },
});

void db.query.users.findMany({
  with: {
    _count: {
      // @ts-expect-error relation _count no longer supports select wrapper
      select: {
        posts: true,
      },
    },
  },
});

void db.query.users.count({
  // @ts-expect-error count callback where is removed in v1
  where: (_users, { eq }) => eq(_users.name, 'Alice'),
});

void db.query.users.count({ take: 1 });

void db.query.users.aggregate({
  // @ts-expect-error aggregate does not support callback where in v1
  where: (_users, { eq }) => eq(_users.name, 'Alice'),
  _count: true,
});

void db.query.users.aggregate({
  _count: true,
  orderBy: { age: 'asc' },
  cursor: { age: 18 },
  skip: 1,
  take: 10,
});

void db.query.users.groupBy({
  // @ts-expect-error users has no aggregateIndex fields; groupBy keys must be aggregateIndex fields
  by: 'name',
  // @ts-expect-error users has no aggregateIndex fields; groupBy where requires aggregateIndex
  where: {
    name: { in: ['Alice', 'Bob'] },
  },
  _count: true,
});

void db.query.users.groupBy({
  // @ts-expect-error users has no aggregateIndex fields; groupBy keys must be aggregateIndex fields
  by: ['name', 'age'],
  // @ts-expect-error users has no aggregateIndex fields; groupBy where requires aggregateIndex
  where: {
    name: 'Alice',
    age: 18,
  },
  _count: {
    _all: true,
    name: true,
  },
  _avg: {
    age: true,
  },
});

// @ts-expect-error groupBy requires by
void db.query.users.groupBy({ _count: true });

// @ts-expect-error aggregate does not support include/with
void db.query.users.aggregate({ with: { posts: true }, _count: true });

void db.query.users.findMany({
  // @ts-expect-error findMany({ distinct }) is unsupported; use select().distinct({ fields })
  distinct: ['status'],
  orderBy: { status: 'asc' },
  limit: 10,
});

// @ts-expect-error sum/min/max were removed in favor of aggregate(...)
void db.query.users.sum({
  field: 'age',
});

// @ts-expect-error sum/min/max were removed in favor of aggregate(...)
void db.query.users.min({
  field: 'name',
});

// @ts-expect-error sum/min/max were removed in favor of aggregate(...)
void db.query.users.max({
  field: 'name',
});
