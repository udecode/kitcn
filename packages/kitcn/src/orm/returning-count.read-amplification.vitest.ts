import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  eq,
  integer,
  rlsPolicy,
  text,
} from '.';
import { aggregateCapability } from './aggregate-index';

type Counts = { get: number; query: number };

/**
 * Counts reads issued through the writer the ORM was handed. `Object.create`
 * puts the ORM's context carrier in front of this proxy, so the trap has to
 * answer prototype-chain lookups too.
 */
const countingDb = (db: any, counts: Counts) =>
  new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop !== 'get' && prop !== 'query') {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        counts[prop] += 1;
        return value.apply(target, args);
      };
    },
  });

const schedulerStub = { runAfter: vi.fn(async () => undefined) };

const buildOrm = (schema: any) =>
  createOrm({
    schema,
    capabilities: [aggregateCapability()],
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: ((definition: unknown) => definition) as never,
  });

const runBackfillToReady = async (api: any, db: any) => {
  const handlerCtx = { db, scheduler: schedulerStub };
  await api.aggregateBackfill.handler(handlerCtx, {});

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await api.aggregateBackfillStatus.handler(handlerCtx, {});
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await api.aggregateBackfillChunk.handler(handlerCtx, {});
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

/**
 * No `references()` anywhere: an incoming foreign key from an aggregate-indexed
 * child makes `update()` treat the parent as hook-reachable and re-read its own
 * post-image, which would mask the read this suite is measuring.
 */
const users = convexTable('rc_users', {
  name: text().notNull(),
  handle: text().notNull(),
});

const posts = convexTable(
  'rc_posts',
  {
    authorHandle: text().notNull(),
    status: text().notNull(),
  },
  (t) => [
    aggregateIndex('rc_posts_by_handle').on(t.authorHandle),
    aggregateIndex('rc_posts_by_handle_status').on(t.authorHandle, t.status),
  ]
);

const runtimeSchema = defineSchema({ rc_users: users, rc_posts: posts });

const relations = defineRelations(
  { rc_users: users, rc_posts: posts },
  (r) => ({
    rc_users: {
      posts: r.many.rc_posts({
        from: r.rc_users.handle,
        to: r.rc_posts.authorHandle,
      }),
    },
    rc_posts: {
      author: r.one.rc_users({
        from: r.rc_posts.authorHandle,
        to: r.rc_users.handle,
      }),
    },
  })
);

const seedPosts = async (db: any, handle: string, count: number) => {
  for (let index = 0; index < count; index += 1) {
    await db.insert('rc_posts', {
      authorHandle: handle,
      status: index === 0 ? 'draft' : 'published',
    });
  }
};

describe('ORM returning({ _count }) read amplification', () => {
  test('update() does not re-read the row it just patched', async () => {
    const t = convexTest(runtimeSchema);
    const ormClient = buildOrm(relations);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('rc_users', { name: 'Ada', handle: 'ada' });
      await baseCtx.db.insert('rc_users', { name: 'Bob', handle: 'bob' });
      await seedPosts(baseCtx.db, 'ada', 3);
      await seedPosts(baseCtx.db, 'bob', 3);
      await runBackfillToReady(ormClient.api() as any, baseCtx.db);

      // Control and subject differ only by `_count`, so the delta between them
      // is exactly the count loader's own reads.
      const controlCounts: Counts = { get: 0, query: 0 };
      const controlCtx = ormClient.with({
        db: countingDb(baseCtx.db, controlCounts),
        scheduler: schedulerStub,
      } as any) as any;
      await controlCtx.orm
        .update(users)
        .set({ name: 'Bob Updated' })
        .where(eq(users.handle, 'bob'))
        .allowFullScan()
        .returning({ name: users.name })
        .execute();

      const counts: Counts = { get: 0, query: 0 };
      const ctx = ormClient.with({
        db: countingDb(baseCtx.db, counts),
        scheduler: schedulerStub,
      } as any) as any;
      const rows = await ctx.orm
        .update(users)
        .set({ name: 'Ada Updated' })
        .where(eq(users.handle, 'ada'))
        .allowFullScan()
        .returning({
          name: users.name,
          _count: { posts: { where: { status: 'published' } } },
        })
        .execute();

      expect(rows).toEqual([{ name: 'Ada Updated', _count: { posts: 2 } }]);
      // Aggregate buckets are read through `query`; the count loader must not
      // add a `get` of its own.
      expect(counts.get).toBe(controlCounts.get);
    });
  });

  test('delete() counts children before the row and its children are gone', async () => {
    const t = convexTest(runtimeSchema);
    const ormClient = buildOrm(relations);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('rc_users', { name: 'Ada', handle: 'ada' });
      await baseCtx.db.insert('rc_users', { name: 'Bob', handle: 'bob' });
      await seedPosts(baseCtx.db, 'ada', 3);
      await seedPosts(baseCtx.db, 'bob', 3);
      await runBackfillToReady(ormClient.api() as any, baseCtx.db);

      const controlCounts: Counts = { get: 0, query: 0 };
      const controlCtx = ormClient.with({
        db: countingDb(baseCtx.db, controlCounts),
        scheduler: schedulerStub,
      } as any) as any;
      await controlCtx.orm
        .delete(users)
        .where(eq(users.handle, 'bob'))
        .allowFullScan()
        .returning({ name: users.name })
        .execute();

      const counts: Counts = { get: 0, query: 0 };
      const ctx = ormClient.with({
        db: countingDb(baseCtx.db, counts),
        scheduler: schedulerStub,
      } as any) as any;
      const rows = await ctx.orm
        .delete(users)
        .where(eq(users.handle, 'ada'))
        .allowFullScan()
        .returning({ name: users.name, _count: { posts: true } })
        .execute();

      expect(rows).toEqual([{ name: 'Ada', _count: { posts: 3 } }]);
      expect(counts.get).toBe(controlCounts.get);
    });
  });

  test('insert() counts from the derived post-image, not a re-read', async () => {
    const t = convexTest(runtimeSchema);
    const ormClient = buildOrm(relations);

    await t.run(async (baseCtx) => {
      await seedPosts(baseCtx.db, 'ada', 3);
      await runBackfillToReady(ormClient.api() as any, baseCtx.db);

      const counts: Counts = { get: 0, query: 0 };
      const ctx = ormClient.with({
        db: countingDb(baseCtx.db, counts),
        scheduler: schedulerStub,
      } as any) as any;

      const rows = await ctx.orm
        .insert(users)
        .values({ name: 'Ada', handle: 'ada' })
        .returning({ id: users.id, _count: { posts: true } })
        .execute();

      // The edge keys on `handle`, not `_id`, and the children were seeded
      // before the insert. A derived row missing `handle` would count 0 here
      // without raising anything, so this pins the composition of both halves.
      expect(rows).toHaveLength(1);
      expect(rows[0]._count).toEqual({ posts: 3 });
      expect(typeof rows[0].id).toBe('string');
      expect(counts.get).toBe(0);
    });
  });
});

