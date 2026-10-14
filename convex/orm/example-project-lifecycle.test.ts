import { convexTest } from 'convex-test';
import { eq } from 'kitcn/orm';
import { expect, test, vi } from 'vitest';
import * as z from 'zod';
import { api, internal } from '../../example/convex/functions/_generated/api';
import schema, {
  projectMembersTable,
  projectsTable,
  sessionTable,
  userTable,
} from '../../example/convex/functions/schema';
import { withExampleEnv, withOrm } from '../setup.testing';

const modules = (
  import.meta as ImportMeta & {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob('../../example/convex/functions/**/*.ts');

test('registered project mutations preserve owner and member visibility', async () => {
  await withExampleEnv(async () => {
    const t = convexTest(schema, modules);
    const runtime = (
      globalThis as typeof globalThis & {
        Convex: {
          asyncSyscall: (name: string, args: string) => Promise<string>;
        };
      }
    ).Convex;
    const originalAsyncSyscall = runtime.asyncSyscall.bind(runtime);
    // convex-test does not implement the request metadata syscall used by auth.
    const metadata = vi
      .spyOn(runtime, 'asyncSyscall')
      .mockImplementation(async (name, args) =>
        name === '1.0/getRequestMetadata'
          ? '{}'
          : originalAsyncSyscall(name, args)
      );

    try {
      const seedUser = async (email: string) =>
        t.run(async (ctx) => {
          const { orm } = withOrm(ctx, schema);
          const [user] = await orm
            .insert(userTable)
            .values({
              name: email,
              email,
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          const [session] = await orm
            .insert(sessionTable)
            .values({
              token: email,
              userId: user.id,
              expiresAt: new Date(Date.now() + 3_600_000),
              updatedAt: new Date(),
            })
            .returning();
          return { userId: user.id, sessionId: session.id };
        });
      const owner = await seedUser('owner@project-lifecycle.test');
      const member = await seedUser('member@project-lifecycle.test');
      const asOwner = t.withIdentity({
        subject: owner.userId,
        sessionId: owner.sessionId,
      });
      const asMember = t.withIdentity({
        subject: member.userId,
        sessionId: member.sessionId,
      });

      await t.mutation(internal.generated.aggregate.aggregateBackfill, {});
      const statusesSchema = z.array(z.object({ status: z.string() }));
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const statuses = statusesSchema.parse(
          await t.query(
            internal.generated.aggregate.aggregateBackfillStatus,
            {}
          )
        );
        if (statuses.every((status) => status.status === 'READY')) {
          break;
        }
        expect(attempt).toBeLessThan(29);
        await t.mutation(
          internal.generated.aggregate.aggregateBackfillChunk,
          {}
        );
      }

      const accessRows = async (projectId: string) =>
        t.run(async (ctx) => {
          const { orm } = withOrm(ctx, schema);
          const rows = await orm.query.projectAccess.findMany({
            where: { projectId },
            columns: { userId: true, isOwner: true, archived: true },
            limit: 10,
          });
          return rows.map(({ userId, isOwner, archived }) => ({
            userId,
            isOwner,
            archived,
          }));
        });
      const legacyProjectId = await t.run(async (ctx) => {
        const { orm } = withOrm(ctx, schema);
        const [project] = await orm
          .insert(projectsTable)
          .values({
            name: 'Before backfill',
            ownerId: owner.userId,
            isPublic: false,
            archived: false,
          })
          .returning();
        await orm
          .insert(projectMembersTable)
          .values({ projectId: project.id, userId: member.userId });
        return project.id;
      });
      expect(await accessRows(legacyProjectId)).toEqual([]);
      expect(
        (await asOwner.query(api.projects.list, { cursor: null, limit: 20 }))
          .page
      ).toMatchObject([{ id: legacyProjectId }]);
      for (const viewer of [asOwner, asMember]) {
        expect(await viewer.query(api.projects.hasAny, {})).toBe(true);
        expect(
          await viewer.query(api.projects.listForDropdown, {})
        ).toMatchObject([{ id: legacyProjectId }]);
      }
      await t.run(async (ctx) => {
        const { orm } = withOrm(ctx, schema);
        await orm
          .delete(projectsTable)
          .where(eq(projectsTable.id, legacyProjectId));
      });

      const projectId = await asOwner.mutation(api.projects.create, {
        name: 'Registered lifecycle',
        isPublic: false,
      });
      expect(await accessRows(projectId)).toEqual([
        { userId: owner.userId, isOwner: true, archived: false },
      ]);
      expect(await asOwner.query(api.projects.hasAny, {})).toBe(true);
      expect(await asMember.query(api.projects.hasAny, {})).toBe(false);
      expect(
        (await asOwner.query(api.projects.list, { cursor: null, limit: 20 }))
          .page
      ).toMatchObject([{ id: projectId, isOwner: true, memberCount: 0 }]);

      await asOwner.mutation(api.projects.addMember, {
        projectId,
        userEmail: 'member@project-lifecycle.test',
      });
      expect(await accessRows(projectId)).toHaveLength(2);
      await asOwner.mutation(api.projects.removeMember, {
        projectId,
        userId: member.userId,
      });
      expect(await accessRows(projectId)).toEqual([
        { userId: owner.userId, isOwner: true, archived: false },
      ]);
      expect(await asMember.query(api.projects.hasAny, {})).toBe(false);
      expect(await asMember.query(api.projects.listForDropdown, {})).toEqual(
        []
      );
      await asOwner.mutation(api.projects.addMember, {
        projectId,
        userEmail: 'member@project-lifecycle.test',
      });

      await asOwner.mutation(api.projects.archive, { projectId });
      expect((await accessRows(projectId)).map((row) => row.archived)).toEqual([
        true,
        true,
      ]);
      expect(
        (await asOwner.query(api.projects.list, { cursor: null, limit: 20 }))
          .page
      ).toEqual([]);
      expect(
        (
          await asOwner.query(api.projects.list, {
            cursor: null,
            limit: 20,
            includeArchived: true,
          })
        ).page
      ).toMatchObject([{ id: projectId, archived: true }]);

      await asOwner.mutation(api.projects.restore, { projectId });
      expect((await accessRows(projectId)).map((row) => row.archived)).toEqual([
        false,
        false,
      ]);
      expect(
        (await asOwner.query(api.projects.list, { cursor: null, limit: 20 }))
          .page
      ).toMatchObject([{ id: projectId, archived: false }]);

      await asOwner.mutation(api.projects.transfer, {
        projectId,
        newOwnerId: member.userId,
      });
      expect(await accessRows(projectId)).toEqual(
        expect.arrayContaining([
          { userId: owner.userId, isOwner: false, archived: false },
          { userId: member.userId, isOwner: true, archived: false },
        ])
      );
      expect(await asMember.query(api.projects.listForDropdown, {})).toEqual([
        { id: projectId, name: 'Registered lifecycle', isOwner: true },
      ]);
      expect(await asOwner.query(api.projects.listForDropdown, {})).toEqual([
        { id: projectId, name: 'Registered lifecycle', isOwner: false },
      ]);

      await asOwner.mutation(api.projects.leave, { projectId });
      expect(await accessRows(projectId)).toEqual([
        { userId: member.userId, isOwner: true, archived: false },
      ]);
      expect(await asOwner.query(api.projects.hasAny, {})).toBe(false);
      expect(await asMember.query(api.projects.hasAny, {})).toBe(true);

      await t.run(async (ctx) => {
        const { orm } = withOrm(ctx, schema);
        await orm.delete(projectsTable).where(eq(projectsTable.id, projectId));
      });
      expect(await accessRows(projectId)).toEqual([]);
      expect(await asMember.query(api.projects.hasAny, {})).toBe(false);
      expect(await asMember.query(api.projects.listForDropdown, {})).toEqual(
        []
      );
    } finally {
      metadata.mockRestore();
    }
  });
});
