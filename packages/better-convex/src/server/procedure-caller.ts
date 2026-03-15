import type { FunctionReference, FunctionReturnType } from 'convex/server';
import {
  type DataTransformerOptions,
  decodeWire,
  encodeWire,
} from '../crpc/transformer';
import type { EmptyObject } from '../internal/upstream';
import type { CRPCFunctionTypeHint } from './builder';

type ProcedureType = 'query' | 'mutation' | 'action';
type CallerContextType = 'query' | 'mutation';
type CallerExecutionMode = 'caller' | 'handler';

type ProcedureHandler = (ctx: unknown, input: unknown) => unknown;
type ProcedureRawHandler = (opts: { ctx: unknown; input: unknown }) => unknown;

type ProcedureExport = {
  _handler?: ProcedureHandler;
  _crpcMeta?: {
    type?: ProcedureType;
  };
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  __betterConvexTransformer?: DataTransformerOptions;
  __betterConvexRawHandler?: ProcedureRawHandler;
};

type RecordLike = Record<string, unknown>;
type ProcedureTree = RecordLike;

export type ProcedureDefinition<
  TType extends ProcedureType,
  TProcedure,
> = Readonly<{
  _type: TType;
  __procedure?: TProcedure;
}>;

type ProcedureHandlerType<TProcedure> = NonNullable<
  TProcedure extends { _handler?: infer THandler } ? THandler : never
>;

type ProcedureTypeHintInput<TProcedure> = TProcedure extends {
  __betterConvexTypeHint?: {
    args: infer TArgs;
  };
}
  ? TArgs
  : never;

type ProcedureTypeHintOutput<TProcedure> = TProcedure extends {
  __betterConvexTypeHint?: {
    returns: infer TReturns;
  };
}
  ? TReturns
  : never;

type InferredHandlerInput<TProcedure> =
  ProcedureHandlerType<TProcedure> extends (
    ctx: unknown,
    input: infer TInput,
    ...rest: any[]
  ) => unknown
    ? TInput
    : Record<string, never>;

type InferredHandlerOutput<TProcedure> =
  ProcedureHandlerType<TProcedure> extends (...args: any[]) => infer TResult
    ? Awaited<TResult>
    : never;

type ProcedureInput<TProcedure> = [ProcedureTypeHintInput<TProcedure>] extends [
  never,
]
  ? InferredHandlerInput<TProcedure>
  : ProcedureTypeHintInput<TProcedure>;

type ProcedureOutput<TProcedure> = [
  ProcedureTypeHintOutput<TProcedure>,
] extends [never]
  ? InferredHandlerOutput<TProcedure>
  : ProcedureTypeHintOutput<TProcedure>;

type ProcedureCallable<TProcedure> =
  keyof ProcedureInput<TProcedure> extends never
    ? (input?: EmptyObject) => Promise<ProcedureOutput<TProcedure>>
    : EmptyObject extends ProcedureInput<TProcedure>
      ? (
          input?: ProcedureInput<TProcedure>
        ) => Promise<ProcedureOutput<TProcedure>>
      : (
          input: ProcedureInput<TProcedure>
        ) => Promise<ProcedureOutput<TProcedure>>;

type SchedulableProcedureType = Exclude<ProcedureType, 'query'>;

type AllowedProcedureType<TCtxType extends CallerContextType> =
  TCtxType extends 'query' ? 'query' : 'query' | 'mutation';

type CallerKey<
  TValue,
  TCtxType extends CallerContextType,
  TKey extends PropertyKey,
> =
  TValue extends ProcedureDefinition<infer TType, any>
    ? TType extends AllowedProcedureType<TCtxType>
      ? TKey
      : never
    : TValue extends RecordLike
      ? TKey
      : never;

export type ProcedureCaller<
  TApi,
  TCtxType extends CallerContextType,
> = TApi extends RecordLike
  ? {
      [K in keyof TApi as CallerKey<
        TApi[K],
        TCtxType,
        K
      >]: TApi[K] extends ProcedureDefinition<any, infer TProcedure>
        ? ProcedureCallable<TProcedure>
        : TApi[K] extends RecordLike
          ? ProcedureCaller<TApi[K], TCtxType>
          : never;
    }
  : never;

type CallerForContext<TApi, TCtx, TQueryCtx, TMutationCtx> =
  TCtx extends TMutationCtx
    ? ProcedureCaller<TApi, 'mutation'>
    : TCtx extends TQueryCtx
      ? ProcedureCaller<TApi, 'query'>
      : never;

