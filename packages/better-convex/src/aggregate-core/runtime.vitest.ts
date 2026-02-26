import {
  type DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  type GenericMutationCtx,
} from 'convex/server';
import { v } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TableAggregate } from './runtime.js';
import { AGGREGATE_NODE_TABLE, AGGREGATE_TREE_TABLE } from './schema.js';

const schema = defineSchema({
  testItems: defineTable({
    name: v.string(),
    value: v.number(),
  }),
  photos: defineTable({
    album: v.string(),
    url: v.string(),
    score: v.number(),
  }),
  [AGGREGATE_TREE_TABLE]: defineTable({
    aggregateName: v.string(),
    root: v.id(AGGREGATE_NODE_TABLE),
    namespace: v.optional(v.any()),
    maxNodeSize: v.number(),
  })
    .index('by_namespace', ['namespace'])
    .index('by_aggregate_name', ['aggregateName']),
  [AGGREGATE_NODE_TABLE]: defineTable({
    items: v.array(
      v.object({
        k: v.any(),
        s: v.number(),
        v: v.any(),
      })
    ),
    subtrees: v.array(v.id(AGGREGATE_NODE_TABLE)),
    aggregate: v.optional(
      v.object({
        count: v.number(),
        sum: v.number(),
      })
    ),
  }),
});

function setupTest() {
  const t = convexTest(schema);
  return t;
}

type ConvexTest = ReturnType<typeof setupTest>;
type DataModel = DataModelFromSchemaDefinition<typeof schema>;

const runWithOrm = async <T>(
  t: ConvexTest,
  callback: (
    ctx: GenericMutationCtx<DataModel> & {
      orm: Record<string, unknown>;
    }
  ) => Promise<T>
): Promise<T> =>
  t.run(async (ctx) =>
    callback({
      ...(ctx as object),
      orm: {},
    } as GenericMutationCtx<DataModel> & {
      orm: Record<string, unknown>;
    })
  );

// Helper function to create aggregates with fresh instances
// if we dont do this we will get strange errors if we share instances between tests
function createAggregates() {
  const aggregate = new TableAggregate<{
    Key: number;
    DataModel: DataModel;
    TableName: 'testItems';
  }>({
    name: 'runtimeTestItems',
    table: 'testItems',
    sortKey: (doc) => doc.value,
    sumValue: (doc) => doc.value,
  });

  const aggregateWithNamespace = new TableAggregate<{
    Namespace: string;
    Key: number;
    DataModel: DataModel;
    TableName: 'photos';
  }>({
    name: 'runtimeTestPhotos',
    table: 'photos',
    namespace: (doc) => doc.album,
    sortKey: (doc) => doc.score, // Use score instead of _creationTime for predictable tests
  });

  return { aggregate, aggregateWithNamespace };
}

async function testItem(
  ctx: GenericMutationCtx<DataModel>,
  value: { name: string; value: number }
) {
  const id = await ctx.db.insert('testItems', {
    name: value.name,
    value: value.value,
  });
  return (await ctx.db.get(id))!;
}

