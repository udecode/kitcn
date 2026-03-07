import { getSessionNetworkSignals } from 'better-convex/auth';
import { MINUTE, Ratelimit, SECOND } from 'better-convex/ratelimit';
import { CRPCError } from 'better-convex/server';
import type { MutationCtx } from '../../../functions/generated/server';
import type { Select } from '../../../shared/api';

const fixed = (rate: number, windowMs = MINUTE) =>
  Ratelimit.fixedWindow(rate, windowMs);

export const ratelimitBuckets = {
  default: {
    public: fixed(30),
    free: fixed(60),
    premium: fixed(200),
  },
  interactive: {
    public: fixed(3, 30 * SECOND),
    free: fixed(3, 30 * SECOND),
    premium: fixed(3, 30 * SECOND),
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

export function getUserTier(user: RatelimitUser | null): RatelimitTier {
  if (!user) {
    return 'public';
  }
  if (user.isAdmin || user.plan) {
    return 'premium';
  }

  return 'free';
}

export async function ratelimitGuard(
  ctx: MutationCtx & {
    ratelimitBucket?: RatelimitBucket;
    user: RatelimitUser | null;
  }
) {
  const bucket = ctx.ratelimitBucket ?? 'default';
  const tier = getUserTier(ctx.user);
  const identifier = ctx.user?.id ?? 'anonymous';
  const limiter = new Ratelimit({
    db: ctx.db,
    prefix: `ratelimit:${bucket}:${tier}`,
    limiter: ratelimitBuckets[bucket][tier],
    failureMode: 'closed',
    enableProtection: true,
    denyListThreshold: 30,
  });

  const { ip, userAgent } = await getSessionNetworkSignals(
    ctx,
    ctx.user?.session ?? null
  );
  const status = await limiter.limit(identifier, {
    ip,
    userAgent,
  });

  if (!status.success) {
    throw new CRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
}
