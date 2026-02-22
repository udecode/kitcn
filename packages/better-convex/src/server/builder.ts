/**
 * CRPC - Convex RPC Builder
 * A tRPC-style fluent API for Convex functions
 *
 * Core library - no project-specific dependencies
 */
import {
  actionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from 'convex/server';
import { z } from 'zod';
import {
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import { customCtx } from '../internal/upstream/server/customFunctions';
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zodOutputToConvex,
  zodToConvex,
} from '../internal/upstream/server/zod4';
import { toCRPCError } from './error';
import {
  createHttpProcedureBuilder,
  type HttpProcedureBuilder,
} from './http-builder';
import {
  type CRPCHttpRouter,
  createHttpRouterFactory,
  type HttpRouterRecord,
} from './http-router';
import type { HttpActionConstructor, HttpMethod } from './http-types';
import type {
  AnyMiddleware,
  GetRawInputFn,
  IntersectIfDefined,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResult,
  Overwrite,
  UnsetMarker,
} from './types';

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Paginated schema for type inference ONLY.
 * After .paginated() applies defaults, cursor and limit are always defined.
 * The actual runtime schema uses .default() and .transform() for validation.
 */
const paginatedSchemaForTypes = z.object({
  cursor: z.union([z.string(), z.null()]),
  limit: z.number(),
});

/** Paginated schema type - both cursor and limit are required after .paginated() */
type PaginatedInputSchema = typeof paginatedSchemaForTypes;

/** Paginated schema type for external callers - both fields are optional due defaults. */
const paginatedSchemaForClientTypes = z.object({
  cursor: z.union([z.string(), z.null()]).optional(),
  limit: z.number().optional(),
});

type PaginatedClientInputSchema = typeof paginatedSchemaForClientTypes;

/**
 * Infer input type from ZodObject schema (for handlers)
 */
type InferInput<T> = T extends UnsetMarker
  ? Record<string, never>
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : never;

/**
 * Infer raw client input before defaults/transforms.
 * Used for generated API arg typing.
 */
type InferClientInput<T> = T extends UnsetMarker
  ? Record<string, never>
  : T extends z.ZodObject<any>
    ? z.input<T>
    : never;

/**
 * Infer input type for middleware (returns unknown for UnsetMarker, matching tRPC)
 * Middleware before .input() receives unknown input
 */
type InferMiddlewareInput<T> = T extends UnsetMarker
  ? unknown
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : unknown;

/**
 * Static-only type hint attached to cRPC exports.
 *
 * Convex validators can widen unsupported types (like Date) to `any`.
 * Codegen can read this hint from `typeof import(...).fn` to recover precise
 * TypeScript input/output types for generated client API refs.
 */
export type CRPCFunctionTypeHint<TArgs, TReturns> = {
  readonly __betterConvexTypeHint?: {
    readonly args: TArgs;
    readonly returns: TReturns;
  };
};

// =============================================================================
// Types for Configuration
// =============================================================================

/** Base config shape for function builders */
type FunctionBuilderConfig = {
  /** Base function builder (query, mutation, or action from Convex) */
  base: unknown;
  /** Internal function builder (internalQuery, etc.) */
  internal?: unknown;
};

/** Internal config combining context creator with function builders */
type InternalFunctionConfig = FunctionBuilderConfig & {
  /** Transform raw Convex context to the base context for procedures */
  createContext: (ctx: any) => unknown;
  /** Wire transformer for request/response serialization. */
  transformer: ReturnType<typeof getTransformer>;
};

/** Context creators for each function type - all optional, defaults to passthrough */
type ContextConfig<DataModel extends GenericDataModel> = {
  query?: (ctx: GenericQueryCtx<DataModel>) => unknown;
  mutation?: (ctx: GenericMutationCtx<DataModel>) => unknown;
  action?: (ctx: GenericActionCtx<DataModel>) => unknown;
};

/** Infer context types from config - defaults to raw Convex ctx when not specified */
type InferQueryCtx<T, DataModel extends GenericDataModel> = T extends {
  query: (...args: never[]) => infer R;
}
  ? R
  : GenericQueryCtx<DataModel>;
type InferMutationCtx<T, DataModel extends GenericDataModel> = T extends {
  mutation: (...args: never[]) => infer R;
}
  ? R
  : GenericMutationCtx<DataModel>;
type InferActionCtx<T, DataModel extends GenericDataModel> = T extends {
  action: (...args: never[]) => infer R;
}
  ? R
  : GenericActionCtx<DataModel>;

/** Function builders for each function type */
type FunctionsConfig = {
  query?: unknown;
  internalQuery?: unknown;
  mutation?: unknown;
  internalMutation?: unknown;
  action?: unknown;
  internalAction?: unknown;
  httpAction?: unknown;
};

/** Config for create() including optional defaultMeta */
type CreateConfig<TMeta extends object> = FunctionsConfig & {
  defaultMeta?: TMeta;
  /** Optional cRPC payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
};

// =============================================================================
// Middleware Factory
// =============================================================================

/**
 * Create a middleware factory for building reusable middleware chains
 *
 * @example
 * ```typescript
 * const loggedIn = c.middleware(({ ctx, next }) => {
 *   if (!ctx.userId) throw new CRPCError({ code: 'UNAUTHORIZED' });
 *   return next({ ctx });
 * });
 *
 * const isAdmin = loggedIn.pipe(({ ctx, next }) => {
 *   if (!ctx.user.isAdmin) throw new CRPCError({ code: 'FORBIDDEN' });
 *   return next({ ctx });
 * });
 * ```
 */
export function createMiddlewareFactory<TDefaultContext, TMeta = object>() {
  function createMiddlewareInner<TContext, $ContextOverridesOut>(
    middlewares: AnyMiddleware[]
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut, unknown> {
    return {
      _middlewares: middlewares,
      pipe<$NewContextOverrides>(
        fn: MiddlewareFunction<
          TContext,
          TMeta,
          $ContextOverridesOut,
          $NewContextOverrides,
          unknown
        >
      ) {
        return createMiddlewareInner<
          TContext,
          Overwrite<$ContextOverridesOut, $NewContextOverrides>
        >([...middlewares, fn as AnyMiddleware]);
      },
    };
  }

  return function createMiddleware<
    TContext = TDefaultContext,
    $ContextOverridesOut = object,
  >(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverridesOut>
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut, unknown> {
    return createMiddlewareInner<TContext, $ContextOverridesOut>([
      fn as AnyMiddleware,
    ]);
  };
}

// =============================================================================
// Middleware Execution
// =============================================================================

/** Result from middleware execution including potentially modified input */
type MiddlewareExecutionResult = MiddlewareResult<unknown> & {
  input: unknown;
};

/** Execute middleware chain recursively with input access */
async function executeMiddlewares(
  middlewares: AnyMiddleware[],
  ctx: unknown,
  meta: unknown,
  input: unknown,
  getRawInput: GetRawInputFn,
  index = 0
): Promise<MiddlewareExecutionResult> {
  // Base case: no more middleware, return final context and input
  if (index >= middlewares.length) {
    return {
      marker: undefined as never, // Runtime doesn't need the marker
      ctx,
      input,
    };
  }

  const middleware = middlewares[index];

  // Track input modifications through the chain
  let currentInput = input;

  // Create next function for this middleware (tRPC-compatible signature)
  const next = async (opts?: { ctx?: unknown; input?: unknown }) => {
    const nextCtx = opts?.ctx ?? ctx;
    const nextInput = opts?.input ?? currentInput;
    // Track input modification
    if (opts?.input !== undefined) {
      currentInput = opts.input;
    }
    const result = await executeMiddlewares(
      middlewares,
      nextCtx,
      meta,
      nextInput,
      getRawInput,
      index + 1
    );
    return result;
  };

  // Execute current middleware with input and getRawInput
  const result = await middleware({
    ctx: ctx as any,
    meta,
    input,
    getRawInput,
    next,
  });

  // Return result with potentially modified context and input
  return {
    marker: undefined as never,
    ctx: result.ctx ?? ctx,
    input: currentInput,
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date);

const toConvexSafeValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    let serialized: unknown[] | undefined;
    for (let index = 0; index < value.length; index += 1) {
      const nested = value[index];
      const encoded = toConvexSafeValue(nested);
      const normalized = encoded === undefined ? null : encoded;
      if (normalized !== nested) {
        if (!serialized) {
          serialized = value.slice();
        }
        serialized[index] = normalized;
      }
    }
    return serialized ?? value;
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
    const encoded = toConvexSafeValue(nested);

    if (encoded === undefined) {
      if (!serialized) {
        serialized = { ...value };
      }
      delete serialized[key];
      continue;
    }

    if (encoded !== nested) {
      if (!serialized) {
        serialized = { ...value };
      }
      serialized[key] = encoded;
    }
  }

  return serialized ?? value;
};

const wrapTwoArgRunner = (
  runner: unknown,
  owner: unknown
): ((functionReference: unknown, args: unknown) => unknown) | undefined => {
  if (typeof runner !== 'function') {
    return;
  }

  return (functionReference: unknown, args: unknown) =>
    Reflect.apply(runner, owner, [functionReference, toConvexSafeValue(args)]);
};

const wrapSchedulerRunner = (
  runner: unknown,
  owner: unknown
):
  | ((first: unknown, functionReference: unknown, args: unknown) => unknown)
  | undefined => {
  if (typeof runner !== 'function') {
    return;
  }

  return (first: unknown, functionReference: unknown, args: unknown) =>
    Reflect.apply(runner, owner, [
      first,
      functionReference,
      toConvexSafeValue(args),
    ]);
};

const withConvexSafeRunners = <TCtx>(ctx: TCtx): TCtx => {
  if (!ctx || typeof ctx !== 'object') {
    return ctx;
  }

  const contextObject = ctx as Record<string, unknown>;
  let changed = false;
  const wrappedContext: Record<string, unknown> = { ...contextObject };

  const runMutation = wrapTwoArgRunner(
    contextObject.runMutation,
    contextObject
  );
  if (runMutation) {
    wrappedContext.runMutation = runMutation;
    changed = true;
  }

  const runQuery = wrapTwoArgRunner(contextObject.runQuery, contextObject);
  if (runQuery) {
    wrappedContext.runQuery = runQuery;
    changed = true;
  }

  const runAction = wrapTwoArgRunner(contextObject.runAction, contextObject);
  if (runAction) {
    wrappedContext.runAction = runAction;
    changed = true;
  }

  const scheduler = contextObject.scheduler;
  if (scheduler && typeof scheduler === 'object') {
    const schedulerObject = scheduler as Record<string, unknown>;
    let schedulerChanged = false;
    const wrappedScheduler: Record<string, unknown> = { ...schedulerObject };

    const runAfter = wrapSchedulerRunner(
      schedulerObject.runAfter,
      schedulerObject
    );
    if (runAfter) {
      wrappedScheduler.runAfter = runAfter;
      schedulerChanged = true;
    }

    const runAt = wrapSchedulerRunner(schedulerObject.runAt, schedulerObject);
    if (runAt) {
      wrappedScheduler.runAt = runAt;
      schedulerChanged = true;
    }

    if (schedulerChanged) {
      wrappedContext.scheduler = wrappedScheduler;
      changed = true;
    }
  }

  return (changed ? wrappedContext : contextObject) as TCtx;
};

// =============================================================================
// Procedure Builder
// =============================================================================

/** Internal definition storing procedure state */
type ProcedureBuilderDef<TMeta = object> = {
  middlewares: AnyMiddleware[];
  inputSchemas: Record<string, any>[];
  outputSchema?: z.ZodTypeAny;
  meta?: TMeta;
  functionConfig: InternalFunctionConfig;
  /** Whether this procedure uses internal function (not exposed to clients) */
  isInternal?: boolean;
};

const replaceUnencodableOutputTypes = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  if (schema instanceof z.ZodDate) {
    return z.any();
  }

  if (schema instanceof z.ZodArray) {
    return z.array(
      replaceUnencodableOutputTypes(schema.element as z.ZodTypeAny)
    );
  }

  if (schema instanceof z.ZodObject) {
    const nextShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      nextShape[key] = replaceUnencodableOutputTypes(value as z.ZodTypeAny);
    }
    return z.object(nextShape);
  }

  if (schema instanceof z.ZodUnion) {
    return z.union(
      schema.options.map((option) =>
        replaceUnencodableOutputTypes(option as z.ZodTypeAny)
      ) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    );
  }

  if (schema instanceof z.ZodOptional) {
    return replaceUnencodableOutputTypes(
      schema.unwrap() as z.ZodTypeAny
    ).optional();
  }

  if (schema instanceof z.ZodNullable) {
    return replaceUnencodableOutputTypes(
      schema.unwrap() as z.ZodTypeAny
    ).nullable();
  }

  if (schema instanceof z.ZodRecord) {
    return z.record(
      schema.keyType as z.ZodString,
      replaceUnencodableOutputTypes(schema.valueType as z.ZodTypeAny)
    );
  }

  return schema;
};

const replaceUnencodableInputTypes = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  if (schema instanceof z.ZodDate) {
    return z.any();
  }

  if (schema instanceof z.ZodArray) {
    return z.array(
      replaceUnencodableInputTypes(schema.element as z.ZodTypeAny)
    );
  }

  if (schema instanceof z.ZodObject) {
    const nextShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      nextShape[key] = replaceUnencodableInputTypes(value as z.ZodTypeAny);
    }
    return z.object(nextShape);
  }

  if (schema instanceof z.ZodUnion) {
    return z.union(
      schema.options.map((option) =>
        replaceUnencodableInputTypes(option as z.ZodTypeAny)
      ) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    );
  }

  if (schema instanceof z.ZodOptional) {
    return replaceUnencodableInputTypes(
      schema.unwrap() as z.ZodTypeAny
    ).optional();
  }

  if (schema instanceof z.ZodNullable) {
    return replaceUnencodableInputTypes(
      schema.unwrap() as z.ZodTypeAny
    ).nullable();
  }

  if (schema instanceof z.ZodRecord) {
    return z.record(
      schema.keyType as z.ZodString,
      replaceUnencodableInputTypes(schema.valueType as z.ZodTypeAny)
    );
  }

  if (schema instanceof z.ZodDefault) {
    return replaceUnencodableInputTypes(schema.removeDefault() as z.ZodTypeAny);
  }

  return schema;
};

