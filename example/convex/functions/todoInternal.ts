import { eq } from 'better-convex/orm';
import { z } from 'zod';
import { privateAction, privateMutation, privateQuery } from '../lib/crpc';
import { aggregateTodosByStatus, aggregateTodosByUser } from './aggregates';
import { createTodoInternalCaller } from './generated/todoInternal.runtime';
import { todosTable } from './schema';

// ============================================
// INTERNAL QUERIES (Background Processing)
// ============================================

// Get users with overdue todos for notification
export const getUsersWithOverdueTodos = privateQuery
  .input(
    z.object({
      hoursOverdue: z.number().default(24),
      limit: z.number().default(100),
    })
  )
  .output(
    z.array(
      z.object({
        userId: z.string(),
        email: z.string(),
        name: z.string().optional(),
        overdueTodos: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            dueDate: z.date(),
            daysOverdue: z.number(),
          })
        ),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    const now = new Date();
    const nowTimestamp = now.getTime();
    const cutoff = new Date(nowTimestamp - input.hoursOverdue * 60 * 60 * 1000);

    // Find overdue todos (exclude soft-deleted)
    const overdueTodos = await ctx.orm.query.todos.findMany({
      where: {
        completed: false,
        dueDate: { isNotNull: true, lt: cutoff },
        deletionTime: { isNull: true },
      },
      limit: 1000, // Get more than limit to group by user
    });

    // Group by user
    const userTodos = new Map<string, typeof overdueTodos>();
    for (const todo of overdueTodos) {
      const existing = userTodos.get(todo.userId) || [];
      existing.push(todo);
      userTodos.set(todo.userId, existing);
    }

    // Get user details and format response
    const results: Array<{
      userId: string;
      email: string;
      name: string | undefined;
      overdueTodos: Array<{
        id: string;
        title: string;
        dueDate: Date;
        daysOverdue: number;
      }>;
    }> = [];
    for (const [userId, todos] of userTodos) {
      if (results.length >= input.limit) {
        break;
      }

      const user = await ctx.orm.query.user.findFirst({
        where: { id: userId },
      });
      if (user) {
        results.push({
          userId,
          email: user.email,
          name: user.name,
          overdueTodos: todos.slice(0, 5).map((todo) => ({
            id: todo.id,
            title: todo.title,
            dueDate: todo.dueDate!,
            daysOverdue: Math.floor(
              (nowTimestamp - todo.dueDate!.getTime()) / (24 * 60 * 60 * 1000)
            ),
          })),
        });
      }
    }

    return results;
  });