type UnionToIntersection<TUnion> = (
  TUnion extends unknown
    ? (value: TUnion) => void
    : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type Simplify<TObject> = { [K in keyof TObject]: TObject[K] } & {};

type SimplifyDeep<TObject> =
  TObject extends Record<string, unknown>
    ? Simplify<{
        [K in keyof TObject]: SimplifyDeep<TObject[K]>;
      }>
    : TObject;

type SplitPath<TPath extends string> =
  TPath extends `${infer THead}.${infer TRest}`
    ? [THead, ...SplitPath<TRest>]
    : TPath extends ''
      ? []
      : [TPath];

type BuildPathShape<TSegments extends string[], TValue> = TSegments extends [
  infer THead extends string,
  ...infer TRest extends string[],
]
  ? {
      [K in THead]: TRest['length'] extends 0
        ? TValue
        : BuildPathShape<TRest, TValue>;
    }
  : never;

type ResolverOutput<TResolver> = TResolver extends (
  ...args: any[]
) => infer TResult
  ? Awaited<TResult>
  : never;

type RegistryEntryToPathShape<
  TPath extends string,
  TEntry,
  TAllowed extends ProcedureType,
> = TEntry extends readonly [infer TType extends ProcedureType, infer TResolver]
  ? TType extends TAllowed
    ? BuildPathShape<
        SplitPath<TPath>,
        ProcedureCallable<
          ResolverOutput<Extract<TResolver, (...args: any[]) => unknown>>
        >
      >
    : {}
  : {};

export type GeneratedProcedureRegistryEntry<
  TType extends ProcedureType = ProcedureType,
  TResolver extends (...args: any[]) => unknown = (...args: any[]) => unknown,
> = readonly [TType, TResolver];

export type GeneratedProcedureRegistry = Record<
  string,
  GeneratedProcedureRegistryEntry
>;

type ProcedureCallerFromRegistryByAllowedTypes<
  TRegistry extends GeneratedProcedureRegistry,
  TAllowed extends ProcedureType,
> = SimplifyDeep<
  UnionToIntersection<
    {
      [K in keyof TRegistry & string]: RegistryEntryToPathShape<
        K,
        TRegistry[K],
        TAllowed
      >;
    }[keyof TRegistry & string]
  >
>;

export type ProcedureCallerFromRegistry<
  TRegistry extends GeneratedProcedureRegistry,
  TCtxType extends CallerContextType,
> = TCtxType extends 'query'
  ? ProcedureCallerFromRegistryByAllowedTypes<TRegistry, 'query'>
  : ProcedureCallerFromRegistryByAllowedTypes<TRegistry, 'query' | 'mutation'>;

export type ProcedureActionCallerFromRegistry<
  TRegistry extends GeneratedProcedureRegistry,
> = ProcedureCallerFromRegistryByAllowedTypes<TRegistry, 'action'>;

export type ProcedureSchedulableCallerFromRegistry<
  TRegistry extends GeneratedProcedureRegistry,
> = ProcedureCallerFromRegistryByAllowedTypes<
  TRegistry,
  SchedulableProcedureType
>;

export type ProcedureScheduleCallerFromRegistry<
  TRegistry extends GeneratedProcedureRegistry,
> = {
  after: (delayMs: number) => ProcedureSchedulableCallerFromRegistry<TRegistry>;
  at: (
    timestamp: number | Date
  ) => ProcedureSchedulableCallerFromRegistry<TRegistry>;
  now: ProcedureSchedulableCallerFromRegistry<TRegistry>;
  cancel: (id: string) => Promise<void>;
};

type ProcedureMutationCallerWithSchedule<
  TRegistry extends GeneratedProcedureRegistry,
> = SimplifyDeep<
  ProcedureCallerFromRegistryByAllowedTypes<TRegistry, 'query' | 'mutation'> & {
    schedule: ProcedureScheduleCallerFromRegistry<TRegistry>;
  }
>;

type ProcedureActionCallerWithNamespaces<
  TRegistry extends GeneratedProcedureRegistry,
> = SimplifyDeep<
  ProcedureCallerFromRegistryByAllowedTypes<TRegistry, 'query' | 'mutation'> & {
    actions: ProcedureActionCallerFromRegistry<TRegistry>;
    schedule: ProcedureScheduleCallerFromRegistry<TRegistry>;
  }
>;

export type GeneratedRegistryCallerForContext<
  TRegistry extends GeneratedProcedureRegistry,
  TCtx,
  TQueryCtx,
  TMutationCtx,
  TActionCtx = never,
> = TCtx extends TMutationCtx
  ? ProcedureMutationCallerWithSchedule<TRegistry>
  : TCtx extends TActionCtx
    ? ProcedureActionCallerWithNamespaces<TRegistry>
    : TCtx extends TQueryCtx
      ? ProcedureCallerFromRegistry<TRegistry, 'query'>
      : never;

export type GeneratedRegistryHandlerForContext<
  TRegistry extends GeneratedProcedureRegistry,
  TCtx,
  TQueryCtx,
  TMutationCtx,
> = TCtx extends TMutationCtx
  ? ProcedureCallerFromRegistry<TRegistry, 'mutation'>
  : TCtx extends TQueryCtx
    ? ProcedureCallerFromRegistry<TRegistry, 'query'>
    : never;

export type CreateProcedureCallerFactoryOptions<TApi extends ProcedureTree> = {
  api: TApi;
  resolver: (path: string[]) => Promise<unknown> | unknown;
};

type AnyProcedureFunctionReference = FunctionReference<
  'query' | 'mutation' | 'action',
  any,
  any,
  any
>;

type ProcedureTypeFromFunctionReference<
  TFunctionReference extends AnyProcedureFunctionReference,
> =
  TFunctionReference extends FunctionReference<
    infer TProcedureType,
    any,
    any,
    any
  >
    ? TProcedureType extends ProcedureType
      ? TProcedureType
      : never
    : never;

export type ProcedureFromFunctionReference<
  TFunctionReference extends AnyProcedureFunctionReference,
> = CRPCFunctionTypeHint<
  TFunctionReference['_args'],
  FunctionReturnType<TFunctionReference>
> & {
  _crpcMeta?: {
    type?: ProcedureTypeFromFunctionReference<TFunctionReference>;
  };
  _handler?: (
    ctx: unknown,
    input: TFunctionReference['_args']
  ) =>
    | FunctionReturnType<TFunctionReference>
    | Promise<FunctionReturnType<TFunctionReference>>;
};

type ProcedureResolverFromFunctionReference<
  TFunctionReference extends AnyProcedureFunctionReference,
> = () =>
  | ProcedureFromFunctionReference<TFunctionReference>
  | Promise<ProcedureFromFunctionReference<TFunctionReference>>;

const FUNCTION_REFERENCE_METADATA_KEY = '__betterConvexFunctionReference';

type ProcedureResolverWithFunctionReference = (() =>
  | unknown
  | Promise<unknown>) & {
  [FUNCTION_REFERENCE_METADATA_KEY]?: AnyProcedureFunctionReference;
};

export function typedProcedureResolver<
  TFunctionReference extends AnyProcedureFunctionReference,
>(
  functionReference: TFunctionReference,
  resolver: () => unknown | Promise<unknown>
): ProcedureResolverFromFunctionReference<TFunctionReference> {
  const typedResolver =
    resolver as ProcedureResolverFromFunctionReference<TFunctionReference>;
  (typedResolver as ProcedureResolverWithFunctionReference)[
    FUNCTION_REFERENCE_METADATA_KEY
  ] = functionReference;
  return typedResolver;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function isProcedureType(value: unknown): value is ProcedureType {
  return value === 'query' || value === 'mutation' || value === 'action';
}

function isProcedureDefinition(
  value: unknown
): value is ProcedureDefinition<ProcedureType, unknown> {
  return isRecord(value) && isProcedureType(value._type);
}

function getProcedureTypeFromExport(
  value: ProcedureExport
): ProcedureType | null {
  const crpcType = value._crpcMeta?.type;
  if (isProcedureType(crpcType)) {
    return crpcType;
  }
  if (value.isQuery === true) {
    return 'query';
  }
  if (value.isMutation === true) {
    return 'mutation';
  }
  if (value.isAction === true) {
    return 'action';
  }
  return null;
}

function isProcedureExport(value: unknown): value is ProcedureExport {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return false;
  }
  const exportValue = value as ProcedureExport;
  if (typeof exportValue._handler !== 'function') return false;
  return getProcedureTypeFromExport(exportValue) !== null;
}

function decodeProcedureResult(procedure: ProcedureExport, value: unknown) {
  return decodeWire(value, procedure.__betterConvexTransformer);
}

function encodeProcedureInput(procedure: ProcedureExport, value: unknown) {
  return encodeWire(value, procedure.__betterConvexTransformer);
}

async function executeProcedure(
  procedure: ProcedureExport,
  mode: CallerExecutionMode,
  pathString: string,
  ctx: unknown,
  input: unknown
) {
  if (mode === 'handler') {
    if (typeof procedure.__betterConvexRawHandler === 'function') {
      return procedure.__betterConvexRawHandler({ ctx, input });
    }

    if (typeof procedure._handler === 'function') {
      return procedure._handler(ctx, input);
    }

    throw new Error(
      `[better-convex] Resolved procedure does not expose a raw handler: "${pathString}".`
    );
  }

  const result = await procedure._handler?.(ctx, input);
  return decodeProcedureResult(procedure, result);
}

function getNodeAtPath(api: ProcedureTree, path: string[]) {
  let current: unknown = api;

  for (const segment of path) {
    if (!isRecord(current)) {
      return;
    }
    current = current[segment];
    if (current === undefined) {
      return;
    }
  }

  return current;
}

function getContextType(ctx: unknown): ProcedureType | 'unknown' {
  if (!isRecord(ctx)) {
    return 'unknown';
  }

  const hasDb = 'db' in ctx;
  const hasRunQuery = typeof ctx.runQuery === 'function';
  const hasRunMutation = typeof ctx.runMutation === 'function';
  const hasRunAction = typeof ctx.runAction === 'function';

  if (!hasDb && (hasRunQuery || hasRunMutation || hasRunAction)) {
    return 'action';
  }

  if (hasRunMutation) {
    return 'mutation';
  }

  if (hasDb) {
    return 'query';
  }

  return 'unknown';
}

type AssertCanInvokeOptions = {
  supportsActionContext?: boolean;
};

function assertCanInvoke(
  ctxType: ProcedureType | 'unknown',
  procedureType: ProcedureType,
  pathString: string,
  opts: AssertCanInvokeOptions = {}
) {
  if (ctxType === 'action') {
    if (!opts.supportsActionContext) {
      throw new Error(
        `[better-convex] Action context is not supported by createCaller(ctx): "${pathString}".`
      );
    }
    if (procedureType === 'action') {
      throw new Error(
        `[better-convex] Cannot call action procedures from action context: "${pathString}".`
      );
    }
    return;
  }

  if (ctxType !== 'query' && ctxType !== 'mutation') {
    throw new Error(
      `[better-convex] Unsupported context for createCaller(ctx): "${pathString}".`
    );
  }

  if (ctxType === 'query' && procedureType !== 'query') {
    throw new Error(
      `[better-convex] Cannot call ${procedureType} procedures from query context: "${pathString}".`
    );
  }

  if (ctxType === 'mutation' && procedureType === 'action') {
    throw new Error(
      `[better-convex] Mutation context cannot call action procedures: "${pathString}".`
    );
  }
}

function createRecursiveProxy(
  path: string[],
  ctx: unknown,
  opts: CreateProcedureCallerFactoryOptions<any>,
  mode: CallerExecutionMode
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      return createRecursiveProxy([...path, prop], ctx, opts, mode);
    },
    async apply(_target, _thisArg, argsList) {
      const pathString = path.join('.');
      const node = getNodeAtPath(opts.api, path);

      if (node === undefined) {
        throw new Error(
          `[better-convex] Invalid procedure path: "${pathString}".`
        );
      }

      if (!isProcedureDefinition(node)) {
        throw new Error(
          `[better-convex] Path does not resolve to a procedure: "${pathString}".`
        );
      }

      const ctxType = getContextType(ctx);
      assertCanInvoke(ctxType, node._type, pathString);

      const resolved = await opts.resolver(path);
      if (!isProcedureExport(resolved)) {
        throw new Error(
          `[better-convex] Resolved value is not a cRPC procedure: "${pathString}".`
        );
      }

      const resolvedType = getProcedureTypeFromExport(resolved);
      if (resolvedType !== node._type) {
        throw new Error(
          `[better-convex] Procedure type mismatch at "${pathString}". Expected "${node._type}" but got "${resolvedType ?? 'unknown'}".`
        );
      }

      return executeProcedure(
        resolved,
        mode,
        pathString,
        ctx,
        argsList[0] ?? {}
      );
    },
  });
}

