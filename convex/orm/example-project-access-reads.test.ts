import { eq } from 'kitcn/orm';
import { expect, test } from 'vitest';
import {
  backfillProjectAccess,
  clearProjectAccess,
  grantProjectAccess,
  hasAnyProject,
  listAccessibleProjects,
  listProjectsForDropdown,
  revokeProjectAccess,
  syncProjectArchived,
} from '../../example/convex/functions/_helpers/project_access';
import { migration as backfillOwnersMigration } from '../../example/convex/functions/migrations/20260906_022807_backfill_project_access';
import { migration as backfillMembersMigration } from '../../example/convex/functions/migrations/20260906_035251_backfill_project_access_members';
import schema, {
  projectAccessTable,
  projectMembersTable,
  projectsTable,
  userTable,
} from '../../example/convex/functions/schema';
import {
  convexTest,
  countDocumentReads,
  withExampleEnv,
  withOrm,
} from '../setup.testing';

/**
 * `countDocumentReads` swaps `db.query`/`db.get`, and the ORM binds both when it
 * is built, so the counter has to be installed *before* `withOrm`. Installed on
 * a context that already carries an ORM it counts only reads issued directly
 * through `ctx.db` -- a constant zero for an ORM-only test, which makes every
 * bound below pass vacuously. Snapshot after seeding so only the read under test
 * is counted.
 */
const withCountedOrmCtx = async (
  run: (
    ctx: {
      db: Parameters<typeof countDocumentReads>[0]['db'];
      orm: ReturnType<typeof withOrm<any, typeof schema>>['orm'];
    },
    reads: ReturnType<typeof countDocumentReads>
  ) => Promise<void>
): Promise<void> => {
  await withExampleEnv(async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const reads = countDocumentReads(baseCtx);
      const ctx = withOrm(baseCtx, schema);
      await run(ctx, reads);
    });
  });
};

type Ctx = Parameters<Parameters<typeof withCountedOrmCtx>[0]>[0];

type AccessRow = {
  archived: boolean;
  isOwner: boolean;
  projectCreatedAt: number;
  projectId: string;
  userId: string;
};

