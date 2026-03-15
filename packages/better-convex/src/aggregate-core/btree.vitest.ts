/* biome-ignore-all lint: Upstream aggregate parity tests intentionally keep original structure. */
import { fc, test as fcTest } from '@fast-check/vitest';
import { ConvexError, convexToJson, jsonToConvex } from 'convex/values';
import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../convex/setup.testing';
import { arbitraryValue } from './arbitrary.helpers.js';
import {
  aggregateBetweenBatchHandler,
  aggregateBetweenHandler,
  atNegativeOffsetHandler,
  atOffsetBatchHandler,
  atOffsetHandler,
  deleteHandler,
  getHandler,
  getOrCreateTree,
  insertHandler,
  offsetHandler,
  offsetUntilHandler,
  paginateHandler,
  paginateNamespacesHandler,
  type Value,
  validateTree,
} from './btree.js';
import { compareValues } from './compare.js';
import schema, { type Item } from './schema.fixture.js';

describe('btree', () => {
  test('insert', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      // Insert lots of keys. At each stage, the tree is valid.
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      await insert(1, 'a');
      await insert(4, 'b');
      await insert(3, 'c');
      await insert(2, 'd');
      await insert(5, 'e');
      await insert(6, 'e');
      await insert(7, 'e');
      await insert(10, 'e');
      await insert(0, 'e');
      await insert(-1, 'e');
      await insert(9, 'e');
      await insert(8, 'e');
    });
  });

  test('delete', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      // Delete keys. At each stage, the tree is valid.
      async function del(key: number) {
        await deleteHandler(ctx, { key });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toBeNull();
      }
      await insert(1, 'a');
      await insert(2, 'b');
      await del(1);
      await del(2);
      await insert(1, 'a');
      await insert(2, 'a');
      await insert(3, 'c');
      await insert(4, 'd');
      await insert(5, 'e');
      await del(3);
      await insert(6, 'e');
      await insert(7, 'e');
      await insert(10, 'e');
      await insert(0, 'e');
      await insert(-1, 'e');
      await insert(9, 'e');
      await insert(8, 'e');
      await del(-1);
      await del(6);
      await del(7);
      await del(0);
    });
  });

  test('atOffset and offsetOf', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const rank = await offsetHandler(ctx, { key });
        expect(rank).not.toBeNull();
        const atIndex = await atOffsetHandler(ctx, {
          offset: rank!,
        });
        expect(atIndex).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      async function checkRank(key: number, rank: number) {
        const r = await offsetHandler(ctx, { key });
        expect(r).toEqual(rank);
        const atOffset = await atOffsetHandler(ctx, { offset: rank });
        expect(atOffset.k).toEqual(key);
      }
      await insert(1, 'a');
      await insert(4, 'b');
      await insert(3, 'c');
      await insert(2, 'd');
      await insert(5, 'e');
      await insert(6, 'e');
      await insert(7, 'e');
      await insert(10, 'e');
      await insert(0, 'e');
      await insert(-1, 'e');
      await insert(9, 'e');
      await insert(8, 'e');
      await checkRank(-1, 0);
      await checkRank(10, 11);
      await checkRank(5, 6);
    });
  });

  test('countBetween', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
      }
      async function countBetween(
        k1: number | undefined,
        k2: number | undefined,
        count: number
      ) {
        const c = await aggregateBetweenHandler(ctx, { k1, k2 });
        expect(c).toEqual({
          count,
          sum: 0,
        });
      }
      await insert(0, 'a');
      await insert(1, 'a');
      await insert(2, 'd');
      await insert(3, 'c');
      await insert(4, 'b');
      await insert(5, 'e');
      await insert(6, 'e');
      await insert(7, 'e');
      await insert(8, 'e');
      await insert(9, 'e');
      await countBetween(-1, 10, 10);
      await countBetween(undefined, undefined, 10);
      await countBetween(4, 6, 1);
      await countBetween(0.5, 8.5, 8);
      await countBetween(6, 9, 2);
    });
  });

  test('sums', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string, summand: number) {
        const { sum: sumBefore } = await aggregateBetweenHandler(ctx, {});
        await insertHandler(ctx, { key, value, summand });
        await validateTree(ctx, {});
        const { sum: sumAfter } = await aggregateBetweenHandler(ctx, {});
        expect(sumAfter).toEqual(sumBefore + summand);
      }
      async function del(key: number) {
        const { sum: sumBefore } = await aggregateBetweenHandler(ctx, {});
        const itemBefore = await getHandler(ctx, { key });
        expect(itemBefore).not.toBeNull();
        await deleteHandler(ctx, { key });
        await validateTree(ctx, {});
        const { sum: sumAfter } = await aggregateBetweenHandler(ctx, {});
        expect(sumAfter).toEqual(sumBefore - itemBefore!.s);
      }
      await insert(1, 'a', 1);
      await insert(4, 'b', 2);
      await insert(3, 'c', 3);
      await insert(2, 'd', 4);
      await insert(5, 'e', 5);
      await insert(6, 'e', 6);
      await del(3);
      await del(2);
      await del(1);
      await del(5);
      await del(4);
    });
  });

  fcTest.prop({
    writes: fc.array(arbitraryWrite, { minLength: 0, maxLength: 20 }),
    aggregateQueries: fc.array(
      fc.record({
        k1: fc.option(arbitraryValue, { nil: undefined }),
        k2: fc.option(arbitraryValue, { nil: undefined }),
        namespace: fc.option(fc.string(), { nil: undefined }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  })(
    'batch functions match individual calls',
    async ({ writes, aggregateQueries }) => {
      const except = async (f: () => Promise<void>) => {
        try {
          await f();
          return false;
        } catch (e) {
          if (e instanceof ConvexError) {
            return true;
          }
          throw e;
        }
      };
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await getOrCreateTree(ctx.db, undefined, 4, false);
        const simple = new SimpleBTree();

        for (const write of writes) {
          if (write.type === 'insert') {
            expect(await except(() => insertHandler(ctx, write))).toStrictEqual(
              await except(async () =>
                simple.insert({
                  k: write.key,
                  v: write.value,
                  s: write.summand,
                })
              )
            );
          } else if (write.type === 'delete') {
            expect(await except(() => deleteHandler(ctx, write))).toStrictEqual(
              await except(async () => simple.delete(write.key))
            );
          }
        }

        if (aggregateQueries.length > 0) {
          const batchResults = await aggregateBetweenBatchHandler(ctx, {
            queries: aggregateQueries,
          });
          expect(batchResults).toHaveLength(aggregateQueries.length);

          for (let i = 0; i < aggregateQueries.length; i++) {
            const individualResult = await aggregateBetweenHandler(
              ctx,
              aggregateQueries[i]
            );
            expect(batchResults[i]).toEqual(individualResult);
          }
        }

        const totalCount = simple.count();
        if (totalCount > 0) {
          const offsetQueries = [
            { offset: 0, k1: undefined, k2: undefined, namespace: undefined },
            {
              offset: Math.floor(totalCount / 2),
              k1: undefined,
              k2: undefined,
              namespace: undefined,
            },
          ].filter((q) => q.offset < totalCount);

          if (offsetQueries.length > 0) {
            const batchResults = await atOffsetBatchHandler(ctx, {
              queries: offsetQueries,
            });
            expect(batchResults).toHaveLength(offsetQueries.length);

            for (let i = 0; i < offsetQueries.length; i++) {
              const individualResult = await atOffsetHandler(
                ctx,
                offsetQueries[i]
              );
              expect(batchResults[i]).toEqual(individualResult);
            }
          }

          const negativeOffsetQueries = [
            { offset: -1, k1: undefined, k2: undefined, namespace: undefined },
          ];

          let batchError = false;

          let batchResults: any = null;
          try {
            batchResults = await atOffsetBatchHandler(ctx, {
              queries: negativeOffsetQueries,
            });
          } catch (e) {
            if (e instanceof ConvexError) {
              batchError = true;
            } else {
              throw e;
            }
          }

          let individualError = false;
          let individualResults: any = null;
          try {
            individualResults = await Promise.all(
              negativeOffsetQueries.map((query) =>
                query.offset >= 0
                  ? atOffsetHandler(ctx, query)
                  : atNegativeOffsetHandler(ctx, {
                      ...query,
                      offset: -query.offset - 1,
                    })
              )
            );
          } catch (e) {
            if (e instanceof ConvexError) {
              individualError = true;
            } else {
              throw e;
            }
          }

          expect(batchError).toStrictEqual(individualError);
          if (!batchError && !individualError) {
            expect(batchResults).toEqual(individualResults);
          }
        }
      });
    }
  );
});

