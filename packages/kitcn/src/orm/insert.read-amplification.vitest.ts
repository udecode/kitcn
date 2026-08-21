import { defineSchema as defineConvexSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  integer,
  text,
  timestamp,
  uniqueIndex,
  unsetToken,
} from '.';

const cities = convexTable('ri_cities', {
  name: text().notNull(),
  region: text(),
  population: integer(),
});

const runtimeSchema = defineConvexSchema({
  ri_cities: defineTable({
    name: v.string(),
    region: v.optional(v.string()),
    population: v.optional(v.number()),
  }),
});

const orm = createOrm({ schema: defineRelations({ ri_cities: cities }) });

type Counts = { get: number; query: number };

/**
 * Counts reads issued through the writer the ORM was handed. `Object.create`
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

/** The shape argument-less `returning()` is contractually expected to produce. */
const expectedReturningRow = (stored: any) => {
  const { _id, _creationTime, ...rest } = stored;
  return { ...rest, id: _id, createdAt: _creationTime };
};

const CITY_ROWS = [
  { name: 'Lyon', region: 'ARA', population: 513_000 },
  { name: 'Nantes', region: 'PDL', population: 320_000 },
  { name: 'Rennes', region: 'BRE', population: 222_000 },
];

describe('ORM insert() read amplification', () => {
  test('a projected returning() reads nothing back', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db
        .insert(cities)
        .values(CITY_ROWS)
        .returning({ id: cities.id, name: cities.name })
        .execute();

      expect(rows).toHaveLength(3);
      expect(rows.map((row: any) => row.name)).toEqual([
        'Lyon',
        'Nantes',
        'Rennes',
      ]);
      expect(rows.every((row: any) => typeof row.id === 'string')).toBe(true);
      // One `db.get` per row before; the id and every projected column are
      // already in hand.
      expect(counts.get).toBe(0);
    });
  });

  test('a projected returning() matches a fresh read of the stored row', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const db = orm.db(ctx.db as any) as any;

      const rows = await db
        .insert(cities)
        .values(CITY_ROWS)
        .returning({
          id: cities.id,
          name: cities.name,
          region: cities.region,
          population: cities.population,
        })
        .execute();

      for (const row of rows) {
        const stored: any = await ctx.db.get(row.id);
        expect(row).toStrictEqual({
          id: stored._id,
          name: stored.name,
          region: stored.region,
          population: stored.population,
        });
      }
    });
  });

  test('a column left out of values() projects as undefined, as a read would', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const [row] = await db
        .insert(cities)
        .values({ name: 'Brest' })
        .returning({ name: cities.name, region: cities.region })
        .execute();

      expect(row).toStrictEqual({ name: 'Brest', region: undefined });
      expect(counts.get).toBe(0);
    });
  });

  test('argument-less returning() keeps its read for _creationTime', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db
        .insert(cities)
        .values(CITY_ROWS)
        .returning()
        .execute();

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        // The public alias, backed by `_creationTime`, which `db.insert` does
        // not return. This is the field the fast path can never derive.
        expect(typeof row.createdAt).toBe('number');
        expect(row.createdAt).toBeGreaterThan(0);
      }
      expect(counts.get).toBe(3);
    });
  });

  test('a projection naming createdAt keeps its read', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db
        .insert(cities)
        .values(CITY_ROWS)
        .returning({ id: cities.id, createdAt: (cities as any).createdAt })
        .execute();

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(typeof row.createdAt).toBe('number');
        expect(row.createdAt).toBeGreaterThan(0);
      }
      expect(counts.get).toBe(3);
    });
  });
});

const hookedCities = convexTable('ri_hooked', {
  name: text().notNull(),
  slug: text(),
});

const hookedRuntimeSchema = defineConvexSchema({
  ri_hooked: defineTable({ name: v.string(), slug: v.optional(v.string()) }),
});

const hookedOrm = createOrm({
  schema: defineSchema({ ri_hooked: hookedCities }).triggers({
    ri_hooked: {
      create: {
        before: (data: any) => ({ data: { slug: data.name.toLowerCase() } }),
      },
    },
  } as any) as any,
});

