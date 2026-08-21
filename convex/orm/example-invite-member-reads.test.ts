import { createOrm, type OrmWriter } from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import { expect, test, vi } from 'vitest';
import { countOrganizationSeats } from '../../example/convex/functions/_helpers/member_capacity';
import schema, {
  invitationTable,
  memberTable,
  organizationTable,
  userTable,
} from '../../example/convex/functions/schema';
import { convexTest, countDocumentReads } from '../setup.testing';

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

type ExampleCtx = {
  db: Parameters<typeof countDocumentReads>[0]['db'];
  orm: OrmWriter<typeof schema>;
};

/**
 * Drive the example schema through the ORM, exposing the aggregate backfill so a
 * test can seed rows and then bring the indexes to READY — the state `kitcn dev`
 * leaves a deployment in. A declared `aggregateIndex` starts BUILDING, so
 * `count()` throws `COUNT_INDEX_BUILDING` until `backfill()` has run.
 */
const withOrmCtxAndBackfill = async (
  run: (ctx: ExampleCtx, backfill: () => Promise<void>) => Promise<void>
): Promise<void> => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    // `ormFunctions` is what gates `orm.api()`, which owns the backfill
    // handlers. The builders are passthroughs so the handlers stay reachable as
    // `.handler`; the real Convex builders expose `_handler` instead. Chunks are
    // drained by hand below, so the scheduled references are never dereferenced.
    const ormClient = createOrm({
      schema,
      capabilities: [aggregateCapability()],
      ormFunctions: {
        scheduledDelete: {} as any,
        scheduledMutationBatch: {} as any,
      },
      internalMutation: ((definition: unknown) => definition) as never,
      internalQuery: ((definition: unknown) => definition) as never,
    });
    const scheduler = { runAfter: vi.fn(async () => undefined) };
    const handlerCtx = { db: baseCtx.db, scheduler } as any;
    const ctx = ormClient.with(handlerCtx) as unknown as ExampleCtx;

    const backfill = async () => {
      const api = ormClient.api() as any;
      await api.aggregateBackfill.handler(handlerCtx, {});

      for (let attempt = 0; attempt < 50; attempt += 1) {
        const status = await api.aggregateBackfillStatus.handler(
          handlerCtx,
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          return;
        }
        await api.aggregateBackfillChunk.handler(handlerCtx, {});
      }

      throw new Error('aggregate backfill did not reach READY');
    };

    await run(ctx, backfill);
  });
};

const DECOY_MEMBERS = 40;
const PENDING_INVITATIONS = 3;

const seedOrganization = async (ctx: ExampleCtx, slug: string) => {
  const [inviter] = await ctx.orm
    .insert(userTable)
    .values({
      name: 'Inviter',
      email: `${slug}-inviter@test.dev`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: userTable.id });

  const [organization] = await ctx.orm
    .insert(organizationTable)
    .values({ name: slug, slug, monthlyCredits: 0 })
    .returning({ id: organizationTable.id });

  for (let index = 0; index < DECOY_MEMBERS; index += 1) {
    const [member] = await ctx.orm
      .insert(userTable)
      .values({
        name: `member-${index}`,
        email: `${slug}-member-${index}@test.dev`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: userTable.id });

    await ctx.orm.insert(memberTable).values({
      organizationId: organization.id,
      userId: member.id,
      role: 'member',
    });
  }

  for (let index = 0; index < PENDING_INVITATIONS; index += 1) {
    await ctx.orm.insert(invitationTable).values({
      organizationId: organization.id,
      inviterId: inviter.id,
      email: `${slug}-invitee-${index}@test.dev`,
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }

  // Canceled invitations must not count against the limit.
  await ctx.orm.insert(invitationTable).values({
    organizationId: organization.id,
    inviterId: inviter.id,
    email: `${slug}-canceled@test.dev`,
    role: 'member',
    status: 'canceled',
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  return organization.id;
};

test('organization seat counting works while aggregate indexes build', async () => {
  await withExampleEnv(async () => {
    await withOrmCtxAndBackfill(async (ctx) => {
      const organizationId = await seedOrganization(ctx, 'seat-building');

      await expect(
        countOrganizationSeats(ctx, organizationId)
      ).resolves.toEqual({
        members: DECOY_MEMBERS,
        pending: PENDING_INVITATIONS,
        total: DECOY_MEMBERS + PENDING_INVITATIONS,
      });
    });
  });
});

/**
 * `inviteMember` compares members + pending invitations against `MEMBER_LIMIT`.
 * Answering that by collecting both row sets put every member and every pending
 * invitation of the organization into the transaction's read set — up to
 * `DEFAULT_LIST_LIMIT` (100) rows per leg — to produce two integers.
 *
 * `countOrganizationSeats` answers the same question off
 * `member.by_organization` and `invitation.by_organization_status`. These tests
 * pin the counts exact and pin the read cost to something that does not track
 * organization size.
 */
test('organization seat counting does not read one row per member', async () => {
  await withExampleEnv(async () => {
    await withOrmCtxAndBackfill(async (ctx, backfill) => {
      const organizationId = await seedOrganization(ctx, 'seat-reads');
      await backfill();

      const reads = countDocumentReads(ctx);
      const seats = await countOrganizationSeats(ctx, organizationId);

      expect(seats).toEqual({
        members: DECOY_MEMBERS,
        pending: PENDING_INVITATIONS,
        total: DECOY_MEMBERS + PENDING_INVITATIONS,
      });
      // Aggregate bucket reads only: 4 observed, flat in organization size.
      // Collecting the rows reported 43 reads here
      // (DECOY_MEMBERS + PENDING_INVITATIONS).
      expect(reads.documents).toBeLessThanOrEqual(6);
    });
  });
});

test('organization seat counting is scoped to one organization', async () => {
  await withExampleEnv(async () => {
    await withOrmCtxAndBackfill(async (ctx, backfill) => {
      const organizationId = await seedOrganization(ctx, 'seat-scope');
      await seedOrganization(ctx, 'seat-scope-other');
      await backfill();

      const seats = await countOrganizationSeats(ctx, organizationId);

      expect(seats.members).toBe(DECOY_MEMBERS);
      expect(seats.pending).toBe(PENDING_INVITATIONS);
    });
  });
});