const stamped = convexTable('rc_stamped', {
  name: text().notNull(),
});

const stampedEvents = convexTable(
  'rc_stamped_events',
  {
    bucket: integer().notNull(),
  },
  (t) => [aggregateIndex('rc_stamped_events_by_bucket').on(t.bucket)]
);

const stampedRuntimeSchema = defineSchema({
  rc_stamped: stamped,
  rc_stamped_events: stampedEvents,
});

const stampedRelations = defineRelations(
  { rc_stamped: stamped, rc_stamped_events: stampedEvents },
  (r) => ({
    rc_stamped: {
      events: r.many.rc_stamped_events({
        from: r.rc_stamped.createdAt,
        to: r.rc_stamped_events.bucket,
      }),
    },
  })
);

describe('ORM insert() with a _creationTime-keyed counted relation', () => {
  test('keeps its read because the derived post-image has no _creationTime', async () => {
    const t = convexTest(stampedRuntimeSchema);
    const ormClient = buildOrm(stampedRelations);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('rc_stamped_events', { bucket: 1 });
      await runBackfillToReady(ormClient.api() as any, baseCtx.db);

      const counts: Counts = { get: 0, query: 0 };
      const ctx = ormClient.with({
        db: countingDb(baseCtx.db, counts),
        scheduler: schedulerStub,
      } as any) as any;

      const rows = await ctx.orm
        .insert(stamped)
        .values({ name: 'Ada' })
        .returning({ id: stamped.id, _count: { events: true } })
        .execute();

      expect(rows).toHaveLength(1);
      // Tripwire, not a count assertion: `_creationTime` is unknowable before
      // the write, so no seeded event can match it. What matters is that the
      // fast path stood down rather than counting off a row that provably
      // cannot carry the edge's source field.
      expect(counts.get).toBe(1);
    });
  });
});

const rlsDocs = convexTable.withRLS(
  'rc_rls_docs',
  {
    ownerId: text().notNull(),
  },
  (t) => [
    rlsPolicy('rc_rls_docs_all', {
      for: 'all',
      using: () => eq(t.ownerId, 'ada'),
      withCheck: () => eq(t.ownerId, 'ada'),
    }),
  ]
);

const rlsRevisions = convexTable(
  'rc_rls_revisions',
  {
    docOwnerId: text().notNull(),
  },
  (t) => [aggregateIndex('rc_rls_revisions_by_owner').on(t.docOwnerId)]
);

const rlsRuntimeSchema = defineSchema({
  rc_rls_docs: rlsDocs,
  rc_rls_revisions: rlsRevisions,
});

const rlsRelations = defineRelations(
  { rc_rls_docs: rlsDocs, rc_rls_revisions: rlsRevisions },
  (r) => ({
    rc_rls_docs: {
      revisions: r.many.rc_rls_revisions({
        from: r.rc_rls_docs.ownerId,
        to: r.rc_rls_revisions.docOwnerId,
      }),
    },
  })
);

describe('ORM insert() with RLS and a counted relation', () => {
  test('keeps its read so the select policy sees a whole row', async () => {
    const t = convexTest(rlsRuntimeSchema);
    const ormClient = buildOrm(rlsRelations);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('rc_rls_revisions', { docOwnerId: 'ada' });
      await baseCtx.db.insert('rc_rls_revisions', { docOwnerId: 'ada' });
      await runBackfillToReady(ormClient.api() as any, baseCtx.db);

      const counts: Counts = { get: 0, query: 0 };
      const ctx = ormClient.with({
        db: countingDb(baseCtx.db, counts),
        scheduler: schedulerStub,
      } as any) as any;

      const rows = await ctx.orm
        .insert(rlsDocs)
        .values({ ownerId: 'ada' })
        .returning({ id: rlsDocs.id, _count: { revisions: true } })
        .execute();

      expect(rows).toHaveLength(1);
      // The count loader runs the row through the RLS select filter, and a
      // policy expression can name any column — including `createdAt`, which a
      // derived post-image cannot carry. Edge source fields are inspectable, a
      // user-authored policy is not, so this combination keeps the read.
      expect(counts.get).toBe(1);
      // A row the select filter admits must still come back counted: the
      // filter hands back the rows it was given, so the copy the seam counts
      // against is the one it reads `_count` off.
      expect(rows[0]._count).toEqual({ revisions: 2 });
    });
  });
});
