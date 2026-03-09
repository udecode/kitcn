/**
 * CRPC Type Tests - 100% Coverage
 *
 * This file contains type-level tests for all CRPC combinations.
 * Tests use @ts-expect-error to verify type errors happen where expected.
 *
 * Run: bun typecheck (should pass with all @ts-expect-error comments valid)
 */

/* biome-ignore-all lint: type test file with intentional expressions */
import { z } from 'zod';
import {
  createAuthCaller,
  createAuthHandler,
} from '../functions/generated/auth.runtime';
import {
  createProjectsCaller,
  createProjectsHandler,
} from '../functions/generated/projects.runtime';
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from '../functions/generated/server';
import type { SessionUser } from '../shared/auth-shared';
import {
  authMutation,
  authQuery,
  authRoute,
  optionalAuthMutation,
  optionalAuthQuery,
  optionalAuthRoute,
  publicAction,
  publicMutation,
  publicQuery,
  publicRoute,
} from './crpc';
import { resend } from './plugins/resend/plugin';

// Debug: Check what type publicRoute has
type _DebugHttpAction = typeof publicRoute;
type _DebugHttpActionDef = typeof publicRoute._def;

// Force TypeScript to show the actual type by causing an error
// @ts-expect-error - intentional for debugging type
const _forceError: string = publicRoute;

// ============================================================================
// Section 1: publicQuery - All Methods
// ============================================================================

// 1.1 query - no input, no output
// publicQuery has NO user/userId - tRPC style base procedure
export const public_query = publicQuery.query(async ({ ctx }) => {
  ctx.orm; // ✓ exists
  // ctx.user does NOT exist - auth middleware adds it
  // ctx.userId does NOT exist - auth middleware adds it
  return null;
});

// 1.2 query - with input
export const public_query_input = publicQuery
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const id: string = input.id;
    return ctx.orm.query.user.findFirst({ where: { id: id } });
  });

// 1.3 query - with output
export const public_query_output = publicQuery
  .output(z.string())
  .query(async () => 'test');

// 1.4 query - with input and output
export const public_query_io = publicQuery
  .input(z.object({ name: z.string() }))
  .output(z.object({ greeting: z.string() }))
  .query(async ({ input }) => ({ greeting: `Hello ${input.name}` }));

// Schema for paginated user results
const PaginatedUserSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
});

// 1.5 paginated().query() - auto-injects cursor/limit (flat)
export const public_paginated = publicQuery
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    input.cursor; // string | null
    input.limit; // number
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 1.6 paginated().query() - with custom input (chained)
export const public_paginated_input = publicQuery
  .input(z.object({ filter: z.string().optional() }))
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    const _filter: string | undefined = input.filter; // ✓ enforced
    const _cursor: string | null = input.cursor; // ✓ enforced
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 1.6b .input() with cursor/limit - manual pagination without .paginated()
// Use case: custom pagination without auto-wrapped output
export const public_manual_pagination = publicQuery
  .input(
    z.object({
      cursor: z.string().nullable(),
      limit: z.number().optional(),
    })
  )
  .query(async ({ ctx, input }) => {
    const _cursor: string | null = input.cursor; // ✓ enforced
    const _limit: number | undefined = input.limit; // ✓ enforced
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit ?? 10,
    });
  });

// 1.6c .input() with cursor/limit and custom output - manual pagination
export const public_manual_pagination_output = publicQuery
  .input(
    z.object({
      cursor: z.string().nullable(),
      limit: z.number().optional(),
      filter: z.string().optional(),
    })
  )
  .output(
    z.object({
      continueCursor: z.string().nullable(),
      isDone: z.boolean(),
      page: z.array(PaginatedUserSchema),
    })
  )
  .query(async ({ ctx, input }) => {
    const _filter: string | undefined = input.filter;
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit ?? 10,
    });
  });

// 1.7 internal().query()
export const public_internal_query = publicQuery
  .internal()
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 2: publicMutation - All Methods
// ============================================================================

// 2.1 mutation
export const public_mutation = publicMutation.mutation(async ({ ctx }) => {
  ctx.orm;
  return null;
});

// 2.2 mutation - with input and output
export const public_mutation_io = publicMutation
  .input(z.object({ id: z.string(), name: z.string() }))

  .mutation(async ({ ctx, input }) => {
    // Verify types are correct
    const id: string = input.id;
    const _name: string = input.name;
    ctx.orm; // orm should exist
    return null;
  });

