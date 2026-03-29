import {
  type AdapterFactoryOptions,
  createAdapterFactory,
  type DBAdapterDebugLogOption,
} from 'better-auth/adapters';
import { type BetterAuthDBSchema, getAuthTables } from 'better-auth/db';
import type { BetterAuthOptions } from 'better-auth/minimal';
import type { Where } from 'better-auth/types';
import type {
  GenericDataModel,
  PaginationOptions,
  PaginationResult,
  SchemaDefinition,
} from 'convex/server';
import { prop, sortBy } from 'remeda';
import type { SetOptional } from 'type-fest';
import { asyncMap } from '../internal/upstream';
import type { GenericCtx } from '../server/context-utils';
import { isRunMutationCtx } from '../server/context-utils';
import { findManyHandler, findOneHandler } from './create-api';
import type { AuthFunctions } from './create-client';

let didWarnExperimentalJoinsUnsupported = false;

export const handlePagination = async (
  next: ({
    paginationOpts,
  }: {
    paginationOpts: PaginationOptions;
  }) => Promise<
    SetOptional<PaginationResult<any>, 'page'> & { count?: number }
  >,
  { limit, numItems }: { limit?: number; numItems?: number } = {}
) => {
  const state: {
    count: number;
    cursor: string | null;
    docs: any[];
    isDone: boolean;
  } = {
    count: 0,
    cursor: null,
    docs: [],
    isDone: false,
  };
  const onResult = (
    result: SetOptional<PaginationResult<any>, 'page'> & { count?: number }
  ) => {
    state.cursor =
      result.pageStatus === 'SplitRecommended' ||
      result.pageStatus === 'SplitRequired'
        ? (result.splitCursor ?? result.continueCursor)
        : result.continueCursor;

    if (result.page) {
      state.docs.push(...result.page);
      state.isDone = (limit && state.docs.length >= limit) || result.isDone;

      return;
    }
    // Update and delete only return a count
    if (result.count) {
      state.count += result.count;
      state.isDone = (limit && state.count >= limit) || result.isDone;

      return;
    }

    state.isDone = result.isDone;
  };

  do {
    const result = await next({
      paginationOpts: {
        cursor: state.cursor,
        numItems: Math.min(
          numItems ?? 200,
          (limit ?? 200) - state.docs.length,
          200
        ),
      },
    });
    onResult(result);
  } while (!state.isDone);

  return state;
};

export type ConvexCleanedWhere = Where & {
  value: number[] | string[] | boolean | number | string | null;
};

type AdapterWhere = Where & { join?: undefined };

const hasOrWhere = (where?: AdapterWhere[]): where is AdapterWhere[] =>
  where?.some((clause) => clause.connector === 'OR') ?? false;

const assertSupportedBulkOrWhere = (
  where: AdapterWhere[] | undefined,
  operation: 'deleteMany' | 'updateMany'
) => {
  if (
    hasOrWhere(where) &&
    !where?.every((clause) => clause.connector === 'OR')
  ) {
    throw new Error(
      `Mixed OR/AND where clauses are not supported for ${operation}`
    );
  }
};

const parseWhere = (
  where?: AdapterWhere | AdapterWhere[]
): ConvexCleanedWhere[] => {
  if (!where) {
    return [];
  }
  const whereArray = Array.isArray(where) ? where : [where];
  return whereArray.map((w) => {
    if (w.value instanceof Date) {
      return {
        ...w,
        value: w.value.getTime(),
      };
    }
    return w;
  }) as ConvexCleanedWhere[];
};

type DocWithFlexibleId = {
  _id?: string | null;
  id?: string | null;
};

const getDocId = (doc: DocWithFlexibleId) => {
  if (doc?._id !== undefined && doc?._id !== null) {
    return String(doc._id);
  }
  if (doc?.id !== undefined && doc?.id !== null) {
    return String(doc.id);
  }
  return undefined;
};

const dedupeDocsById = <T extends DocWithFlexibleId>(docs: T[]) => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const doc of docs) {
    const id = getDocId(doc);
    if (!id) {
      deduped.push(doc);
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    deduped.push(doc);
  }
  return deduped;
};

