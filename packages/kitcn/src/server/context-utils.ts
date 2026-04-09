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

export type SchedulerCtx<TCtx> = TCtx extends {
  scheduler?: infer TScheduler;
}
  ? TCtx & {
      scheduler: NonNullable<TScheduler>;
    }
  : never;

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

export const isSchedulerCtx = <TCtx extends object>(
  ctx: TCtx
): ctx is SchedulerCtx<TCtx> =>
  'scheduler' in ctx &&
  typeof (ctx as { scheduler?: unknown }).scheduler === 'object' &&
  (ctx as { scheduler?: unknown }).scheduler !== null;

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
    if (isSchedulerCtx(ctx)) {
      throw new Error(
        'Action context required. This ctx can schedule work but cannot call action procedures directly. Use requireSchedulerCtx(ctx) with caller.schedule.*.'
      );
    }
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

export const requireSchedulerCtx = <TCtx extends object>(
  ctx: TCtx
): SchedulerCtx<TCtx> => {
  if (!isSchedulerCtx(ctx)) {
    throw new Error('Mutation or action context with scheduler required');
  }
  return ctx as SchedulerCtx<TCtx>;
};