describe('TableAggregate', () => {
  describe('count', () => {
    let t: ConvexTest;
    let aggregate: ReturnType<typeof createAggregates>['aggregate'];

    beforeEach(() => {
      t = setupTest();
      ({ aggregate } = createAggregates());
    });

    const exec = async () =>
      await runWithOrm(t, async (ctx) => await aggregate.count(ctx));

    test('should count zero items in empty table', async () => {
      const result = await exec();
      expect(result).toBe(0);
    });

    test('should count two items after inserting two documents', async () => {
      await runWithOrm(t, async (ctx) => {
        // Insert first document
        const doc1 = await testItem(ctx, { name: 'first', value: 10 });
        await aggregate.insert(ctx, doc1);

        // Insert second document
        const doc2 = await testItem(ctx, { name: 'second', value: 20 });
        await aggregate.insert(ctx, doc2);
      });

      const result = await exec();
      expect(result).toBe(2);
    });

    test('should paginate a single undefined namespace', async () => {
      await runWithOrm(t, async (ctx) => {
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: 'name', value: 1 })
        );
        let count = 0;
        for await (const namespace of aggregate.iterNamespaces(ctx)) {
          expect(namespace).toBe(undefined);
          count++;
        }
        expect(count).toBe(1);
      });
    });
  });

  describe('countBatch', () => {
    let t: ConvexTest;

    const { aggregate } = createAggregates();

    beforeEach(() => {
      t = setupTest();
    });

    test('should count zero items in empty table', async () => {
      await runWithOrm(t, async (ctx) => {
        const result = await aggregate.countBatch(ctx, [
          { bounds: { lower: { key: 0, inclusive: true } } },
          { bounds: { lower: { key: 0, inclusive: false } } },
        ]);
        expect(result.length).toBe(2);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        const result2 = await aggregate.countBatch(ctx, [{}, {}]);
        expect(result2.length).toBe(2);
        expect(result2[0]).toBe(0);
        expect(result2[1]).toBe(0);
      });
    });

    test('should count two items after inserting two documents', async () => {
      await runWithOrm(t, async (ctx) => {
        const item1 = await testItem(ctx, { name: 'name', value: 1 });
        await aggregate.insert(ctx, item1);
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: 'name', value: 2 })
        );
        const result = await aggregate.countBatch(ctx, [
          { bounds: { lower: { key: 1, inclusive: true } } },
        ]);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(2);
        const result2 = await aggregate.countBatch(ctx, [
          {
            bounds: {
              lower: { key: 1, id: item1._id, inclusive: false },
              upper: { key: 2, inclusive: true },
            },
          },
        ]);
        expect(result2.length).toBe(1);
        expect(result2[0]).toBe(1);
      });
    });
  });

  describe('sumBatch', () => {
    let t: ConvexTest;

    const { aggregate } = createAggregates();

    beforeEach(() => {
      t = setupTest();
    });

    test('should sum zero in empty table', async () => {
      await runWithOrm(t, async (ctx) => {
        const result = await aggregate.sumBatch(ctx, [
          { bounds: { lower: { key: 0, inclusive: true } } },
          { bounds: { lower: { key: 0, inclusive: false } } },
        ]);
        expect(result.length).toBe(2);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        const result2 = await aggregate.sumBatch(ctx, [{}, {}]);
        expect(result2.length).toBe(2);
        expect(result2[0]).toBe(0);
        expect(result2[1]).toBe(0);
      });
    });

    test('should sum items with different sumValues across multiple ranges', async () => {
      await runWithOrm(t, async (ctx) => {
        const item1 = await testItem(ctx, { name: 'name', value: 10 });
        await aggregate.insert(ctx, item1);
        const item2 = await testItem(ctx, { name: 'name', value: 20 });
        await aggregate.insert(ctx, item2);
        const item3 = await testItem(ctx, { name: 'name', value: 30 });
        await aggregate.insert(ctx, item3);

        const result = await aggregate.sumBatch(ctx, [
          { bounds: { lower: { key: 10, inclusive: true } } }, // All items: 10 + 20 + 30 = 60
          { bounds: { lower: { key: 20, inclusive: true } } }, // Items 2,3: 20 + 30 = 50
          {
            bounds: {
              lower: { key: 10, inclusive: true },
              upper: { key: 20, inclusive: true },
            },
          }, // Items 1,2: 10 + 20 = 30
        ]);
        expect(result.length).toBe(3);
        expect(result[0]).toBe(60);
        expect(result[1]).toBe(50);
        expect(result[2]).toBe(30);
      });
    });

    test('should handle exclusive bounds correctly', async () => {
      await runWithOrm(t, async (ctx) => {
        const item1 = await testItem(ctx, { name: 'name', value: 100 });
        await aggregate.insert(ctx, item1);
        const item2 = await testItem(ctx, { name: 'name', value: 200 });
        await aggregate.insert(ctx, item2);

        const result = await aggregate.sumBatch(ctx, [
          {
            bounds: {
              lower: { key: 100, id: item1._id, inclusive: false },
              upper: { key: 200, inclusive: true },
            },
          }, // Only item2: 200
        ]);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(200);
      });
    });
  });

  describe('atBatch', () => {
    const { aggregate } = createAggregates();

    let t: ConvexTest;
    beforeEach(() => {
      t = setupTest();
    });

    test('should find the only item in a single item table', async () => {
      await runWithOrm(t, async (ctx) => {
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: 'name', value: 1 })
        );
        const result = await aggregate.atBatch(ctx, [{ offset: 0 }]);
        expect(result.length).toBe(1);
        expect(result[0].key).toBe(1);
        expect(result[0].sumValue).toBe(1);
      });
    });
  });

  describe('clearAll', () => {
    let t: ConvexTest;
    let aggregate: ReturnType<typeof createAggregates>['aggregate'];

    beforeEach(() => {
      vi.useFakeTimers();
      t = setupTest();
      ({ aggregate } = createAggregates());
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const exec = async (_aggregate = aggregate) => {
      await runWithOrm(t, async (ctx) => {
        await _aggregate.clearAll(ctx);
      });
      // Wait for scheduled cleanup functions to complete
      // if we dont do this vitest will hang
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    };

    test('should clear all data when called on empty aggregate', async () => {
      await exec();

      const result = await runWithOrm(
        t,
        async (ctx) => await aggregate.count(ctx)
      );

      expect(result).toBe(0);
    });

    test('should clear twice all data when called on empty aggregate', async () => {
      await exec();

      // This used to error, but now it doesn't
      await exec();

      const result = await runWithOrm(
        t,
        async (ctx) => await aggregate.count(ctx)
      );

      expect(result).toBe(0);
    });

    test('should clear all data after inserting documents', async () => {
      // Insert some test documents
      await runWithOrm(t, async (ctx) => {
        const id1 = await ctx.db.insert('testItems', {
          name: 'first',
          value: 10,
        });
        const doc1 = await ctx.db.get(id1);
        await aggregate.insert(ctx, doc1!);

        const id2 = await ctx.db.insert('testItems', {
          name: 'second',
          value: 20,
        });
        const doc2 = await ctx.db.get(id2);
        await aggregate.insert(ctx, doc2!);

        const id3 = await ctx.db.insert('testItems', {
          name: 'third',
          value: 30,
        });
        const doc3 = await ctx.db.get(id3);
        await aggregate.insert(ctx, doc3!);
      });

      // Verify data exists
      const countBefore = await runWithOrm(
        t,
        async (ctx) => await aggregate.count(ctx)
      );
      expect(countBefore).toBe(3);

      // Clear all data
      await exec();

      // Verify data is cleared
      const countAfter = await runWithOrm(
        t,
        async (ctx) => await aggregate.count(ctx)
      );
      expect(countAfter).toBe(0);

      // Verify we can call clearAll again without errors
      await exec();

      const countAfterSecondClear = await runWithOrm(
        t,
        async (ctx) => await aggregate.count(ctx)
      );
      expect(countAfterSecondClear).toBe(0);
    });
  });
});