// 2.3 internal().mutation()
export const public_internal_mutation = publicMutation
  .internal()
  .mutation(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 3: publicAction - All Methods
// ============================================================================

// 3.1 action
export const public_action = publicAction.action(async ({ ctx }) => {
  // Actions don't have table access
  ctx.runQuery;
  return null;
});

// 3.2 internal().action()
export const public_internal_action = publicAction
  .internal()
  .action(async ({ ctx }) => {
    ctx.runQuery;
    return null;
  });

// ============================================================================
// Section 4: optionalAuthQuery - All Methods
// ============================================================================

// 4.1 query - user may be null
export const publicOrAuth_query = optionalAuthQuery.query(async ({ ctx }) => {
  ctx.orm;
  // Explicit type annotations catch any-pollution
  const user: SessionUser | null = ctx.user;
  const userId: string | null = ctx.userId;
  // Must check for null before accessing
  if (user) {
    user.id; // OK after null check
  }
  return { user, userId };
});

// 4.2 query with input
export const publicOrAuth_query_input = optionalAuthQuery
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const id: string = input.id;
    return ctx.orm.query.user.findFirst({ where: { id: id } });
  });

// 4.3 paginated().query()
export const publicOrAuth_paginated = optionalAuthQuery
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    input.cursor;
    input.limit;
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 4.4 internal().query()
export const publicOrAuth_internal_query = optionalAuthQuery
  .internal()
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 5: optionalAuthMutation - All Methods
// ============================================================================

// 5.1 mutation
export const publicOrAuth_mutation = optionalAuthMutation.mutation(
  async ({ ctx }) => {
    ctx.orm;
    const user: SessionUser | null = ctx.user;
    return user;
  }
);

// 5.2 internal().mutation()
export const publicOrAuth_internal_mutation = optionalAuthMutation
  .internal()
  .mutation(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 6: authQuery - All Methods
// ============================================================================

// 6.1 query - user guaranteed non-null
export const auth_query = authQuery.query(async ({ ctx }) => {
  ctx.orm;
  // Explicit type annotations catch any-pollution and verify non-null
  const user: SessionUser = ctx.user;
  const userId: string = ctx.userId;
  user.id; // No optional chaining needed - guaranteed non-null
  return { user, userId };
});

// 6.2 query with input and output
export const auth_query_io = authQuery
  .input(z.object({ limit: z.number() }))
  .output(z.array(z.object({ id: z.string(), name: z.string() })))
  .query(async ({ ctx, input }) => {
    const users = await ctx.orm.query.user.findMany({ limit: input.limit });
    return users.map((u) => ({ id: u.id, name: u.name ?? '' }));
  });

// 6.3 paginated().query()
export const auth_paginated = authQuery
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    input.cursor;
    input.limit;
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 6.4 internal().query()
export const auth_internal_query = authQuery
  .internal()
  .query(async ({ ctx }) => {
    ctx.orm;
    const user: SessionUser = ctx.user;
    return user;
  });

// ============================================================================
// Section 7: authMutation - All Methods
// ============================================================================

// 7.1 mutation
export const auth_mutation = authMutation.mutation(async ({ ctx }) => {
  ctx.orm;
  const user: SessionUser = ctx.user;
  const userId: string = ctx.userId;
  return { user, userId };
});

// 7.2 mutation with input - verifying types
export const auth_mutation_input = authMutation
  .input(z.object({ id: z.string(), name: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Verify types are correct
    const id: string = input.id;
    const _name: string = input.name;
    ctx.orm; // orm should exist
    return null;
  });

// 7.3 internal().mutation()
export const auth_internal_mutation = authMutation
  .internal()
  .mutation(async ({ ctx }) => {
    ctx.orm;
    const user: SessionUser = ctx.user;
    return user;
  });

// ============================================================================
// Section 8: Admin Queries (using .meta({ role: 'admin' }))
// ============================================================================

// 8.1 admin query - using role: 'admin' in meta
export const admin_query = authQuery
  .meta({ role: 'admin' })
  .query(async ({ ctx }) => {
    ctx.orm;
    const user: SessionUser = ctx.user;
    const userId: string = ctx.userId;
    return { user, userId };
  });

// 8.2 admin query with input and output
export const admin_query_io = authQuery
  .meta({ role: 'admin' })
  .input(z.object({ userId: z.string() }))
  .output(z.object({ banned: z.boolean() }).nullable())
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.userId },
    });
    return user ? { banned: user.banned ?? false } : null;
  });

// 8.3 admin paginated().query()
export const admin_paginated = authQuery
  .meta({ role: 'admin' })
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    input.cursor;
    input.limit;
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 8.4 admin internal().query()
export const admin_internal_query = authQuery
  .meta({ role: 'admin' })
  .internal()
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 9: Type Error Assertions (@ts-expect-error)
// ============================================================================

// 9.1 publicQuery - user does NOT exist (tRPC style)
export const error_public_user_undefined = publicQuery.query(
  async ({ ctx }) => {
    // @ts-expect-error - user does not exist on publicQuery context
    return ctx.user;
  }
);

// 9.2 publicQuery - userId does NOT exist (tRPC style)
export const error_public_userId_undefined = publicQuery.query(
  async ({ ctx }) => {
    // @ts-expect-error - userId does not exist on publicQuery context
    return ctx.userId;
  }
);

// 9.3 optionalAuthQuery - must check null before access
export const error_publicOrAuth_user_no_check = optionalAuthQuery.query(
  async ({ ctx }) => {
    // @ts-expect-error - user may be null, must check first
    return ctx.user.id;
  }
);

