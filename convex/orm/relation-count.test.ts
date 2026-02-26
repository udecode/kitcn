import {
  aggregateIndex,
  boolean,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  index,
  text,
} from 'better-convex/orm';
import { describe, expect, it, vi } from 'vitest';
import * as aggregateRuntime from '../../packages/better-convex/src/orm/aggregate-index/runtime';
import { convexTest } from '../setup.testing';

const schedulerStub = {
  runAfter: vi.fn(async () => undefined),
};

const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const buildRelationCountFixtures = () => {
  const relationCountUsers = convexTable('relationCountUsers', {
    name: text().notNull(),
  });

  const relationCountPosts = convexTable(
    'relationCountPosts',
    {
      authorId: text().notNull(),
      status: text().notNull(),
      category: text(),
      title: text(),
    },
    (t) => [
      aggregateIndex('by_author').on(t.authorId),
      aggregateIndex('by_author_status').on(t.authorId, t.status),
    ]
  );

  const relationCountTeams = convexTable(
    'relationCountTeams',
    {
      name: text().notNull(),
      archived: boolean().notNull(),
    },
    (t) => [aggregateIndex('by_name').on(t.name)]
  );

  const relationCountTeamMembers = convexTable(
    'relationCountTeamMembers',
    {
      userId: text().notNull(),
      teamId: text().notNull(),
    },
    (t) => [
      index('by_user_lookup').on(t.userId),
      aggregateIndex('by_user').on(t.userId),
      aggregateIndex('by_team').on(t.teamId),
    ]
  );

  const schema = defineSchema({
    relationCountUsers,
    relationCountPosts,
    relationCountTeams,
    relationCountTeamMembers,
  });

  const relations = defineRelations(
    {
      relationCountUsers,
      relationCountPosts,
      relationCountTeams,
      relationCountTeamMembers,
    },
    (r) => ({
      relationCountUsers: {
        posts: r.many.relationCountPosts({
          from: r.relationCountUsers.id,
          to: r.relationCountPosts.authorId,
        }),
        memberTeams: r.many.relationCountTeams({
          from: r.relationCountUsers.id.through(
            r.relationCountTeamMembers.userId
          ),
          to: r.relationCountTeams.id.through(
            r.relationCountTeamMembers.teamId
          ),
        }),
      },
      relationCountPosts: {
        author: r.one.relationCountUsers({
          from: r.relationCountPosts.authorId,
          to: r.relationCountUsers.id,
        }),
      },
      relationCountTeams: {
        members: r.many.relationCountUsers({
          from: r.relationCountTeams.id.through(
            r.relationCountTeamMembers.teamId
          ),
          to: r.relationCountUsers.id.through(
            r.relationCountTeamMembers.userId
          ),
        }),
      },
      relationCountTeamMembers: {
        authoredPosts: r.many.relationCountPosts({
          from: r.relationCountTeamMembers.userId,
          to: r.relationCountPosts.authorId,
        }),
        user: r.one.relationCountUsers({
          from: r.relationCountTeamMembers.userId,
          to: r.relationCountUsers.id,
        }),
        team: r.one.relationCountTeams({
          from: r.relationCountTeamMembers.teamId,
          to: r.relationCountTeams.id,
        }),
      },
    })
  );

  return {
    schema,
    relations,
  };
};

