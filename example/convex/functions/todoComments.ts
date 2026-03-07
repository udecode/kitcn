import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import {
  authMutation,
  optionalAuthQuery,
  privateMutation,
  publicQuery,
} from '../lib/crpc';
import type { QueryCtx } from './generated/server';
import { todoCommentsTable } from './schema';

// Schema for comment list items
const CommentListItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.date(),
  user: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      image: z.string().nullish(),
    })
    .nullable(),
  replies: z.array(z.any()),
  replyCount: z.number(),
});
type Reply = z.infer<typeof CommentListItemSchema>;

type CommentRowWithReplies = {
  id: string;
  content: string;
  createdAt: Date;
  user: CommentUser | null;
  replies?: CommentRowWithReplies[];
};

const CommentUserSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  image: z.string().nullish(),
});
type CommentUser = z.infer<typeof CommentUserSchema>;

const CommentRowWithRepliesSchema: z.ZodType<CommentRowWithReplies> = z.lazy(
  () =>
    z.object({
      id: z.string(),
      createdAt: z.date(),
      content: z.string(),
      user: CommentUserSchema.nullable(),
      replies: z.array(CommentRowWithRepliesSchema).optional(),
    })
);

function buildRepliesWith(maxDepth: number):
  | {
      limit: number;
      orderBy: { createdAt: 'asc' };
      with: { user: true; replies?: ReturnType<typeof buildRepliesWith> };
    }
  | undefined {
  if (maxDepth <= 0) return;

  const childWith = buildRepliesWith(maxDepth - 1);
  return {
    limit: 10,
    orderBy: { createdAt: 'asc' },
    with: {
      user: true,
      ...(childWith ? { replies: childWith } : {}),
    },
  };
}

function collectCommentIds(rows: CommentRowWithReplies[]): string[] {
  const ids: string[] = [];
  const stack = [...rows];

  while (stack.length) {
    const row = stack.pop()!;
    ids.push(row.id);
    if (row.replies?.length) {
      stack.push(...row.replies);
    }
  }

  // Dedupe while preserving insertion order for predictable batching.
  return Array.from(new Set(ids));
}

function chunk<T>(arr: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new CRPCError({
      code: 'BAD_REQUEST',
      message: 'chunkSize must be > 0',
    });
  }
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getReplyCountsByParentId(
  ctx: QueryCtx,
  parentIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (const ids of chunk(parentIds, 250)) {
    const rows = await ctx.orm.query.todoComments.findMany({
      where: { id: { in: ids } },
      limit: ids.length,
      columns: { id: true },
      with: {
        _count: {
          replies: true,
        },
      },
    });
    for (const row of rows) {
      counts.set(row.id, row._count?.replies ?? 0);
    }
    for (const id of ids) {
      if (!counts.has(id)) {
        counts.set(id, 0);
      }
    }
  }

  return counts;
}

function toReply(
  row: CommentRowWithReplies,
  replyCounts: Map<string, number>
): Reply {
  const user = row.user ?? null;
  const replies = row.replies ?? [];

  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    user: user
      ? {
          id: user.id,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        }
      : null,
    replies: replies.map((r) => toReply(r, replyCounts)),
    replyCount: replyCounts.get(row.id) ?? 0,
  };
}

// ============================================
// COMMENT QUERIES
// ============================================

// Get comments for a todo with nested replies
export const getTodoComments = optionalAuthQuery
  .input(
    z.object({
      todoId: z.string(),
      includeReplies: z.boolean().default(true),
      maxReplyDepth: z.number().min(0).max(5).default(3),
    })
  )
  .paginated({ limit: 20, item: CommentListItemSchema })
  .query(async ({ ctx, input }) => {
    await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.todoId },
    });

    const maxDepth = Math.min(input.maxReplyDepth, 3);
    const results = await ctx.orm.query.todoComments.findMany({
      where: { todoId: input.todoId, parentId: { isNull: true } },
      orderBy: { createdAt: 'desc' },
      cursor: input.cursor,
      limit: input.limit,
      with: {
        user: true,
        ...(input.includeReplies && maxDepth > 0
          ? { replies: buildRepliesWith(maxDepth) }
          : {}),
      },
    });

    const rows = z.array(CommentRowWithRepliesSchema).parse(results.page);
    const replyCounts = await getReplyCountsByParentId(
      ctx,
      collectCommentIds(rows)
    );

    return {
      ...results,
      page: rows.map((comment) => toReply(comment, replyCounts)),
    };
  });

