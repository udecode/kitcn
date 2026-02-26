import { eq } from 'better-convex/orm';
import { z } from 'zod';
import { authMutation, authQuery } from '../lib/crpc';
import {
  AGGREGATE_PARITY_DEFINITIONS,
  type AggregateParityDefinition,
  type AggregateParityId,
  type AggregateParityStatus,
} from './aggregateDemo.parity';
import type { MutationCtx, QueryCtx } from './generated/server';
import {
  aggregateDemoRunTable,
  projectMembersTable,
  projectsTable,
  tagsTable,
  todoCommentsTable,
  todosTable,
  todoTagsTable,
} from './schema';

type AggregateDemoCtx = (QueryCtx | MutationCtx) & {
  userId: string;
};

type AggregateDemoMutationCtx = MutationCtx & {
  userId: string;
};

const ERROR_CODE_PATTERN = /^[A-Z0-9_]+$/;

type AggregateProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

type AggregateParityEntry = AggregateParityDefinition & {
  probe: AggregateProbeResult;
};

type AggregateEngineProbe = {
  id: 'aggregate' | 'countSelect' | 'relationCount';
  label: string;
  serialMs: number | null;
  parallelMs: number | null;
  parallelized: boolean | null;
  note: string | null;
  error: string | null;
  errorCode: string | null;
};

type RuntimeCoverageProbe = {
  id: string;
  area: 'count' | 'aggregate' | 'relationCount';
  label: string;
  expected: 'supported' | 'blocked';
  reason: string;
  errorCode: string | null;
  probe: AggregateProbeResult;
};

const DIRECT_OPS = [
  'insertTodo',
  'toggleRandomTodo',
  'softDeleteTodo',
  'restoreTodo',
] as const;

const AGGREGATE_STORAGE_TABLES = [
  'aggregate_bucket',
  'aggregate_member',
  'aggregate_extrema',
  'aggregate_rank_tree',
  'aggregate_rank_node',
  'aggregate_state',
] as const;

const DirectOpSchema = z.object({
  op: z.enum(DIRECT_OPS),
});

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function makeSeededRandom(seed: number): () => number {
  let state = seed % 2_147_483_647;
  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

function randomToken(length = 6): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length);
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

function summarizeProbeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      size: value.length,
      first: value[0] ?? null,
    };
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      6
    );
    return Object.fromEntries(entries);
  }

  return value;
}

async function measureProbe<T>(
  probe: () => Promise<T>
): Promise<{ elapsedMs: number; value: T }> {
  const startedAt = Date.now();
  const value = await probe();
  return {
    elapsedMs: Date.now() - startedAt,
    value,
  };
}