const resolveConvexArgsShape = (
  inputShape?: Record<string, z.ZodTypeAny>
): Record<string, z.ZodTypeAny> | undefined => {
  if (!inputShape) return;

  const rawSchema = z.object(inputShape);
  try {
    zodToConvex(rawSchema as any);
    return inputShape;
  } catch {
    const compatibleSchema = replaceUnencodableInputTypes(rawSchema);
    try {
      zodToConvex(compatibleSchema as any);
      return (compatibleSchema as z.ZodObject<any>).shape;
    } catch {
      const permissiveShape = Object.fromEntries(
        Object.keys(inputShape).map((key) => [key, z.any()])
      ) as Record<string, z.ZodTypeAny>;
      return permissiveShape;
    }
  }
};

const resolveConvexReturnsSchema = (
  schema?: z.ZodTypeAny
): z.ZodTypeAny | undefined => {
  if (!schema) return;

  try {
    zodOutputToConvex(schema);
    return schema;
  } catch {
    const compatibleSchema = replaceUnencodableOutputTypes(schema);
    try {
      zodOutputToConvex(compatibleSchema);
      return compatibleSchema;
    } catch {
      return;
    }
  }
};

/**
 * Fluent procedure builder with full type inference
 *
 * @typeParam TBaseCtx - Base context type from config
 * @typeParam TContext - Current context type (starts as TBaseCtx)
 * @typeParam TContextOverrides - Accumulated context from middleware (starts as UnsetMarker)
 * @typeParam TInput - Input schema (starts as UnsetMarker)
 * @typeParam TOutput - Output schema (starts as UnsetMarker)
 * @typeParam TMeta - Procedure metadata type
 */
