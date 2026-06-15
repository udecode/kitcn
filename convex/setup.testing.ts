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
  const orm = createOrm({ schema });
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
