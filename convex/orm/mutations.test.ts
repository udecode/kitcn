/**
 * M7 Mutations - Insert/Update/Delete Tests
 *
 * Tests Drizzle-style mutation builder API:
 * - insert().values().returning()
 * - update().set().where().returning()
 * - delete().where().returning()
 * - onConflictDoNothing/onConflictDoUpdate
 */

import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  deletion,
  eq,
  extractRelationsConfig,
  inArray,
  index,
  integer,
  isNotNull,
  ne,
  notInArray,
  scheduledMutationBatchFactory,
  text,
  timestamp,
} from 'better-convex/orm';
import { anyApi, type SchedulableFunctionReference } from 'convex/server';
import { it as baseIt, describe, expect, vi } from 'vitest';
import schema, { relations as appRelations, users } from '../schema';
import {
  convexTest,
  runCtx,
  type TestCtx,
  withOrm,
  withOrmCtx,
} from '../setup.testing';

const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

const baseUser = {
  name: 'Alice',
  email: 'alice@example.com',
  height: 1.8,
  age: 30,
  status: 'active',
  role: 'member',
  deletedAt: 0,
  cityId: null,
  homeCityId: null,
};

const scheduledMutationBatchRef = anyApi.orm
  .scheduledMutationBatch as SchedulableFunctionReference;

const relationCountSchedulerStub = {
  runAfter: vi.fn(async () => undefined),
};

