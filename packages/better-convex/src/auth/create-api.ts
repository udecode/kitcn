import { getAuthTables } from 'better-auth/db';
import {
  type GenericDataModel,
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
import type {
  GenericAuthBeforeResult,
  GenericAuthTriggerChange,
  GenericAuthTriggers,
} from './define-auth';
import type { GetAuth } from './types';

type Schema = SchemaDefinition<any, any>;
type MaybePromise<T> = T | Promise<T>;
type RuntimeBeforeResult = GenericAuthBeforeResult<Record<string, unknown>>;
type RuntimeTriggerChange = GenericAuthTriggerChange<Record<string, unknown>>;
type RuntimeTableTriggers = {
  change?: (change: RuntimeTriggerChange, ctx: unknown) => MaybePromise<void>;
  create?: {
    after?: (doc: Record<string, unknown>, ctx: unknown) => MaybePromise<void>;
    before?: (
      data: Record<string, unknown>,
      ctx: unknown
    ) => MaybePromise<RuntimeBeforeResult>;
  };
  delete?: {
    after?: (doc: Record<string, unknown>, ctx: unknown) => MaybePromise<void>;
    before?: (
      doc: Record<string, unknown>,
      ctx: unknown
    ) => MaybePromise<RuntimeBeforeResult>;
  };
  update?: {
    after?: (doc: Record<string, unknown>, ctx: unknown) => MaybePromise<void>;
    before?: (
      update: Record<string, unknown>,
      ctx: unknown
    ) => MaybePromise<RuntimeBeforeResult>;
  };
};
const AUTH_TABLE_TRIGGER_KEYS = new Set([
  'create',
  'update',
  'delete',
  'change',
]);
const LEGACY_AUTH_TRIGGER_KEYS = new Set([
  'beforeCreate',
  'beforeDelete',
  'beforeUpdate',
  'onCreate',
  'onDelete',
  'onUpdate',
]);

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

const isBeforeDataResult = (
  value: RuntimeBeforeResult
): value is { data: Partial<Record<string, unknown>> } =>
  isPlainObject(value) && 'data' in value && isPlainObject(value.data);

const ensureRuntimeTableTriggers = (
  model: string,
  value: unknown
): RuntimeTableTriggers | undefined => {
  if (value === undefined) {
    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(
      `Invalid auth triggers for '${model}'. Expected an object with create/update/delete/change keys.`
    );
  }

  for (const key of Object.keys(value)) {
    if (LEGACY_AUTH_TRIGGER_KEYS.has(key)) {
      throw new Error(
        `Invalid auth trigger key '${key}' for '${model}'. Auth triggers now use { create, update, delete, change } shape.`
      );
    }

    if (!AUTH_TABLE_TRIGGER_KEYS.has(key)) {
      throw new Error(
        `Invalid auth trigger key '${key}' for '${model}'. Allowed keys: create, update, delete, change.`
      );
    }
  }

  const create = (value as RuntimeTableTriggers).create;
  const update = (value as RuntimeTableTriggers).update;
  const del = (value as RuntimeTableTriggers).delete;
  const change = (value as RuntimeTableTriggers).change;

  const validateOperationHook = (
    operation: 'create' | 'update' | 'delete',
    operationHooks: unknown
  ) => {
    if (operationHooks === undefined) {
      return;
    }

    if (!isPlainObject(operationHooks)) {
      throw new Error(
        `Invalid auth trigger '${operation}' for '${model}'. Expected an object with optional before/after handlers.`
      );
    }

    if (
      operationHooks.before !== undefined &&
      typeof operationHooks.before !== 'function'
    ) {
      throw new Error(
        `Invalid auth trigger '${operation}.before' for '${model}'. Expected a function.`
      );
    }
    if (
      operationHooks.after !== undefined &&
      typeof operationHooks.after !== 'function'
    ) {
      throw new Error(
        `Invalid auth trigger '${operation}.after' for '${model}'. Expected a function.`
      );
    }
  };

  validateOperationHook('create', create);
  validateOperationHook('update', update);
  validateOperationHook('delete', del);

  if (change !== undefined && typeof change !== 'function') {
    throw new Error(
      `Invalid auth trigger 'change' for '${model}'. Expected a function.`
    );
  }

  return {
    ...(create ? { create } : {}),
    ...(update ? { update } : {}),
    ...(del ? { delete: del } : {}),
    ...(change ? { change } : {}),
  };
};

const applyBeforeHook = async (
  model: string,
  operation: 'create' | 'update' | 'delete',
  data: Record<string, unknown>,
  beforeHook:
    | ((
        data: Record<string, unknown>,
        ctx: unknown
      ) => MaybePromise<RuntimeBeforeResult>)
    | undefined,
  triggerCtx: unknown
): Promise<Record<string, unknown>> => {
  if (!beforeHook) {
    return data;
  }

  const result = await beforeHook(data, triggerCtx);
  if (result === false) {
    throw new Error(`Auth trigger cancelled ${operation} on '${model}'.`);
  }
  if (isBeforeDataResult(result)) {
    return {
      ...data,
      ...result.data,
    };
  }

  return data;
};

const getDocId = (doc: Record<string, unknown>) =>
  (doc._id ?? doc.id) as GenericId<string>;

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
    select?: string[];
    tableTriggers?: RuntimeTableTriggers;
    triggerCtx?: unknown;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const triggerCtx = args.triggerCtx ?? ctx;
  const tableTriggers = args.tableTriggers;
  const transformedData = await applyBeforeHook(
    args.input.model,
    'create',
    args.input.data,
    tableTriggers?.create?.before,
    triggerCtx
  );
  const data = serializeDatesForConvex(transformedData) as Record<
    string,
    unknown
  >;

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
  const hookDoc = serializeDatesForConvex(normalizedDoc) as Record<
    string,
    unknown
  >;
  const id = getDocId(hookDoc);

  await tableTriggers?.create?.after?.(hookDoc, triggerCtx);
  await tableTriggers?.change?.(
    {
      id,
      newDoc: hookDoc,
      oldDoc: null,
      operation: 'insert',
    },
    triggerCtx
  );

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
    tableTriggers?: RuntimeTableTriggers;
    triggerCtx?: unknown;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const triggerCtx = args.triggerCtx ?? ctx;
  const tableTriggers = args.tableTriggers;
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }
  const normalizedDoc = withBothIdFields(doc);
  const transformedUpdate = await applyBeforeHook(
    args.input.model,
    'update',
    args.input.update,
    tableTriggers?.update?.before,
    triggerCtx
  );
  const update = serializeDatesForConvex(transformedUpdate) as Record<
    string,
    unknown
  >;

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
  const hookNewDoc = serializeDatesForConvex(normalizedUpdatedDoc) as Record<
    string,
    unknown
  >;
  const hookOldDoc = serializeDatesForConvex(normalizedDoc) as Record<
    string,
    unknown
  >;
  const id = getDocId(hookNewDoc);

  await tableTriggers?.update?.after?.(hookNewDoc, triggerCtx);
  await tableTriggers?.change?.(
    {
      id,
      newDoc: hookNewDoc,
      oldDoc: hookOldDoc,
      operation: 'update',
    },
    triggerCtx
  );

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
    tableTriggers?: RuntimeTableTriggers;
    triggerCtx?: unknown;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const triggerCtx = args.triggerCtx ?? ctx;
  const tableTriggers = args.tableTriggers;
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
      const transformedUpdate = await applyBeforeHook(
        args.input.model,
        'update',
        args.input.update ?? {},
        tableTriggers?.update?.before,
        triggerCtx
      );
      const update = serializeDatesForConvex(transformedUpdate) as Record<
        string,
        unknown
      >;

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

      const hookNewDoc = serializeDatesForConvex(
        withBothIdFields(newDoc)
      ) as Record<string, unknown>;
      const hookOldDoc = serializeDatesForConvex(normalizedDoc) as Record<
        string,
        unknown
      >;
      const id = getDocId(hookNewDoc);

      await tableTriggers?.update?.after?.(hookNewDoc, triggerCtx);
      await tableTriggers?.change?.(
        {
          id,
          newDoc: hookNewDoc,
          oldDoc: hookOldDoc,
          operation: 'update',
        },
        triggerCtx
      );
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
    tableTriggers?: RuntimeTableTriggers;
    triggerCtx?: unknown;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const triggerCtx = args.triggerCtx ?? ctx;
  const tableTriggers = args.tableTriggers;
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    return;
  }
  const normalizedDoc = withBothIdFields(doc);
  const transformedDoc = await applyBeforeHook(
    args.input.model,
    'delete',
    normalizedDoc,
    tableTriggers?.delete?.before,
    triggerCtx
  );
  const hookDoc = withBothIdFields(
    serializeDatesForConvex(transformedDoc)
  ) as Record<string, unknown>;
  const id = getDocId(normalizedDoc as Record<string, unknown>);

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
  await tableTriggers?.delete?.after?.(hookDoc, triggerCtx);
  await tableTriggers?.change?.(
    {
      id,
      newDoc: null,
      oldDoc: hookDoc,
      operation: 'delete',
    },
    triggerCtx
  );

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
    tableTriggers?: RuntimeTableTriggers;
    triggerCtx?: unknown;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const triggerCtx = args.triggerCtx ?? ctx;
  const tableTriggers = args.tableTriggers;
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
    const transformedDoc = await applyBeforeHook(
      args.input.model,
      'delete',
      normalizedDoc,
      tableTriggers?.delete?.before,
      triggerCtx
    );
    const hookDoc = withBothIdFields(
      serializeDatesForConvex(transformedDoc)
    ) as Record<string, unknown>;
    const id = getDocId(normalizedDoc as Record<string, unknown>);

    if (ormTable) {
      await ormDelete(
        ctx,
        ormTable.table,
        (normalizedDoc as any)._id as GenericId<string>
      );
    } else {
      await ctx.db.delete((normalizedDoc as any)._id as GenericId<string>);
    }
    await tableTriggers?.delete?.after?.(hookDoc, triggerCtx);
    await tableTriggers?.change?.(
      {
        id,
        newDoc: null,
        oldDoc: hookDoc,
        operation: 'delete',
      },
      triggerCtx
    );
  });

  return toConvexSafe({
    ...result,
    count: page.length,
    ids: page.map((doc: any) => (withBothIdFields(doc) as any)._id),
  });
};

