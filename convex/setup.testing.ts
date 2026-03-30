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

export function convexTest<Schema extends SchemaDefinition<any, any>>(
  schema: Schema
) {
  return baseConvexTest(schema, convexModules);
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
