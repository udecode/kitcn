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

type QueryStep = { method: string; args: unknown[] };
type ScannedRow = { _id: string };

/**
 * Count documents pulled out of `ctx.db` from this point on.
 *
 * Read bounds are part of the ORM's contract, and several of them are invisible
 * in the returned rows: a query that reads a table twice and a query that reads
 * it once can return exactly the same page. Call this before the query under
 * test and assert on `reads.documents`.
 *
 * This swaps `db.get` and `db.query`, and the ORM binds both when it is built.
 * Install it **before** `withOrm`/`withOrmCtx`, then subtract a snapshot taken
 * after seeding:
 *
 * ```ts
 * const reads = countDocumentReads(baseCtx);
 * const ctx = withOrm(baseCtx, schema);
 * await seed(ctx);
 * const before = reads.documents;
 * await queryUnderTest(ctx);
 * expect(reads.documents - before).toBeLessThanOrEqual(bound);
 * ```
 *
 * Installing it on a context that already carries an ORM counts only the reads
 * issued directly through `ctx.db`, so an assertion on ORM reads passes against
 * a constant zero.
 *
 * `documents` counts rows handed back. `.filter()` runs during the scan, so it
 * consumes rows that never reach the caller — a filtered page of ten rows can
 * cost thousands of reads, and `documents` reports ten. Read bounds on filtered
 * or resumed scans have to be asserted on `scanned`, which counts the rows the
 * scan walked to produce that page.
 *
 * `scanned` is opt-in because measuring it replays the unfiltered half of every
 * chain, and that is a real cost in read-heavy suites.
 */
export function countDocumentReads(ctx: { db: GenericDatabaseWriter<any> }): {
  documents: number;
};
export function countDocumentReads(
  ctx: { db: GenericDatabaseWriter<any> },
  options: { scanned: true }
): { documents: number; scanned: number };
export function countDocumentReads(
  ctx: { db: GenericDatabaseWriter<any> },
  options?: { scanned: true }
): { documents: number; scanned: number } {
  const reads = { documents: 0, scanned: 0 };
  const tracksScanned = options?.scanned === true;
  const baseQuery = ctx.db.query.bind(ctx.db);
  const baseGet = ctx.db.get.bind(ctx.db);

  /** Rows the scan walks, in index order, with every `.filter()` dropped. */
  const scanRows = async (
    table: unknown,
    steps: QueryStep[]
  ): Promise<ScannedRow[]> => {
    let query: any = baseQuery(table as never);
    for (const step of steps) {
      query = query[step.method](...step.args);
    }
    return (await query.collect()) as ScannedRow[];
  };

  const positionOf = (rows: ScannedRow[], id: string) =>
    rows.findIndex((row) => row._id === id);

  const wrap = (
    query: object,
    table: unknown,
    steps: QueryStep[],
    filtered: boolean
  ): any => {
    /**
     * A short page means the scan ran to the end of the range still looking for
     * matches; a full one stopped at the last row it returned.
     */
    const countScan = async (rows: ScannedRow[], limit?: number) => {
      if (!filtered) {
        return rows.length;
      }
      const scan = await scanRows(table, steps);
      const last = rows.at(-1);
      if (!last || limit === undefined || rows.length < limit) {
        return scan.length;
      }
      return positionOf(scan, last._id) + 1;
    };

    return new Proxy(query, {
      get(target: any, property) {
        if (property === Symbol.asyncIterator) {
          return () => {
            const iterator = target[Symbol.asyncIterator]();
            let yielded = 0;
            return {
              async next() {
                const result = await iterator.next();
                if (!result.done) {
                  reads.documents += 1;
                  yielded += 1;
                  if (tracksScanned) {
                    reads.scanned += 1;
                  }
                  return result;
                }
                if (tracksScanned && filtered) {
                  // Draining a filtered query walks the whole range; rows the
                  // filter dropped never surfaced above.
                  const scan = await scanRows(table, steps);
                  reads.scanned += Math.max(scan.length - yielded, 0);
                }
                return result;
              },
            };
          };
        }

        const value = target[property];
        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          if (property === 'collect' || property === 'take') {
            const limit = property === 'take' ? (args[0] as number) : undefined;
            return Promise.resolve(result).then(async (rows: ScannedRow[]) => {
              reads.documents += rows.length;
              if (tracksScanned) {
                reads.scanned += await countScan(rows, limit);
              }
              return rows;
            });
          }
          if (property === 'first' || property === 'unique') {
            // `unique()` has to see a second match to reject it.
            const limit = property === 'first' ? 1 : 2;
            return Promise.resolve(result).then(async (row: ScannedRow) => {
              if (row) {
                reads.documents += 1;
              }
              if (tracksScanned) {
                reads.scanned += await countScan(row ? [row] : [], limit);
              }
              return row;
            });
          }
          if (property === 'paginate') {
            const cursor =
              (args[0] as { cursor?: string | null } | undefined)?.cursor ??
              null;
            return Promise.resolve(result).then(
              async (page: { page: ScannedRow[] }) => {
                reads.documents += page.page.length;
                if (tracksScanned) {
                  if (filtered) {
                    const scan = await scanRows(table, steps);
                    const start =
                      cursor === null ? 0 : positionOf(scan, cursor) + 1;
                    const last = page.page.at(-1);
                    reads.scanned += last
                      ? positionOf(scan, last._id) + 1 - start
                      : Math.max(scan.length - start, 0);
                  } else {
                    reads.scanned += page.page.length;
                  }
                }
                return page;
              }
            );
          }
          if (result && typeof (result as any).then === 'function') {
            return result;
          }
          if (result && typeof result === 'object') {
            return wrap(
              result,
              table,
              property === 'filter'
                ? steps
                : [...steps, { method: property as string, args }],
              filtered || property === 'filter'
            );
          }
          return result;
        };
      },
    });
  };

  (ctx.db as any).query = (table: unknown) =>
    wrap(baseQuery(table as never), table, [], false);
  (ctx.db as any).get = async (id: unknown) => {
    const row = await baseGet(id as never);
    if (row) {
      reads.documents += 1;
      if (tracksScanned) {
        reads.scanned += 1;
      }
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
