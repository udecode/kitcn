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
 * Populate the owner half of `projectAccess` for data that predates it.
 *
 * `projects.list`, `listForDropdown` and `hasAny` all read the derived table, so
 * on a deployment that already holds projects it starts empty and every one of
 * them returns nothing until this and its `_members` companion have run.
 *
 * Owners here, memberships in the companion migration. Splitting them lets the
 * runner page each source table itself, so neither is bounded by a fixed limit,
 * and it keeps a second `.paginate()` out of a `migrateOne` that already runs
 * inside the runner's own paginated read.
 *
 * `grantProjectAccess` updates an existing row rather than inserting a second
 * one, so re-running is safe.
 *
 * ROLLOUT: `kitcn deploy` pushes the backend first and only then runs migrations
 * (`packages/kitcn/src/cli/commands/deploy.ts` deploys, checks the exit code,
 * and calls `runMigrationFlow` afterwards). So on a deployment that already
 * holds projects there is a window where the new reads are live and this table
 * is still empty or half-filled, and `/projects` looks empty to users who do
 * have projects. It closes as soon as both backfills finish.
 *
 * That window is acceptable here because the example app is re-seedable and its
 * data set is small. An app where it is not should do a proper expand/backfill/
 * contract rollout instead: ship the writes, run the backfill to completion,
 * and only then switch the reads over.
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