export class ProcedureBuilder<
  TBaseCtx,
  _TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> {
  protected readonly _def: ProcedureBuilderDef<TMeta>;

  constructor(def: ProcedureBuilderDef<TMeta>) {
    this._def = def;
  }

  /** Add middleware that transforms the context - to be overridden by subclasses */
  protected _use<$ContextOverridesOut>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TBaseCtx,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<TBaseCtx, TMeta, $ContextOverridesOut>
  ): ProcedureBuilderDef<TMeta> {
    const middlewares =
      '_middlewares' in middlewareOrBuilder
        ? middlewareOrBuilder._middlewares
        : [middlewareOrBuilder as AnyMiddleware];
    return {
      ...this._def,
      middlewares: [...this._def.middlewares, ...middlewares],
    };
  }

  /** Define input schema (chainable - schemas are merged) - to be overridden by subclasses */
  protected _input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      inputSchemas: [...this._def.inputSchemas, schema.shape],
    };
  }

  /** Define output schema - to be overridden by subclasses */
  protected _output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      outputSchema: schema,
    };
  }

  /** Set procedure metadata (shallow merged when chained) - to be overridden by subclasses */
  protected _meta(value: TMeta): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      meta: this._def.meta ? { ...this._def.meta, ...value } : value,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /** Merge all input schemas into one */
  protected _getMergedInput(): Record<string, any> | undefined {
    const { inputSchemas } = this._def;
    if (inputSchemas.length === 0) return;
    return Object.assign({}, ...inputSchemas);
  }

  protected _createFunction(
    handler: any,
    baseFunction: any,
    customFn:
      | typeof zCustomQuery
      | typeof zCustomMutation
      | typeof zCustomAction,
    fnType: 'query' | 'mutation' | 'action'
  ) {
    const { middlewares, outputSchema, meta, functionConfig, isInternal } =
      this._def;
    const mergedInput = this._getMergedInput() as
      | Record<string, z.ZodTypeAny>
      | undefined;
    const inputSchema = mergedInput ? z.object(mergedInput) : undefined;
    const convexArgs = resolveConvexArgsShape(mergedInput);

    // Use customCtx for initial context transformation only
    const customFunction = customFn(
      baseFunction,
      customCtx(async (_ctx) =>
        withConvexSafeRunners(await functionConfig.createContext(_ctx))
      )
    );
    const returnsSchema = resolveConvexReturnsSchema(outputSchema);
    const typedReturnsSchema = returnsSchema as
      | (TOutput extends z.ZodTypeAny ? TOutput : never)
      | undefined;
    const typedArgs = (convexArgs ?? {}) as TInput extends z.ZodObject<
      infer TShape
    >
      ? TShape
      : Record<string, never>;
    const shouldValidateOutputWithZod =
      !!outputSchema && returnsSchema !== outputSchema;

    const fn = customFunction({
      args: typedArgs,
      ...(typedReturnsSchema ? { returns: typedReturnsSchema } : {}),
      handler: async (ctx: any, rawInput: any) => {
        const decodedInput =
          functionConfig.transformer.input.deserialize(rawInput);
        const parsedInput = inputSchema
          ? inputSchema.parse(decodedInput)
          : decodedInput;
        // Create getRawInput function for middleware
        const getRawInput: GetRawInputFn = async () => parsedInput;

        try {
          // Execute middleware chain with input access
          const result = await executeMiddlewares(
            middlewares,
            ctx,
            meta,
            parsedInput,
            getRawInput
          );

          // Call handler with middleware-modified context and input
          const handlerInput =
            result.input === parsedInput
              ? parsedInput
              : functionConfig.transformer.input.deserialize(
                  result.input ?? parsedInput
                );
          const output = await handler({
            ctx: result.ctx,
            input: handlerInput,
          });
          const validatedOutput = shouldValidateOutputWithZod
            ? outputSchema.parse(output)
            : output;
          return functionConfig.transformer.output.serialize(validatedOutput);
        } catch (cause) {
          const err = toCRPCError(cause);
          if (err) throw err;
          throw cause;
        }
      },
    });

    // Attach metadata for codegen extraction
    (fn as any)._crpcMeta = {
      type: fnType,
      internal: isInternal ?? false,
      ...meta,
    };
    (fn as any).__betterConvexTransformer = functionConfig.transformer;
    (fn as any).__betterConvexRawHandler = (opts: {
      ctx: unknown;
      input: unknown;
    }) => handler(opts);

    return fn;
  }
}

