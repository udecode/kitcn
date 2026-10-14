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

/**
 * An `in` list of `size` values that matches the same four rows whatever its
 * width. Everything past the two real statuses is a value no row carries, so
 * widening the list adds empty index ranges and nothing else — the read count
 * is allowed to stay flat as the probe count crosses the merge cap.
 */
const wideStatusList = (size: number) => [
  ...MATCHING_STATUSES,
  ...Array.from({ length: size - MATCHING_STATUSES.length }, (_, index) => {
    return `bucket-${index}`;
  }),
];

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

test('endCursor preserves the default cursor order for an index union', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const first: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        cursor: null,
        limit: 2,
      });

    const before = reads.documents;
    const pinned: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: [...MATCHING_STATUSES] } },
        cursor: null,
        endCursor: first.continueCursor,
        limit: 2,
      });

    expect(pinned.page.map((row: any) => row.name)).toEqual([
      'User 118',
      'User 001',
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

test('an index union wider than the probe cap needs no maxScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const wideList = Array.from(
      { length: 65 },
      (_, index) => `bucket-${index}`
    );

    const before = reads.scanned;
    const page: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: wideList } },
        cursor: null,
        limit: 2,
      });

    // No row carries any of these statuses, so every probe is an empty index
    // range and the whole page costs nothing. A budgeted scan would have had to
    // walk the table to learn the same thing.
    expect(page.page).toEqual([]);
    expect(page.isDone).toBe(true);
    expect(reads.scanned - before).toBe(0);
  });
});

test('a wide index union with endCursor needs no maxScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);
    const wide = wideStatusList(65);

    const first: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({ where: { status: { in: wide } }, cursor: null, limit: 2 });
    const pinned: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: wide } },
        cursor: null,
        endCursor: first.continueCursor,
        limit: 2,
      });

    // Pinning the end of the first page reproduces exactly that page.
    expect(pinned.page.map((row: any) => row.name)).toEqual(
      first.page.map((row: any) => row.name)
    );
    expect(pinned.page.map((row: any) => row.name)).toEqual([
      'User 118',
      'User 001',
    ]);
  });
});

test('a wide union still honours an explicit maxScan with endCursor', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);
    const wideList = [
      'active',
      ...Array.from({ length: 64 }, (_, index) => `bucket-${index}`),
    ];

    const first: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: wideList } },
        cursor: null,
        limit: 2,
        maxScan: TABLE_ROWS,
      });
    const pinned: any = await ctx.orm.query.users
      .withIndex('by_status')
      .findMany({
        where: { status: { in: wideList } },
        cursor: null,
        endCursor: first.continueCursor,
        limit: 2,
        maxScan: TABLE_ROWS,
      });

    expect(first.page.map((row: any) => row.name)).toEqual([
      'User 119',
      'User 000',
    ]);
    expect(pinned.page.map((row: any) => row.name)).toEqual([
      'User 119',
      'User 000',
    ]);
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

test('a wide index union stays index-bounded on the select() pipeline path', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.scanned;
    const names = await ctx.orm.query.users
      .select()
      .where({ status: { in: wideStatusList(65) } })
      .map((row: any) => row.name)
      .limit(4)
      .execute();

    // `by_status` ascending: 'active' before 'pending', oldest first inside a
    // probe. Creation order would interleave the two statuses instead.
    expect(names).toEqual(['User 000', 'User 119', 'User 001', 'User 118']);
    // The matches sit at both ends of creation order, so the scan this replaced
    // had to walk every row in the table to collect them.
    expect(reads.scanned - before).toBeLessThanOrEqual(8);
  });
});

test('a wide index union reads the same rows through select() and findMany', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);
    const wide = wideStatusList(65);

    const piped = await ctx.orm.query.users
      .select()
      .where({ status: { in: wide } })
      .map((row: any) => row.name)
      .limit(4)
      .execute();
    const rows = await ctx.orm.query.users.findMany({
      where: { status: { in: wide } },
      limit: 4,
    });

    expect(piped.slice().sort()).toEqual(
      rows.map((row: any) => row.name).sort()
    );
    expect(piped.slice().sort()).toEqual(expectedMatchNames());
  });
});

test('crossing the merge cap does not change the order rows come out in', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const readWidth = (size: number) =>
      ctx.orm.query.users
        .select()
        .where({ status: { in: wideStatusList(size) } })
        .map((row: any) => row.name)
        .limit(4)
        .execute();

    // 64 probes is the widest merged union; 65 is the first concatenated one.
    // Both walk the same index ranges, so both owe the same sequence.
    const merged = await readWidth(64);
    const concatenated = await readWidth(65);

    expect(merged).toEqual(['User 000', 'User 119', 'User 001', 'User 118']);
    expect(concatenated).toEqual(merged);
  });
});