// 9.4 Wrong return type - string expected, number provided
// TypeScript catches this at function signature level (good!)
export const error_wrong_return_type = authQuery
  .output(z.string())
  // @ts-expect-error - handler returns number but output expects string
  .query(async () => 123);

// 9.5 Wrong return type - object shape mismatch
// TypeScript catches this at function signature level (good!)
export const error_wrong_return_shape = publicQuery
  .output(z.object({ name: z.string() }))
  // @ts-expect-error - handler returns { wrongProp } but output expects { name }
  .query(async () => ({ wrongProp: 'test' }));

// 9.6 Input type is Record<string, never> when no .input() defined
// Accessing properties returns 'never' type (which is what we want)
export const input_is_empty_record = publicQuery.query(async ({ input }) => {
  // input.id is type 'never' - we can't do much with it
  // This tests that input is properly typed as empty
  const _keys = Object.keys(input);
  return _keys.length;
});

// 9.7 Accessing non-existent input property (wrong property)
export const error_input_wrong_prop = publicQuery
  .input(z.object({ name: z.string() }))
  .query(async ({ input }) => {
    // @ts-expect-error - input.nonexistent does not exist
    return input.nonexistent;
  });

// 9.8 Wrong input type
export const error_input_wrong_type = publicQuery
  .input(z.object({ count: z.number() }))
  .query(async ({ input }) => {
    // @ts-expect-error - count is number, not string
    const s: string = input.count;
    return s;
  });

// 9.9 paginated().query() - should have cursor/limit (flat)
export const paginated_has_opts = publicQuery
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ input }) => {
    // This should work - cursor/limit are auto-injected (flat)
    const cursor = input.cursor;
    const limit = input.limit;
    return { page: [], isDone: true, continueCursor: cursor ?? '' };
  });

// 9.10 Return type inference with output schema
// TypeScript catches missing properties at function signature level (good!)
export const error_return_mismatch = publicQuery
  .output(z.object({ id: z.string(), active: z.boolean() }))
  // @ts-expect-error - handler missing 'active' property required by output
  .query(async () => ({ id: '0' }));

// ============================================================================
// Section 10: Context Property Assertions
// ============================================================================

// 10.1 publicQuery ctx has orm property
export const ctx_public_table = publicQuery.query(async ({ ctx }) => {
  const users = await ctx.orm.query.user.findMany({ limit: 10 });
  return users.length;
});

// 10.2 authQuery ctx.user - guaranteed non-null after requireAuth
export const ctx_auth_user_props = authQuery.query(async ({ ctx }) => {
  const user: SessionUser = ctx.user;
  const userId: string = ctx.userId;
  // Direct access - no optional chaining needed
  const id: string = user.id;
  return { id, userId };
});

// 10.3 Verify ctx.userId type
export const ctx_userId_type = authQuery.query(async ({ ctx }) => {
  const userId: string = ctx.userId;
  return userId;
});

// ============================================================================
// Section 11: Input/Output Schema Combinations
// ============================================================================

// 11.1 Complex input schema
export const complex_input = publicQuery
  .input(
    z.object({
      id: z.string(),
      filters: z.object({
        status: z.enum(['active', 'inactive']),
        limit: z.number().optional(),
      }),
      tags: z.array(z.string()),
    })
  )
  .query(async ({ input }) => {
    const id: string = input.id;
    const status: 'active' | 'inactive' = input.filters.status;
    const limit: number | undefined = input.filters.limit;
    const tags: string[] = input.tags;
    return { id, status, limit, tags };
  });

// 11.2 Complex output schema - using publicQuery to avoid auth narrowing issues
export const complex_output = publicQuery
  .input(z.object({ userId: z.string() }))
  .output(
    z.object({
      user: z.object({
        id: z.string(),
        name: z.string(),
      }),
      metadata: z.object({
        createdAt: z.number(),
        updatedAt: z.number().optional(),
      }),
    })
  )
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.userId },
    });
    return {
      user: {
        id: input.userId,
        name: user?.name ?? '',
      },
      metadata: {
        createdAt: Date.now(),
      },
    };
  });

// 11.3 Nullable output
export const nullable_output = publicQuery
  .input(z.object({ id: z.string() }))
  .output(z.object({ name: z.string() }).nullable())
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.id },
    });
    return user ? { name: user.name ?? '' } : null;
  });

// 11.4 Array output
export const array_output = publicQuery
  .output(z.array(z.object({ id: z.string(), name: z.string() })))
  .query(async ({ ctx }) => {
    const users = await ctx.orm.query.user.findMany({ limit: 10 });
    return users.map((u) => ({ id: u.id, name: u.name ?? '' }));
  });

// ============================================================================
// Section 12: Method Chaining Order
// ============================================================================

// 12.1 input -> output -> query
export const chain_input_output_query = publicQuery
  .input(z.object({ id: z.string() }))
  .output(z.string())
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.id },
    });
    return user?.name ?? 'unknown';
  });

