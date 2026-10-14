import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  id,
  index,
  text,
} from '.';

const teams = convexTable(
  'tm_teams',
  {
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [index('tm_teams_by_slug').on(t.slug)]
);

const members = convexTable(
  'tm_members',
  {
    name: text().notNull(),
    teamId: id('tm_teams').notNull(),
    teamSlug: text().notNull(),
  },
  (t) => [
    index('tm_members_by_team').on(t.teamId),
    index('tm_members_by_slug').on(t.teamSlug),
  ]
);

const schema = defineSchema(
  { tm_teams: teams, tm_members: members },
  { defaults: { defaultLimit: 10 } }
);

/**
 * Two relation pairs that resolve the *same* target document by the *same* memo
 * key: one pair through `_getById`, one through `_firstByFields`. Aliases only
 * exist to pair each relation with its inverse.
 */
const relations = defineRelations(schema, (r) => ({
  tm_teams: {
    membersBySlug: r.many.tm_members({
      alias: 'bySlug',
      from: r.tm_teams.slug,
      to: r.tm_members.teamSlug,
    }),
    membersBySlugAlt: r.many.tm_members({
      alias: 'bySlugAlt',
      from: r.tm_teams.slug,
      to: r.tm_members.teamSlug,
    }),
    membersById: r.many.tm_members({
      alias: 'byId',
      from: r.tm_teams.id,
      to: r.tm_members.teamId,
    }),
    membersByIdAlt: r.many.tm_members({
      alias: 'byIdAlt',
      from: r.tm_teams.id,
      to: r.tm_members.teamId,
    }),
  },
  tm_members: {
    teamBySlug: r.one.tm_teams({
      alias: 'bySlug',
      from: r.tm_members.teamSlug,
      to: r.tm_teams.slug,
    }),
    teamBySlugAlt: r.one.tm_teams({
      alias: 'bySlugAlt',
      from: r.tm_members.teamSlug,
      to: r.tm_teams.slug,
    }),
    teamById: r.one.tm_teams({
      alias: 'byId',
      from: r.tm_members.teamId,
      to: r.tm_teams.id,
    }),
    teamByIdAlt: r.one.tm_teams({
      alias: 'byIdAlt',
      from: r.tm_members.teamId,
      to: r.tm_teams.id,
    }),
  },
}));

const orm = createOrm({ schema: relations });

const countingDb = (db: any, counts: Record<string, number>) =>
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
        const key = prop === 'get' ? 'get' : `query:${String(args[0])}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return value.apply(target, args);
      };
    },
  });

const seed = async (ctx: any) => {
  const team = (await ctx.db.insert('tm_teams', {
    name: 'Alpha',
    slug: 'alpha',
  })) as string;
  await ctx.db.insert('tm_members', {
    name: 'a-0',
    teamId: team,
    teamSlug: 'alpha',
  });
};

/**
 * A memo entry is a snapshot shared by every read of that key in one execution,
 * but relation loading writes nested `with` results onto the target document it
 * is handed, and `hydrateDateFieldsForRead` then copies every own key it finds.
 * So a shared entry has to hand out its own copy per caller, or one relation
 * publishes fields only another one asked for.
 *
 * The `where` runs during the residual stream and the requested `with` runs in
 * `_finalizeRows` afterwards, so the order here is fixed rather than a race
 * between sibling relations.
 */
describe('memoized relation target isolation', () => {
  test('a nested relation `where` does not leak onto a `with` sharing its `_firstByFields` entry', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const counts: Record<string, number> = {};
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.tm_members.findMany({
        where: { teamBySlug: { membersBySlug: { name: 'a-0' } } },
        with: { teamBySlugAlt: true },
        limit: 5,
      });

      expect(rows).toHaveLength(1);
      // One read for both relations proves they shared a memo entry, so the
      // assertion below is about isolation and not about two separate reads.
      expect(counts['query:tm_teams']).toBe(1);
      expect(rows[0].teamBySlugAlt.membersBySlug).toBeUndefined();
      expect(rows[0].teamBySlugAlt.name).toBe('Alpha');
    });
  });

  test('a nested relation `where` does not leak onto a `with` sharing its `_getById` entry', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const counts: Record<string, number> = {};
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.tm_members.findMany({
        where: { teamById: { membersById: { name: 'a-0' } } },
        with: { teamByIdAlt: true },
        limit: 5,
      });

      expect(rows).toHaveLength(1);
      expect(counts.get).toBe(1);
      expect(rows[0].teamByIdAlt.membersById).toBeUndefined();
      expect(rows[0].teamByIdAlt.name).toBe('Alpha');
    });
  });

  /**
   * Siblings are dispatched under one `Promise.all`, so which of them reaches
   * `_selectColumns` first is a race. This one happens to pass without the copy
   * too — it is here to lock the sibling shape in, not as the regression proof.
   * The two tests above are the deterministic ones.
   */
  test('two sibling relations sharing one entry keep their own nested shapes', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await seed(ctx);
      const counts: Record<string, number> = {};
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db.query.tm_members.findMany({
        with: {
          teamBySlug: { with: { membersBySlug: { limit: 5 } } },
          teamBySlugAlt: true,
        },
        limit: 1,
      });

      expect(counts['query:tm_teams']).toBe(1);
      expect(rows[0].teamBySlug.membersBySlug).toBeDefined();
      expect(rows[0].teamBySlugAlt.membersBySlug).toBeUndefined();
    });
  });
});