function hasProcedurePrefix(
  registry: GeneratedProcedureRegistry,
  key: string
): boolean {
  const prefix = `${key}.`;
  for (const path in registry) {
    if (path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

type RuntimeGeneratedRegistry = Record<
  string,
  readonly [ProcedureType, () => Promise<unknown> | unknown]
>;

function getResolverFunctionReference(
  resolver: () => Promise<unknown> | unknown
) {
  return (resolver as ProcedureResolverWithFunctionReference)[
    FUNCTION_REFERENCE_METADATA_KEY
  ];
}

type ActionDispatchContext = {
  runAction?: (functionReference: unknown, args: unknown) => unknown;
  runMutation?: (functionReference: unknown, args: unknown) => unknown;
  runQuery?: (functionReference: unknown, args: unknown) => unknown;
  scheduler?: {
    runAfter?: (
      delayMs: number,
      functionReference: unknown,
      args: unknown
    ) => unknown;
    runAt?: (
      timestamp: number | Date,
      functionReference: unknown,
      args: unknown
    ) => unknown;
    cancel?: (id: unknown) => unknown;
  };
};

async function executeActionContextProcedure(
  ctx: unknown,
  procedureType: Exclude<ProcedureType, 'action'>,
  procedure: ProcedureExport | null,
  pathString: string,
  resolver: () => Promise<unknown> | unknown,
  input: unknown
) {
  const ctxValue = ctx as ActionDispatchContext;
  const functionReference = getResolverFunctionReference(resolver);

  if (!functionReference) {
    throw new Error(
      `[better-convex] Missing function reference metadata for action context dispatch: "${pathString}".`
    );
  }

  const encodedInput = procedure
    ? encodeProcedureInput(procedure, input)
    : input;
  const runner =
    procedureType === 'query' ? ctxValue.runQuery : ctxValue.runMutation;

  if (typeof runner !== 'function') {
    const runnerName = procedureType === 'query' ? 'runQuery' : 'runMutation';
    throw new Error(
      `[better-convex] Action context is missing ctx.${runnerName} for "${pathString}".`
    );
  }

  const result = await runner(functionReference, encodedInput);
  return procedure ? decodeProcedureResult(procedure, result) : result;
}

async function executeActionContextActionProcedure(
  ctx: unknown,
  procedure: ProcedureExport | null,
  pathString: string,
  resolver: () => Promise<unknown> | unknown,
  input: unknown
) {
  const ctxValue = ctx as ActionDispatchContext;
  const functionReference = getResolverFunctionReference(resolver);

  if (!functionReference) {
    throw new Error(
      `[better-convex] Missing function reference metadata for action context dispatch: "${pathString}".`
    );
  }

  if (typeof ctxValue.runAction !== 'function') {
    throw new Error(
      `[better-convex] Action context is missing ctx.runAction for "${pathString}".`
    );
  }

  const encodedInput = procedure
    ? encodeProcedureInput(procedure, input)
    : input;
  const result = await ctxValue.runAction(functionReference, encodedInput);
  return procedure ? decodeProcedureResult(procedure, result) : result;
}

type ScheduleDispatchMode =
  | {
      type: 'after';
      delayMs: number;
    }
  | {
      type: 'at';
      timestamp: number | Date;
    };

function getScheduleRunner(
  ctx: unknown,
  pathString: string,
  mode: ScheduleDispatchMode
) {
  const scheduler = (ctx as ActionDispatchContext).scheduler;
  if (!scheduler || typeof scheduler !== 'object') {
    throw new Error(
      `[better-convex] Context is missing ctx.scheduler for "${pathString}".`
    );
  }

  if (mode.type === 'after') {
    if (typeof scheduler.runAfter !== 'function') {
      throw new Error(
        `[better-convex] Context is missing ctx.scheduler.runAfter for "${pathString}".`
      );
    }
    return (functionReference: unknown, args: unknown) =>
      scheduler.runAfter?.(mode.delayMs, functionReference, args);
  }

  if (typeof scheduler.runAt !== 'function') {
    throw new Error(
      `[better-convex] Context is missing ctx.scheduler.runAt for "${pathString}".`
    );
  }
  return (functionReference: unknown, args: unknown) =>
    scheduler.runAt?.(mode.timestamp, functionReference, args);
}

async function executeScheduledProcedure(
  ctx: unknown,
  mode: ScheduleDispatchMode,
  procedure: ProcedureExport | null,
  pathString: string,
  resolver: () => Promise<unknown> | unknown,
  input: unknown
) {
  const functionReference = getResolverFunctionReference(resolver);
  if (!functionReference) {
    throw new Error(
      `[better-convex] Missing function reference metadata for schedule dispatch: "${pathString}".`
    );
  }

  const schedule = getScheduleRunner(ctx, pathString, mode);
  const encodedInput = procedure
    ? encodeProcedureInput(procedure, input)
    : input;
  return schedule(functionReference, encodedInput);
}

function createActionsRegistryProxy(
  path: string[],
  ctx: unknown,
  registry: RuntimeGeneratedRegistry
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      return createActionsRegistryProxy([...path, prop], ctx, registry);
    },
    async apply(_target, _thisArg, argsList) {
      const pathString = path.join('.');
      const entry = registry[pathString];

      if (!entry) {
        if (hasProcedurePrefix(registry, pathString)) {
          throw new Error(
            `[better-convex] Path does not resolve to an action procedure: "${pathString}".`
          );
        }
        throw new Error(
          `[better-convex] Invalid procedure path: "${pathString}".`
        );
      }

      const [procedureType, resolveProcedure] = entry;
      if (procedureType !== 'action') {
        throw new Error(
          `[better-convex] Path does not resolve to an action procedure: "${pathString}".`
        );
      }

      if (getContextType(ctx) !== 'action') {
        throw new Error(
          `[better-convex] Action procedures require action context: "${pathString}".`
        );
      }

      const resolved = await resolveProcedure();
      const procedure = isProcedureExport(resolved) ? resolved : null;
      const canDispatchDirectly =
        !!getResolverFunctionReference(resolveProcedure);
      if (!procedure && !canDispatchDirectly) {
        throw new Error(
          `[better-convex] Resolved value is not a cRPC procedure: "${pathString}".`
        );
      }

      const resolvedType = procedure
        ? getProcedureTypeFromExport(procedure)
        : null;
      if (procedure && resolvedType !== procedureType) {
        throw new Error(
          `[better-convex] Procedure type mismatch at "${pathString}". Expected "${procedureType}" but got "${resolvedType ?? 'unknown'}".`
        );
      }

      return executeActionContextActionProcedure(
        ctx,
        procedure,
        pathString,
        resolveProcedure,
        argsList[0] ?? {}
      );
    },
  });
}

