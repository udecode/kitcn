import type { AuthCtx } from '../../lib/crpc';

type ProjectExistenceCtx = Pick<AuthCtx, 'orm'>;

export const hasAnyProject = async (
  ctx: ProjectExistenceCtx,
  userId: string
): Promise<boolean> => {
  const owned = await ctx.orm.query.projects.findFirst({
    where: { ownerId: userId, archived: false },
    columns: { id: true },
  });
  if (owned) {
    return true;
  }

  const membership = await ctx.orm.query.projectMembers.findFirst({
    where: {
      userId,
      project: { archived: false },
    },
    columns: { id: true },
  });

  return membership !== null;
};
