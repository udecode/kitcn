import {
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  internalMutationGeneric,
  type SchedulableFunctionReference,
  type Scheduler,
} from 'convex/server';
import { v } from 'convex/values';
import { createCountBackfillHandlers } from './aggregate-index/backfill';
import {
  type CreateDatabaseOptions,
  createDatabase,
  type OrmReader,
  type OrmWriter,
} from './database';
import { extractRelationsConfig } from './extractRelationsConfig';
import { createOrmDbLifecycle, type OrmDbLifecycle } from './lifecycle';
import type { TablesRelationalConfig } from './relations';
import { scheduledDeleteFactory } from './scheduled-delete';
import { scheduledMutationBatchFactory } from './scheduled-mutation-batch';
import type { OrmTriggers } from './triggers';
import type { VectorSearchProvider } from './types';

export type OrmFunctions = {
  scheduledMutationBatch: SchedulableFunctionReference;
  scheduledDelete: SchedulableFunctionReference;
  aggregateBackfillChunk?: SchedulableFunctionReference;
};

export type CreateOrmOptions = CreateDatabaseOptions;

type OrmWriterCtx = {
  db: GenericDatabaseWriter<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmReaderCtx = {
  db: GenericDatabaseReader<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmSource =
  | GenericDatabaseReader<any>
  | GenericDatabaseWriter<any>
  | OrmReaderCtx
  | OrmWriterCtx;

type OrmResult<
  TSource extends OrmSource,
  TSchema extends TablesRelationalConfig,
> = TSource extends GenericDatabaseWriter<any> | OrmWriterCtx
  ? OrmWriter<TSchema>
  : OrmReader<TSchema>;

type GenericOrm<
  Ctx extends { db: GenericDatabaseReader<any> | GenericDatabaseWriter<any> },
  TSchema extends TablesRelationalConfig,
> = Ctx extends { db: GenericDatabaseWriter<any> }
  ? OrmWriter<TSchema>
  : OrmReader<TSchema>;

type GenericOrmCtx<
  Ctx extends { db: GenericDatabaseReader<any> | GenericDatabaseWriter<any> },
  TSchema extends TablesRelationalConfig,
> = Ctx & { orm: GenericOrm<Ctx, TSchema> };

type CreateOrmConfigBase<TSchema extends TablesRelationalConfig> = {
  schema: TSchema;
  triggers?: OrmTriggers<TSchema, any>;
  internalMutation?: typeof internalMutationGeneric;
};

type CreateOrmConfigWithFunctions<TSchema extends TablesRelationalConfig> =
  CreateOrmConfigBase<TSchema> & {
    ormFunctions: OrmFunctions;
  };

type CreateOrmConfigWithoutFunctions<TSchema extends TablesRelationalConfig> =
  CreateOrmConfigBase<TSchema> & {
    ormFunctions?: undefined;
  };

type OrmFactory<TSchema extends TablesRelationalConfig> = <
  TSource extends OrmSource,
>(
  source: TSource,
  options?: CreateOrmOptions
) => OrmResult<TSource, TSchema>;

type OrmApiResult = {
  scheduledMutationBatch: ReturnType<typeof internalMutationGeneric>;
  scheduledDelete: ReturnType<typeof internalMutationGeneric>;
  aggregateBackfill: ReturnType<typeof internalMutationGeneric>;
  aggregateBackfillChunk: ReturnType<typeof internalMutationGeneric>;
  aggregateBackfillStatus: ReturnType<typeof internalMutationGeneric>;
};

type OrmClientBase<TSchema extends TablesRelationalConfig> = {
  db: OrmFactory<TSchema>;
  with: <TContext extends OrmReaderCtx | OrmWriterCtx>(
    ctx: TContext,
    options?: CreateOrmOptions
  ) => GenericOrmCtx<TContext, TSchema>;
};

type OrmClientWithApi<TSchema extends TablesRelationalConfig> =
  OrmClientBase<TSchema> & {
    api: () => OrmApiResult;
  };

function isOrmCtx(source: OrmSource): source is OrmReaderCtx | OrmWriterCtx {
  return !!source && typeof source === 'object' && 'db' in source;
}

function createDbFactory<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  dbLifecycle: OrmDbLifecycle,
  ormFunctions?: OrmFunctions
): OrmFactory<TSchema> {
  const edgeMetadata = extractRelationsConfig(schema as TablesRelationalConfig);
  return (<TSource extends OrmSource>(
    source: TSource,
    options?: CreateOrmOptions
  ): OrmResult<TSource, TSchema> => {
    const ctxSource = isOrmCtx(source) ? source : undefined;
    const rawDb: GenericDatabaseReader<any> | GenericDatabaseWriter<any> =
      ctxSource
        ? ctxSource.db
        : (source as GenericDatabaseReader<any> | GenericDatabaseWriter<any>);
    const scheduler = options?.scheduler ?? ctxSource?.scheduler;
    const vectorSearch = options?.vectorSearch ?? ctxSource?.vectorSearch;
    const scheduledDelete =
      options?.scheduledDelete ?? ormFunctions?.scheduledDelete;
    const scheduledMutationBatch =
      options?.scheduledMutationBatch ?? ormFunctions?.scheduledMutationBatch;
    const lifecycleSource = (ctxSource ?? {
      db: rawDb,
    }) as OrmReaderCtx | OrmWriterCtx;
    const wrappedCtx = dbLifecycle.wrapDB(lifecycleSource);
    const orm = createDatabase(wrappedCtx.db, schema, edgeMetadata, {
      ...options,
      scheduler,
      vectorSearch,
      scheduledDelete,
      scheduledMutationBatch,
    }) as OrmResult<TSource, TSchema>;

    // Make orm available in trigger context for both orm.with(ctx) and orm.db(writer) paths.
    (lifecycleSource as Record<string, unknown>).orm = orm as unknown;
    (wrappedCtx as Record<string, unknown>).orm = orm as unknown;

    return orm;
  }) as OrmFactory<TSchema>;
}

export function createOrm<TSchema extends TablesRelationalConfig>(
  config: CreateOrmConfigWithoutFunctions<TSchema>
): OrmClientBase<TSchema>;
export function createOrm<TSchema extends TablesRelationalConfig>(
  config: CreateOrmConfigWithFunctions<TSchema>
): OrmClientWithApi<TSchema>;
export function createOrm<TSchema extends TablesRelationalConfig>(
  config:
    | CreateOrmConfigWithFunctions<TSchema>
    | CreateOrmConfigWithoutFunctions<TSchema>
): OrmClientBase<TSchema> | OrmClientWithApi<TSchema> {
  const dbLifecycle = createOrmDbLifecycle(config.schema, config.triggers);
  const edgeMetadata = extractRelationsConfig(
    config.schema as TablesRelationalConfig
  );
  const db = createDbFactory(config.schema, dbLifecycle, config.ormFunctions);
  const withContext = <TContext extends OrmReaderCtx | OrmWriterCtx>(
    ctx: TContext,
    options?: CreateOrmOptions
  ): GenericOrmCtx<TContext, TSchema> => {
    const lifecycleCtx = { ...ctx } as TContext;
    const wrappedCtx = dbLifecycle.wrapDB(lifecycleCtx);
    const orm = db(wrappedCtx, options);
    (lifecycleCtx as Record<string, unknown>).orm = orm as unknown;
    return {
      ...wrappedCtx,
      orm,
    } as GenericOrmCtx<TContext, TSchema>;
  };

  if (!config.ormFunctions) {
    return {
      db,
      with: withContext,
    };
  }

  const mutationBuilder = config.internalMutation ?? internalMutationGeneric;
  return {
    db,
    with: withContext,
    api: () => {
      let aggregateBackfillChunkRef: SchedulableFunctionReference | undefined =
        config.ormFunctions.aggregateBackfillChunk;
      const countBackfillHandlers = createCountBackfillHandlers(
        config.schema,
        () => aggregateBackfillChunkRef
      );
      const aggregateBackfillChunk = mutationBuilder({
        args: v.any(),
        handler: countBackfillHandlers.chunk as any,
      });
      if (!aggregateBackfillChunkRef) {
        aggregateBackfillChunkRef = aggregateBackfillChunk as any;
      }

      return {
        scheduledMutationBatch: mutationBuilder({
          args: v.any(),
          handler: scheduledMutationBatchFactory(
            config.schema,
            edgeMetadata,
            config.ormFunctions.scheduledMutationBatch
          ) as any,
        }),
        scheduledDelete: mutationBuilder({
          args: v.any(),
          handler: scheduledDeleteFactory(
            config.schema,
            edgeMetadata,
            config.ormFunctions.scheduledMutationBatch
          ) as any,
        }),
        aggregateBackfill: mutationBuilder({
          args: v.any(),
          handler: countBackfillHandlers.kickoff as any,
        }),
        aggregateBackfillChunk,
        aggregateBackfillStatus: mutationBuilder({
          args: v.any(),
          handler: countBackfillHandlers.status as any,
        }),
      };
    },
  };
}

export type {
  GenericOrm,
  GenericOrmCtx,
  OrmApiResult,
  OrmClientBase,
  OrmClientWithApi,
  OrmReaderCtx,
  OrmWriterCtx,
};
export type { ScheduledDeleteArgs } from './scheduled-delete';
export type { ScheduledMutationBatchArgs } from './scheduled-mutation-batch';