function createScheduledRegistryProxy(
  path: string[],
  ctx: unknown,
  registry: RuntimeGeneratedRegistry,
  mode: ScheduleDispatchMode
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      return createScheduledRegistryProxy([...path, prop], ctx, registry, mode);
    },
    async apply(_target, _thisArg, argsList) {
      const pathString = path.join('.');
      const entry = registry[pathString];

      if (!entry) {
        if (hasProcedurePrefix(registry, pathString)) {
          throw new Error(
            `[better-convex] Path does not resolve to a schedulable procedure: "${pathString}".`
          );
        }
        throw new Error(
          `[better-convex] Invalid procedure path: "${pathString}".`
        );
      }

      const [procedureType, resolveProcedure] = entry;
      if (procedureType === 'query') {
        throw new Error(
          `[better-convex] Cannot schedule query procedures: "${pathString}".`
        );
      }

      const ctxType = getContextType(ctx);
      if (ctxType !== 'mutation' && ctxType !== 'action') {
        throw new Error(
          `[better-convex] Scheduling requires mutation or action context: "${pathString}".`
        );
      }

      const resolved = await resolveProcedure();
      const procedure = isProcedureExport(resolved) ? resolved : null;
      const canDispatchDirectly =
        !!getResolverFunctionReference(resolveProcedure);
      if (!procedure && !canDispatchDirectly) {
        throw new Error(
          `[better-convex] Resolved value is not a cRPC procedure: "${pathString}".`
        );
      }

      const resolvedType = procedure
        ? getProcedureTypeFromExport(procedure)
        : null;
      if (procedure && resolvedType !== procedureType) {
        throw new Error(
          `[better-convex] Procedure type mismatch at "${pathString}". Expected "${procedureType}" but got "${resolvedType ?? 'unknown'}".`
        );
      }

      return executeScheduledProcedure(
        ctx,
        mode,
        procedure,
        pathString,
        resolveProcedure,
        argsList[0] ?? {}
      );
    },
  });
}

