import { getAuthTables } from 'better-auth/db';
import {
  type FunctionHandle,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  paginationOptsValidator,
  type SchemaDefinition,
} from 'convex/server';
import { type GenericId, v } from 'convex/values';
import { asyncMap } from '../internal/upstream';
import {
  customCtx,
  customMutation,
} from '../internal/upstream/server/customFunctions';
import { partial } from '../internal/upstream/validators';
import { eq, unsetToken } from '../orm';
import {
  adapterWhereValidator,
  checkUniqueFields,
  hasUniqueFields,
  listOne,
  paginate,
  selectFields,
} from './adapter-utils';
import type { GetAuth } from './types';

type Schema = SchemaDefinition<any, any>;

const whereValidator = (schema: Schema, tableName: keyof Schema['tables']) =>
  v.object({
    connector: v.optional(v.union(v.literal('AND'), v.literal('OR'))),
    field: v.union(
      ...Object.keys(schema.tables[tableName].validator.fields).map((field) =>
        v.literal(field)
      ),
      v.literal('_id')
    ),
    operator: v.optional(
      v.union(
        v.literal('lt'),
        v.literal('lte'),
        v.literal('gt'),
        v.literal('gte'),
        v.literal('eq'),
        v.literal('in'),
        v.literal('not_in'),
        v.literal('ne'),
        v.literal('contains'),
        v.literal('starts_with'),
        v.literal('ends_with')
      )
    ),
    value: v.union(
      v.string(),
      v.number(),
      v.boolean(),
      v.array(v.string()),
      v.array(v.number()),
      v.null()
    ),
  });

const resolveSchemaTableName = (
  schema: Schema,
  betterAuthSchema: any,
  model: string
): string | undefined => {
  if (schema.tables[model as keyof Schema['tables']]) {
    return model;
  }

  const modelConfig = betterAuthSchema?.[model];
  if (modelConfig?.modelName && schema.tables[modelConfig.modelName]) {
    return modelConfig.modelName;
  }

  for (const [key, value] of Object.entries<any>(betterAuthSchema ?? {})) {
    if (value?.modelName !== model) {
      continue;
    }
    if (schema.tables[key as keyof Schema['tables']]) {
      return key;
    }
    if (schema.tables[value.modelName as keyof Schema['tables']]) {
      return value.modelName;
    }
  }

  return;
};

const resolveOrmTable = (
  ctx: any,
  schema: Schema,
  betterAuthSchema: any,
  model: string
) => {
  if (
    !ctx?.orm ||
    typeof ctx.orm.insert !== 'function' ||
    typeof ctx.orm.update !== 'function' ||
    typeof ctx.orm.delete !== 'function'
  ) {
    return;
  }

  const tableName = resolveSchemaTableName(schema, betterAuthSchema, model);
  if (!tableName) {
    return;
  }

  const table = schema.tables[tableName as keyof Schema['tables']] as any;
  if (!table || !table._id) {
    return;
  }

  return { table, tableName };
};

const normalizeUpdateForOrm = (update: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(update).map(([key, value]) => [
      key,
      value === undefined ? unsetToken : value,
    ])
  );

const ormInsert = async (ctx: any, table: any, data: Record<string, unknown>) =>
  (await ctx.orm.insert(table).values(data).returning())[0];

const ormUpdate = async (
  ctx: any,
  table: any,
  id: GenericId<string>,
  update: Record<string, unknown>
) =>
  (
    await ctx.orm
      .update(table)
      .set(normalizeUpdateForOrm(update))
      .returning()
      .where(eq(table._id, id))
  )[0];

const ormDelete = async (ctx: any, table: any, id: GenericId<string>) => {
  await ctx.orm.delete(table).where(eq(table._id, id));
};

const withBothIdFields = <T>(doc: T): T => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return doc;
  }

  const record = doc as Record<string, unknown>;
  const existingUnderscoreId = record._id as GenericId<string> | undefined;
  const existingId = record.id as GenericId<string> | undefined;
  const id = existingUnderscoreId ?? existingId;

  if (!id) {
    return doc;
  }

  return {
    ...record,
    _id: existingUnderscoreId ?? id,
    id: existingId ?? id,
  } as T;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const serializeDatesForConvex = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    let result: unknown[] | undefined;

    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      const serialized = serializeDatesForConvex(entry);
      if (serialized !== entry) {
        if (!result) {
          result = value.slice();
        }
        result[index] = serialized;
      }
    }

    return result ?? value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  let serialized: Record<string, unknown> | undefined;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }

    const nested = value[key];
    const encoded = serializeDatesForConvex(nested);
    if (encoded !== nested) {
      if (!serialized) {
        serialized = { ...value };
      }
      serialized[key] = encoded;
    }
  }

  return serialized ?? value;
};

