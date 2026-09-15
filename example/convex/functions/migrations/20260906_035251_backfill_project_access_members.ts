import {
  deleteProjectAccessRow,
  grantMembershipProjectAccess,
  type ProjectAccessWriteCtx,
} from '../_helpers/project_access';
import { defineMigration } from '../generated/migrations.gen';

const writeCtx = (ctx: { orm: unknown }): ProjectAccessWriteCtx =>
  ctx as ProjectAccessWriteCtx;

/**
 * Populate the membership half of `projectAccess` for data that predates it.
 *
 * Companion to `20260906_022807_backfill_project_access`, which does owners.
 * This walks `projectMembers` rather than reading each project's members inside
 * the owner migration, because nothing caps a project's member count: a single
 * bounded read would silently omit everyone past the bound and leave those users
 * permanently unable to see a project they belong to.
 */
export const migration = defineMigration({
  id: '20260906_035251_backfill_project_access_members',
  description: 'backfill project access members',
  up: {
    table: 'projectMembers',
    migrateOne: async (ctx, doc) => {
      // Raw Convex document, as in the owner migration.
      const projectId = (doc as { projectId?: string }).projectId;
      const userId = (doc as { userId?: string }).userId;
      if (!(projectId && userId)) {
        return;
      }

      await grantMembershipProjectAccess(writeCtx(ctx), { projectId, userId });
    },
  },
  down: {
    table: 'projectMembers',
    migrateOne: async (ctx, doc) => {
      const projectId = (doc as { projectId?: string }).projectId;
      const userId = (doc as { userId?: string }).userId;
      if (!(projectId && userId)) {
        return;
      }

      // An owner can also hold a membership row -- `aggregateDemo` seeds exactly
      // that. The owner migration owns that user's access row, so rolling only
      // this migration back (`migrate down --steps 1`) must leave it alone
      // instead of deleting a row the still-applied owner migration created.
      const project = await ctx.orm.query.projects.findFirst({
        where: { id: projectId },
      });
      if (project?.ownerId === userId) {
        return;
      }

      await deleteProjectAccessRow(writeCtx(ctx), { projectId, userId });
    },
  },
});