function createScheduleNamespace(
  ctx: unknown,
  registry: RuntimeGeneratedRegistry
): ProcedureScheduleCallerFromRegistry<GeneratedProcedureRegistry> {
  const nowProxy = createScheduledRegistryProxy([], ctx, registry, {
    type: 'after',
    delayMs: 0,
  });
  const schedule = {
    after: (delayMs: number) =>
      createScheduledRegistryProxy([], ctx, registry, {
        type: 'after',
        delayMs,
      }),
    at: (timestamp: number | Date) =>
      createScheduledRegistryProxy([], ctx, registry, {
        type: 'at',
        timestamp,
      }),
    now: nowProxy,
    cancel: async (id: string) => {
      const scheduler = (ctx as ActionDispatchContext).scheduler;
      if (!scheduler || typeof scheduler !== 'object') {
        throw new Error(
          '[better-convex] Context is missing ctx.scheduler for "schedule.cancel".'
        );
      }
      if (typeof scheduler.cancel !== 'function') {
        throw new Error(
          '[better-convex] Context is missing ctx.scheduler.cancel for "schedule.cancel".'
        );
      }
      return scheduler.cancel(id);
    },
  };
  return schedule as ProcedureScheduleCallerFromRegistry<GeneratedProcedureRegistry>;
}