// 12.2 output -> input -> mutation
export const chain_output_input_mutation = publicMutation
  .output(z.string())
  .input(z.object({ name: z.string(), userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Verify types are correct
    const _name: string = input.name;
    ctx.orm; // orm should exist
    return input.userId;
  });

// ============================================================================
// Section 13: Edge Cases
// ============================================================================

// 13.1 Empty input should have Record<string, never> type
export const empty_input = publicQuery.query(async ({ input }) => {
  // input should be empty object type
  const keys = Object.keys(input);
  return keys.length === 0;
});

// 13.2 No output schema - return type is inferred
export const inferred_return = publicQuery.query(async ({ ctx }) => {
  const users = await ctx.orm.query.user.findMany({ limit: 5 });
  return users.map((u) => u.id); // Return type inferred to string[]
});

// 13.3 Void return without explicit output schema
export const void_return = publicMutation
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Verify types are correct
    const _userId: string = input.userId;
    ctx.orm; // orm should exist
    return null;
  });

// ============================================================================
// Section 14: Metadata - tRPC-style procedure metadata
// ============================================================================

// 14.1 query with .meta() - meta can be set on procedures
export const meta_query = publicQuery
  .meta({ ratelimit: 'default' })
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// 14.2 mutation with .meta()
export const meta_mutation = publicMutation
  .meta({ ratelimit: 'interactive' })
  .mutation(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// 14.3 action with .meta()
export const meta_action = publicAction
  .meta({ ratelimit: 'default' })
  .action(async ({ ctx }) => {
    ctx.runQuery;
    return null;
  });

// 14.4 .meta() with input and output
export const meta_io = publicQuery
  .meta({ ratelimit: 'default' })
  .input(z.object({ id: z.string() }))
  .output(z.string().nullable())
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.id },
    });
    return user?.name ?? null;
  });

// 14.5 .meta() with role - admin check via meta
export const meta_middleware = authQuery
  .meta({ role: 'admin', ratelimit: 'default' })
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// 14.6 .meta() chaining - shallow merge
export const meta_chained = publicQuery
  .meta({ ratelimit: 'default' })
  .meta({ dev: true })
  .query(async () => null);

// 14.7 .meta() with paginated
export const meta_paginated = publicQuery
  .meta({ ratelimit: 'interactive' })
  .paginated({ limit: 10, item: PaginatedUserSchema })
  .query(async ({ ctx, input }) => {
    return ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });
  });

// 14.8 .meta() with internal
export const meta_internal = publicQuery
  .meta({ ratelimit: 'default' })
  .internal()
  .query(async ({ ctx }) => {
    ctx.orm;
    return null;
  });

// ============================================================================
// Section 15: publicRoute - All Methods
// ============================================================================

// 15.1 httpAction - basic with route
// Debug: Check what the builder type is after route
const _afterRoute = publicRoute.get('/api/test');
type _AfterRouteType = typeof _afterRoute;

export const http_basic = publicRoute.get('/api/test').query(async (opts) => {
  // Check what opts type is
  type _OptsType = typeof opts;
  const { ctx } = opts;
  type _CtxType = typeof ctx;
  return { success: true };
});

// 15.2 httpAction - POST with input
export const http_post_input = publicRoute
  .post('/api/users')
  .input(z.object({ name: z.string(), email: z.string().email() }))
  .mutation(async ({ ctx, input }) => {
    const name: string = input.name;
    const email: string = input.email;
    return { name, email };
  });

// 15.3 httpAction - with output validation
export const http_output = publicRoute
  .get('/api/status')
  .output(z.object({ status: z.string(), timestamp: z.number() }))
  .query(async () => ({
    status: 'ok',
    timestamp: Date.now(),
  }));

// 15.4 httpAction - with input and output
export const http_io = publicRoute
  .post('/api/echo')
  .input(z.object({ message: z.string() }))
  .output(z.object({ echo: z.string() }))
  .mutation(async ({ input }) => ({
    echo: input.message,
  }));

// 15.5 httpAction - path params
export const http_params = publicRoute
  .get('/api/users/:id')
  .params(z.object({ id: z.string() }))
  .query(async ({ ctx, params }) => {
    const id: string = params.id;
    return { id };
  });

// 15.6 httpAction - query params
export const http_query = publicRoute
  .get('/api/search')
  .searchParams(
    z.object({ q: z.string(), limit: z.coerce.number().optional() })
  )
  .query(async ({ searchParams }) => {
    const q: string = searchParams.q;
    const limit: number | undefined = searchParams.limit;
    return { q, limit };
  });

// 15.7 httpAction - path params + query params
export const http_params_query = publicRoute
  .get('/api/users/:id/posts')
  .params(z.object({ id: z.string() }))
  .searchParams(z.object({ page: z.coerce.number().optional() }))
  .query(async ({ params, searchParams }) => {
    const userId: string = params.id;
    const page: number | undefined = searchParams.page;
    return { userId, page };
  });