let emailSeq = 0;
const makeUser = async (ctx: Ctx, label: string): Promise<string> => {
  emailSeq += 1;
  const [user] = await ctx.orm
    .insert(userTable)
    .values({
      name: label,
      email: `${label}-${emailSeq}@access.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: userTable.id });
  return user.id;
};

/** Create a project exactly the way `projects.create` does. */
const makeProject = async (
  ctx: Ctx,
  input: { name: string; ownerId: string; archived?: boolean }
) => {
  const [project] = await ctx.orm
    .insert(projectsTable)
    .values({
      name: input.name,
      isPublic: false,
      archived: input.archived ?? false,
      ownerId: input.ownerId,
    })
    .returning();

  await grantProjectAccess(ctx, { project, userId: input.ownerId });

  return project;
};

/** Add a member exactly the way `projects.addMember` does. */
const addMember = async (
  ctx: Ctx,
  input: { project: Awaited<ReturnType<typeof makeProject>>; userId: string }
) => {
  await ctx.orm.insert(projectMembersTable).values({
    projectId: input.project.id,
    userId: input.userId,
  });
  await grantProjectAccess(ctx, {
    project: input.project,
    userId: input.userId,
  });
};

const NOISE = 40;

const seedNoise = async (ctx: Ctx, ownerId: string, count = NOISE) => {
  for (let index = 0; index < count; index += 1) {
    await makeProject(ctx, { name: `noise-${index}`, ownerId });
  }
};

/**
 * `projects.list` used to ask "owner OR member" of `projects`, which no index
 * spans, so it walked the table from the newest end and post-filtered in JS.
 * A viewer with nothing to see drained the whole table, and every scanned row
 * joined the subscription's read set.
 *
 * These bounds must not track table size.
 */
test('listing reads nothing proportional to projects owned by other users', async () => {
  await withCountedOrmCtx(async (ctx, reads) => {
    const other = await makeUser(ctx, 'other');
    const viewer = await makeUser(ctx, 'viewer');
    await seedNoise(ctx, other);

    const before = reads.scanned;

    const results = await listAccessibleProjects(ctx, {
      userId: viewer,
      archived: false,
      cursor: null,
      limit: 20,
    });

    expect(results.page).toEqual([]);
    expect(results.isDone).toBe(true);
    // The index range for this viewer is empty. The scan read NOISE rows here.
    expect(reads.scanned - before).toBeLessThanOrEqual(2);
  });
});

test('listing cost tracks the page, not the table', async () => {
  const measure = async (noise: number) => {
    let scanned = 0;
    let names: string[] = [];

    await withCountedOrmCtx(async (ctx, reads) => {
      const other = await makeUser(ctx, 'other');
      const viewer = await makeUser(ctx, 'viewer');
      await seedNoise(ctx, other, noise);

      await makeProject(ctx, { name: 'owned-a', ownerId: viewer });
      const shared = await makeProject(ctx, {
        name: 'shared-a',
        ownerId: other,
      });
      await addMember(ctx, { project: shared, userId: viewer });

      const before = reads.scanned;
      const results = await listAccessibleProjects(ctx, {
        userId: viewer,
        archived: false,
        cursor: null,
        limit: 20,
      });
      scanned = reads.scanned - before;
      names = results.page.map((project) => project.name);
    });

    return { names, scanned };
  };

  const small = await measure(10);
  const large = await measure(400);

  // Same visible projects, and the same cost, at 40x the table size.
  expect(small.names.sort()).toEqual(['owned-a', 'shared-a']);
  expect(large.names.sort()).toEqual(['owned-a', 'shared-a']);
  // Exactly one access row plus its project, per visible project. Asserted as
  // an equality rather than a ceiling so that a counter which silently reports
  // zero -- the failure mode when it is installed after the ORM is built --
  // fails here instead of passing vacuously.
  expect(small.scanned).toBe(2 * small.names.length);
  expect(large.scanned).toBe(small.scanned);
});

/**
 * The read model this replaces post-filtered on `project.id`, but `.filter()`
 * receives the raw Convex row, whose id field is `_id`. `memberProjectIds.has(
 * project.id)` was therefore `has(undefined)` and always false, so a project you
 * could only see through a membership never appeared in the list at all.
 */
test('a project the viewer can only see through a membership is listed', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const other = await makeUser(ctx, 'other');
    const viewer = await makeUser(ctx, 'viewer');
    await seedNoise(ctx, other, 5);

    const shared = await makeProject(ctx, { name: 'shared', ownerId: other });
    await addMember(ctx, { project: shared, userId: viewer });

    const results = await listAccessibleProjects(ctx, {
      userId: viewer,
      archived: false,
      cursor: null,
      limit: 20,
    });

    expect(results.page.map((project) => project.name)).toEqual(['shared']);
  });
});

test('paging walks every visible project once, newest first', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const other = await makeUser(ctx, 'other');
    const viewer = await makeUser(ctx, 'viewer');

    // Interleave owned and member-only projects so a page boundary has to hold
    // across both kinds.
    const expected: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const owned = index % 2 === 0;
      const name = `p-${String(index).padStart(2, '0')}`;
      if (owned) {
        await makeProject(ctx, { name, ownerId: viewer });
      } else {
        const project = await makeProject(ctx, { name, ownerId: other });
        await addMember(ctx, { project, userId: viewer });
      }
      expected.push(name);
      await makeProject(ctx, { name: `noise-${index}`, ownerId: other });
    }
    expected.reverse();

    const seen: string[] = [];
    let cursor: string | null = null;
    let isDone = false;
    let pages = 0;

    while (!isDone) {
      const results = await listAccessibleProjects(ctx, {
        userId: viewer,
        archived: false,
        cursor,
        limit: 4,
      });
      seen.push(...results.page.map((project) => project.name));
      cursor = results.continueCursor;
      isDone = results.isDone;
      pages += 1;
      expect(pages).toBeLessThan(10);
    }

    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

test('archiving moves a project between the two lists', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const viewer = await makeUser(ctx, 'viewer');
    const other = await makeUser(ctx, 'other');

    const project = await makeProject(ctx, { name: 'p', ownerId: viewer });
    const shared = await makeProject(ctx, { name: 'shared', ownerId: other });
    await addMember(ctx, { project: shared, userId: viewer });

    const active = () =>
      listAccessibleProjects(ctx, {
        userId: viewer,
        archived: false,
        cursor: null,
        limit: 20,
      });
    const archived = () =>
      listAccessibleProjects(ctx, {
        userId: viewer,
        archived: true,
        cursor: null,
        limit: 20,
      });

    expect((await active()).page.map((p) => p.name).sort()).toEqual([
      'p',
      'shared',
    ]);
    expect((await archived()).page).toEqual([]);

    await ctx.orm
      .update(projectsTable)
      .set({ archived: true })
      .where(eq(projectsTable.id, project.id));
    await syncProjectArchived(ctx, { projectId: project.id, archived: true });

    expect((await active()).page.map((p) => p.name)).toEqual(['shared']);
    expect((await archived()).page.map((p) => p.name)).toEqual(['p']);
  });
});

/**
 * Archiving a shared project has to move it for the members too, not just the
 * owner -- the mirrored flag is part of the index range every viewer walks.
 */
test('archiving a shared project moves it for members as well', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const project = await makeProject(ctx, { name: 'shared', ownerId: owner });
    await addMember(ctx, { project, userId: member });

    await ctx.orm
      .update(projectsTable)
      .set({ archived: true })
      .where(eq(projectsTable.id, project.id));
    await syncProjectArchived(ctx, { projectId: project.id, archived: true });

    for (const userId of [owner, member]) {
      const active = await listAccessibleProjects(ctx, {
        userId,
        archived: false,
        cursor: null,
        limit: 20,
      });
      const archived = await listAccessibleProjects(ctx, {
        userId,
        archived: true,
        cursor: null,
        limit: 20,
      });
      expect(active.page).toEqual([]);
      expect(archived.page.map((p) => p.name)).toEqual(['shared']);
    }
  });
});

test('revoking access hides the project from that user only', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const project = await makeProject(ctx, { name: 'shared', ownerId: owner });
    await addMember(ctx, { project, userId: member });

    // Exactly what `projects.removeMember` does: drop the membership, then
    // revoke. Revoke re-derives entitlement, so the order matters.
    const membership = await ctx.orm.query.projectMembers.findFirst({
      where: { projectId: project.id, userId: member },
    });
    await ctx.orm
      .delete(projectMembersTable)
      .where(eq(projectMembersTable.id, membership.id));
    await revokeProjectAccess(ctx, { projectId: project.id, userId: member });

    const forMember = await listAccessibleProjects(ctx, {
      userId: member,
      archived: false,
      cursor: null,
      limit: 20,
    });
    const forOwner = await listAccessibleProjects(ctx, {
      userId: owner,
      archived: false,
      cursor: null,
      limit: 20,
    });

    expect(forMember.page).toEqual([]);
    expect(forOwner.page.map((p) => p.name)).toEqual(['shared']);
  });
});

/**
 * Revoke re-derives entitlement rather than deleting blindly, so a caller that
 * revokes while the user is still the owner -- or still holds a membership --
 * cannot strip a project the user can legitimately see.
 */
test('revoking does not strip access the user is still entitled to', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const project = await makeProject(ctx, { name: 'shared', ownerId: owner });
    await addMember(ctx, { project, userId: member });

    // The membership row is still there, and the owner still owns it.
    await revokeProjectAccess(ctx, { projectId: project.id, userId: member });
    await revokeProjectAccess(ctx, { projectId: project.id, userId: owner });

    for (const userId of [owner, member]) {
      const results = await listAccessibleProjects(ctx, {
        userId,
        archived: false,
        cursor: null,
        limit: 20,
      });
      expect(results.page.map((p) => p.name)).toEqual(['shared']);
    }

    const rows = await ctx.orm.query.projectAccess.findMany({
      where: { projectId: project.id },
      limit: 100,
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row: AccessRow) => row.userId === owner)?.isOwner).toBe(
      true
    );
    expect(rows.find((row: AccessRow) => row.userId === member)?.isOwner).toBe(
      false
    );
  });
});

/**
 * `projects.transfer` moves ownership while keeping both users on the project.
 * Re-granting an existing row must update it, never duplicate it.
 */
test('transferring ownership keeps one access row per user', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const oldOwner = await makeUser(ctx, 'old');
    const newOwner = await makeUser(ctx, 'new');

    const project = await makeProject(ctx, { name: 'p', ownerId: oldOwner });
    await addMember(ctx, { project, userId: newOwner });

    // `projects.transfer` hands the post-transfer project to both grants.
    const transferred = { ...project, ownerId: newOwner };
    await grantProjectAccess(ctx, { project: transferred, userId: newOwner });
    await grantProjectAccess(ctx, { project: transferred, userId: oldOwner });

    const rows = await ctx.orm.query.projectAccess.findMany({
      where: { projectId: project.id },
      limit: 100,
    });

    expect(rows).toHaveLength(2);
    expect(
      rows.find((row: AccessRow) => row.userId === newOwner)?.isOwner
    ).toBe(true);
    expect(
      rows.find((row: AccessRow) => row.userId === oldOwner)?.isOwner
    ).toBe(false);

    for (const userId of [oldOwner, newOwner]) {
      const results = await listAccessibleProjects(ctx, {
        userId,
        archived: false,
        cursor: null,
        limit: 20,
      });
      expect(results.page.map((p) => p.name)).toEqual(['p']);
    }
  });
});

/**
 * Access rows are removed by foreign-key cascade, not by a trigger. That matters
 * because async cascade continuation batches build their ORM from the raw
 * `ctx.db` and drop triggers past the first batch, while cascades still run.
 */
test('deleting a project cascades its access rows away', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const project = await makeProject(ctx, { name: 'doomed', ownerId: owner });
    await addMember(ctx, { project, userId: member });

    expect(
      await ctx.orm.query.projectAccess.findMany({
        where: { projectId: project.id },
        limit: 100,
      })
    ).toHaveLength(2);

    await ctx.orm.delete(projectsTable).where(eq(projectsTable.id, project.id));

    expect(
      await ctx.orm.query.projectAccess.findMany({
        where: { projectId: project.id },
        limit: 100,
      })
    ).toEqual([]);

    for (const userId of [owner, member]) {
      const results = await listAccessibleProjects(ctx, {
        userId,
        archived: false,
        cursor: null,
        limit: 20,
      });
      expect(results.page).toEqual([]);
    }
  });
});

/**
 * The app-shell nav asks this on every route, so it must stay a single indexed
 * read. Before `projectAccess`, the owner leg tied `index('archived')` and
 * `index('ownerId')` at the same planner score, the earlier declaration won, and
 * the loser became a post-filter over the whole non-archived partition.
 */
test('existence check reads nothing proportional to the table', async () => {
  await withCountedOrmCtx(async (ctx, reads) => {
    const other = await makeUser(ctx, 'other');
    const viewer = await makeUser(ctx, 'viewer');
    await seedNoise(ctx, other);

    const before = reads.scanned;
    await expect(hasAnyProject(ctx, viewer)).resolves.toBe(false);
    expect(reads.scanned - before).toBeLessThanOrEqual(2);
  });
});

test('existence check sees a membership-only project', async () => {
  await withCountedOrmCtx(async (ctx, reads) => {
    const other = await makeUser(ctx, 'other');
    const viewer = await makeUser(ctx, 'viewer');
    await seedNoise(ctx, other);

    const shared = await makeProject(ctx, { name: 'shared', ownerId: other });
    await addMember(ctx, { project: shared, userId: viewer });

    const before = reads.scanned;
    await expect(hasAnyProject(ctx, viewer)).resolves.toBe(true);
    expect(reads.scanned - before).toBeLessThanOrEqual(2);
  });
});

/**
 * A deployment seeded before `projectAccess` existed has no access rows. The
 * backfill has to reconstruct exactly what the write path would have produced.
 */
test('backfill reconstructs the same access rows the write path maintains', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const project = await makeProject(ctx, { name: 'p', ownerId: owner });
    await addMember(ctx, { project, userId: member });
    const archivedProject = await makeProject(ctx, {
      name: 'old',
      ownerId: owner,
      archived: true,
    });

    const snapshot = async () =>
      (await ctx.orm.query.projectAccess.findMany({ limit: 100 }))
        .map((row: AccessRow) =>
          [
            row.userId,
            row.projectId,
            row.projectCreatedAt,
            row.archived,
            row.isOwner,
          ].join('|')
        )
        .sort();

    const maintained = await snapshot();
    expect(maintained).toHaveLength(3);

    // Wipe the derived table, as a pre-`projectAccess` deployment would have
    // it. `clearProjectAccess`, not `revokeProjectAccess`, which would re-derive
    // the rows straight back.
    for (const projectId of [project.id, archivedProject.id]) {
      await clearProjectAccess(ctx, { projectId });
    }
    expect(await snapshot()).toEqual([]);

    await backfillProjectAccess(ctx);

    expect(await snapshot()).toEqual(maintained);
  });
});

/**
 * The deploy case the read switch depends on: a deployment that already holds
 * projects and memberships has no access rows at all, so `list`, `hasAny` and
 * `listForDropdown` return nothing until the backfill migration runs.
 *
 * Drives the migration's own `migrateOne` over raw `ctx.db` documents, which is
 * exactly what the runner pages in.
 */
test('backfill migration populates access for pre-existing data', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const member = await makeUser(ctx, 'member');

    const shared = await makeProject(ctx, { name: 'shared', ownerId: owner });
    await addMember(ctx, { project: shared, userId: member });
    const solo = await makeProject(ctx, { name: 'solo', ownerId: owner });

    // Roll the deployment back to its pre-`projectAccess` state.
    for (const projectId of [shared.id, solo.id]) {
      await clearProjectAccess(ctx, { projectId });
    }

    const listFor = (userId: string) =>
      listAccessibleProjects(ctx, {
        userId,
        archived: false,
        cursor: null,
        limit: 20,
      });

    // This is the regression the reviewer flagged: reads go dark.
    expect((await listFor(owner)).page).toEqual([]);
    expect((await listFor(member)).page).toEqual([]);
    await expect(hasAnyProject(ctx, owner)).resolves.toBe(false);

    // Each migration walks its own source table, exactly as the runner pages it.
    const rawProjects = await ctx.db.query('projects').collect();
    const rawMembers = await ctx.db.query('projectMembers').collect();
    expect(rawProjects).toHaveLength(2);
    expect(rawMembers).toHaveLength(1);
    const runBackfill = async () => {
      for (const doc of rawProjects) {
        await backfillOwnersMigration.up.migrateOne(ctx as never, doc as never);
      }
      for (const doc of rawMembers) {
        await backfillMembersMigration.up.migrateOne(
          ctx as never,
          doc as never
        );
      }
    };
    await runBackfill();

    expect((await listFor(owner)).page.map((p) => p.name).sort()).toEqual([
      'shared',
      'solo',
    ]);
    expect((await listFor(member)).page.map((p) => p.name)).toEqual(['shared']);
    await expect(hasAnyProject(ctx, owner)).resolves.toBe(true);
    await expect(hasAnyProject(ctx, member)).resolves.toBe(true);
    expect(
      (await listProjectsForDropdown(ctx, { userId: member, limit: 100 })).map(
        (row) => [row.name, row.isOwner]
      )
    ).toEqual([['shared', false]]);

    // Re-running must not duplicate rows.
    await runBackfill();
    expect(
      await ctx.orm.query.projectAccess.findMany({ limit: 100 })
    ).toHaveLength(3);

    // `down` takes it back to empty, reverse order.
    for (const doc of rawMembers) {
      await backfillMembersMigration.down?.migrateOne(
        ctx as never,
        doc as never
      );
    }
    for (const doc of rawProjects) {
      await backfillOwnersMigration.down?.migrateOne(
        ctx as never,
        doc as never
      );
    }
    expect(await ctx.orm.query.projectAccess.findMany({ limit: 100 })).toEqual(
      []
    );
  });
});

/**
 * Nothing caps a project's member count -- `projects.addMember` only rejects the
 * owner, a duplicate, and a non-owner caller. A backfill that read a project's
 * memberships in one bounded call would silently omit everyone past the bound
 * and leave them permanently unable to see the project.
 *
 * The membership migration walks `projectMembers` itself, one row per
 * `migrateOne`, so its coverage is the runner's paging rather than any limit
 * this code chooses.
 */
test('membership backfill covers every member row, not a capped page', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const project = await makeProject(ctx, { name: 'crowded', ownerId: owner });

    const members: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const member = await makeUser(ctx, `m${index}`);
      await addMember(ctx, { project, userId: member });
      members.push(member);
    }

    await clearProjectAccess(ctx, { projectId: project.id });

    const rawMembers = await ctx.db.query('projectMembers').collect();
    expect(rawMembers).toHaveLength(members.length);
    for (const doc of rawMembers) {
      await backfillMembersMigration.up.migrateOne(ctx as never, doc as never);
    }

    // Every member, including the last one written, can see the project again.
    for (const member of members) {
      const results = await listAccessibleProjects(ctx, {
        userId: member,
        archived: false,
        cursor: null,
        limit: 20,
      });
      expect(results.page.map((p) => p.name)).toEqual(['crowded']);
    }
  });
});

/**
 * The test-only whole-deployment rebuild reads each table in one bounded call,
 * so it has to fail loudly instead of quietly backfilling a prefix.
 */
test('backfillProjectAccess throws rather than truncating at its bound', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    for (let index = 0; index < 4; index += 1) {
      await makeProject(ctx, { name: `p-${index}`, ownerId: owner });
    }

    // Exactly at the bound is not truncation, so it must not throw.
    await expect(
      backfillProjectAccess(ctx, { limit: 4 })
    ).resolves.toBeGreaterThan(0);
    // One past it is.
    await expect(backfillProjectAccess(ctx, { limit: 3 })).rejects.toThrow(
      /more than 3 projects/
    );
  });
});

/**
 * An owner can also hold a membership row -- `aggregateDemo` seeds exactly that.
 * Rolling back only the member migration must not delete the access row the
 * still-applied owner migration created, or the owner loses their own project.
 */
test('rolling back the member migration keeps owner-derived access', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const owner = await makeUser(ctx, 'owner');
    const project = await makeProject(ctx, { name: 'owned', ownerId: owner });

    // The owner is also a member, as the aggregate demo seeds it.
    await ctx.orm
      .insert(projectMembersTable)
      .values({ projectId: project.id, userId: owner });

    const rawMembers = await ctx.db.query('projectMembers').collect();
    expect(rawMembers).toHaveLength(1);

    for (const doc of rawMembers) {
      await backfillMembersMigration.down?.migrateOne(
        ctx as never,
        doc as never
      );
    }

    const results = await listAccessibleProjects(ctx, {
      userId: owner,
      archived: false,
      cursor: null,
      limit: 20,
    });
    expect(results.page.map((p) => p.name)).toEqual(['owned']);
  });
});

/**
 * The dropdown bounds the union of owned and member projects with one limit,
 * where the read it replaced bounded each side separately. `projects.listForDropdown`
 * passes the combined figure so a user under both old bounds but over their sum
 * keeps every project.
 */
test('dropdown returns owned and member projects under one shared budget', async () => {
  await withCountedOrmCtx(async (ctx) => {
    const viewer = await makeUser(ctx, 'viewer');
    const other = await makeUser(ctx, 'other');

    for (let index = 0; index < 2; index += 1) {
      await makeProject(ctx, { name: `own-${index}`, ownerId: viewer });
      const shared = await makeProject(ctx, {
        name: `shared-${index}`,
        ownerId: other,
      });
      await addMember(ctx, { project: shared, userId: viewer });
    }

    const all = await listProjectsForDropdown(ctx, {
      userId: viewer,
      limit: 4,
    });
    expect(all.map((row) => row.name)).toEqual([
      'own-0',
      'own-1',
      'shared-0',
      'shared-1',
    ]);
    expect(all.filter((row) => row.isOwner)).toHaveLength(2);

    // The budget is shared across both kinds, which is why the caller has to
    // pass the combined capacity rather than the per-side one.
    expect(
      await listProjectsForDropdown(ctx, { userId: viewer, limit: 2 })
    ).toHaveLength(2);
  });
});
