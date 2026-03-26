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

export const DEFAULT_AUTH_DEFINITION_PATH = 'convex/auth.ts';

const resolveAuthDefinitionPath = (authDefinitionPath?: string): string => {
  const normalized = authDefinitionPath?.trim();
  return normalized && normalized.length > 0
    ? normalized
    : DEFAULT_AUTH_DEFINITION_PATH;
};

export const getGeneratedAuthDisabledReason = (
  kind: GeneratedAuthDisabledReasonKind,
  authDefinitionPath?: string
): string => {
  const resolvedAuthDefinitionPath =
    resolveAuthDefinitionPath(authDefinitionPath);

  switch (kind) {
    case 'default_export_unavailable':
      return `Auth runtime is disabled. ${resolvedAuthDefinitionPath} default export is unavailable. Export \`default defineAuth((ctx) => ({ ...options, triggers }))\` and run \`better-convex codegen\`.`;
    case 'missing_auth_file':
      return `Auth runtime is disabled. Create ${resolvedAuthDefinitionPath} with \`export default defineAuth(...)\` and run \`better-convex codegen\`.`;
    case 'missing_default_export':
      return `Auth runtime is disabled. ${resolvedAuthDefinitionPath} exists but does not export a default auth definition. Export \`default defineAuth((ctx) => ({ ...options, triggers }))\` and run \`better-convex codegen\`.`;
  }
};

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
