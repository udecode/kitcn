import { eq } from 'better-convex/orm';
import { authMutation, authQuery } from '../lib/crpc';
import {
  organizationTable,
  sessionTable,
  triggerDemoRecordTable,
  triggerDemoRunTable,
  userTable,
} from './schema';
import {
  TRIGGER_COVERAGE_DEFINITIONS,
  type TriggerCoverageDefinition,
  type TriggerCoverageId,
  type TriggerCoverageStatus,
} from './triggerDemo.coverage';

type TriggerProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

type TriggerCoverageEntry = TriggerCoverageDefinition & {
  probe: TriggerProbeResult;
};

type TriggerCoverageSnapshot = {
  generatedAt: string;
  entries: TriggerCoverageEntry[];
  summary: Record<TriggerCoverageStatus, number>;
  validated: number;
  total: number;
  samples: {
    hookCounts: Record<string, number>;
    runCount: number;
  };
};

const ERROR_CODE_PATTERN = /^[A-Z0-9_]+$/;

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractErrorCode(message: string): string | null {
  if (
    message.includes('TriggerCancelledError') ||
    message.includes('Trigger cancelled')
  ) {
    return 'TriggerCancelledError';
  }

  const delimiterIndex = message.indexOf(':');
  if (delimiterIndex <= 0) {
    return null;
  }
  const candidate = message.slice(0, delimiterIndex).trim();
  if (!ERROR_CODE_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
}

function summarizeProbeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      size: value.length,
      first: value[0] ?? null,
    };
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 8)
    );
  }

  return value;
}

async function runProbe(
  probe: () => Promise<unknown>
): Promise<TriggerProbeResult> {
  const startedAt = Date.now();
  try {
    const value = await probe();
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      error: null,
      errorCode: null,
      value: summarizeProbeValue(value),
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: message,
      errorCode: extractErrorCode(message),
    };
  }
}

function createProbeRunId(userId: string, id: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${id}-${userId.slice(-6)}-${Date.now()}-${suffix}`;
}

async function insertTriggerDemoRecord(
  ctx: Parameters<Parameters<typeof authMutation.mutation>[0]>[0]['ctx'],
  input: {
    runId: string;
    ownerId: string;
    name: string;
    email: string;
    deleteGuard?: boolean;
    status?: 'draft' | 'active' | 'archived';
  }
) {
  const [record] = await ctx.orm
    .insert(triggerDemoRecordTable)
    .values({
      runId: input.runId,
      ownerId: input.ownerId,
      name: input.name,
      email: input.email,
      status: input.status,
      deleteGuard: input.deleteGuard ?? false,
      recursivePatchCount: 0,
      updatedAt: new Date(),
    })
    .returning();

  return record;
}

async function getAuditsByRunId(
  ctx: Parameters<Parameters<typeof authMutation.mutation>[0]>[0]['ctx'],
  runId: string
) {
  return await ctx.orm.query.triggerDemoAudit.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
    limit: 200,
  });
}

async function getStatsByRunId(
  ctx: Parameters<Parameters<typeof authMutation.mutation>[0]>[0]['ctx'],
  runId: string
) {
  return await ctx.orm.query.triggerDemoStats.findFirst({
    where: { runId },
  });
}

async function cleanupSyntheticAuthEntities(
  ctx: Parameters<Parameters<typeof authMutation.mutation>[0]>[0]['ctx'],
  input: {
    sessionId?: string | null;
    userId?: string | null;
    organizationId?: string | null;
  }
) {
  if (input.sessionId) {
    const session = await ctx.orm.query.session.findFirst({
      where: { id: input.sessionId },
    });
    if (session) {
      await ctx.orm.delete(sessionTable).where(eq(sessionTable.id, session.id));
    }
  }

  if (input.userId) {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.userId },
    });
    if (user) {
      await ctx.orm.delete(userTable).where(eq(userTable.id, user.id));
    }
  }

  if (input.organizationId) {
    const organization = await ctx.orm.query.organization.findFirst({
      where: { id: input.organizationId },
    });
    if (organization) {
      await ctx.orm
        .delete(organizationTable)
        .where(eq(organizationTable.id, organization.id));
    }
  }
}

function countByHookAndOperation(
  audits: Array<{ hook: string; operation: string }>
): Record<string, number> {
  return audits.reduce(
    (acc, audit) => {
      const key = `${audit.hook}:${audit.operation}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function buildEmptySnapshot(): TriggerCoverageSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    entries: [],
    summary: {
      supported: 0,
      partial: 0,
      blocked: 0,
      missing: 0,
    },
    validated: 0,
    total: 0,
    samples: {
      hookCounts: {},
      runCount: 0,
    },
  };
}

