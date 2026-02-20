import type { BetterAuthOptions } from 'better-auth';

import {
  type FunctionReference,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericSchema,
  internalMutationGeneric,
  type SchemaDefinition,
} from 'convex/server';
import { v } from 'convex/values';
import {
  customCtx,
  customMutation,
} from '../internal/upstream/server/customFunctions';
import type { GenericCtx } from '../server/context-utils';
import { isQueryCtx } from '../server/context-utils';
import { dbAdapter, httpAdapter } from './adapter';
import type { GenericAuthTriggers } from './define-auth';

export type AuthFunctions = {
  create: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
  findMany: FunctionReference<'query', 'internal', Record<string, any>>;
  findOne: FunctionReference<'query', 'internal', Record<string, any>>;
  updateMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  updateOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onCreate: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onDelete: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onUpdate: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeCreate?: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeDelete?: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeUpdate?: FunctionReference<'mutation', 'internal', Record<string, any>>;
};

export type Triggers<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
> = GenericAuthTriggers<DataModel, Schema>;

export type TriggerResolver<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
> =
  | Triggers<DataModel, Schema>
  | ((ctx: TriggerCtx) => Triggers<DataModel, Schema> | undefined);

export const createClient = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
  TriggerCtx extends
    GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>,
>(config: {
  authFunctions: AuthFunctions;
  schema: Schema;
  internalMutation?: typeof internalMutationGeneric;
  context?: (
    ctx: GenericMutationCtx<DataModel>
  ) => TriggerCtx | Promise<TriggerCtx>;
  triggers?: TriggerResolver<DataModel, Schema, TriggerCtx>;
}) => ({
  authFunctions: config.authFunctions,
  triggers: config.triggers,
  adapter: (
    ctx: GenericCtx<DataModel>,
    getAuthOptions: (ctx: any) => BetterAuthOptions
  ) =>
    isQueryCtx(ctx)
      ? dbAdapter(ctx, getAuthOptions, config)
      : httpAdapter(ctx, config),
  triggersApi: () => {
    const mutationBuilderBase =
      config.internalMutation ?? internalMutationGeneric;
    const hasMutationCtxTransforms = config.context !== undefined;
    const transformMutationCtx = async (ctx: GenericMutationCtx<DataModel>) =>
      (await config.context?.(ctx)) ?? (ctx as TriggerCtx);
    const mutationBuilder: typeof mutationBuilderBase = hasMutationCtxTransforms
      ? (customMutation(
          mutationBuilderBase,
          customCtx(
            async (ctx: GenericMutationCtx<DataModel>) =>
              await transformMutationCtx(ctx)
          )
        ) as typeof mutationBuilderBase)
      : mutationBuilderBase;
    const resolveTriggers = (ctx: TriggerCtx) =>
      typeof config.triggers === 'function'
        ? config.triggers(ctx)
        : config.triggers;
    const getTriggers = (model: string, ctx: TriggerCtx) =>
      resolveTriggers(ctx)?.[model as keyof Triggers<DataModel, Schema>];
    const resolveTriggerCtx = async (ctx: GenericMutationCtx<DataModel>) =>
      hasMutationCtxTransforms
        ? (ctx as TriggerCtx)
        : await transformMutationCtx(ctx);

    return {
      beforeCreate: mutationBuilder({
        args: {
          data: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);

          return (
            (await getTriggers(args.model, triggerCtx)?.beforeCreate?.(
              args.data
            )) ?? args.data
          );
        },
      }),
      beforeDelete: mutationBuilder({
        args: {
          doc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);

          return (
            (await getTriggers(args.model, triggerCtx)?.beforeDelete?.(
              args.doc
            )) ?? args.doc
          );
        },
      }),
      beforeUpdate: mutationBuilder({
        args: {
          doc: v.any(),
          model: v.string(),
          update: v.any(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);

          return (
            (await getTriggers(args.model, triggerCtx)?.beforeUpdate?.(
              args.doc,
              args.update
            )) ?? args.update
          );
        },
      }),
      onCreate: mutationBuilder({
        args: {
          doc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);
          await getTriggers(args.model, triggerCtx)?.onCreate?.(args.doc);
        },
      }),
      onDelete: mutationBuilder({
        args: {
          doc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);
          await getTriggers(args.model, triggerCtx)?.onDelete?.(args.doc);
        },
      }),
      onUpdate: mutationBuilder({
        args: {
          model: v.string(),
          newDoc: v.any(),
          oldDoc: v.any(),
        },
        handler: async (ctx, args) => {
          const triggerCtx = await resolveTriggerCtx(ctx);
          await getTriggers(args.model, triggerCtx)?.onUpdate?.(
            args.newDoc,
            args.oldDoc
          );
        },
      }),
    };
  },
});