const selectDocFields = (
  doc: DocWithFlexibleId & Record<string, unknown>,
  select?: string[]
) => {
  if (!select?.length) {
    return doc;
  }
  return select.reduce(
    (acc, field) => {
      const sourceField = field === 'id' && '_id' in doc ? '_id' : field;
      acc[sourceField] = doc[sourceField];
      return acc;
    },
    {} as Record<string, unknown>
  );
};

export const adapterConfig = {
  adapterId: 'convex',
  adapterName: 'Convex Adapter',
  debugLogs: false,
  disableIdGeneration: true,
  mapKeysTransformInput: {
    id: '_id',
  },
  mapKeysTransformOutput: {
    _id: 'id',
  },
  supportsJSON: false,
  supportsNumericIds: false,
  supportsDates: false,
  supportsArrays: true,
  transaction: false,
  usePlural: false,
  // Convex does not support Date values in function returns.
  // Keep auth adapter outputs Convex-safe by normalizing date fields to unix millis.
  customTransformInput: ({ data, fieldAttributes }) => {
    if (data && fieldAttributes.type === 'date') {
      return new Date(data).getTime();
    }

    return data;
  },
  customTransformOutput: ({ data, fieldAttributes }) => {
    if (data && fieldAttributes.type === 'date') {
      return new Date(data).getTime();
    }

    return data;
  },
} satisfies AdapterFactoryOptions['config'];

const ORM_SCHEMA_OPTIONS = Symbol.for('kitcn:OrmSchemaOptions');

const hasOrmSchemaMetadata = (schema: unknown) =>
  !!schema && typeof schema === 'object' && ORM_SCHEMA_OPTIONS in schema;

const createAuthSchema = async ({
  file,
  schema,
  tables,
}: {
  tables: BetterAuthDBSchema;
  file?: string;
  schema?: SchemaDefinition<any, any>;
}) => {
  if (hasOrmSchemaMetadata(schema)) {
    const { createSchemaOrm } = await import('./create-schema-orm');
    return createSchemaOrm({ file, tables });
  }

  const { createSchema } = await import('./create-schema');
  return createSchema({ file, tables });
};

