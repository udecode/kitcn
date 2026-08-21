import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  id,
  text,
} from '.';

const teams = convexTable('rw_teams', {
  name: text().notNull(),
});

const members = convexTable('rw_members', {
  name: text().notNull(),
  teamId: id('rw_teams')
    .references(() => teams.id)
    .notNull(),
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
  },
}));

const orm = createOrm({ schema: relations });

type Counts = { get: number; query: number };

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
        return value.apply(target, args);
      };
    },
  });

const MEMBERS_PER_TEAM = 25;
const TEAM_A_MEMBER_RE = /^a-/;

const seed = async (ctx: any) => {
  const first = (await ctx.db.insert('rw_teams', { name: 'Alpha' })) as string;
  const second = (await ctx.db.insert('rw_teams', { name: 'Beta' })) as string;
  for (let index = 0; index < MEMBERS_PER_TEAM; index++) {
    await ctx.db.insert('rw_members', {
      name: `a-${index}`,
      teamId: first,
    });
    await ctx.db.insert('rw_members', {
      name: `b-${index}`,
      teamId: second,
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

      const counts: Counts = { get: 0, query: 0 };
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

      const counts: Counts = { get: 0, query: 0 };
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