// =============================================================================
// Query Procedure Builder
// =============================================================================

/**
 * Query-specific procedure builder
 * Only exposes .query() and .internalQuery() methods
 */
export class QueryProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TClientInput extends UnsetMarker | z.ZodObject<any> = TInput,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /**
   * Add middleware that transforms the context
   * Middleware receives typed input if called after .input(), unknown otherwise
   * $ContextOverridesOut is inferred from next()
   */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          any, // Allow reusable middleware with any context
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TClientInput,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TClientInput,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    IntersectIfDefined<TClientInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._input(schema));
  }

  /**
   * Add pagination input (chainable before .query())
   *
   * Creates flat { cursor, limit } input like tRPC and auto-wraps output.
   * User accesses args.cursor and args.limit directly.
   *
   * @param opts.limit - Default/max items per page
   * @param opts.item - Zod schema for each item in the page array
   */
  paginated<TItem extends z.ZodTypeAny>(opts: {
    limit: number;
    item: TItem;
  }): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, PaginatedInputSchema>,
    IntersectIfDefined<TClientInput, PaginatedClientInputSchema>,
    z.ZodObject<{
      continueCursor: z.ZodUnion<[z.ZodString, z.ZodNull]>;
      isDone: z.ZodBoolean;
      page: z.ZodArray<TItem>;
    }>,
    TMeta
  > {
    // Flat pagination schema - user sees { cursor, limit } at top level
    const paginationSchemaWithDefault = z.object({
      cursor: z.union([z.string(), z.null()]).default(null),
      limit: z
        .number()
        .default(opts.limit)
        .transform((n) => Math.min(n, opts.limit)),
    });

    // Auto-wrap output with pagination result structure
    const outputSchema = z.object({
      continueCursor: z.union([z.string(), z.null()]),
      isDone: z.boolean(),
      page: z.array(opts.item),
    });

    return new QueryProcedureBuilder({
      ...this._def,
      inputSchemas: [
        ...this._def.inputSchemas,
        paginationSchemaWithDefault.shape,
      ],
      outputSchema,
      meta: {
        ...this._def.meta,
        limit: opts.limit, // Server default for tooling/codegen
      } as TMeta,
    });
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TClientInput,
    TNewOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._output(schema));
  }

  /** Create a query */
  query<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    const fn = this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomQuery,
      'query'
    );
    return fn as typeof fn &
      CRPCFunctionTypeHint<
        InferClientInput<TClientInput>,
        TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult
      >;
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TClientInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalQuery base function not configured');
    }
    return new QueryProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Mutation Procedure Builder