describe('namespaced btree', () => {
  test('counts', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, 'a', 4, false);
      await getOrCreateTree(ctx.db, 'b', 4, false);
      async function insert(namespace: string, key: number, value: string) {
        await insertHandler(ctx, { key, value, namespace });
        await validateTree(ctx, { namespace });
      }
      async function count(namespace: string, count: number) {
        const c = await aggregateBetweenHandler(ctx, { namespace });
        expect(c).toEqual({
          count,
          sum: 0,
        });
      }
      await insert('a', 1, 'a');
      await insert('a', 4, 'b');
      await insert('a', 3, 'c');
      await insert('a', 2, 'd');
      await insert('a', 5, 'e');
      await insert('b', 6, 'e');
      await insert('b', 7, 'e');
      await insert('b', 10, 'e');
      await insert('b', 0, 'e');
      await count('a', 5);
      await count('b', 4);
    });
  });
});

class SimpleBTree {
  private items: Item[] = [];
  constructor() {}
  sort() {
    this.items.sort((a, b) => compareValues(a.k, b.k));
  }
  get(key: Value) {
    for (const item of this.items) {
      if (compareValues(item.k, key) === 0) {
        return item;
      }
    }
    return null;
  }
  insert(item: Item) {
    if (this.get(item.k) !== null) {
      throw new ConvexError('Key already exists');
    }
    this.items.push(item);
    this.sort();
  }
  delete(key: Value) {
    if (this.get(key) === null) {
      throw new ConvexError('Key does not exist');
    }
    this.items = this.items.filter((item) => compareValues(item.k, key) !== 0);
  }
  offsetOf(key: Value, k1?: Value) {
    const items = this.itemsBetween(k1);
    for (let i = 0; i < items.length; i++) {
      if (compareValues(items[i].k, key) >= 0) {
        return i;
      }
    }
    return items.length;
  }
  offsetUntil(key: Value, k2?: Value) {
    const items = this.itemsBetween(undefined, k2);
    for (let i = 0; i < items.length; i++) {
      if (compareValues(items[items.length - i - 1].k, key) <= 0) {
        return i;
      }
    }
    return items.length;
  }
  itemsBetween(k1?: Value, k2?: Value) {
    const items = [];
    for (const item of this.items) {
      if (
        (k1 === undefined || compareValues(item.k, k1) > 0) &&
        (k2 === undefined || compareValues(item.k, k2) < 0)
      ) {
        items.push(item);
      }
    }
    return items;
  }
  countBetween(k1?: Value, k2?: Value) {
    return this.itemsBetween(k1, k2).length;
  }
  sumBetween(k1?: Value, k2?: Value) {
    return this.itemsBetween(k1, k2).reduce((sum, item) => sum + item.s, 0);
  }
  count() {
    return this.items.length;
  }
  sum() {
    return this.items.reduce((sum, item) => sum + item.s, 0);
  }
  paginate(
    limit: number,
    order: 'asc' | 'desc',
    cursor?: string,
    k1?: Value,
    k2?: Value
  ) {
    if (cursor !== undefined && cursor.length === 0) {
      throw new ConvexError('end cursor');
    }
    const startKey =
      cursor === undefined || order === 'desc'
        ? k1
        : jsonToConvex(JSON.parse(cursor));
    const endKey =
      cursor === undefined || order === 'asc'
        ? k2
        : jsonToConvex(JSON.parse(cursor));
    const items = this.itemsBetween(startKey, endKey);
    if (order === 'desc') {
      items.reverse();
    }
    const isDone = items.length <= limit;
    const page = items.slice(0, limit);
    return {
      page,
      cursor: isDone
        ? ''
        : JSON.stringify(convexToJson(page[page.length - 1].k)),
      isDone,
    };
  }
}

