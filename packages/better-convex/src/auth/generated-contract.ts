import { type BetterAuthOptions, betterAuth } from 'better-auth/minimal';
import type { Auth } from 'better-auth/types';
import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { createApi } from './create-api';
import { type AuthFunctions, createClient } from './create-client';
import type {
  BetterAuthOptionsWithoutDatabase,
  GenericAuthDefinition,
  GenericAuthTriggers,
} from './define-auth';
import type { AuthRuntime } from './generated-contract-disabled';

export {
  createDisabledAuthRuntime,
  type GeneratedAuthDisabledReasonKind,
  getGeneratedAuthDisabledReason,
} from './generated-contract-disabled';

type UnknownFn = (...args: never[]) => unknown;

const GENERATED_AUTH_TDZ_RE = /before initialization/i;

type AuthDefinitionModule<
  GenericCtx,
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  AuthOptions extends BetterAuthOptionsWithoutDatabase,
> = {
  default: GenericAuthDefinition<GenericCtx, DataModel, Schema, AuthOptions>;
};

type AuthDefinitionInput<
  GenericCtx,
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  AuthOptions extends BetterAuthOptionsWithoutDatabase,
> =
  | GenericAuthDefinition<GenericCtx, DataModel, Schema, AuthOptions>
  | AuthDefinitionModule<GenericCtx, DataModel, Schema, AuthOptions>;

export const resolveGeneratedAuthDefinition = <Definition extends UnknownFn>(
  input: unknown,
  reason: string
): Definition => {
  const createDeferredResolver = () =>
    ((...args: Parameters<Definition>) => {
      const deferred = resolveValue();
      if (typeof deferred === 'function') {
        return deferred(...args);
      }
      throw new Error(reason);
    }) as Definition;

  const resolveValue = () => {
    if (typeof input === 'function') {
      return input;
    }
    if (typeof input !== 'object' || input === null || !('default' in input)) {
      return undefined;
    }
    const defaultExport = input.default;
    return typeof defaultExport === 'function' ? defaultExport : undefined;
  };

  let resolved: unknown;
  try {
    resolved = resolveValue();
  } catch (error) {
    if (
      error instanceof ReferenceError &&
      GENERATED_AUTH_TDZ_RE.test(error.message)
    ) {
      return createDeferredResolver();
    }
    throw error;
  }

  if (typeof resolved === 'function') {
    return resolved as Definition;
  }

  if (typeof input === 'object' && input !== null && 'default' in input) {
    return createDeferredResolver();
  }

  throw new Error(reason);
};

const withDatabase = <
  GenericCtx,
  AuthOptions extends BetterAuthOptionsWithoutDatabase,
>(
  authOptions: AuthOptions,
  ctx: GenericCtx,
  adapter: (ctx: GenericCtx) => BetterAuthOptions['database']
) => ({
  ...authOptions,
  database: adapter(ctx),
});

const withoutTriggers = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
  AuthOptions extends BetterAuthOptionsWithoutDatabase,
>(
  authOptions: AuthOptions & {
    triggers?: GenericAuthTriggers<DataModel, Schema>;
  }
) => {
  const { triggers: _triggers, ...options } = authOptions;
  return options as AuthOptions;
};

type BetterAuthRuntime<Options extends BetterAuthOptions = BetterAuthOptions> =
  Auth<Options>;

const createLazyAuthProxy = <AuthRuntime extends object>(
  resolve: () => AuthRuntime
) =>
  new Proxy({} as AuthRuntime, {
    get(_target, prop, receiver) {
      const auth = resolve();
      const value = Reflect.get(auth, prop, receiver);
      return typeof value === 'function' ? value.bind(auth) : value;
    },
  });

type ProcedureType = 'query' | 'mutation' | 'action';

type ProcedureExportLike = {
  _handler?: (ctx: unknown, input: unknown) => unknown;
  _crpcMeta?: {
    type?: ProcedureType;
    internal?: boolean;
  };
  __betterConvexRawHandler?: (opts: {
    ctx: unknown;
    input: unknown;
  }) => unknown;
};

