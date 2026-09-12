import { and, eq, type OrmWriter } from 'kitcn/orm';
import type { AuthCtx } from '../../lib/crpc';
import type { Insert, Select } from '../../shared/api';
import type schema from '../schema';
import { projectAccessTable } from '../schema';

type ProjectAccessCtx = Pick<AuthCtx, 'orm'>;
/**
 * Any context that can write through the ORM.
 *
 * Exported because the backfill migration has to bridge to it: the migration
 * runner types its `ctx.orm` off the resolved relations config rather than the
 * schema chain, so the two describe the same runtime object under different
 * type arguments.
 */
export type ProjectAccessWriteCtx = { orm: OrmWriter<typeof schema> };
type ProjectRow = Select<'projects'>;

/**
 * Canonical owner of "which projects can this user see".
 *
 * Ownership lives on `projects.ownerId`, membership on `projectMembers`, and no
 * index spans both. Answering the union by scanning `projects` and
 * post-filtering in JS costs O(table) reads per page and puts every scanned row
 * into the subscription's read set. Instead, every grant and revoke writes a
 * `projectAccess` row here, and every read walks the
 * `userId_archived_projectCreatedAt` index.
 *
 * Writes go through this module rather than through schema triggers on
 * `projects`/`projectMembers`: async cascade continuation batches build their
 * ORM from the raw `ctx.db` and drop triggers past the first batch, so a
 * trigger-maintained copy would silently drift. Deletion is the one case that
 * needs neither -- `projectAccess` cascades from both `projects` and `user`, and
 * foreign-key cascades do still run in those batches.
 */

/**
 * The project's creation time as the number `projectAccess` sorts on.
 *
 * `Select<'projects'>.createdAt` is a `Date` hydrated from `_creationTime`, and
 * `_creationTime` carries a sub-millisecond fraction that a `Date` cannot hold,
 * so this key is millisecond-resolution. Two projects created in the same
 * millisecond share a key and fall back to the access row's own creation order.
 * That is one stable total order across pages; it only decides which of two
 * same-millisecond projects sorts first.
 */
const sortKeyFor = (project: Pick<ProjectRow, 'createdAt'>): number =>
  project.createdAt.getTime();

/**
 * Grant `userId` access to `project`, or refresh the row if it already exists.
 *
 * `isOwner` is derived from `project.ownerId` rather than passed in, so a caller
 * cannot mislabel a row -- granting membership to the owner keeps them the owner
 * instead of silently demoting them. Callers that grant during an ownership
 * change must therefore pass the project as it will be after the change.
 */
export const grantProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  input: {
    project: Pick<ProjectRow, 'id' | 'createdAt' | 'archived' | 'ownerId'>;
    userId: string;
  }
): Promise<void> => {
  const values: Insert<'projectAccess'> = {
    userId: input.userId,
    projectId: input.project.id,
    projectCreatedAt: sortKeyFor(input.project),
    archived: input.project.archived,
    isOwner: input.project.ownerId === input.userId,
  };

  const existing = await ctx.orm.query.projectAccess.findFirst({
    where: { userId: input.userId, projectId: input.project.id },
    columns: { id: true },
  });

  if (existing) {
    await ctx.orm
      .update(projectAccessTable)
      .set(values)
      .where(eq(projectAccessTable.id, existing.id));
    return;
  }

  await ctx.orm.insert(projectAccessTable).values(values);
};

/**
 * Drop `userId`'s access row for `projectId` unless they are still entitled.
 *
 * Re-derives entitlement from `projects.ownerId` and `projectMembers` instead of
 * deleting unconditionally, so it stays correct whatever order a caller runs its
 * steps in, and so a user who is both owner and member does not lose the project
 * when only one of those two is taken away. A no-op when there is no row.
 */
export const revokeProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  input: { projectId: string; userId: string }
): Promise<void> => {
  const project = await ctx.orm.query.projects.findFirst({
    where: { id: input.projectId },
  });

  if (project) {
    if (project.ownerId === input.userId) {
      await grantProjectAccess(ctx, { project, userId: input.userId });
      return;
    }

    const membership = await ctx.orm.query.projectMembers.findFirst({
      where: { projectId: input.projectId, userId: input.userId },
      columns: { id: true },
    });
    if (membership) {
      await grantProjectAccess(ctx, { project, userId: input.userId });
      return;
    }
  }

  await ctx.orm
    .delete(projectAccessTable)
    .where(
      and(
        eq(projectAccessTable.projectId, input.projectId),
        eq(projectAccessTable.userId, input.userId)
      )!
    );
};

/**
 * Mirror `projects.archived` onto every access row for the project.
 *
 * One update per project, so its cost is the project's member count. Nothing
 * caps that: `projects.addMember` rejects only the owner, a duplicate, and a
 * non-owner caller. The real ceiling is the ORM's own `mutationMaxRows`
 * (10,000 by default), above which this update throws rather than silently
 * mirroring a prefix -- so archiving a project with more than that many members
 * fails loudly and needs either a member cap or a batched sync.
 */
export const syncProjectArchived = async (
  ctx: ProjectAccessWriteCtx,
  input: { projectId: string; archived: boolean }
): Promise<void> => {
  await ctx.orm
    .update(projectAccessTable)
    .set({ archived: input.archived })
    .where(eq(projectAccessTable.projectId, input.projectId));
};