// Get statistics for admin dashboard
export const getSystemStats = privateQuery
  .output(
    z.object({
      users: z.object({
        total: z.number(),
        active30d: z.number(),
        withTodos: z.number(),
      }),
      todos: z.object({
        total: z.number(),
        completed: z.number(),
        overdue: z.number(),
        byPriority: z.record(z.string(), z.number()),
      }),
      projects: z.object({
        total: z.number(),
        public: z.number(),
        active: z.number(),
      }),
      activity: z.object({
        todosCreatedToday: z.number(),
        todosCompletedToday: z.number(),
        commentsToday: z.number(),
      }),
    })
  )
  .query(async ({ ctx }) => {
    const now = new Date();
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // User stats
    const allUsers = await ctx.orm.query.user.findMany({ limit: 1000 });
    // For active users, check by creation time since _lastModified doesn't exist
    const activeUsers = allUsers.filter(
      (u) => u.createdAt.getTime() > thirtyDaysAgo
    );

    // Count users with todos using aggregates (exclude soft-deleted)
    const activeTodoCounts = allUsers.length
      ? await aggregateTodosByUser.countBatch(
          ctx,
          allUsers.map((user) => ({
            namespace: user.id,
            bounds: {
              lower: { key: ['high', false, false], inclusive: true },
              upper: { key: ['none', true, false], inclusive: true },
            },
          }))
        )
      : [];
    const usersWithTodos = activeTodoCounts.filter((count) => count > 0).length;

    // Todo stats (only count active todos, not soft-deleted)
    const totalTodos = await aggregateTodosByStatus.count(ctx, {
      bounds: {
        lower: { key: [false, 'high', 0, false], inclusive: true },
        upper: {
          key: [true, 'none', Number.POSITIVE_INFINITY, false],
          inclusive: true,
        },
      },
    });
    // Count completed active todos
    const completedTodos = await aggregateTodosByStatus.count(ctx, {
      bounds: {
        lower: { key: [true, 'high', 0, false], inclusive: true },
        upper: {
          key: [true, 'none', Number.POSITIVE_INFINITY, false],
          inclusive: true,
        },
      },
    });

    // Count overdue (exclude soft-deleted)
    const overdueTodos = (
      await ctx.orm.query.todos.findMany({
        where: {
          completed: false,
          dueDate: { isNotNull: true, lt: now },
          deletionTime: { isNull: true },
        },
        limit: 1000,
      })
    ).length;

    // Priority breakdown (exclude soft-deleted)
    const byPriority: Record<'low' | 'medium' | 'high' | 'none', number> = {
      low: 0,
      medium: 0,
      high: 0,
      none: 0,
    };
    for (const priority of ['low', 'medium', 'high'] as const) {
      byPriority[priority] = (
        await ctx.orm.query.todos.findMany({
          where: { priority, deletionTime: { isNull: true } },
          limit: 1000,
        })
      ).length;
    }
    byPriority.none = (
      await ctx.orm.query.todos.findMany({
        where: { priority: { isNull: true }, deletionTime: { isNull: true } },
        limit: 1000,
      })
    ).length;

    // Project stats
    const projects = await ctx.orm.query.projects.findMany({ limit: 1000 });
    const publicProjects = projects.filter((p) => p.isPublic);
    const activeProjects = projects.filter((p) => !p.archived);

    // Today's activity (exclude soft-deleted)
    const todosCreatedToday = (
      await ctx.orm.query.todos.findMany({
        where: {
          createdAt: { gte: todayStart },
          deletionTime: { isNull: true },
        },
        limit: 1000,
      })
    ).length;

    const todosCompletedToday = (
      await ctx.orm.query.todos.findMany({
        where: {
          completed: true,
          createdAt: { gte: todayStart },
          deletionTime: { isNull: true },
        },
        limit: 1000,
      })
    ).length;

    const commentsToday = (
      await ctx.orm.query.todoComments.findMany({
        where: { createdAt: { gte: todayStart } },
        limit: 1000,
      })
    ).length;

    return {
      users: {
        total: allUsers.length,
        active30d: activeUsers.length,
        withTodos: usersWithTodos,
      },
      todos: {
        total: totalTodos,
        completed: completedTodos,
        overdue: overdueTodos,
        byPriority,
      },
      projects: {
        total: projects.length,
        public: publicProjects.length,
        active: activeProjects.length,
      },
      activity: {
        todosCreatedToday,
        todosCompletedToday,
        commentsToday,
      },
    };
  });

// ============================================
// INTERNAL MUTATIONS (Data Maintenance)
// ============================================