async function runProbe(
  probe: () => Promise<unknown>
): Promise<AggregateProbeResult> {
  const startedAt = Date.now();
  try {
    const { elapsedMs, value } = await measureProbe(probe);
    return {
      ok: true,
      elapsedMs,
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

async function getActiveRun(ctx: AggregateDemoCtx) {
  return ctx.orm.query.aggregateDemoRun.findFirst({
    where: { userId: ctx.userId, active: true },
  });
}

async function collectProjectSummaries(ctx: AggregateDemoCtx) {
  const [projectsWithCounts, projectsWithCompletedCounts] = await Promise.all([
    ctx.orm.query.projects.findMany({
      where: { ownerId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      limit: 5,
      columns: { id: true, name: true },
      with: {
        _count: {
          members: true,
          todos: true,
        },
      },
    }),
    ctx.orm.query.projects.findMany({
      where: { ownerId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      limit: 5,
      columns: { id: true },
      with: {
        _count: {
          todos: {
            where: { completed: true },
          },
        },
      },
    }),
  ]);

  const completedTodoCountByProject = new Map<string, number>(
    projectsWithCompletedCounts.map((project) => [
      project.id,
      project._count?.todos ?? 0,
    ])
  );

  return projectsWithCounts.map((project) => ({
    id: project.id,
    name: project.name,
    memberCount: project._count?.members ?? 0,
    todoCount: project._count?.todos ?? 0,
    completedTodoCount: completedTodoCountByProject.get(project.id) ?? 0,
  }));
}

async function collectTagSummaries(ctx: AggregateDemoCtx) {
  const tags = await ctx.orm.query.tags.findMany({
    where: { createdBy: ctx.userId },
    orderBy: { createdAt: 'asc' },
    limit: 5,
    columns: { id: true, name: true },
    with: {
      _count: {
        todos: true,
      },
    },
  });

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    usageCount: tag._count?.todos ?? 0,
  }));
}

async function collectReplySummaries(ctx: AggregateDemoCtx) {
  const rootComments = await ctx.orm.query.todoComments.findMany({
    where: {
      userId: ctx.userId,
      parentId: { isNull: true },
    },
    orderBy: { createdAt: 'desc' },
    limit: 5,
    columns: { id: true, content: true },
    with: {
      _count: {
        replies: true,
      },
    },
  });

  return rootComments.map((comment) => ({
    id: comment.id,
    preview:
      comment.content.slice(0, 48) + (comment.content.length > 48 ? '...' : ''),
    replyCount: comment._count?.replies ?? 0,
  }));
}

async function collectMetrics(ctx: AggregateDemoCtx) {
  const where = {
    userId: ctx.userId,
    deletionTime: { isNull: true as const },
  };

  try {
    const aggregates = await ctx.orm.query.todos.aggregate({
      where,
      _count: { dueDate: true },
      _min: { dueDate: true },
      _max: { dueDate: true },
    });

    return {
      status: 'ready' as const,
      error: null,
      dueDateCount: aggregates._count?.dueDate ?? null,
      dueDateMin: aggregates._min?.dueDate ?? null,
      dueDateMax: aggregates._max?.dueDate ?? null,
    };
  } catch (error) {
    return {
      status: 'pending' as const,
      error: asErrorMessage(error),
      dueDateCount: null,
      dueDateMin: null,
      dueDateMax: null,
    };
  }
}

async function collectParity(ctx: AggregateDemoCtx) {
  const todosWhere = {
    userId: ctx.userId,
    deletionTime: { isNull: true as const },
  };

  const probes: Record<AggregateParityId, () => Promise<unknown>> = {
    'aggregate-core': () =>
      ctx.orm.query.todos.aggregate({
        where: todosWhere,
        _count: {
          _all: true,
          dueDate: true,
        },
        _sum: { dueDate: true },
        _avg: { dueDate: true },
        _min: { dueDate: true },
        _max: { dueDate: true },
      }),
    'aggregate-sum-nullability': () =>
      ctx.orm.query.todos.aggregate({
        where: {
          userId: 'missing-user',
          deletionTime: { isNull: true },
        },
        _sum: { dueDate: true },
      }),
    'groupby-core': () =>
      ctx.orm.query.todos.groupBy({
        by: ['userId'],
        where: {
          userId: { in: [ctx.userId, 'missing-user'] },
          deletionTime: { isNull: true },
        },
        _count: true,
        _sum: { dueDate: true },
      }),
    'groupby-advanced-args': () =>
      (
        ctx.orm.query.todos.groupBy as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        by: ['userId'],
        where: {
          userId: { in: [ctx.userId, 'missing-user'] },
          deletionTime: { isNull: true },
        },
        _count: true,
        _sum: { dueDate: true },
        orderBy: [{ _count: 'desc' }, { _sum: { dueDate: 'desc' } }],
        skip: 0,
        take: 5,
        cursor: {
          _count: 999_999,
          _sum: { dueDate: 999_999_999 },
          userId: 'zzzz',
        },
        having: {
          _count: { gte: 0 },
        },
      }),
    'groupby-window-order-required': () =>
      (
        ctx.orm.query.todos.groupBy as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        by: ['userId'],
        where: {
          userId: { in: [ctx.userId, 'missing-user'] },
          deletionTime: { isNull: true },
        },
        _count: true,
        skip: 1,
      }),
    'groupby-having-conjunction-only': () =>
      (
        ctx.orm.query.todos.groupBy as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        by: ['userId'],
        where: {
          userId: { in: [ctx.userId, 'missing-user'] },
          deletionTime: { isNull: true },
        },
        _count: true,
        having: {
          OR: [{ _count: { gt: 0 } }],
        },
      }),
    'groupby-orderby-selected-metrics-only': () =>
      (
        ctx.orm.query.todos.groupBy as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        by: ['userId'],
        where: {
          userId: { in: [ctx.userId, 'missing-user'] },
          deletionTime: { isNull: true },
        },
        _count: true,
        orderBy: [{ _sum: { dueDate: 'desc' } }],
      }),
    'count-basic': () => ctx.orm.query.todos.count(),
    'count-filtered': () =>
      ctx.orm.query.todos.count({
        where: todosWhere,
      }),
    'count-select': () =>
      ctx.orm.query.todos.count({
        where: todosWhere,
        select: {
          _all: true,
          dueDate: true,
          priority: true,
        },
      }),
    'relation-count-unfiltered': () =>
      ctx.orm.query.user.findMany({
        where: { id: ctx.userId },
        limit: 1,
        with: {
          _count: {
            todos: true,
          },
        },
      }),
    'relation-count-filtered-direct': () =>
      ctx.orm.query.user.findMany({
        where: { id: ctx.userId },
        limit: 1,
        with: {
          _count: {
            todos: {
              where: {
                completed: true,
                deletionTime: { isNull: true },
              },
            },
          },
        },
      }),
    'aggregate-window-args': () =>
      (
        ctx.orm.query.todos.aggregate as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        _count: true,
        orderBy: { createdAt: 'desc' },
        skip: 1,
        take: 5,
      }),
    'aggregate-count-filter-subset': () =>
      ctx.orm.query.todos.aggregate({
        where: {
          OR: [
            {
              userId: ctx.userId,
              completed: true,
              deletionTime: { isNull: true },
            },
            {
              userId: 'missing-user',
              completed: false,
              deletionTime: { isNull: true },
            },
          ],
        } as unknown as Record<string, unknown>,
        _count: true,
      }),
    'relation-count-nested-filter': () =>
      ctx.orm.query.user.findMany({
        where: { id: ctx.userId },
        limit: 1,
        with: {
          _count: {
            todos: {
              where: {
                project: { name: 'blocked' },
              } as unknown as Record<string, unknown>,
            },
          },
        },
      }),
    'distinct-query': () =>
      (
        ctx.orm.query.todos.findMany as unknown as (
          input: Record<string, unknown>
        ) => Promise<unknown>
      )({
        where: todosWhere,
        distinct: ['completed'],
        limit: 10,
      }),
    'relation-count-through-filter': () =>
      ctx.orm.query.user.findMany({
        where: { id: ctx.userId },
        limit: 1,
        with: {
          _count: {
            memberProjects: {
              where: {
                ownerId: ctx.userId,
              } as unknown as Record<string, unknown>,
            },
          },
        },
      }),
    'mutation-return-count': async () => ({
      status: 'covered-by-tests',
    }),
  };

  const entries = await Promise.all(
    AGGREGATE_PARITY_DEFINITIONS.map(async (definition) => ({
      ...definition,
      probe: await runProbe(probes[definition.id]),
    }))
  ).then((items) => items as AggregateParityEntry[]);

  const summary = entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { supported: 0, partial: 0, blocked: 0, missing: 0 } as Record<
      AggregateParityStatus,
      number
    >
  );

  return { entries, summary };
}