describe('TableAggregate with namespace', () => {
  let t: ConvexTest;
  let aggregateWithNamespace: ReturnType<
    typeof createAggregates
  >['aggregateWithNamespace'];

  beforeEach(() => {
    t = setupTest();
    ({ aggregateWithNamespace } = createAggregates());
  });

  describe('count', () => {
    test('should allow count with namespace only (no bounds)', async () => {
      // With the updated type system, bounds are now optional even with namespace
      const result = await runWithOrm(t, async (ctx) => {
        // This should work - namespace only, no bounds required
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'album1',
        });
      });

      expect(result).toBe(0);
    });

    test('should allow count with namespace and bounds', async () => {
      // You can still provide bounds if you want to
      const result = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'album1',
            bounds: { lower: { key: 0, inclusive: true } },
          })
      );

      expect(result).toBe(0);
    });

    test('should demonstrate namespace requirement with actual data', async () => {
      // Insert some test photos in different albums
      await runWithOrm(t, async (ctx) => {
        const id1 = await ctx.db.insert('photos', {
          album: 'vacation',
          url: 'photo1.jpg',
          score: 10,
        });
        const doc1 = await ctx.db.get(id1);
        await aggregateWithNamespace.insert(ctx, doc1!);

        const id2 = await ctx.db.insert('photos', {
          album: 'vacation',
          url: 'photo2.jpg',
          score: 20,
        });
        const doc2 = await ctx.db.get(id2);
        await aggregateWithNamespace.insert(ctx, doc2!);

        const id3 = await ctx.db.insert('photos', {
          album: 'family',
          url: 'photo3.jpg',
          score: 30,
        });
        const doc3 = await ctx.db.get(id3);
        await aggregateWithNamespace.insert(ctx, doc3!);
      });

      // Count photos in "vacation" album - bounds no longer required
      const vacationCount = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
          })
      );

      expect(vacationCount).toBe(2);

      // Count photos in "family" album
      const familyCount = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'family',
          })
      );

      expect(familyCount).toBe(1);

      // You can still use bounds if you want to limit the range within a namespace
      const vacationCountWithBounds = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
            bounds: {},
          })
      );

      expect(vacationCountWithBounds).toBe(2);
    });

    test('should respect bounds when provided with namespace', async () => {
      // Insert photos with explicit scores for predictable bounds testing
      await runWithOrm(t, async (ctx) => {
        const doc1 = { album: 'vacation', url: 'photo1.jpg', score: 10 };
        const doc2 = { album: 'vacation', url: 'photo2.jpg', score: 20 };
        const doc3 = { album: 'vacation', url: 'photo3.jpg', score: 30 };

        const id1 = await ctx.db.insert('photos', doc1);
        const id2 = await ctx.db.insert('photos', doc2);
        const id3 = await ctx.db.insert('photos', doc3);

        const insertedDoc1 = await ctx.db.get(id1);
        const insertedDoc2 = await ctx.db.get(id2);
        const insertedDoc3 = await ctx.db.get(id3);

        await aggregateWithNamespace.insert(ctx, insertedDoc1!);
        await aggregateWithNamespace.insert(ctx, insertedDoc2!);
        await aggregateWithNamespace.insert(ctx, insertedDoc3!);
      });

      // Count all photos in vacation album (no bounds)
      const totalCount = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
          })
      );
      expect(totalCount).toBe(3);

      // Count with lower bound - should exclude first photo (score 10)
      const countFromSecond = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
            bounds: {
              lower: { key: 20, inclusive: true },
            },
          })
      );
      expect(countFromSecond).toBe(2); // photos with score 20 and 30

      // Count with upper bound - should exclude third photo (score 30)
      const countUpToSecond = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
            bounds: {
              upper: { key: 20, inclusive: true },
            },
          })
      );
      expect(countUpToSecond).toBe(2); // photos with score 10 and 20

      // Count with both bounds - should only include middle photo
      const countMiddleOnly = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
            bounds: {
              lower: { key: 20, inclusive: true },
              upper: { key: 20, inclusive: true },
            },
          })
      );
      expect(countMiddleOnly).toBe(1); // only photo with score 20

      // Test simple lower bound
      const countWithLowerBound = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: {
            lower: { key: 25, inclusive: true }, // Should only include photo with score 30
          },
        });
      });
      expect(countWithLowerBound).toBe(1); // Only photo with score 30

      // Test upper bound
      const countWithUpperBound = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: {
            upper: { key: 15, inclusive: true }, // Should only include photo with score 10
          },
        });
      });
      expect(countWithUpperBound).toBe(1); // Only photo with score 10
    });

    test('comprehensive bounds and namespace test', async () => {
      // Insert test data across multiple namespaces
      await runWithOrm(t, async (ctx) => {
        // Vacation album photos
        const vacation1 = { album: 'vacation', url: 'v1.jpg', score: 5 };
        const vacation2 = { album: 'vacation', url: 'v2.jpg', score: 15 };
        const vacation3 = { album: 'vacation', url: 'v3.jpg', score: 25 };

        // Family album photos
        const family1 = { album: 'family', url: 'f1.jpg', score: 10 };
        const family2 = { album: 'family', url: 'f2.jpg', score: 20 };

        for (const doc of [vacation1, vacation2, vacation3, family1, family2]) {
          const id = await ctx.db.insert('photos', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregateWithNamespace.insert(ctx, insertedDoc!);
        }
      });

      // Test: Count all vacation photos (no bounds required!)
      const allVacationCount = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'vacation',
          })
      );
      expect(allVacationCount).toBe(3);

      // Test: Count all family photos (no bounds required!)
      const allFamilyCount = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'family',
          })
      );
      expect(allFamilyCount).toBe(2);

      // Test: Count vacation photos with bounds - only high scores
      const highScoreVacationCount = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: {
            lower: { key: 20, inclusive: true }, // score >= 20
          },
        });
      });
      expect(highScoreVacationCount).toBe(1); // Only score 25

      // Test: Count family photos with bounds - only low scores
      const lowScoreFamilyCount = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'family',
          bounds: {
            upper: { key: 15, inclusive: true }, // score <= 15
          },
        });
      });
      expect(lowScoreFamilyCount).toBe(1); // Only score 10
    });

    test('should isolate bounds within different namespaces', async () => {
      await runWithOrm(t, async (ctx) => {
        // Insert photo in vacation album with score 15
        const vacationDoc = {
          album: 'vacation',
          url: 'vacation1.jpg',
          score: 15,
        };
        const vacationId = await ctx.db.insert('photos', vacationDoc);
        const insertedVacationDoc = await ctx.db.get(vacationId);
        await aggregateWithNamespace.insert(ctx, insertedVacationDoc!);

        // Insert photo in family album with score 25
        const familyDoc = { album: 'family', url: 'family1.jpg', score: 25 };
        const familyId = await ctx.db.insert('photos', familyDoc);
        const insertedFamilyDoc = await ctx.db.get(familyId);
        await aggregateWithNamespace.insert(ctx, insertedFamilyDoc!);
      });

      // Using bounds that would exclude family photo shouldn't affect family namespace count
      const familyCount = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'family',
          bounds: {
            upper: { key: 20, inclusive: true }, // Family photo has score 25, so this excludes it
          },
        });
      });
      expect(familyCount).toBe(0);

      // Count family photos without bounds should still work
      const familyCountNoBounds = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithNamespace.count(ctx, {
            namespace: 'family',
          })
      );
      expect(familyCountNoBounds).toBe(1);

      // Count vacation photos with bounds that would include family photo score
      const vacationCount = await runWithOrm(t, async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: {
            upper: { key: 30, inclusive: true }, // Would include family score, but family is different namespace
          },
        });
      });
      // Should be 1 - only the vacation photo, not affected by family photo
      expect(vacationCount).toBe(1);
    });
  });

  describe('inclusive bounds behavior', () => {
    let t: ConvexTest;
    let aggregate: ReturnType<typeof createAggregates>['aggregate'];

    beforeEach(() => {
      t = setupTest();
      ({ aggregate } = createAggregates());
    });

    test('should respect inclusive vs exclusive lower bounds', async () => {
      await runWithOrm(t, async (ctx) => {
        const docs = [
          { name: 'item1', value: 10 },
          { name: 'item2', value: 20 },
          { name: 'item3', value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert('testItems', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveLower = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: true },
            },
          })
      );
      expect(countInclusiveLower).toBe(2);

      const countExclusiveLower = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: false },
            },
          })
      );
      expect(countExclusiveLower).toBe(1);
    });

    test('should respect inclusive vs exclusive upper bounds', async () => {
      await runWithOrm(t, async (ctx) => {
        const docs = [
          { name: 'item1', value: 10 },
          { name: 'item2', value: 20 },
          { name: 'item3', value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert('testItems', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveUpper = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              upper: { key: 20, inclusive: true },
            },
          })
      );
      expect(countInclusiveUpper).toBe(2);

      const countExclusiveUpper = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              upper: { key: 20, inclusive: false },
            },
          })
      );
      expect(countExclusiveUpper).toBe(1);
    });

    test('should respect inclusive vs exclusive bounds with both lower and upper', async () => {
      await runWithOrm(t, async (ctx) => {
        const docs = [
          { name: 'item1', value: 10 },
          { name: 'item2', value: 20 },
          { name: 'item3', value: 30 },
          { name: 'item4', value: 40 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert('testItems', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countBothInclusive = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: true },
              upper: { key: 30, inclusive: true },
            },
          })
      );
      expect(countBothInclusive).toBe(2);

      const countBothExclusive = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: false },
              upper: { key: 30, inclusive: false },
            },
          })
      );
      expect(countBothExclusive).toBe(0);

      const countMixed1 = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: true },
              upper: { key: 30, inclusive: false },
            },
          })
      );
      expect(countMixed1).toBe(1);

      const countMixed2 = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: false },
              upper: { key: 30, inclusive: true },
            },
          })
      );
      expect(countMixed2).toBe(1);
    });

    test('should respect inclusive bounds with exact boundary matches', async () => {
      await runWithOrm(t, async (ctx) => {
        const docs = [
          { name: 'item1', value: 15 },
          { name: 'item2', value: 20 },
          { name: 'item3', value: 20 },
          { name: 'item4', value: 25 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert('testItems', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveLowerDupe = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: true },
            },
          })
      );
      expect(countInclusiveLowerDupe).toBe(3);

      const countExclusiveLowerDupe = await runWithOrm(
        t,
        async (ctx) =>
          await aggregate.count(ctx, {
            bounds: {
              lower: { key: 20, inclusive: false },
            },
          })
      );
      expect(countExclusiveLowerDupe).toBe(1);
    });

    test('should respect inclusive bounds with array keys', async () => {
      const aggregateWithArrayKeys = new TableAggregate<{
        Key: [number, string];
        DataModel: DataModel;
        TableName: 'testItems';
      }>({
        name: 'runtimeInclusiveArrayBounds',
        table: 'testItems',
        sortKey: (doc) => [doc.value, doc.name],
      });

      await runWithOrm(t, async (ctx) => {
        const docs = [
          { name: 'a', value: 10 },
          { name: 'b', value: 20 },
          { name: 'c', value: 20 },
          { name: 'd', value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert('testItems', doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregateWithArrayKeys.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveArrayLower = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithArrayKeys.count(ctx, {
            bounds: {
              lower: { key: [20, 'b'], inclusive: true },
            },
          })
      );
      expect(countInclusiveArrayLower).toBe(3);

      const countExclusiveArrayLower = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithArrayKeys.count(ctx, {
            bounds: {
              lower: { key: [20, 'b'], inclusive: false },
            },
          })
      );
      expect(countExclusiveArrayLower).toBe(2);

      const countInclusiveArrayUpper = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithArrayKeys.count(ctx, {
            bounds: {
              upper: { key: [20, 'c'], inclusive: true },
            },
          })
      );
      expect(countInclusiveArrayUpper).toBe(3);

      const countExclusiveArrayUpper = await runWithOrm(
        t,
        async (ctx) =>
          await aggregateWithArrayKeys.count(ctx, {
            bounds: {
              upper: { key: [20, 'c'], inclusive: false },
            },
          })
      );
      expect(countExclusiveArrayUpper).toBe(2);
    });
  });
});

