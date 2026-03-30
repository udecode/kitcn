/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import type { SchedulableFunctionReference } from 'convex/server';
import { expect, test } from 'vitest';
import schema from '../../../../convex/schema';
import { convexTest } from '../../../../convex/setup.testing';
import { scheduledDeleteFactory } from './scheduled-delete';
import { scheduledMutationBatchFactory } from './scheduled-mutation-batch';
import { requireSchemaRelations } from './schema';

const scheduledRef = {} as SchedulableFunctionReference;

const scheduler = {
  runAfter: async () => null,
};
const relations = requireSchemaRelations(schema);

test('scheduledMutationBatch validates unknown table', async () => {
  const worker = scheduledMutationBatchFactory(
    relations as any,
    [],
    scheduledRef
  );
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'update',
          table: 'missing_table',
          cursor: null,
          batchSize: 10,
          delayMs: 0,
          update: { name: 'x' },
        }
      )
    ).rejects.toThrow(/unknown table/i);
  });
});

test('scheduledMutationBatch validates batchSize, delayMs and maxBytesPerBatch', async () => {
  const worker = scheduledMutationBatchFactory(
    relations as any,
    [],
    scheduledRef
  );
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'update',
          table: 'users',
          cursor: null,
          batchSize: 0,
          delayMs: 0,
          update: { name: 'x' },
        }
      )
    ).rejects.toThrow(/batchSize must be a positive integer/i);

    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'update',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: -1,
          update: { name: 'x' },
        }
      )
    ).rejects.toThrow(/delayMs must be a non-negative number/i);

    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'update',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
          maxBytesPerBatch: 0,
          update: { name: 'x' },
        }
      )
    ).rejects.toThrow(/maxBytesPerBatch must be a positive integer/i);
  });
});

test('scheduledMutationBatch validates root-update and root-delete constraints', async () => {
  const worker = scheduledMutationBatchFactory(
    relations as any,
    [],
    scheduledRef
  );
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'update',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
        }
      )
    ).rejects.toThrow(/requires update values/i);

    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          operation: 'delete',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
          deleteMode: 'scheduled',
        }
      )
    ).rejects.toThrow(/deleteMode "scheduled" is not supported/i);
  });
});

test('scheduledMutationBatch validates cascade-work required fields', async () => {
  const worker = scheduledMutationBatchFactory(
    relations as any,
    [],
    scheduledRef
  );
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          workType: 'cascade-delete',
          operation: 'delete',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
        }
      )
    ).rejects.toThrow(/foreignSourceColumns are required/i);

    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          workType: 'cascade-delete',
          operation: 'delete',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
          foreignSourceColumns: ['cityId'],
        }
      )
    ).rejects.toThrow(/targetValues are required/i);

    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          workType: 'cascade-delete',
          operation: 'delete',
          table: 'users',
          cursor: null,
          batchSize: 1,
          delayMs: 0,
          foreignSourceColumns: ['cityId'],
          targetValues: [null],
        }
      )
    ).rejects.toThrow(/foreignIndexName is required/i);
  });
});

test('scheduledDelete validates unknown table', async () => {
  const worker = scheduledDeleteFactory(relations as any, [], scheduledRef);
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await expect(
      worker(
        { db: ctx.db as any, scheduler: scheduler as any },
        {
          table: 'missing_table',
          id: 'x' as any,
        }
      )
    ).rejects.toThrow(/unknown table/i);
  });
});