// =============================================================================

/**
 * Mutation-specific procedure builder
 * Only exposes .mutation() and .internalMutation() methods
 */
export class MutationProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /**
   * Add middleware that transforms the context
   * Middleware receives typed input if called after .input(), unknown otherwise
   * $ContextOverridesOut is inferred from next()
   */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          any, // Allow reusable middleware with any context
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._input(schema));
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TNewOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._output(schema));
  }

  /** Create a mutation */
  mutation<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    const fn = this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomMutation,
      'mutation'
    );
    return fn as typeof fn &
      CRPCFunctionTypeHint<
        InferClientInput<TInput>,
        TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult
      >;
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalMutation base function not configured');
    }
    return new MutationProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Action Procedure Builder
// =============================================================================

/**
 * Action-specific procedure builder
 * Only exposes .action() and .internalAction() methods
 */
export class ActionProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /** Add middleware that transforms the context - $ContextOverridesOut is inferred from next() */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          any, // Allow reusable middleware with any context
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._input(schema));
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TNewOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._output(schema));
  }

  /** Create an action */
  action<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    const fn = this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomAction,
      'action'
    );
    return fn as typeof fn &
      CRPCFunctionTypeHint<
        InferClientInput<TInput>,
        TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult
      >;
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalAction base function not configured');
    }
    return new ActionProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Factory - tRPC-style Builder Chain
