import { eq, unsetToken } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import { authMutation, authQuery, optionalAuthQuery } from '../lib/crpc';
import type { QueryCtx } from './generated/server';
import { todosTable, todoTagsTable } from './schema';

// Schema for todo list items
const TodoListItemSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  completed: z.boolean(),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  dueDate: z.date().nullish(),
  projectId: z.string().nullish(),
  deletionTime: z.date().nullish(),
  tags: z.array(
    z.object({
      id: z.string(),
      createdAt: z.date(),
      name: z.string(),
      color: z.string(),
      createdBy: z.string(),
    })
  ),
  project: z
    .object({
      id: z.string(),
      createdAt: z.date(),
      name: z.string(),
      description: z.string().nullish(),
      isPublic: z.boolean(),
      archived: z.boolean(),
      ownerId: z.string(),
    })
    .nullable(),
});

function emptyPaginatedResult<T>(cursor: string | null): {
  page: T[];
  isDone: boolean;
  continueCursor: string;
} {
  return { page: [], isDone: true, continueCursor: cursor ?? '' };
}

async function validateTagIds(
  ctx: QueryCtx,
  userId: string,
  tagIds: string[]
): Promise<string[]> {
  const deduped = Array.from(new Set(tagIds));
  const tags = await ctx.orm.query.tags.findMany({
    where: { id: { in: deduped }, createdBy: userId },
    limit: deduped.length,
    columns: { id: true },
  });

  if (tags.length !== deduped.length) {
    throw new CRPCError({
      code: 'BAD_REQUEST',
      message: "Some tags are invalid or don't belong to you",
    });
  }

  return deduped;
}

async function assertProjectAccess(
  ctx: QueryCtx,
  projectId: string,
  userId: string
) {
  const project = await ctx.orm.query.projects.findFirstOrThrow({
    where: { id: projectId },
  });

  const isOwner = project.ownerId === userId;
  const isMember = !!(await ctx.orm.query.projectMembers.findFirst({
    where: { projectId, userId },
  }));

  if (!(isOwner || isMember)) {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: "You don't have access to this project",
    });
  }

  return project;
}

