import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import {
  convexTable,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  foreignKey,
  id,
  inArray,
  index,
  scheduledMutationBatchFactory,
  text,
} from 'kitcn/orm';
import { describe, expect, test, vi } from 'vitest';
import { convexTest, withOrm } from '../setup.testing';

const stressTest = process.env.CONVEX_LIMIT_STRESS === '1' ? test : test.skip;

const seedInBatches = async <TDoc>(options: {
  total: number;
  batchSize: number;
  makeDoc: (index: number) => TDoc;
  insertBatch: (docs: TDoc[]) => Promise<void>;
}) => {
  for (let start = 0; start < options.total; start += options.batchSize) {
    const docs: TDoc[] = [];
    const end = Math.min(start + options.batchSize, options.total);
    for (let i = start; i < end; i++) {
      docs.push(options.makeDoc(i));
    }
    await options.insertBatch(docs);
  }
};

const estimateBytes = (doc: unknown): number =>
  Math.ceil(Buffer.byteLength(JSON.stringify(doc), 'utf8') * 1.2);

const drainScheduledQueue = async (options: {
  queue: unknown[];
  worker: (
    ctx: { db: GenericDatabaseWriter<any>; scheduler: any },
    args: any
  ) => Promise<void>;
  db: GenericDatabaseWriter<any>;
  scheduler: any;
  maxIterations: number;
}) => {
  let iterations = 0;
  while (options.queue.length > 0) {
    if (iterations >= options.maxIterations) {
      throw new Error(
        `Scheduled queue did not converge after ${options.maxIterations} iterations.`
      );
    }
    const next = options.queue.shift();
    await options.worker(
      {
        db: options.db,
        scheduler: options.scheduler,
      },
      next
    );
    iterations += 1;
  }
  return iterations;
};

const assertEventuallyEmpty = async (options: {
  db: GenericDatabaseWriter<any>;
  tableName: string;
  indexName: string;
  eqField: string;
  eqValue: unknown;
  maxIterations?: number;
}) => {
  const maxIterations = options.maxIterations ?? 20;
  for (let i = 0; i < maxIterations; i++) {
    const rows = await options.db
      .query(options.tableName)
      .withIndex(options.indexName, (q: any) =>
        q.eq(options.eqField, options.eqValue as any)
      )
      .take(1);
    if (rows.length === 0) {
      return;
    }
  }
  throw new Error(
    `Table '${options.tableName}' still has rows for ${options.eqField} after ${maxIterations} checks.`
  );
};

const makeQueueScheduler = () => {
  const queue: any[] = [];
  const scheduler = {
    runAfter: vi.fn(async (_delayMs: number, _ref: any, args: any) => {
      queue.push(args);
      return 'scheduled';
    }),
    runAt: vi.fn(async () => 'scheduled'),
    cancel: vi.fn(async () => undefined),
  };
  return { queue, scheduler };
};

