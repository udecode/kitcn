import { MINUTE, Ratelimit } from 'better-convex/plugins/ratelimit';
import { CRPCError } from 'better-convex/server';
import type { MutationCtx } from '../functions/generated/server';
import type { SessionUser } from '../shared/auth-shared';

const fixed = (rate: number) => Ratelimit.fixedWindow(rate, MINUTE);

const rateLimitConfig = {
  'default:free': fixed(60),
  'default:premium': fixed(200),
  'default:public': fixed(30),
  'project/create:free': fixed(5),
  'project/create:premium': fixed(20),
  'tag/create:free': fixed(10),
  'tag/create:premium': fixed(30),
  'todo/create:free': fixed(20),
  'todo/create:premium': fixed(60),
  'organization/create:free': fixed(10),
  'organization/create:premium': fixed(30),
  'organization/invite:free': fixed(5),
  'organization/invite:premium': fixed(20),
} as const;

export function getRateLimitKey(
  baseKey: string,
  tier: 'free' | 'premium' | 'public'
): keyof typeof rateLimitConfig {
  const specificKey = `${baseKey}:${tier}` as keyof typeof rateLimitConfig;
  if (specificKey in rateLimitConfig) {
    return specificKey;
  }

  return `default:${tier}`;
}

export function getUserTier(
  user: { isAdmin?: boolean; plan?: SessionUser['plan'] } | null
): 'free' | 'premium' | 'public' {
  if (!user) {
    return 'public';
  }
  if (user.isAdmin || user.plan) {
    return 'premium';
  }

  return 'free';
}

export async function rateLimitGuard(
  ctx: MutationCtx & {
    rateLimitKey: string;
    user: Pick<SessionUser, 'id' | 'plan'> | null;
  }
) {
  const tier = getUserTier(ctx.user);
  const limitKey = getRateLimitKey(ctx.rateLimitKey, tier);
  const identifier = ctx.user?.id ?? 'anonymous';

  const limiter = new Ratelimit({
    db: ctx.db,
    prefix: `example:${limitKey}`,
    limiter: rateLimitConfig[limitKey],
    failureMode: 'closed',
    enableProtection: true,
    denyListThreshold: 30,
  });

  const status = await limiter.limit(identifier);

  if (!status.success) {
    throw new CRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
}
