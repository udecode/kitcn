import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  bytes,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  id,
  index,
  integer,
  text,
} from '.';

const teams = convexTable(
  'rw_teams',
  {
    name: text().notNull(),
    slug: text().notNull(),
    /** `JSON.stringify` renders every ArrayBuffer as `{}`. */
    token: bytes().notNull(),
    /** `JSON.stringify` renders NaN and +/-Infinity as `null`. */
    score: integer().notNull(),
  },
  (t) => [
    index('rw_teams_by_slug').on(t.slug),
    index('rw_teams_by_token').on(t.token),
    index('rw_teams_by_score').on(t.score),
  ]
);

const members = convexTable('rw_members', {
  name: text().notNull(),
  teamId: id('rw_teams')
    .references(() => teams.id)
    .notNull(),
  teamSlug: text().notNull(),
  teamToken: bytes().notNull(),
  teamScore: integer().notNull(),
});

const tables = { rw_teams: teams, rw_members: members };

/**
 * Must be kitcn's `defineSchema` on the same tables object: the residual filter
 * stream only engages when the schema definition metadata is attached, and
 * without it the relation `where` runs once over the whole row array and
 * de-duplicates by accident.
 */
const schema = defineSchema(tables);

const relations = defineRelations(schema, (r) => ({
  rw_members: {
    team: r.one.rw_teams({
      from: r.rw_members.teamId,
      to: r.rw_teams.id,
    }),
    // Same target table, joined on an indexed non-primary column. This is the
    // branch `_getById` never sees.
    teamBySlug: r.one.rw_teams({
      from: r.rw_members.teamSlug,
      to: r.rw_teams.slug,
    }),
    teamByToken: r.one.rw_teams({
      from: r.rw_members.teamToken,
      to: r.rw_teams.token,
    }),
    teamByScore: r.one.rw_teams({
      from: r.rw_members.teamScore,
      to: r.rw_teams.score,
    }),
  },
}));

const orm = createOrm({ schema: relations });

type Counts = {
  get: number;
  query: number;
  /** `query` calls split by table, so a target read is separable from the scan. */
  queryByTable: Record<string, number>;
};

const newCounts = (): Counts => ({ get: 0, query: 0, queryByTable: {} });

/**
 * Counts reads issued through the reader the ORM was handed. `Object.create`
 * puts the ORM's context carrier in front of this proxy, so the trap has to
 * answer prototype-chain lookups too.
 */
const countingDb = (db: any, counts: Counts) =>
  new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop !== 'get' && prop !== 'query') {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        counts[prop] += 1;
        if (prop === 'query' && typeof args[0] === 'string') {
          counts.queryByTable[args[0]] =
            (counts.queryByTable[args[0]] ?? 0) + 1;
        }
        return value.apply(target, args);
      };
    },
  });

const MEMBERS_PER_TEAM = 25;
const TEAM_A_MEMBER_RE = /^a-/;

const buffer = (...bytesIn: number[]) => new Uint8Array(bytesIn).buffer;

/** Distinct ArrayBuffers; `JSON.stringify` renders both as `{}`. */
const ALPHA_TOKEN = buffer(1, 2, 3);
const BETA_TOKEN = buffer(4, 5, 6);
/** Distinct float64s; `JSON.stringify` renders both as `null`. */
const ALPHA_SCORE = Number.NaN;
const BETA_SCORE = Number.POSITIVE_INFINITY;

const seed = async (ctx: any) => {
  const first = (await ctx.db.insert('rw_teams', {
    name: 'Alpha',
    slug: 'alpha',
    token: ALPHA_TOKEN,
    score: ALPHA_SCORE,
  })) as string;
  const second = (await ctx.db.insert('rw_teams', {
    name: 'Beta',
    slug: 'beta',
    token: BETA_TOKEN,
    score: BETA_SCORE,
  })) as string;
  for (let i = 0; i < MEMBERS_PER_TEAM; i++) {
    await ctx.db.insert('rw_members', {
      name: `a-${i}`,
      teamId: first,
      teamSlug: 'alpha',
      teamToken: ALPHA_TOKEN,
      teamScore: ALPHA_SCORE,
    });
    await ctx.db.insert('rw_members', {
      name: `b-${i}`,
      teamId: second,
      teamSlug: 'beta',
      teamToken: BETA_TOKEN,
      teamScore: BETA_SCORE,
    });
  }
  return { first, second };
};

