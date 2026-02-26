import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { CRPCError } from 'better-convex/server';
import { components } from '../functions/_generated/api';
import type { ActionCtx, MutationCtx } from '../functions/generated/server';
import type { SessionUser } from '../shared/auth-shared';

// Define rate limits - specific keys override defaults
const rateLimitConfig = {
  'default:free': { kind: 'fixed window', period: MINUTE, rate: 60 },
  'default:premium': { kind: 'fixed window', period: MINUTE, rate: 200 },
  'default:public': { kind: 'fixed window', period: MINUTE, rate: 30 },

  // Project limits
  'project/create:free': { kind: 'fixed window', period: MINUTE, rate: 5 },
  'project/create:premium': { kind: 'fixed window', period: MINUTE, rate: 20 },

  // Tag limits
  'tag/create:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'tag/create:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  'todo/create:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'todo/create:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  // Organization limits
  'organization/create:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },
  'organization/create:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  'organization/invite:free': { kind: 'fixed window', period: MINUTE, rate: 5 },
  'organization/invite:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 20,
  },
} as const;

export const rateLimiter = new RateLimiter(
  components.rateLimiter,
  rateLimitConfig
);

// Helper function to get rate limit key based on user tier (falls back to default)
export function getRateLimitKey(
  baseKey: string,
  tier: 'free' | 'premium' | 'public'
  // biome-ignore lint/suspicious/noExplicitAny: Rate limiter key type is dynamic based on configuration
): any {
  const specificKey = `${baseKey}:${tier}`;

  // Use specific key if defined, otherwise fall back to default
  if (specificKey in rateLimitConfig) {
    return specificKey;
  }

  return `default:${tier}`;
}

// Helper to get user tier based on session user
export function getUserTier(
  user: { isAdmin?: boolean; plan?: SessionUser['plan'] } | null
): 'free' | 'premium' | 'public' {
  if (!user) {
    return 'public';
  }
  if (user.isAdmin) {
    return 'premium'; // Admins bypass rate limits by getting premium tier
  }
  if (user.plan) {
    return 'premium';
  }

  return 'free';
}

// Helper function to check rate limit for mutations
export async function rateLimitGuard(
  ctx: (ActionCtx | MutationCtx) & {
    rateLimitKey: string;
    user: Pick<SessionUser, 'id' | 'plan'> | null;
  }
) {
  const tier = getUserTier(ctx.user);
  const limitKey = getRateLimitKey(ctx.rateLimitKey, tier);
  const identifier = ctx.user?.id ?? 'anonymous';

  const status = await rateLimiter.limit(ctx, limitKey, {
    key: identifier,
  });

  if (!status.ok) {
    throw new CRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
}
