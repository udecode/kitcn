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
  index,
  scheduledMutationBatchFactory,
  text,
} from 'kitcn/orm';
import { expect, test, vi } from 'vitest';
import { convexTest, withOrm } from '../setup.testing';

const tuneTest = process.env.CONVEX_LIMIT_TUNE === '1' ? test : test.skip;

type DefaultsProfile = {
  name: string;
  mutationBatchSize: number;
  mutationLeafBatchSize: number;
  mutationMaxRows: number;
  mutationMaxBytesPerBatch: number;
  mutationScheduleCallCap: number;
  mutationAsyncDelayMs: number;
};

type WorkloadMetrics = {
  elapsedMs: number;
  scheduleCalls: number;
  drainIterations: number;
  firstBatchSize: number;
};

type ProfileResult = {
  profile: DefaultsProfile;
  stable: boolean;
  rootUpdate?: WorkloadMetrics;
  cascadeDelete?: WorkloadMetrics;
  score?: number;
  error?: string;
};

const readPositiveIntEnv = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const ROOT_TARGET_ROWS = readPositiveIntEnv(
  'CONVEX_TUNE_ROOT_TARGET_ROWS',
  12_000
);
const ROOT_OTHER_ROWS = readPositiveIntEnv(
  'CONVEX_TUNE_ROOT_OTHER_ROWS',
  2_000
);
const ROOT_INSERT_BATCH_SIZE = readPositiveIntEnv(
  'CONVEX_TUNE_ROOT_INSERT_BATCH_SIZE',
  500
);

const CASCADE_CHILDREN_PER_EDGE = readPositiveIntEnv(
  'CONVEX_TUNE_CASCADE_CHILDREN_PER_EDGE',
  4_000
);
const CASCADE_INSERT_BATCH_SIZE = readPositiveIntEnv(
  'CONVEX_TUNE_CASCADE_INSERT_BATCH_SIZE',
  500
);

const CANDIDATE_PROFILES: DefaultsProfile[] = [
  {
    name: 'baseline_100_900_cap100',
    mutationBatchSize: 100,
    mutationLeafBatchSize: 900,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 100,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'balanced_150_900_cap250',
    mutationBatchSize: 150,
    mutationLeafBatchSize: 900,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 250,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'balanced_200_800_cap500',
    mutationBatchSize: 200,
    mutationLeafBatchSize: 800,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 500,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'balanced_250_1000_cap500',
    mutationBatchSize: 250,
    mutationLeafBatchSize: 1000,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 500,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'throughput_300_1200_cap600',
    mutationBatchSize: 300,
    mutationLeafBatchSize: 1200,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 600,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'aggressive_400_1600_cap800',
    mutationBatchSize: 400,
    mutationLeafBatchSize: 1600,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 800,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'extreme_450_1800_cap1000',
    mutationBatchSize: 450,
    mutationLeafBatchSize: 1800,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 1000,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'extreme_500_2000_cap1200',
    mutationBatchSize: 500,
    mutationLeafBatchSize: 2000,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 1200,
    mutationAsyncDelayMs: 0,
  },
  {
    name: 'extreme_600_2400_cap1600',
    mutationBatchSize: 600,
    mutationLeafBatchSize: 2400,
    mutationMaxRows: 10_000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 1600,
    mutationAsyncDelayMs: 0,
  },
];

const SAFETY_BOUNDED_LIMITS = {
  maxBatchSize: 400,
  maxLeafBatchSize: 1600,
  maxScheduleCallCap: 1000,
};

const PROFILE_FILTER = process.env.CONVEX_TUNE_PROFILE;
const ACTIVE_PROFILES = PROFILE_FILTER
  ? CANDIDATE_PROFILES.filter((profile) => profile.name === PROFILE_FILTER)
  : CANDIDATE_PROFILES;

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