/**
 * Does this user have at least one non-archived project?
 *
 * The app-shell nav asks this on every route, so it must stay a single indexed
 * read that cannot grow with the table.
 */
export const hasAnyProject = async (
  ctx: ProjectAccessCtx,
  userId: string
): Promise<boolean> => {
  const access = await ctx.orm.query.projectAccess.findFirst({
    where: { userId, archived: false },
    columns: { id: true },
  });

  return access !== null;
};

/** Every project the user can see, newest first, one index walk. */
export const listAccessibleProjects = async (
  ctx: ProjectAccessCtx,
  input: {
    userId: string;
    archived: boolean;
    cursor: string | null;
    limit: number;
  }
) => {
  const access = await ctx.orm.query.projectAccess.findMany({
    where: { userId: input.userId, archived: input.archived },
    orderBy: { projectCreatedAt: 'desc' },
    cursor: input.cursor,
    limit: input.limit,
    with: { project: true },
  });

  const page = access.page
    .map((row) => row.project)
    .filter((project): project is ProjectRow => project !== null);

  return {
    continueCursor: access.continueCursor,
    isDone: access.isDone,
    page,
  };
};

/**
 * Non-archived projects the user can see, for the todo-form dropdown.
 *
 * `limit` bounds the union, where the read this replaced bounded each side
 * separately -- up to 1,000 owned plus up to 1,000 member projects. Callers pass
 * the combined figure so a user who is under both old bounds but over their sum
 * does not lose projects from an unpaginated dropdown.
 */
export const listProjectsForDropdown = async (
  ctx: ProjectAccessCtx,
  input: { userId: string; limit: number }
): Promise<{ id: string; isOwner: boolean; name: string }[]> => {
  const access = await ctx.orm.query.projectAccess.findMany({
    where: { userId: input.userId, archived: false },
    orderBy: { projectCreatedAt: 'desc' },
    limit: input.limit,
    columns: { isOwner: true },
    with: { project: { columns: { id: true, name: true } } },
  });

  return access
    .map((row) =>
      row.project
        ? { id: row.project.id, isOwner: row.isOwner, name: row.project.name }
        : null
    )
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Drop every access row for a project, without re-deriving. */
export const clearProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  input: { projectId: string }
): Promise<void> => {
  await ctx.orm
    .delete(projectAccessTable)
    .where(eq(projectAccessTable.projectId, input.projectId));
};

/** Drop one user's access row for a project, without re-deriving. */
export const deleteProjectAccessRow = async (
  ctx: ProjectAccessWriteCtx,
  input: { projectId: string; userId: string }
): Promise<void> => {
  await ctx.orm
    .delete(projectAccessTable)
    .where(
      and(
        eq(projectAccessTable.projectId, input.projectId),
        eq(projectAccessTable.userId, input.userId)
      )!
    );
};

/**
 * Derive the owner's access row for one project.
 *
 * Half of the backfill. The other half is per membership, deliberately kept
 * separate: a project has no member-count cap, so a backfill that read a
 * project's memberships in one bounded call would silently omit everyone past
 * the bound. Walking `projects` and `projectMembers` as two independent
 * migrations lets the runner page each table itself, so neither is capped, and
 * it keeps a second `.paginate()` out of a `migrateOne` that already runs inside
 * the runner's own paginated read -- real Convex rejects that with
 * `MultiplePaginatedDatabaseQueries`, and convex-test does not model it.
 */
export const grantOwnerProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  project: Pick<ProjectRow, 'id' | 'createdAt' | 'archived' | 'ownerId'>
): Promise<void> => {
  await grantProjectAccess(ctx, { project, userId: project.ownerId });
};

/** Derive one membership's access row. False when the project is gone. */
export const grantMembershipProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  membership: { projectId: string; userId: string }
): Promise<boolean> => {
  const project = await ctx.orm.query.projects.findFirst({
    where: { id: membership.projectId },
  });
  if (!project) {
    return false;
  }

  await grantProjectAccess(ctx, { project, userId: membership.userId });
  return true;
};

/**
 * Rebuild every access row in the deployment, for tests.
 *
 * The deploy path is the pair of backfill migrations, which page both tables in
 * the runner's own batches. This walks them in one bounded call each and throws
 * rather than truncating, so a test can never quietly under-backfill and then
 * assert against the short result.
 */
export const backfillProjectAccess = async (
  ctx: ProjectAccessWriteCtx,
  options?: { limit?: number }
): Promise<number> => {
  const limit = options?.limit ?? 1000;

  // Read one past the bound so a deployment that holds exactly `limit` rows is
  // not mistaken for a truncated read.
  const projects = await ctx.orm.query.projects.findMany({ limit: limit + 1 });
  if (projects.length > limit) {
    throw new Error(
      `backfillProjectAccess: more than ${limit} projects. Raise limit, or use the backfill migrations.`
    );
  }

  let written = 0;
  for (const project of projects) {
    await grantOwnerProjectAccess(ctx, project);
    written += 1;
  }

  const memberships = await ctx.orm.query.projectMembers.findMany({
    limit: limit + 1,
    columns: { projectId: true, userId: true },
  });
  if (memberships.length > limit) {
    throw new Error(
      `backfillProjectAccess: more than ${limit} memberships. Raise limit, or use the backfill migrations.`
    );
  }

  for (const membership of memberships) {
    if (await grantMembershipProjectAccess(ctx, membership)) {
      written += 1;
    }
  }

  return written;
};