describe('convex limits stress (env-gated)', () => {
  stressTest(
    'A) maxScan split behavior under 35k indexed rows',
    async () => {
      const scanUsers = convexTable(
        'limit_stress_scan_users',
        {
          name: text().notNull(),
          role: text().notNull(),
          status: text().notNull(),
        },
        (t) => [index('by_name').on(t.name), index('by_status').on(t.status)]
      );
      const tables = { limit_stress_scan_users: scanUsers };
      const schema = defineSchema(tables, {
        defaults: {
          mutationMaxRows: 50_000,
        },
      });
      const relations = defineRelations(tables);
      const t = convexTest(schema);

      const total = 35_000;
      await seedInBatches({
        total,
        batchSize: 1_000,
        makeDoc: (i) => ({
          name: `stress-user-${String(i).padStart(5, '0')}`,
          role: 'member',
          status: 'seeded',
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(scanUsers).values(docs);
          });
        },
      });

      let cursor: string | null = null;
      for (let i = 0; i < 6; i++) {
        await t.run(async (baseCtx) => {
          const ctx = withOrm(baseCtx, relations);
          const page = await ctx.orm.query.limit_stress_scan_users
            .withIndex('by_name')
            .findMany({
              where: (_table, { predicate }) =>
                predicate((row) => row.name.endsWith('00')),
              cursor,
              limit: 50,
              maxScan: 25,
            });

          expect(page.pageStatus).toBe('SplitRequired');
          expect(page.page.length).toBeLessThanOrEqual(25);
          expect(page.splitCursor).toBeTruthy();
          expect(page.continueCursor).not.toBeNull();
          cursor = page.continueCursor;
        });
      }

      expect(cursor).not.toBeNull();
    },
    180_000
  );

  stressTest(
    'A) full-scan guard rejects without allowFullScan and succeeds with allowFullScan',
    async () => {
      const fullScanUsers = convexTable(
        'limit_stress_full_scan_users',
        {
          name: text().notNull(),
          role: text().notNull(),
          status: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      const tables = { limit_stress_full_scan_users: fullScanUsers };
      const schema = defineSchema(tables, {
        defaults: {
          mutationMaxRows: 10_000,
        },
      });
      const relations = defineRelations(tables);
      const t = convexTest(schema);

      const total = 4_000;
      await seedInBatches({
        total,
        batchSize: 500,
        makeDoc: (i) => ({
          name: `full-scan-user-${i}`,
          role: 'worker',
          status: 'draft',
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(fullScanUsers).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await expect(
          ctx.orm
            .update(fullScanUsers)
            .set({ status: 'checked' })
            .where(eq(fullScanUsers.role, 'worker'))
            .execute()
        ).rejects.toThrow(/allowFullScan|full scan|index/i);
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        const updated = await ctx.orm
          .update(fullScanUsers)
          .set({ status: 'checked' })
          .where(eq(fullScanUsers.role, 'worker'))
          .allowFullScan()
          .returning({ id: fullScanUsers.id })
          .execute();
        expect(updated).toHaveLength(total);
      });

      await t.run(async (baseCtx) => {
        const checked = await baseCtx.db
          .query('limit_stress_full_scan_users')
          .withIndex('by_status', (q) => q.eq('status', 'checked'))
          .collect();
        expect(checked).toHaveLength(total);
      });
    },
    90_000
  );

  stressTest(
    'B) multi-probe paginated mutations reject with thousands of probes',
    async () => {
      const probeUsers = convexTable(
        'limit_stress_probe_users',
        {
          status: text().notNull(),
          role: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      const tables = { limit_stress_probe_users: probeUsers };
      const schema = defineSchema(tables, {
        defaults: { mutationMaxRows: 20_000 },
      });
      const relations = defineRelations(tables);
      const t = convexTest(schema);

      const total = 6_000;
      await seedInBatches({
        total,
        batchSize: 500,
        makeDoc: (i) => ({ status: `probe-${i}`, role: 'seed' }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(probeUsers).values(docs);
          });
        },
      });

      const probes = Array.from({ length: 3_500 }, (_, i) => `probe-${i}`);

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await expect(
          ctx.orm
            .update(probeUsers)
            .set({ role: 'updated' })
            .where(inArray(probeUsers.status, probes))
            .paginate({ cursor: null, limit: 500 })
        ).rejects.toThrow(/multi-probe/i);

        await expect(
          ctx.orm
            .delete(probeUsers)
            .where(inArray(probeUsers.status, probes))
            .paginate({ cursor: null, limit: 500 })
        ).rejects.toThrow(/multi-probe/i);
      });
    },
    90_000
  );

  stressTest(
    'B) indexed single-range async update converges on 12k rows',
    async () => {
      const rangeUsers = convexTable(
        'limit_stress_single_range_users',
        {
          status: text().notNull(),
          role: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      const tables = { limit_stress_single_range_users: rangeUsers };
      const schema = defineSchema(tables, {
        defaults: {
          mutationBatchSize: 400,
          mutationMaxRows: 30_000,
        },
      });
      const relations = defineRelations(tables);
      const edges = extractRelationsConfig(relations);
      const t = convexTest(schema);
      const { queue, scheduler } = makeQueueScheduler();
      const scheduledMutationBatch = {} as SchedulableFunctionReference;
      const worker = scheduledMutationBatchFactory(
        relations,
        edges,
        scheduledMutationBatch
      );

      const targetCount = 12_000;
      const otherCount = 2_000;
      await seedInBatches({
        total: targetCount + otherCount,
        batchSize: 500,
        makeDoc: (i) => ({
          status: i < targetCount ? 'target' : 'other',
          role: 'seed',
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(rangeUsers).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations, {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        });

        const firstBatch = await ctx.orm
          .update(rangeUsers)
          .set({ role: 'processed' })
          .where(eq(rangeUsers.status, 'target'))
          .returning({ id: rangeUsers.id })
          .execute({ mode: 'async', batchSize: 400, delayMs: 0 });

        expect(firstBatch).toHaveLength(400);
        expect(queue.length).toBeGreaterThan(0);

        await drainScheduledQueue({
          queue,
          worker,
          db: ctx.db,
          scheduler,
          maxIterations: 2_000,
        });

        const targetRows = await ctx.db
          .query('limit_stress_single_range_users')
          .withIndex('by_status', (q) => q.eq('status', 'target'))
          .collect();
        expect(targetRows).toHaveLength(targetCount);
        expect(targetRows.every((row) => row.role === 'processed')).toBe(true);
      });
    },
    180_000
  );

  stressTest(
    'C) async cascade delete converges for thousands of descendants across two edges',
    async () => {
      const parents = convexTable(
        'limit_stress_parents_delete',
        { slug: text().notNull() },
        (t) => [index('by_slug').on(t.slug)]
      );
      const childA = convexTable(
        'limit_stress_children_delete_a',
        {
          parentId: id('limit_stress_parents_delete').notNull(),
          parentSlug: text().notNull(),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          index('by_parent_slug').on(t.parentSlug),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('cascade'),
          foreignKey({
            columns: [t.parentSlug],
            foreignColumns: [parents.slug],
          })
            .onDelete('cascade')
            .onUpdate('cascade'),
        ]
      );
      const childB = convexTable(
        'limit_stress_children_delete_b',
        {
          parentId: id('limit_stress_parents_delete').notNull(),
          parentSlug: text().notNull(),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          index('by_parent_slug').on(t.parentSlug),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('cascade'),
          foreignKey({
            columns: [t.parentSlug],
            foreignColumns: [parents.slug],
          })
            .onDelete('cascade')
            .onUpdate('cascade'),
        ]
      );

      const tables = {
        limit_stress_parents_delete: parents,
        limit_stress_children_delete_a: childA,
        limit_stress_children_delete_b: childB,
      };
      const schema = defineSchema(tables, {
        defaults: {
          mutationExecutionMode: 'async',
          mutationBatchSize: 150,
          mutationLeafBatchSize: 300,
          mutationMaxRows: 100_000,
        },
      });
      const relations = defineRelations(tables);
      const edges = extractRelationsConfig(relations);
      const t = convexTest(schema);
      const { queue, scheduler } = makeQueueScheduler();
      const scheduledMutationBatch = {} as SchedulableFunctionReference;
      const worker = scheduledMutationBatchFactory(
        relations,
        edges,
        scheduledMutationBatch
      );

      let parentId: any;
      const parentSlug = 'parent-delete-root';
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        const [parent] = await ctx.orm
          .insert(parents)
          .values({ slug: parentSlug })
          .returning();
        parentId = parent.id;
      });

      const descendantsPerTable = 4_000;
      await seedInBatches({
        total: descendantsPerTable,
        batchSize: 500,
        makeDoc: (i) => ({
          parentId,
          parentSlug,
          payload: `cascade-delete-a-${i}`,
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(childA).values(docs);
          });
        },
      });
      await seedInBatches({
        total: descendantsPerTable,
        batchSize: 500,
        makeDoc: (i) => ({
          parentId,
          parentSlug,
          payload: `cascade-delete-b-${i}`,
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(childB).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations, {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        });

        await ctx.orm.delete(parents).where(eq(parents.id, parentId)).execute();

        expect(queue.length).toBeGreaterThan(0);

        await drainScheduledQueue({
          queue,
          worker,
          db: ctx.db,
          scheduler,
          maxIterations: 5_000,
        });

        expect(await ctx.db.get(parentId)).toBeNull();
        await assertEventuallyEmpty({
          db: ctx.db,
          tableName: 'limit_stress_children_delete_a',
          indexName: 'by_parent_id',
          eqField: 'parentId',
          eqValue: parentId,
        });
        await assertEventuallyEmpty({
          db: ctx.db,
          tableName: 'limit_stress_children_delete_b',
          indexName: 'by_parent_id',
          eqField: 'parentId',
          eqValue: parentId,
        });
      });
    },
    180_000
  );

  stressTest(
    'C) async cascade update converges for thousands of descendants across two edges',
    async () => {
      const parents = convexTable(
        'limit_stress_parents_update',
        { slug: text().notNull() },
        (t) => [index('by_slug').on(t.slug)]
      );
      const childA = convexTable(
        'limit_stress_children_update_a',
        {
          parentId: id('limit_stress_parents_update').notNull(),
          parentSlug: text().notNull(),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          index('by_parent_slug').on(t.parentSlug),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('cascade'),
          foreignKey({
            columns: [t.parentSlug],
            foreignColumns: [parents.slug],
          })
            .onDelete('cascade')
            .onUpdate('cascade'),
        ]
      );
      const childB = convexTable(
        'limit_stress_children_update_b',
        {
          parentId: id('limit_stress_parents_update').notNull(),
          parentSlug: text().notNull(),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          index('by_parent_slug').on(t.parentSlug),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('cascade'),
          foreignKey({
            columns: [t.parentSlug],
            foreignColumns: [parents.slug],
          })
            .onDelete('cascade')
            .onUpdate('cascade'),
        ]
      );

      const tables = {
        limit_stress_parents_update: parents,
        limit_stress_children_update_a: childA,
        limit_stress_children_update_b: childB,
      };
      const schema = defineSchema(tables, {
        defaults: {
          mutationExecutionMode: 'async',
          mutationBatchSize: 150,
          mutationLeafBatchSize: 300,
          mutationMaxRows: 100_000,
        },
      });
      const relations = defineRelations(tables);
      const edges = extractRelationsConfig(relations);
      const t = convexTest(schema);
      const { queue, scheduler } = makeQueueScheduler();
      const scheduledMutationBatch = {} as SchedulableFunctionReference;
      const worker = scheduledMutationBatchFactory(
        relations,
        edges,
        scheduledMutationBatch
      );

      let parentId: any;
      const oldSlug = 'parent-update-root';
      const newSlug = 'parent-update-next';
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        const [parent] = await ctx.orm
          .insert(parents)
          .values({ slug: oldSlug })
          .returning();
        parentId = parent.id;
      });

      const descendantsPerTable = 4_000;
      await seedInBatches({
        total: descendantsPerTable,
        batchSize: 500,
        makeDoc: (i) => ({
          parentId,
          parentSlug: oldSlug,
          payload: `cascade-update-a-${i}`,
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(childA).values(docs);
          });
        },
      });
      await seedInBatches({
        total: descendantsPerTable,
        batchSize: 500,
        makeDoc: (i) => ({
          parentId,
          parentSlug: oldSlug,
          payload: `cascade-update-b-${i}`,
        }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(childB).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations, {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        });

        await ctx.orm
          .update(parents)
          .set({ slug: newSlug })
          .where(eq(parents.id, parentId))
          .execute();

        expect(queue.length).toBeGreaterThan(0);

        await drainScheduledQueue({
          queue,
          worker,
          db: ctx.db,
          scheduler,
          maxIterations: 5_000,
        });

        const oldA = await ctx.db
          .query('limit_stress_children_update_a')
          .withIndex('by_parent_slug', (q) => q.eq('parentSlug', oldSlug))
          .collect();
        const oldB = await ctx.db
          .query('limit_stress_children_update_b')
          .withIndex('by_parent_slug', (q) => q.eq('parentSlug', oldSlug))
          .collect();
        const nextA = await ctx.db
          .query('limit_stress_children_update_a')
          .withIndex('by_parent_slug', (q) => q.eq('parentSlug', newSlug))
          .collect();
        const nextB = await ctx.db
          .query('limit_stress_children_update_b')
          .withIndex('by_parent_slug', (q) => q.eq('parentSlug', newSlug))
          .collect();

        expect(oldA).toHaveLength(0);
        expect(oldB).toHaveLength(0);
        expect(nextA).toHaveLength(descendantsPerTable);
        expect(nextB).toHaveLength(descendantsPerTable);
      });
    },
    180_000
  );

  stressTest(
    'D) byte-pressure limits first async cascade pass and drains via continuation',
    async () => {
      const parents = convexTable(
        'limit_stress_parents_byte',
        { slug: text().notNull() },
        (t) => [index('by_slug').on(t.slug)]
      );
      const child = convexTable(
        'limit_stress_children_byte',
        {
          parentId: id('limit_stress_parents_byte'),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('set null'),
        ]
      );
      const payload = 'x'.repeat(3_000);
      const sampleBytes = estimateBytes({ parentId: 'sample', payload });

      const tables = {
        limit_stress_parents_byte: parents,
        limit_stress_children_byte: child,
      };
      const schema = defineSchema(tables, {
        defaults: {
          mutationExecutionMode: 'async',
          mutationBatchSize: 50,
          mutationLeafBatchSize: 50,
          mutationMaxRows: 10_000,
          mutationMaxBytesPerBatch: sampleBytes + 300,
        },
      });
      const relations = defineRelations(tables);
      const edges = extractRelationsConfig(relations);
      const t = convexTest(schema);
      const { queue, scheduler } = makeQueueScheduler();
      const scheduledMutationBatch = {} as SchedulableFunctionReference;
      const worker = scheduledMutationBatchFactory(
        relations,
        edges,
        scheduledMutationBatch
      );

      let parentId: any;
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        const [parent] = await ctx.orm
          .insert(parents)
          .values({ slug: 'byte-parent' })
          .returning();
        parentId = parent.id;
      });

      const totalChildren = 30;
      await seedInBatches({
        total: totalChildren,
        batchSize: 10,
        makeDoc: () => ({ parentId, payload }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(child).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations, {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        });

        await ctx.orm.delete(parents).where(eq(parents.id, parentId)).execute();

        const remainingBeforeDrain = await ctx.db
          .query('limit_stress_children_byte')
          .withIndex('by_parent_id', (q) => q.eq('parentId', parentId))
          .collect();

        expect(remainingBeforeDrain.length).toBeGreaterThan(0);
        expect(remainingBeforeDrain.length).toBeLessThan(totalChildren);
        expect(queue.length).toBeGreaterThan(0);

        const iterations = await drainScheduledQueue({
          queue,
          worker,
          db: ctx.db,
          scheduler,
          maxIterations: 2_000,
        });
        expect(iterations).toBeGreaterThan(1);

        await assertEventuallyEmpty({
          db: ctx.db,
          tableName: 'limit_stress_children_byte',
          indexName: 'by_parent_id',
          eqField: 'parentId',
          eqValue: parentId,
        });
      });
    },
    120_000
  );

  stressTest(
    'D) mutationScheduleCallCap breach throws on multi-edge async continuation scheduling',
    async () => {
      const parents = convexTable(
        'limit_stress_parents_cap',
        { slug: text().notNull() },
        (t) => [index('by_slug').on(t.slug)]
      );
      const childA = convexTable(
        'limit_stress_children_cap_a',
        {
          parentId: id('limit_stress_parents_cap'),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('set null'),
        ]
      );
      const childB = convexTable(
        'limit_stress_children_cap_b',
        {
          parentId: id('limit_stress_parents_cap'),
          payload: text().notNull(),
        },
        (t) => [
          index('by_parent_id').on(t.parentId),
          foreignKey({
            columns: [t.parentId],
            foreignColumns: [parents.id],
          }).onDelete('set null'),
        ]
      );

      const tables = {
        limit_stress_parents_cap: parents,
        limit_stress_children_cap_a: childA,
        limit_stress_children_cap_b: childB,
      };
      const schema = defineSchema(tables, {
        defaults: {
          mutationExecutionMode: 'async',
          mutationBatchSize: 1,
          mutationLeafBatchSize: 1,
          mutationMaxRows: 1_000,
          mutationScheduleCallCap: 1,
        },
      });
      const relations = defineRelations(tables);
      const t = convexTest(schema);
      const { scheduler } = makeQueueScheduler();
      const scheduledMutationBatch = {} as SchedulableFunctionReference;

      let parentId: any;
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        const [parent] = await ctx.orm
          .insert(parents)
          .values({ slug: 'cap-parent' })
          .returning();
        parentId = parent.id;
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await ctx.orm.insert(childA).values([
          { parentId, payload: 'a-1' },
          { parentId, payload: 'a-2' },
        ]);
        await ctx.orm.insert(childB).values([
          { parentId, payload: 'b-1' },
          { parentId, payload: 'b-2' },
        ]);
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations, {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        });
        await expect(
          ctx.orm.delete(parents).where(eq(parents.id, parentId)).execute()
        ).rejects.toThrow(/mutationScheduleCallCap/i);
      });
    },
    60_000
  );

  stressTest(
    'E) mutationMaxRows fail-fast trips with reduced local limit',
    async () => {
      const rows = convexTable(
        'limit_stress_rows_cap',
        {
          status: text().notNull(),
          role: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      const tables = { limit_stress_rows_cap: rows };
      const schema = defineSchema(tables, {
        defaults: {
          mutationBatchSize: 10,
          mutationMaxRows: 50,
        },
      });
      const relations = defineRelations(tables);
      const t = convexTest(schema);

      await seedInBatches({
        total: 75,
        batchSize: 25,
        makeDoc: () => ({ status: 'active', role: 'seed' }),
        insertBatch: async (docs) => {
          await t.run(async (baseCtx) => {
            const ctx = withOrm(baseCtx, relations);
            await ctx.orm.insert(rows).values(docs);
          });
        },
      });

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await expect(
          ctx.orm
            .update(rows)
            .set({ role: 'updated' })
            .where(eq(rows.status, 'active'))
            .execute()
        ).rejects.toThrow(/mutationMaxRows|matched more than|exceed/i);
      });
    },
    60_000
  );

  stressTest(
    'E) invalid mutationMaxBytesPerBatch fails fast',
    () => {
      const rows = convexTable(
        'limit_stress_invalid_bytes',
        {
          status: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      expect(() =>
        defineSchema(
          { limit_stress_invalid_bytes: rows },
          {
            defaults: {
              mutationMaxBytesPerBatch: 0,
            },
          }
        )
      ).toThrow(
        /defineSchema defaults\.mutationMaxBytesPerBatch must be a positive integer/i
      );
    },
    60_000
  );

  stressTest(
    'E) invalid mutationScheduleCallCap fails fast',
    () => {
      const rows = convexTable(
        'limit_stress_invalid_cap',
        {
          status: text().notNull(),
        },
        (t) => [index('by_status').on(t.status)]
      );
      expect(() =>
        defineSchema(
          { limit_stress_invalid_cap: rows },
          {
            defaults: {
              mutationScheduleCallCap: 0,
            },
          }
        )
      ).toThrow(
        /defineSchema defaults\.mutationScheduleCallCap must be a positive integer/i
      );
    },
    60_000
  );
});