export const getSnapshot = authQuery.query(async ({ ctx }) => {
  const runs = await ctx.orm.query.triggerDemoRun.findMany({
    where: { ownerId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    limit: 200,
  });
  const latest = runs[0] ?? null;
  const runCount = runs.length;

  if (!latest) {
    const snapshot = buildEmptySnapshot();
    return {
      ...snapshot,
      samples: {
        ...snapshot.samples,
        runCount,
      },
    };
  }

  const summary = latest.summary as TriggerCoverageSnapshot;
  return {
    ...summary,
    samples: {
      ...summary.samples,
      runCount,
    },
  };
});

export const runCoverage = authMutation.mutation(async ({ ctx }) => {
  const probes: Record<TriggerCoverageId, () => Promise<unknown>> = {
    'create-before-normalization': async () => {
      const runId = createProbeRunId(ctx.userId, 'create-normalize');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: '  Ada Lovelace  ',
        email: 'ADA+NORM@EXAMPLE.COM',
      });

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirstOrThrow({
        where: { id: record.id },
      });

      if (persisted.name !== 'Ada Lovelace') {
        throw new Error('Expected create.before to trim name');
      }
      if (persisted.email !== 'ada+norm@example.com') {
        throw new Error('Expected create.before to lowercase email');
      }
      if (persisted.status !== 'active') {
        throw new Error('Expected create.before default status=active');
      }

      return {
        id: persisted.id,
        name: persisted.name,
        email: persisted.email,
        status: persisted.status,
      };
    },
    'create-before-cancel': async () => {
      const runId = createProbeRunId(ctx.userId, 'create-cancel');
      let cancelled = false;

      try {
        await insertTriggerDemoRecord(ctx, {
          runId,
          ownerId: ctx.userId,
          name: '   ',
          email: 'cancel@example.com',
        });
      } catch (error) {
        const message = asErrorMessage(error);
        cancelled =
          message.includes('TriggerCancelledError') ||
          message.includes('Trigger cancelled');
        if (!cancelled) {
          throw error;
        }
      }

      if (!cancelled) {
        throw new Error('Expected TriggerCancelledError on invalid create');
      }

      const persistedRows = await ctx.orm.query.triggerDemoRecord.findMany({
        where: { runId },
        columns: { id: true },
        limit: 1,
      });

      if (persistedRows.length !== 0) {
        throw new Error('Cancelled create should not persist any row');
      }

      return { cancelled, persistedRows: persistedRows.length };
    },
    'create-after-side-effects': async () => {
      const runId = createProbeRunId(ctx.userId, 'create-after');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Create After',
        email: 'after@example.com',
      });

      const audits = await getAuditsByRunId(ctx, runId);
      const stats = await getStatsByRunId(ctx, runId);
      const createAfterCount = audits.filter(
        (audit) => audit.hook === 'create.after'
      ).length;

      if (createAfterCount === 0) {
        throw new Error('Expected create.after audit entry');
      }
      if (!stats || stats.createCount < 1) {
        throw new Error('Expected create.after to bump createCount');
      }

      return {
        id: record.id,
        createAfterCount,
        createCount: stats.createCount,
      };
    },
    'update-before-normalization': async () => {
      const runId = createProbeRunId(ctx.userId, 'update-normalize');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Before Update',
        email: 'before.update@example.com',
      });

      await ctx.orm
        .update(triggerDemoRecordTable)
        .set({
          name: '  Grace Hopper  ',
          email: 'GRACE@EXAMPLE.COM',
        })
        .where(eq(triggerDemoRecordTable.id, record.id));

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirstOrThrow({
        where: { id: record.id },
      });

      if (persisted.name !== 'Grace Hopper') {
        throw new Error('Expected update.before to trim name');
      }
      if (persisted.email !== 'grace@example.com') {
        throw new Error('Expected update.before to lowercase email');
      }

      return {
        id: persisted.id,
        name: persisted.name,
        email: persisted.email,
      };
    },
    'update-before-cancel': async () => {
      const runId = createProbeRunId(ctx.userId, 'update-cancel');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Update Cancel',
        email: 'update.cancel@example.com',
      });

      let cancelled = false;
      try {
        await ctx.orm
          .update(triggerDemoRecordTable)
          .set({ name: '   ' })
          .where(eq(triggerDemoRecordTable.id, record.id));
      } catch (error) {
        const message = asErrorMessage(error);
        cancelled =
          message.includes('TriggerCancelledError') ||
          message.includes('Trigger cancelled');
        if (!cancelled) {
          throw error;
        }
      }

      if (!cancelled) {
        throw new Error('Expected TriggerCancelledError on invalid update');
      }

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirstOrThrow({
        where: { id: record.id },
      });

      if (persisted.name !== 'Update Cancel') {
        throw new Error('Cancelled update should not modify row');
      }

      return {
        cancelled,
        name: persisted.name,
      };
    },
    'update-after-side-effects': async () => {
      const runId = createProbeRunId(ctx.userId, 'update-after');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Update After',
        email: 'update.after@example.com',
      });

      await ctx.orm
        .update(triggerDemoRecordTable)
        .set({ status: 'archived' })
        .where(eq(triggerDemoRecordTable.id, record.id));

      const audits = await getAuditsByRunId(ctx, runId);
      const stats = await getStatsByRunId(ctx, runId);
      const updateAfterCount = audits.filter(
        (audit) => audit.hook === 'update.after'
      ).length;

      if (updateAfterCount === 0) {
        throw new Error('Expected update.after audit entry');
      }
      if (!stats || stats.updateCount < 1) {
        throw new Error('Expected update.after to bump updateCount');
      }

      return {
        updateAfterCount,
        updateCount: stats.updateCount,
      };
    },
    'delete-before-cancel': async () => {
      const runId = createProbeRunId(ctx.userId, 'delete-cancel');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Delete Guarded',
        email: 'delete.cancel@example.com',
        deleteGuard: true,
      });

      let cancelled = false;
      try {
        await ctx.orm
          .delete(triggerDemoRecordTable)
          .where(eq(triggerDemoRecordTable.id, record.id));
      } catch (error) {
        const message = asErrorMessage(error);
        cancelled =
          message.includes('TriggerCancelledError') ||
          message.includes('Trigger cancelled');
        if (!cancelled) {
          throw error;
        }
      }

      if (!cancelled) {
        throw new Error('Expected TriggerCancelledError on guarded delete');
      }

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirst({
        where: { id: record.id },
      });
      if (!persisted) {
        throw new Error('Cancelled delete should not remove row');
      }

      return {
        cancelled,
        persistedId: persisted.id,
      };
    },
    'delete-after-side-effects': async () => {
      const runId = createProbeRunId(ctx.userId, 'delete-after');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Delete After',
        email: 'delete.after@example.com',
      });

      await ctx.orm
        .delete(triggerDemoRecordTable)
        .where(eq(triggerDemoRecordTable.id, record.id));

      const deleted = await ctx.orm.query.triggerDemoRecord.findFirst({
        where: { id: record.id },
      });
      const audits = await getAuditsByRunId(ctx, runId);
      const stats = await getStatsByRunId(ctx, runId);
      const deleteAfterCount = audits.filter(
        (audit) => audit.hook === 'delete.after'
      ).length;

      if (deleted) {
        throw new Error('Expected row to be deleted');
      }
      if (deleteAfterCount === 0) {
        throw new Error('Expected delete.after audit entry');
      }
      if (!stats || stats.deleteCount < 1) {
        throw new Error('Expected delete.after to bump deleteCount');
      }

      return {
        deleteAfterCount,
        deleteCount: stats.deleteCount,
      };
    },
    'change-hook-all-ops': async () => {
      const runId = createProbeRunId(ctx.userId, 'change-ops');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Change Hook',
        email: 'change.hook@example.com',
      });

      await ctx.orm
        .update(triggerDemoRecordTable)
        .set({ status: 'archived' })
        .where(eq(triggerDemoRecordTable.id, record.id));

      await ctx.orm
        .delete(triggerDemoRecordTable)
        .where(eq(triggerDemoRecordTable.id, record.id));

      const audits = await getAuditsByRunId(ctx, runId);
      const changeAudits = audits.filter((audit) => audit.hook === 'change');
      const operationCounts = changeAudits.reduce(
        (acc, audit) => {
          acc[audit.operation] = (acc[audit.operation] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const stats = await getStatsByRunId(ctx, runId);

      if (
        !operationCounts.insert ||
        !operationCounts.update ||
        !operationCounts.delete
      ) {
        throw new Error('Expected change hook to observe insert/update/delete');
      }
      if (!stats || stats.changeCount !== changeAudits.length) {
        throw new Error('Expected changeCount to match change audit rows');
      }

      return {
        operationCounts,
        changeCount: stats.changeCount,
      };
    },
    'recursive-write-queue': async () => {
      const runId = createProbeRunId(ctx.userId, 'recursive');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'Recursive Queue',
        email: 'recursive@example.com',
      });

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirstOrThrow({
        where: { id: record.id },
      });
      const audits = await getAuditsByRunId(ctx, runId);
      const updateAfterCount = audits.filter(
        (audit) => audit.hook === 'update.after'
      ).length;
      const changeUpdateCount = audits.filter(
        (audit) => audit.hook === 'change' && audit.operation === 'update'
      ).length;

      if (persisted.recursivePatchCount !== 1) {
        throw new Error(
          'Expected recursive patch to set recursivePatchCount=1'
        );
      }
      if (updateAfterCount !== 1 || changeUpdateCount !== 1) {
        throw new Error('Expected exactly one queued update lifecycle pass');
      }

      return {
        recursivePatchCount: persisted.recursivePatchCount,
        updateAfterCount,
        changeUpdateCount,
      };
    },
    'innerdb-bypass': async () => {
      const runId = createProbeRunId(ctx.userId, 'innerdb');
      const record = await insertTriggerDemoRecord(ctx, {
        runId,
        ownerId: ctx.userId,
        name: 'InnerDb',
        email: 'innerdb@example.com',
      });

      const persisted = await ctx.orm.query.triggerDemoRecord.findFirstOrThrow({
        where: { id: record.id },
      });
      const audits = await getAuditsByRunId(ctx, runId);
      const hookCounts = countByHookAndOperation(
        audits.map((audit) => ({
          hook: audit.hook,
          operation: audit.operation,
        }))
      );
      const changeUpdateCount = hookCounts['change:update'] ?? 0;

      if (persisted.lifecycleTag !== 'innerdb-patched') {
        throw new Error('Expected innerDb patch to set lifecycleTag');
      }
      if (changeUpdateCount !== 1) {
        throw new Error(
          'Expected only one change:update from recursive ctx.db patch'
        );
      }

      return {
        lifecycleTag: persisted.lifecycleTag,
        hookCounts,
      };
    },
    'user-create-after-bootstrap': async () => {
      const token = Math.random().toString(36).slice(2, 10);
      const email = `trigger-user-${token}@example.com`;
      const [user] = await ctx.orm
        .insert(userTable)
        .values({
          name: `Trigger User ${token}`,
          email,
          emailVerified: false,
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const persisted = await ctx.orm.query.user.findFirstOrThrow({
        where: { id: user.id },
      });
      const organizationId = persisted.personalOrganizationId;
      const member = organizationId
        ? await ctx.orm.query.member.findFirst({
            where: {
              userId: persisted.id,
              organizationId,
              role: 'owner',
            },
          })
        : null;

      try {
        if (
          !organizationId ||
          persisted.lastActiveOrganizationId !== organizationId
        ) {
          throw new Error(
            'Expected user.create.after to bootstrap personal org'
          );
        }
        if (!member) {
          throw new Error(
            'Expected user.create.after to create owner membership'
          );
        }

        return {
          userId: persisted.id,
          organizationId,
          memberId: member.id,
        };
      } finally {
        await cleanupSyntheticAuthEntities(ctx, {
          userId: persisted.id,
          organizationId,
        });
      }
    },
    'session-create-after-bootstrap': async () => {
      const token = Math.random().toString(36).slice(2, 10);
      const email = `trigger-session-${token}@example.com`;
      const [user] = await ctx.orm
        .insert(userTable)
        .values({
          name: `Trigger Session ${token}`,
          email,
          emailVerified: false,
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const persistedUser = await ctx.orm.query.user.findFirstOrThrow({
        where: { id: user.id },
      });
      const organizationId = persistedUser.personalOrganizationId;
      if (!organizationId) {
        await cleanupSyntheticAuthEntities(ctx, {
          userId: persistedUser.id,
        });
        throw new Error('Expected user trigger bootstrap before session probe');
      }

      const [session] = await ctx.orm
        .insert(sessionTable)
        .values({
          token: `trigger-session-token-${token}`,
          userId: persistedUser.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          activeOrganizationId: null,
          test: 'trigger-probe',
        })
        .returning();

      const persistedSession = await ctx.orm.query.session.findFirstOrThrow({
        where: { id: session.id },
      });
      const matched = persistedSession.activeOrganizationId === organizationId;

      try {
        return {
          sessionId: persistedSession.id,
          matched,
          expectedOrganizationId: organizationId,
          activeOrganizationId: persistedSession.activeOrganizationId,
        };
      } finally {
        await cleanupSyntheticAuthEntities(ctx, {
          sessionId: persistedSession.id,
          userId: persistedUser.id,
          organizationId,
        });
      }
    },
  };

  const entries = await Promise.all(
    TRIGGER_COVERAGE_DEFINITIONS.map(async (definition) => ({
      ...definition,
      probe: await runProbe(probes[definition.id]),
    }))
  ).then((items) => items as TriggerCoverageEntry[]);

  const summary = entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    {
      supported: 0,
      partial: 0,
      blocked: 0,
      missing: 0,
    } as Record<TriggerCoverageStatus, number>
  );

  const validated = entries.filter((entry) => {
    if (entry.status === 'blocked') {
      return !entry.probe.ok;
    }
    return entry.probe.ok;
  }).length;

  const latestAudits = await ctx.orm.query.triggerDemoAudit.findMany({
    where: { ownerId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    limit: 200,
  });

  const payload: TriggerCoverageSnapshot = {
    generatedAt: new Date().toISOString(),
    entries,
    summary,
    validated,
    total: entries.length,
    samples: {
      hookCounts: countByHookAndOperation(
        latestAudits.map((audit) => ({
          hook: audit.hook,
          operation: audit.operation,
        }))
      ),
      runCount: 0,
    },
  };

  await ctx.orm.insert(triggerDemoRunTable).values({
    ownerId: ctx.userId,
    summary: payload,
  });

  return payload;
});
