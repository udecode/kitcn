import type { BetterAuthDBSchema } from 'better-auth/db';

import type {
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import type { GenericCtx } from '../server/context-utils';
import { isQueryCtx } from '../server/context-utils';
import { dbAdapter, httpAdapter } from './adapter';
import type { GenericAuthTriggers } from './define-auth';

export type AuthFunctions = {
  count: FunctionReference<'query', 'internal', Record<string, any>>;
  create: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
  findMany: FunctionReference<'query', 'internal', Record<string, any>>;
  findOne: FunctionReference<'query', 'internal', Record<string, any>>;
  updateMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  updateOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
};

export type Triggers<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
  TriggerCtx = unknown,
> = GenericAuthTriggers<DataModel, Schema, TriggerCtx>;

export type TriggerResolver<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
> =
  | Triggers<DataModel, Schema, TriggerCtx>
  | ((ctx: TriggerCtx) => Triggers<DataModel, Schema, TriggerCtx> | undefined);

export const createClient = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
>(config: {
  authFunctions: AuthFunctions;
  /**
   * Ctx-free Better Auth table schema, memoized by the caller. Resolved lazily
   * on the first db-adapter construction, never at module scope.
   */
  getBetterAuthSchema: () => BetterAuthDBSchema;
  schema: Schema;
  context?: (
    ctx: GenericMutationCtx<DataModel>
  ) => TriggerCtx | Promise<TriggerCtx>;
  triggers?: TriggerResolver<DataModel, Schema, TriggerCtx>;
}) => ({
  authFunctions: config.authFunctions,
  triggers: config.triggers,
  adapter: (ctx: GenericCtx<DataModel>) =>
    isQueryCtx(ctx) ? dbAdapter(ctx, config) : httpAdapter(ctx, config),
});