async function collectEngineBehavior(
  ctx: AggregateDemoCtx
): Promise<
  Record<'aggregate' | 'countSelect' | 'relationCount', AggregateEngineProbe>
> {
  const todosWhere = {
    userId: ctx.userId,
    deletionTime: { isNull: true as const },
  };

  const buildFailure = (
    id: AggregateEngineProbe['id'],
    label: AggregateEngineProbe['label'],
    error: unknown
  ): AggregateEngineProbe => {
    const message = asErrorMessage(error);
    return {
      id,
      label,
      serialMs: null,
      parallelMs: null,
      parallelized: null,
      note: null,
      error: message,
      errorCode: extractErrorCode(message),
    };
  };

  const aggregateProbe = await (async (): Promise<AggregateEngineProbe> => {
    try {
      const serialRuns: Array<() => Promise<unknown>> = [
        () =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _count: { dueDate: true },
          }),
        () =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _sum: { dueDate: true },
          }),
        () =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _avg: { dueDate: true },
          }),
        () =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _min: { dueDate: true },
          }),
        () =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _max: { dueDate: true },
          }),
      ];

      let serialMs = 0;
      for (const run of serialRuns) {
        serialMs += (await measureProbe(run)).elapsedMs;
      }

      const parallelMs = (
        await measureProbe(() =>
          ctx.orm.query.todos.aggregate({
            where: todosWhere,
            _count: { dueDate: true },
            _sum: { dueDate: true },
            _avg: { dueDate: true },
            _min: { dueDate: true },
            _max: { dueDate: true },
          })
        )
      ).elapsedMs;

      return {
        id: 'aggregate',
        label: 'aggregate metric execution',
        serialMs,
        parallelMs,
        parallelized: parallelMs <= serialMs,
        note: 'serial baseline is separate metric queries',
        error: null,
        errorCode: null,
      };
    } catch (error) {
      return buildFailure('aggregate', 'aggregate metric execution', error);
    }
  })();

  const countSelectProbe = await (async (): Promise<AggregateEngineProbe> => {
    try {
      const serialRuns: Array<() => Promise<unknown>> = [
        () =>
          ctx.orm.query.todos.count({
            where: todosWhere,
            select: { dueDate: true },
          }),
        () =>
          ctx.orm.query.todos.count({
            where: todosWhere,
            select: { priority: true },
          }),
      ];

      let serialMs = 0;
      for (const run of serialRuns) {
        serialMs += (await measureProbe(run)).elapsedMs;
      }

      const parallelMs = (
        await measureProbe(() =>
          ctx.orm.query.todos.count({
            where: todosWhere,
            select: {
              dueDate: true,
              priority: true,
            },
          })
        )
      ).elapsedMs;

      return {
        id: 'countSelect',
        label: 'count({ select }) field execution',
        serialMs,
        parallelMs,
        parallelized: parallelMs <= serialMs,
        note: 'serial baseline is one query per selected field',
        error: null,
        errorCode: null,
      };
    } catch (error) {
      return buildFailure(
        'countSelect',
        'count({ select }) field execution',
        error
      );
    }
  })();

  const relationCountProbe = await (async (): Promise<AggregateEngineProbe> => {
    try {
      const serialRuns: Array<() => Promise<unknown>> = [
        () =>
          ctx.orm.query.user.findMany({
            where: { id: ctx.userId },
            limit: 1,
            with: {
              _count: {
                todos: {
                  where: {
                    completed: true,
                    deletionTime: { isNull: true },
                  },
                },
              },
            },
          }),
        () =>
          ctx.orm.query.user.findMany({
            where: { id: ctx.userId },
            limit: 1,
            with: {
              _count: {
                ownedProjects: true,
              },
            },
          }),
      ];

      let serialMs = 0;
      for (const run of serialRuns) {
        serialMs += (await measureProbe(run)).elapsedMs;
      }

      const parallelMs = (
        await measureProbe(() =>
          ctx.orm.query.user.findMany({
            where: { id: ctx.userId },
            limit: 1,
            with: {
              _count: {
                todos: {
                  where: {
                    completed: true,
                    deletionTime: { isNull: true },
                  },
                },
                ownedProjects: true,
              },
            },
          })
        )
      ).elapsedMs;

      return {
        id: 'relationCount',
        label: 'relation _count loading',
        serialMs,
        parallelMs,
        parallelized: parallelMs <= serialMs,
        note: 'serial baseline is one relation-count query per relation',
        error: null,
        errorCode: null,
      };
    } catch (error) {
      return buildFailure('relationCount', 'relation _count loading', error);
    }
  })();

  return {
    aggregate: aggregateProbe,
    countSelect: countSelectProbe,
    relationCount: relationCountProbe,
  };
}

