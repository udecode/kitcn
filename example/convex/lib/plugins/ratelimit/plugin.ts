import { getSessionNetworkSignals } from 'kitcn/auth';
import { MINUTE, Ratelimit, RatelimitPlugin, SECOND } from 'kitcn/ratelimit';
import type { MutationCtx } from '../../../functions/generated/server';
import type { Select } from '../../../shared/api';

const fixed = (rate: number) => Ratelimit.fixedWindow(rate, MINUTE);

export const ratelimitBuckets = {
  default: {
    public: fixed(30),
    free: fixed(60),
    premium: fixed(200),
  },
  interactive: {
    public: Ratelimit.fixedWindow(3, 30 * SECOND),
    free: Ratelimit.fixedWindow(3, 30 * SECOND),
    premium: Ratelimit.fixedWindow(3, 30 * SECOND),
  },
} as const;

type RatelimitTier = keyof (typeof ratelimitBuckets)['default'];
export type RatelimitBucket = keyof typeof ratelimitBuckets;

type RatelimitUser = {
  id: string;
  isAdmin?: boolean;
  plan?: 'premium' | 'team' | null;
  session?: Select<'session'> | null;
};

type RatelimitCtx = MutationCtx & {
  user?: RatelimitUser | null;
};

type RatelimitMeta = {
  ratelimit?: RatelimitBucket;
};

function getUserTier(user: RatelimitUser | null): RatelimitTier {
  if (!user) {
    return 'public';
  }
  if (user.isAdmin || user.plan) {
    return 'premium';
  }

  return 'free';
}

export const ratelimit = RatelimitPlugin.configure({
  buckets: ratelimitBuckets,
  getBucket: ({ meta }: { meta: RatelimitMeta }) => meta.ratelimit ?? 'default',
  getUser: ({ ctx }: { ctx: RatelimitCtx }) => ctx.user ?? null,
  getIdentifier: ({ user }: { user: RatelimitUser | null }) =>
    user?.id ?? 'anonymous',
  getTier: getUserTier,
  getSignals: ({
    ctx,
    user,
  }: {
    ctx: RatelimitCtx;
    user: RatelimitUser | null;
  }) => getSessionNetworkSignals(ctx, user?.session ?? null),
  prefix: ({ bucket, tier }) => `ratelimit:${bucket}:${tier}`,
  failureMode: 'closed',
  enableProtection: true,
  denyListThreshold: 30,
});