// Get single comment thread
export const getCommentThread = publicQuery
  .input(
    z.object({
      commentId: z.string(),
      maxDepth: z.number().min(0).max(10).default(10),
    })
  )
  .output(
    z
      .object({
        comment: z.object({
          id: z.string(),
          content: z.string(),
          createdAt: z.date(),
          todoId: z.string(),
          todo: z.object({
            title: z.string(),
            completed: z.boolean(),
          }),
          user: z
            .object({
              id: z.string(),
              name: z.string().optional(),
              image: z.string().nullish(),
            })
            .nullable(),
          parent: z
            .object({
              id: z.string(),
              content: z.string(),
              user: z
                .object({
                  name: z.string().optional(),
                })
                .nullable(),
            })
            .nullable(),
          replies: z.array(z.any()),
          ancestors: z.array(
            z.object({
              id: z.string(),
              content: z.string(),
              user: z
                .object({
                  name: z.string().optional(),
                })
                .nullable(),
            })
          ),
        }),
      })
      .nullable()
  )
  .query(async ({ ctx, input }) => {
    const maxDepth = Math.min(input.maxDepth, 3);
    const comment = await ctx.orm.query.todoComments.findFirst({
      where: { id: input.commentId },
      with: {
        user: true,
        todo: true,
        parent: { with: { user: true } },
        ...(maxDepth > 0 ? { replies: buildRepliesWith(maxDepth) } : {}),
      },
    });
    if (!comment) {
      return null;
    }

    const todo = comment.todo;
    if (!todo) {
      throw new CRPCError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    const commentRow = CommentRowWithRepliesSchema.parse(comment);
    const replyCounts = await getReplyCountsByParentId(
      ctx,
      collectCommentIds([commentRow])
    );
    const replies = commentRow.replies ?? [];

    const user = comment.user ?? null;
    const parent = comment.parent ?? null;
    const parentUser = parent?.user ?? null;

    // Get ancestors (for context)
    const ancestors: {
      id: string;
      content: string;
      user: { name?: string } | null;
    }[] = [];
    let currentParentId = comment.parentId;
    while (currentParentId && ancestors.length < 5) {
      const currentParent = await ctx.orm.query.todoComments.findFirst({
        where: { id: currentParentId },
        with: { user: true },
      });
      if (!currentParent) {
        break;
      }

      ancestors.unshift({
        id: currentParent.id,
        content: currentParent.content,
        user: currentParent.user?.name
          ? { name: currentParent.user.name }
          : null,
      });
      currentParentId = currentParent.parentId ?? null;
    }

    return {
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        todoId: comment.todoId,
        todo: {
          title: todo.title,
          completed: todo.completed,
        },
        user: user
          ? {
              id: user.id,
              name: user.name,
              image: user.image,
            }
          : null,
        parent: parent
          ? {
              id: parent.id,
              content: parent.content,
              user: parentUser?.name ? { name: parentUser.name } : null,
            }
          : null,
        replies: replies.map((r) => toReply(r, replyCounts)),
        ancestors,
      },
    };
  });

// Schema for user comments
const UserCommentSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.date(),
  isReply: z.boolean(),
  todo: z
    .object({
      id: z.string(),
      title: z.string(),
      completed: z.boolean(),
    })
    .nullable()
    .optional(),
  parentPreview: z
    .object({
      content: z.string(),
      userName: z.string().optional(),
    })
    .optional(),
});

// Get user's recent comments
export const getUserComments = optionalAuthQuery
  .input(
    z.object({
      userId: z.string(),
      includeTodo: z.boolean().default(true),
    })
  )
  .paginated({ limit: 20, item: UserCommentSchema })
  .query(async ({ ctx, input }) => {
    const results = await ctx.orm.query.todoComments.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' },
      cursor: input.cursor,
      limit: input.limit,
      with: {
        ...(input.includeTodo
          ? { todo: { columns: { id: true, title: true, completed: true } } }
          : {}),
        parent: {
          columns: { id: true, content: true },
          with: { user: { columns: { name: true } } },
        },
      },
    });

    return {
      ...results,
      page: results.page.map((comment) => {
        const result: z.infer<typeof UserCommentSchema> = {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          isReply: !!comment.parentId,
        };

        if (input.includeTodo && 'todo' in comment) {
          result.todo = comment.todo
            ? {
                id: comment.todo.id,
                title: comment.todo.title,
                completed: comment.todo.completed,
              }
            : null;
        }

        if (comment.parent) {
          result.parentPreview = {
            content:
              comment.parent.content.slice(0, 100) +
              (comment.parent.content.length > 100 ? '...' : ''),
            userName: comment.parent.user?.name,
          };
        }

        return result;
      }),
    };
  });

// ============================================
// COMMENT MUTATIONS
// ============================================

