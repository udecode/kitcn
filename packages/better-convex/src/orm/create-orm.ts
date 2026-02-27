import {
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  internalActionGeneric,
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
import { createMigrationHandlers, type MigrationSet } from './migrations';
import type { TablesRelationalConfig } from './relations';
import { scheduledDeleteFactory } from './scheduled-delete';
import { scheduledMutationBatchFactory } from './scheduled-mutation-batch';
import { OrmSchemaPluginTables } from './symbols';
import type { OrmTriggers } from './triggers';
import type { VectorSearchProvider } from './types';

export type OrmFunctions = {
  scheduledMutationBatch: SchedulableFunctionReference;
  scheduledDelete: SchedulableFunctionReference;
  aggregateBackfillChunk?: SchedulableFunctionReference;
  migrationRunChunk?: SchedulableFunctionReference;
  resetChunk?: SchedulableFunctionReference;
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
  migrations?: MigrationSet<any>;
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
  migrationRun: ReturnType<typeof internalMutationGeneric>;
  migrationRunChunk: ReturnType<typeof internalMutationGeneric>;
  migrationStatus: ReturnType<typeof internalMutationGeneric>;
  migrationCancel: ReturnType<typeof internalMutationGeneric>;
  resetChunk: ReturnType<typeof internalMutationGeneric>;
  reset: ReturnType<typeof internalActionGeneric>;
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

export function getResetTableNames(schema: TablesRelationalConfig): string[] {
  const pluginTables = (
    schema as {
      [OrmSchemaPluginTables]?: readonly string[];
    }
  )[OrmSchemaPluginTables];

  return [
    ...new Set([
      ...Object.values(schema).map((tableConfig) => tableConfig.name),
      ...(pluginTables ?? []),
    ]),
  ];
}

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
      let migrationRunChunkRef: SchedulableFunctionReference | undefined =
        config.ormFunctions.migrationRunChunk;
      let resetChunkRef: SchedulableFunctionReference | undefined =
        config.ormFunctions.resetChunk;
      const countBackfillHandlers = createCountBackfillHandlers(
        config.schema,
        () => aggregateBackfillChunkRef
      );
      const migrationHandlers = createMigrationHandlers({
        schema: config.schema,
        migrations: config.migrations as MigrationSet<TSchema> | undefined,
        getOrm: (ctx) => db(ctx as any) as OrmWriter<TSchema>,
        getChunkRef: () => migrationRunChunkRef,
      });
      const aggregateBackfillChunk = mutationBuilder({
        args: v.any(),
        handler: countBackfillHandlers.chunk as any,
      });
      if (!aggregateBackfillChunkRef) {
        aggregateBackfillChunkRef = aggregateBackfillChunk as any;
      }
      const migrationRunChunk = mutationBuilder({
        args: v.any(),
        handler: migrationHandlers.chunk as any,
      });
      if (!migrationRunChunkRef) {
        migrationRunChunkRef =
          migrationRunChunk as unknown as SchedulableFunctionReference;
      }
      const resetChunk = mutationBuilder({
        args: v.object({
          tableName: v.string(),
          cursor: v.union(v.string(), v.null()),
        }),
        handler: async (
          ctx: { db: GenericDatabaseWriter<any> },
          args: { tableName: string; cursor: string | null }
        ) => {
          const page = await (
            ctx.db.query(args.tableName as any) as any
          ).paginate({
            cursor: args.cursor,
            numItems: 256,
          });
          const docs = Array.isArray(page?.page)
            ? (page.page as Array<{ _id?: string }>)
            : [];
          let deleted = 0;
          for (const doc of docs) {
            if (!doc?._id) {
              continue;
            }
            await ctx.db.delete(args.tableName as any, doc._id as any);
            deleted += 1;
          }
          return {
            cursor: page?.isDone
              ? null
              : ((page?.continueCursor ?? null) as string | null),
            deleted,
            isDone: Boolean(page?.isDone),
          };
        },
      });
      if (!resetChunkRef) {
        resetChunkRef = resetChunk as unknown as SchedulableFunctionReference;
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
        migrationRun: mutationBuilder({
          args: v.any(),
          handler: migrationHandlers.run as any,
        }),
        migrationRunChunk,
        migrationStatus: mutationBuilder({
          args: v.any(),
          handler: migrationHandlers.status as any,
        }),
        migrationCancel: mutationBuilder({
          args: v.any(),
          handler: migrationHandlers.cancel as any,
        }),
        resetChunk,
        reset: internalActionGeneric({
          args: v.any(),
          handler: async (ctx: any) => {
            const tableNames = getResetTableNames(config.schema);
            let deleted = 0;

            for (const tableName of tableNames) {
              let cursor: string | null = null;
              while (true) {
                const chunk = (await ctx.runMutation(resetChunkRef, {
                  tableName,
                  cursor,
                })) as {
                  cursor: string | null;
                  deleted: number;
                  isDone: boolean;
                };
                deleted += chunk.deleted;
                if (chunk.isDone) {
                  break;
                }
                cursor = chunk.cursor;
              }
            }

            return {
              status: 'ok' as const,
              tables: tableNames.length,
              deleted,
            };
          },
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
