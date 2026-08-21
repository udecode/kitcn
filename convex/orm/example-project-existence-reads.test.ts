import { expect, test } from 'vitest';
import { hasAnyProject } from '../../example/convex/functions/_helpers/project_existence';
import schema, {
  projectMembersTable,
  projectsTable,
  userTable,
} from '../../example/convex/functions/schema';
import { countDocumentReads, withOrmCtx } from '../setup.testing';

const EXAMPLE_ENV_DEFAULTS = {
  ADMIN: 'admin@example.com',
  BETTER_AUTH_SECRET: 'test-secret',
  GITHUB_CLIENT_ID: 'github-client-id',
  GITHUB_CLIENT_SECRET: 'github-client-secret',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
} as const;

const withExampleEnv = async (run: () => Promise<void>) => {
  const original = Object.fromEntries(
    Object.keys(EXAMPLE_ENV_DEFAULTS).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(EXAMPLE_ENV_DEFAULTS)) {
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
};

const OTHER_USER_PROJECTS = 40;

/**
 * The app shell nav asks "does this user have at least one project" on every
 * route. Answering that through the paginated `projects.list` read model
 * attaches no index -- `orderBy({ createdAt })` normalizes to `_creationTime` --
 * and post-filters owner-or-member in JS, so a user with zero projects drains
 * the whole table and every scanned row joins the subscription's read set.
 *
 * `projects.hasAny` answers the same non-archived owner-or-member question off
 * `projects.ownerId` and `projectMembers.userId`. These tests call its exact
 * source owner and pin that both legs stay index-backed: the read count must not
 * track table size.
 */
test('project existence check does not scan projects owned by other users', async () => {
  await withExampleEnv(async () => {
    await withOrmCtx(schema, schema, async (ctx) => {
      const [owner] = await ctx.orm
        .insert(userTable)
        .values({
          name: 'Owner',
          email: 'existence-owner@test.dev',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: userTable.id });

      const [viewer] = await ctx.orm
        .insert(userTable)
        .values({
          name: 'Viewer',
          email: 'existence-viewer@test.dev',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: userTable.id });

      for (let index = 0; index < OTHER_USER_PROJECTS; index += 1) {
        await ctx.orm.insert(projectsTable).values({
          name: `other-${index}`,
          isPublic: false,
          archived: false,
          ownerId: owner.id,
        });
      }

      const reads = countDocumentReads(ctx);

      await expect(hasAnyProject(ctx, viewer.id)).resolves.toBe(false);
      // Both legs hit an index range that is empty for this user. The
      // unindexed read model reported OTHER_USER_PROJECTS reads here.
      expect(reads.scanned).toBeLessThanOrEqual(2);
    });
  });
});

test('project existence check reads only the viewer own and member rows', async () => {
  await withExampleEnv(async () => {
    await withOrmCtx(schema, schema, async (ctx) => {
      const [owner] = await ctx.orm
        .insert(userTable)
        .values({
          name: 'Owner',
          email: 'existence-owner-2@test.dev',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: userTable.id });

      const [viewer] = await ctx.orm
        .insert(userTable)
        .values({
          name: 'Viewer',
          email: 'existence-viewer-2@test.dev',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: userTable.id });

      for (let index = 0; index < OTHER_USER_PROJECTS; index += 1) {
        await ctx.orm.insert(projectsTable).values({
          name: `other-${index}`,
          isPublic: false,
          archived: false,
          ownerId: owner.id,
        });
      }

      const [shared] = await ctx.orm
        .insert(projectsTable)
        .values({
          name: 'shared',
          isPublic: false,
          archived: false,
          ownerId: owner.id,
        })
        .returning({ id: projectsTable.id });

      await ctx.orm.insert(projectMembersTable).values({
        projectId: shared.id,
        userId: viewer.id,
      });

      const reads = countDocumentReads(ctx);

      await expect(hasAnyProject(ctx, viewer.id)).resolves.toBe(true);
      // One membership and one related project row. Nothing proportional to
      // OTHER_USER_PROJECTS.
      expect(reads.scanned).toBeLessThanOrEqual(3);
    });
  });
});
