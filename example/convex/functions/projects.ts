import { and, eq, unsetToken } from 'kitcn/orm';
import { CRPCError } from 'kitcn/server';
import * as z from 'zod';
import { authMutation, authQuery, optionalAuthQuery } from '../lib/crpc';
import type { Insert, Select } from '../shared/api';
import {
  grantProjectAccess,
  hasAnyProject,
  listAccessibleProjects,
  listProjectsForDropdown,
  revokeProjectAccess,
  syncProjectArchived,
} from './_helpers/project_access';
import { projectMembersTable, projectsTable } from './schema';

// Schema for project list items
const ProjectListItemSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  name: z.string(),
  description: z.string().nullish(),
  ownerId: z.string(),
  isPublic: z.boolean(),
  archived: z.boolean(),
  memberCount: z.number(),
  todoCount: z.number(),
  completedTodoCount: z.number(),
  isOwner: z.boolean(),
});

type ProjectRow = Select<'projects'>;

// List projects - shows user's projects when authenticated, public projects when not
export const list = optionalAuthQuery
  .input(
    z.object({
      includeArchived: z.boolean().optional(),
    })
  )
  .paginated({ limit: 20, item: ProjectListItemSchema })
  .query(async ({ ctx, input }) => {
    const getProjectStats = async (projectIds: string[]) => {
      if (!projectIds.length) {
        return new Map<
          string,
          {
            memberCount: number;
            todoCount: number;
            completedTodoCount: number;
          }
        >();
      }

      const [memberCounts, todoCountsByCompletion] = await Promise.all([
        ctx.orm.query.projectMembers.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projectIds },
          },
          _count: true,
        }),
        ctx.orm.query.todos.groupBy({
          by: ['projectId', 'completed'],
          where: {
            projectId: { in: projectIds },
            completed: { in: [true, false] },
          },
          _count: true,
        }),
      ]);

      const statsByProject = new Map<
        string,
        {
          memberCount: number;
          todoCount: number;
          completedTodoCount: number;
        }
      >();

      for (const projectId of projectIds) {
        statsByProject.set(projectId, {
          memberCount: 0,
          todoCount: 0,
          completedTodoCount: 0,
        });
      }

      for (const memberCount of memberCounts) {
        const entry = statsByProject.get(memberCount.projectId);
        if (!entry) continue;
        entry.memberCount = memberCount._count;
      }

      for (const todoCount of todoCountsByCompletion) {
        if (!todoCount.projectId) continue;
        const entry = statsByProject.get(todoCount.projectId);
        if (!entry) continue;
        entry.todoCount += todoCount._count;
        if (todoCount.completed) {
          entry.completedTodoCount = todoCount._count;
        }
      }

      return statsByProject;
    };

    const withProjectStats = ({
      projects,
      statsByProject,
      currentUserId,
    }: {
      projects: ProjectRow[];
      statsByProject: Map<
        string,
        {
          memberCount: number;
          todoCount: number;
          completedTodoCount: number;
        }
      >;
      currentUserId: string | null;
    }) =>
      projects.map((project) => ({
        id: project.id,
        createdAt: project.createdAt,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        isPublic: project.isPublic,
        archived: project.archived,
        memberCount: statsByProject.get(project.id)?.memberCount ?? 0,
        todoCount: statsByProject.get(project.id)?.todoCount ?? 0,
        completedTodoCount:
          statsByProject.get(project.id)?.completedTodoCount ?? 0,
        isOwner: currentUserId === project.ownerId,
      }));

    const userId = ctx.userId;

    // If not authenticated, show only public non-archived projects
    if (!userId) {
      const results = await ctx.orm.query.projects.findMany({
        where: { isPublic: true, archived: false },
        orderBy: { createdAt: 'desc' },
        cursor: input.cursor,
        limit: input.limit,
      });

      const projectIds = results.page.map((p) => p.id);
      const statsByProject = await getProjectStats(projectIds);

      return {
        ...results,
        page: withProjectStats({
          projects: results.page,
          statsByProject,
          currentUserId: null,
        }),
      };
    }

    // One index walk over the viewer's own access rows. The previous read model
    // scanned `projects` and post-filtered owner-or-member in JS, so it cost
    // O(table) per page and every scanned row joined this subscription.
    const results = await listAccessibleProjects(ctx, {
      userId,
      archived: input.includeArchived === true,
      cursor: input.cursor,
      limit: input.limit,
    });

    const projectIds = results.page.map((p) => p.id);
    const statsByProject = await getProjectStats(projectIds);

    return {
      ...results,
      page: withProjectStats({
        projects: results.page,
        statsByProject,
        currentUserId: userId,
      }),
    };
  });