function arbitraryUniformFloat(min: number, max: number) {
  // fc.float({min, max}) is not uniform: it skews towards 0 because it picks a
  // random mantissa and exponent.
  return fc
    .integer({ min: min * 1000, max: max * 1000 - 1 })
    .map((i) => i / 1000);
}
// Random between 0 and 1, multiplied by length of an array to get a random
// item in the array.
const arbitrary01 = arbitraryUniformFloat(0, 1);
const l = <L extends string>(l: L) => fc.constant(l);
const arbitraryWrite = fc.oneof(
  fc.record({
    type: l('insert'),
    key: arbitrary01,
    value: arbitrary01,
    summand: arbitraryUniformFloat(-10, 10),
  }),
  fc.record({ type: l('delete'), key: arbitrary01 })
);
const arbitraryRead = fc.oneof(
  fc.record({
    type: l('offsetOf'),
    key: arbitrary01,
    k1: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('atOffset'),
    offset: arbitrary01,
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('atNegativeOffset'),
    offset: arbitrary01,
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('offsetUntil'),
    key: arbitrary01,
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('countBetween'),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('sumBetween'),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l('paginate'),
    limit: fc.integer({ min: 1, max: 10 }),
    order: fc.oneof(l('asc'), l('desc')),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  })
);
type InferArbitrary<T> = T extends fc.Arbitrary<infer U> ? U : never;

