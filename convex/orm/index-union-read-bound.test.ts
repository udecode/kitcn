/**
 * Non-paginated index-union (multi-probe) reads keep their `take()` bound.
 *
 * A probe union that has to run RLS, a relation `where`, or a residual filter
 * in JavaScript cannot size a plain `take()` — that one counts scanned rows,
 * and the survivors are decided afterwards. Sizing by survivors is what makes
 * the bound hold, and every test here measures `reads.scanned` at two table
 * sizes so a bound that silently tracks table size fails instead of passing
 * with a generous constant.
 *
 * The order tests are the other half: a probe may only be truncated when its
 * own scan order is the requested order, and the union has to be re-sorted
 * before it is sliced. They pin the pages a globally-ordered read cannot
 * produce.
 */

import {
  convexTable,
  defineRelations,
  defineSchema,
  eq,
  id,
  index,
  integer,
  rlsPolicy,
  text,
} from 'kitcn/orm';
import { expect, test } from 'vitest';
import { convexTest, countDocumentReads, withOrm } from '../setup.testing';

const owners = convexTable('bound_owners', {
  name: text().notNull(),
  tier: text().notNull(),
});

/**
 * Every row is visible. The policy exists so `isRlsEnabled` is true and the
 * read has to prove its bound survives a post-fetch membership pass, not so it
 * hides anything — the tests that need hidden rows say so explicitly.
 */
const docs = convexTable(
  'bound_docs',
  {
    label: text().notNull(),
    visibility: text().notNull(),
    score: integer().notNull(),
    ownerId: id('bound_owners').notNull(),
  },
  (t) => [
    index('by_owner').on(t.ownerId),
    index('by_owner_score').on(t.ownerId, t.score),
    index('by_score').on(t.score),
    rlsPolicy('bound_docs_read', {
      for: 'select',
      using: () => eq(t.visibility, 'visible'),
    }),
  ]
);

/** Same shape, no policy: isolates the residual-filter leg from the RLS one. */
const openDocs = convexTable(
  'bound_open_docs',
  {
    label: text().notNull(),
    score: integer().notNull(),
    ownerId: id('bound_owners').notNull(),
  },
  (t) => [index('by_owner').on(t.ownerId), index('by_score').on(t.score)]
);

const tables = {
  bound_owners: owners,
  bound_docs: docs,
  bound_open_docs: openDocs,
};
const schema = defineSchema(tables);
const relations = defineRelations(tables, (r) => ({
  bound_owners: {},
  bound_docs: {
    owner: r.one.bound_owners({
      from: r.bound_docs.ownerId,
      to: r.bound_owners.id,
    }),
  },
  bound_open_docs: {
    owner: r.one.bound_owners({
      from: r.bound_open_docs.ownerId,
      to: r.bound_owners.id,
      alias: 'bound-open-docs-owner',
    }),
  },
}));

/**
 * A second schema with a low `relationFanOutMaxKeys`, so the relation fan-out
 * guard is reachable in a small fixture.
 */
const cappedOwners = convexTable('capped_owners', {
  name: text().notNull(),
  tier: text().notNull(),
});
const cappedDocs = convexTable(
  'capped_docs',
  {
    label: text().notNull(),
    bucket: text().notNull(),
    ownerId: id('capped_owners').notNull(),
  },
  (t) => [index('by_bucket').on(t.bucket)]
);
const cappedTables = {
  capped_owners: cappedOwners,
  capped_docs: cappedDocs,
};
const cappedSchema = defineSchema(cappedTables, {
  defaults: { relationFanOutMaxKeys: 5 },
});
const cappedRelations = defineRelations(cappedTables, (r) => ({
  capped_owners: {},
  capped_docs: {
    owner: r.one.capped_owners({
      from: r.capped_docs.ownerId,
      to: r.capped_owners.id,
    }),
  },
}));

/** Table sizes a correct bound must be identical across. */
const SIZES = [200, 500] as const;

const labelFor = (index: number) => `label-${String(index).padStart(4, '0')}`;