// 15.8 httpAction - raw mode (use c.req for request access)
export const http_raw = publicRoute
  .post('/api/webhooks/test')
  .mutation(async ({ c }) => {
    const body = await c.req.text();
    const signature = c.req.header('x-signature');
    return { received: true, hasSignature: !!signature };
  });

// 15.9 httpAction - Response return via c.redirect()
export const http_response = publicRoute
  .get('/api/redirect')
  .query(async ({ c }) => c.redirect('https://example.com', 302));

// 15.10 httpAction - raw mode returns Response via c helpers
export const http_raw_response = publicRoute
  .post('/api/proxy')
  .mutation(async ({ c }) => {
    const body = await c.req.text();
    return c.text(body);
  });

// ============================================================================
// Section 16: authRoute - Authenticated HTTP Actions
// ============================================================================

// 16.1 authRoute - user guaranteed non-null
// Note: ctx.user type comes from getSessionUser query output (subset of SessionUser)
export const http_auth_basic = authRoute
  .get('/api/me')
  .query(async ({ ctx }) => {
    // ctx.user is the type returned by api.user.getSessionUser - verify key properties exist
    const user = ctx.user;
    const userId: string = ctx.userId;
    user.id; // string
    return { user, userId };
  });

// 16.2 authRoute - with input
export const http_auth_input = authRoute
  .put('/api/profile')
  .input(z.object({ name: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const userId: string = ctx.userId;
    const name: string = input.name;
    return { userId, name };
  });

// 16.3 authRoute - with params and storage
export const http_auth_params = authRoute
  .get('/api/projects/:id')
  .params(z.object({ id: z.string() }))
  .query(async ({ ctx, params, c }) => {
    const projectId: string = params.id;
    // Test that ctx has storage
    ctx.storage;
    return c.json({ id: projectId });
  });

// ============================================================================
// Section 17: HTTP Action Type Error Assertions
// ============================================================================

// 17.1 publicRoute - user does NOT exist
export const error_http_user_undefined = publicRoute
  .get('/api/test')
  .query(async ({ ctx }) => {
    // @ts-expect-error - user does not exist on publicRoute context
    return ctx.user;
  });

// 17.2 publicRoute - userId does NOT exist
export const error_http_userId_undefined = publicRoute
  .get('/api/test')
  .query(async ({ ctx }) => {
    // @ts-expect-error - userId does not exist on publicRoute context
    return ctx.userId;
  });

// 17.3 Wrong input property
export const error_http_input_wrong_prop = publicRoute
  .route('/api/test', 'POST')
  .input(z.object({ name: z.string() }))
  .mutation(async ({ input }) => {
    // @ts-expect-error - input.nonexistent does not exist
    return input.nonexistent;
  });

// 17.4 Wrong params property
export const error_http_params_wrong_prop = publicRoute
  .get('/api/users/:id')
  .params(z.object({ id: z.string() }))
  .query(async ({ params }) => {
    // @ts-expect-error - params.nonexistent does not exist
    return params.nonexistent;
  });

// 17.5 Wrong searchParams property
export const error_http_searchParams_wrong_prop = publicRoute
  .get('/api/search')
  .searchParams(z.object({ q: z.string() }))
  .query(async ({ searchParams }) => {
    // @ts-expect-error - searchParams.nonexistent does not exist
    return searchParams.nonexistent;
  });

// 17.6 Output schema enforced at compile-time
export const http_output_compile_validation = publicRoute
  .get('/api/test')
  .output(z.object({ name: z.string() }))
  .query(async () => ({ name: 'valid' }));

// 17.7 Output schema wrong return type - enforced at compile-time
export const error_http_output_wrong_type = publicRoute
  .get('/api/test')
  .output(z.object({ name: z.string() }))
  // @ts-expect-error - handler returns wrong shape, output enforces { name: string }
  .query(async () => ({ wrong: 'shape' }));

// 17.8 c.text() returns Response - tests Response return
export const http_response_return = publicRoute
  .get('/api/test')
  .query(async ({ c }) => c.text('ok'));

// ============================================================================
// Section 18: HTTP Action - Additional Coverage
// ============================================================================

// 18.1 httpAction - PUT method
export const http_put = publicRoute
  .put('/api/users/:id')
  .params(z.object({ id: z.string() }))
  .input(z.object({ name: z.string() }))
  .mutation(async ({ params, input }) => {
    const id: string = params.id;
    const name: string = input.name;
    return { id, name, method: 'PUT' };
  });

// 18.2 httpAction - PATCH method
export const http_patch = publicRoute
  .patch('/api/users/:id')
  .params(z.object({ id: z.string() }))
  .input(z.object({ name: z.string().optional() }))
  .mutation(async ({ params, input }) => {
    const id: string = params.id;
    const name: string | undefined = input.name;
    return { id, name, method: 'PATCH' };
  });

// 18.3 httpAction - DELETE method
export const http_delete = publicRoute
  .delete('/api/users/:id')
  .params(z.object({ id: z.string() }))
  .mutation(async ({ params }) => {
    const id: string = params.id;
    return { deleted: id, method: 'DELETE' };
  });

// 18.4 httpAction - input + params + query combined
export const http_all_schemas = publicRoute
  .post('/api/projects/:projectId/tasks')
  .params(z.object({ projectId: z.string() }))
  .searchParams(z.object({ notify: z.coerce.boolean().optional() }))
  .input(z.object({ title: z.string(), description: z.string().optional() }))
  .output(z.object({ taskId: z.string(), projectId: z.string() }))
  .mutation(async ({ params, searchParams, input }) => {
    const projectId: string = params.projectId;
    const notify: boolean | undefined = searchParams.notify;
    const title: string = input.title;
    const description: string | undefined = input.description;
    return { taskId: `task_${title}`, projectId };
  });

// 18.5 httpAction - access request via c.req
export const http_ctx_properties = publicRoute
  .get('/api/debug')
  .query(async ({ c }) => {
    // Use c.req for request access (c.req.raw for raw Request)
    return {
      hasRequest: !!c.req,
      urlPath: c.req.path,
      method: c.req.method,
    };
  });

// 18.6 httpAction - .meta() method
export const http_meta = publicRoute
  .meta({ ratelimit: 'interactive' })
  .get('/api/meta-test')
  .query(async () => ({ meta: true }));

// 18.7 httpAction - .meta() with chaining
export const http_meta_chained = publicRoute
  .meta({ ratelimit: 'default' })
  .meta({ dev: true })
  .get('/api/meta-chained')
  .query(async () => ({ chained: true }));

// 18.8 httpAction - .meta() with input/output
export const http_meta_io = publicRoute
  .meta({ ratelimit: 'default' })
  .post('/api/meta-io')
  .input(z.object({ data: z.string() }))
  .output(z.object({ result: z.string() }))
  .mutation(async ({ input }) => ({ result: input.data }));

// 18.9 httpAction - .use() with inline middleware
export const http_use_middleware = publicRoute
  .use(async ({ ctx, next }) => {
    // Add custom property via middleware
    const result = await next({ ctx: { ...ctx, customProp: 'added' } });
    return result;
  })
  .get('/api/middleware-test')
  .query(async ({ ctx }) => {
    const customProp: string = ctx.customProp;
    return { customProp };
  });

// 18.10 authRoute - .use() with context extension
export const http_auth_use = authRoute
  .use(async ({ ctx, next }) => {
    return next({ ctx: { ...ctx, permissions: ['read', 'write'] } });
  })
  .get('/api/auth-middleware')
  .query(async ({ ctx }) => {
    const permissions: string[] = ctx.permissions;
    const userId: string = ctx.userId;
    return { permissions, userId };
  });

// 18.11 httpAction - reusable plugin middleware preserves ctx.api
export const http_use_plugin_middleware = publicRoute
  .use(resend.middleware())
  .post('/api/plugin-middleware')
  .mutation(async ({ ctx, c }) => {
    await ctx.api.resend.verifyWebhookEvent(c.req.raw);
    return null;
  });

// ============================================================================
// Section 19: HTTP Action - Additional Error Assertions
// ============================================================================

// 19.1 Accessing params when not defined
export const http_no_params = publicRoute
  .get('/api/no-params')
  .query(async (opts) => {
    // @ts-expect-error - params not defined, should not exist
    return opts.params;
  });

// 19.2 Accessing query when not defined
export const http_no_query = publicRoute
  .get('/api/no-query')
  .query(async (opts) => {
    // @ts-expect-error - query not defined, should not exist
    return opts.query;
  });

// 19.3 Accessing input when not defined (GET)
export const http_no_input = publicRoute
  .get('/api/no-input')
  .query(async (opts) => {
    // @ts-expect-error - input not defined, should not exist
    return opts.input;
  });

// ============================================================================
// Section 20: HTTP Client Type Tests
// ============================================================================

import { type InferHttpInput, type InferHttpOutput } from 'better-convex/crpc';

// 20.1 InferHttpInput - POST with body
type _InputPostInput = InferHttpInput<typeof http_post_input>;
// Should be: { name: string; email: string }
const _testPostInput: _InputPostInput = {
  name: 'test',
  email: 'test@example.com',
};

// 20.2 InferHttpInput - GET with path params
type _InputParams = InferHttpInput<typeof http_params>;
// Should be: { id: string }
const _testParams: _InputParams = { id: 'test' };

// 20.3 InferHttpInput - GET with path params + query params (merged)
type _InputParamsQuery = InferHttpInput<typeof http_params_query>;
// Should be: { id: string; page?: number }
const _testParamsQuery: _InputParamsQuery = {
  id: 'test',
  page: 1,
};

// 20.4 InferHttpOutput - GET with output schema
type _OutputStatus = InferHttpOutput<typeof http_output>;
// Should be: { status: string; timestamp: number }
const _testOutput: _OutputStatus = { status: 'ok', timestamp: 123 };

// Each property should be a function

// ============================================================================
// Section 21: Hono Context `c` - Type Tests
// ============================================================================

// 21.1 c.json() - returns Response
export const http_c_json = publicRoute
  .get('/api/c-json')
  .query(async ({ c }) => c.json({ data: 'test' }));

// 21.2 c.text() - returns Response
export const http_c_text = publicRoute
  .get('/api/c-text')
  .query(async ({ c }) => c.text('Hello'));

// 21.3 c.header() - set custom headers
export const http_c_header = publicRoute
  .get('/api/c-header')
  .query(async ({ c }) => {
    c.header('X-Custom', 'value');
    return c.json({ ok: true });
  });

// 21.4 c.redirect() - returns Response
export const http_c_redirect = publicRoute
  .get('/api/c-redirect')
  .query(async ({ c }) => c.redirect('/new-path', 301));

// 21.5 raw mode - c.req.header() and c.req.text()
export const http_c_raw = publicRoute
  .post('/api/c-raw')
  .mutation(async ({ c }) => {
    const sig = c.req.header('x-signature');
    const body = await c.req.text();
    return c.text('OK');
  });

// 21.6 optionalAuthRoute - ctx.userId may be null
export const http_optional_auth = optionalAuthRoute
  .get('/api/optional-auth')
  .query(async ({ ctx }) => {
    const userId: string | null = ctx.userId;
    return { userId };
  });

// 21.7 optionalAuthRoute - must check null
export const error_optional_auth_no_check = optionalAuthRoute
  .get('/api/test')
  .query(async ({ ctx }) => {
    // @ts-expect-error - userId may be null, can't use directly as non-null
    const userId: string = ctx.userId;
    return { userId };
  });

// ============================================================================
// Section 22: Middleware Input Access - tRPC-style
// ============================================================================

// 22.1 Middleware before .input() - input is unknown
export const middleware_before_input = publicQuery
  .use(async ({ input, next }) => {
    // input is unknown before .input()
    const _unknownInput: unknown = input;
    return next();
  })
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const id: string = input.id;
    return { id };
  });