describe('ORM insert() with lifecycle hooks', () => {
  test('a projected returning() reflects a payload rewritten by create.before', async () => {
    const t = convexTest(hookedRuntimeSchema);

    await t.run(async (ctx) => {
      const counts: Counts = { get: 0, query: 0 };
      const hookedCtx = hookedOrm.with({
        db: countingDb(ctx.db, counts),
      } as any) as any;

      const rows = await hookedCtx.orm
        .insert(hookedCities)
        .values([{ name: 'Lyon' }, { name: 'Nantes' }])
        .returning({ name: hookedCities.name, slug: hookedCities.slug })
        .execute();

      expect(rows).toEqual([
        { name: 'Lyon', slug: 'lyon' },
        { name: 'Nantes', slug: 'nantes' },
      ]);
      // The hook, not `values()`, decided the stored payload, so the read stays.
      expect(counts.get).toBe(2);
    });
  });
});

const upsertUsers = convexTable(
  'ri_upsert_users',
  {
    email: text().notNull(),
    name: text().notNull(),
    nickname: text(),
    visits: integer(),
    lastSeen: timestamp(),
  },
  (t) => [uniqueIndex('ri_upsert_users_by_email').on(t.email)]
);

const upsertRuntimeSchema = defineConvexSchema({
  ri_upsert_users: defineTable({
    email: v.string(),
    name: v.string(),
    nickname: v.optional(v.string()),
    visits: v.optional(v.number()),
    lastSeen: v.optional(v.number()),
  }).index('ri_upsert_users_by_email', ['email']),
});

const upsertOrm = createOrm({
  schema: defineRelations({ ri_upsert_users: upsertUsers }),
});

describe('ORM insert().onConflictDoUpdate() read amplification', () => {
  test('the conflict post-image matches a fresh read without re-reading it', async () => {
    const t = convexTest(upsertRuntimeSchema);

    await t.run(async (ctx) => {
      const seedDb = upsertOrm.db(ctx.db as any) as any;
      await seedDb
        .insert(upsertUsers)
        .values({ email: 'a@test.dev', name: 'Alice', visits: 1 })
        .execute();

      const counts: Counts = { get: 0, query: 0 };
      const db = upsertOrm.db(countingDb(ctx.db, counts)) as any;

      const rows = await db
        .insert(upsertUsers)
        .values({ email: 'a@test.dev', name: 'Ignored', visits: 0 })
        .onConflictDoUpdate({
          target: upsertUsers.email,
          set: { name: 'Updated', visits: 2 },
        })
        .returning()
        .execute();

      expect(rows).toHaveLength(1);
      const stored: any = await ctx.db.get(rows[0].id);
      expect(stored.name).toBe('Updated');
      expect(stored.visits).toBe(2);
      expect(rows[0]).toStrictEqual(expectedReturningRow(stored));
      // The conflict probe only. The post-image read is gone.
      expect(counts.get).toBe(0);
      expect(counts.query).toBe(1);
    });
  });

  test('an unset column is absent from the conflict post-image', async () => {
    const t = convexTest(upsertRuntimeSchema);

    await t.run(async (ctx) => {
      const seedDb = upsertOrm.db(ctx.db as any) as any;
      await seedDb
        .insert(upsertUsers)
        .values({ email: 'b@test.dev', name: 'Bob', nickname: 'bobby' })
        .execute();

      const db = upsertOrm.db(ctx.db as any) as any;
      const rows = await db
        .insert(upsertUsers)
        .values({ email: 'b@test.dev', name: 'Ignored' })
        .onConflictDoUpdate({
          target: upsertUsers.email,
          set: { name: 'Updated', nickname: unsetToken },
        })
        .returning()
        .execute();

      expect(rows).toHaveLength(1);
      expect(Object.hasOwn(rows[0], 'nickname')).toBe(false);
      const stored: any = await ctx.db.get(rows[0].id);
      expect(Object.hasOwn(stored, 'nickname')).toBe(false);
    });
  });
});