function createRegistryProxy(
  path: string[],
  ctx: unknown,
  registry: RuntimeGeneratedRegistry,
  mode: CallerExecutionMode,
  supportsActionContext: boolean
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;
      if (mode === 'caller' && path.length === 0 && prop === 'actions') {
        return createActionsRegistryProxy([], ctx, registry);
      }
      if (mode === 'caller' && path.length === 0 && prop === 'schedule') {
        return createScheduleNamespace(ctx, registry);
      }

      return createRegistryProxy(
        [...path, prop],
        ctx,
        registry,
        mode,
        supportsActionContext
      );
    },
    async apply(_target, _thisArg, argsList) {
      const pathString = path.join('.');
      const entry = registry[pathString];

      if (!entry) {
        if (hasProcedurePrefix(registry, pathString)) {
          throw new Error(
            `[better-convex] Path does not resolve to a procedure: "${pathString}".`
          );
        }
        throw new Error(
          `[better-convex] Invalid procedure path: "${pathString}".`
        );
      }

      const [procedureType, resolveProcedure] = entry;
      const ctxType = getContextType(ctx);
      assertCanInvoke(ctxType, procedureType, pathString, {
        supportsActionContext,
      });

      const resolved = await resolveProcedure();
      const procedure = isProcedureExport(resolved) ? resolved : null;
      const canDispatchDirectly =
        mode === 'caller' &&
        ctxType === 'action' &&
        !!getResolverFunctionReference(resolveProcedure);
      if (!procedure && !canDispatchDirectly) {
        throw new Error(
          `[better-convex] Resolved value is not a cRPC procedure: "${pathString}".`
        );
      }

      const resolvedType = procedure
        ? getProcedureTypeFromExport(procedure)
        : null;
      if (procedure && resolvedType !== procedureType) {
        throw new Error(
          `[better-convex] Procedure type mismatch at "${pathString}". Expected "${procedureType}" but got "${resolvedType ?? 'unknown'}".`
        );
      }

      const input = argsList[0] ?? {};
      if (ctxType === 'action' && mode === 'caller') {
        if (procedureType === 'action') {
          throw new Error(
            `[better-convex] Cannot call action procedures from action context: "${pathString}".`
          );
        }
        return executeActionContextProcedure(
          ctx,
          procedureType,
          procedure,
          pathString,
          resolveProcedure,
          input
        );
      }

      if (!procedure) {
        throw new Error(
          `[better-convex] Resolved value is not a cRPC procedure: "${pathString}".`
        );
      }
      return executeProcedure(procedure, mode, pathString, ctx, input);
    },
  });
}