type SeedOptions = {
  /** Rows before this index are hidden from the RLS policy. */
  hiddenPrefix?: number;
};

const seed = async (
  db: any,
  size: number,
  options: SeedOptions = {}
): Promise<[any, any]> => {
  const hiddenPrefix = options.hiddenPrefix ?? 0;
  const ownerA = await db.insert('bound_owners', { name: 'a', tier: 'paid' });
  const ownerB = await db.insert('bound_owners', { name: 'b', tier: 'paid' });

  for (let i = 0; i < size; i += 1) {
    const ownerId = i % 2 === 0 ? ownerA : ownerB;
    await db.insert('bound_docs', {
      label: labelFor(i),
      visibility: i < hiddenPrefix ? 'hidden' : 'visible',
      score: i,
      ownerId,
    });
    await db.insert('bound_open_docs', {
      label: labelFor(i),
      score: i,
      ownerId,
    });
  }

  return [ownerA, ownerB];
};

const rlsCtx = (baseCtx: any) =>
  withOrm(baseCtx, relations, { rls: { roleResolver: () => [] } });

/**
 * The bound both #442 legs must hold. Two probes of `limit: 3` can read at
 * most six rows; anything that tracks table size blows straight past it.
 */
const PROBE_BOUND = 6;

test('an index union under RLS keeps its limit bound as the table grows', async () => {
  const scans: number[] = [];

  for (const size of SIZES) {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const reads = countDocumentReads(baseCtx);
      const ctx = rlsCtx(baseCtx);
      const [ownerA, ownerB] = await seed(baseCtx.db, size);

      const before = reads.scanned;
      const rows = await ctx.orm.query.bound_docs
        .withIndex('by_owner')
        .findMany({
          where: { ownerId: { in: [ownerA, ownerB] } },
          limit: 3,
        });

      expect(rows).toHaveLength(3);
      scans.push(reads.scanned - before);
    });
  }

  // Enabling a security feature must not remove a read bound. Before the fix
  // both probes collected their whole range: 200 and 500.
  expect(scans).toEqual([PROBE_BOUND, PROBE_BOUND]);
});

test('an index union with a residual filter keeps its limit bound as the table grows', async () => {
  const scans: number[] = [];

  for (const size of SIZES) {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const reads = countDocumentReads(baseCtx);
      const ctx = withOrm(baseCtx, relations);
      const [ownerA, ownerB] = await seed(baseCtx.db, size);

      const before = reads.scanned;
      const rows = await ctx.orm.query.bound_open_docs
        .withIndex('by_owner')
        .findMany({
          // `contains` cannot be compiled into a Convex `.filter()`, so it runs
          // in JavaScript and a scanned-row `take()` would spend its whole
          // budget before the predicate ever sees a row.
          where: {
            ownerId: { in: [ownerA, ownerB] },
            label: { contains: 'label-' },
          },
          limit: 3,
        });

      expect(rows).toHaveLength(3);
      scans.push(reads.scanned - before);
    });
  }

  expect(scans).toEqual([PROBE_BOUND, PROBE_BOUND]);
});

test('the bound counts visible matches, not scanned rows', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = rlsCtx(baseCtx);
    const [ownerA, ownerB] = await seed(baseCtx.db, 200, { hiddenPrefix: 80 });

    const before = reads.scanned;
    const rows = await ctx.orm.query.bound_docs.withIndex('by_owner').findMany({
      where: { ownerId: { in: [ownerA, ownerB] } },
      orderBy: { createdAt: 'asc' },
      limit: 3,
    });

    // Eighty hidden rows sit in front of both probes. A `take(3)` sized on
    // scanned rows returns nothing here; sizing on survivors fills the page.
    expect(rows.map((row: any) => row.label)).toEqual([
      labelFor(80),
      labelFor(81),
      labelFor(82),
    ]);
    // Still bounded: it walks past the hidden prefix once per probe and stops,
    // rather than collecting all 200.
    expect(reads.scanned - before).toBeLessThanOrEqual(90);
  });
});

