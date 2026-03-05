import { eq, type InferInsertModel } from 'better-convex/orm';
import { authMutation, authQuery } from '../lib/crpc';
import type { MutationCtx, QueryCtx } from './generated/server';
import {
  ormPolymorphicEventTable,
  projectsTable,
  tagsTable,
  todosTable,
} from './schema';

type OrmDemoCtx = (QueryCtx | MutationCtx) & {
  userId: string;
};

type OrmDemoMutationCtx = MutationCtx & {
  userId: string;
};

type EventType = 'todo_completed' | 'project_visibility' | 'tag_renamed';
type OrmPolymorphicEventInsert = InferInsertModel<
  typeof ormPolymorphicEventTable
>;
type OrmPolymorphicEventWhere = NonNullable<
  Parameters<
    OrmDemoMutationCtx['orm']['query']['ormPolymorphicEvent']['findMany']
  >[0]['where']
>;

type ProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

type CoverageEntry = {
  id: string;
  feature: string;
  expected: 'supported' | 'blocked';
  reason: string;
  probe: ProbeResult;
};

const ERROR_CODE_PATTERN = /^[A-Z0-9_]+$/;
function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractErrorCode(message: string): string | null {
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

function summarizeValue(value: unknown): unknown {
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

async function runProbe(probe: () => Promise<unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    const value = await probe();
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      error: null,
      errorCode: null,
      value: summarizeValue(value),
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

async function ensureDemoArtifacts(ctx: OrmDemoMutationCtx): Promise<{
  todoId: string;
  projectId: string;
  tagId: string;
  tagName: string;
}> {
  const now = Date.now();

  const existingTodo = await ctx.orm.query.todos.findFirst({
    where: { userId: ctx.userId },
    columns: { id: true },
  });

  const todoId =
    existingTodo?.id ??
    (
      await ctx.orm
        .insert(todosTable)
        .values({
          title: `ORM polymorphic todo ${now}`,
          completed: false,
          userId: ctx.userId,
        })
        .returning({ id: todosTable.id })
        .execute()
    )[0]?.id;

  const existingProject = await ctx.orm.query.projects.findFirst({
    where: { ownerId: ctx.userId },
    columns: { id: true },
  });

  const projectId =
    existingProject?.id ??
    (
      await ctx.orm
        .insert(projectsTable)
        .values({
          name: `ORM polymorphic project ${now}`,
          description: 'Created by orm demo coverage.',
          isPublic: false,
          archived: false,
          ownerId: ctx.userId,
        })
        .returning({ id: projectsTable.id })
        .execute()
    )[0]?.id;

  const existingTag = await ctx.orm.query.tags.findFirst({
    where: { createdBy: ctx.userId },
    columns: { id: true, name: true },
  });

  const createdTagName = `orm-demo-${Math.abs(now).toString(36)}`;
  const createdTag =
    existingTag ??
    (
      await ctx.orm
        .insert(tagsTable)
        .values({
          name: createdTagName,
          color: '#22c55e',
          createdBy: ctx.userId,
        })
        .returning({ id: tagsTable.id, name: tagsTable.name })
        .execute()
    )[0];

  if (!todoId || !projectId || !createdTag?.id) {
    throw new Error('Failed to create ORM polymorphic demo artifacts.');
  }

  return {
    todoId,
    projectId,
    tagId: createdTag.id,
    tagName: createdTag.name,
  };
}

async function insertEventSet(
  ctx: OrmDemoMutationCtx,
  artifacts: {
    todoId: string;
    projectId: string;
    tagId: string;
    tagName: string;
  }
): Promise<number> {
  await ctx.orm.insert(ormPolymorphicEventTable).values({
    actorId: ctx.userId,
    eventType: 'todo_completed',
    todoId: artifacts.todoId,
    completed: true,
  });

  await ctx.orm.insert(ormPolymorphicEventTable).values({
    actorId: ctx.userId,
    eventType: 'project_visibility',
    projectId: artifacts.projectId,
    isPublic: true,
  });

  await ctx.orm.insert(ormPolymorphicEventTable).values({
    actorId: ctx.userId,
    eventType: 'tag_renamed',
    tagId: artifacts.tagId,
    previousName: artifacts.tagName,
    nextName: `${artifacts.tagName}-renamed`,
  });

  return 3;
}

async function collectRecentEvents(ctx: OrmDemoCtx, limit = 16) {
  const rows = await ctx.orm.query.ormPolymorphicEvent.findMany({
    where: { actorId: ctx.userId },
    limit,
    withVariants: true,
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    eventType: row.eventType,
    details: row.details,
    actor: row.actor,
    todo: row.todo,
    project: row.project,
    tag: row.tag,
  }));
}

async function buildSnapshot(ctx: OrmDemoCtx) {
  const recentEvents = await collectRecentEvents(ctx, 16);

  const byType = {
    todo_completed: 0,
    project_visibility: 0,
    tag_renamed: 0,
  } satisfies Record<EventType, number>;

  for (const row of recentEvents) {
    const key = row.eventType as EventType;

    byType[key] += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRecentEvents: recentEvents.length,
      byType,
    },
    recentEvents,
  };
}

export const getSnapshot = authQuery.query(async ({ ctx }) => {
  return await buildSnapshot(ctx as OrmDemoCtx);
});

export const seedPolymorphic = authMutation.mutation(async ({ ctx }) => {
  const artifacts = await ensureDemoArtifacts(ctx as OrmDemoMutationCtx);
  const inserted = await insertEventSet(ctx as OrmDemoMutationCtx, artifacts);

  return {
    inserted,
    references: artifacts,
  };
});

export const clearPolymorphic = authMutation.mutation(async ({ ctx }) => {
  const existing = await ctx.orm.query.ormPolymorphicEvent.findMany({
    where: { actorId: ctx.userId },
    columns: { id: true },
    limit: 500,
  });

  if (existing.length > 0) {
    await ctx.orm
      .delete(ormPolymorphicEventTable)
      .where(eq(ormPolymorphicEventTable.actorId, ctx.userId))
      .execute();
  }

  return {
    deleted: existing.length,
  };
});

export const runCoverage = authMutation.mutation(async ({ ctx }) => {
  const mutationCtx = ctx as OrmDemoMutationCtx;
  const artifacts = await ensureDemoArtifacts(mutationCtx);
  await insertEventSet(mutationCtx, artifacts);

  const entries = await Promise.all([
    (async (): Promise<CoverageEntry> => ({
      id: 'generated-field-filter',
      feature: 'generated top-level field filter',
      expected: 'supported',
      reason: 'Query by eventType + generated variant column (todoId).',
      probe: await runProbe(async () => {
        const whereWithGeneratedField = {
          actorId: mutationCtx.userId,
          eventType: 'todo_completed',
          todoId: artifacts.todoId,
        } as unknown as OrmPolymorphicEventWhere;
        return await mutationCtx.orm.query.ormPolymorphicEvent.findMany({
          where: whereWithGeneratedField,
          limit: 5,
        });
      }),
    }))(),
    (async (): Promise<CoverageEntry> => ({
      id: 'details-union-synthesis',
      feature: 'details union synthesis',
      expected: 'supported',
      reason: 'Read rows expose nested details object by discriminator.',
      probe: await runProbe(async () => {
        const row = await mutationCtx.orm.query.ormPolymorphicEvent.findFirst({
          where: {
            actorId: mutationCtx.userId,
            eventType: 'tag_renamed',
          },
          withVariants: true,
        });

        if (!row || row.eventType !== 'tag_renamed') {
          throw new Error('Missing tag_renamed row for synthesis probe.');
        }

        return {
          details: row.details,
          tagName: row.tag?.name ?? null,
        };
      }),
    }))(),
    (async (): Promise<CoverageEntry> => ({
      id: 'flat-write-shape',
      feature: 'flat write shape',
      expected: 'supported',
      reason: 'Mutation writes remain flat (eventType + generated columns).',
      probe: await runProbe(async () => {
        const inserted = await mutationCtx.orm
          .insert(ormPolymorphicEventTable)
          .values({
            actorId: mutationCtx.userId,
            eventType: 'project_visibility',
            projectId: artifacts.projectId,
            isPublic: false,
          })
          .returning({
            id: ormPolymorphicEventTable.id,
            eventType: ormPolymorphicEventTable.eventType,
            projectId: ormPolymorphicEventTable.projectId,
            isPublic: ormPolymorphicEventTable.isPublic,
          })
          .execute();

        return inserted ?? null;
      }),
    }))(),
    (async (): Promise<CoverageEntry> => ({
      id: 'branch-required-enforcement',
      feature: 'branch required field enforcement',
      expected: 'blocked',
      reason:
        'todo_completed requires todoId + completed when eventType is todo_completed.',
      probe: await runProbe(async () => {
        const invalidWrite = {
          actorId: mutationCtx.userId,
          eventType: 'todo_completed',
        } as unknown as OrmPolymorphicEventInsert;
        return await mutationCtx.orm
          .insert(ormPolymorphicEventTable)
          .values(invalidWrite);
      }),
    }))(),
    (async (): Promise<CoverageEntry> => ({
      id: 'cross-branch-write-rejection',
      feature: 'cross-branch write rejection',
      expected: 'blocked',
      reason:
        'projectId belongs to project_visibility and is rejected for todo_completed.',
      probe: await runProbe(async () => {
        const invalidWrite = {
          actorId: mutationCtx.userId,
          eventType: 'todo_completed',
          todoId: artifacts.todoId,
          completed: true,
          projectId: artifacts.projectId,
        } as unknown as OrmPolymorphicEventInsert;
        return await mutationCtx.orm
          .insert(ormPolymorphicEventTable)
          .values(invalidWrite);
      }),
    }))(),
  ]);

  const validated = entries.filter((entry) =>
    entry.expected === 'supported' ? entry.probe.ok : !entry.probe.ok
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    validated,
    total: entries.length,
    entries,
    snapshot: await buildSnapshot(mutationCtx),
  };
});