const runRootUpdateWorkload = async (
  profile: DefaultsProfile
): Promise<WorkloadMetrics> => {
  const rows = convexTable(
    'tune_root_rows',
    {
      status: text().notNull(),
      role: text().notNull(),
      payload: text().notNull(),
    },
    (t) => [index('by_status').on(t.status)]
  );
  const tables = { tune_root_rows: rows };
  const schema = defineSchema(tables, {
    defaults: {
      mutationExecutionMode: 'async',
      mutationBatchSize: profile.mutationBatchSize,
      mutationLeafBatchSize: profile.mutationLeafBatchSize,
      mutationMaxRows: profile.mutationMaxRows,
      mutationMaxBytesPerBatch: profile.mutationMaxBytesPerBatch,
      mutationScheduleCallCap: profile.mutationScheduleCallCap,
      mutationAsyncDelayMs: profile.mutationAsyncDelayMs,
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

  const payload = 'x'.repeat(256);
  await seedInBatches({
    total: ROOT_TARGET_ROWS + ROOT_OTHER_ROWS,
    batchSize: ROOT_INSERT_BATCH_SIZE,
    makeDoc: (i) => ({
      status: i < ROOT_TARGET_ROWS ? 'target' : 'other',
      role: 'seed',
      payload,
    }),
    insertBatch: async (docs) => {
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await ctx.orm.insert(rows).values(docs);
      });
    },
  });

  let elapsedMs = 0;
  let drainIterations = 0;
  let firstBatchSize = 0;

  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, relations, {
      scheduler: scheduler as any,
      scheduledMutationBatch,
    });
    const startedAt = performance.now();

    const firstBatch = await ctx.orm
      .update(rows)
      .set({ role: 'processed' })
      .where(eq(rows.status, 'target'))
      .returning({ id: rows.id })
      .execute();
    firstBatchSize = firstBatch.length;
    expect(firstBatchSize).toBe(profile.mutationBatchSize);

    drainIterations = await drainScheduledQueue({
      queue,
      worker,
      db: ctx.db,
      scheduler,
      maxIterations: 8_000,
    });

    const targetRows = await ctx.db
      .query('tune_root_rows')
      .withIndex('by_status', (q) => q.eq('status', 'target'))
      .collect();
    expect(targetRows).toHaveLength(ROOT_TARGET_ROWS);
    expect(targetRows.every((row) => row.role === 'processed')).toBe(true);

    elapsedMs = performance.now() - startedAt;
  });

  return {
    elapsedMs,
    scheduleCalls: scheduler.runAfter.mock.calls.length,
    drainIterations,
    firstBatchSize,
  };
};

const runCascadeDeleteWorkload = async (
  profile: DefaultsProfile
): Promise<WorkloadMetrics> => {
  const parents = convexTable(
    'tune_delete_parents',
    { slug: text().notNull() },
    (t) => [index('by_slug').on(t.slug)]
  );
  const childA = convexTable(
    'tune_delete_child_a',
    {
      parentId: id('tune_delete_parents').notNull(),
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
    'tune_delete_child_b',
    {
      parentId: id('tune_delete_parents').notNull(),
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
    tune_delete_parents: parents,
    tune_delete_child_a: childA,
    tune_delete_child_b: childB,
  };
  const schema = defineSchema(tables, {
    defaults: {
      mutationExecutionMode: 'async',
      mutationBatchSize: profile.mutationBatchSize,
      mutationLeafBatchSize: profile.mutationLeafBatchSize,
      mutationMaxRows: profile.mutationMaxRows,
      mutationMaxBytesPerBatch: profile.mutationMaxBytesPerBatch,
      mutationScheduleCallCap: profile.mutationScheduleCallCap,
      mutationAsyncDelayMs: profile.mutationAsyncDelayMs,
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
  const parentSlug = `parent-${profile.name}`;
  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, relations);
    const [parent] = await ctx.orm
      .insert(parents)
      .values({ slug: parentSlug })
      .returning();
    parentId = parent.id;
  });

  await seedInBatches({
    total: CASCADE_CHILDREN_PER_EDGE,
    batchSize: CASCADE_INSERT_BATCH_SIZE,
    makeDoc: (i) => ({
      parentId,
      parentSlug,
      payload: `a-${i}`,
    }),
    insertBatch: async (docs) => {
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await ctx.orm.insert(childA).values(docs);
      });
    },
  });

  await seedInBatches({
    total: CASCADE_CHILDREN_PER_EDGE,
    batchSize: CASCADE_INSERT_BATCH_SIZE,
    makeDoc: (i) => ({
      parentId,
      parentSlug,
      payload: `b-${i}`,
    }),
    insertBatch: async (docs) => {
      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, relations);
        await ctx.orm.insert(childB).values(docs);
      });
    },
  });

  let elapsedMs = 0;
  let drainIterations = 0;
  let firstBatchSize = 0;

  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, relations, {
      scheduler: scheduler as any,
      scheduledMutationBatch,
    });
    const startedAt = performance.now();

    const firstBatch = await ctx.orm
      .delete(parents)
      .where(eq(parents.id, parentId))
      .returning({ id: parents.id })
      .execute();
    firstBatchSize = firstBatch.length;
    expect(firstBatchSize).toBe(1);

    drainIterations = await drainScheduledQueue({
      queue,
      worker,
      db: ctx.db,
      scheduler,
      maxIterations: 15_000,
    });

    expect(await ctx.db.get(parentId)).toBeNull();
    const remainingA = await ctx.db
      .query('tune_delete_child_a')
      .withIndex('by_parent_id', (q) => q.eq('parentId', parentId))
      .collect();
    const remainingB = await ctx.db
      .query('tune_delete_child_b')
      .withIndex('by_parent_id', (q) => q.eq('parentId', parentId))
      .collect();
    expect(remainingA).toHaveLength(0);
    expect(remainingB).toHaveLength(0);

    elapsedMs = performance.now() - startedAt;
  });

  return {
    elapsedMs,
    scheduleCalls: scheduler.runAfter.mock.calls.length,
    drainIterations,
    firstBatchSize,
  };
};