const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const runBackfillToReady = async (api: any, ctx: { db: any }) => {
  await (api as any).aggregateBackfill.handler(
    { db: ctx.db, scheduler: relationCountSchedulerStub },
    {}
  );

  for (let i = 0; i < 20; i += 1) {
    const status = await (api as any).aggregateBackfillStatus.handler(
      { db: ctx.db, scheduler: relationCountSchedulerStub },
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await (api as any).aggregateBackfillChunk.handler(
      { db: ctx.db, scheduler: relationCountSchedulerStub },
      {}
    );
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

describe('M7 Mutations', () => {
  it('should insert and return full row', async ({ ctx }) => {
    const db = ctx.orm;
    const [user] = await db.insert(users).values(baseUser).returning();

    expect(user).toBeDefined();
    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.id).toBeDefined();
  });

  it('should support returning({ _count }) on update and delete', async () => {
    const mutationCountUsers = convexTable('mutationCountUsers', {
      name: text().notNull(),
    });
    const mutationCountPosts = convexTable(
      'mutationCountPosts',
      {
        authorId: text().notNull(),
        status: text().notNull(),
      },
      (t) => [
        aggregateIndex('by_author').on(t.authorId),
        aggregateIndex('by_author_status').on(t.authorId, t.status),
      ]
    );

    const customSchema = defineSchema({
      mutationCountUsers,
      mutationCountPosts,
    });
    const customRelations = defineRelations(
      { mutationCountUsers, mutationCountPosts },
      (r) => ({
        mutationCountUsers: {
          posts: r.many.mutationCountPosts({
            from: r.mutationCountUsers.id,
            to: r.mutationCountPosts.authorId,
          }),
        },
        mutationCountPosts: {
          author: r.one.mutationCountUsers({
            from: r.mutationCountPosts.authorId,
            to: r.mutationCountUsers.id,
          }),
        },
      })
    );

    const t = convexTest(customSchema);
    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: customRelations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: relationCountSchedulerStub as any,
      });
      const api = ormClient.api();

      const userId = await ctx.db.insert('mutationCountUsers', {
        name: 'Alice',
      });
      await ctx.db.insert('mutationCountPosts', {
        authorId: userId,
        status: 'published',
      });
      await ctx.db.insert('mutationCountPosts', {
        authorId: userId,
        status: 'published',
      });
      await ctx.db.insert('mutationCountPosts', {
        authorId: userId,
        status: 'draft',
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const updated = await ctx.orm
        .update(mutationCountUsers)
        .set({ name: 'Alice Updated' })
        .where(eq(mutationCountUsers.id, userId))
        .returning({
          name: mutationCountUsers.name,
          _count: {
            posts: {
              where: {
                status: 'published',
              },
            },
          },
        });

      expect(updated).toEqual([
        {
          name: 'Alice Updated',
          _count: {
            posts: 2,
          },
        },
      ]);

      const deleted = await ctx.orm
        .delete(mutationCountUsers)
        .where(eq(mutationCountUsers.id, userId))
        .returning({
          name: mutationCountUsers.name,
          _count: {
            posts: true,
          },
        });

      expect(deleted).toEqual([
        {
          name: 'Alice Updated',
          _count: {
            posts: 3,
          },
        },
      ]);
    });
  });

  it('should insert and return partial fields', async ({ ctx }) => {
    const db = ctx.orm;
    const [user] = await db.insert(users).values(baseUser).returning({
      name: users.name,
      email: users.email,
    });

    expect(user).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  it('should support returning() on nullable timestamp columns in convex-test', async () => {
    const localSubscriptions = convexTable('localSubscriptions', {
      plan: text().notNull(),
      referenceId: text().notNull(),
      status: text(),
      periodStart: timestamp(),
      periodEnd: timestamp(),
      trialStart: timestamp(),
      trialEnd: timestamp(),
      createdAt: timestamp().notNull().defaultNow(),
      updatedAt: timestamp().notNull().defaultNow(),
    });
    const localSchema = defineSchema({
      localSubscriptions,
    });
    const localRelations = defineRelations(
      {
        localSubscriptions,
      },
      () => ({})
    );

    await withOrmCtx(localSchema, localRelations, async ({ orm }) => {
      const [sub] = await orm
        .insert(localSubscriptions)
        .values({ plan: 'pro', referenceId: 'ref_1', status: 'active' })
        .returning();

      expect(sub.id).toBeDefined();
      expect(sub.periodStart).toBeUndefined();
      expect(sub.periodEnd).toBeUndefined();
      expect(sub.trialStart).toBeUndefined();
      expect(sub.trialEnd).toBeUndefined();
    });
  });

  it('should update rows and return updated values', async ({ ctx }) => {
    const db = ctx.orm;
    const [user] = await db.insert(users).values(baseUser).returning();

    const [updated] = await db
      .update(users)
      .set({ name: 'Updated' })
      .where(eq(users.id, user.id))
      .returning();

    expect(updated.name).toBe('Updated');
  });

  it('should delete rows and return deleted values', async ({ ctx }) => {
    const db = ctx.orm;
    const [user] = await db.insert(users).values(baseUser).returning();

    const deleted = await db
      .delete(users)
      .where(eq(users.id, user.id))
      .returning({
        name: users.name,
        email: users.email,
      });

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
    });
    expect(await ctx.db.get(user.id as any)).toBeNull();
  });

  it('should skip insert on conflict do nothing', async ({ ctx }) => {
    const db = ctx.orm;
    await db.insert(users).values(baseUser).returning();

    const result = await db
      .insert(users)
      .values({
        ...baseUser,
        name: 'Duplicate',
      })
      .onConflictDoNothing({ target: users.email })
      .returning();

    expect(result).toHaveLength(0);
  });

  it('should update existing row on conflict do update', async ({ ctx }) => {
    const db = ctx.orm;
    await db.insert(users).values(baseUser).returning();

    const [updated] = await db
      .insert(users)
      .values({
        ...baseUser,
        name: 'Second',
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: 'Updated' },
      })
      .returning();

    expect(updated.name).toBe('Updated');
  });

  it('should allow update/delete with indexed where without allowFullScan', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    await db.insert(users).values(baseUser).returning();

    const updated = await db
      .update(users)
      .set({ name: 'Indexed' })
      .where(eq(users.email, baseUser.email))
      .returning();

    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('Indexed');

    const deleted = await db
      .delete(users)
      .where(eq(users.email, baseUser.email))
      .returning();

    expect(deleted).toHaveLength(1);
  });

  it('should no-op id equality with undefined without requiring allowFullScan', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    const [user] = await db.insert(users).values(baseUser).returning();

    const updated = await db
      .update(users)
      .set({ name: 'ShouldNotApply' })
      .where(eq(users.id, undefined as any))
      .returning();

    expect(updated).toEqual([]);
    expect(await ctx.db.get(user.id as any)).toMatchObject({
      name: baseUser.name,
    });

    const deleted = await db
      .delete(users)
      .where(eq(users.id, undefined as any))
      .returning();

    expect(deleted).toEqual([]);
    expect(await ctx.db.get(user.id as any)).toBeTruthy();
  });

  it('should allow inArray update/delete with indexed where without allowFullScan', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    await db.insert(users).values([
      { ...baseUser, email: 'in-array-a@example.com', status: 'active' },
      { ...baseUser, email: 'in-array-b@example.com', status: 'pending' },
      { ...baseUser, email: 'in-array-c@example.com', status: 'inactive' },
    ]);

    const updated = await db
      .update(users)
      .set({ role: 'targeted' })
      .where(inArray(users.status, ['active', 'pending']))
      .returning({
        email: users.email,
        role: users.role,
        status: users.status,
      });

    expect(updated).toHaveLength(2);
    expect(updated.every((row) => row.role === 'targeted')).toBe(true);

    const deleted = await db
      .delete(users)
      .where(inArray(users.status, ['active', 'pending']))
      .returning({ status: users.status });

    expect(deleted).toHaveLength(2);
    expect(deleted.every((row) => row.status !== 'inactive')).toBe(true);
  });

  it('should allow ne/notInArray/isNotNull update/delete without allowFullScan when indexed', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    await db.insert(users).values([
      {
        ...baseUser,
        email: 'operator-a@example.com',
        status: 'active',
        deletedAt: null,
      },
      {
        ...baseUser,
        email: 'operator-b@example.com',
        status: 'pending',
        deletedAt: 100,
      },
      {
        ...baseUser,
        email: 'operator-c@example.com',
        status: 'deleted',
        deletedAt: 200,
      },
    ]);

    const neUpdated = await db
      .update(users)
      .set({ role: 'kept' })
      .where(ne(users.status, 'deleted'))
      .returning({
        email: users.email,
        status: users.status,
        role: users.role,
      });

    expect(neUpdated).toHaveLength(2);
    expect(neUpdated.every((row) => row.status !== 'deleted')).toBe(true);

    const notInUpdated = await db
      .update(users)
      .set({ role: 'non-deleted' })
      .where(notInArray(users.status, ['deleted']))
      .returning({
        email: users.email,
        status: users.status,
        role: users.role,
      });

    expect(notInUpdated).toHaveLength(2);
    expect(notInUpdated.every((row) => row.status !== 'deleted')).toBe(true);

    const isNotNullDeleted = await db
      .delete(users)
      .where(isNotNull(users.deletedAt))
      .returning({ email: users.email, deletedAt: users.deletedAt });

    expect(isNotNullDeleted).toHaveLength(2);
    expect(isNotNullDeleted.every((row) => row.deletedAt !== null)).toBe(true);
  });

  it('should throw update/delete without where when strict is true', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    await db.insert(users).values(baseUser).returning();

    await expect(db.update(users).set({ name: 'NoWhere' })).rejects.toThrow(
      /allowFullScan/i
    );
    await expect(db.delete(users)).rejects.toThrow(/allowFullScan/i);
  });

  it('should require allowFullScan for update/delete without where', async () => {
    const relaxedUsers = convexTable('relaxedUsers', {
      name: text().notNull(),
    });
    const tables = { relaxedUsers };
    const relaxedSchema = defineSchema(tables, { strict: false });
    const relaxedRelations = defineRelations(tables);
    const relaxedEdges = extractRelationsConfig(relaxedRelations);

    const warn = console.warn;
    console.warn = () => {};
    try {
      await expect(
        withOrmCtx(relaxedSchema, relaxedRelations, async (ctx) => {
          await ctx.db.insert('relaxedUsers', { name: 'Alice' });
          await ctx.orm.update(relaxedUsers).set({ name: 'Bob' });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(relaxedSchema, relaxedRelations, async (ctx) => {
          await ctx.db.insert('relaxedUsers', { name: 'Alice' });
          await ctx.orm
            .update(relaxedUsers)
            .set({ name: 'Bob' })
            .allowFullScan();
          await ctx.orm.delete(relaxedUsers).allowFullScan();
        })
      ).resolves.toBeUndefined();
    } finally {
      console.warn = warn;
    }
  });

  it('should fail fast when update exceeds mutationMaxRows', async () => {
    const cappedUsers = convexTable(
      'cappedUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { cappedUsers };
    const cappedSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 1, mutationMaxRows: 2 },
    });
    const cappedRelations = defineRelations(tables);
    const cappedEdges = extractRelationsConfig(cappedRelations);

    await expect(
      withOrmCtx(cappedSchema, cappedRelations, async (ctx) => {
        await ctx.db.insert('cappedUsers', { name: 'A', status: 'draft' });
        await ctx.db.insert('cappedUsers', { name: 'B', status: 'draft' });
        await ctx.db.insert('cappedUsers', { name: 'C', status: 'draft' });

        await ctx.orm
          .update(cappedUsers)
          .set({ name: 'updated' })
          .where(eq(cappedUsers.status, 'draft'))
          .returning();
      })
    ).rejects.toThrow(/mutationMaxRows|exceed/i);
  });

  it('should fail fast when delete exceeds mutationMaxRows', async () => {
    const cappedUsers = convexTable(
      'cappedUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { cappedUsers };
    const cappedSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 1, mutationMaxRows: 2 },
    });
    const cappedRelations = defineRelations(tables);
    const cappedEdges = extractRelationsConfig(cappedRelations);

    await expect(
      withOrmCtx(cappedSchema, cappedRelations, async (ctx) => {
        await ctx.db.insert('cappedUsers', { name: 'A', status: 'draft' });
        await ctx.db.insert('cappedUsers', { name: 'B', status: 'draft' });
        await ctx.db.insert('cappedUsers', { name: 'C', status: 'draft' });

        await ctx.orm
          .delete(cappedUsers)
          .where(eq(cappedUsers.status, 'draft'))
          .returning();
      })
    ).rejects.toThrow(/mutationMaxRows|exceed/i);
  });

  it('should paginate update execution for large workloads', async () => {
    const pagedUsers = convexTable(
      'pagedUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { pagedUsers };
    const pagedSchema = defineSchema(tables);
    const pagedRelations = defineRelations(tables);
    const pagedEdges = extractRelationsConfig(pagedRelations);

    await withOrmCtx(pagedSchema, pagedRelations, async (ctx) => {
      await ctx.db.insert('pagedUsers', {
        name: 'A',
        status: 'draft',
        role: 'member',
      });
      await ctx.db.insert('pagedUsers', {
        name: 'B',
        status: 'draft',
        role: 'member',
      });
      await ctx.db.insert('pagedUsers', {
        name: 'C',
        status: 'draft',
        role: 'member',
      });

      const page1 = await ctx.orm
        .update(pagedUsers)
        .set({ role: 'editor' })
        .where(eq(pagedUsers.status, 'draft'))
        .returning({ name: pagedUsers.name, role: pagedUsers.role })
        .paginate({ cursor: null, limit: 2 });

      expect(page1.page).toHaveLength(2);
      expect(page1.numAffected).toBe(2);
      expect(page1.isDone).toBe(false);

      const page2 = await ctx.orm
        .update(pagedUsers)
        .set({ role: 'editor' })
        .where(eq(pagedUsers.status, 'draft'))
        .returning({ name: pagedUsers.name, role: pagedUsers.role })
        .paginate({ cursor: page1.continueCursor, limit: 2 });

      expect(page2.page).toHaveLength(1);
      expect(page2.numAffected).toBe(1);
      expect(page2.isDone).toBe(true);

      const rows = await ctx.db
        .query('pagedUsers')
        .withIndex('by_status', (q) => q.eq('status', 'draft'))
        .collect();
      expect(rows).toHaveLength(3);
      expect(rows.every((row: any) => row.role === 'editor')).toBe(true);
    });
  });

  it('should paginate delete execution for large workloads', async () => {
    const pagedDeleteUsers = convexTable(
      'pagedDeleteUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
        deletionTime: integer(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { pagedDeleteUsers };
    const pagedSchema = defineSchema(tables);
    const pagedRelations = defineRelations(tables);
    const pagedEdges = extractRelationsConfig(pagedRelations);

    await withOrmCtx(pagedSchema, pagedRelations, async (ctx) => {
      await ctx.db.insert('pagedDeleteUsers', {
        name: 'A',
        status: 'draft',
        role: 'member',
        deletionTime: null,
      });
      await ctx.db.insert('pagedDeleteUsers', {
        name: 'B',
        status: 'draft',
        role: 'member',
        deletionTime: null,
      });
      await ctx.db.insert('pagedDeleteUsers', {
        name: 'C',
        status: 'draft',
        role: 'member',
        deletionTime: null,
      });

      const page1 = await ctx.orm
        .delete(pagedDeleteUsers)
        .soft()
        .where(eq(pagedDeleteUsers.status, 'draft'))
        .paginate({ cursor: null, limit: 2 });

      expect(page1.numAffected).toBe(2);
      expect(page1.isDone).toBe(false);

      const page2 = await ctx.orm
        .delete(pagedDeleteUsers)
        .soft()
        .where(eq(pagedDeleteUsers.status, 'draft'))
        .paginate({ cursor: page1.continueCursor, limit: 2 });

      expect(page2.numAffected).toBe(1);
      expect(page2.isDone).toBe(true);

      const rows = await ctx.db
        .query('pagedDeleteUsers')
        .withIndex('by_status', (q) => q.eq('status', 'draft'))
        .collect();
      expect(rows).toHaveLength(3);
      expect(rows.every((row: any) => row.deletionTime !== null)).toBe(true);
    });
  });

  it('should delete with two cascade edges without triggering multi-paginate failures', async () => {
    const cascadeParent = convexTable(
      'cascade_parent_delete',
      {
        slug: text().notNull(),
      },
      (t) => [index('by_slug').on(t.slug)]
    );
    const cascadeChildA = convexTable(
      'cascade_child_delete_a',
      {
        label: text().notNull(),
        parentSlug: text()
          .references(() => cascadeParent.slug, { onDelete: 'cascade' })
          .notNull(),
      },
      (t) => [index('by_parentSlug').on(t.parentSlug)]
    );
    const cascadeChildB = convexTable(
      'cascade_child_delete_b',
      {
        label: text().notNull(),
        parentSlug: text()
          .references(() => cascadeParent.slug, { onDelete: 'cascade' })
          .notNull(),
      },
      (t) => [index('by_parentSlug').on(t.parentSlug)]
    );
    const tables = {
      cascade_child_delete_a: cascadeChildA,
      cascade_child_delete_b: cascadeChildB,
      cascade_parent_delete: cascadeParent,
    };
    const cascadeSchema = defineSchema(tables);
    const cascadeRelations = defineRelations(tables);

    await withOrmCtx(cascadeSchema, cascadeRelations, async (ctx) => {
      await ctx.db.insert('cascade_parent_delete', { slug: 'p1' });
      await ctx.db.insert('cascade_parent_delete', { slug: 'p2' });

      await ctx.db.insert('cascade_child_delete_a', {
        label: 'a-p1',
        parentSlug: 'p1',
      });
      await ctx.db.insert('cascade_child_delete_a', {
        label: 'a-p2',
        parentSlug: 'p2',
      });
      await ctx.db.insert('cascade_child_delete_b', {
        label: 'b-p1',
        parentSlug: 'p1',
      });
      await ctx.db.insert('cascade_child_delete_b', {
        label: 'b-p2',
        parentSlug: 'p2',
      });

      await ctx.orm
        .delete(cascadeParent)
        .where(eq(cascadeParent.slug, 'p1'))
        .execute();

      const remainingParentP1 = await ctx.db
        .query('cascade_parent_delete')
        .withIndex('by_slug', (q) => q.eq('slug', 'p1'))
        .collect();
      const remainingChildAP1 = await ctx.db
        .query('cascade_child_delete_a')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p1'))
        .collect();
      const remainingChildBP1 = await ctx.db
        .query('cascade_child_delete_b')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p1'))
        .collect();
      const remainingChildAP2 = await ctx.db
        .query('cascade_child_delete_a')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p2'))
        .collect();
      const remainingChildBP2 = await ctx.db
        .query('cascade_child_delete_b')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p2'))
        .collect();

      expect(remainingParentP1).toHaveLength(0);
      expect(remainingChildAP1).toHaveLength(0);
      expect(remainingChildBP1).toHaveLength(0);
      expect(remainingChildAP2).toHaveLength(1);
      expect(remainingChildBP2).toHaveLength(1);
    });
  });

  it('should update with two cascade edges without triggering multi-paginate failures', async () => {
    const cascadeParent = convexTable(
      'cascade_parent_update',
      {
        slug: text().notNull(),
      },
      (t) => [index('by_slug').on(t.slug)]
    );
    const cascadeChildA = convexTable(
      'cascade_child_update_a',
      {
        label: text().notNull(),
        parentSlug: text()
          .references(() => cascadeParent.slug, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
          })
          .notNull(),
      },
      (t) => [index('by_parentSlug').on(t.parentSlug)]
    );
    const cascadeChildB = convexTable(
      'cascade_child_update_b',
      {
        label: text().notNull(),
        parentSlug: text()
          .references(() => cascadeParent.slug, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
          })
          .notNull(),
      },
      (t) => [index('by_parentSlug').on(t.parentSlug)]
    );
    const tables = {
      cascade_child_update_a: cascadeChildA,
      cascade_child_update_b: cascadeChildB,
      cascade_parent_update: cascadeParent,
    };
    const cascadeSchema = defineSchema(tables);
    const cascadeRelations = defineRelations(tables);

    await withOrmCtx(cascadeSchema, cascadeRelations, async (ctx) => {
      await ctx.db.insert('cascade_parent_update', { slug: 'p1' });

      await ctx.db.insert('cascade_child_update_a', {
        label: 'a-p1',
        parentSlug: 'p1',
      });
      await ctx.db.insert('cascade_child_update_b', {
        label: 'b-p1',
        parentSlug: 'p1',
      });

      await ctx.orm
        .update(cascadeParent)
        .set({ slug: 'p2' })
        .where(eq(cascadeParent.slug, 'p1'))
        .execute();

      const oldChildAP1 = await ctx.db
        .query('cascade_child_update_a')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p1'))
        .collect();
      const oldChildBP1 = await ctx.db
        .query('cascade_child_update_b')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p1'))
        .collect();
      const newChildAP2 = await ctx.db
        .query('cascade_child_update_a')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p2'))
        .collect();
      const newChildBP2 = await ctx.db
        .query('cascade_child_update_b')
        .withIndex('by_parentSlug', (q) => q.eq('parentSlug', 'p2'))
        .collect();

      expect(oldChildAP1).toHaveLength(0);
      expect(oldChildBP1).toHaveLength(0);
      expect(newChildAP2).toHaveLength(1);
      expect(newChildBP2).toHaveLength(1);
    });
  });

  it('should reject paginated update/delete for multi-probe filters', async ({
    ctx,
  }) => {
    const db = ctx.orm;
    await db.insert(users).values([
      { ...baseUser, email: 'probe-a@example.com', status: 'active' },
      { ...baseUser, email: 'probe-b@example.com', status: 'pending' },
    ]);

    await expect(
      db
        .update(users)
        .set({ role: 'updated' })
        .where(inArray(users.status, ['active', 'pending']))
        .paginate({ cursor: null, limit: 10 })
    ).rejects.toThrow(/multi-probe/i);

    await expect(
      db
        .delete(users)
        .where(inArray(users.status, ['active', 'pending']))
        .paginate({ cursor: null, limit: 10 })
    ).rejects.toThrow(/multi-probe/i);
  });

  it('should run executeAsync first update batch inline and schedule continuation', async () => {
    const asyncUsers = convexTable(
      'asyncUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { asyncUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 2, mutationMaxRows: 100 },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withOrmCtx(
      asyncSchema,
      asyncRelations,
      async (ctx) => {
        await ctx.db.insert('asyncUsers', {
          name: 'A',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncUsers', {
          name: 'B',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncUsers', {
          name: 'C',
          status: 'draft',
          role: 'member',
        });

        const firstBatch = await ctx.orm
          .update(asyncUsers)
          .set({ role: 'editor' })
          .where(eq(asyncUsers.status, 'draft'))
          .returning({ name: asyncUsers.name, role: asyncUsers.role })
          .executeAsync({ batchSize: 2 });

        expect(firstBatch).toHaveLength(2);
        expect(firstBatch.every((row) => row.role === 'editor')).toBe(true);

        const rows = await ctx.db
          .query('asyncUsers')
          .withIndex('by_status', (q) => q.eq('status', 'draft'))
          .collect();
        const updatedCount = rows.filter((row) => row.role === 'editor').length;
        expect(updatedCount).toBe(2);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );

    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(scheduler.runAfter).toHaveBeenCalledWith(
      0,
      scheduledMutationBatch,
      expect.objectContaining({
        operation: 'update',
        table: 'asyncUsers',
        batchSize: 2,
      })
    );
  });

  it('should run executeAsync first delete batch inline and schedule continuation', async () => {
    const asyncDeleteUsers = convexTable(
      'asyncDeleteUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { asyncDeleteUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 2, mutationMaxRows: 100 },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withOrmCtx(
      asyncSchema,
      asyncRelations,
      async (ctx) => {
        await ctx.db.insert('asyncDeleteUsers', {
          name: 'A',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncDeleteUsers', {
          name: 'B',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncDeleteUsers', {
          name: 'C',
          status: 'draft',
          role: 'member',
        });

        const firstBatch = await ctx.orm
          .delete(asyncDeleteUsers)
          .where(eq(asyncDeleteUsers.status, 'draft'))
          .returning({ name: asyncDeleteUsers.name })
          .executeAsync({ batchSize: 2 });

        expect(firstBatch).toHaveLength(2);

        const rows = await ctx.db
          .query('asyncDeleteUsers')
          .withIndex('by_status', (q) => q.eq('status', 'draft'))
          .collect();
        expect(rows).toHaveLength(1);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );

    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(scheduler.runAfter).toHaveBeenCalledWith(
      0,
      scheduledMutationBatch,
      expect.objectContaining({
        operation: 'delete',
        table: 'asyncDeleteUsers',
        batchSize: 2,
      })
    );
  });

  it('should execute scheduled mutation batch continuation handler', async () => {
    const asyncUsers = convexTable(
      'asyncUsersScheduled',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { asyncUsersScheduled: asyncUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 2, mutationMaxRows: 100 },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const worker = scheduledMutationBatchFactory(
      asyncRelations,
      asyncEdges,
      scheduledMutationBatch
    );

    await withOrmCtx(
      asyncSchema,
      asyncRelations,
      async (ctx) => {
        await ctx.db.insert('asyncUsersScheduled', {
          name: 'A',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncUsersScheduled', {
          name: 'B',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('asyncUsersScheduled', {
          name: 'C',
          status: 'draft',
          role: 'member',
        });

        await ctx.orm
          .update(asyncUsers)
          .set({ role: 'editor' })
          .where(eq(asyncUsers.status, 'draft'))
          .returning({ role: asyncUsers.role })
          .executeAsync({ batchSize: 2 });

        const scheduledArgs = (scheduler.runAfter as any).mock.calls[0]?.[2];
        expect(scheduledArgs).toBeDefined();
        if (!scheduledArgs) {
          throw new Error('Expected scheduled args for continuation.');
        }
        await worker(
          {
            db: ctx.db,
            scheduler: scheduler as any,
          },
          scheduledArgs
        );

        const rows = await ctx.db
          .query('asyncUsersScheduled')
          .withIndex('by_status', (q) => q.eq('status', 'draft'))
          .collect();
        expect(rows).toHaveLength(3);
        expect(rows.every((row: any) => row.role === 'editor')).toBe(true);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );
  });

  it('should complete async continuation with finishAllScheduledFunctions', async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema);

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, appRelations, {
          scheduler: baseCtx.scheduler,
          scheduledMutationBatch: scheduledMutationBatchRef,
        });

        await ctx.db.insert('users', {
          name: 'A',
          email: 'a@async-finish.test',
          status: 'draft',
          role: 'member',
        } as any);
        await ctx.db.insert('users', {
          name: 'B',
          email: 'b@async-finish.test',
          status: 'draft',
          role: 'member',
        } as any);
        await ctx.db.insert('users', {
          name: 'C',
          email: 'c@async-finish.test',
          status: 'draft',
          role: 'member',
        } as any);

        const firstBatch = await ctx.orm
          .update(users)
          .set({ role: 'editor' })
          .where(eq(users.status, 'draft'))
          .returning({ id: users.id, role: users.role })
          .execute({ mode: 'async', batchSize: 2, delayMs: 0 });

        expect(firstBatch).toHaveLength(2);
        expect(firstBatch.every((row) => row.role === 'editor')).toBe(true);
      });

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (baseCtx) => {
        const ctx = withOrm(baseCtx, appRelations, {
          scheduler: baseCtx.scheduler,
          scheduledMutationBatch: scheduledMutationBatchRef,
        });

        const rows = await ctx.db
          .query('users')
          .withIndex('by_status', (q) => q.eq('status', 'draft'))
          .collect();

        expect(rows).toHaveLength(3);
        expect(rows.every((row: any) => row.role === 'editor')).toBe(true);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should require scheduler wiring for executeAsync', async () => {
    await expect(
      withOrmCtx(schema, appRelations, async (ctx) => {
        await ctx.db.insert('users', {
          name: 'A',
          email: 'a@example.com',
          status: 'draft',
        } as any);
        await ctx.orm
          .update(users)
          .set({ role: 'editor' })
          .where(eq(users.status, 'draft'))
          .executeAsync();
      })
    ).rejects.toThrow(/scheduler, scheduledMutationBatch/i);
  });

  it('should reject executeAsync when paginate() was already configured', async ({
    ctx,
  }) => {
    await expect(
      (
        ctx.orm
          .update(users)
          .set({ role: 'editor' })
          .paginate({ cursor: null, limit: 10 }) as any
      ).executeAsync(undefined as never)
    ).rejects.toThrow(/cannot be combined with paginate/i);
  });

  it('should reject executeAsync with scheduled delete mode', async () => {
    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await expect(
      withOrmCtx(
        schema,
        appRelations,
        async (ctx) => {
          await ctx.db.insert('users', {
            name: 'A',
            email: 'a@example.com',
            status: 'draft',
          } as any);
          await ctx.orm
            .delete(users)
            .scheduled({ delayMs: 0 })
            .where(eq(users.status, 'draft'))
            .executeAsync();
        },
        {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        }
      )
    ).rejects.toThrow(/cannot be combined with scheduled\(\)/i);
  });

  it('should apply table default scheduled delete mode on execute()', async () => {
    const scheduledUsers = convexTable(
      'table_default_scheduled_users',
      {
        name: text().notNull(),
        deletionTime: integer(),
      },
      () => [deletion('scheduled', { delayMs: 250 })]
    );
    const tables = { table_default_scheduled_users: scheduledUsers };
    const scheduledSchema = defineSchema(tables);
    const scheduledRelations = defineRelations(tables);

    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled'),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledDelete = {} as SchedulableFunctionReference;

    await withOrmCtx(
      scheduledSchema,
      scheduledRelations,
      async (ctx) => {
        const userId = await ctx.db.insert('table_default_scheduled_users', {
          name: 'Ada',
        });

        await ctx.orm
          .delete(scheduledUsers)
          .where(eq(scheduledUsers.id, userId))
          .execute();

        const updated = await ctx.db.get(userId);
        expect(updated?.deletionTime).toBeTypeOf('number');
        expect(scheduler.runAfter).toHaveBeenCalledWith(
          250,
          scheduledDelete,
          expect.objectContaining({
            table: 'table_default_scheduled_users',
            id: userId,
            cascadeMode: 'hard',
            deletionTime: updated?.deletionTime,
          })
        );
      },
      { scheduler: scheduler as any, scheduledDelete }
    );
  });

  it('should allow hard() override on table default scheduled delete mode', async () => {
    const scheduledUsers = convexTable(
      'table_default_scheduled_users_hard_override',
      {
        name: text().notNull(),
        deletionTime: integer(),
      },
      () => [deletion('scheduled', { delayMs: 250 })]
    );
    const tables = {
      table_default_scheduled_users_hard_override: scheduledUsers,
    };
    const scheduledSchema = defineSchema(tables);
    const scheduledRelations = defineRelations(tables);

    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled'),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledDelete = {} as SchedulableFunctionReference;

    await withOrmCtx(
      scheduledSchema,
      scheduledRelations,
      async (ctx) => {
        const userId = await ctx.db.insert(
          'table_default_scheduled_users_hard_override',
          {
            name: 'Ada',
          }
        );

        await ctx.orm
          .delete(scheduledUsers)
          .hard()
          .where(eq(scheduledUsers.id, userId))
          .execute();

        expect(await ctx.db.get(userId)).toBeNull();
        expect(scheduler.runAfter).not.toHaveBeenCalled();
      },
      { scheduler: scheduler as any, scheduledDelete }
    );
  });

  it('should apply table default soft delete mode on execute()', async () => {
    const softUsers = convexTable(
      'table_default_soft_users',
      {
        name: text().notNull(),
        deletionTime: integer(),
      },
      () => [deletion('soft')]
    );
    const tables = { table_default_soft_users: softUsers };
    const softSchema = defineSchema(tables);
    const softRelations = defineRelations(tables);

    await withOrmCtx(softSchema, softRelations, async (ctx) => {
      const userId = await ctx.db.insert('table_default_soft_users', {
        name: 'Ada',
      });

      await ctx.orm.delete(softUsers).where(eq(softUsers.id, userId)).execute();

      const updated = await ctx.db.get(userId);
      expect(updated).not.toBeNull();
      expect(updated?.deletionTime).toBeTypeOf('number');
    });
  });

  it('should reject executeAsync for table default scheduled delete mode', async () => {
    const scheduledUsers = convexTable(
      'table_default_scheduled_users_async_reject',
      {
        name: text().notNull(),
        deletionTime: integer(),
      },
      () => [deletion('scheduled', { delayMs: 0 })]
    );
    const tables = {
      table_default_scheduled_users_async_reject: scheduledUsers,
    };
    const scheduledSchema = defineSchema(tables);
    const scheduledRelations = defineRelations(tables);

    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled'),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await expect(
      withOrmCtx(
        scheduledSchema,
        scheduledRelations,
        async (ctx) => {
          const userId = await ctx.db.insert(
            'table_default_scheduled_users_async_reject',
            {
              name: 'Ada',
            }
          );

          await ctx.orm
            .delete(scheduledUsers)
            .where(eq(scheduledUsers.id, userId))
            .executeAsync();
        },
        {
          scheduler: scheduler as any,
          scheduledMutationBatch,
        }
      )
    ).rejects.toThrow(/cannot be combined with scheduled\(\)/i);
  });

  it('should allow hard() override with executeAsync for table default scheduled mode', async () => {
    const scheduledUsers = convexTable(
      'table_default_scheduled_users_async_hard_override',
      {
        name: text().notNull(),
        deletionTime: integer(),
      },
      () => [deletion('scheduled', { delayMs: 0 })]
    );
    const tables = {
      table_default_scheduled_users_async_hard_override: scheduledUsers,
    };
    const scheduledSchema = defineSchema(tables, {
      defaults: { mutationBatchSize: 1, mutationMaxRows: 100 },
    });
    const scheduledRelations = defineRelations(tables);

    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled'),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withOrmCtx(
      scheduledSchema,
      scheduledRelations,
      async (ctx) => {
        const userId = await ctx.db.insert(
          'table_default_scheduled_users_async_hard_override',
          {
            name: 'Ada',
          }
        );

        await ctx.orm
          .delete(scheduledUsers)
          .hard()
          .where(eq(scheduledUsers.id, userId))
          .executeAsync({ batchSize: 1, delayMs: 0 });

        expect(await ctx.db.get(userId)).toBeNull();
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );
  });

  it('should use global async execution mode for execute()', async () => {
    const asyncUsers = convexTable(
      'globalAsyncUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
        role: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { globalAsyncUsers: asyncUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: {
        mutationExecutionMode: 'async',
        mutationBatchSize: 2,
        mutationMaxRows: 100,
      },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withOrmCtx(
      asyncSchema,
      asyncRelations,
      async (ctx) => {
        await ctx.db.insert('globalAsyncUsers', {
          name: 'A',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('globalAsyncUsers', {
          name: 'B',
          status: 'draft',
          role: 'member',
        });
        await ctx.db.insert('globalAsyncUsers', {
          name: 'C',
          status: 'draft',
          role: 'member',
        });

        const firstBatch = await ctx.orm
          .update(asyncUsers)
          .set({ role: 'editor' })
          .where(eq(asyncUsers.status, 'draft'))
          .returning({ name: asyncUsers.name, role: asyncUsers.role })
          .execute();

        expect(firstBatch).toHaveLength(2);
        expect(firstBatch.every((row) => row.role === 'editor')).toBe(true);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );

    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(scheduler.runAfter).toHaveBeenCalledWith(
      0,
      scheduledMutationBatch,
      expect.objectContaining({
        workType: 'root-update',
        operation: 'update',
        table: 'globalAsyncUsers',
      })
    );
  });

  it('should allow per-call sync override when global mode is async', async () => {
    const asyncUsers = convexTable(
      'globalAsyncOverrideUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { globalAsyncOverrideUsers: asyncUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: {
        mutationExecutionMode: 'async',
        mutationBatchSize: 1,
        mutationMaxRows: 2,
      },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    await expect(
      withOrmCtx(asyncSchema, asyncRelations, async (ctx) => {
        await ctx.db.insert('globalAsyncOverrideUsers', {
          name: 'A',
          status: 'draft',
        });
        await ctx.db.insert('globalAsyncOverrideUsers', {
          name: 'B',
          status: 'draft',
        });
        await ctx.db.insert('globalAsyncOverrideUsers', {
          name: 'C',
          status: 'draft',
        });

        await ctx.orm
          .delete(asyncUsers)
          .where(eq(asyncUsers.status, 'draft'))
          .execute({ mode: 'sync' });
      })
    ).rejects.toThrow(/mutationMaxRows|exceed/i);
  });

  it('should allow per-call async override when global mode is sync', async () => {
    const asyncUsers = convexTable(
      'globalSyncOverrideUsers',
      {
        name: text().notNull(),
        status: text().notNull(),
      },
      (t) => [index('by_status').on(t.status)]
    );
    const tables = { globalSyncOverrideUsers: asyncUsers };
    const asyncSchema = defineSchema(tables, {
      defaults: {
        mutationBatchSize: 2,
        mutationMaxRows: 100,
      },
    });
    const asyncRelations = defineRelations(tables);
    const asyncEdges = extractRelationsConfig(asyncRelations);

    const scheduler = {
      runAfter: vi.fn(async () => 'job-id'),
      runAt: vi.fn(async () => 'job-id'),
      cancel: vi.fn(async () => {}),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withOrmCtx(
      asyncSchema,
      asyncRelations,
      async (ctx) => {
        await ctx.db.insert('globalSyncOverrideUsers', {
          name: 'A',
          status: 'draft',
        });
        await ctx.db.insert('globalSyncOverrideUsers', {
          name: 'B',
          status: 'draft',
        });
        await ctx.db.insert('globalSyncOverrideUsers', {
          name: 'C',
          status: 'draft',
        });

        const firstBatch = await ctx.orm
          .delete(asyncUsers)
          .where(eq(asyncUsers.status, 'draft'))
          .returning({ name: asyncUsers.name })
          .execute({ mode: 'async', batchSize: 2 });

        expect(firstBatch).toHaveLength(2);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );

    expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(scheduler.runAfter).toHaveBeenCalledWith(
      0,
      scheduledMutationBatch,
      expect.objectContaining({
        workType: 'root-delete',
        operation: 'delete',
        table: 'globalSyncOverrideUsers',
      })
    );
  });
});