export const httpAdapter = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
>(
  ctx: GenericCtx<DataModel>,
  {
    authFunctions,
    debugLogs,
    schema,
  }: {
    authFunctions: AuthFunctions;
    debugLogs?: DBAdapterDebugLogOption;
    schema?: Schema;
  }
) => {
  return createAdapterFactory({
    config: {
      ...adapterConfig,
      debugLogs: debugLogs || false,
    },
    adapter: ({ options }) => {
      // Disable telemetry in all cases because it requires Node
      options.telemetry = { enabled: false };
      if (options.experimental?.joins) {
        options.experimental = {
          ...options.experimental,
          joins: false,
        };
        if (!didWarnExperimentalJoinsUnsupported) {
          didWarnExperimentalJoinsUnsupported = true;
          console.warn(
            '[kitcn] Better Auth experimental.joins is not supported by the Convex adapter yet. Forcing experimental.joins = false.'
          );
        }
      }

      const collectIdsForOrWhere = async (data: {
        model: string;
        where: AdapterWhere[];
      }) => {
        const results = await asyncMap(data.where, async (w) =>
          handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runQuery(authFunctions.findMany, {
                model: data.model,
                paginationOpts,
                where: parseWhere(w),
              })
          )
        );
        return dedupeDocsById(results.flatMap((result) => result.docs))
          .map((doc) => getDocId(doc))
          .flatMap((id) => (id ? [id] : []));
      };

      return {
        id: 'convex',
        options: {
          isRunMutationCtx: isRunMutationCtx(ctx),
        },
        count: async (data) => {
          // Yes, count is just findMany returning a number.
          if (hasOrWhere(data.where)) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) =>
                  await ctx.runQuery(authFunctions.findMany, {
                    ...data,
                    paginationOpts,
                    where: parseWhere(w),
                  })
              )
            );
            const docs = dedupeDocsById(results.flatMap((r) => r.docs));

            return docs.length;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runQuery(authFunctions.findMany, {
                ...data,
                paginationOpts,
                where: parseWhere(data.where),
              })
          );

          return result.docs.length;
        },
        create: async ({ data, model, select }): Promise<any> => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          return await ctx.runMutation(authFunctions.create, {
            input: { data, model },
            select,
          });
        },
        createSchema: async ({ file, tables }) =>
          createAuthSchema({ file, schema, tables }),
        delete: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          await ctx.runMutation(authFunctions.deleteOne, {
            input: {
              model: data.model,
              where: parseWhere(data.where),
            },
          });
        },
        deleteMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }
          assertSupportedBulkOrWhere(data.where, 'deleteMany');
          if (hasOrWhere(data.where)) {
            const ids = await collectIdsForOrWhere({
              model: data.model,
              where: data.where,
            });
            await asyncMap(ids, async (id) => {
              await ctx.runMutation(authFunctions.deleteOne, {
                input: {
                  model: data.model,
                  where: [{ field: '_id', operator: 'eq', value: id }],
                },
              });
            });
            return ids.length;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runMutation(authFunctions.deleteMany, {
                input: {
                  ...data,
                  where: parseWhere(data.where),
                },
                paginationOpts,
              })
          );

          return result.count;
        },
        findMany: async (data): Promise<any[]> => {
          if (data.offset) {
            throw new Error('offset not supported');
          }
          if (hasOrWhere(data.where)) {
            const { select: _ignoredSelect, ...queryData } = data;
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) =>
                  await ctx.runQuery(authFunctions.findMany, {
                    ...queryData,
                    paginationOpts,
                    where: parseWhere(w),
                  }),
                { limit: data.limit }
              )
            );
            let docs = dedupeDocsById(results.flatMap((r) => r.docs));

            if (data.sortBy) {
              docs = sortBy(docs, [
                prop(data.sortBy.field),
                data.sortBy.direction,
              ]);
            }
            if (data.limit !== undefined) {
              docs = docs.slice(0, data.limit);
            }

            return docs.map((doc) => selectDocFields(doc, data.select));
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runQuery(authFunctions.findMany, {
                ...data,
                paginationOpts,
                where: parseWhere(data.where),
              }),
            { limit: data.limit }
          );

          return result.docs;
        },
        findOne: async (data): Promise<any> => {
          const parsedWhere = parseWhere(data.where);

          if (data.where?.every((w) => w.connector === 'OR')) {
            for (const w of data.where) {
              const result: any = await ctx.runQuery(authFunctions.findOne, {
                ...data,
                where: parseWhere(w),
              });

              if (result) {
                return result;
              }
            }
          }

          return await ctx.runQuery(authFunctions.findOne, {
            ...data,
            where: parsedWhere,
          });
        },
        update: async (data): Promise<any> => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          // Support multiple AND conditions with eq operator only
          const isValidWhere =
            data.where?.length &&
            data.where.every(
              (w) =>
                (w.operator === 'eq' || w.operator === undefined) &&
                w.connector !== 'OR'
            );

          if (isValidWhere) {
            // Validate exactly 1 match before updating
            const countResult = await handlePagination(
              async ({ paginationOpts }) =>
                await ctx.runQuery(authFunctions.findMany, {
                  model: data.model,
                  paginationOpts,
                  where: parseWhere(data.where),
                }),
              { limit: 2 }
            );

            if (countResult.docs.length === 0) {
              throw new Error(`No ${data.model} found matching criteria`);
            }
            if (countResult.docs.length > 1) {
              throw new Error(
                `Multiple ${data.model} found matching criteria. Expected exactly 1.`
              );
            }

            return await ctx.runMutation(authFunctions.updateOne, {
              input: {
                model: data.model as any,
                update: data.update as any,
                where: parseWhere(data.where),
              },
            });
          }

          throw new Error('where clause not supported');
        },
        updateMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }
          assertSupportedBulkOrWhere(data.where, 'updateMany');
          if (hasOrWhere(data.where)) {
            const ids = await collectIdsForOrWhere({
              model: data.model,
              where: data.where,
            });
            if (!ids.length) {
              return 0;
            }
            const result = await handlePagination(
              async ({ paginationOpts }) =>
                await ctx.runMutation(authFunctions.updateMany, {
                  input: {
                    ...(data as any),
                    where: [{ field: '_id', operator: 'in', value: ids }],
                  },
                  paginationOpts,
                }),
              { limit: ids.length }
            );
            return result.count;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runMutation(authFunctions.updateMany, {
                input: {
                  ...(data as any),
                  where: parseWhere(data.where),
                },
                paginationOpts,
              })
          );

          return result.count;
        },
      };
    },
  });
};

