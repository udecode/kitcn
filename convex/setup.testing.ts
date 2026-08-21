import type {
  GenericDatabaseWriter,
  SchemaDefinition,
  StorageActionWriter,
} from 'convex/server';
import { convexTest as baseConvexTest } from 'convex-test';
import {
  type CreateOrmOptions,
  createOrm,
  type OrmWriter,
  requireSchemaRelations,
} from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import schema from './schema';

type ImportMetaWithGlob = ImportMeta & {
  glob: (
    globs: string | readonly string[]
  ) => Record<string, () => Promise<unknown>>;
};

const convexModules = (import.meta as ImportMetaWithGlob).glob([
  './**/*.{ts,tsx,js,jsx,mts,mjs}',
  '!./**/*.test.{ts,tsx,js,jsx,mts,mjs}',
  '!./**/*.typecheck.ts',
]);
const relations = requireSchemaRelations(schema);

type TestIdentity = Parameters<
  ReturnType<typeof baseConvexTest>['withIdentity']
>[0];

const serializeDatesForConvexTest = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    let serialized: unknown[] | undefined;

    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      const encoded = serializeDatesForConvexTest(entry);
      if (encoded !== entry) {
        if (!serialized) {
          serialized = value.slice();
        }
        serialized[index] = encoded;
      }
    }

    return serialized ?? value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  const isSimpleObject =
    prototype === null ||
    prototype === Object.prototype ||
    prototype?.constructor?.name === 'Object';
  if (!isSimpleObject) {
    return value;
  }

  const record = value as Record<string, unknown>;
  let serialized: Record<string, unknown> | undefined;

  for (const key in record) {
    if (!Object.hasOwn(record, key)) {
      continue;
    }

    const entry = record[key];
    const encoded = serializeDatesForConvexTest(entry);
    if (encoded !== entry) {
      if (!serialized) {
        serialized = { ...record };
      }
      serialized[key] = encoded;
    }
  }

  return serialized ?? value;
};

const wrapConvexTestDateReturns = <Test extends object>(test: Test): Test => {
  const runnable = test as Test & {
    run: <Output>(fn: (ctx: unknown) => Promise<Output>) => Promise<Output>;
    withIdentity?: (identity: TestIdentity) => object;
  };
  const withIdentity = runnable.withIdentity;

  const wrapped = {
    ...runnable,
    run: async <Output>(fn: (ctx: unknown) => Promise<Output>) =>
      runnable.run(
        async (ctx) => serializeDatesForConvexTest(await fn(ctx)) as Output
      ),
  };

  if (!withIdentity) {
    return wrapped as Test;
  }

  return {
    ...wrapped,
    withIdentity: (identity: TestIdentity) =>
      wrapConvexTestDateReturns(withIdentity(identity)),
  } as Test;
};

export function convexTest<Schema extends SchemaDefinition<any, any>>(
  schema: Schema
) {
  return wrapConvexTestDateReturns(baseConvexTest(schema, convexModules));
}

export type DocumentReadCounts = {
  /**
   * Documents handed back to the caller.
   *
   * This is *not* what a deployment bills. A `.filter()` rejects rows after
   * Convex has already read them, and those rows never reach any result, so
   * `documents` cannot see them. Assert on `scanned` for read bounds.
   */
  documents: number;
  /**
   * Documents Convex walked, including the ones a `.filter()` rejected.
   *
   * This is the number a deployment bills, so it is the one that fails when an
   * index-backed plan silently degrades into a table scan.
   */
  scanned: number;
};

/** The serialized plan a `QueryImpl` is holding before it is consumed. */
type QueryPlan = {
  source: Record<string, unknown>;
  operators: { filter?: unknown; limit?: number }[];
};

/**
 * The plan `target` will execute, or `null` when it cannot carry a `.filter()`.
 *
 * `db.query(table)` is a `QueryInitializerImpl` with no plan yet; every one of
 * its terminals delegates to an unfiltered full table scan, so there is nothing
 * to account for. A consumed or executing query is likewise past the point
 * where the plan can be read, and its own call is about to throw.
 */
const readQueryPlan = (target: any): QueryPlan | null => {
  const state = target?.state;
  if (!state || state.type !== 'preparing') {
    return null;
  }

  const plan = state.query;
  if (!plan?.source || !Array.isArray(plan.operators)) {
    throw new Error(
      'countDocumentReads: unrecognized Convex query plan. Scan counting ' +
        'replays `QueryImpl.state.query` without its `.filter()`; teach it ' +
        'this shape rather than letting read bounds under-report.'
    );
  }

  return plan as QueryPlan;
};

const planHasFilter = (plan: QueryPlan | null) =>
  plan !== null && plan.operators.some((operator) => 'filter' in operator);