// Get project with members and todo count - public projects viewable by all
export const get = optionalAuthQuery
  .input(z.object({ projectId: z.string() }))
  .output(
    z
      .object({
        id: z.string(),
        createdAt: z.date(),
        name: z.string(),
        description: z.string().nullish(),
        ownerId: z.string(),
        isPublic: z.boolean(),
        archived: z.boolean(),
        owner: z.object({
          id: z.string(),
          name: z.string().nullable(),
          email: z.string(),
        }),
        members: z.array(
          z.object({
            id: z.string(),
            name: z.string().nullable(),
            email: z.string(),
            joinedAt: z.date(),
          })
        ),
        todoCount: z.number(),
        completedTodoCount: z.number(),
      })
      .nullable()
  )
  .query(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirst({
      where: { id: input.projectId },
      with: {
        owner: true,
        _count: {
          todos: true,
        },
      },
    });
    if (!project) {
      return null;
    }

    const isOwner = ctx.userId === project.ownerId;

    if (!(project.isPublic || isOwner)) {
      if (!ctx.userId) {
        throw new CRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this project',
        });
      }

      await ctx.orm.query.projectMembers
        .findFirstOrThrow({
          where: { projectId: input.projectId, userId: ctx.userId },
        })
        .catch(() => {
          throw new CRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        });
    }

    const owner = project.owner;
    if (!owner) {
      throw new CRPCError({
        code: 'NOT_FOUND',
        message: 'Project owner not found',
      });
    }

    const [memberRows, projectWithCompletedCount] = await Promise.all([
      ctx.orm.query.projectMembers.findMany({
        where: { projectId: project.id },
        limit: 1000,
        with: { user: true },
      }),
      ctx.orm.query.projects.findFirst({
        where: { id: project.id },
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
    const members = memberRows
      .map((member) => {
        const user = member.user;
        if (!user) return null;

        return {
          id: user.id,
          name: user.name ?? null,
          email: user.email,
          joinedAt: member.createdAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

    const todoCount = project._count?.todos ?? 0;
    const completedTodoCount = projectWithCompletedCount?._count?.todos ?? 0;

    return {
      ...project,
      owner: {
        id: owner.id,
        name: owner.name ?? null,
        email: owner.email,
      },
      members,
      todoCount,
      completedTodoCount,
    };
  });

// Create project with owner assignment
export const create = authMutation
  .input(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      isPublic: z.boolean().optional(),
    })
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const values: Insert<'projects'> = {
      name: input.name,
      description: input.description,
      ownerId: ctx.userId,
      isPublic: input.isPublic ?? false,
      archived: false,
    };

    const [project] = await ctx.orm
      .insert(projectsTable)
      .values(values)
      .returning();

    await grantProjectAccess(ctx, { project, userId: ctx.userId });

    return project.id;
  });

// Update project
export const update = authMutation
  .input(
    z.object({
      projectId: z.string(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      isPublic: z.boolean().optional(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can update the project',
      });
    }

    await ctx.orm
      .update(projectsTable)
      .set({
        name: input.name,
        description:
          input.description === null ? unsetToken : input.description,
        isPublic: input.isPublic,
      })
      .where(eq(projectsTable.id, input.projectId));
  });

export const archive = authMutation
  .input(z.object({ projectId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can archive the project',
      });
    }

    await ctx.orm
      .update(projectsTable)
      .set({ archived: true })
      .where(eq(projectsTable.id, input.projectId));

    await syncProjectArchived(ctx, {
      projectId: input.projectId,
      archived: true,
    });
  });

