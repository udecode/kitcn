/**
 * Index-union (multi-probe) reads must stay index-bounded.
 *
 * `in`, `ne`, `notIn` and same-field equality `OR` compile to a set of index
 * probes. Every one of these tests seeds a table where the matches are a tiny
 * fraction of the rows, so a plan that walks the table instead of the probes
 * shows up as a read count that tracks table size.
 */

import { defineRelations, defineSchema } from 'kitcn/orm';
import { expect, test } from 'vitest';
import schema, { tables } from '../schema';
import {
  convexTest,
  countDocumentReads,
  runCtx,
  withOrm,
} from '../setup.testing';

/** Rows in the table. Only `MATCHING_STATUSES` rows are ever a match. */
const TABLE_ROWS = 120;
const MATCHING_STATUSES = ['active', 'pending'] as const;

/**
 * Matches sit at the two ends of creation order, so a `_creationTime` scan has
 * to walk the whole table to collect them all while an index union does not.
 *
 * The two statuses are interleaved on purpose: creation order over the matches
 * is `119, 118, 001, 000` descending, while `by_status` order is
 * `pending{118, 001}, active{119, 000}`. Any test that asserts a page can only
 * pass under one of them.
 */
const statusForRow = (index: number): string => {
  if (index === 0 || index === TABLE_ROWS - 1) return 'active';
  if (index === 1 || index === TABLE_ROWS - 2) return 'pending';
  return 'archived';
};

const seedUsers = async (db: any) => {
  for (let index = 0; index < TABLE_ROWS; index += 1) {
    await db.insert('users', {
      name: `User ${String(index).padStart(3, '0')}`,
      email: `index-union-${index}@example.com`,
      status: statusForRow(index),
    });
  }
};

const expectedMatchNames = () =>
  Array.from({ length: TABLE_ROWS }, (_, index) => index)
    .filter((index) =>
      (MATCHING_STATUSES as readonly string[]).includes(statusForRow(index))
    )
    .map((index) => `User ${String(index).padStart(3, '0')}`)
    .sort();

test('cursor pagination over an index union does not require maxScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.documents;
    const page = await ctx.orm.query.users.withIndex('by_status').findMany({
      where: { status: { in: [...MATCHING_STATUSES] } },
      cursor: null,
      limit: 2,
    });

    // Without an `orderBy` the read is in the order of the index it walks,
    // which for an index union is that union's index: `pending` before
    // `active`, newest first inside each probe.
    expect(page.page.map((row: any) => row.name)).toEqual([
      'User 118',
      'User 001',
    ]);
    // Two probes, two rows: a probe union reads a handful of rows. The scan
    // this replaced read every row in the table.
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('cursor walk over an index union returns every match exactly once', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: any = await ctx.orm.query.users
        .withIndex('by_status')
        .findMany({
          where: { status: { in: [...MATCHING_STATUSES] } },
          cursor,
          limit: 2,
        });
      seen.push(...result.page.map((row: any) => row.name));
      cursor = result.continueCursor;
      if (result.isDone) break;
    }

    expect(seen.slice().sort()).toEqual(expectedMatchNames());
    expect(new Set(seen).size).toBe(seen.length);
  });
});

test('cursor pagination over an index union honors orderBy createdAt', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.documents;
    const page = await ctx.orm.query.users.withIndex('by_status').findMany({
      where: { status: { in: [...MATCHING_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      cursor: null,
      limit: 3,
    });

    // Newest first across both probes, not probe-by-probe.
    expect(page.page.map((row: any) => row.name)).toEqual([
      'User 119',
      'User 118',
      'User 001',
    ]);
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('endCursor pagination over an index union stays index-bounded', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const first: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        cursor: null,
        limit: 2,
      });

    const before = reads.documents;
    const pinned: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        cursor: null,
        endCursor: first.continueCursor,
        limit: 2,
      });

    expect(pinned.page.map((row: any) => row.name)).toEqual([
      'User 119',
      'User 118',
    ]);
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('a residual post-filter over an index union stays index-bounded', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.documents;
    const page = await ctx.orm.query.users.withIndex('by_status').findMany({
      // `contains` is not index-compilable, so the plan keeps it as a residual
      // JavaScript filter over the probe union. A residual `where` still asks
      // for a scan budget at the type level; the probes make the read far
      // smaller than that budget.
      where: {
        status: { in: [...MATCHING_STATUSES] },
        name: { contains: '11' },
      },
      orderBy: { createdAt: 'desc' },
      cursor: null,
      limit: 2,
      maxScan: 50,
    });

    expect(page.page.map((row: any) => row.name)).toEqual([
      'User 119',
      'User 118',
    ]);
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('non-paginated limit over an index union stays index-bounded', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.documents;
    const rows = await ctx.orm.query.users.withIndex('by_status').findMany({
      where: { status: { in: [...MATCHING_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      limit: 2,
    });

    expect(rows.map((row: any) => row.name)).toEqual(['User 119', 'User 118']);
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('cursor pagination over a complement range union stays index-bounded', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.documents;
    // `ne` compiles to the two complement ranges around 'archived'. Ordering by
    // the probed field itself is the order those ranges already produce.
    const page = await ctx.orm.query.users.withIndex('by_status').findMany({
      where: { status: { ne: 'archived' } },
      orderBy: { status: 'asc' },
      cursor: null,
      limit: 2,
    });

    expect(page.page.map((row: any) => row.status)).toEqual([
      'active',
      'active',
    ]);
    expect(reads.documents - before).toBeLessThanOrEqual(6);
  });
});

test('an index union wider than the probe cap still needs maxScan under strict', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const wideList = Array.from(
      { length: 65 },
      (_, index) => `bucket-${index}`
    );

    await expect(
      ctx.orm.query.users.withIndex('by_status').findMany({
        where: { status: { in: wideList } },
        cursor: null,
        limit: 2,
      })
    ).rejects.toThrow(/maxScan/i);
  });
});

test('an index union that cannot serve the requested order still needs maxScan under strict', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    await expect(
      ctx.orm.query.users.withIndex('by_status').findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        // `by_status` is (status, _creationTime); a probe union can never emit
        // rows ordered by `name`.
        orderBy: { name: 'asc' },
        cursor: null,
        limit: 2,
      })
    ).rejects.toThrow();
  });
});

test('an index union without a schema definition still needs maxScan under strict', async () => {
  const relaxedTables = { ...tables };
  const relaxedRelations = defineRelations(relaxedTables);
  const relaxedSchema = defineSchema(relaxedTables);
  const t = convexTest(relaxedSchema);

  await t.run(async (baseCtx) => {
    // `defineRelations(...)` alone carries no schema definition, so `stream()`
    // is unavailable and the plan has to fall back to the bounded scan.
    const ctx = withOrm(baseCtx, relaxedRelations);
    await seedUsers(baseCtx.db);

    await expect(
      ctx.orm.query.users.withIndex('by_status').findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        cursor: null,
        limit: 2,
      })
    ).rejects.toThrow(/maxScan/i);
  });
});