async function collectRuntimeCoverage(
  ctx: AggregateDemoCtx
): Promise<RuntimeCoverageProbe[]> {
  const todosWhere = {
    userId: ctx.userId,
    deletionTime: { isNull: true as const },
  };

  const cursorTodo = await ctx.orm.query.todos.findFirst({
    where: todosWhere,
    orderBy: { createdAt: 'asc' },
    columns: { createdAt: true },
  });
  const cursorCreatedAt =
    typeof cursorTodo?.createdAt === 'number'
      ? cursorTodo.createdAt
      : cursorTodo?.createdAt instanceof Date
        ? cursorTodo.createdAt.getTime()
        : 0;

  const probes = [
    {
      id: 'aggregate-storage-namespace',
      area: 'aggregate' as const,
      label: 'internal aggregate storage namespace (aggregate_*)',
      expected: 'supported' as const,
      reason:
        'Internal storage tables are in aggregate_* namespace (no leading underscore).',
      errorCode: null,
      run: async () => {
        const invalidPrefix = AGGREGATE_STORAGE_TABLES.filter(
          (tableName) => !tableName.startsWith('aggregate_')
        );

        for (const tableName of AGGREGATE_STORAGE_TABLES) {
          const query = (
            ctx.db.query as unknown as (table: string) => {
              take: (limit: number) => Promise<unknown>;
            }
          )(tableName);
          await query.take(0);
        }

        return {
          tables: AGGREGATE_STORAGE_TABLES,
          invalidPrefixCount: invalidPrefix.length,
        };
      },
    },
    {
      id: 'count-window-skip-take',
      area: 'count' as const,
      label: 'count({ orderBy, skip, take })',
      expected: 'supported' as const,
      reason: 'Windowed _all count is index-safe and bucket-backed.',
      errorCode: null,
      run: () =>
        ctx.orm.query.todos.count({
          where: todosWhere,
          orderBy: { createdAt: 'desc' },
          skip: 1,
          take: 3,
        }),
    },
    {
      id: 'count-window-cursor',
      area: 'count' as const,
      label: 'count({ orderBy, cursor })',
      expected: 'supported' as const,
      reason: 'Cursor bounds compile to scalar range constraints.',
      errorCode: null,
      run: () =>
        (
          ctx.orm.query.todos.count as unknown as (
            input: Record<string, unknown>
          ) => Promise<unknown>
        )({
          where: todosWhere,
          orderBy: { createdAt: 'asc' },
          cursor: { createdAt: cursorCreatedAt },
        }),
    },
    {
      id: 'count-select-window-blocked',
      area: 'count' as const,
      label: 'count({ select: { field }, skip/take/cursor })',
      expected: 'blocked' as const,
      reason: 'Field-select windows are blocked in v1.',
      errorCode: 'COUNT_FILTER_UNSUPPORTED',
      run: () =>
        (
          ctx.orm.query.todos.count as unknown as (
            input: Record<string, unknown>
          ) => Promise<unknown>
        )({
          where: todosWhere,
          select: { dueDate: true },
          skip: 1,
        }),
    },
    {
      id: 'aggregate-window-cursor-metrics',
      area: 'aggregate' as const,
      label: 'aggregate({ orderBy, cursor, _sum/_avg/_min/_max })',
      expected: 'supported' as const,
      reason: 'Metric cursor windows are index-safe in v1.',
      errorCode: null,
      run: () =>
        (
          ctx.orm.query.todos.aggregate as unknown as (
            input: Record<string, unknown>
          ) => Promise<unknown>
        )({
          where: todosWhere,
          orderBy: { createdAt: 'asc' },
          cursor: { createdAt: cursorCreatedAt },
          _sum: { dueDate: true },
          _avg: { dueDate: true },
          _min: { dueDate: true },
          _max: { dueDate: true },
        }),
    },
    {
      id: 'aggregate-window-skip-take-count',
      area: 'aggregate' as const,
      label: 'aggregate({ skip/take, _count })',
      expected: 'supported' as const,
      reason: 'Skip/take is supported for _count.',
      errorCode: null,
      run: () =>
        (
          ctx.orm.query.todos.aggregate as unknown as (
            input: Record<string, unknown>
          ) => Promise<unknown>
        )({
          where: todosWhere,
          orderBy: { createdAt: 'desc' },
          skip: 1,
          take: 3,
          _count: true,
        }),
    },
    {
      id: 'aggregate-window-skip-take-metrics-blocked',
      area: 'aggregate' as const,
      label: 'aggregate({ skip/take, _sum/_avg/_min/_max })',
      expected: 'blocked' as const,
      reason: 'Metric skip/take windows are not bucket-computable in v1.',
      errorCode: 'AGGREGATE_ARGS_UNSUPPORTED',
      run: () =>
        (
          ctx.orm.query.todos.aggregate as unknown as (
            input: Record<string, unknown>
          ) => Promise<unknown>
        )({
          where: todosWhere,
          orderBy: { createdAt: 'desc' },
          skip: 1,
          take: 3,
          _sum: { dueDate: true },
        }),
    },
    {
      id: 'relation-count-find-first',
      area: 'relationCount' as const,
      label: 'findFirst({ with: { _count } })',
      expected: 'supported' as const,
      reason: 'Relation _count works on findFirst.',
      errorCode: null,
      run: () =>
        ctx.orm.query.user.findFirst({
          where: { id: ctx.userId },
          columns: { id: true },
          with: {
            _count: {
              todos: true,
              ownedProjects: true,
            },
          },
        }),
    },
  ] as const;

  return await Promise.all(
    probes.map(async (probe) => ({
      id: probe.id,
      area: probe.area,
      label: probe.label,
      expected: probe.expected,
      reason: probe.reason,
      errorCode: probe.errorCode,
      probe: await runProbe(probe.run),
    }))
  );
}

