import { definePlugin } from '../plugins';
import { CRPCError } from '../server';
import { requireMutationCtx } from '../server/context-utils';
import { Ratelimit } from './ratelimit';
import type { LimitRequest, ResolvedAlgorithm } from './types';

type MaybePromise<T> = T | Promise<T>;

type RatelimitBuckets = Record<string, Record<string, ResolvedAlgorithm>>;

type BucketName<TBuckets extends RatelimitBuckets> = Extract<
  keyof TBuckets,
  string
>;

type TierName<TBuckets extends RatelimitBuckets> = Extract<
  keyof TBuckets[BucketName<TBuckets>],
  string
>;

type RatelimitResolvedArgs<
  TCtx,
  TMeta extends object,
  TUser,
  TBuckets extends RatelimitBuckets,
> = {
  ctx: TCtx;
  meta: TMeta;
  user: TUser;
  bucket: BucketName<TBuckets>;
  tier: TierName<TBuckets>;
  identifier: string;
};

export type RatelimitPluginOptions<
  TCtx = unknown,
  TMeta extends object = object,
  TUser = unknown,
  TBuckets extends RatelimitBuckets = RatelimitBuckets,
> = {
  buckets: TBuckets;
  getBucket: (args: {
    ctx: TCtx;
    meta: TMeta;
  }) => MaybePromise<BucketName<TBuckets>>;
  getUser: (args: { ctx: TCtx; meta: TMeta }) => MaybePromise<TUser>;
  getIdentifier: (args: {
    ctx: TCtx;
    meta: TMeta;
    user: TUser;
    bucket: BucketName<TBuckets>;
  }) => MaybePromise<string>;
  getTier: (user: TUser) => MaybePromise<TierName<TBuckets>>;
  getSignals: (
    args: RatelimitResolvedArgs<TCtx, TMeta, TUser, TBuckets>
  ) => MaybePromise<LimitRequest | undefined>;
  prefix?:
    | string
    | ((
        args: RatelimitResolvedArgs<TCtx, TMeta, TUser, TBuckets>
      ) => MaybePromise<string>);
  failureMode?: 'closed' | 'open';
  enableProtection?: boolean;
  denyListThreshold?: number;
  message?:
    | string
    | ((
        args: RatelimitResolvedArgs<TCtx, TMeta, TUser, TBuckets>
      ) => MaybePromise<string>);
};

type AnyRatelimitPluginOptions = RatelimitPluginOptions<any, any, any, any>;

const DEFAULT_RATELIMIT_MESSAGE =
  'Rate limit exceeded. Please try again later.';

function resolveBucketLimiter(
  options: AnyRatelimitPluginOptions,
  bucket: string,
  tier: string
): ResolvedAlgorithm {
  const bucketConfig = options.buckets[bucket];
  if (!bucketConfig) {
    throw new Error(`Unknown ratelimit bucket "${bucket}".`);
  }

  const limiter = bucketConfig[tier];
  if (!limiter) {
    throw new Error(`Unknown ratelimit tier "${tier}" for bucket "${bucket}".`);
  }

  return limiter;
}

function resolvePrefix(
  options: AnyRatelimitPluginOptions,
  args: RatelimitResolvedArgs<any, any, any, any>
): MaybePromise<string> {
  if (typeof options.prefix === 'function') {
    return options.prefix(args);
  }
  return options.prefix ?? `ratelimit:${args.bucket}:${args.tier}`;
}

function resolveMessage(
  options: AnyRatelimitPluginOptions,
  args: RatelimitResolvedArgs<any, any, any, any>
): MaybePromise<string> {
  if (typeof options.message === 'function') {
    return options.message(args);
  }
  return options.message ?? DEFAULT_RATELIMIT_MESSAGE;
}

export const RatelimitPlugin = definePlugin<
  'ratelimit',
  AnyRatelimitPluginOptions,
  AnyRatelimitPluginOptions
>('ratelimit', ({ options }) => {
  if (!options) {
    throw new Error('RatelimitPlugin must be configured before use.');
  }
  return options;
}).extend(({ middleware }) => ({
  middleware: () =>
    middleware().pipe(async ({ ctx, meta, next }) => {
      const options = ctx.api.ratelimit;
      const mutationCtx = requireMutationCtx(ctx as any);

      const bucket = await options.getBucket({
        ctx,
        meta,
      });
      const user = await options.getUser({
        ctx,
        meta,
      });
      const tier = await options.getTier(user);
      const identifier = await options.getIdentifier({
        ctx,
        meta,
        user,
        bucket,
      });
      const args = {
        ctx,
        meta,
        user,
        bucket,
        tier,
        identifier,
      } satisfies RatelimitResolvedArgs<any, any, any, any>;

      const limiter = new Ratelimit({
        db: mutationCtx.db,
        prefix: await resolvePrefix(options, args),
        limiter: resolveBucketLimiter(options, bucket, tier),
        failureMode: options.failureMode,
        enableProtection: options.enableProtection,
        denyListThreshold: options.denyListThreshold,
      });
      const status = await limiter.limit(
        identifier,
        await options.getSignals(args)
      );

      if (!status.success) {
        throw new CRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: await resolveMessage(options, args),
        });
      }

      return next({ ctx });
    }),
}));