export function defineProcedure<TType extends ProcedureType, TProcedure>(
  type: TType
): ProcedureDefinition<TType, TProcedure> {
  return { _type: type } as ProcedureDefinition<TType, TProcedure>;
}

export function createProcedureCallerFactory<
  TQueryCtx,
  TMutationCtx,
  TApi extends ProcedureTree,
>(opts: CreateProcedureCallerFactoryOptions<TApi>) {
  return function createCaller<TCtx extends TQueryCtx | TMutationCtx>(
    ctx: TCtx
  ): CallerForContext<TApi, TCtx, TQueryCtx, TMutationCtx> {
    return createRecursiveProxy([], ctx, opts, 'caller') as CallerForContext<
      TApi,
      TCtx,
      TQueryCtx,
      TMutationCtx
    >;
  };
}

export function createProcedureHandlerFactory<
  TQueryCtx,
  TMutationCtx,
  TApi extends ProcedureTree,
>(opts: CreateProcedureCallerFactoryOptions<TApi>) {
  return function createHandler<TCtx extends TQueryCtx | TMutationCtx>(
    ctx: TCtx
  ): CallerForContext<TApi, TCtx, TQueryCtx, TMutationCtx> {
    return createRecursiveProxy([], ctx, opts, 'handler') as CallerForContext<
      TApi,
      TCtx,
      TQueryCtx,
      TMutationCtx
    >;
  };
}

export function createGenericCallerFactory<
  TQueryCtx,
  TMutationCtx,
  TRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
>(registry: TRegistry) {
  return function createCaller<
    TCtx extends TQueryCtx | TMutationCtx | TActionCtx,
  >(
    ctx: TCtx
  ): GeneratedRegistryCallerForContext<
    TRegistry,
    TCtx,
    TQueryCtx,
    TMutationCtx,
    TActionCtx
  > {
    return createRegistryProxy(
      [],
      ctx,
      registry as RuntimeGeneratedRegistry,
      'caller',
      true
    ) as GeneratedRegistryCallerForContext<
      TRegistry,
      TCtx,
      TQueryCtx,
      TMutationCtx,
      TActionCtx
    >;
  };
}