async function buildSnapshot(ctx: AggregateDemoCtx) {
  const activeRun = await getActiveRun(ctx);

  const [
    userBaseCounts,
    userActiveTodoCounts,
    userCompletedTodoCounts,
    tags,
    projectSummaries,
    tagSummaries,
    replySummaries,
    metrics,
    parity,
    engineBehavior,
    runtimeCoverage,
  ] = await Promise.all([
    ctx.orm.query.user.findFirst({
      where: { id: ctx.userId },
      columns: { id: true },
      with: {
        _count: {
          ownedProjects: true,
          todos: true,
          todoComments: true,
        },
      },
    }),
    ctx.orm.query.user.findFirst({
      where: { id: ctx.userId },
      columns: { id: true },
      with: {
        _count: {
          todos: {
            where: {
              deletionTime: { isNull: true },
            },
          },
        },
      },
    }),
    ctx.orm.query.user.findFirst({
      where: { id: ctx.userId },
      columns: { id: true },
      with: {
        _count: {
          todos: {
            where: {
              completed: true,
              deletionTime: { isNull: true },
            },
          },
        },
      },
    }),
    ctx.orm.query.tags.count({ where: { createdBy: ctx.userId } }),
    collectProjectSummaries(ctx),
    collectTagSummaries(ctx),
    collectReplySummaries(ctx),
    collectMetrics(ctx),
    collectParity(ctx),
    collectEngineBehavior(ctx),
    collectRuntimeCoverage(ctx),
  ]);

  const projects = userBaseCounts?._count?.ownedProjects ?? 0;
  const totalTodosByUser = userBaseCounts?._count?.todos ?? 0;
  const todos = userActiveTodoCounts?._count?.todos ?? 0;
  const completedTodos = userCompletedTodoCounts?._count?.todos ?? 0;
  const comments = userBaseCounts?._count?.todoComments ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    seeded: !!activeRun,
    activeRun: activeRun
      ? {
          id: activeRun.id,
          seed: activeRun.seed,
          createdAt: activeRun.createdAt,
          rows: {
            projects: activeRun.projects.length,
            todos: activeRun.todos.length,
            tags: activeRun.tags.length,
            todoTags: activeRun.todoTags.length,
            projectMembers: activeRun.projectMembers.length,
            todoComments: activeRun.todoComments.length,
          },
        }
      : null,
    summary: {
      projects,
      todos,
      completedTodos,
      deletedTodos: Math.max(0, totalTodosByUser - todos),
      tags,
      comments,
    },
    readOps: {
      projectSummaries,
      tagSummaries,
      replySummaries,
      metrics,
    },
    parity,
    engineBehavior,
    runtimeCoverage,
  };
}