const planLimit = (plan: QueryPlan | null) => {
  for (const operator of plan?.operators ?? []) {
    if (typeof operator.limit === 'number') {
      return operator.limit;
    }
  }
  return Number.POSITIVE_INFINITY;
};

/**
 * Replay `plan`'s source with every operator dropped.
 *
 * The result is the sequence of documents Convex walks to answer the real
 * query: `.filter()` and `.limit()` decide which of them survive, never which
 * of them are read. Running it through the engine rather than re-evaluating the
 * predicate here keeps the two passes in the same order, so the filtered result
 * is always a subsequence of this one.
 */
const scanSequence = async (target: any, plan: QueryPlan): Promise<any[]> => {
  const QueryConstructor = target?.constructor;
  if (typeof QueryConstructor !== 'function') {
    throw new Error(
      'countDocumentReads: cannot replay a Convex query without its class.'
    );
  }

  const replay = new QueryConstructor({
    source: { ...plan.source },
    operators: [],
  });
  const rows: any[] = [];
  for await (const row of replay) {
    rows.push(row);
  }
  return rows;
};

const positionOfId = (sequence: any[], id: unknown, from = 0) => {
  if (id === undefined || id === null) {
    return -1;
  }

  const target = String(id);
  for (let index = from; index < sequence.length; index += 1) {
    if (String(sequence[index]?._id) === target) {
      return index;
    }
  }
  return -1;
};

/**
 * Count documents pulled out of `ctx.db` from this point on.
 *
 * Read bounds are part of the ORM's contract, and several of them are invisible
 * in the returned rows: a query that reads a table twice and a query that reads
 * it once can return exactly the same page. Call this before the query under
 * test.
 *
 * Assert on `reads.scanned`. `reads.documents` only sees rows that survived,
 * which makes it blind to exactly the regression these bounds exist to catch: a
 * cross-index `OR` that walks the whole table and returns two rows counts two
 * documents and three hundred scans.
 *
 * This swaps `db.get` and `db.query`, and the ORM binds both when it is built.
 * Install it **before** `withOrm`/`withOrmCtx`, then subtract a snapshot taken
 * after seeding:
 *
 * ```ts
 * const reads = countDocumentReads(baseCtx);
 * const ctx = withOrm(baseCtx, schema);
 * await seed(ctx);
 * const before = reads.scanned;
 * await queryUnderTest(ctx);
 * expect(reads.scanned - before).toBeLessThanOrEqual(bound);
 * ```
 *
 * Installing it on a context that already carries an ORM counts only the reads
 * issued directly through `ctx.db`, so an assertion on ORM reads passes against
 * a constant zero.
 */
