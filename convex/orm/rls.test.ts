/**
 * RLS (Row-Level Security) Tests
 *
 * Verifies Drizzle-style rlsPolicy/rlsRole enforcement in Better Convex ORM.
 */

import {
  convexTable,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  id,
  index,
  rlsPolicy,
  rlsRole,
  text,
} from 'better-convex/orm';
import { it as baseIt, describe, expect } from 'vitest';
import { convexTest, withOrm } from '../setup.testing';

const users = convexTable('rls_users', {
  name: text().notNull(),
});

const secrets = convexTable(
  'rls_secrets',
  {
    value: text().notNull(),
    ownerId: id('rls_users').notNull(),
  },
  (t) => [
    index('by_owner').on(t.ownerId),
    rlsPolicy('secrets_read', {
      for: 'select',
      using: async (ctx, table) => {
        void table.id;
        return eq(t.ownerId, await Promise.resolve(ctx.viewerId));
      },
    }),
    rlsPolicy('secrets_insert', {
      for: 'insert',
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy('secrets_update', {
      for: 'update',
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy('secrets_delete', {
      for: 'delete',
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy('secrets_restrict', {
      as: 'restrictive',
      for: 'select',
      using: () => eq(t.value, 'allowed'),
    }),
  ]
);

const linked = convexTable.withRLS('rls_linked', {
  value: text().notNull(),
});

const adminRole = rlsRole('admin');

const roleDocs = convexTable(
  'rls_role_docs',
  {
    value: text().notNull(),
  },
  (t) => [
    rlsPolicy('role_read', {
      for: 'select',
      to: adminRole,
      using: () => eq(t.value, 'allowed'),
    }),
  ]
);

const linkedPolicy = rlsPolicy('linked_policy', {
  for: 'select',
  using: (ctx, t) => eq(t.value, ctx.allowedValue),
}).link(linked);

const tasks = convexTable(
  'rls_tasks',
  {
    title: text().notNull(),
    ownerId: id('rls_users').notNull(),
  },
  (t) => [
    rlsPolicy('tasks_all', {
      for: 'all',
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    linkedPolicy,
  ]
);

const locked = convexTable.withRLS('rls_locked', {
  value: text().notNull(),
});

const tables = {
  rls_users: users,
  rls_secrets: secrets,
  rls_tasks: tasks,
  rls_locked: locked,
  rls_linked: linked,
  rls_role_docs: roleDocs,
};
const schema = defineSchema(tables, {
  defaults: {
    defaultLimit: 100,
  },
});
const relations = defineRelations(tables);
const edges = extractRelationsConfig(relations);

const it = baseIt.extend<{ ctx: any }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations, {
        rls: {
          roleResolver: (ctx) => (ctx as { roles?: string[] }).roles ?? [],
        },
      });
      await use(ctx);
    });
  },
});

describe('RLS', () => {
  it('filters reads based on policies', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });

    await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: viewerId,
    });
    await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: otherId,
    });

    ctx.viewerId = viewerId;

    const db = ctx.orm;
    const rows = await db.query.rls_secrets.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toEqual(viewerId);
  });

  it('applies restrictive policies in addition to permissive', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    await ctx.db.insert('rls_secrets', {
      value: 'blocked',
      ownerId: viewerId,
    });

    ctx.viewerId = viewerId;

    const db = ctx.orm;
    const rows = await db.query.rls_secrets.findMany();

    expect(rows).toHaveLength(0);
  });

  it('defaults to deny when RLS enabled and no policies exist', async ({
    ctx,
  }) => {
    await ctx.db.insert('rls_locked', { value: 'secret' });

    const db = ctx.orm;
    const rows = await db.query.rls_locked.findMany();

    expect(rows).toHaveLength(0);
  });

  it('blocks inserts that violate policies', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });

    ctx.viewerId = viewerId;

    const db = ctx.orm;

    await expect(async () => {
      await db.insert(secrets).values({ value: 'allowed', ownerId: otherId });
    }).rejects.toThrowError(/RLS/);
  });

  it('skips updates when using fails', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });
    const secretId = await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: otherId,
    });

    ctx.viewerId = viewerId;

    const db = ctx.orm;

    const result = await db
      .update(secrets)
      .set({ value: 'new' })
      .where(eq(secrets.ownerId, otherId))
      .returning();

    expect(result).toHaveLength(0);

    const row = await ctx.db.get(secretId as any);
    expect(row?.value).toBe('allowed');
  });

  it('blocks updates when withCheck fails', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });
    const secretId = await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: viewerId,
    });

    ctx.viewerId = viewerId;

    const db = ctx.orm;

    await expect(async () => {
      await db
        .update(secrets)
        .set({ ownerId: otherId })
        .where(eq(secrets.ownerId, viewerId));
    }).rejects.toThrowError(/RLS/);

    const row = await ctx.db.get(secretId as any);
    expect(row?.ownerId).toBe(viewerId);
  });

  it('skips deletes when using fails', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });
    const secretId = await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: otherId,
    });

    ctx.viewerId = viewerId;

    const db = ctx.orm;

    const result = await db
      .delete(secrets)
      .where(eq(secrets.ownerId, otherId))
      .returning();

    expect(result).toHaveLength(0);

    const row = await ctx.db.get(secretId as any);
    expect(row).not.toBeNull();
  });

  it('applies for: all policies to reads and writes', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });

    ctx.viewerId = viewerId;

    const db = ctx.orm;

    await expect(async () => {
      await db.insert(tasks).values({ title: 'Nope', ownerId: otherId });
    }).rejects.toThrowError(/RLS/);

    await db.insert(tasks).values({ title: 'Allowed', ownerId: viewerId });

    const rows = await db.query.rls_tasks.findMany();
    expect(rows).toHaveLength(1);
  });

  it('applies linked policies to the target table', async ({ ctx }) => {
    ctx.allowedValue = 'linked';

    await ctx.db.insert('rls_linked', { value: 'linked' });
    await ctx.db.insert('rls_linked', { value: 'blocked' });

    const rows = await ctx.orm.query.rls_linked.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('linked');
  });

  it('enforces role-based policies when roleResolver is provided', async ({
    ctx,
  }) => {
    await ctx.db.insert('rls_role_docs', { value: 'allowed' });

    ctx.roles = [];
    const denied = await ctx.orm.query.rls_role_docs.findMany();
    expect(denied).toHaveLength(0);

    ctx.roles = ['admin'];
    const allowed = await ctx.orm.query.rls_role_docs.findMany();
    expect(allowed).toHaveLength(1);
  });

  it('allows bypass via ctx.orm.skipRules', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });

    ctx.viewerId = viewerId;

    await ctx.orm.skipRules
      .insert(secrets)
      .values({ value: 'allowed', ownerId: otherId });

    const rows = await ctx.orm.skipRules.query.rls_secrets.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toEqual(otherId);
  });
});