const toConvexSafe = <T>(value: T): T => serializeDatesForConvex(value) as T;

// Extracted handler functions
export const createHandler = async (
  ctx: any,
  args: {
    input: {
      data: any;
      model: string;
    };
    beforeCreateHandle?: string;
    select?: string[];
    skipBeforeHooks?: boolean;
    onCreateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  let data = args.input.data;

  if (!args.skipBeforeHooks && args.beforeCreateHandle) {
    const transformedData = await ctx.runMutation(
      args.beforeCreateHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        data,
        model: args.input.model,
      })
    );

    if (transformedData !== undefined) {
      data = transformedData;
    }
  }

  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    data
  );
  const ormTable = resolveOrmTable(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model
  );
  const doc = ormTable
    ? await ormInsert(ctx, ormTable.table, data)
    : await (async () => {
        const id = await ctx.db.insert(args.input.model as any, data);
        return ctx.db.get(id);
      })();

  if (!doc) {
    throw new Error(`Failed to create ${args.input.model}`);
  }

  const normalizedDoc = withBothIdFields(doc);
  const result = await selectFields(normalizedDoc, args.select);

  if (args.onCreateHandle) {
    const hookDoc = normalizedDoc;
    await ctx.runMutation(
      args.onCreateHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        doc: hookDoc,
        model: args.input.model,
      })
    );
  }

  return toConvexSafe(result);
};

export const findOneHandler = async (
  ctx: any,
  args: {
    model: string;
    select?: string[];
    where?: any[];
  },
  schema: Schema,
  betterAuthSchema: any
) => toConvexSafe(await listOne(ctx, schema, betterAuthSchema, args));

export const findManyHandler = async (
  ctx: any,
  args: {
    model: string;
    paginationOpts: any;
    limit?: number;
    offset?: number;
    sortBy?: {
      direction: 'asc' | 'desc';
      field: string;
    };
    where?: any[];
  },
  schema: Schema,
  betterAuthSchema: any
) => toConvexSafe(await paginate(ctx, schema, betterAuthSchema, args));

export const updateOneHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      update: any;
      where?: any[];
    };
    beforeUpdateHandle?: string;
    onUpdateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }
  const normalizedDoc = withBothIdFields(doc);

  let update = args.input.update;

  if (args.beforeUpdateHandle) {
    const transformedUpdate = await ctx.runMutation(
      args.beforeUpdateHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        doc: normalizedDoc,
        model: args.input.model,
        update,
      })
    );

    if (transformedUpdate !== undefined) {
      update = transformedUpdate;
    }
  }

  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    update,
    normalizedDoc
  );
  const ormTable = resolveOrmTable(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model
  );
  const updatedDoc = ormTable
    ? await ormUpdate(
        ctx,
        ormTable.table,
        (normalizedDoc as any)._id as GenericId<string>,
        update as Record<string, unknown>
      )
    : await (async () => {
        await ctx.db.patch(
          (normalizedDoc as any)._id as GenericId<string>,
          update as any
        );
        return ctx.db.get((normalizedDoc as any)._id as GenericId<string>);
      })();

  if (!updatedDoc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }
  const normalizedUpdatedDoc = withBothIdFields(updatedDoc);

  if (args.onUpdateHandle) {
    const hookNewDoc = normalizedUpdatedDoc;
    await ctx.runMutation(
      args.onUpdateHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        model: args.input.model,
        newDoc: hookNewDoc,
        oldDoc: normalizedDoc,
      })
    );
  }

  return toConvexSafe(normalizedUpdatedDoc);
};