// 22.2 Middleware after .input() - input is typed
export const middleware_after_input = publicQuery
  .input(z.object({ id: z.string() }))
  .use(async ({ input, next }) => {
    // input.id is typed string
    const id: string = input.id;
    return next();
  })
  .query(async ({ input }) => {
    return { id: input.id };
  });

// 22.3 Chained inputs - middleware sees accumulated type
export const middleware_chained_input = publicQuery
  .input(z.object({ a: z.string() }))
  .use(async ({ input, next }) => {
    // Has { a: string }
    const a: string = input.a;
    return next();
  })
  .input(z.object({ b: z.number() }))
  .use(async ({ input, next }) => {
    // Has { a: string, b: number }
    const a: string = input.a;
    const b: number = input.b;
    return next();
  })
  .query(async ({ input }) => {
    return { a: input.a, b: input.b };
  });

// 22.4 Middleware can access getRawInput
export const middleware_getRawInput = publicQuery
  .input(z.object({ name: z.string() }))
  .use(async ({ getRawInput, next }) => {
    const raw = await getRawInput();
    // raw is unknown
    const _raw: unknown = raw;
    return next();
  })
  .query(async () => null);

// 22.5 next() can pass modified input (with ctx to satisfy type constraint)
export const middleware_next_input = publicQuery
  .input(z.object({ id: z.string() }))
  .use(async ({ ctx, input, next }) => {
    return next({ ctx, input: { ...input, enriched: true } });
  })
  .query(async ({ input }) => {
    return { id: input.id };
  });