// =============================================================================

/** Return type for create() */
type CRPCInstance<
  _DataModel extends GenericDataModel,
  TQueryCtx,
  TMutationCtx,
  TActionCtx,
  THttpActionCtx,
  TMeta extends object = object,
> = {
  query: QueryProcedureBuilder<
    TQueryCtx,
    TQueryCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta
  >;
  mutation: MutationProcedureBuilder<
    TMutationCtx,
    TMutationCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta
  >;
  action: ActionProcedureBuilder<
    TActionCtx,
    TActionCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta
  >;
  httpAction: HttpProcedureBuilder<
    THttpActionCtx,
    THttpActionCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta,
    HttpMethod
  >;
  /** Create reusable middleware - defaults to query context, override with generic */
  middleware: <TContext = TQueryCtx, $ContextOverridesOut = object>(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverridesOut>
  ) => MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut>;
  /** Create HTTP router (like tRPC's t.router) */
  router: <TRecord extends HttpRouterRecord>(
    record: TRecord
  ) => CRPCHttpRouter<TRecord>;
};

/**
 * Builder with context configured, ready to create instance
 */
class CRPCBuilderWithContext<
  DataModel extends GenericDataModel,
  TQueryCtx,
  TMutationCtx,
  TActionCtx = GenericActionCtx<DataModel>,
  THttpActionCtx = GenericActionCtx<DataModel>,
  TMeta extends object = object,