export const updateManyHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      update?: any;
      where?: any[];
    };
    paginationOpts: any;
    beforeUpdateHandle?: string;
    onUpdateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const { page, ...result } = await paginate(ctx, schema, betterAuthSchema, {
    ...args.input,
    paginationOpts: args.paginationOpts,
  });
  const ormTable = resolveOrmTable(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model
  );

  if (args.input.update) {
    if (
      hasUniqueFields(
        betterAuthSchema,
        args.input.model,
        args.input.update ?? {}
      ) &&
      page.length > 1
    ) {
      throw new Error(
        `Attempted to set unique fields in multiple documents in ${args.input.model} with the same value. Fields: ${Object.keys(args.input.update ?? {}).join(', ')}`
      );
    }

    await asyncMap(page, async (doc: any) => {
      const normalizedDoc = withBothIdFields(doc);
      let update = args.input.update;

      if (args.beforeUpdateHandle) {
        const transformedUpdate = await ctx.runMutation(
          args.beforeUpdateHandle as FunctionHandle<'mutation'>,
          serializeDatesForConvex({
            doc: normalizedDoc,
            model: args.input.model,
            update,
          })
        );

        if (transformedUpdate !== undefined) {
          update = transformedUpdate;
        }
      }

      await checkUniqueFields(
        ctx,
        schema,
        betterAuthSchema,
        args.input.model,
        update ?? {},
        normalizedDoc
      );
      const newDoc = ormTable
        ? await ormUpdate(
            ctx,
            ormTable.table,
            (normalizedDoc as any)._id as GenericId<string>,
            (update ?? {}) as Record<string, unknown>
          )
        : await (async () => {
            await ctx.db.patch(
              (normalizedDoc as any)._id as GenericId<string>,
              update as any
            );
            return ctx.db.get((normalizedDoc as any)._id as GenericId<string>);
          })();

      if (args.onUpdateHandle) {
        const hookNewDoc = withBothIdFields(newDoc);
        await ctx.runMutation(
          args.onUpdateHandle as FunctionHandle<'mutation'>,
          serializeDatesForConvex({
            model: args.input.model,
            newDoc: hookNewDoc,
            oldDoc: normalizedDoc,
          })
        );
      }
    });
  }

  return toConvexSafe({
    ...result,
    count: page.length,
    ids: page.map((doc: any) => (withBothIdFields(doc) as any)._id),
  });
};

export const deleteOneHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      where?: any[];
    };
    beforeDeleteHandle?: string;
    skipBeforeHooks?: boolean;
    onDeleteHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    return;
  }
  const normalizedDoc = withBothIdFields(doc);

  let hookDoc = normalizedDoc;

  if (!args.skipBeforeHooks && args.beforeDeleteHandle) {
    const transformedDoc = await ctx.runMutation(
      args.beforeDeleteHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        doc: normalizedDoc,
        model: args.input.model,
      })
    );

    if (transformedDoc !== undefined) {
      hookDoc = withBothIdFields(transformedDoc);
    }
  }

  const ormTable = resolveOrmTable(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model
  );
  if (ormTable) {
    await ormDelete(
      ctx,
      ormTable.table,
      (normalizedDoc as any)._id as GenericId<string>
    );
  } else {
    await ctx.db.delete((normalizedDoc as any)._id as GenericId<string>);
  }

  if (args.onDeleteHandle) {
    await ctx.runMutation(
      args.onDeleteHandle as FunctionHandle<'mutation'>,
      serializeDatesForConvex({
        doc: hookDoc,
        model: args.input.model,
      })
    );
  }

  return toConvexSafe(withBothIdFields(hookDoc));
};

export const deleteManyHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      where?: any[];
    };
    paginationOpts: any;
    beforeDeleteHandle?: string;
    skipBeforeHooks?: boolean;
    onDeleteHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const { page, ...result } = await paginate(ctx, schema, betterAuthSchema, {
    ...args.input,
    paginationOpts: args.paginationOpts,
  });
  const ormTable = resolveOrmTable(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model
  );
  await asyncMap(page, async (doc: any) => {
    const normalizedDoc = withBothIdFields(doc);
    let hookDoc = normalizedDoc;

    if (!args.skipBeforeHooks && args.beforeDeleteHandle) {
      const transformedDoc = await ctx.runMutation(
        args.beforeDeleteHandle as FunctionHandle<'mutation'>,
        serializeDatesForConvex({
          doc: normalizedDoc,
          model: args.input.model,
        })
      );

      if (transformedDoc !== undefined) {
        hookDoc = withBothIdFields(transformedDoc);
      }
    }

    if (ormTable) {
      await ormDelete(
        ctx,
        ormTable.table,
        (normalizedDoc as any)._id as GenericId<string>
      );
    } else {
      await ctx.db.delete((normalizedDoc as any)._id as GenericId<string>);
    }

    if (args.onDeleteHandle) {
      await ctx.runMutation(
        args.onDeleteHandle as FunctionHandle<'mutation'>,
        serializeDatesForConvex({
          doc: hookDoc,
          model: args.input.model,
        })
      );
    }
  });

  return toConvexSafe({
    ...result,
    count: page.length,
    ids: page.map((doc: any) => (withBothIdFields(doc) as any)._id),
  });
};

export const createApi = <
  Schema extends SchemaDefinition<any, any>,
  Ctx = unknown,
  Auth = unknown,
