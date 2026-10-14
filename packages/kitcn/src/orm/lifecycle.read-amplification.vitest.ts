import type { GenericDatabaseWriter } from 'convex/server';
import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineSchema,
  eq,
  integer,
  rankIndex,
  text,
} from '.';
import { aggregateCapability } from './aggregate-index';

/**
 * A table declaring an aggregateIndex/rankIndex carries an injected write
 * barrier and an injected `change` hook. Neither one writes the row, so a
 * patch must cost exactly the one pre-image read `change` consumes — the same
 * as a table hooked only with `change`. The barrier used to occupy the
 * `update.before` slot, which made the re-read at the top of `patch`
 * unconditional and doubled every pre-image read on those tables.
 */
const aggUsers = convexTable(
  'ra_agg_users',
  {
    name: text().notNull(),
    orgId: text().notNull(),
    score: integer().notNull(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId)]
);

/** Same, but the pre-image re-read is genuinely load-bearing here. */
const aggHookedUsers = convexTable(
  'ra_agg_hooked_users',
  {
    name: text().notNull(),
    orgId: text().notNull(),
    score: integer().notNull(),
    touched: text(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId)]
);

const rankedUsers = convexTable(
  'ra_ranked_users',
  {
    name: text().notNull(),
    orgId: text().notNull(),
    score: integer().notNull(),
  },
  (t) => [rankIndex('by_org_score').partitionBy(t.orgId).orderBy(t.score)]
);

/** Control: one pre-image read per row, and nothing injected. */
const changeUsers = convexTable('ra_change_users', {
  name: text().notNull(),
  orgId: text().notNull(),
  score: integer().notNull(),
});

/** Control: no hooks at all, so no pre-image read. */
const plainUsers = convexTable('ra_plain_users', {
  name: text().notNull(),
  orgId: text().notNull(),
  score: integer().notNull(),
});

const schema = defineSchema({
  ra_agg_hooked_users: aggHookedUsers,
  ra_agg_users: aggUsers,
  ra_change_users: changeUsers,
  ra_plain_users: plainUsers,
  ra_ranked_users: rankedUsers,
}).triggers({
  ra_agg_hooked_users: {
    update: {
      before: async (_data, hookCtx) => {
        for (const id of hookedTargetIds) {
          await (hookCtx.innerDb as GenericDatabaseWriter<any>).patch(
            'ra_agg_hooked_users' as any,
            id as any,
            { touched: 'from-before' } as any
          );
        }
      },
    },
    change: async (change) => {
      if (change.newDoc) {
        observedNewDocs.push(change.newDoc as Record<string, unknown>);
      }
    },
  },
  ra_change_users: {
    change: async () => undefined,
  },
});

/**
 * The before hook has to name the row it writes, and it cannot read the id off
 * `data` — a patch payload carries only the changed columns.
 */
let hookedTargetIds: string[] = [];
let observedNewDocs: Record<string, unknown>[] = [];

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const createOrmClient = () =>
  createOrm({
    capabilities: [aggregateCapability()],
    schema,
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: passthroughInternalMutation,
  });

/**
 * Counts `db.get` calls that resolve to one table, so aggregate/rank upkeep
 * reads against `aggregate_state` never land in the total. The ORM finds the
 * rows to patch through `query`, so everything counted here is a lifecycle
 * pre-image read.
 *
 * Must wrap the writer before the ORM is built: the lifecycle wrapper binds
 * the reader at wrap time, so a counter installed later sees nothing.
 */
const countTableGets = (db: any, table: string, counts: { get: number }) =>
  new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop !== 'get') {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        const [first, second] = args;
        const hit =
          second === undefined
            ? Boolean(target.normalizeId(table, first))
            : first === table;
        if (hit) {
          counts.get += 1;
        }
        return value.apply(target, args);
      };
    },
  });

const ROW_COUNT = 5;

const seed = async (db: any, table: string) => {
  const ids: string[] = [];
  for (let index = 0; index < ROW_COUNT; index += 1) {
    ids.push(
      await db.insert(table, {
        name: `n${index}`,
        orgId: 'org-1',
        score: index,
      })
    );
  }
  return ids;
};

const patchEveryRow = async (table: any, column: any) => {
  const t = convexTest(schema);
  let counts = { get: 0 };
  let ids: string[] = [];

  await t.run(async (baseCtx) => {
    ids = await seed(baseCtx.db, (table as any).tableName);
    hookedTargetIds = ids;
    counts = { get: 0 };
    const ctx = createOrmClient().with({
      db: countTableGets(baseCtx.db, (table as any).tableName, counts) as any,
      scheduler: schedulerStub as any,
    });

    await ctx.orm
      .update(table)
      .set({ name: 'patched' })
      .where(eq(column, 'org-1'))
      .allowFullScan()
      .execute();
  });

  return counts.get;
};

describe('ORM lifecycle pre-image read amplification', () => {
  test('an aggregateIndex table reads the pre-image once per row', async () => {
    expect(await patchEveryRow(aggUsers, aggUsers.orgId)).toBe(ROW_COUNT);
  });

  test('a rankIndex table reads the pre-image once per row', async () => {
    expect(await patchEveryRow(rankedUsers, rankedUsers.orgId)).toBe(ROW_COUNT);
  });

  test('an injected barrier costs no more than a plain change hook', async () => {
    const injected = await patchEveryRow(aggUsers, aggUsers.orgId);
    const control = await patchEveryRow(changeUsers, changeUsers.orgId);

    expect(injected).toBe(control);
  });

  test('an unhooked table reads no pre-image at all', async () => {
    expect(await patchEveryRow(plainUsers, plainUsers.orgId)).toBe(0);
  });

  test('a user update.before still forces a fresh pre-image read', async () => {
    observedNewDocs = [];

    // Twice per row: the statement-entry image feeds `change.oldDoc`, and the
    // hook may have rewritten the row through `innerDb`, so `newDoc` has to be
    // derived from a second read. Losing this would silently drop the hook's
    // write from every after/change hook.
    expect(await patchEveryRow(aggHookedUsers, aggHookedUsers.orgId)).toBe(
      ROW_COUNT * 2
    );

    expect(observedNewDocs).toHaveLength(ROW_COUNT);
    for (const doc of observedNewDocs) {
      expect(doc).toMatchObject({ name: 'patched', touched: 'from-before' });
    }
  });
});