describe('Bounds with eq', () => {
  let t: ConvexTest;
  let aggregate: ReturnType<typeof createAggregates>['aggregate'];

  beforeEach(() => {
    t = setupTest();
    ({ aggregate } = createAggregates());
  });

  test('should count items with eq bound on non-array key', async () => {
    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'item1', value: 10 },
        { name: 'item2', value: 20 },
        { name: 'item3', value: 20 },
        { name: 'item4', value: 30 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregate.insert(ctx, insertedDoc!);
      }
    });

    // Test eq bound - should only count items with exact key value
    const countEq20 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.count(ctx, {
          bounds: { eq: 20 },
        })
    );
    expect(countEq20).toBe(2); // Two items with value 20

    const countEq10 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.count(ctx, {
          bounds: { eq: 10 },
        })
    );
    expect(countEq10).toBe(1); // One item with value 10

    const countEq30 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.count(ctx, {
          bounds: { eq: 30 },
        })
    );
    expect(countEq30).toBe(1); // One item with value 30

    const countEq40 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.count(ctx, {
          bounds: { eq: 40 },
        })
    );
    expect(countEq40).toBe(0); // No items with value 40
  });

  test('should sum items with eq bound on non-array key', async () => {
    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'item1', value: 15 },
        { name: 'item2', value: 15 },
        { name: 'item3', value: 25 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregate.insert(ctx, insertedDoc!);
      }
    });

    const sumEq15 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.sum(ctx, {
          bounds: { eq: 15 },
        })
    );
    expect(sumEq15).toBe(30); // 15 + 15 = 30

    const sumEq25 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.sum(ctx, {
          bounds: { eq: 25 },
        })
    );
    expect(sumEq25).toBe(25);

    const sumEq100 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.sum(ctx, {
          bounds: { eq: 100 },
        })
    );
    expect(sumEq100).toBe(0); // No items with value 100
  });

  test('should work with eq bound on array keys', async () => {
    const aggregateWithArrayKeys = new TableAggregate<{
      Key: [number, string];
      DataModel: DataModel;
      TableName: 'testItems';
    }>({
      name: 'runtimeEqArrayBounds',
      table: 'testItems',
      sortKey: (doc) => [doc.value, doc.name],
      sumValue: (doc) => doc.value,
    });

    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'a', value: 10 },
        { name: 'b', value: 20 },
        { name: 'c', value: 20 },
        { name: 'd', value: 30 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregateWithArrayKeys.insert(ctx, insertedDoc!);
      }
    });

    // Test eq bound with exact array match
    const countEqArray = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { eq: [20, 'b'] },
        })
    );
    expect(countEqArray).toBe(1); // Only one item with exact key [20, "b"]

    const countEqArray2 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { eq: [20, 'c'] },
        })
    );
    expect(countEqArray2).toBe(1); // Only one item with exact key [20, "c"]

    const countEqArrayNonExistent = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { eq: [20, 'z'] },
        })
    );
    expect(countEqArrayNonExistent).toBe(0); // No items with key [20, "z"]
  });

  test('should work with eq bound and namespace', async () => {
    const { aggregateWithNamespace } = createAggregates();

    await runWithOrm(t, async (ctx) => {
      const docs = [
        { album: 'vacation', url: 'photo1.jpg', score: 10 },
        { album: 'vacation', url: 'photo2.jpg', score: 20 },
        { album: 'vacation', url: 'photo3.jpg', score: 20 },
        { album: 'family', url: 'photo4.jpg', score: 20 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('photos', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregateWithNamespace.insert(ctx, insertedDoc!);
      }
    });

    // Test eq bound within vacation namespace
    const vacationCountEq20 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: { eq: 20 },
        })
    );
    expect(vacationCountEq20).toBe(2); // Two vacation photos with score 20

    // Test eq bound within family namespace
    const familyCountEq20 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithNamespace.count(ctx, {
          namespace: 'family',
          bounds: { eq: 20 },
        })
    );
    expect(familyCountEq20).toBe(1); // One family photo with score 20

    // Test eq bound with non-existent value in namespace
    const vacationCountEq100 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithNamespace.count(ctx, {
          namespace: 'vacation',
          bounds: { eq: 100 },
        })
    );
    expect(vacationCountEq100).toBe(0);
  });

  test('should use eq bounds in batch operations', async () => {
    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'item1', value: 10 },
        { name: 'item2', value: 20 },
        { name: 'item3', value: 20 },
        { name: 'item4', value: 30 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregate.insert(ctx, insertedDoc!);
      }
    });

    // Test countBatch with multiple eq bounds
    const counts = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.countBatch(ctx, [
          { bounds: { eq: 10 } },
          { bounds: { eq: 20 } },
          { bounds: { eq: 30 } },
          { bounds: { eq: 40 } },
        ])
    );
    expect(counts).toEqual([1, 2, 1, 0]);

    // Test sumBatch with eq bounds
    const sums = await runWithOrm(
      t,
      async (ctx) =>
        await aggregate.sumBatch(ctx, [
          { bounds: { eq: 10 } },
          { bounds: { eq: 20 } },
          { bounds: { eq: 30 } },
        ])
    );
    expect(sums).toEqual([10, 40, 30]);
  });
});

