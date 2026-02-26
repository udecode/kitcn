import { type BetterAuthOptions, betterAuth } from 'better-auth/minimal';
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

export type GeneratedAuthDisabledReasonKind =
  | 'default_export_unavailable'
  | 'missing_auth_file'
  | 'missing_default_export';

const GENERATED_AUTH_DISABLED_REASONS: Record<
  GeneratedAuthDisabledReasonKind,
  string
> = {
  default_export_unavailable:
    'Auth runtime is disabled. convex/functions/auth.ts default export is unavailable. Export `default defineAuth((ctx) => ({ ...options, triggers }))` and run `better-convex codegen`.',
  missing_auth_file:
    'Auth runtime is disabled. Create convex/functions/auth.ts with `export default defineAuth(...)` and run `better-convex codegen`.',
  missing_default_export:
    'Auth runtime is disabled. convex/functions/auth.ts exists but does not export a default auth definition. Export `default defineAuth((ctx) => ({ ...options, triggers }))` and run `better-convex codegen`.',
};

export const getGeneratedAuthDisabledReason = (
  kind: GeneratedAuthDisabledReasonKind
): string => GENERATED_AUTH_DISABLED_REASONS[kind];

const DEFAULT_DISABLED_AUTH_MESSAGE =
  getGeneratedAuthDisabledReason('missing_auth_file');

type UnknownFn = (...args: unknown[]) => unknown;

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
  const resolved =
    typeof input === 'function'
      ? input
      : typeof input === 'object' &&
          input !== null &&
          'default' in input &&
          typeof input.default === 'function'
        ? input.default
        : undefined;

  if (typeof resolved === 'function') {
    return resolved as Definition;
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

const createDisabledError = (message: string, exportName: string) => () => {
  throw new Error(`${message} (${exportName})`);
};

const createLazyAuthProxy = <Auth extends ReturnType<typeof betterAuth>>(
  resolve: () => Auth
) =>
  new Proxy({} as Auth, {
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
}) => {
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
  const authApi = createApi(config.schema, getAuth, {
    ...(config.context ? { context: config.context } : {}),
    triggers: resolveRuntimeTriggers,
  });
  const decoratedAuthApi = decorateAuthRuntimeProcedures(authApi);
  let staticAuth: ReturnType<typeof betterAuth> | undefined;
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
  };
};

export const createDisabledAuthRuntime = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
  GenericCtx = GenericMutationCtx<DataModel>,
>(config?: {
  reason?: string;
}) => {
  const message = config?.reason ?? DEFAULT_DISABLED_AUTH_MESSAGE;

  return {
    authEnabled: false as const,
    authClient: {
      authFunctions: {} as AuthFunctions,
      triggers: undefined,
      adapter: createDisabledError(message, 'authClient.adapter'),
    } as unknown as ReturnType<
      typeof createClient<DataModel, Schema, TriggerCtx>
    >,
    auth: new Proxy(
      {},
      {
        get() {
          throw new Error(`${message} (auth)`);
        },
      }
    ) as ReturnType<typeof betterAuth>,
    getAuth: createDisabledError(message, 'getAuth') as (
      ctx: GenericCtx
    ) => ReturnType<typeof betterAuth>,
    create: createDisabledError(message, 'create'),
    deleteMany: createDisabledError(message, 'deleteMany'),
    deleteOne: createDisabledError(message, 'deleteOne'),
    findMany: createDisabledError(message, 'findMany'),
    findOne: createDisabledError(message, 'findOne'),
    updateMany: createDisabledError(message, 'updateMany'),
    updateOne: createDisabledError(message, 'updateOne'),
    getLatestJwks: createDisabledError(message, 'getLatestJwks'),
    rotateKeys: createDisabledError(message, 'rotateKeys'),
  };
};