// Batch update todo priorities based on due dates
export const updateOverduePriorities = privateMutation
  .input(z.object({ batchSize: z.number().default(100) }))
  .output(
    z.object({
      updated: z.number(),
      hasMore: z.boolean(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find todos due soon that aren't high priority (exclude soft-deleted)
    const urgentTodos = await ctx.orm.query.todos.findMany({
      where: {
        completed: false,
        dueDate: { isNotNull: true, lt: tomorrow },
        priority: { ne: 'high' },
        deletionTime: { isNull: true },
      },
      limit: input.batchSize,
    });

    // Update priorities
    for (const todo of urgentTodos) {
      await ctx.orm
        .update(todosTable)
        .set({ priority: 'high' })
        .where(eq(todosTable.id, todo.id));
    }

    return {
      updated: urgentTodos.length,
      hasMore: urgentTodos.length === input.batchSize,
    };
  });

// Archive completed todos older than N days
export const archiveOldCompletedTodos = privateMutation
  .input(
    z.object({
      daysOld: z.number().default(90),
      batchSize: z.number().default(100),
    })
  )
  .output(
    z.object({
      archived: z.number(),
      hasMore: z.boolean(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const cutoff = new Date(Date.now() - input.daysOld * 24 * 60 * 60 * 1000);

    const oldTodos = await ctx.orm.query.todos.findMany({
      where: {
        completed: true,
        createdAt: { lt: cutoff },
        deletionTime: { isNull: true },
      },
      limit: input.batchSize,
    });

    // In a real app, might move to an archive table
    // For demo, we'll just delete them (soft delete)
    for (const todo of oldTodos) {
      await ctx.orm
        .update(todosTable)
        .set({ deletionTime: new Date() })
        .where(eq(todosTable.id, todo.id));
    }

    return {
      archived: oldTodos.length,
      hasMore: oldTodos.length === input.batchSize,
    };
  });

// Recalculate user statistics
export const recalculateUserStats = privateMutation
  .input(z.object({ userId: z.string() }))
  .output(
    z.object({
      totalTodos: z.number(),
      completedTodos: z.number(),
      streak: z.number(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.orm.query.user.findFirstOrThrow({
      where: { id: input.userId },
    });

    // Get todo counts from aggregates (exclude soft-deleted)
    const totalTodos = await aggregateTodosByUser.count(ctx, {
      namespace: input.userId,
      bounds: {
        lower: { key: ['high', false, false], inclusive: true },
        upper: { key: ['none', true, false], inclusive: true },
      },
    });

    // Count completed todos (exclude soft-deleted)
    const completedCounts = await Promise.all([
      aggregateTodosByUser.count(ctx, {
        namespace: input.userId,
        bounds: {
          lower: { key: ['low', true, false], inclusive: true },
          upper: { key: ['low', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: input.userId,
        bounds: {
          lower: { key: ['medium', true, false], inclusive: true },
          upper: { key: ['medium', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: input.userId,
        bounds: {
          lower: { key: ['high', true, false], inclusive: true },
          upper: { key: ['high', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: input.userId,
        bounds: {
          lower: { key: ['none', true, false], inclusive: true },
          upper: { key: ['none', true, false], inclusive: true },
        },
      }),
    ]);

    const completedTodos = completedCounts.reduce(
      (sum, count) => sum + count,
      0
    );

    // Calculate streak (consecutive days with completed todos, exclude soft-deleted)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCompleted = await ctx.orm.query.todos.findMany({
      where: {
        userId: input.userId,
        completed: true,
        createdAt: { gte: thirtyDaysAgo },
        deletionTime: { isNull: true },
      },
      orderBy: { createdAt: 'desc' },
      limit: 1000,
    });

    // Calculate streak
    let streak = 0;
    const dateSet = new Set<string>();

    for (const todo of recentCompleted) {
      const todoDate = todo.createdAt.toDateString();
      dateSet.add(todoDate);
    }

    // Count consecutive days from today backwards
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toDateString();

      if (dateSet.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break; // Streak broken
      }
    }

    // Could store these stats on user document
    return {
      totalTodos,
      completedTodos,
      streak,
    };
  });

// ============================================
// INTERNAL ACTIONS (Complex Operations)
// ============================================

// Process daily summary emails
export const processDailySummaries = privateAction
  .output(
    z.object({
      processed: z.number(),
      sent: z.number(),
      failed: z.number(),
    })
  )
  .action(async ({ ctx }) => {
    const caller = createTodoInternalCaller(ctx);

    // Get users with overdue todos
    const usersToNotify = await caller.getUsersWithOverdueTodos({
      hoursOverdue: 24,
      limit: 100,
    });

    let sent = 0;
    let failed = 0;

    for (const _user of usersToNotify) {
      try {
        sent++;
      } catch (_error) {
        failed++;
      }
    }

    return {
      processed: usersToNotify.length,
      sent,
      failed,
    };
  });

// Generate weekly report
export const generateWeeklyReport = privateAction
  .input(z.object({ userId: z.string() }))
  .output(
    z.object({
      week: z.object({
        start: z.number(),
        end: z.number(),
      }),
      stats: z.object({
        todosCreated: z.number(),
        todosCompleted: z.number(),
        projectsWorkedOn: z.number(),
        mostProductiveDay: z.string().nullable(),
      }),
      insights: z.array(z.string()),
    })
  )
  .action(async ({ ctx, input }) => {
    const now = Date.now();
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    const caller = createTodoInternalCaller(ctx);

    // Get user's todos from the past week
    const weekTodos = await caller.getUserWeeklyActivity({
      userId: input.userId,
      weekStart,
    });

    // Calculate stats
    const todosCreated = weekTodos.created.length;
    const todosCompleted = weekTodos.completed.length;
    const projectsWorkedOn = new Set(
      weekTodos.all
        .map((t: { projectId?: string | null }) => t.projectId)
        .filter(Boolean)
    ).size;

    // Find most productive day
    const dayActivity = new Map<string, number>();
    for (const todo of weekTodos.completed) {
      const day = new Date(todo.completedAt).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayActivity.set(day, (dayActivity.get(day) || 0) + 1);
    }

    let mostProductiveDay: string | null = null;
    let maxCompleted = 0;
    for (const [day, count] of dayActivity) {
      if (count > maxCompleted) {
        mostProductiveDay = day;
        maxCompleted = count;
      }
    }

    // Generate insights
    const insights: string[] = [];

    if (todosCompleted > todosCreated) {
      insights.push(
        'Great job! You completed more tasks than you created this week.'
      );
    }

    if (projectsWorkedOn > 3) {
      insights.push(
        `You worked across ${projectsWorkedOn} projects. Consider focusing on fewer projects for deeper progress.`
      );
    }

    if (mostProductiveDay) {
      insights.push(
        `Your most productive day was ${mostProductiveDay} with ${maxCompleted} tasks completed.`
      );
    }

    const completionRate =
      todosCreated > 0 ? (todosCompleted / todosCreated) * 100 : 0;
    if (completionRate > 80) {
      insights.push(
        `Excellent ${Math.round(completionRate)}% completion rate!`
      );
    } else if (completionRate < 50) {
      insights.push(
        'Consider breaking down tasks into smaller, more manageable pieces.'
      );
    }

    return {
      week: {
        start: weekStart,
        end: now,
      },
      stats: {
        todosCreated,
        todosCompleted,
        projectsWorkedOn,
        mostProductiveDay,
      },
      insights,
    };
  });

// Internal query for weekly activity
export const getUserWeeklyActivity = privateQuery
  .input(
    z.object({
      userId: z.string(),
      weekStart: z.number(),
    })
  )
  .output(
    z.object({
      created: z.array(z.any()),
      completed: z.array(z.any()),
      all: z.array(z.any()),
    })
  )
  .query(async ({ ctx, input }) => {
    const allTodos = await ctx.orm.query.todos.findMany({
      where: { userId: input.userId },
      limit: 1000,
    });

    const created = allTodos.filter(
      (t) => t.createdAt.getTime() >= input.weekStart
    );

    const completed = allTodos
      .filter((t) => t.completed && t.createdAt.getTime() >= input.weekStart)
      .map((t) => ({
        ...t,
        completedAt: t.createdAt.getTime(),
      }));

    return {
      created,
      completed,
      all: allTodos,
    };
  });

// =============================================================================
// Internal mutations for HTTP actions (userId passed as trusted parameter)
// =============================================================================

/** Create - called by HTTP actions after auth is verified */
export const create = privateMutation
  .input(
    z.object({
      userId: z.string(),
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
    })
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const [{ id: todoId }] = await ctx.orm
      .insert(todosTable)
      .values({
        title: input.title,
        description: input.description,
        completed: false,
        priority: input.priority,
        userId: input.userId,
      })
      .returning({ id: todosTable.id });
    return todoId;
  });

/** Update - called by HTTP actions after auth is verified */
export const update = privateMutation
  .input(
    z.object({
      userId: z.string(),
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      completed: z.boolean().optional(),
      description: z.string().max(1000).optional(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: input.userId },
    });

    await ctx.orm
      .update(todosTable)
      .set({
        title: input.title,
        completed: input.completed,
        description: input.description,
      })
      .where(eq(todosTable.id, input.id));
  });

/** Delete - called by HTTP actions after auth is verified */
export const deleteTodo = privateMutation
  .input(
    z.object({
      userId: z.string(),
      id: z.string(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: input.userId },
    });

    await ctx.orm
      .update(todosTable)
      .set({ deletionTime: new Date() })
      .where(eq(todosTable.id, input.id));
  });
