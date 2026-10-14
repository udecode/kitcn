import {
  deleteProjectAccessRow,
  grantOwnerProjectAccess,
  type ProjectAccessWriteCtx,
} from '../_helpers/project_access';
import { defineMigration } from '../generated/migrations.gen';

/**
 * The migration runner types `ctx.orm` off the resolved relations config, while
 * the helpers type theirs off the schema chain. Same runtime object, different
 * type argument, so bridge it once here instead of widening the helpers.
 */
const writeCtx = (ctx: { orm: unknown }): ProjectAccessWriteCtx =>
  ctx as ProjectAccessWriteCtx;

/**
 * Backfill owners while public reads still use projects and projectMembers.
 * The companion migration pages memberships separately, so large projects do
 * not truncate the member half. Complete both migrations on each deployment
 * before activating the projectAccess readers in PR #452.
 */
export const migration = defineMigration({
  id: '20260906_022807_backfill_project_access',
  description: 'backfill project access',
  up: {
    table: 'projects',
    migrateOne: async (ctx, doc) => {
      // The runner pages `ctx.db.query(table)`, so `doc` is the raw Convex
      // document: it carries `_id`, not the public `id`, and `_creationTime`,
      // not a hydrated `createdAt`. Read the row back through the ORM rather
      // than handing this shape to a helper that expects the public one.
      const projectId = (doc as { _id?: string })._id;
      if (!projectId) {
        return;
      }

      const project = await ctx.orm.query.projects.findFirst({
        where: { id: projectId },
      });
      if (!project) {
        return;
      }

      await grantOwnerProjectAccess(writeCtx(ctx), project);
    },
  },
  down: {
    table: 'projects',
    migrateOne: async (ctx, doc) => {
      const projectId = (doc as { _id?: string })._id;
      const ownerId = (doc as { ownerId?: string }).ownerId;
      if (!(projectId && ownerId)) {
        return;
      }

      await deleteProjectAccessRow(writeCtx(ctx), { projectId, userId: ownerId });
    },
  },
});
