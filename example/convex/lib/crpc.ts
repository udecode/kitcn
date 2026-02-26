/**
 * CRPC - Convex RPC
 * tRPC-style fluent API for Convex functions
 *
 * This file contains project-specific setup. The core builder is generic.
 *
 * Usage:
 * ```typescript
 * import { z } from 'zod';
 * import { publicQuery, authQuery, authMutation } from '../lib/crpc';
 *
 * export const getItem = publicQuery
 *   .input(z.object({ id: z.string() }))
 *   .output(z.object({ name: z.string() }).nullable())
 *   .query(async ({ ctx, input }) => {
 *     return ctx.orm.query.items.findFirst({ where: { id: input.id } });
 *   });
 *
 * export const createItem = authMutation
 *   .input(z.object({ name: z.string() }))
 *   .output(z.string())
 *   .mutation(async ({ ctx, input }) => {
 *     const [row] = await ctx.orm
 *       .insert(items)
 *       .values({ name: input.name, userId: ctx.userId })
 *       .returning({ id: items.id });
 *     return row.id;
 *   });
 * ```
 */

import { getHeaders } from 'better-convex/auth';
import { CRPCError } from 'better-convex/server';
import type { Auth } from 'convex/server';
import { getAuth } from '../functions/generated/auth';
import {
  type ActionCtx,
  initCRPC,
  type MutationCtx,
  type OrmCtx,
  type QueryCtx,
} from '../functions/generated/server';
import { createUserCaller } from '../functions/generated/user.runtime';
import type { SessionUser } from '../shared/auth-shared';
import { getSessionUser } from './auth/auth-helpers';
import { getEnv } from './get-env';
import { rateLimitGuard } from './rate-limiter';

// =============================================================================
// Context Types
// =============================================================================

/** Context with optional auth - user/userId may be null */
export type MaybeAuthCtx<Ctx extends MutationCtx | QueryCtx = QueryCtx> =
  OrmCtx<Ctx> & {
    auth: Auth & Partial<ReturnType<typeof getAuth> & { headers: Headers }>;
    user: SessionUser | null;
    userId: string | null;
  };

/** Context with required auth - user/userId guaranteed */
export type AuthCtx<Ctx extends MutationCtx | QueryCtx = QueryCtx> =
  OrmCtx<Ctx> & {
    auth: Auth & ReturnType<typeof getAuth> & { headers: Headers };
    user: SessionUser;
    userId: string;
  };

/** Context type for authenticated actions */
export type AuthActionCtx = ActionCtx & {
  user: SessionUser;
  userId: string;
};

// =============================================================================
// Project-Specific Setup
// =============================================================================

// Initialize CRPC with tRPC-style builder chain
const c = initCRPC
  .meta<{
    auth?: 'optional' | 'required';
    role?: 'admin';
    rateLimit?: string;
    dev?: boolean;
  }>()
  .create();

// =============================================================================
// Middleware
// =============================================================================

/** Dev mode middleware - throws in production if meta.dev: true */
const devMiddleware = c.middleware<object>(({ meta, next, ctx }) => {
  if (meta.dev && getEnv().DEPLOY_ENV === 'production') {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'This function is only available in development',
    });
  }
  return next({ ctx });
});

/** Rate limit middleware - applies rate limiting based on meta.rateLimit and user tier */
const rateLimitMiddleware = c.middleware<
  MutationCtx & { user?: Pick<SessionUser, 'id' | 'plan'> | null }
>(async ({ ctx, meta, next }) => {
  await rateLimitGuard({
    ...ctx,
    rateLimitKey: meta.rateLimit ?? 'default',
    user: ctx.user ?? null,
  });
  return next({ ctx });
});