describe('btree matches simpler impl', () => {
  async function testBehaviorMatch({
    values,
    writes,
    reads,
    minNodeSize,
    rootLazy,
  }: {
    values: Value[];
    writes: InferArbitrary<typeof arbitraryWrite>[];
    reads: InferArbitrary<typeof arbitraryRead>[];
    minNodeSize: number;
    rootLazy: boolean;
  }) {
    const val = (r: number) => values[Math.floor(r * values.length)];
    const maybeVal = (r: number | null) => (r === null ? undefined : val(r));
    const except = async (f: () => Promise<void>) => {
      try {
        await f();
        return false;
      } catch (e) {
        if (e instanceof ConvexError) {
          return true;
        }
        throw e;
      }
    };
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, minNodeSize * 2, rootLazy);
      const simple = new SimpleBTree();
      // Do a bunch of writes.
      // If there are conflicts on insert and delete, assert they happen on
      // both the simple and complex implementations.
      for (const write of writes) {
        if (write.type === 'insert') {
          expect(
            await except(() =>
              insertHandler(ctx, {
                key: val(write.key),
                value: val(write.value),
                summand: write.summand,
              })
            )
          ).toStrictEqual(
            await except(async () =>
              simple.insert({
                k: val(write.key),
                v: val(write.value),
                s: write.summand,
              })
            )
          );
        } else if (write.type === 'delete') {
          expect(
            await except(() => deleteHandler(ctx, { key: val(write.key) }))
          ).toStrictEqual(
            await except(async () => simple.delete(val(write.key)))
          );
        }
      }
      await validateTree(ctx, {});
      // Do a bunch of reads.
      for (const read of reads) {
        if (read.type === 'atOffset') {
          const itemsBetween = simple.itemsBetween(
            maybeVal(read.k1),
            maybeVal(read.k2)
          );
          if (itemsBetween.length === 0) {
            continue;
          }
          const i = Math.floor(read.offset * itemsBetween.length);
          const at = await atOffsetHandler(ctx, {
            offset: i,
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(at).toEqual(itemsBetween[i]);
        } else if (read.type === 'atNegativeOffset') {
          const itemsBetween = simple.itemsBetween(
            maybeVal(read.k1),
            maybeVal(read.k2)
          );
          if (itemsBetween.length === 0) {
            continue;
          }
          const i = Math.floor(read.offset * itemsBetween.length);
          const at = await atNegativeOffsetHandler(ctx, {
            offset: i,
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(at).toEqual(itemsBetween[itemsBetween.length - i - 1]);
        } else if (read.type === 'offsetOf') {
          const offset = await offsetHandler(ctx, {
            key: val(read.key),
            k1: maybeVal(read.k1),
          });
          expect(offset).toEqual(
            simple.offsetOf(val(read.key), maybeVal(read.k1))
          );
        } else if (read.type === 'offsetUntil') {
          const offset = await offsetUntilHandler(ctx, {
            key: val(read.key),
            k2: maybeVal(read.k2),
          });
          expect(offset).toEqual(
            simple.offsetUntil(val(read.key), maybeVal(read.k2))
          );
        } else if (read.type === 'countBetween') {
          const count = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(count.count).toEqual(
            simple.countBetween(maybeVal(read.k1), maybeVal(read.k2))
          );
        } else if (read.type === 'sumBetween') {
          const sum = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(sum.sum).toBeCloseTo(
            simple.sumBetween(maybeVal(read.k1), maybeVal(read.k2))
          );
        } else if (read.type === 'paginate') {
          let isDone = false;
          let cursor: string | undefined;
          while (!isDone) {
            const realPaginate = await paginateHandler(ctx, {
              limit: read.limit,
              cursor,
              order: read.order,
              k1: maybeVal(read.k1),
              k2: maybeVal(read.k2),
            });
            const simplePaginate = simple.paginate(
              read.limit,
              read.order,
              cursor,
              maybeVal(read.k1),
              maybeVal(read.k2)
            );
            expect(realPaginate.page).toEqual(simplePaginate.page);
            expect(realPaginate.isDone).toStrictEqual(simplePaginate.isDone);
            expect(realPaginate.cursor).toStrictEqual(simplePaginate.cursor);
            isDone = simplePaginate.isDone;
            cursor = simplePaginate.cursor;
          }
        }
      }
    });
  }

  // Trophies
  test('countBetween same keys', async () => {
    await testBehaviorMatch({
      values: [false, null, {}, '', 0],
      writes: [
        { type: 'insert', key: 0.21, value: 0, summand: 0 },
        { type: 'insert', key: 0.41, value: 0, summand: 0 },
        { type: 'insert', key: 0.61, value: 0, summand: 0 },
        { type: 'insert', key: 0, value: 0, summand: 0 },
        { type: 'insert', key: 0.81, value: 0, summand: 0 },
      ],
      reads: [{ type: 'countBetween', k1: 0, k2: 0 }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  test('countBetween 2', async () => {
    await testBehaviorMatch({
      values: [4, 2, 0, 1, 3],
      writes: [
        { type: 'insert', key: 0, value: 0, summand: 0 },
        { type: 'insert', key: 0.2, value: 0, summand: 0 },
        { type: 'insert', key: 0.4, value: 0, summand: 0 },
        { type: 'insert', key: 0.6, value: 0, summand: 0 },
        { type: 'insert', key: 0.8, value: 0, summand: 0 },
      ],
      reads: [{ type: 'countBetween', k1: 0.4, k2: 0.2 }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  test('offsetOf first subtree', async () => {
    await testBehaviorMatch({
      values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      writes: [
        { type: 'insert', key: 0, value: 0, summand: 0 },
        { type: 'insert', key: 0.1, value: 0, summand: 0 },
        { type: 'insert', key: 0.2, value: 0, summand: 0 },
        { type: 'insert', key: 0.3, value: 0, summand: 0 },
        { type: 'insert', key: 0.4, value: 0, summand: 0 },
        { type: 'insert', key: 0.5, value: 0, summand: 0 },
        { type: 'insert', key: 0.6, value: 0, summand: 0 },
        { type: 'insert', key: 0.7, value: 0, summand: 0 },
      ],
      reads: [{ type: 'offsetOf', key: 0.1, k1: null }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  fcTest.prop({
    values: fc.array(arbitraryValue, { minLength: 100, maxLength: 100 }),
    writes: fc.array(arbitraryWrite, { maxLength: 100 }),
    reads: fc.array(arbitraryRead, { maxLength: 20 }),
    minNodeSize: fc.integer({ min: 2, max: 9 }),
    rootLazy: fc.boolean(),
  })(
    'btree operations with arbitrary values match simple btree',
    testBehaviorMatch
  );

  fcTest.prop(
    {
      writes: fc.array(arbitraryWrite, { maxLength: 100 }),
      reads: fc.array(arbitraryRead, { maxLength: 20 }),
    },
    { numRuns: 100 }
  )(
    'btree operations on natural numbers match simple btree',
    async ({ writes, reads }) => {
      await testBehaviorMatch({
        values: Array.from({ length: 100 }, (_, i) => i),
        writes,
        reads,
        minNodeSize: 2,
        rootLazy: true,
      });
    }
  );
});

describe('namespace pagination regression', () => {
  test('does not use collect for aggregate-scoped namespace pagination', async () => {
    const paginate = vi.fn().mockResolvedValue({
      page: [],
      continueCursor: null,
      isDone: true,
    });
    const collect = vi.fn(() => {
      throw new Error('collect must not be called');
    });
    const withIndex = vi.fn(() => ({
      paginate,
      collect,
    }));
    const query = vi.fn(() => ({
      withIndex,
      paginate,
      collect,
    }));

    const result = await paginateNamespacesHandler(
      {
        db: {
          query,
        },
      } as any,
      {
        aggregateName: 'photosByAlbum',
        limit: 25,
      }
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(withIndex).toHaveBeenCalledWith(
      'by_aggregate_name',
      expect.any(Function)
    );
    expect(paginate).toHaveBeenCalledWith({
      cursor: null,
      numItems: 25,
    });
    expect(collect).not.toHaveBeenCalled();
    expect(result).toEqual({
      page: [],
      cursor: 'endcursor',
      isDone: true,
    });
  });
});