// List todos - shows user's todos when authenticated, public project todos when not
export const list = optionalAuthQuery
  .input(
    z.object({
      completed: z.boolean().optional(),
      projectId: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      showDeleted: z.boolean().optional(),
    })
  )
  .paginated({ limit: 20, item: TodoListItemSchema })
  .query(async ({ ctx, input }) => {
    if (input.projectId) {
      const project = await ctx.orm.query.projects.findFirstOrThrow({
        where: { id: input.projectId },
      });

      if (!project.isPublic) {
        if (!ctx.userId) {
          throw new CRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }

        await assertProjectAccess(ctx, input.projectId, ctx.userId);
      }

      const projectForOutput = project;

      const results = await ctx.orm.query.todos.findMany({
        where: {
          projectId: input.projectId,
          deletionTime: input.showDeleted
            ? { isNotNull: true }
            : { isNull: true },
          ...(input.completed !== undefined
            ? { completed: input.completed }
            : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
        cursor: input.cursor,
        limit: input.limit,
        with: { tags: true },
      });

      return {
        ...results,
        page: results.page.map((todo) => ({
          ...todo,
          project: projectForOutput,
        })),
      };
    }

    if (!ctx.userId) {
      return emptyPaginatedResult(input.cursor);
    }

    const results = await ctx.orm.query.todos.findMany({
      where: {
        userId: ctx.userId,
        deletionTime: input.showDeleted
          ? { isNotNull: true }
          : { isNull: true },
        ...(input.completed !== undefined
          ? { completed: input.completed }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
      cursor: input.cursor,
      limit: input.limit,
      with: { tags: true, project: true },
    });

    return results;
  });

// Search todos - works for public projects when not authenticated
export const search = optionalAuthQuery
  .input(
    z.object({
      query: z.string().min(1),
      completed: z.boolean().optional(),
      projectId: z.string().optional(),
      showDeleted: z.boolean().optional(),
    })
  )
  .paginated({ limit: 20, item: TodoListItemSchema })
  .query(async ({ ctx, input }) => {
    if (input.projectId) {
      const project = await ctx.orm.query.projects.findFirstOrThrow({
        where: { id: input.projectId },
      });

      if (!project.isPublic) {
        if (!ctx.userId) {
          throw new CRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }

        await assertProjectAccess(ctx, input.projectId, ctx.userId);
      }

      const projectForOutput = project;

      const results = await ctx.orm.query.todos.findMany({
        search: { index: 'search_title_description', query: input.query },
        where: {
          projectId: input.projectId,
          deletionTime: input.showDeleted
            ? { isNotNull: true }
            : { isNull: true },
          ...(input.completed !== undefined
            ? { completed: input.completed }
            : {}),
        },
        cursor: input.cursor,
        limit: input.limit,
        with: { tags: true },
      });

      return {
        ...results,
        page: results.page.map((todo) => ({
          ...todo,
          project: projectForOutput,
        })),
      };
    }

    if (!ctx.userId) {
      throw new CRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to search your todos',
      });
    }

    const results = await ctx.orm.query.todos.findMany({
      search: { index: 'search_title_description', query: input.query },
      where: {
        userId: ctx.userId,
        deletionTime: input.showDeleted
          ? { isNotNull: true }
          : { isNull: true },
        ...(input.completed !== undefined
          ? { completed: input.completed }
          : {}),
      },
      cursor: input.cursor,
      limit: input.limit,
      with: { tags: true, project: true },
    });

    return results;
  });

// Get a single todo with all relations
export const get = authQuery
  .input(z.object({ id: z.string() }))
  .output(
    z
      .object({
        id: z.string(),
        createdAt: z.date(),
        userId: z.string(),
        title: z.string(),
        description: z.string().nullish(),
        completed: z.boolean(),
        priority: z.enum(['low', 'medium', 'high']).nullish(),
        dueDate: z.date().nullish(),
        projectId: z.string().nullish(),
        deletionTime: z.date().nullish(),
        tags: z.array(
          z.object({
            id: z.string(),
            createdAt: z.date(),
            name: z.string(),
            color: z.string(),
            createdBy: z.string(),
          })
        ),
        project: z
          .object({
            id: z.string(),
            createdAt: z.date(),
            name: z.string(),
            description: z.string().nullish(),
            isPublic: z.boolean(),
            archived: z.boolean(),
            ownerId: z.string(),
          })
          .nullable(),
        user: z.object({
          id: z.string(),
          createdAt: z.date(),
          name: z.string().optional(),
          email: z.string(),
          image: z.string().nullish(),
        }),
      })
      .nullable()
  )
  .query(async ({ ctx, input }) => {
    const todo = await ctx.orm.query.todos.findFirst({
      where: { id: input.id, userId: ctx.userId },
      with: { tags: true, project: true, user: true },
    });
    if (!todo) return null;

    if (!todo.user) {
      // Shouldn't happen (todos.userId is NOT NULL), but keeps failures explicit.
      throw new CRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    return {
      ...todo,
      project: todo.project,
      user: {
        id: todo.user.id,
        createdAt: todo.user.createdAt,
        name: todo.user.name,
        email: todo.user.email,
        image: todo.user.image,
      },
    };
  });

// Create a new todo
export const create = authMutation
  .meta({ rateLimit: 'todo/create' })
  .input(
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      dueDate: z.date().optional(),
      projectId: z.string().optional(),
      tagIds: z.array(z.string()).max(10).optional(),
    })
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    // Validate project access if provided
    if (input.projectId) {
      await assertProjectAccess(ctx, input.projectId, ctx.userId);
    }

    // Validate tags if provided
    const tagIds = input.tagIds?.length
      ? await validateTagIds(ctx, ctx.userId, input.tagIds)
      : [];

    const [{ id: todoId }] = await ctx.orm
      .insert(todosTable)
      .values({
        title: input.title,
        description: input.description,
        completed: false,
        priority: input.priority,
        dueDate: input.dueDate,
        projectId: input.projectId,
        userId: ctx.userId,
      })
      .returning({ id: todosTable.id });

    for (const tagId of tagIds) {
      await ctx.orm.insert(todoTagsTable).values({ todoId, tagId });
    }

    return todoId;
  });