/** Role middleware - checks admin role from meta after auth middleware */
const roleMiddleware = c.middleware<object>(({ ctx, meta, next }) => {
  const user = (ctx as { user?: { isAdmin?: boolean } }).user;
  if (meta.role === 'admin' && !user?.isAdmin) {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next({ ctx });
});

function requireAuth<T>(user: T | null): T {
  if (!user) {
    throw new CRPCError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  }
  return user;
}

// =============================================================================
// Query Procedures
// =============================================================================

/** Public query - no auth required, supports dev: true in meta */
export const publicQuery = c.query.use(devMiddleware);

/** Private query - only callable from other Convex functions */
export const privateQuery = c.query.use(devMiddleware).internal();

/** MaybeAuth query - ctx.user may be null, supports dev: true in meta */
export const optionalAuthQuery = c.query
  .meta({ auth: 'optional' })
  .use(devMiddleware)
  .use(async ({ ctx, next }) => {
    const user = await getSessionUser(ctx);

    return next({
      ctx: {
        ...ctx,
        auth: user
          ? {
              ...ctx.auth,
              ...getAuth(ctx),
              headers: await getHeaders(ctx, user.session),
            }
          : ctx.auth,
        user,
        userId: user?.id ?? null,
      },
    });
  });

/** Auth query - ctx.user required, supports role: 'admin' and dev: true in meta */
export const authQuery = c.query
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(async ({ ctx, next }) => {
    const user = requireAuth(await getSessionUser(ctx));

    return next({
      ctx: {
        ...ctx,
        auth: {
          ...ctx.auth,
          ...getAuth(ctx),
          headers: await getHeaders(ctx, user.session),
        },
        user,
        userId: user.id,
      },
    });
  })
  .use(roleMiddleware);

// =============================================================================
// Mutation Procedures
// =============================================================================

/** Public mutation - no auth required, rate limited, supports dev: true in meta */
export const publicMutation = c.mutation
  .use(devMiddleware)
  .use(rateLimitMiddleware);

/** Private mutation - only callable from other Convex functions */
export const privateMutation = c.mutation.use(devMiddleware).internal();

/** MaybeAuth mutation - ctx.user may be null, rate limited, supports dev: true in meta */
export const optionalAuthMutation = c.mutation
  .meta({ auth: 'optional' })
  .use(devMiddleware)
  .use(async ({ ctx, next }) => {
    const user = await getSessionUser(ctx);

    return next({
      ctx: {
        ...ctx,
        auth: user
          ? {
              ...ctx.auth,
              ...getAuth(ctx),
              headers: await getHeaders(ctx, user.session),
            }
          : ctx.auth,
        user,
        userId: user?.id ?? null,
      },
    });
  })
  .use(rateLimitMiddleware);

/** Auth mutation - ctx.user required, rate limited, supports role: 'admin' and dev: true in meta */
export const authMutation = c.mutation
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(async ({ ctx, next }) => {
    const user = requireAuth(await getSessionUser(ctx));

    return next({
      ctx: {
        ...ctx,
        auth: {
          ...ctx.auth,
          ...getAuth(ctx),
          headers: await getHeaders(ctx, user.session),
        },
        user,
        userId: user.id,
      },
    });
  })
  .use(roleMiddleware)
  .use(rateLimitMiddleware);

// =============================================================================
// Action Procedures
// =============================================================================

/** Public action - no auth required, supports dev: true in meta */
export const publicAction = c.action.use(devMiddleware);

/** Private action - only callable from other Convex functions */
export const privateAction = c.action.use(devMiddleware).internal();

/** Auth action - ctx.user required, supports dev: true in meta */
export const authAction = c.action
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(async ({ ctx, next }) => {
    const caller = createUserCaller(ctx);
    const user = requireAuth(await caller.getSessionUser());

    return next({ ctx: { ...ctx, user, userId: user.id } });
  });

// =============================================================================
// HTTP Action Procedures
// =============================================================================

/** Public HTTP route - no auth required */
export const publicRoute = c.httpAction;

/** Auth HTTP route - verifies JWT via ctx.auth.getUserIdentity() */
export const authRoute = c.httpAction.use(async ({ ctx, next }) => {
  // Convex automatically validates JWT from Authorization header
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new CRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  return next({
    ctx: {
      ...ctx,
      userId: identity.subject,
      user: {
        id: identity.subject,
        email: identity.email,
        name: identity.name,
        // tokenIdentifier available for additional info
      },
    },
  });
});

/** Optional auth HTTP route - ctx.userId may be null */
export const optionalAuthRoute = c.httpAction.use(async ({ ctx, next }) => {
  const identity = await ctx.auth.getUserIdentity();

  return next({
    ctx: {
      ...ctx,
      userId: identity ? identity.subject : null,
      user: identity
        ? {
            id: identity.subject,
            email: identity.email,
            name: identity.name,
          }
        : null,
    },
  });
});

/** HTTP router factory - create nested HTTP routers like tRPC */
export const router = c.router;