// 22.6 Existing middleware without input destructuring still works
export const middleware_no_input_destructure = publicQuery
  .use(async ({ ctx, next }) => {
    // Don't destructure input - should still work
    return next({ ctx: { ...ctx, added: true } });
  })
  .query(async ({ ctx }) => {
    const added: boolean = ctx.added;
    return { added };
  });

// 22.7 Middleware context + input both work
export const middleware_ctx_and_input = authQuery
  .input(z.object({ projectId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    // ctx has user/userId from auth middleware
    const userId: string = ctx.userId;
    // input is typed
    const projectId: string = input.projectId;
    return next({ ctx: { ...ctx, projectId } });
  })
  .query(async ({ ctx, input }) => {
    const projectId: string = ctx.projectId;
    return { userId: ctx.userId, projectId: input.projectId };
  });

// 22.8 Mutation with middleware input access
export const middleware_mutation_input = publicMutation
  .input(z.object({ name: z.string() }))
  .use(async ({ input, next }) => {
    const name: string = input.name;
    return next();
  })
  .mutation(async ({ input }) => {
    return { created: input.name };
  });

// 22.9 Action with middleware input access
export const middleware_action_input = publicAction
  .input(z.object({ url: z.string() }))
  .use(async ({ input, next }) => {
    const url: string = input.url;
    return next();
  })
  .action(async ({ input }) => {
    return { fetched: input.url };
  });

// 22.10 Error: Accessing typed property before .input()
export const error_middleware_input_before_schema = publicQuery
  .use(async ({ input, next }) => {
    // @ts-expect-error - input is unknown before .input(), can't access .id
    input.id;
    return next();
  })
  .input(z.object({ id: z.string() }))
  .query(async () => null);

// 22.11 Error: Accessing wrong property after .input()
export const error_middleware_input_wrong_prop = publicQuery
  .input(z.object({ name: z.string() }))
  .use(async ({ input, next }) => {
    // @ts-expect-error - input.nonexistent does not exist
    input.nonexistent;
    return next();
  })
  .query(async () => null);

// 22.12 Chained .use() - context accumulation (verifies no regression from TBaseCtx -> any)
export const middleware_chained_use = publicQuery
  .use(async ({ ctx, next }) => {
    // First middleware adds 'firstProp'
    return next({ ctx: { ...ctx, firstProp: 'first' as const } });
  })
  .use(async ({ ctx, next }) => {
    // Second middleware can access 'firstProp' and adds 'secondProp'
    const first: 'first' = ctx.firstProp; // ✓ typed correctly
    return next({ ctx: { ...ctx, secondProp: 42 as const } });
  })
  .query(async ({ ctx }) => {
    // Handler can access both properties with correct types
    const first: 'first' = ctx.firstProp;
    const second: 42 = ctx.secondProp;
    return { first, second };
  });

// 22.13 Chained .use() with authQuery - verifies auth context preserved
export const middleware_chained_use_auth = authQuery
  .use(async ({ ctx, next }) => {
    // Auth context (user, userId) should be available
    const userId: string = ctx.userId;
    return next({ ctx: { ...ctx, step1: true } });
  })
  .use(async ({ ctx, next }) => {
    // Both auth context and step1 should be available
    const userId: string = ctx.userId;
    const step1: boolean = ctx.step1;
    return next({ ctx: { ...ctx, step2: 'done' } });
  })
  .query(async ({ ctx }) => {
    // All context properties should be available
    const userId: string = ctx.userId;
    const user: SessionUser = ctx.user;
    const step1: boolean = ctx.step1;
    const step2: string = ctx.step2;
    return { userId, step1, step2 };
  });

// 22.14 Error: Chained .use() - accessing property from later middleware
export const error_middleware_chained_forward_ref = publicQuery
  .use(async ({ ctx, next }) => {
    // @ts-expect-error - secondProp doesn't exist yet (added by next middleware)
    ctx.secondProp;
    return next({ ctx: { ...ctx, firstProp: 'first' } });
  })
  .use(async ({ ctx, next }) => {
    return next({ ctx: { ...ctx, secondProp: 42 } });
  })
  .query(async () => null);

// ============================================================================
// Section 23: module runtime createCaller(ctx) matrix typing
// ============================================================================

const projectsQueryCaller = createProjectsCaller({} as QueryCtx);
const projectsMutationCaller = createProjectsCaller({} as MutationCtx);
const projectsActionCaller = createProjectsCaller({} as ActionCtx);
const projectsQueryHandler = createProjectsHandler({} as QueryCtx);
const projectsMutationHandler = createProjectsHandler({} as MutationCtx);
const generatedActionCaller = createAuthCaller({} as ActionCtx);
const generatedQueryHandler = createAuthHandler({} as QueryCtx);
const generatedMutationHandler = createAuthHandler({} as MutationCtx);

projectsQueryCaller.list;
// @ts-expect-error query caller excludes mutations
projectsQueryCaller.create;

projectsMutationCaller.list;
projectsMutationCaller.create;
projectsActionCaller.list;
projectsActionCaller.create;
projectsQueryHandler.list;
// @ts-expect-error query handler excludes mutations
projectsQueryHandler.create;

projectsMutationHandler.list;
projectsMutationHandler.create;
generatedMutationHandler.create;
generatedMutationHandler.deleteOne;
generatedMutationHandler.findOne;
generatedMutationHandler.updateOne;
// @ts-expect-error query handler excludes generated mutations
generatedQueryHandler.create;
generatedQueryHandler.findOne;
generatedActionCaller.findOne;
generatedActionCaller.create;
generatedActionCaller.actions.getLatestJwks;
generatedActionCaller.actions.rotateKeys;
generatedActionCaller.schedule.now.create;
generatedActionCaller.schedule.now.rotateKeys;
// @ts-expect-error schedule excludes queries
generatedActionCaller.schedule.now.findOne;
// @ts-expect-error action caller excludes actions on root
generatedActionCaller.rotateKeys;

type _generatedQueryCallerListInput = Parameters<
  typeof projectsQueryCaller.list
>[0];
type _generatedMutationCallerCreateInput = Parameters<
  typeof projectsMutationCaller.create
>[0];