async function safeDeleteIds(
  ids: string[],
  exists: (id: string) => Promise<boolean>,
  remove: (id: string) => Promise<void>
): Promise<void> {
  for (const id of ids) {
    if (await exists(id)) {
      await remove(id);
    }
  }
}

async function seedDemoData(ctx: AggregateDemoMutationCtx): Promise<number> {
  const existingRuns = await ctx.orm.query.aggregateDemoRun.findMany({
    where: { userId: ctx.userId, active: true },
    limit: 20,
  });

  for (const run of existingRuns) {
    await ctx.orm
      .update(aggregateDemoRunTable)
      .set({ active: false })
      .where(eq(aggregateDemoRunTable.id, run.id));
  }

  const seed = Date.now();
  const random = makeSeededRandom(seed);

  const projectIds: string[] = [];
  const todoIds: string[] = [];
  const tagIds: string[] = [];
  const todoTagIds: string[] = [];
  const projectMemberIds: string[] = [];
  const todoCommentIds: string[] = [];

  const projectNames = ['Photon Board', 'Atlas Ops', 'Nova Inbox', 'Peak Lab'];
  const priorities = ['low', 'medium', 'high'] as const;

  for (let i = 0; i < 3; i++) {
    const [project] = await ctx.orm
      .insert(projectsTable)
      .values({
        name: `${projectNames[i]} ${Math.floor(random() * 100)}`,
        description: `Aggregate demo project ${i + 1}`,
        isPublic: random() > 0.5,
        archived: false,
        ownerId: ctx.userId,
      })
      .returning({ id: projectsTable.id });

    projectIds.push(project.id);

    const [member] = await ctx.orm
      .insert(projectMembersTable)
      .values({
        projectId: project.id,
        userId: ctx.userId,
      })
      .returning({ id: projectMembersTable.id });

    projectMemberIds.push(member.id);
  }

  const tagPalette = ['#F97316', '#0EA5E9', '#22C55E', '#EF4444'];
  for (let i = 0; i < 4; i++) {
    const [tag] = await ctx.orm
      .insert(tagsTable)
      .values({
        name: `agg-${i + 1}-${Math.floor(random() * 90 + 10)}`,
        color: tagPalette[i],
        createdBy: ctx.userId,
      })
      .returning({ id: tagsTable.id });

    tagIds.push(tag.id);
  }

  for (let i = 0; i < 14; i++) {
    const projectId = projectIds[i % projectIds.length];
    const completed = random() > 0.58;
    const priority = priorities[Math.floor(random() * priorities.length)];
    const dueOffsetDays = Math.floor(random() * 10) - 3;

    const [todo] = await ctx.orm
      .insert(todosTable)
      .values({
        title: `Aggregate deck task ${i + 1}`,
        description: `Seed ${seed}, project ${projectId.slice(0, 6)}`,
        completed,
        priority,
        dueDate: new Date(Date.now() + dueOffsetDays * 24 * 60 * 60 * 1000),
        deletionTime: null,
        userId: ctx.userId,
        projectId,
      })
      .returning({ id: todosTable.id });

    todoIds.push(todo.id);

    const tagAttachCount = Math.min(
      1 + Math.floor(random() * 3),
      tagIds.length
    );
    const chosenTags = Array.from(
      new Set(
        Array.from({ length: tagAttachCount }, () => {
          const idx = Math.floor(random() * tagIds.length);
          return tagIds[idx];
        })
      )
    );

    for (const tagId of chosenTags) {
      const [todoTag] = await ctx.orm
        .insert(todoTagsTable)
        .values({ todoId: todo.id, tagId })
        .returning({ id: todoTagsTable.id });
      todoTagIds.push(todoTag.id);
    }
  }

  for (const todoId of todoIds.slice(0, 4)) {
    const [root] = await ctx.orm
      .insert(todoCommentsTable)
      .values({
        content: `Root comment for ${todoId.slice(0, 6)}`,
        todoId,
        userId: ctx.userId,
      })
      .returning({ id: todoCommentsTable.id });

    todoCommentIds.push(root.id);

    const [reply] = await ctx.orm
      .insert(todoCommentsTable)
      .values({
        content: `Reply ${Math.floor(random() * 1000)}`,
        parentId: root.id,
        todoId,
        userId: ctx.userId,
      })
      .returning({ id: todoCommentsTable.id });

    todoCommentIds.push(reply.id);
  }

  await ctx.orm.insert(aggregateDemoRunTable).values({
    userId: ctx.userId,
    active: true,
    seed,
    projects: projectIds,
    todos: todoIds,
    tags: tagIds,
    todoTags: todoTagIds,
    projectMembers: projectMemberIds,
    todoComments: todoCommentIds,
  });

  return seed;
}

