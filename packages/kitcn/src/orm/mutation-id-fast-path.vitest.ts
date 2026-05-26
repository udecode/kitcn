import { defineSchema as defineConvexSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import { convexTable, createOrm, defineRelations, inArray, text } from '.';
import { scheduledMutationBatchFactory } from './scheduled-mutation-batch';

const MUTATION_MAX_ROWS_RE = /mutationMaxRows/;

const mutationUsers = convexTable('mutation_id_users', {
  name: text().notNull(),
  status: text().notNull(),
});

const mutationPosts = convexTable('mutation_id_posts', {
  title: text().notNull(),
});

const runtimeSchema = defineConvexSchema({
  mutation_id_users: defineTable({
    name: v.string(),
    status: v.string(),
  }),
  mutation_id_posts: defineTable({
    title: v.string(),
  }),
});

const schema = defineRelations({
  mutation_id_users: mutationUsers,
  mutation_id_posts: mutationPosts,
});
const scheduledMutationBatch = {} as any;
const orm = createOrm({
  schema,
  ormFunctions: { scheduledMutationBatch },
});

const createScheduler = (calls: unknown[]) => ({
  runAfter: async (_delayMs: number, _ref: unknown, args: unknown) => {
    calls.push(args);
    return null;
  },
});

describe('ORM mutation id fast path', () => {
  test('update uses primary ids from inArray without allowFullScan', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const firstId = await ctx.db.insert('mutation_id_users', {
        name: 'First',
        status: 'waiting',
      });
      const secondId = await ctx.db.insert('mutation_id_users', {
        name: 'Second',
        status: 'waiting',
      });
      await ctx.db.insert('mutation_id_users', {
        name: 'Third',
        status: 'waiting',
      });

      const db = orm.db(ctx.db as any) as any;

      await db
        .update(mutationUsers)
        .set({ status: 'queued' })
        .where(inArray(mutationUsers.id, [firstId, secondId]))
        .execute();

      const updated = await db.query.mutation_id_users.findMany({
        where: { id: { in: [firstId, secondId] } },
        limit: 2,
      });

      expect(updated.map((row: any) => row.status)).toEqual([
        'queued',
        'queued',
      ]);
    });
  });

  test('delete uses primary ids from inArray without allowFullScan', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const firstId = await ctx.db.insert('mutation_id_users', {
        name: 'First',
        status: 'waiting',
      });
      const secondId = await ctx.db.insert('mutation_id_users', {
        name: 'Second',
        status: 'waiting',
      });
      const thirdId = await ctx.db.insert('mutation_id_users', {
        name: 'Third',
        status: 'waiting',
      });

      const db = orm.db(ctx.db as any) as any;

      await db
        .delete(mutationUsers)
        .where(inArray(mutationUsers.id, [firstId, secondId]))
        .execute();

      const remaining = await db.query.mutation_id_users.findMany({
        where: { id: { in: [firstId, secondId, thirdId] } },
        limit: 3,
      });

      expect(remaining.map((row: any) => row.id)).toEqual([thirdId]);
    });
  });

  test('delete ignores primary ids from other tables', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const postId = await ctx.db.insert('mutation_id_posts', {
        title: 'Wrong table',
      });
      const db = orm.db(ctx.db as any) as any;

      await db
        .delete(mutationUsers)
        .where(inArray(mutationUsers.id, [postId]))
        .execute();

      expect(await ctx.db.get(postId)).toMatchObject({
        title: 'Wrong table',
      });
    });
  });

  test('update rejects oversized primary id arrays before reading', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const db = orm.db(ctx.db as any) as any;
      const ids = Array.from({ length: 10_001 }, (_, index) => String(index));

      await expect(
        db
          .update(mutationUsers)
          .set({ status: 'queued' })
          .where(inArray(mutationUsers.id, ids as any))
          .execute()
      ).rejects.toThrow(MUTATION_MAX_ROWS_RE);
    });
  });

  test('async update continues primary id arrays through scheduled batches', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const firstId = await ctx.db.insert('mutation_id_users', {
        name: 'First',
        status: 'waiting',
      });
      const secondId = await ctx.db.insert('mutation_id_users', {
        name: 'Second',
        status: 'waiting',
      });
      const scheduledCalls: unknown[] = [];
      const db = orm.db(
        {
          db: ctx.db,
          scheduler: createScheduler(scheduledCalls),
        } as any,
        { scheduledMutationBatch }
      ) as any;

      await db
        .update(mutationUsers)
        .set({ status: 'queued' })
        .where(inArray(mutationUsers.id, [firstId, secondId]))
        .execute({ batchSize: 1 });

      expect(scheduledCalls).toHaveLength(1);

      const worker = scheduledMutationBatchFactory(
        schema as any,
        [],
        scheduledMutationBatch
      );
      await worker(
        {
          db: ctx.db as any,
          scheduler: createScheduler([]) as any,
        },
        scheduledCalls[0] as any
      );

      const updated = await db.query.mutation_id_users.findMany({
        where: { id: { in: [firstId, secondId] } },
        limit: 2,
      });

      expect(updated.map((row: any) => row.status)).toEqual([
        'queued',
        'queued',
      ]);
    });
  });

  test('async delete continues primary id arrays through scheduled batches', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const firstId = await ctx.db.insert('mutation_id_users', {
        name: 'First',
        status: 'waiting',
      });
      const secondId = await ctx.db.insert('mutation_id_users', {
        name: 'Second',
        status: 'waiting',
      });
      const scheduledCalls: unknown[] = [];
      const db = orm.db(
        {
          db: ctx.db,
          scheduler: createScheduler(scheduledCalls),
        } as any,
        { scheduledMutationBatch }
      ) as any;

      await db
        .delete(mutationUsers)
        .where(inArray(mutationUsers.id, [firstId, secondId]))
        .execute({ batchSize: 1 });

      expect(scheduledCalls).toHaveLength(1);

      const worker = scheduledMutationBatchFactory(
        schema as any,
        [],
        scheduledMutationBatch
      );
      await worker(
        {
          db: ctx.db as any,
          scheduler: createScheduler([]) as any,
        },
        scheduledCalls[0] as any
      );

      const remaining = await db.query.mutation_id_users.findMany({
        where: { id: { in: [firstId, secondId] } },
        limit: 2,
      });

      expect(remaining).toEqual([]);
    });
  });
});