test('a wide index union pages from its probes without maxScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);
    const wide = wideStatusList(65);

    const before = reads.scanned;
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: any = await ctx.orm.query.users
        .withIndex('by_status')
        .findMany({ where: { status: { in: wide } }, cursor, limit: 2 });
      seen.push(...result.page.map((row: any) => row.name));
      cursor = result.continueCursor;
      if (result.isDone) break;
    }

    expect(seen.slice().sort()).toEqual(expectedMatchNames());
    expect(new Set(seen).size).toBe(seen.length);
    expect(reads.scanned - before).toBeLessThanOrEqual(TABLE_ROWS / 2);
  });
});

test('a wide complement union stays index-bounded on the pipeline path', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    // 70 excluded values compile to 71 complement ranges, past the merge cap.
    // Only 'archived' hides real rows, so the answer is the four matches.
    const excluded = [
      'archived',
      ...Array.from({ length: 69 }, (_, index) => `bucket-${index}`),
    ];

    const before = reads.scanned;
    const names = await ctx.orm.query.users
      .select()
      .where({ status: { notIn: excluded } })
      .map((row: any) => row.name)
      .limit(4)
      .execute();

    expect(names.slice().sort()).toEqual(expectedMatchNames());
    expect(reads.scanned - before).toBeLessThanOrEqual(8);
  });
});

test('a wide index union whose order needs a merge keeps its scan budget', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    // Ordering by `createdAt` interleaves rows across probes, which only a
    // merged union can produce — and a merge that wide is the fan-out the cap
    // exists to refuse. Concatenation cannot stand in for it, so the read is
    // still a budgeted scan.
    await expect(
      ctx.orm.query.users.withIndex('by_status').findMany({
        where: { status: { in: wideStatusList(65) } },
        orderBy: { createdAt: 'desc' },
        cursor: null,
        limit: 2,
      })
    ).rejects.toThrow(/maxScan/i);
  });
});

test('a wide `in` beside a residual filter still compiles to its probes', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    await seedUsers(baseCtx.db);

    const before = reads.scanned;
    // An `in` beside another term compiles to an AND, and only the `in` is
    // indexable. Width is not a reason to give that up: the alternative is not
    // a cheaper union, it is the whole table.
    const page = await ctx.orm.query.users.withIndex('by_status').findMany({
      where: { status: { in: wideStatusList(65) }, name: { contains: '11' } },
      cursor: null,
      limit: 2,
      maxScan: TABLE_ROWS,
    });

    expect(page.page.map((row: any) => row.name).sort()).toEqual([
      'User 118',
      'User 119',
    ]);
    expect(reads.scanned - before).toBeLessThanOrEqual(8);
  });
});

test('an index union with a residual filter sizes the read by matches', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = await runCtx(baseCtx);
    // Every row carries the probed status, and the first one already satisfies
    // the residual. Collecting the probes before applying it would read the
    // whole population to answer a one-row page.
    for (let index = 0; index < 400; index += 1) {
      await baseCtx.db.insert('users', {
        name: `Dense ${String(index).padStart(3, '0')}`,
        email: `residual-${index}@example.com`,
        status: 'active',
      });
    }

    for (const width of [64, 65]) {
      const before = reads.scanned;
      const rows = await ctx.orm.query.users.withIndex('by_status').findMany({
        where: {
          status: { in: wideStatusList(width) },
          name: { contains: 'Dense' },
        },
        limit: 1,
      });

      expect(rows.map((row: any) => row.name)).toEqual(['Dense 000']);
      expect(reads.scanned - before).toBeLessThanOrEqual(4);
    }
  });
});

test('a bounded residual union still returns a true global top-k', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    // Statuses alternate, so any plan that truncates one probe before looking
    // at the other returns the wrong three rows.
    for (let index = 0; index < 40; index += 1) {
      await baseCtx.db.insert('users', {
        name: `Keep ${String(index).padStart(2, '0')}`,
        email: `topk-${index}@example.com`,
        status: index % 2 === 0 ? 'active' : 'pending',
      });
    }

    for (const width of [2, 64, 65]) {
      // An order the probed index serves: the union emits it directly, so the
      // read may stop at three matches.
      const served = await ctx.orm.query.users.withIndex('by_status').findMany({
        where: {
          status: { in: wideStatusList(width) },
          name: { contains: 'Keep' },
        },
        orderBy: { createdAt: 'desc' },
        limit: 3,
      });
      expect(served.map((row: any) => row.name)).toEqual([
        'Keep 39',
        'Keep 38',
        'Keep 37',
      ]);

      // An order it cannot serve: the top-k is only known after every match is
      // read, so this one keeps collecting and sorting.
      const unserved = await ctx.orm.query.users
        .withIndex('by_status')
        .findMany({
          where: {
            status: { in: wideStatusList(width) },
            name: { contains: 'Keep' },
          },
          orderBy: { name: 'asc' },
          limit: 3,
        });
      expect(unserved.map((row: any) => row.name)).toEqual([
        'Keep 00',
        'Keep 01',
        'Keep 02',
      ]);
    }
  });
});