describe('Bounds with prefix on array keys', () => {
  let t: ConvexTest;

  beforeEach(() => {
    t = setupTest();
  });

  test('should still work with prefix bounds on array keys', async () => {
    const aggregateWithArrayKeys = new TableAggregate<{
      Key: [number, string];
      DataModel: DataModel;
      TableName: 'testItems';
    }>({
      name: 'runtimePrefixArrayCount',
      table: 'testItems',
      sortKey: (doc) => [doc.value, doc.name],
      sumValue: (doc) => doc.value,
    });

    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'a', value: 10 },
        { name: 'b', value: 10 },
        { name: 'c', value: 20 },
        { name: 'd', value: 20 },
        { name: 'e', value: 30 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregateWithArrayKeys.insert(ctx, insertedDoc!);
      }
    });

    // Test prefix bound - should match all items with value 10
    const countPrefix10 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { prefix: [10] },
        })
    );
    expect(countPrefix10).toBe(2); // Two items with first element 10

    const countPrefix20 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { prefix: [20] },
        })
    );
    expect(countPrefix20).toBe(2); // Two items with first element 20

    // Test empty prefix - should match all items
    const countPrefixEmpty = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { prefix: [] },
        })
    );
    expect(countPrefixEmpty).toBe(5); // All items

    // Test full prefix - should match exact item
    const countPrefixFull = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.count(ctx, {
          bounds: { prefix: [10, 'a'] },
        })
    );
    expect(countPrefixFull).toBe(1); // Only [10, "a"]
  });

  test('should sum with prefix bounds on array keys', async () => {
    const aggregateWithArrayKeys = new TableAggregate<{
      Key: [number, string];
      DataModel: DataModel;
      TableName: 'testItems';
    }>({
      name: 'runtimePrefixArraySum',
      table: 'testItems',
      sortKey: (doc) => [doc.value, doc.name],
      sumValue: (doc) => doc.value,
    });

    await runWithOrm(t, async (ctx) => {
      const docs = [
        { name: 'a', value: 10 },
        { name: 'b', value: 10 },
        { name: 'c', value: 20 },
      ];

      for (const doc of docs) {
        const id = await ctx.db.insert('testItems', doc);
        const insertedDoc = await ctx.db.get(id);
        await aggregateWithArrayKeys.insert(ctx, insertedDoc!);
      }
    });

    const sumPrefix10 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.sum(ctx, {
          bounds: { prefix: [10] },
        })
    );
    expect(sumPrefix10).toBe(20); // 10 + 10 = 20

    const sumPrefix20 = await runWithOrm(
      t,
      async (ctx) =>
        await aggregateWithArrayKeys.sum(ctx, {
          bounds: { prefix: [20] },
        })
    );
    expect(sumPrefix20).toBe(20);
  });
});
