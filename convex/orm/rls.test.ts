/**
 * RLS (Row-Level Security) Tests
 *
 * Verifies Drizzle-style rlsPolicy/rlsRole enforcement in kitcn ORM.
 */

import {
  convexTable,
  defineRelations,
  defineSchema,
  discriminator,
  eq,
  extractRelationsConfig,
  id,
  index,
  notInArray,
  rlsPolicy,
  rlsRole,
  text,
} from 'kitcn/orm';
import { it as baseIt, describe, expect } from 'vitest';
import { convexTest, countDocumentReads, withOrm } from '../setup.testing';

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
    index('by_value').on(t.value),
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

const nullableSecrets = convexTable(
  'rls_nullable_secrets',
  {
    value: text().notNull(),
    ownerId: id('rls_users'),
  },
  (t) => [
    index('by_owner').on(t.ownerId),
    rlsPolicy('nullable_read_own', {
      for: 'select',
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy('nullable_insert_own', {
      for: 'insert',
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
  ]
);

const excludedSecrets = convexTable(
  'rls_excluded_secrets',
  {
    value: text().notNull(),
    ownerId: id('rls_users').notNull(),
  },
  (t) => [
    rlsPolicy('excluded_read', {
      for: 'select',
      using: (ctx) => notInArray(t.ownerId, [ctx.viewerId]),
    }),
  ]
);

const boundedDocs = convexTable(
  'rls_bounded_docs',
  {
    value: text().notNull(),
    label: text().notNull(),
    ownerId: id('rls_users').notNull(),
  },
  (t) => [
    index('by_owner').on(t.ownerId),
    index('by_owner_and_label').on(t.ownerId, t.label),
    rlsPolicy('bounded_read', {
      for: 'select',
      using: () => eq(t.value, 'allowed'),
    }),
  ]
);

const orgs = convexTable('rls_orgs', {
  name: text().notNull(),
});

const memberships = convexTable(
  'rls_memberships',
  {
    userId: id('rls_users').notNull(),
    orgId: id('rls_orgs').notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    rlsPolicy('memberships_read_own', {
      for: 'select',
      using: (ctx) => eq(t.userId, ctx.viewerId),
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
    ownerId: id('rls_users'),
  },
  (t) => [
    index('by_owner').on(t.ownerId),
    rlsPolicy('role_read', {
      for: 'select',
      to: adminRole,
      using: () => eq(t.value, 'allowed'),
    }),
  ]
);

const roleWrites = convexTable(
  'rls_role_writes',
  {
    value: text().notNull(),
  },
  (t) => [
    index('by_value').on(t.value),
    rlsPolicy('role_write', {
      for: 'all',
      to: adminRole,
      using: () => eq(t.value, 'allowed'),
      withCheck: () => eq(t.value, 'allowed'),
    }),
  ]
);

const auditEvents = convexTable('rls_audit_events', {
  eventType: discriminator({
    variants: {
      role_doc: {
        roleDocId: id('rls_role_docs').notNull(),
      },
    },
  }),
});

const pseudoRoleDocs = convexTable(
  'rls_pseudo_role_docs',
  {
    value: text().notNull(),
  },
  (t) => [
    rlsPolicy('pseudo_role_read', {
      for: 'select',
      to: 'current_user',
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
  rls_nullable_secrets: nullableSecrets,
  rls_excluded_secrets: excludedSecrets,
  rls_bounded_docs: boundedDocs,
  rls_orgs: orgs,
  rls_memberships: memberships,
  rls_tasks: tasks,
  rls_locked: locked,
  rls_linked: linked,
  rls_role_docs: roleDocs,
  rls_role_writes: roleWrites,
  rls_audit_events: auditEvents,
  rls_pseudo_role_docs: pseudoRoleDocs,
};
const schema = defineSchema(tables, {
  defaults: {
    defaultLimit: 100,
  },
});
const relations = defineRelations(tables, (r) => ({
  rls_secrets: {},
  rls_nullable_secrets: {},
  rls_excluded_secrets: {},
  rls_bounded_docs: {},
  rls_orgs: {
    users: r.many.rls_users({
      from: r.rls_orgs.id.through(r.rls_memberships.orgId),
      to: r.rls_users.id.through(r.rls_memberships.userId),
      alias: 'rls-org-users',
    }),
  },
  rls_memberships: {},
  rls_tasks: {},
  rls_locked: {},
  rls_linked: {},
  rls_role_docs: {},
  rls_role_writes: {},
  rls_audit_events: {
    roleDoc: r.one.rls_role_docs({
      from: r.rls_audit_events.roleDocId,
      to: r.rls_role_docs.id,
      optional: true,
    }),
  },
  rls_pseudo_role_docs: {},
  rls_users: {
    orgs: r.many.rls_orgs({
      from: r.rls_users.id.through(r.rls_memberships.userId),
      to: r.rls_orgs.id.through(r.rls_memberships.orgId),
      alias: 'rls-user-orgs',
    }),
    roleDocs: r.many.rls_role_docs({
      from: r.rls_users.id,
      to: r.rls_role_docs.ownerId,
      alias: 'rls-user-role-docs',
    }),
    secrets: r.many.rls_secrets({
      from: r.rls_users.id,
      to: r.rls_secrets.ownerId,
    }),
  },
}));
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

  it('fills a limit past rows the policy hides', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });

    for (let i = 0; i < 40; i += 1) {
      await ctx.db.insert('rls_bounded_docs', {
        value: i < 6 ? 'denied' : 'allowed',
        label: `label-${String(i).padStart(2, '0')}`,
        ownerId: viewerId,
      });
    }

    ctx.viewerId = viewerId;

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.rls_bounded_docs.findMany({
      where: { ownerId: viewerId },
      limit: 3,
    });

    // `take(3)` off the index spends the whole budget on rows the policy is
    // about to drop, so the bound has to count visible survivors.
    expect(rows.map((row: any) => row.label)).toEqual([
      'label-06',
      'label-07',
      'label-08',
    ]);
    // Counting survivors is not the same as giving up the bound: the scan
    // stops at the ninth row, it does not collect all 40.
    expect(reads.scanned).toBeLessThanOrEqual(15);
  });

  it('fills a limit past hidden rows when an index serves orderBy', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });

    for (let i = 39; i >= 0; i -= 1) {
      await ctx.db.insert('rls_bounded_docs', {
        value: i < 6 ? 'denied' : 'allowed',
        label: `label-${String(i).padStart(2, '0')}`,
        ownerId: viewerId,
      });
    }

    ctx.viewerId = viewerId;

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.rls_bounded_docs.findMany({
      where: { ownerId: viewerId },
      orderBy: { label: 'asc' },
      limit: 3,
    });

    // `by_owner_and_label` pins ownerId and sorts by label, so the order is
    // pushed into the scan and no post-fetch sort re-sizes the page. The
    // bounded read is then the only thing standing between the policy and a
    // short page.
    expect(rows.map((row: any) => row.label)).toEqual([
      'label-06',
      'label-07',
      'label-08',
    ]);
    expect(reads.scanned).toBeLessThanOrEqual(15);
  });

  it('filters id-only pipeline rows before user callbacks', async ({ ctx }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });
    const allowedId = await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: viewerId,
    });
    const forbiddenId = await ctx.db.insert('rls_secrets', {
      value: 'forbidden',
      ownerId: otherId,
    });

    ctx.viewerId = viewerId;

    const rows = await ctx.orm.query.rls_secrets
      .select()
      .where({ id: { in: [allowedId, forbiddenId] } })
      .map((row: { value: string }) => ({
        exposed: row.value,
        ownerId: viewerId,
        value: 'allowed',
      }))
      .limit(10);

    expect(rows).toEqual([
      { exposed: 'allowed', ownerId: viewerId, value: 'allowed' },
    ]);
  });

  it('fills residual cursor pages with RLS-visible matches', async ({
    ctx,
  }) => {
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

    const page = await ctx.orm.query.rls_secrets.findMany({
      cursor: null,
      limit: 1,
      where: {
        AND: [{ value: 'allowed' }, { value: { like: '%allowed%' } }],
      },
    });

    expect(page.page).toHaveLength(1);
    expect(page.page[0].ownerId).toEqual(viewerId);
  });

  it('fills residual limited reads with RLS-visible matches', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });

    await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: otherId,
    });
    await ctx.db.insert('rls_secrets', {
      value: 'allowed',
      ownerId: viewerId,
    });

    ctx.viewerId = viewerId;

    const rows = await ctx.orm.query.rls_secrets.findMany({
      limit: 1,
      where: {
        AND: [{ value: 'allowed' }, { value: { like: '%allowed%' } }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toEqual(viewerId);
  });

  it('throws COUNT_RLS_UNSUPPORTED for count() in RLS-restricted contexts', async ({
    ctx,
  }) => {
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
    await expect(db.query.rls_secrets.count()).rejects.toThrow(
      /COUNT_RLS_UNSUPPORTED/
    );
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

  it('throws instead of granting role-scoped policies without a roleResolver', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      // No roleResolver wired: a `to:` policy must never apply to everyone.
      const ctx = withOrm(baseCtx, relations);
      await ctx.db.insert('rls_role_docs', { value: 'allowed' });

      await expect(ctx.orm.query.rls_role_docs.findMany()).rejects.toThrow(
        /RLS_ROLE_RESOLVER_REQUIRED/
      );
    });
  });

  it('throws for role-scoped policies on an empty table', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      // Same misconfiguration as above with no stored rows: configuration
      // errors must not wait for the table's first insert.
      const ctx = withOrm(baseCtx, relations);

      await expect(ctx.orm.query.rls_role_docs.findMany()).rejects.toThrow(
        /RLS_ROLE_RESOLVER_REQUIRED/
      );
      await expect(ctx.orm.query.rls_role_docs.findFirst()).rejects.toThrow(
        /RLS_ROLE_RESOLVER_REQUIRED/
      );
    });
  });

  it('validates role-scoped policies before starting the root read', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const guardedDb = new Proxy(baseCtx.db, {
        get(target, property, receiver) {
          if (property === 'query' || property === 'get') {
            throw new Error('ROOT_READ_STARTED');
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const ctx = withOrm({ ...baseCtx, db: guardedDb }, relations);

      await expect(ctx.orm.query.rls_role_docs.findMany()).rejects.toThrow(
        /RLS_ROLE_RESOLVER_REQUIRED/
      );
    });
  });

  it('throws for role-scoped relation targets when the parent has no rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);

      await expect(
        ctx.orm.query.rls_users.findMany({ with: { roleDocs: true } })
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
      await expect(
        ctx.orm.query.rls_users.findMany({
          where: { roleDocs: { value: 'allowed' } },
        })
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
    });
  });

  it('throws for nested relation filters when the root has no rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);

      await expect(
        ctx.orm.query.rls_orgs.findMany({
          with: {
            users: {
              where: { roleDocs: { value: 'allowed' } },
            },
          },
        })
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
    });
  });

  it('throws for RLS relation counts when the parent has no rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);

      await expect(
        ctx.orm.query.rls_users.findMany({
          with: { _count: { roleDocs: true } },
        })
      ).rejects.toThrow(/COUNT_RLS_UNSUPPORTED/);
    });
  });

  it('preflights RLS relations added by withVariants before reading', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const guardedDb = new Proxy(baseCtx.db, {
        get(target, property, receiver) {
          if (property === 'query' || property === 'get') {
            throw new Error('ROOT_READ_STARTED');
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const ctx = withOrm({ ...baseCtx, db: guardedDb }, relations);

      await expect(
        ctx.orm.query.rls_audit_events.findMany({ withVariants: true })
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
    });
  });

  it('throws for role-scoped policies on writes that match no rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);

      await expect(
        ctx.orm
          .update(roleWrites)
          .set({ value: 'allowed' })
          .where(eq(roleWrites.value, 'missing'))
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);

      await expect(
        ctx.orm.delete(roleWrites).where(eq(roleWrites.value, 'missing'))
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
    });
  });

  it('validates mutation roles before collecting candidate rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const guardedDb = new Proxy(baseCtx.db, {
        get(target, property, receiver) {
          if (property === 'query' || property === 'get') {
            throw new Error('MUTATION_READ_STARTED');
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const ctx = withOrm({ ...baseCtx, db: guardedDb }, relations);

      await expect(
        ctx.orm
          .update(roleWrites)
          .set({ value: 'allowed' })
          .where(eq(roleWrites.value, 'missing'))
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
      await expect(
        ctx.orm.delete(roleWrites).where(eq(roleWrites.value, 'missing'))
      ).rejects.toThrow(/RLS_ROLE_RESOLVER_REQUIRED/);
    });
  });

  it('applies SQL pseudo-role policies without a roleResolver', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      // `current_user` always resolves to the caller, so it needs no resolver.
      const ctx = withOrm(baseCtx, relations);
      await ctx.db.insert('rls_pseudo_role_docs', { value: 'allowed' });
      await ctx.db.insert('rls_pseudo_role_docs', { value: 'blocked' });

      const rows = await ctx.orm.query.rls_pseudo_role_docs.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('allowed');
    });
  });

  it('applies SQL pseudo-role policies when a roleResolver returns no roles', async ({
    ctx,
  }) => {
    await ctx.db.insert('rls_pseudo_role_docs', { value: 'allowed' });
    await ctx.db.insert('rls_pseudo_role_docs', { value: 'blocked' });

    ctx.roles = [];
    const rows = await ctx.orm.query.rls_pseudo_role_docs.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('allowed');
  });

  it('still bypasses role-scoped policies via skipRules without a roleResolver', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);
      await ctx.db.insert('rls_role_docs', { value: 'allowed' });

      const rows = await ctx.orm.skipRules.query.rls_role_docs.findMany();
      expect(rows).toHaveLength(1);
    });
  });

  it('denies reads when the policy column and context value are both nullish', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    await ctx.db.insert('rls_nullable_secrets', { value: 'ownerless' });
    await ctx.db.insert('rls_nullable_secrets', {
      value: 'owned',
      ownerId: viewerId,
    });

    // Unauthenticated caller: ctx.viewerId is undefined.
    const anonymous = await ctx.orm.query.rls_nullable_secrets.findMany();
    expect(anonymous).toHaveLength(0);

    ctx.viewerId = viewerId;
    const owned = await ctx.orm.query.rls_nullable_secrets.findMany();
    expect(owned).toHaveLength(1);
    expect(owned[0].value).toBe('owned');
  });

  it('blocks anonymous inserts of rows with a nullish policy column', async ({
    ctx,
  }) => {
    await expect(async () => {
      await ctx.orm.insert(nullableSecrets).values({ value: 'ownerless' });
    }).rejects.toThrowError(/RLS/);
  });

  it('denies notInArray policies when a context list member is nullish', async ({
    ctx,
  }) => {
    const ownerId = await ctx.db.insert('rls_users', { name: 'Owner' });
    await ctx.db.insert('rls_excluded_secrets', {
      value: 'private',
      ownerId,
    });

    const anonymous = await ctx.orm.query.rls_excluded_secrets.findMany();
    expect(anonymous).toHaveLength(0);
  });

  it('applies through-table policies when loading many-to-many relations', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    const otherId = await ctx.db.insert('rls_users', { name: 'Other' });
    const orgId = await ctx.db.insert('rls_orgs', { name: 'Acme' });

    await ctx.db.insert('rls_memberships', { userId: viewerId, orgId });
    await ctx.db.insert('rls_memberships', { userId: otherId, orgId });

    ctx.viewerId = viewerId;

    const rows = await ctx.orm.query.rls_users.findMany({
      with: { orgs: true },
    });

    const orgCountByUser = Object.fromEntries(
      rows.map((row: any) => [row.name, row.orgs.length])
    );
    expect(orgCountByUser).toEqual({ Viewer: 1, Other: 0 });
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

  it('keeps the relation read bound when rules are skipped', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    ctx.viewerId = viewerId;

    for (let i = 0; i < 25; i += 1) {
      await ctx.db.insert('rls_secrets', {
        value: `allowed-${i}`,
        ownerId: viewerId,
      });
    }

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.skipRules.query.rls_users.findMany({
      limit: 10,
      with: { secrets: { limit: 3 } },
    });

    expect((rows[0] as any).secrets).toHaveLength(3);
    // skipRules filters nothing, so the per-parent limit must still be pushed
    // into the read instead of collecting every child.
    expect(reads.scanned).toBeLessThan(25);
  });

  it('stops RLS relation reads after the requested visible rows', async ({
    ctx,
  }) => {
    const viewerId = await ctx.db.insert('rls_users', { name: 'Viewer' });
    ctx.viewerId = viewerId;

    for (let i = 0; i < 3; i += 1) {
      await ctx.db.insert('rls_secrets', {
        value: 'allowed',
        ownerId: viewerId,
      });
    }
    for (let i = 0; i < 40; i += 1) {
      await ctx.db.insert('rls_secrets', {
        value: `blocked-${i}`,
        ownerId: viewerId,
      });
    }

    const reads = countDocumentReads(ctx);
    const rows = await ctx.orm.query.rls_users.findMany({
      limit: 10,
      with: { secrets: { limit: 3 } },
    });

    expect((rows[0] as any).secrets).toHaveLength(3);
    expect(reads.scanned).toBeLessThanOrEqual(5);
  });
});