tuneTest(
  'profile search finds best stable mutation defaults from stress workloads',
  async () => {
    const results: ProfileResult[] = [];

    expect(ACTIVE_PROFILES.length).toBeGreaterThan(0);

    for (const profile of ACTIVE_PROFILES) {
      try {
        const rootUpdate = await runRootUpdateWorkload(profile);
        const cascadeDelete = await runCascadeDeleteWorkload(profile);
        const totalScheduleCalls =
          rootUpdate.scheduleCalls + cascadeDelete.scheduleCalls;
        const totalElapsedMs = rootUpdate.elapsedMs + cascadeDelete.elapsedMs;
        const score = totalScheduleCalls * 10_000 + totalElapsedMs;

        results.push({
          profile,
          stable: true,
          rootUpdate,
          cascadeDelete,
          score,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          profile,
          stable: false,
          error: message,
        });
      }
    }

    const stableResults = results
      .filter((result): result is ProfileResult & { score: number } =>
        result.stable ? typeof result.score === 'number' : false
      )
      .sort((a, b) => a.score - b.score);

    expect(stableResults.length).toBeGreaterThan(0);

    const best = stableResults[0];
    const safetyBounded = stableResults.filter(
      (result) =>
        result.profile.mutationBatchSize <=
          SAFETY_BOUNDED_LIMITS.maxBatchSize &&
        result.profile.mutationLeafBatchSize <=
          SAFETY_BOUNDED_LIMITS.maxLeafBatchSize &&
        result.profile.mutationScheduleCallCap <=
          SAFETY_BOUNDED_LIMITS.maxScheduleCallCap
    );
    expect(safetyBounded.length).toBeGreaterThan(0);
    const bestSafetyBounded = safetyBounded[0];
    const lines = [
      '',
      '[limits-tune] profile ranking (stable only):',
      ...stableResults.map((result, index) => {
        const root = result.rootUpdate!;
        const cascade = result.cascadeDelete!;
        return `[limits-tune] #${index + 1} ${result.profile.name} score=${result.score.toFixed(
          0
        )} root(schedule=${root.scheduleCalls},iter=${
          root.drainIterations
        },ms=${root.elapsedMs.toFixed(
          0
        )}) cascade(schedule=${cascade.scheduleCalls},iter=${
          cascade.drainIterations
        },ms=${cascade.elapsedMs.toFixed(0)})`;
      }),
      ...results
        .filter((result) => !result.stable)
        .map(
          (result) =>
            `[limits-tune] unstable ${result.profile.name}: ${result.error}`
        ),
      `[limits-tune] best=${best.profile.name}`,
      `[limits-tune] best-safety-bounded=${bestSafetyBounded.profile.name} bounds(batch<=${SAFETY_BOUNDED_LIMITS.maxBatchSize},leaf<=${SAFETY_BOUNDED_LIMITS.maxLeafBatchSize},cap<=${SAFETY_BOUNDED_LIMITS.maxScheduleCallCap})`,
      '',
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  },
  600_000
);