export const restore = authMutation
  .input(z.object({ projectId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can restore the project',
      });
    }

    await ctx.orm
      .update(projectsTable)
      .set({ archived: false })
      .where(eq(projectsTable.id, input.projectId));

    await syncProjectArchived(ctx, {
      projectId: input.projectId,
      archived: false,
    });
  });

export const addMember = authMutation
  .input(
    z.object({
      projectId: z.string(),
      userEmail: z.email(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can add members',
      });
    }

    const userToAdd = await ctx.orm.query.user.findFirstOrThrow({
      where: { email: input.userEmail },
    });

    if (userToAdd.id === project.ownerId) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'User is already the owner of this project',
      });
    }

    const existing = await ctx.orm.query.projectMembers.findFirst({
      where: { projectId: input.projectId, userId: userToAdd.id },
    });
    if (existing) {
      throw new CRPCError({
        code: 'CONFLICT',
        message: 'User is already a member of this project',
      });
    }

    await ctx.orm.insert(projectMembersTable).values({
      projectId: input.projectId,
      userId: userToAdd.id,
    });

    await grantProjectAccess(ctx, { project, userId: userToAdd.id });
  });

export const removeMember = authMutation
  .input(
    z.object({
      projectId: z.string(),
      userId: z.string(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can remove members',
      });
    }

    const member = await ctx.orm.query.projectMembers.findFirstOrThrow({
      where: { projectId: input.projectId, userId: input.userId },
    });

    await ctx.orm
      .delete(projectMembersTable)
      .where(eq(projectMembersTable.id, member.id));

    await revokeProjectAccess(ctx, {
      projectId: input.projectId,
      userId: input.userId,
    });
  });

export const leave = authMutation
  .input(z.object({ projectId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const member = await ctx.orm.query.projectMembers.findFirstOrThrow({
      where: { projectId: input.projectId, userId: ctx.userId },
    });

    await ctx.orm
      .delete(projectMembersTable)
      .where(eq(projectMembersTable.id, member.id));

    await revokeProjectAccess(ctx, {
      projectId: input.projectId,
      userId: ctx.userId,
    });
  });

export const transfer = authMutation
  .input(
    z.object({
      projectId: z.string(),
      newOwnerId: z.string(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const project = await ctx.orm.query.projects.findFirstOrThrow({
      where: { id: input.projectId },
    });

    if (project.ownerId !== ctx.userId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can transfer ownership',
      });
    }

    await ctx.orm.query.user.findFirstOrThrow({
      where: { id: input.newOwnerId },
    });

    // No need to check existence first: delete with no match is a no-op.
    await ctx.orm
      .delete(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, input.projectId),
          eq(projectMembersTable.userId, input.newOwnerId)
        )!
      );

    const currentOwnerMembership = await ctx.orm.query.projectMembers.findFirst(
      {
        where: { projectId: input.projectId, userId: ctx.userId },
      }
    );
    if (!currentOwnerMembership) {
      await ctx.orm.insert(projectMembersTable).values({
        projectId: input.projectId,
        userId: ctx.userId,
      });
    }

    await ctx.orm
      .update(projectsTable)
      .set({ ownerId: input.newOwnerId })
      .where(eq(projectsTable.id, input.projectId));

    // Both users keep access; only the `isOwner` flag moves. `grantProjectAccess`
    // derives that flag from the project it is handed, so it has to see the
    // post-transfer owner. Writing each row from the final state keeps this
    // correct whatever order the steps above ran in, and re-granting an existing
    // row is an update, not a duplicate.
    const transferred = { ...project, ownerId: input.newOwnerId };
    await grantProjectAccess(ctx, {
      project: transferred,
      userId: input.newOwnerId,
    });
    await grantProjectAccess(ctx, {
      project: transferred,
      userId: ctx.userId,
    });
  });

export const listForDropdown = authQuery
  .output(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        isOwner: z.boolean(),
      })
    )
  )
  .query(({ ctx }) => {
    // 1000 owned + 1000 member, the capacity the two-query read had.
    return listProjectsForDropdown(ctx, { userId: ctx.userId, limit: 2000 });
  });

export const hasAny = authQuery.output(z.boolean()).query(({ ctx }) => {
  return hasAnyProject(ctx, ctx.userId);
});
