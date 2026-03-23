import type { Auth as BetterAuthInstance } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth/minimal';
import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import type { createApi } from './create-api';
import type { AuthFunctions, createClient } from './create-client';
import type { BetterAuthOptionsWithoutDatabase } from './define-auth';

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

const createDisabledError = (message: string, exportName: string) => () => {
  throw new Error(`${message} (${exportName})`);
};

const createDisabledRuntimeExport = <T>(
  message: string,
  exportName: string
): T => createDisabledError(message, exportName) as T;

export type AuthRuntime<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
  GenericCtx = GenericMutationCtx<DataModel>,
  AuthOptions extends
    BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
> = {
  auth: BetterAuthInstance<
    AuthOptions & {
      database: BetterAuthOptions['database'];
    }
  >;
  authClient: ReturnType<typeof createClient<DataModel, Schema, TriggerCtx>>;
  authEnabled: boolean;
  getAuth: (ctx: GenericCtx) => BetterAuthInstance<
    AuthOptions & {
      database: BetterAuthOptions['database'];
    }
  >;
} & ReturnType<
  typeof createApi<
    Schema,
    DataModel,
    GenericCtx,
    TriggerCtx,
    BetterAuthInstance<
      AuthOptions & {
        database: BetterAuthOptions['database'];
      }
    >
  >
>;

export const createDisabledAuthRuntime = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
  GenericCtx = GenericMutationCtx<DataModel>,
  AuthOptions extends
    BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
>(config?: {
  reason?: string;
}): AuthRuntime<DataModel, Schema, TriggerCtx, GenericCtx, AuthOptions> => {
  const message = config?.reason ?? DEFAULT_DISABLED_AUTH_MESSAGE;
  type Runtime = AuthRuntime<
    DataModel,
    Schema,
    TriggerCtx,
    GenericCtx,
    AuthOptions
  >;

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
    ) as Runtime['auth'],
    getAuth: createDisabledError(message, 'getAuth') as (
      ctx: GenericCtx
    ) => Runtime['auth'],
    create: createDisabledRuntimeExport<Runtime['create']>(message, 'create'),
    deleteMany: createDisabledRuntimeExport<Runtime['deleteMany']>(
      message,
      'deleteMany'
    ),
    deleteOne: createDisabledRuntimeExport<Runtime['deleteOne']>(
      message,
      'deleteOne'
    ),
    findMany: createDisabledRuntimeExport<Runtime['findMany']>(
      message,
      'findMany'
    ),
    findOne: createDisabledRuntimeExport<Runtime['findOne']>(
      message,
      'findOne'
    ),
    updateMany: createDisabledRuntimeExport<Runtime['updateMany']>(
      message,
      'updateMany'
    ),
    updateOne: createDisabledRuntimeExport<Runtime['updateOne']>(
      message,
      'updateOne'
    ),
    getLatestJwks: createDisabledRuntimeExport<Runtime['getLatestJwks']>(
      message,
      'getLatestJwks'
    ),
    rotateKeys: createDisabledRuntimeExport<Runtime['rotateKeys']>(
      message,
      'rotateKeys'
    ),
  };
};