describe('relation `where` target read amplification', () => {
  /**
   * A relation `where` never compiles into the index plan, so it runs as a
   * membership predicate over a residual stream, one row at a time. A team name
   * nothing matches forces the scan to run to the end, which pins the pre-fix
   * cost at one read per scanned row.
   */
  test('a non-matching relation `where` reads each target once, not once per row', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);

      const counts = newCounts();
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.rw_members.findMany({
        where: { team: { name: 'Nope' } },
        limit: 10,
      });

      expect(rows).toHaveLength(0);
      // Two teams exist, so two target documents can be read.
      expect(counts.get).toBeLessThanOrEqual(2);
    });
  });

  test('a matching relation `where` still returns the right rows', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);

      const counts = newCounts();
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.rw_members.findMany({
        where: { team: { name: 'Alpha' } },
        limit: 10,
      });

      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.name).toMatch(TEAM_A_MEMBER_RE);
      }
      expect(counts.get).toBeLessThanOrEqual(2);
    });
  });

  /**
   * `_getById` never sees this join, so its memo cannot cover it. The read is a
   * `db.query('rw_teams')` per drain instead, which is why the assertion counts
   * queries against the target table rather than `get`.
   */
  test('a non-matching relation `where` on a non-`_id` join reads each target once', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);

      const counts = newCounts();
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.rw_members.findMany({
        where: { teamBySlug: { name: 'Nope' } },
        limit: 10,
      });

      expect(rows).toHaveLength(0);
      expect(counts.get).toBe(0);
      // Two slugs exist, so two target lookups can be issued.
      expect(counts.queryByTable.rw_teams ?? 0).toBeLessThanOrEqual(2);
    });
  });

  test('a matching relation `where` on a non-`_id` join still returns the right rows', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);

      const counts = newCounts();
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.rw_members.findMany({
        where: { teamBySlug: { name: 'Alpha' } },
        limit: 10,
      });

      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.name).toMatch(TEAM_A_MEMBER_RE);
      }
      expect(counts.queryByTable.rw_teams ?? 0).toBeLessThanOrEqual(2);
    });
  });

  /**
   * The memo spans the whole execution, but the residual `where` hands the
   * relation loader one row at a time, so its own per-batch key map is a map of
   * one and cannot catch a collision. That makes the memo key the only thing
   * telling two join values apart, and `JSON.stringify` cannot: it renders every
   * ArrayBuffer as `{}` and NaN/Infinity as `null`. A lossy key would serve
   * Alpha's team to Beta's members.
   */
  test('a bytes join value is not confused with a different bytes join value', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const db = orm.db(ctx.db as any) as any;

      const rows = await db.query.rw_members.findMany({
        where: { teamByToken: { name: 'Alpha' } },
        limit: 50,
      });

      expect(rows).toHaveLength(MEMBERS_PER_TEAM);
      for (const row of rows) {
        expect(row.name).toMatch(TEAM_A_MEMBER_RE);
      }
    });
  });

  test('NaN and Infinity join values are not confused with each other', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const db = orm.db(ctx.db as any) as any;

      const rows = await db.query.rw_members.findMany({
        where: { teamByScore: { name: 'Alpha' } },
        limit: 50,
      });

      expect(rows).toHaveLength(MEMBERS_PER_TEAM);
      for (const row of rows) {
        expect(row.name).toMatch(TEAM_A_MEMBER_RE);
      }
    });
  });

  /**
   * The memo lives on the query instance, and `_forExecution` gives every run
   * its own, so a write between two awaits is still observed.
   */
  test('a non-`_id` target updated between two reads is not remembered', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const { first } = await seed(ctx);
      const db = orm.db(ctx.db as any) as any;

      const before = await db.query.rw_members.findMany({
        where: { teamBySlug: { name: 'Alpha' } },
        limit: 5,
      });
      expect(before).toHaveLength(5);

      await ctx.db.patch('rw_teams', first as any, { name: 'Renamed' });

      const after = await db.query.rw_members.findMany({
        where: { teamBySlug: { name: 'Alpha' } },
        limit: 5,
      });
      expect(after).toHaveLength(0);

      const renamed = await db.query.rw_members.findMany({
        where: { teamBySlug: { name: 'Renamed' } },
        limit: 5,
      });
      expect(renamed).toHaveLength(5);
    });
  });

  /**
   * The memo keys on the join values, not on the target document, so a second
   * relation reading a *different* slug must not be answered by the first one's
   * entry.
   */
  test('two non-`_id` targets are told apart', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const db = orm.db(ctx.db as any) as any;

      const rows = await db.query.rw_members.findMany({
        with: { teamBySlug: true },
        limit: 50,
      });

      expect(rows).toHaveLength(50);
      for (const row of rows) {
        expect(row.teamBySlug?.slug).toBe(row.teamSlug);
      }
    });
  });

  /**
   * The memo lives on the query instance, and `_forExecution` gives every run
   * its own, so a write between two awaits is still observed.
   */
  test('a target updated between two reads is not remembered', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const { first } = await seed(ctx);
      const db = orm.db(ctx.db as any) as any;

      const before = await db.query.rw_members.findMany({
        where: { team: { name: 'Alpha' } },
        limit: 5,
      });
      expect(before).toHaveLength(5);

      await ctx.db.patch('rw_teams', first as any, { name: 'Renamed' });

      const after = await db.query.rw_members.findMany({
        where: { team: { name: 'Alpha' } },
        limit: 5,
      });
      expect(after).toHaveLength(0);

      const renamed = await db.query.rw_members.findMany({
        where: { team: { name: 'Renamed' } },
        limit: 5,
      });
      expect(renamed).toHaveLength(5);
    });
  });
});