export function countDocumentReads(ctx: {
  db: GenericDatabaseWriter<any>;
}): DocumentReadCounts {
  const reads: DocumentReadCounts = { documents: 0, scanned: 0 };
  const baseQuery = ctx.db.query.bind(ctx.db);
  const baseGet = ctx.db.get.bind(ctx.db);

  /**
   * Account for a terminal that read up to `limit` matches.
   *
   * Returning fewer than `limit` means the source ran out, so everything in
   * range was read. Otherwise Convex stopped at the last match it returned, and
   * the scan is that row's position in the unfiltered sequence.
   */
  const accountRows = async (
    target: any,
    plan: QueryPlan | null,
    limit: number,
    rows: any[]
  ) => {
    reads.documents += rows.length;

    if (!planHasFilter(plan)) {
      reads.scanned += rows.length;
      return;
    }

    const sequence = await scanSequence(target, plan as QueryPlan);
    if (rows.length < limit) {
      reads.scanned += sequence.length;
      return;
    }

    const last = positionOfId(sequence, rows.at(-1)?._id);
    reads.scanned += last === -1 ? sequence.length : last + 1;
  };

  const accountPage = async (
    target: any,
    plan: QueryPlan | null,
    options: { cursor?: string | null } | undefined,
    result: any
  ) => {
    const rows: any[] = result?.page ?? [];
    reads.documents += rows.length;

    if (!planHasFilter(plan)) {
      reads.scanned += rows.length;
      return;
    }

    const sequence = await scanSequence(target, plan as QueryPlan);
    // A cursor names the last row of the previous page, so this page starts
    // reading right after it.
    const start = positionOfId(sequence, options?.cursor ?? null) + 1;
    const remaining = Math.max(0, sequence.length - start);

    if (result?.isDone || rows.length === 0) {
      reads.scanned += remaining;
      return;
    }

    const last = positionOfId(sequence, rows.at(-1)?._id, start);
    reads.scanned += last === -1 ? remaining : last + 1 - start;
  };

  const wrapIterator = (target: any) => {
    // The plan has to be read before iteration begins, because starting the
    // query closes it for inspection.
    const plan = readQueryPlan(target);
    const filtered = planHasFilter(plan);
    const limit = planLimit(plan);
    const iterator = target[Symbol.asyncIterator]();
    let sequence: any[] | null = null;
    let cursor = 0;
    let matched = 0;

    return {
      async next() {
        const result = await iterator.next();

        if (result.done) {
          // Same rule as a bounded terminal: running out before the limit is
          // reached means the rest of the range was read, while a satisfied
          // limit is what stopped the walk.
          if (filtered && matched < limit) {
            sequence ??= await scanSequence(target, plan as QueryPlan);
            reads.scanned += sequence.length - cursor;
            cursor = sequence.length;
          }
          return result;
        }

        reads.documents += 1;
        matched += 1;
        if (!filtered) {
          reads.scanned += 1;
          return result;
        }

        sequence ??= await scanSequence(target, plan as QueryPlan);
        const position = positionOfId(sequence, result.value?._id, cursor);
        const reached = position === -1 ? cursor : position + 1;
        reads.scanned += reached - cursor;
        cursor = reached;
        return result;
      },
      // Abandoning the loop early has to close the underlying query, exactly as
      // it would without this proxy.
      async return(value?: unknown) {
        return typeof iterator.return === 'function'
          ? await iterator.return(value)
          : { done: true as const, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };

  const wrap = (query: object): any =>
    new Proxy(query, {
      get(target: any, property) {
        if (property === Symbol.asyncIterator) {
          return () => wrapIterator(target);
        }

        const value = target[property];
        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) => {
          const plan = readQueryPlan(target);
          const result = value.apply(target, args);

          if (property === 'collect') {
            return Promise.resolve(result).then(async (rows: any[]) => {
              await accountRows(target, plan, planLimit(plan), rows);
              return rows;
            });
          }
          if (property === 'take') {
            const limit =
              typeof args[0] === 'number' ? args[0] : Number.POSITIVE_INFINITY;
            return Promise.resolve(result).then(async (rows: any[]) => {
              await accountRows(target, plan, limit, rows);
              return rows;
            });
          }
          if (property === 'first') {
            return Promise.resolve(result).then(async (row: any) => {
              await accountRows(target, plan, 1, row ? [row] : []);
              return row;
            });
          }
          if (property === 'unique') {
            // `unique()` is `take(2)`: it keeps reading until a second match
            // proves the result ambiguous, so a call that returns at all read
            // the whole range.
            return Promise.resolve(result).then(async (row: any) => {
              await accountRows(target, plan, 2, row ? [row] : []);
              return row;
            });
          }
          if (property === 'paginate') {
            const options = args[0] as { cursor?: string | null } | undefined;
            return Promise.resolve(result).then(async (page: any) => {
              await accountPage(target, plan, options, page);
              return page;
            });
          }
          if (result && typeof (result as any).then === 'function') {
            return result;
          }
          if (result && typeof result === 'object') {
            return wrap(result);
          }
          return result;
        };
      },
    });

  (ctx.db as any).query = (table: unknown) => wrap(baseQuery(table as never));
  (ctx.db as any).get = async (id: unknown) => {
    const row = await baseGet(id as never);
    if (row) {
      reads.documents += 1;
      reads.scanned += 1;
    }
    return row;
  };
  return reads;
}

export const withOrm = <
  Ctx extends { db: GenericDatabaseWriter<any> },
  Schema extends object,
>(
  ctx: Ctx,
  schema: Schema,
  options?: CreateOrmOptions
) => {
  const ctxWithOrm = { ...ctx } as Ctx & {
    orm: OrmWriter<Schema>;
  };
  const rls =
    options?.rls && options.rls.ctx
      ? options.rls
      : { ...(options?.rls ?? {}), ctx: ctxWithOrm };
  const orm = createOrm({
    schema,
    capabilities: [aggregateCapability()],
  });
  const ormDb = orm.db(ctx, { ...options, rls });
  ctxWithOrm.orm = ormDb as OrmWriter<Schema>;
  return ctxWithOrm;
};

// Default context wrapper that attaches kitcn ORM as ctx.orm
export async function runCtx<T extends { db: GenericDatabaseWriter<any> }>(
  ctx: T
): Promise<ReturnType<typeof withOrm<T, typeof relations>>> {
  return withOrm(ctx, relations);
}

export type TestCtx = Awaited<ReturnType<typeof runCtx>>;

export async function withOrmCtx<
  Schema extends SchemaDefinition<any, any>,
  OrmSchema extends object,
  Result,
>(
  schema: Schema,
  ormSchema: OrmSchema,
  fn: (ctx: {
    orm: OrmWriter<OrmSchema>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<Result>,
  options?: CreateOrmOptions
): Promise<Result> {
  const t = convexTest(schema);
  let result: Result | undefined;
  await t.run(async (baseCtx) => {
    const ctx = withOrm(baseCtx, ormSchema, options);
    result = await fn(ctx);
  });
  return result as Result;
}
