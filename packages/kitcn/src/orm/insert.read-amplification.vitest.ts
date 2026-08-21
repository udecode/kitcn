import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import { convexTable, createOrm, defineSchema, id, text } from '.';

const orgs = convexTable('ri_orgs', {
  name: text().notNull(),
});

const members = convexTable('ri_members', {
  name: text().notNull(),
  orgId: id('ri_orgs')
    .references(() => orgs.id)
    .notNull(),
});

const FOREIGN_KEY_VIOLATION_RE = /Foreign key violation/;

const schema = defineSchema({ ri_orgs: orgs, ri_members: members });
const orm = createOrm({ schema });

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

const rowsFor = (orgId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `Member ${index}`,
    orgId,
  }));

describe('ORM insert() read amplification', () => {
  test('rows sharing one foreign key cost one probe, not one per row', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const orgId = (await ctx.db.insert('ri_orgs', {
        name: 'Acme',
      })) as string;

      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      await db.insert(members).values(rowsFor(orgId, 8)).execute();

      expect(counts.get).toBe(1);
      expect(await ctx.db.query('ri_members').collect()).toHaveLength(8);
    });
  });

  /**
   * The memo is keyed on the probed id, not on an "already probed once" latch:
   * every row of an insert can carry a different foreign key.
   */
  test('each distinct foreign key is still probed', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const first = (await ctx.db.insert('ri_orgs', {
        name: 'Acme',
      })) as string;
      const second = (await ctx.db.insert('ri_orgs', {
        name: 'Globex',
      })) as string;

      const counts: Counts = { get: 0, query: 0 };
      const db = orm.db(countingDb(ctx.db, counts)) as any;

      await db
        .insert(members)
        .values([
          { name: 'a', orgId: first },
          { name: 'b', orgId: second },
          { name: 'c', orgId: first },
          { name: 'd', orgId: second },
        ])
        .execute();

      expect(counts.get).toBe(2);
    });
  });

  test('a dangling foreign key on a later row still fails', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const orgId = (await ctx.db.insert('ri_orgs', {
        name: 'Acme',
      })) as string;
      const removed = (await ctx.db.insert('ri_orgs', {
        name: 'Gone',
      })) as string;
      await ctx.db.delete('ri_orgs', removed as any);

      const db = orm.db(ctx.db as any) as any;

      await expect(
        db
          .insert(members)
          .values([
            { name: 'a', orgId },
            { name: 'b', orgId: removed },
          ])
          .execute()
      ).rejects.toThrow(FOREIGN_KEY_VIOLATION_RE);

      expect(await ctx.db.query('ri_members').collect()).toHaveLength(1);
    });
  });

  /**
   * Statement scope, not transaction scope: a parent removed between two
   * statements is genuinely gone.
   */
  test('a parent deleted between two statements is not remembered', async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const orgId = (await ctx.db.insert('ri_orgs', {
        name: 'Acme',
      })) as string;
      const db = orm.db(ctx.db as any) as any;

      await db.insert(members).values(rowsFor(orgId, 2)).execute();

      await ctx.db.delete('ri_orgs', orgId as any);

      await expect(
        db.insert(members).values(rowsFor(orgId, 1)).execute()
      ).rejects.toThrow(FOREIGN_KEY_VIOLATION_RE);
    });
  });
});

const hookedOrgs = convexTable('rh_orgs', {
  name: text().notNull(),
});

const hookedMembers = convexTable('rh_members', {
  name: text().notNull(),
  orgId: id('rh_orgs')
    .references(() => hookedOrgs.id)
    .notNull(),
});

/**
 * A trigger runs arbitrary user code between rows and can delete the parent, so
 * the memo has to switch itself off for a hooked table.
 */
const hookedSchema = defineSchema({
  rh_orgs: hookedOrgs,
  rh_members: hookedMembers,
}).triggers({
  rh_members: {
    create: {
      after: async (row: any, hookCtx: any) => {
        await hookCtx.db.delete('rh_orgs', row.orgId);
      },
    },
  },
} as any);

const hookedOrm = createOrm({ schema: hookedSchema });

describe('ORM insert() foreign-key probe with triggers', () => {
  test('a trigger that deletes the parent still fails the next row', async () => {
    const t = convexTest(hookedSchema);

    await t.run(async (ctx) => {
      const orgId = (await ctx.db.insert('rh_orgs', {
        name: 'Acme',
      })) as string;
      const db = hookedOrm.db(ctx.db as any) as any;

      await expect(
        db
          .insert(hookedMembers)
          .values([
            { name: 'a', orgId },
            { name: 'b', orgId },
          ])
          .execute()
      ).rejects.toThrow(FOREIGN_KEY_VIOLATION_RE);
    });
  });
});
