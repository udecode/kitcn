import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import {
  boolean,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  discriminator,
  eq,
  id,
  index,
  integer,
  text,
} from '.';

const REQUIRE_ERROR_RE = /require/i;
const BRANCH_ERROR_RE = /branch/i;
const CONFLICTING_VARIANT_SIGNATURE_ERROR_RE = /shared|signature|variant/i;
const ALIAS_COLLISION_ERROR_RE = /alias|collid/i;
const WITH_VARIANTS_ERROR_RE = /withVariants|discriminator/i;

const users = convexTable('poly_users_runtime', {
  name: text().notNull(),
});

const documents = convexTable('poly_documents_runtime', {
  title: text().notNull(),
});

const auditLogs = convexTable(
  'poly_audit_logs_runtime',
  {
    timestamp: integer().notNull(),
    actionType: discriminator({
      variants: {
        role_change: {
          targetUserId: id('poly_users_runtime').notNull(),
          oldRole: text().notNull(),
          newRole: text().notNull(),
        },
        document_update: {
          documentId: id('poly_documents_runtime').notNull(),
          version: integer().notNull(),
          changes: text().notNull(),
        },
        security_alert: {
          severity: text().notNull(),
          errorCode: text().notNull(),
          isResolved: boolean().notNull(),
        },
      },
    }),
  },
  (t) => [
    index('by_action_ts').on(t.actionType, t.timestamp),
    index('by_role_target').on(t.actionType, t.targetUserId),
    index('by_doc').on(t.actionType, t.documentId),
  ]
);

const runtimeSchema = defineSchema({
  poly_users_runtime: users,
  poly_documents_runtime: documents,
  poly_audit_logs_runtime: auditLogs,
});

const relations = defineRelations(
  {
    poly_users_runtime: users,
    poly_documents_runtime: documents,
    poly_audit_logs_runtime: auditLogs,
  },
  (r) => ({
    poly_audit_logs_runtime: {
      targetUser: r.one.poly_users_runtime({
        from: r.poly_audit_logs_runtime.targetUserId,
        to: r.poly_users_runtime.id,
        optional: true,
      }),
      document: r.one.poly_documents_runtime({
        from: r.poly_audit_logs_runtime.documentId,
        to: r.poly_documents_runtime.id,
        optional: true,
      }),
    },
  })
);

const orm = createOrm({ schema: relations });