async function resetDemoData(
  ctx: AggregateDemoMutationCtx,
  run: NonNullable<Awaited<ReturnType<typeof getActiveRun>>>
): Promise<void> {
  await safeDeleteIds(
    run.todoTags,
    async (id) => !!(await ctx.orm.query.todoTags.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm.delete(todoTagsTable).where(eq(todoTagsTable.id, id));
    }
  );

  await safeDeleteIds(
    run.todoComments,
    async (id) =>
      !!(await ctx.orm.query.todoComments.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm
        .delete(todoCommentsTable)
        .where(eq(todoCommentsTable.id, id));
    }
  );

  await safeDeleteIds(
    run.projectMembers,
    async (id) =>
      !!(await ctx.orm.query.projectMembers.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm
        .delete(projectMembersTable)
        .where(eq(projectMembersTable.id, id));
    }
  );

  await safeDeleteIds(
    run.todos,
    async (id) => !!(await ctx.orm.query.todos.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm.delete(todosTable).where(eq(todosTable.id, id));
    }
  );

  await safeDeleteIds(
    run.tags,
    async (id) => !!(await ctx.orm.query.tags.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm.delete(tagsTable).where(eq(tagsTable.id, id));
    }
  );

  await safeDeleteIds(
    run.projects,
    async (id) => !!(await ctx.orm.query.projects.findFirst({ where: { id } })),
    async (id) => {
      await ctx.orm.delete(projectsTable).where(eq(projectsTable.id, id));
    }
  );

  await ctx.orm
    .update(aggregateDemoRunTable)
    .set({ active: false })
    .where(eq(aggregateDemoRunTable.id, run.id));
}