// Add comment to todo
export const addComment = authMutation
  .input(
    z.object({
      todoId: z.string(),
      content: z.string().min(1).max(1000),
      parentId: z.string().optional(),
    })
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const todo = await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: input.todoId },
    });

    async function checkTodoAccess(t: NonNullable<typeof todo>) {
      // Owner always has access
      if (t.userId === ctx.userId) {
        return true;
      }

      if (!t.projectId) {
        return false;
      }

      const project = await ctx.orm.query.projects.findFirst({
        where: { id: t.projectId },
      });
      if (!project) {
        return false;
      }

      if (project.isPublic) {
        return true;
      }

      const membership = await ctx.orm.query.projectMembers.findFirst({
        where: { projectId: project.id, userId: ctx.userId },
      });
      return !!membership || project.ownerId === ctx.userId;
    }

    // Check access (todo must be public, owned by user, or user is project member)
    const hasAccess = await checkTodoAccess(todo);
    if (!hasAccess) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'No access to this todo',
      });
    }

    // Validate parent if provided
    if (input.parentId) {
      const parent = await ctx.orm.query.todoComments
        .findFirstOrThrow({
          where: { id: input.parentId },
        })
        .catch(() => {
          throw new CRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid parent comment',
          });
        });
      if (parent.todoId !== input.todoId) {
        throw new CRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid parent comment',
        });
      }

      const depth = await getCommentDepth(ctx, input.parentId);
      if (depth >= 5) {
        throw new CRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum reply depth reached',
        });
      }
    }

    const [{ id }] = await ctx.orm
      .insert(todoCommentsTable)
      .values({
        content: input.content,
        todoId: input.todoId,
        userId: ctx.userId,
        parentId: input.parentId,
      })
      .returning({ id: todoCommentsTable.id });
    return id;
  });

// Update comment
export const updateComment = authMutation
  .input(
    z.object({
      commentId: z.string(),
      content: z.string().min(1).max(1000),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const comment = await ctx.orm.query.todoComments.findFirstOrThrow({
      where: { id: input.commentId },
    });

    // Only author can update
    if (comment.userId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only comment author can update',
      });
    }

    // Don't allow editing after 1 hour
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (comment.createdAt.getTime() < hourAgo) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot edit comments older than 1 hour',
      });
    }

    await ctx.orm
      .update(todoCommentsTable)
      .set({ content: input.content })
      .where(eq(todoCommentsTable.id, input.commentId));
  });

// Delete comment
export const deleteComment = authMutation
  .input(z.object({ commentId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const comment = await ctx.orm.query.todoComments.findFirstOrThrow({
      where: { id: input.commentId },
      with: {
        _count: {
          replies: true,
        },
      },
    });

    // Author or todo owner can delete
    const todo = await ctx.orm.query.todos.findFirstOrThrow({
      where: { id: comment.todoId },
    });
    if (comment.userId !== ctx.userId && todo.userId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }

    // If has replies, just mark as deleted
    const hasReplies = (comment._count?.replies ?? 0) > 0;
    if (hasReplies) {
      await ctx.orm
        .update(todoCommentsTable)
        .set({ content: '[deleted]' })
        .where(eq(todoCommentsTable.id, comment.id));
    } else {
      await ctx.orm
        .delete(todoCommentsTable)
        .where(eq(todoCommentsTable.id, comment.id));
    }
  });

// ============================================
// INTERNAL FUNCTIONS
// ============================================

// Clean up orphaned comments
export const cleanupOrphanedComments = privateMutation
  .input(z.object({ batchSize: z.number().default(100) }))
  .output(
    z.object({
      deleted: z.number(),
      hasMore: z.boolean(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Find comments where todo was deleted
    const comments = await ctx.orm.query.todoComments.findMany({
      limit: input.batchSize,
      with: { todo: { columns: { id: true } } },
    });

    let deleted = 0;
    for (const comment of comments) {
      if (!comment.todo) {
        await ctx.orm
          .delete(todoCommentsTable)
          .where(eq(todoCommentsTable.id, comment.id));
        deleted++;
      }
    }

    return {
      deleted,
      hasMore: comments.length === input.batchSize,
    };
  });

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get comment depth in thread
async function getCommentDepth(
  ctx: QueryCtx,
  commentId: string
): Promise<number> {
  let depth = 0;
  let current = await ctx.orm.query.todoComments.findFirst({
    where: { id: commentId },
  });

  while (current?.parentId && depth < 10) {
    depth++;
    current = await ctx.orm.query.todoComments.findFirst({
      where: { id: current.parentId },
    });
  }

  return depth;
}