describe('orm schema polymorphic column builder', () => {
  test('findMany synthesizes details from flat variant columns', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('poly_users_runtime', {
        name: 'Alice',
      });
      const documentId = await ctx.db.insert('poly_documents_runtime', {
        title: 'Doc 1',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 1,
        actionType: 'role_change',
        targetUserId: userId,
        oldRole: 'member',
        newRole: 'admin',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 2,
        actionType: 'document_update',
        documentId,
        version: 3,
        changes: 'edited',
      });

      const db = orm.db(ctx.db as any) as any;
      const rows = await db.query.poly_audit_logs_runtime.findMany({
        orderBy: { timestamp: 'asc' },
        limit: 10,
      });

      expect(rows).toHaveLength(2);

      const first = rows.find((row: any) => row.actionType === 'role_change');
      if (!first || first.actionType !== 'role_change') {
        throw new Error('Expected role_change row');
      }
      expect(first.details).toEqual({
        targetUserId: userId,
        oldRole: 'member',
        newRole: 'admin',
      });

      const second = rows.find(
        (row: any) => row.actionType === 'document_update'
      );
      if (!second || second.actionType !== 'document_update') {
        throw new Error('Expected document_update row');
      }
      expect(second.details).toEqual({
        documentId,
        version: 3,
        changes: 'edited',
      });
    });
  });

  test('generated variant refs are queryable as top-level fields', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('poly_users_runtime', {
        name: 'Alice',
      });
      const documentId = await ctx.db.insert('poly_documents_runtime', {
        title: 'Doc 1',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 1,
        actionType: 'role_change',
        targetUserId: userId,
        oldRole: 'member',
        newRole: 'admin',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 2,
        actionType: 'document_update',
        documentId,
        version: 3,
        changes: 'edited',
      });

      const db = orm.db(ctx.db as any) as any;
      const rows = await db.query.poly_audit_logs_runtime.findMany({
        where: { actionType: 'role_change', targetUserId: userId },
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.actionType).toBe('role_change');
      expect(rows[0]?.details?.targetUserId).toBe(userId);
    });
  });

  test('withVariants auto-loads one relations', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('poly_users_runtime', {
        name: 'Alice',
      });
      const documentId = await ctx.db.insert('poly_documents_runtime', {
        title: 'Doc 1',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 1,
        actionType: 'role_change',
        targetUserId: userId,
        oldRole: 'member',
        newRole: 'admin',
      });

      await ctx.db.insert('poly_audit_logs_runtime', {
        timestamp: 2,
        actionType: 'document_update',
        documentId,
        version: 3,
        changes: 'edited',
      });

      const db = orm.db(ctx.db as any) as any;
      const rows = await db.query.poly_audit_logs_runtime.findMany({
        withVariants: true,
        orderBy: { timestamp: 'asc' },
        limit: 10,
      });

      const first = rows.find((row: any) => row.actionType === 'role_change');
      if (!first || first.actionType !== 'role_change') {
        throw new Error('Expected role_change row');
      }
      expect(first.targetUser?.name).toBe('Alice');
      expect(first.document).toBeNull();

      const second = rows.find(
        (row: any) => row.actionType === 'document_update'
      );
      if (!second || second.actionType !== 'document_update') {
        throw new Error('Expected document_update row');
      }
      expect(second.document?.title).toBe('Doc 1');
      expect(second.targetUser).toBeNull();
    });
  });

  test('withVariants requires a discriminator-backed table', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const db = orm.db(ctx.db as any) as any;

      await expect(
        db.query.poly_users_runtime.findMany({
          withVariants: true,
          limit: 10,
        })
      ).rejects.toThrow(WITH_VARIANTS_ERROR_RE);
    });
  });

  test('insert rejects missing required fields for active branch', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const db = orm.db(ctx.db as any) as any;

      await expect(
        db
          .insert(auditLogs)
          .values({
            timestamp: 1,
            actionType: 'role_change',
            oldRole: 'member',
            newRole: 'admin',
          })
          .execute()
      ).rejects.toThrow(REQUIRE_ERROR_RE);
    });
  });

  test('insert rejects cross-branch field combinations', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('poly_users_runtime', {
        name: 'Alice',
      });
      const documentId = await ctx.db.insert('poly_documents_runtime', {
        title: 'Doc 1',
      });
      const db = orm.db(ctx.db as any) as any;

      await expect(
        db
          .insert(auditLogs)
          .values({
            timestamp: 1,
            actionType: 'role_change',
            targetUserId: userId,
            oldRole: 'member',
            newRole: 'admin',
            documentId,
          })
          .execute()
      ).rejects.toThrow(BRANCH_ERROR_RE);
    });
  });

  test('insert applies defaults only for active discriminator branch', async () => {
    const defaultEvents = convexTable('poly_default_events_runtime', {
      timestamp: integer().notNull(),
      eventType: discriminator({
        variants: {
          role_change: {
            role: text().default('member'),
          },
          security_alert: {
            severity: text().default('low'),
          },
        },
      }),
    });

    const defaultSchema = defineSchema({
      poly_default_events_runtime: defaultEvents,
    });
    const defaultRelations = defineRelations({
      poly_default_events_runtime: defaultEvents,
    });
    const defaultOrm = createOrm({ schema: defaultRelations });

    const t = convexTest(defaultSchema);
    await t.run(async (ctx) => {
      const db = defaultOrm.db(ctx.db as any) as any;

      const inserted = await db
        .insert(defaultEvents)
        .values({
          timestamp: 1,
          eventType: 'role_change',
        })
        .returning()
        .execute();

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.role).toBe('member');
      expect(inserted[0]?.severity).toBeUndefined();
      const insertedId = inserted[0]?.id;
      if (!insertedId) {
        throw new Error('Expected inserted id');
      }

      const row = await db.query.poly_default_events_runtime.findFirst({
        where: { id: insertedId },
      });
      expect(row?.details).toEqual({ role: 'member' });
    });
  });

  test('update validates branch requirements and cross-branch fields', async () => {
    const t = convexTest(runtimeSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('poly_users_runtime', {
        name: 'Alice',
      });
      const db = orm.db(ctx.db as any) as any;

      const inserted = await db
        .insert(auditLogs)
        .values({
          timestamp: 1,
          actionType: 'role_change',
          targetUserId: userId,
          oldRole: 'member',
          newRole: 'admin',
        })
        .returning()
        .execute();

      const rowId = inserted[0]?.id;
      if (!rowId) {
        throw new Error('Expected inserted id');
      }

      await expect(
        db
          .update(auditLogs)
          .set({
            actionType: 'document_update',
          })
          .where(eq(auditLogs.id, rowId))
          .execute()
      ).rejects.toThrow(REQUIRE_ERROR_RE);

      await expect(
        db
          .update(auditLogs)
          .set({
            actionType: 'role_change',
            version: 2,
          })
          .where(eq(auditLogs.id, rowId))
          .execute()
      ).rejects.toThrow(BRANCH_ERROR_RE);
    });
  });
});

test('duplicate variant field name with different signatures throws at schema build', () => {
  expect(() =>
    convexTable('poly_invalid_duplicate_runtime', {
      actionType: discriminator({
        variants: {
          a: {
            shared: id('poly_users_runtime').notNull(),
          },
          b: {
            shared: text().notNull(),
          },
        },
      }),
    })
  ).toThrow(CONFLICTING_VARIANT_SIGNATURE_ERROR_RE);
});

test('polymorphic alias collision with column name throws at schema build', () => {
  expect(() =>
    convexTable('poly_invalid_alias_runtime', {
      details: text(),
      actionType: discriminator({
        as: 'details',
        variants: {
          a: {
            shared: text().notNull(),
          },
        },
      }),
    })
  ).toThrow(ALIAS_COLLISION_ERROR_RE);
});