export const createApi = <
  Schema extends SchemaDefinition<any, any>,
  DataModel extends GenericDataModel = GenericDataModel,
  Ctx = unknown,
  TriggerCtx = Ctx,
  Auth = unknown,
>(
  schema: Schema,
  getAuth: GetAuth<Ctx, Auth>,
  options?: {
    internalMutation?: typeof internalMutationGeneric;
    context?: (ctx: any) => TriggerCtx | Promise<TriggerCtx>;
    triggers?:
      | GenericAuthTriggers<DataModel, Schema, TriggerCtx>
      | ((
          ctx: TriggerCtx
        ) => GenericAuthTriggers<DataModel, Schema, TriggerCtx> | undefined);
    /** Validate input validators against auth table schemas. Defaults to false for smaller generated types. */
    validateInput?: boolean;
  }
) => {
  const {
    internalMutation,
    validateInput = false,
    context,
    triggers,
  } = options ?? {};
  let betterAuthSchema: ReturnType<typeof getAuthTables> | undefined;
  const getBetterAuthSchema = () => {
    betterAuthSchema ??= getAuthTables((getAuth({} as Ctx) as any).options);
    return betterAuthSchema;
  };
  const mutationBuilderBase = internalMutation ?? internalMutationGeneric;
  const mutationBuilder = (
    context
      ? customMutation(
          mutationBuilderBase,
          customCtx(
            async (ctx) => (await context?.(ctx)) ?? (ctx as TriggerCtx)
          )
        )
      : mutationBuilderBase
  ) as typeof internalMutationGeneric;
  const resolveTableTriggers = (
    model: string,
    triggerCtx: TriggerCtx
  ): RuntimeTableTriggers | undefined => {
    const resolvedTriggers =
      typeof triggers === 'function' ? triggers(triggerCtx) : triggers;
    const tableTriggers =
      resolvedTriggers?.[model as keyof typeof resolvedTriggers];
    return ensureRuntimeTableTriggers(model, tableTriggers);
  };

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
        input: createInput,
        select: v.optional(v.array(v.string())),
      },
      handler: async (ctx, args) => {
        const triggerCtx = ctx as TriggerCtx;
        return createHandler(
          ctx,
          {
            input: args.input,
            select: args.select,
            tableTriggers: resolveTableTriggers(args.input.model, triggerCtx),
            triggerCtx,
          },
          schema,
          getBetterAuthSchema()
        );
      },
    }),
    deleteMany: mutationBuilder({
      args: {
        input: deleteInput,
        paginationOpts: paginationOptsValidator,
      },
      handler: async (ctx, args) => {
        const triggerCtx = ctx as TriggerCtx;
        return deleteManyHandler(
          ctx,
          {
            input: args.input,
            paginationOpts: args.paginationOpts,
            tableTriggers: resolveTableTriggers(args.input.model, triggerCtx),
            triggerCtx,
          },
          schema,
          getBetterAuthSchema()
        );
      },
    }),
    deleteOne: mutationBuilder({
      args: {
        input: deleteInput,
      },
      handler: async (ctx, args) => {
        const triggerCtx = ctx as TriggerCtx;
        return deleteOneHandler(
          ctx,
          {
            input: args.input,
            tableTriggers: resolveTableTriggers(args.input.model, triggerCtx),
            triggerCtx,
          },
          schema,
          getBetterAuthSchema()
        );
      },
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
        input: updateInput,
        paginationOpts: paginationOptsValidator,
      },
      handler: async (ctx, args) => {
        const triggerCtx = ctx as TriggerCtx;
        return updateManyHandler(
          ctx,
          {
            input: args.input,
            paginationOpts: args.paginationOpts,
            tableTriggers: resolveTableTriggers(args.input.model, triggerCtx),
            triggerCtx,
          },
          schema,
          getBetterAuthSchema()
        );
      },
    }),
    updateOne: mutationBuilder({
      args: {
        input: updateInput,
      },
      handler: async (ctx, args) => {
        const triggerCtx = ctx as TriggerCtx;
        return updateOneHandler(
          ctx,
          {
            input: args.input,
            tableTriggers: resolveTableTriggers(args.input.model, triggerCtx),
            triggerCtx,
          },
          schema,
          getBetterAuthSchema()
        );
      },
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