const AUTH_RUNTIME_PROCEDURE_TYPES = {
  create: 'mutation',
  deleteMany: 'mutation',
  deleteOne: 'mutation',
  findMany: 'query',
  findOne: 'query',
  getLatestJwks: 'action',
  rotateKeys: 'action',
  updateMany: 'mutation',
  updateOne: 'mutation',
} as const satisfies Record<string, ProcedureType>;

const decorateProcedureExport = (
  value: unknown,
  procedureType: ProcedureType
) => {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return;
  }

  const procedure = value as ProcedureExportLike;
  if (typeof procedure._handler !== 'function') {
    return;
  }

  procedure._crpcMeta = {
    ...(procedure._crpcMeta ?? {}),
    internal: true,
    type: procedureType,
  };

  if (typeof procedure.__betterConvexRawHandler !== 'function') {
    procedure.__betterConvexRawHandler = ({ ctx, input }) =>
      procedure._handler?.(ctx, input);
  }
};

const decorateAuthRuntimeProcedures = <T extends Record<string, unknown>>(
  exportsObject: T
): T => {
  for (const [name, procedureType] of Object.entries(
    AUTH_RUNTIME_PROCEDURE_TYPES
  )) {
    decorateProcedureExport(exportsObject[name], procedureType);
  }
  return exportsObject;
};

export const createAuthRuntime = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
  GenericCtx = GenericMutationCtx<DataModel>,
  AuthOptions extends
    BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
>(config: {
  internal: unknown;
  moduleName: string;
  schema: Schema;
  auth: AuthDefinitionInput<GenericCtx, DataModel, Schema, AuthOptions>;
  context?: (
    ctx: GenericMutationCtx<DataModel>
  ) => TriggerCtx | Promise<TriggerCtx>;
}): AuthRuntime<DataModel, Schema, TriggerCtx, GenericCtx, AuthOptions> => {
  const authDefinition = resolveGeneratedAuthDefinition<
    GenericAuthDefinition<GenericCtx, DataModel, Schema, AuthOptions>
  >(
    config.auth,
    'Invalid auth definition export. Expected convex/functions/auth.ts default export to be `defineAuth((ctx) => ({ ... }))`.'
  );
  const authFunctions = (config.internal as Record<string, AuthFunctions>)[
    config.moduleName
  ];
  const resolveRuntimeTriggers = (
    ctx: TriggerCtx
  ): GenericAuthTriggers<DataModel, Schema, TriggerCtx> | undefined =>
    authDefinition(ctx as unknown as GenericCtx).triggers as unknown as
      | GenericAuthTriggers<DataModel, Schema, TriggerCtx>
      | undefined;

  const authClient = createClient<DataModel, Schema, TriggerCtx>({
    authFunctions,
    schema: config.schema,
    ...(config.context ? { context: config.context } : {}),
    triggers: resolveRuntimeTriggers,
  });

  type AdapterCtx = Parameters<typeof authClient.adapter>[0];
  const adapterGetAuthOptions = ((ctx: GenericCtx) =>
    withoutTriggers<DataModel, Schema, AuthOptions>(
      authDefinition(ctx)
    )) as Parameters<typeof authClient.adapter>[1];

  const resolveAuthOptions = (ctx: GenericCtx) =>
    withDatabase(
      withoutTriggers<DataModel, Schema, AuthOptions>(authDefinition(ctx)),
      ctx,
      (_ctx) => authClient.adapter(_ctx as AdapterCtx, adapterGetAuthOptions)
    );
  const getAuth = (ctx: GenericCtx) => betterAuth(resolveAuthOptions(ctx));
  type GeneratedAuth = BetterAuthRuntime<ReturnType<typeof resolveAuthOptions>>;
  const authApi = createApi(config.schema, getAuth, {
    ...(config.context ? { context: config.context } : {}),
    triggers: resolveRuntimeTriggers,
  });
  const decoratedAuthApi = decorateAuthRuntimeProcedures(authApi);
  let staticAuth: GeneratedAuth | undefined;
  const getStaticAuth = () => {
    staticAuth ??= betterAuth(resolveAuthOptions({} as GenericCtx));
    return staticAuth;
  };

  return {
    authEnabled: true as const,
    authClient,
    getAuth,
    auth: createLazyAuthProxy(getStaticAuth),
    ...decoratedAuthApi,
  } as AuthRuntime<DataModel, Schema, TriggerCtx, GenericCtx, AuthOptions>;
};