> {
  private readonly contextConfig: ContextConfig<DataModel>;

  constructor(contextConfig: ContextConfig<DataModel>) {
    this.contextConfig = contextConfig;
  }

  /**
   * Define the metadata type for procedures (can be called after context)
   */
  meta<TNewMeta extends object>(): CRPCBuilderWithContext<
    DataModel,
    TQueryCtx,
    TMutationCtx,
    TActionCtx,
    THttpActionCtx,
    TNewMeta
  > {
    return this as unknown as CRPCBuilderWithContext<
      DataModel,
      TQueryCtx,
      TMutationCtx,
      TActionCtx,
      THttpActionCtx,
      TNewMeta
    >;
  }

  /**
   * Create the CRPC instance with function builders
   */
  create(
    config?: CreateConfig<TMeta>
  ): CRPCInstance<
    DataModel,
    TQueryCtx,
    TMutationCtx,
    TActionCtx,
    THttpActionCtx,
    TMeta
  > {
    const {
      defaultMeta = {} as TMeta,
      query = queryGeneric,
      internalQuery = internalQueryGeneric,
      mutation = mutationGeneric,
      internalMutation = internalMutationGeneric,
      action = actionGeneric,
      internalAction = internalActionGeneric,
      httpAction = httpActionGeneric,
      transformer: transformerOptions,
    } = config ?? {};
    const transformer = getTransformer(transformerOptions);
    const mutationCreateContext = this.contextConfig.mutation ?? ((ctx) => ctx);

    const result = {
      query: new QueryProcedureBuilder<
        TQueryCtx,
        TQueryCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: query,
          internal: internalQuery,
          createContext: this.contextConfig.query ?? ((ctx) => ctx),
          transformer,
        },
      }),
      mutation: new MutationProcedureBuilder<
        TMutationCtx,
        TMutationCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: mutation,
          internal: internalMutation,
          createContext: mutationCreateContext,
          transformer,
        },
      }),
      action: new ActionProcedureBuilder<
        TActionCtx,
        TActionCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: action,
          internal: internalAction,
          // Use custom action context or default to identity
          createContext: this.contextConfig.action ?? ((ctx) => ctx),
          transformer,
        },
      }),
      httpAction: createHttpProcedureBuilder({
        base: httpAction as HttpActionConstructor,
        // httpAction uses action context or default to identity
        createContext: (this.contextConfig.action ?? ((ctx) => ctx)) as (
          ctx: GenericActionCtx<GenericDataModel>
        ) => THttpActionCtx,
        meta: defaultMeta,
        transformer: transformerOptions,
      }),
      middleware: createMiddlewareFactory<TQueryCtx, TMeta>(),
      router: createHttpRouterFactory(),
    } as CRPCInstance<
      DataModel,
      TQueryCtx,
      TMutationCtx,
      TActionCtx,
      THttpActionCtx,
      TMeta
    >;

    return result;
  }
}

