import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server';

export type GenericCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>;

export type RunMutationCtx<DataModel extends GenericDataModel> = (
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>
) & {
  runMutation: GenericMutationCtx<DataModel>['runMutation'];
};

export const isQueryCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): ctx is GenericQueryCtx<DataModel> => 'db' in ctx;

export const isMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): ctx is GenericMutationCtx<DataModel> => 'db' in ctx && 'scheduler' in ctx;

export const isActionCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): ctx is GenericActionCtx<DataModel> => 'runAction' in ctx;

export const isRunMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): ctx is RunMutationCtx<DataModel> => 'runMutation' in ctx;

export const requireQueryCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): GenericQueryCtx<DataModel> => {
  if (!isQueryCtx(ctx)) {
    throw new Error('Query context required');
  }
  return ctx;
};

export const requireMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): GenericMutationCtx<DataModel> => {
  if (!isMutationCtx(ctx)) {
    throw new Error('Mutation context required');
  }
  return ctx;
};

export const requireActionCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): GenericActionCtx<DataModel> => {
  if (!isActionCtx(ctx)) {
    throw new Error('Action context required');
  }
  return ctx;
};

export const requireRunMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>
): RunMutationCtx<DataModel> => {
  if (!isRunMutationCtx(ctx)) {
    throw new Error('Mutation or action context required');
  }
  return ctx;
};
