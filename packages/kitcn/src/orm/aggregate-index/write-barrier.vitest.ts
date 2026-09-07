import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineSchema,
  integer,
  text,
} from '..';
import { aggregateCapability } from './capability';
import { COUNT_STATUS_CLEARING, setCountState } from './runtime';

/**
 * Fail-closed coverage for the injected write barrier across every write path.
 * The read-amplification suite next door pins how often the CLEARING probe
 * runs; this pins that it runs at all. Before the barrier moved out of the
 * user `before` slot it was only ever exercised on insert, and it never ran on
 * a delete whose row was already gone.
 */
const barrierUsers = convexTable(
  'wbc_users',
  {
    orgId: text().notNull(),
    score: integer().notNull(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId)]
);

const schema = defineSchema({ wbc_users: barrierUsers });

const CLEARING_RE = /CLEARING/;

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const createOrmClient = () =>
  createOrm({
    capabilities: [aggregateCapability()],
    schema,
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: passthroughInternalMutation,
  });

const markClearing = async (db: any, tableName: string) => {
  await setCountState(db, {
    completedAt: null,
    cursor: null,
    indexName: 'by_org',
    keyDefinitionHash: '',
    lastError: null,
    metricDefinitionHash: '',
    processed: 0,
    startedAt: 0,
    status: COUNT_STATUS_CLEARING,
    tableName,
    updatedAt: 0,
  } as any);
};

describe('aggregate write barrier fail-closed contract', () => {
  test('a CLEARING index blocks every write path', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const liveId = await baseCtx.db.insert('wbc_users', {
        orgId: 'org-1',
        score: 1,
      });
      const goneId = await baseCtx.db.insert('wbc_users', {
        orgId: 'org-1',
        score: 2,
      });
      await baseCtx.db.delete(goneId);

      await markClearing(baseCtx.db, 'wbc_users');

      const ctx = createOrmClient().with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const db = ctx.db as any;

      await expect(
        db.insert('wbc_users', { orgId: 'org-1', score: 3 })
      ).rejects.toThrow(CLEARING_RE);
      await expect(db.patch('wbc_users', liveId, { score: 9 })).rejects.toThrow(
        CLEARING_RE
      );
      await expect(
        db.replace('wbc_users', liveId, { orgId: 'org-1', score: 9 })
      ).rejects.toThrow(CLEARING_RE);
      await expect(db.delete('wbc_users', liveId)).rejects.toThrow(CLEARING_RE);

      // The row is already gone, so the delete cannot corrupt the index — but
      // it used to short-circuit ahead of the barrier and surface Convex's
      // "Delete on non-existent doc" instead, which reads as a caller bug
      // rather than a transient index state.
      await expect(db.delete('wbc_users', goneId)).rejects.toThrow(CLEARING_RE);
    });
  });
});