export const getSnapshot = authQuery.query(async ({ ctx }) =>
  buildSnapshot(ctx)
);

export const toggleRandomFillReset = authMutation.mutation(async ({ ctx }) => {
  const activeRun = await getActiveRun(ctx);

  if (activeRun) {
    await resetDemoData(ctx, activeRun);

    return {
      action: 'reset' as const,
      snapshot: await buildSnapshot(ctx),
    };
  }

  const seed = await seedDemoData(ctx);

  return {
    action: 'seed' as const,
    seed,
    snapshot: await buildSnapshot(ctx),
  };
});

export const runDirectOp = authMutation
  .input(DirectOpSchema)
  .mutation(async ({ ctx, input }) => {
    let message = '';

    if (input.op === 'insertTodo') {
      const project = await ctx.orm.query.projects.findFirst({
        where: { ownerId: ctx.userId },
        orderBy: { createdAt: 'desc' },
      });

      await ctx.orm.insert(todosTable).values({
        title: `Manual aggregate demo todo ${randomToken(5)}`,
        description: 'Inserted from /aggregate write lab',
        completed: false,
        priority: 'medium',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deletionTime: null,
        userId: ctx.userId,
        projectId: project?.id,
      });

      message = 'Inserted one todo.';
    }

    if (input.op === 'toggleRandomTodo') {
      const todo = await ctx.orm.query.todos.findFirst({
        where: {
          userId: ctx.userId,
          deletionTime: { isNull: true },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (todo) {
        await ctx.orm
          .update(todosTable)
          .set({ completed: !todo.completed })
          .where(eq(todosTable.id, todo.id));
        message = `Toggled completed on ${todo.id}.`;
      } else {
        message = 'No active todo to toggle.';
      }
    }

    if (input.op === 'softDeleteTodo') {
      const todo = await ctx.orm.query.todos.findFirst({
        where: {
          userId: ctx.userId,
          deletionTime: { isNull: true },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (todo) {
        await ctx.orm
          .update(todosTable)
          .set({ deletionTime: new Date() })
          .where(eq(todosTable.id, todo.id));
        message = `Soft deleted ${todo.id}.`;
      } else {
        message = 'No active todo to soft delete.';
      }
    }

    if (input.op === 'restoreTodo') {
      const todo = await ctx.orm.query.todos.findFirst({
        where: {
          userId: ctx.userId,
          deletionTime: { isNotNull: true },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (todo) {
        await ctx.orm
          .update(todosTable)
          .set({ deletionTime: null })
          .where(eq(todosTable.id, todo.id));
        message = `Restored ${todo.id}.`;
      } else {
        message = 'No soft-deleted todo to restore.';
      }
    }

    return {
      op: input.op,
      message,
      snapshot: await buildSnapshot(ctx),
    };
  });

export const exerciseIdempotentTrigger = authMutation.mutation(
  async ({ ctx }) => {
    const before = await ctx.orm.query.todos.count({
      where: { userId: ctx.userId, deletionTime: { isNull: true } },
    });

    const [todo] = await ctx.orm
      .insert(todosTable)
      .values({
        title: `count-proof-${Date.now()}`,
        description: 'temporary row for count parity proof',
        completed: false,
        priority: 'low',
        dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
        deletionTime: null,
        userId: ctx.userId,
      })
      .returning({ id: todosTable.id });

    const afterInsert = await ctx.orm.query.todos.count({
      where: { userId: ctx.userId, deletionTime: { isNull: true } },
    });

    await ctx.orm
      .update(todosTable)
      .set({ deletionTime: new Date() })
      .where(eq(todosTable.id, todo.id));

    const afterSoftDelete = await ctx.orm.query.todos.count({
      where: { userId: ctx.userId, deletionTime: { isNull: true } },
    });

    let parityCheckError: string | null = null;
    try {
      await ctx.orm.query.todos.count({
        where: {
          userId: ctx.userId,
          dueDate: { lt: new Date() },
        } as unknown as Record<string, unknown>,
      });
    } catch (error) {
      parityCheckError = asErrorMessage(error);
    }

    return {
      before,
      afterInsert,
      afterSoftDelete,
      addedExactlyOne: afterInsert === before + 1,
      returnedToBaseline: afterSoftDelete === before,
      unsupportedFilterError: parityCheckError,
      snapshot: await buildSnapshot(ctx),
    };
  }
);