>(
  schema: Schema,
  getAuth: GetAuth<Ctx, Auth>,
  options?: {
    internalMutation?: typeof internalMutationGeneric;
    context?: (ctx: any) => any | Promise<any>;
    /** Validate input validators against auth table schemas. Defaults to false for smaller generated types. */
    validateInput?: boolean;
  }
) => {
  const { internalMutation, validateInput = false, context } = options ?? {};
  let betterAuthSchema: ReturnType<typeof getAuthTables> | undefined;
  const getBetterAuthSchema = () => {
    betterAuthSchema ??= getAuthTables((getAuth({} as Ctx) as any).options);
    return betterAuthSchema;
  };
  const mutationBuilderBase = internalMutation ?? internalMutationGeneric;
  const mutationBuilder = context
    ? customMutation(
        mutationBuilderBase,
        customCtx(async (ctx) => (await context?.(ctx)) ?? ctx)
      )
    : mutationBuilderBase;

  // Generic validators for non-validated mode (much smaller generated types)
  const anyInput = v.object({
    data: v.any(),
    model: v.string(),
  });
  const anyInputWithWhere = v.object({
    model: v.string(),
    where: v.optional(v.array(v.any())),
  });
  const anyInputWithUpdate = v.object({
    model: v.string(),
    update: v.any(),
    where: v.optional(v.array(v.any())),
  });

  // Typed validators (only auth tables)
  const authSchemaForValidation = validateInput
    ? getBetterAuthSchema()
    : ({} as ReturnType<typeof getAuthTables>);
  const authTableNames = new Set(Object.keys(authSchemaForValidation));
  const authTables = Object.entries(schema.tables).filter(([name]) =>
    authTableNames.has(name)
  );
  const authTableKeys = authTables.map(([name]) => name);

  const createInput = validateInput
    ? v.union(
        ...authTables.map(([model, table]) => {
          const fields = partial((table as any).validator.fields);
          return v.object({
            data: v.object(fields),
            model: v.literal(model),
          });
        })
      )
    : anyInput;

  const deleteInput = validateInput
    ? v.union(
        ...authTableKeys.map((tableName) =>
          v.object({
            model: v.literal(tableName),
            where: v.optional(
              v.array(
                whereValidator(schema, tableName as keyof Schema['tables'])
              )
            ),
          })
        )
      )
    : anyInputWithWhere;

  const modelValidator = validateInput
    ? v.union(...authTableKeys.map((model) => v.literal(model)))
    : v.string();

  const updateInput = validateInput
    ? v.union(
        ...authTables.map(
          ([tableName, table]: [string, Schema['tables'][string]]) => {
            const fields = partial(table.validator.fields);
            return v.object({
              model: v.literal(tableName),
              update: v.object(fields),
              where: v.optional(v.array(whereValidator(schema, tableName))),
            });
          }
        )
      )
    : anyInputWithUpdate;

  return {
    create: mutationBuilder({
      args: {
        beforeCreateHandle: v.optional(v.string()),
        input: createInput,
        select: v.optional(v.array(v.string())),
        onCreateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        createHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    deleteMany: mutationBuilder({
      args: {
        beforeDeleteHandle: v.optional(v.string()),
        input: deleteInput,
        paginationOpts: paginationOptsValidator,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteManyHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    deleteOne: mutationBuilder({
      args: {
        beforeDeleteHandle: v.optional(v.string()),
        input: deleteInput,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteOneHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    findMany: internalQueryGeneric({
      args: {
        limit: v.optional(v.number()),
        model: modelValidator,
        offset: v.optional(v.number()),
        paginationOpts: paginationOptsValidator,
        sortBy: v.optional(
          v.object({
            direction: v.union(v.literal('asc'), v.literal('desc')),
            field: v.string(),
          })
        ),
        where: v.optional(v.array(adapterWhereValidator)),
        join: v.optional(v.any()),
      },
      handler: async (ctx, args) =>
        findManyHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    findOne: internalQueryGeneric({
      args: {
        model: modelValidator,
        select: v.optional(v.array(v.string())),
        where: v.optional(v.array(adapterWhereValidator)),
        join: v.optional(v.any()),
      },
      handler: async (ctx, args) =>
        findOneHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    updateMany: mutationBuilder({
      args: {
        beforeUpdateHandle: v.optional(v.string()),
        input: updateInput,
        paginationOpts: paginationOptsValidator,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateManyHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    updateOne: mutationBuilder({
      args: {
        beforeUpdateHandle: v.optional(v.string()),
        input: updateInput,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateOneHandler(ctx, args, schema, getBetterAuthSchema()),
    }),
    getLatestJwks: internalActionGeneric({
      args: {},
      handler: async (ctx) => {
        const auth = getAuth(ctx as Ctx) as {
          api: { getLatestJwks: () => unknown };
        };

        return auth.api.getLatestJwks();
      },
    }),
    rotateKeys: internalActionGeneric({
      args: {},
      handler: async (ctx) => {
        const auth = getAuth(ctx as Ctx) as {
          api: { rotateKeys: () => unknown };
        };

        return auth.api.rotateKeys();
      },
    }),
  };
};