const runBackfillToReady = async (api: any, ctx: { db: any }) => {
  await (api as any).aggregateBackfill.handler(
    { db: ctx.db, scheduler: schedulerStub },
    {}
  );

  for (let i = 0; i < 20; i += 1) {
    const status = await (api as any).aggregateBackfillStatus.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await (api as any).aggregateBackfillChunk.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const withTrackedConcurrency = async <T>(
  tracker: { inFlight: number; maxInFlight: number },
  fn: () => Promise<T>
): Promise<T> => {
  tracker.inFlight += 1;
  tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
  try {
    return await fn();
  } finally {
    tracker.inFlight -= 1;
  }
};

describe('ORM relation with._count', () => {
  it('returns unfiltered and scalar-filtered relation counts', async () => {
    const { schema, relations } = buildRelationCountFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      const aliceId = await ctx.db.insert('relationCountUsers', {
        name: 'Alice',
      });
      const bobId = await ctx.db.insert('relationCountUsers', {
        name: 'Bob',
      });
      const coreTeamId = await ctx.db.insert('relationCountTeams', {
        name: 'Core',
        archived: false,
      });
      const opsTeamId = await ctx.db.insert('relationCountTeams', {
        name: 'Ops',
        archived: true,
      });

      await ctx.db.insert('relationCountPosts', {
        authorId: aliceId,
        status: 'published',
        category: 'news',
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: aliceId,
        status: 'draft',
        category: 'news',
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: aliceId,
        status: 'published',
        category: null,
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: bobId,
        status: 'published',
        category: 'notes',
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId: aliceId,
        teamId: coreTeamId,
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId: aliceId,
        teamId: opsTeamId,
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId: bobId,
        teamId: opsTeamId,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const unfiltered = await ctx.orm.query.relationCountUsers.findMany({
        limit: 10,
        orderBy: {
          name: 'asc',
        },
        with: {
          _count: {
            posts: true,
          },
        },
      });

      expect(unfiltered).toEqual([
        expect.objectContaining({
          name: 'Alice',
          _count: {
            posts: 3,
          },
        }),
        expect.objectContaining({
          name: 'Bob',
          _count: {
            posts: 1,
          },
        }),
      ]);

      const filtered = await ctx.orm.query.relationCountUsers.findMany({
        limit: 10,
        orderBy: {
          name: 'asc',
        },
        with: {
          _count: {
            posts: {
              where: {
                status: 'published',
              },
            },
          },
        },
      });

      expect(filtered).toEqual([
        expect.objectContaining({
          name: 'Alice',
          _count: {
            posts: 2,
          },
        }),
        expect.objectContaining({
          name: 'Bob',
          _count: {
            posts: 1,
          },
        }),
      ]);

      const filteredThrough = await ctx.orm.query.relationCountUsers.findMany({
        limit: 10,
        orderBy: {
          name: 'asc',
        },
        with: {
          _count: {
            memberTeams: {
              where: {
                name: 'Core',
              },
            },
          },
        },
      });

      expect(filteredThrough).toEqual([
        expect.objectContaining({
          name: 'Alice',
          _count: {
            memberTeams: 1,
          },
        }),
        expect.objectContaining({
          name: 'Bob',
          _count: {
            memberTeams: 0,
          },
        }),
      ]);
    });
  });

  it('throws deterministic errors for unsupported and uncovered relation count filters', async () => {
    const { schema, relations } = buildRelationCountFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      const userId = await ctx.db.insert('relationCountUsers', {
        name: 'Alice',
      });
      const teamId = await ctx.db.insert('relationCountTeams', {
        name: 'Core',
        archived: false,
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId,
        teamId,
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: userId,
        status: 'published',
        category: 'news',
      });

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.relationCountUsers.findMany({
          limit: 1,
          with: {
            _count: {
              posts: {
                where: {
                  author: {
                    name: 'Alice',
                  },
                } as any,
              },
            },
          },
        })
      ).rejects.toThrow(/RELATION_COUNT_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.relationCountUsers.findMany({
          limit: 1,
          with: {
            _count: {
              posts: {
                where: {
                  category: 'news',
                } as any,
              },
            },
          },
        })
      ).rejects.toThrow(/RELATION_COUNT_NOT_INDEXED/);

      await expect(
        ctx.orm.query.relationCountUsers.findMany({
          limit: 1,
          with: {
            _count: {
              memberTeams: {
                where: {
                  NOT: { name: 'Core' },
                } as any,
              },
            },
          },
        })
      ).rejects.toThrow(/RELATION_COUNT_FILTER_UNSUPPORTED/);
    });
  });

  it('loads relation _count across rows concurrently', async () => {
    const { schema, relations } = buildRelationCountFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      const userIds: string[] = [];
      for (const name of ['Alice', 'Bob', 'Charlie']) {
        const userId = await ctx.db.insert('relationCountUsers', {
          name,
        });
        userIds.push(userId);
      }

      for (const userId of userIds) {
        await ctx.db.insert('relationCountPosts', {
          authorId: userId,
          status: 'published',
          category: 'news',
        });
      }

      await runBackfillToReady(api as any, baseCtx as any);

      const tracker = { inFlight: 0, maxInFlight: 0 };
      const delayMs = 20;
      const original = aggregateRuntime.readCountFromBuckets;
      const spy = vi
        .spyOn(aggregateRuntime, 'readCountFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (original as any)(...args);
          })
        );

      try {
        await ctx.orm.query.relationCountUsers.findMany({
          limit: 10,
          with: {
            _count: {
              posts: true,
            },
          },
        });
      } finally {
        spy.mockRestore();
      }

      expect(tracker.maxInFlight).toBeGreaterThan(1);
    });
  });

  it('dedupes relation _count reads by normalized relation+where+parentKey across rows', async () => {
    const { schema, relations } = buildRelationCountFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      const aliceId = await ctx.db.insert('relationCountUsers', {
        name: 'Alice',
      });
      const bobId = await ctx.db.insert('relationCountUsers', {
        name: 'Bob',
      });
      const coreTeamId = await ctx.db.insert('relationCountTeams', {
        name: 'Core',
        archived: false,
      });
      const opsTeamId = await ctx.db.insert('relationCountTeams', {
        name: 'Ops',
        archived: false,
      });

      await ctx.db.insert('relationCountPosts', {
        authorId: aliceId,
        status: 'published',
        category: 'news',
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: aliceId,
        status: 'draft',
        category: 'notes',
      });
      await ctx.db.insert('relationCountPosts', {
        authorId: bobId,
        status: 'published',
        category: 'news',
      });

      await ctx.db.insert('relationCountTeamMembers', {
        userId: aliceId,
        teamId: coreTeamId,
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId: aliceId,
        teamId: opsTeamId,
      });
      await ctx.db.insert('relationCountTeamMembers', {
        userId: bobId,
        teamId: opsTeamId,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const readSpy = vi.spyOn(aggregateRuntime, 'readCountFromBuckets');

      try {
        const rows = await ctx.orm.query.relationCountTeamMembers.findMany({
          limit: 10,
          with: {
            _count: {
              authoredPosts: true,
            },
          },
        });

        expect(rows).toHaveLength(3);
        expect(
          rows
            .map((row) => row._count.authoredPosts)
            .sort((left, right) => left - right)
        ).toEqual([1, 2, 2]);

        const authoredPostsReads = readSpy.mock.calls.filter(
          ([, plan]) =>
            (plan as any)?.tableName === 'relationCountPosts' &&
            (plan as any)?.indexName === 'by_author'
        );
        expect(authoredPostsReads).toHaveLength(2);
      } finally {
        readSpy.mockRestore();
      }
    });
  });
});