test('offset over an index union skips visible matches', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = rlsCtx(baseCtx);
    const [ownerA, ownerB] = await seed(baseCtx.db, 200, { hiddenPrefix: 80 });

    const rows = await ctx.orm.query.bound_docs.withIndex('by_owner').findMany({
      where: { ownerId: { in: [ownerA, ownerB] } },
      orderBy: { createdAt: 'asc' },
      offset: 4,
      limit: 3,
    });

    // Offset counts rows the policy let through, not rows the scan touched.
    expect(rows.map((row: any) => row.label)).toEqual([
      labelFor(84),
      labelFor(85),
      labelFor(86),
    ]);
  });
});

test('an index union under RLS assembles its page across probes', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = rlsCtx(baseCtx);
    const ownerA = await baseCtx.db.insert('bound_owners', {
      name: 'a',
      tier: 'paid',
    });
    const ownerB = await baseCtx.db.insert('bound_owners', {
      name: 'b',
      tier: 'paid',
    });

    for (const [ownerId, scores] of [
      [ownerA, [10, 20, 30]],
      [ownerB, [1, 2, 3]],
    ] as const) {
      for (const score of scores) {
        await baseCtx.db.insert('bound_docs', {
          label: `${ownerId === ownerA ? 'a' : 'b'}${score}`,
          visibility: 'visible',
          score,
          ownerId,
        });
      }
    }

    // The probes pin `ownerId`, so ascending owner with descending score is a
    // direction the union's own index order cannot emit. Each probe is still
    // read in the requested order *within itself*, and the union is sorted
    // before it is sliced.
    const rows = await ctx.orm.query.bound_docs
      .withIndex('by_owner_score')
      .findMany({
        where: { ownerId: { in: [ownerA, ownerB] } },
        orderBy: (docs: any, { asc, desc }: any) => [
          asc(docs.ownerId),
          desc(docs.score),
        ],
        limit: 4,
      });

    expect(rows.map((row: any) => row.label)).toEqual([
      'a30',
      'a20',
      'a10',
      'b3',
    ]);
  });
});

test('an index union with an order no index serves reads unbounded but correct', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = rlsCtx(baseCtx);
    const ownerA = await baseCtx.db.insert('bound_owners', {
      name: 'a',
      tier: 'paid',
    });
    const ownerB = await baseCtx.db.insert('bound_owners', {
      name: 'b',
      tier: 'paid',
    });

    // Labels run opposite to creation order, so a page taken in scan order and
    // never re-sorted would return the last three rows instead of the first.
    for (let i = 0; i < 40; i += 1) {
      await baseCtx.db.insert('bound_docs', {
        label: labelFor(39 - i),
        visibility: 'visible',
        score: i,
        ownerId: i % 2 === 0 ? ownerA : ownerB,
      });
    }

    const rows = await ctx.orm.query.bound_docs.withIndex('by_owner').findMany({
      // `by_owner` is (ownerId, _creationTime); no index emits `label` order,
      // so the sort runs in JavaScript and no probe may be truncated.
      where: { ownerId: { in: [ownerA, ownerB] } },
      orderBy: { label: 'asc' },
      limit: 3,
    });

    expect(rows.map((row: any) => row.label)).toEqual([
      labelFor(0),
      labelFor(1),
      labelFor(2),
    ]);
  });
});

test('overlapping range probes under RLS return distinct rows', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = rlsCtx(baseCtx);
    const ownerA = await baseCtx.db.insert('bound_owners', {
      name: 'a',
      tier: 'paid',
    });

    for (let i = 0; i < 10; i += 1) {
      await baseCtx.db.insert('bound_docs', {
        label: labelFor(i),
        visibility: 'visible',
        score: i,
        ownerId: ownerA,
      });
    }

    // `score < 8 OR score > 3` compiles to two probe ranges that overlap on
    // 4..7, so the same document is inside both. A page assembled without
    // de-duplicating them is short and repeats rows.
    const rows = await ctx.orm.query.bound_docs.withIndex('by_score').findMany({
      where: { OR: [{ score: { lt: 8 } }, { score: { gt: 3 } }] },
      orderBy: { score: 'asc' },
      limit: 8,
    });

    expect(rows.map((row: any) => row.score)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(rows.map((row: any) => String(row.id))).size).toBe(8);
  });
});