export const dbAdapter = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
>(
  ctx: GenericCtx<DataModel>,
  getAuthOptions: (ctx: any) => BetterAuthOptions,
  {
    authFunctions,
    debugLogs,
    schema,
  }: {
    authFunctions: AuthFunctions;
    schema: Schema;
    debugLogs?: DBAdapterDebugLogOption;
  }
) => {
  const betterAuthSchema = getAuthTables(getAuthOptions({} as any));

  return createAdapterFactory({
    config: {
      ...adapterConfig,
      debugLogs: debugLogs || false,
    },
    adapter: ({ options }) => {
      // Disable telemetry in all cases because it requires Node
      options.telemetry = { enabled: false };
      if (options.experimental?.joins) {
        options.experimental = {
          ...options.experimental,
          joins: false,
        };
        if (!didWarnExperimentalJoinsUnsupported) {
          didWarnExperimentalJoinsUnsupported = true;
          console.warn(
            '[kitcn] Better Auth experimental.joins is not supported by the Convex adapter yet. Forcing experimental.joins = false.'
          );
        }
      }

      const collectIdsForOrWhere = async (data: {
        model: string;
        where: AdapterWhere[];
      }) => {
        const results = await asyncMap(data.where, async (w) =>
          handlePagination(
            async ({ paginationOpts }) =>
              await findManyHandler(
                ctx,
                {
                  model: data.model,
                  paginationOpts,
                  where: parseWhere(w),
                },
                schema,
                betterAuthSchema
              )
          )
        );
        return dedupeDocsById(results.flatMap((result) => result.docs))
          .map((doc) => getDocId(doc))
          .flatMap((id) => (id ? [id] : []));
      };

      return {
        id: 'convex',
        options: {
          isRunMutationCtx: isRunMutationCtx(ctx),
        },
        count: async (data) => {
          if (hasOrWhere(data.where)) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) =>
                  await findManyHandler(
                    ctx,
                    {
                      ...data,
                      paginationOpts,
                      where: parseWhere(w),
                    },
                    schema,
                    betterAuthSchema
                  )
              )
            );
            const docs = dedupeDocsById(results.flatMap((r) => r.docs));

            return docs.length;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await findManyHandler(
                ctx,
                {
                  ...data,
                  paginationOpts,
                  where: parseWhere(data.where),
                },
                schema,
                betterAuthSchema
              )
          );

          return result.docs.length;
        },
        create: async ({ data, model, select }): Promise<any> => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          return await ctx.runMutation(authFunctions.create, {
            input: { data, model },
            select,
          });
        },
        createSchema: async ({ file, tables }) =>
          createAuthSchema({ file, schema, tables }),
        delete: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          await ctx.runMutation(authFunctions.deleteOne, {
            input: {
              model: data.model,
              where: parseWhere(data.where),
            },
          });
        },
        deleteMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }
          assertSupportedBulkOrWhere(data.where, 'deleteMany');
          if (hasOrWhere(data.where)) {
            const ids = await collectIdsForOrWhere({
              model: data.model,
              where: data.where,
            });
            await asyncMap(ids, async (id) => {
              await ctx.runMutation(authFunctions.deleteOne, {
                input: {
                  model: data.model,
                  where: [{ field: '_id', operator: 'eq', value: id }],
                },
              });
            });
            return ids.length;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runMutation(authFunctions.deleteMany, {
                input: {
                  ...data,
                  where: parseWhere(data.where),
                },
                paginationOpts,
              })
          );

          return result.count;
        },
        findMany: async (data): Promise<any[]> => {
          if (data.offset) {
            throw new Error('offset not supported');
          }
          if (hasOrWhere(data.where)) {
            const { select: _ignoredSelect, ...queryData } = data;
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) =>
                  await findManyHandler(
                    ctx,
                    {
                      ...queryData,
                      paginationOpts,
                      where: parseWhere(w),
                    },
                    schema,
                    betterAuthSchema
                  ),
                { limit: data.limit }
              )
            );
            let docs = dedupeDocsById(results.flatMap((r) => r.docs));

            if (data.sortBy) {
              docs = sortBy(docs, [
                prop(data.sortBy.field),
                data.sortBy.direction,
              ]);
            }
            if (data.limit !== undefined) {
              docs = docs.slice(0, data.limit);
            }

            return docs.map((doc) => selectDocFields(doc, data.select));
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await findManyHandler(
                ctx,
                {
                  ...data,
                  paginationOpts,
                  where: parseWhere(data.where),
                },
                schema,
                betterAuthSchema
              ),
            { limit: data.limit }
          );

          return result.docs;
        },
        findOne: async (data): Promise<any> => {
          if (data.where?.every((w) => w.connector === 'OR')) {
            for (const w of data.where) {
              const result = await findOneHandler(
                ctx,
                {
                  ...data,
                  where: parseWhere(w),
                },
                schema,
                betterAuthSchema
              );

              if (result) {
                return result;
              }
            }
          }

          return await findOneHandler(
            ctx,
            {
              ...data,
              where: parseWhere(data.where),
            },
            schema,
            betterAuthSchema
          );
        },
        update: async (data): Promise<any> => {
          // Support multiple AND conditions with eq operator only
          const isValidWhere =
            data.where?.length &&
            data.where.every(
              (w) =>
                (w.operator === 'eq' || w.operator === undefined) &&
                w.connector !== 'OR'
            );

          if (isValidWhere) {
            // Validate exactly 1 match before updating
            const countResult = await handlePagination(
              async ({ paginationOpts }) =>
                await findManyHandler(
                  ctx,
                  {
                    model: data.model,
                    paginationOpts,
                    where: parseWhere(data.where),
                  },
                  schema,
                  betterAuthSchema
                ),
              { limit: 2 }
            );

            if (countResult.docs.length === 0) {
              throw new Error(`No ${data.model} found matching criteria`);
            }
            if (countResult.docs.length > 1) {
              throw new Error(
                `Multiple ${data.model} found matching criteria. Expected exactly 1.`
              );
            }
            if (!('runMutation' in ctx)) {
              throw new Error('ctx is not a mutation ctx');
            }

            return await ctx.runMutation(authFunctions.updateOne, {
              input: {
                model: data.model as any,
                update: data.update as any,
                where: parseWhere(data.where),
              },
            });
          }

          throw new Error('where clause not supported');
        },
        updateMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }
          assertSupportedBulkOrWhere(data.where, 'updateMany');
          if (hasOrWhere(data.where)) {
            const ids = await collectIdsForOrWhere({
              model: data.model,
              where: data.where,
            });
            if (!ids.length) {
              return 0;
            }
            const result = await handlePagination(
              async ({ paginationOpts }) =>
                await ctx.runMutation(authFunctions.updateMany, {
                  input: {
                    ...(data as any),
                    where: [{ field: '_id', operator: 'in', value: ids }],
                  },
                  paginationOpts,
                }),
              { limit: ids.length }
            );
            return result.count;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) =>
              await ctx.runMutation(authFunctions.updateMany, {
                input: {
                  ...(data as any),
                  where: parseWhere(data.where),
                },
                paginationOpts,
              })
          );

          return result.count;
        },
      };
    },
  });
};