// Update a todo
export const update = authMutation
  .meta({ rateLimit: 'todo/update' })
  .input(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
      dueDate: z.date().nullable().optional(),
      projectId: z.string().nullable().optional(),
      tagIds: z.array(z.string()).max(10).optional(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: ctx.userId },
    });

    if (input.projectId) {
      await assertProjectAccess(ctx, input.projectId, ctx.userId);
    }

    if (input.tagIds !== undefined) {
      const newTagIds = input.tagIds.length
        ? await validateTagIds(ctx, ctx.userId, input.tagIds)
        : [];

      const current = await ctx.orm.query.todoTags.findMany({
        where: { todoId: input.id },
      });

      const currentTagIds = new Set(current.map((j) => j.tagId));
      const desiredTagIds = new Set(newTagIds);

      for (const join of current) {
        if (!desiredTagIds.has(join.tagId)) {
          await ctx.orm
            .delete(todoTagsTable)
            .where(eq(todoTagsTable.id, join.id));
        }
      }

      for (const tagId of desiredTagIds) {
        if (!currentTagIds.has(tagId)) {
          await ctx.orm
            .insert(todoTagsTable)
            .values({ todoId: input.id, tagId });
        }
      }
    }

    await ctx.orm
      .update(todosTable)
      .set({
        title: input.title,
        description: input.description,
        priority: input.priority === null ? unsetToken : input.priority,
        dueDate: input.dueDate === null ? unsetToken : input.dueDate,
        projectId: input.projectId === null ? unsetToken : input.projectId,
      })
      .where(eq(todosTable.id, input.id));
  });

// Toggle todo completion status
export const toggleComplete = authMutation
  .meta({ rateLimit: 'todo/update' })
  .input(z.object({ id: z.string() }))
  .output(z.boolean())
  .mutation(async ({ ctx, input }) => {
    const todo = await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: ctx.userId },
    });

    const newStatus = !todo.completed;
    await ctx.orm
      .update(todosTable)
      .set({ completed: newStatus })
      .where(eq(todosTable.id, input.id));

    return newStatus;
  });

// Soft delete a todo
export const deleteTodo = authMutation
  .meta({ rateLimit: 'todo/delete' })
  .input(z.object({ id: z.string() }))

  .mutation(async ({ ctx, input }) => {
    await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: ctx.userId },
    });

    await ctx.orm
      .update(todosTable)
      .set({ deletionTime: new Date() })
      .where(eq(todosTable.id, input.id));
  });

// Restore a soft-deleted todo
export const restore = authMutation
  .meta({ rateLimit: 'todo/update' })
  .input(z.object({ id: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const todo = await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.id, userId: ctx.userId },
    });

    if (!todo.deletionTime) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'Todo is not deleted',
      });
    }

    await ctx.orm
      .update(todosTable)
      .set({ deletionTime: unsetToken })
      .where(eq(todosTable.id, input.id));
  });

// Bulk delete todos
export const bulkDelete = authMutation
  .meta({ rateLimit: 'todo/delete' })
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(
    z.object({
      deleted: z.number(),
      errors: z.array(z.string()),
    })
  )
  .mutation(async ({ ctx, input }) => {
    let deleted = 0;
    const errors: string[] = [];

    for (const id of input.ids) {
      try {
        const todo = await ctx.orm.query.todos.findFirst({
          where: { id, userId: ctx.userId },
        });

        if (todo) {
          await ctx.orm
            .update(todosTable)
            .set({ deletionTime: new Date() })
            .where(eq(todosTable.id, id));
          deleted++;
        } else {
          errors.push(`Todo ${id} not found or unauthorized`);
        }
      } catch (_error) {
        errors.push(`Failed to delete todo ${id}`);
      }
    }

    return { deleted, errors };
  });