test('an index union wider than the probe cap stays bounded under RLS', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = rlsCtx(baseCtx);
    const ownerIds: any[] = [];

    for (let owner = 0; owner < 65; owner += 1) {
      const ownerId = await baseCtx.db.insert('bound_owners', {
        name: `owner-${owner}`,
        tier: 'paid',
      });
      ownerIds.push(ownerId);
      for (let i = 0; i < 6; i += 1) {
        await baseCtx.db.insert('bound_docs', {
          label: `${owner}-${i}`,
          visibility: 'visible',
          score: i,
          ownerId,
        });
      }
    }

    const before = reads.scanned;
    const rows = await ctx.orm.query.bound_docs.withIndex('by_owner').findMany({
      where: { ownerId: { in: ownerIds } },
      limit: 2,
    });

    expect(rows).toHaveLength(2);
    // 65 probes exceed the merge cap, so this read can never become a merged
    // stream. Each probe is still bounded on its own: 65 x 2, not 65 x 6.
    expect(reads.scanned - before).toBeLessThanOrEqual(130);
  });
});

test('an index union filtered by a relation keeps the batch relation pass', async () => {
  const t = convexTest(cappedSchema);

  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, cappedRelations);

    // Forty distinct owners, none of them matching, against a cap of five. The
    // cap counts the distinct keys in one `_loadOneRelation` call, so it only
    // fires while the relation `where` is still evaluated as a batch. Read the
    // probes as streams instead and every call carries a single key, the cap can
    // never trip, and the relation is looked up once per scanned row.
    //
    // The bound is not worth retiring a guard that fails fast, so a relation
    // `where` deliberately stays on the collect-then-filter path. Restoring the
    // cap for a per-row caller needs an execution-scoped key ledger inside the
    // relation loader; until that exists, this assertion is what stops the
    // stream from being extended to this leg.
    for (let i = 0; i < 40; i += 1) {
      const ownerId = await baseCtx.db.insert('capped_owners', {
        name: `owner-${i}`,
        tier: 'free',
      });
      await baseCtx.db.insert('capped_docs', {
        label: labelFor(i),
        bucket: i % 2 === 0 ? 'a' : 'b',
        ownerId,
      });
    }

    await expect(
      ctx.orm.query.capped_docs.withIndex('by_bucket').findMany({
        where: { bucket: { in: ['a', 'b'] }, owner: { tier: 'paid' } },
        limit: 3,
      })
    ).rejects.toThrow(/relationFanOutMaxKeys/);
  });
});

test('an index union with no post-fetch pass keeps its plain take bound', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const reads = countDocumentReads(baseCtx);
    const ctx = withOrm(baseCtx, relations);
    const [ownerA, ownerB] = await seed(baseCtx.db, 200);

    const before = reads.scanned;
    const rows = await ctx.orm.query.bound_open_docs
      .withIndex('by_owner')
      .findMany({
        where: { ownerId: { in: [ownerA, ownerB] } },
        limit: 3,
      });

    expect(rows).toHaveLength(3);
    expect(reads.scanned - before).toEqual(PROBE_BOUND);
  });
});

test('an index union without a schema definition still returns the right page', async () => {
  const relaxedRelations = defineRelations(tables);
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    // `defineRelations(...)` alone carries no schema definition, so `stream()`
    // is unavailable and the read falls back to collecting each probe range.
    const ctx = withOrm(baseCtx, relaxedRelations, {
      rls: { roleResolver: () => [] },
    });
    const [ownerA, ownerB] = await seed(baseCtx.db, 40);

    const rows = await ctx.orm.query.bound_docs.withIndex('by_owner').findMany({
      where: { ownerId: { in: [ownerA, ownerB] } },
      orderBy: { createdAt: 'asc' },
      limit: 3,
    });

    expect(rows.map((row: any) => row.label)).toEqual([
      labelFor(0),
      labelFor(1),
      labelFor(2),
    ]);
  });
});