/**
 * Builder with meta type configured
 */
class CRPCBuilderWithMeta<
  DataModel extends GenericDataModel,
  TMeta extends object = object,
> {
  /**
   * Configure context creators for each function type
   */
  context<TConfig extends ContextConfig<DataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    DataModel,
    InferQueryCtx<TConfig, DataModel>,
    InferMutationCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel>, // httpAction uses action context
    TMeta
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(config?: CreateConfig<TMeta>): CRPCInstance<
    DataModel,
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    GenericActionCtx<DataModel>, // httpAction uses action context
    TMeta
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>,
      GenericActionCtx<DataModel>,
      TMeta
    >({}).create(config);
  }
}

/**
 * Initial CRPC builder - configure meta and context
 */
class CRPCBuilder<DataModel extends GenericDataModel> {
  /**
   * Define the metadata type for procedures
   */
  meta<TMeta extends object>(): CRPCBuilderWithMeta<DataModel, TMeta> {
    return new CRPCBuilderWithMeta();
  }

  /**
   * Configure context creators for each function type
   */
  context<TConfig extends ContextConfig<DataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    DataModel,
    InferQueryCtx<TConfig, DataModel>,
    InferMutationCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel> // httpAction uses action context
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(config?: CreateConfig<object>): CRPCInstance<
    DataModel,
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    GenericActionCtx<DataModel>, // httpAction uses action context
    object
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>,
      GenericActionCtx<DataModel>
    >({}).create(config);
  }
}

/**
 * CRPC entry point - tRPC-style object
 *
 * @example
 * ```typescript
 * // With explicit DataModel type
 * const c = initCRPC
 *   .dataModel<DataModel>()
 *   .context({...})
 *   .create();
 *
 * // Without DataModel (uses GenericDataModel)
 * const c = initCRPC
 *   .context({...})
 *   .create();
 * ```
 */
export const initCRPC = {
  /**
   * Set the DataModel type for the CRPC instance
   */
  dataModel<DataModel extends GenericDataModel>(): CRPCBuilder<DataModel> {
    return new CRPCBuilder();
  },

  /**
   * Define the metadata type (uses GenericDataModel)
   */
  meta<TMeta extends object>(): CRPCBuilderWithMeta<GenericDataModel, TMeta> {
    return new CRPCBuilderWithMeta();
  },

  /**
   * Configure context creators (uses GenericDataModel)
   */
  context<TConfig extends ContextConfig<GenericDataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    GenericDataModel,
    InferQueryCtx<TConfig, GenericDataModel>,
    InferMutationCtx<TConfig, GenericDataModel>,
    InferActionCtx<TConfig, GenericDataModel>,
    InferActionCtx<TConfig, GenericDataModel> // httpAction uses action context
  > {
    return new CRPCBuilderWithContext(config);
  },

  /**
   * Create the CRPC instance directly (uses GenericDataModel and default passthrough context)
   */
  create(config?: CreateConfig<object>): CRPCInstance<
    GenericDataModel,
    GenericQueryCtx<GenericDataModel>,
    GenericMutationCtx<GenericDataModel>,
    GenericActionCtx<GenericDataModel>,
    GenericActionCtx<GenericDataModel>, // httpAction uses action context
    object
  > {
    return new CRPCBuilderWithContext<
      GenericDataModel,
      GenericQueryCtx<GenericDataModel>,
      GenericMutationCtx<GenericDataModel>,
      GenericActionCtx<GenericDataModel>,
      GenericActionCtx<GenericDataModel>
    >({}).create(config);
  },
};