export function createGenericHandlerFactory<
  TQueryCtx,
  TMutationCtx,
  TRegistry extends GeneratedProcedureRegistry,
>(registry: TRegistry) {
  return function createHandler<TCtx extends TQueryCtx | TMutationCtx>(
    ctx: TCtx
  ): GeneratedRegistryHandlerForContext<
    TRegistry,
    TCtx,
    TQueryCtx,
    TMutationCtx
  > {
    return createRegistryProxy(
      [],
      ctx,
      registry as RuntimeGeneratedRegistry,
      'handler',
      false
    ) as GeneratedRegistryHandlerForContext<
      TRegistry,
      TCtx,
      TQueryCtx,
      TMutationCtx
    >;
  };
}

export type GeneratedRegistryCallerFactory<
  TQueryCtx,
  TMutationCtx,
  TRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
> = <TCtx extends TQueryCtx | TMutationCtx | TActionCtx>(
  ctx: TCtx
) => GeneratedRegistryCallerForContext<
  TRegistry,
  TCtx,
  TQueryCtx,
  TMutationCtx,
  TActionCtx
>;

export type GeneratedRegistryHandlerFactory<
  TQueryCtx,
  TMutationCtx,
  TRegistry extends GeneratedProcedureRegistry,
> = <TCtx extends TQueryCtx | TMutationCtx>(
  ctx: TCtx
) => GeneratedRegistryHandlerForContext<
  TRegistry,
  TCtx,
  TQueryCtx,
  TMutationCtx
>;

type GeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
> = {
  getCallerFactory: () => GeneratedRegistryCallerFactory<
    TQueryCtx,
    TMutationCtx,
    TCallerRegistry,
    TActionCtx
  >;
};

type GeneratedRegistryRuntimeWithHandler<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry extends GeneratedProcedureRegistry,
  THandlerRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
> = GeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry,
  TActionCtx
> & {
  getHandlerFactory: () => GeneratedRegistryHandlerFactory<
    TQueryCtx,
    TMutationCtx,
    THandlerRegistry
  >;
};

export function createGeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
>(
  createRegistry: () => {
    procedureRegistry: TCallerRegistry;
  }
): GeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry,
  TActionCtx
>;

export function createGeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
  THandlerRegistry extends
    GeneratedProcedureRegistry = GeneratedProcedureRegistry,
>(
  createRegistry: () => {
    procedureRegistry: TCallerRegistry;
    handlerRegistry: THandlerRegistry;
  }
): GeneratedRegistryRuntimeWithHandler<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry,
  THandlerRegistry,
  TActionCtx
>;

export function createGeneratedRegistryRuntime<
  TQueryCtx,
  TMutationCtx,
  TCallerRegistry extends GeneratedProcedureRegistry,
  TActionCtx = never,
  THandlerRegistry extends GeneratedProcedureRegistry | undefined =
    | GeneratedProcedureRegistry
    | undefined,
>(
  createRegistry: () => {
    procedureRegistry: TCallerRegistry;
    handlerRegistry?: THandlerRegistry;
  }
) {
  let cachedRegistry:
    | {
        procedureRegistry: TCallerRegistry;
        handlerRegistry?: THandlerRegistry;
      }
    | undefined;
  let cachedCallerFactory:
    | GeneratedRegistryCallerFactory<
        TQueryCtx,
        TMutationCtx,
        TCallerRegistry,
        TActionCtx
      >
    | undefined;
  let cachedHandlerFactory:
    | GeneratedRegistryHandlerFactory<
        TQueryCtx,
        TMutationCtx,
        Exclude<THandlerRegistry, undefined>
      >
    | undefined;

  const getRegistry = () => {
    cachedRegistry ??= createRegistry();
    return cachedRegistry;
  };

  const getCallerFactory = () => {
    cachedCallerFactory ??= createGenericCallerFactory<
      TQueryCtx,
      TMutationCtx,
      TCallerRegistry,
      TActionCtx
    >(getRegistry().procedureRegistry);
    return cachedCallerFactory;
  };

  const getHandlerFactory = () => {
    cachedHandlerFactory ??= createGenericHandlerFactory<
      TQueryCtx,
      TMutationCtx,
      Exclude<THandlerRegistry, undefined>
    >(getRegistry().handlerRegistry as Exclude<THandlerRegistry, undefined>);
    return cachedHandlerFactory;
  };

  return {
    getCallerFactory,
    getHandlerFactory,
  };
}
