/**
 * Read counting harness - `countDocumentReads`
 *
 * The counter exists so read bounds can fail when an index-backed plan degrades
 * into a scan. It only does that if it can see documents Convex read and threw
 * away: a `.filter()` rejects rows after the read is paid for, and those rows
 * never reach `collect()`, `take()`, or the async iterator. `documents` counts
 * what came back, `scanned` counts what it cost.
 */

import { test as baseTest, describe, expect } from 'vitest';
import schema from '../schema';
import {
  convexTest,
  countDocumentReads,
  runCtx,
  type TestCtx,
} from '../setup.testing';

const test = baseTest.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

const TABLE_SIZE = 300;

/** `TABLE_SIZE` rows in one `by_status` bucket, named `u0`..`u299` in order. */
const seedBucket = async (ctx: TestCtx) => {
  for (let i = 0; i < TABLE_SIZE; i += 1) {
    await ctx.db.insert('users', {
      name: `u${i}`,
      email: `u${i}@example.com`,
      status: 'bucket',
    });
  }
};

describe('countDocumentReads: rows rejected by .filter()', () => {
  test('collect under a filter pays for the whole range', async ({ ctx }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))
      .collect();

    expect(rows).toHaveLength(1);
    expect(reads.documents).toBe(1);
    // The other 299 rows were read and discarded by the predicate.
    expect(reads.scanned).toBe(TABLE_SIZE);
  });

  test('take stops at the last match instead of draining the range', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))
      .take(1);

    expect(rows).toHaveLength(1);
    expect(reads.documents).toBe(1);
    // `u5` is the sixth row in index order, and `take(1)` is satisfied there.
    expect(reads.scanned).toBe(6);
  });

  test('take that never fills its budget drains the range', async ({ ctx }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))
      .take(2);

    expect(rows).toHaveLength(1);
    expect(reads.documents).toBe(1);
    // Only one row matches, so the second slot is chased to the end.
    expect(reads.scanned).toBe(TABLE_SIZE);
  });

  test('first stops at its match', async ({ ctx }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const row = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))
      .first();

    expect(row?.name).toBe('u5');
    expect(reads.documents).toBe(1);
    expect(reads.scanned).toBe(6);
  });

  test('unique proves the match is alone by reading the rest', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const row = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))
      .unique();

    expect(row?.name).toBe('u5');
    expect(reads.documents).toBe(1);
    // A second match would have made this ambiguous, so the range is drained.
    expect(reads.scanned).toBe(TABLE_SIZE);
  });

  test('a filtered async iterator charges for the rows it skipped', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const names: string[] = [];
    for await (const row of ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u5'))) {
      names.push(row.name);
      break;
    }

    expect(names).toEqual(['u5']);
    expect(reads.documents).toBe(1);
    // Abandoning the loop stops the read where the consumer stopped.
    expect(reads.scanned).toBe(6);
  });

  test('a filtered iterator run to done stops on a satisfied limit', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const names: string[] = [];
    // `.limit()` is what `take()` pushes into the plan, so an iterator that
    // reaches `done` because the limit was met must not be charged for the
    // rest of the range.
    const query = ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) =>
        q.or(q.eq(q.field('name'), 'u2'), q.eq(q.field('name'), 'u7'))
      ) as any;
    for await (const row of query.limit(1)) {
      names.push(row.name);
    }

    expect(names).toEqual(['u2']);
    expect(reads.documents).toBe(1);
    expect(reads.scanned).toBe(3);
  });

  test('a filtered page charges for the walk, not the page', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const page = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) =>
        q.or(q.eq(q.field('name'), 'u10'), q.eq(q.field('name'), 'u20'))
      )
      .paginate({ cursor: null, numItems: 2 });

    expect(page.page.map((row) => row.name)).toEqual(['u10', 'u20']);
    expect(reads.documents).toBe(2);
    // Twenty one rows had to be read to fill a two row page.
    expect(reads.scanned).toBe(21);
  });
});

describe('countDocumentReads: paths with nothing hidden', () => {
  test('an unfiltered range costs exactly what it returns', async ({ ctx }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .take(5);

    expect(rows).toHaveLength(5);
    expect(reads.documents).toBe(5);
    expect(reads.scanned).toBe(5);
  });

  test('db.get costs one document', async ({ ctx }) => {
    const id = await ctx.db.insert('users', {
      name: 'solo',
      email: 'solo@example.com',
    });

    const reads = countDocumentReads(ctx);
    await ctx.db.get(id);

    expect(reads.documents).toBe(1);
    expect(reads.scanned).toBe(1);
  });

  test('a JavaScript stream filter is already fully visible', async ({
    ctx,
  }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.users.withIndex('by_name').findMany({
      where: { name: { endsWith: '5' } },
    });

    expect(rows.length).toBeGreaterThan(0);
    // `endsWith` cannot ride a Convex filter, so it runs in JavaScript over a
    // stream: every candidate row is pulled through the iterator and was
    // already visible before scan accounting existed.
    expect(reads.scanned).toBe(TABLE_SIZE);
    expect(reads.documents).toBe(TABLE_SIZE);
  });
});

describe('countDocumentReads: plan degradation is now assertable', () => {
  test('an OR across two indexed fields is billed for the table it scans', async ({
    ctx,
  }) => {
    for (let i = 0; i < TABLE_SIZE; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: 'filler',
        age: 1,
      });
    }
    await ctx.db.insert('users', {
      name: 'by-status',
      email: 'by-status@example.com',
      status: 'zmatch',
      age: 1,
    });
    await ctx.db.insert('users', {
      name: 'by-age',
      email: 'by-age@example.com',
      status: 'filler',
      age: 99,
    });

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.users.findMany({
      allowFullScan: true,
      where: { OR: [{ status: 'zmatch' }, { age: 99 }] },
    });

    expect(rows).toHaveLength(2);
    // No single index serves both arms, so the plan walks the whole table.
    // `documents` reports two and hides that entirely; `scanned` is what a
    // deployment would be charged and what a read bound has to assert on.
    expect(reads.documents).toBe(2);
    expect(reads.scanned).toBe(TABLE_SIZE + 2);
  });

  test('the same shape on one index reads only its bucket', async ({ ctx }) => {
    for (let i = 0; i < TABLE_SIZE; i += 1) {
      await ctx.db.insert('users', {
        name: `u${i}`,
        email: `u${i}@example.com`,
        status: 'filler',
      });
    }
    await ctx.db.insert('users', {
      name: 'a',
      email: 'a@example.com',
      status: 'zmatch',
    });
    await ctx.db.insert('users', {
      name: 'b',
      email: 'b@example.com',
      status: 'ymatch',
    });

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.users.findMany({
      where: { OR: [{ status: 'zmatch' }, { status: 'ymatch' }] },
    });

    expect(rows).toHaveLength(2);
    expect(reads.scanned).toBeLessThanOrEqual(4);
  });

  test('scanned is never smaller than documents', async ({ ctx }) => {
    await seedBucket(ctx);

    const reads = countDocumentReads(ctx);
    await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'bucket'))
      .filter((q) => q.eq(q.field('name'), 'u9'))
      .collect();
    await ctx.db.query('users').take(3);
    await ctx.orm.query.users.findMany({
      where: { status: 'bucket' },
      limit: 2,
    });

    expect(reads.scanned).toBeGreaterThanOrEqual(reads.documents);
  });
});
