# better-convex

## 0.6.1

### Patch Changes

- [#82](https://github.com/udecode/better-convex/pull/82) [`aed9972`](https://github.com/udecode/better-convex/commit/aed9972f5869949cfc02ca2eb6bfcb7e57fb754d) Thanks [@zbeyens](https://github.com/zbeyens)! - Migration example: https://github.com/udecode/better-convex/pull/82

  Added `AnyColumn` type export for self-referencing foreign keys (mirrors Drizzle's `AnyPgColumn`).

  ```ts
  import { type AnyColumn, convexTable, text } from "better-convex/orm";

  export const comments = convexTable("comments", {
    body: text().notNull(),
    parentId: text().references((): AnyColumn => comments.id, {
      onDelete: "cascade",
    }),
  });
  ```

## 0.6.0

### Minor Changes

- [#75](https://github.com/udecode/better-convex/pull/75) [`54eeb6d`](https://github.com/udecode/better-convex/commit/54eeb6d68909737b21b3dddfa860de0fc84e7924) Thanks [@zbeyens](https://github.com/zbeyens)! - - Added `better-convex/orm` as the recommended DB API surface (Drizzle-style schema/query/mutation API).
  - Docs: [/docs/db/orm](https://www.better-convex.com/docs/db/orm)
  - Migration guide: [/docs/migrations/convex](https://www.better-convex.com/docs/migrations/convex)

  ## Breaking changes
  - `createAuth(ctx)` is removed. Use `getAuth(ctx)` for query/mutation/action/http.

  ```ts
  // Before
  export const createAuth = (ctx: ActionCtx) =>
    betterAuth(createAuthOptions(ctx));
  app.use(authMiddleware(createAuth));

  // After
  export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));
  app.use(authMiddleware(getAuth));
  ```

  - `authClient.httpAdapter` is no longer needed. Use context-aware `adapter(...)`.

  ```ts
  // Before
  database: authClient.httpAdapter(ctx);

  // After
  database: authClient.adapter(ctx, getAuthOptions);
  ```

  - cRPC templates now use `ctx.orm` (not `ctx.table`) and string IDs at the API boundary.

  ```ts
  // Before
  input: z.object({ id: zid("user") });
  const user = await ctx.table("user").get(input.id);

  // After
  input: z.object({ id: z.string() });
  const user = await ctx.orm.query.user.findFirst({ where: { id: input.id } });
  ```

  - cRPC/auth context ID types are now string-based at the procedure boundary (`ctx.userId`, params, input/output IDs).

  ```ts
  // Before
  const userId: Id<"user"> = ctx.userId;

  // After
  const userId: string = ctx.userId;
  ```

  - `getAuthConfigProvider` should be imported from `better-convex/auth-config`.
    (instead of legacy `@convex-dev/better-auth/auth-config`, or old `better-convex/auth` docs)

  ```ts
  // Before
  import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

  // After
  import { getAuthConfigProvider } from "better-convex/auth-config";
  ```

  - Remove legacy app deps: `@convex-dev/better-auth`, `convex-ents`, and `convex-helpers`.

  ```sh
  bun remove @convex-dev/better-auth convex-ents convex-helpers
  ```

  - `convex-helpers` primitives are no longer part of the template path.
    Replace `zid(...)` with `z.string()`, and remove `customMutation`/`Triggers` wrappers in favor of:
    - `initCRPC.create()` defaults
    - trigger declarations in schema table config
  - ORM row shape is `id`/`createdAt` (not `_id`/`_creationTime`) at the app boundary.
    Update UI/client code and shared types accordingly.

  ## Features
  - `initCRPC.create()` supports default Convex builders, so old manual wiring is usually unnecessary.

  ```ts
  // Before (remove this boilerplate)
  const c = initCRPC.create({
    query,
    internalQuery,
    mutation,
    internalMutation,
    action,
    internalAction,
    httpAction,
  });
  const internalMutationWithTriggers = customMutation(...);

  // After
  const c = initCRPC.create();
  // Triggers are declared in schema table config.
  ```

  - cRPC now supports wire transformers end-to-end (Date codec included by default).
    - Supported in `initCRPC.create({ transformer })`, HTTP proxy, server caller, React client, and RSC query client.

  ```ts
  const c = initCRPC.create({ transformer: superjson });

  const http = createHttpProxy({
    convexSiteUrl,
    routes,
    transformer: superjson,
  });
  ```

  - Auth setup supports `triggers` + `context` in `createClient`, and `context` in `createApi`.

  ```ts
  const authClient = createClient({
    authFunctions,
    schema,
    triggers,
    context: getOrmCtx,
  });

  const authApi = createApi(schema, getAuth, {
    context: getOrmCtx,
  });
  ```

  - `createEnv` can replace manual env parsing/throw boilerplate.

  ```ts
  // Before
  export const getEnv = () => {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) throw new Error("Invalid environment variables");
    return parsed.data;
  };

  // After
  export const getEnv = createEnv({ schema: envSchema });
  ```

  - Added new public server helpers: context guards (`isActionCtx`/`requireActionCtx`, etc.).

  ## Patched
  - Updated template and docs to use:
    - `better-convex/auth-client` (`convexClient`)
    - `better-convex/auth-config` (`getAuthConfigProvider`)
  - Example app migration now reflects the current user-facing API (`ctx.orm`, `getAuth(ctx)`, simpler `initCRPC.create()`).
  - cRPC/server error handling now normalizes known causes into deterministic CRPC errors:
    - `OrmNotFoundError` -> `NOT_FOUND`
    - `APIError` status/statusCode -> mapped cRPC code
    - standard `Error.message`/stack preservation on wrapped errors
  - HTTP route validation errors (params/query/body/form) now return `BAD_REQUEST` consistently.
  - `createAuthMutations` now throws `AUTH_STATE_TIMEOUT` when auth token never appears after sign-in/up flow.
  - `getSession` now returns `null` when no session id is present (instead of attempting invalid DB lookups).
  - CLI reliability improvements (`better-convex dev/codegen/env`): argument parsing and entrypoint resolution are more robust across runtime/symlink setups.

  ```ts
  // Client import migration
  // Before
  import { convexClient } from "@convex-dev/better-auth/client/plugins";

  // After
  import { convexClient } from "better-convex/auth-client";
  ```

  ```ts
  // Retry only non-deterministic errors
  import { isCRPCError } from "better-convex/crpc";

  retry: (count, error) => !isCRPCError(error) && count < 3;
  ```

## 0.5.8

### Patch Changes

- [#73](https://github.com/udecode/better-convex/pull/73) [`232d126`](https://github.com/udecode/better-convex/commit/232d12697602e5c1cb3965b6e12cfe9b880d3c5c) Thanks [@zbeyens](https://github.com/zbeyens)! - Support multiple WHERE conditions in `update()` for Better Auth organization plugin compatibility.
  - Multiple AND conditions with equality checks now work
  - Validates exactly 1 document matches before updating (prevents accidental bulk updates)
  - OR conditions and non-eq operators still require `updateMany()`

## 0.5.7

### Patch Changes

- [#61](https://github.com/udecode/better-convex/pull/61) [`7e63e54`](https://github.com/udecode/better-convex/commit/7e63e541fc2853d8d1d45e4f1fb7db3f82e0592c) Thanks [@zbeyens](https://github.com/zbeyens)! - Auth mutation hooks now properly trigger `onError` when Better Auth returns errors (401, 422, etc.).

  ```tsx
  // Before: onSuccess always ran, even on errors
  // After: onError fires on auth failures

  const signUp = useMutation(
    useSignUpMutationOptions({
      onSuccess: () => router.push("/"), // Only on success now
      onError: (error) => toast.error(error.message), // Fires on auth errors
    }),
  );
  ```

  New exports: `AuthMutationError` class and `isAuthMutationError` type guard for error handling.

## 0.5.6

### Patch Changes

- [`fdeae26`](https://github.com/udecode/better-convex/commit/fdeae26ef81b46dc1334a4940814628d398659d9) Thanks [@zbeyens](https://github.com/zbeyens)! - - Support Convex 1.31.6
  - Missing `jotai` dependency

## 0.5.5

### Patch Changes

- [#56](https://github.com/udecode/better-convex/pull/56) [`b34a396`](https://github.com/udecode/better-convex/commit/b34a39621af83c6b6f2b2e6e11e35997981c5bb4) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `ConvexProviderWithAuth` for `@convex-dev/auth` users (React Native):

  ```tsx
  import { ConvexProviderWithAuth } from "better-convex/react";

  <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
    <App />
  </ConvexProviderWithAuth>;
  ```

  Enables `skipUnauth` queries, `useAuth`, and conditional rendering components.

## 0.5.4

### Patch Changes

- [#54](https://github.com/udecode/better-convex/pull/54) [`4321118`](https://github.com/udecode/better-convex/commit/43211189285333f998cef34c7726efa1735837aa) Thanks [@zbeyens](https://github.com/zbeyens)! - Support nested file structures in meta generation:

  ```
  convex/functions/
    todos.ts           → crpc.todos.*
    items/queries.ts   → crpc.items.queries.*
  ```

  - Organize functions in subdirectories
  - `_` prefixed files/directories are excluded

## 0.5.3

### Patch Changes

- [#44](https://github.com/udecode/better-convex/pull/44) [`ea6bfce`](https://github.com/udecode/better-convex/commit/ea6bfce4fb20dda7afdad4a9d0663aa7021e2a88) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix queries throwing without auth provider.

## 0.5.2

### Patch Changes

- [`185f496`](https://github.com/udecode/better-convex/commit/185f496c6b64e70cba96adcfe25e459c8c559a92) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `staticQueryOptions` method to CRPC proxy for non-hook usage in event handlers.

- [`2288076`](https://github.com/udecode/better-convex/commit/228807652c04df9bdb1e9f054a0664d35a643ff2) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix `MiddlewareBuilder` generic parameter mismatch causing typecheck failures when using reusable middleware with `.use()`. Factory functions now correctly pass through the `TInputOut` parameter added in v0.5.1.

## 0.5.1

### Patch Changes

- [#39](https://github.com/udecode/better-convex/pull/39) [`ede0d47`](https://github.com/udecode/better-convex/commit/ede0d473ed8f7254f44b9edb86172cfd3c900857) Thanks [@zbeyens](https://github.com/zbeyens)! - Middleware now receives `input` and `getRawInput` parameters:

  ```ts
  publicQuery
    .input(z.object({ projectId: zid("projects") }))
    .use(async ({ ctx, input, next }) => {
      // input.projectId is typed!
      const project = await ctx.db.get(input.projectId);
      return next({ ctx: { ...ctx, project } });
    });
  ```

  - Middleware after `.input()` receives typed input
  - Middleware before `.input()` receives `unknown`
  - `getRawInput()` returns raw input before validation
  - `next({ input })` allows modifying input for downstream middleware
  - Non-breaking: existing middleware works unchanged

## 0.5.0

### Minor Changes

- [#34](https://github.com/udecode/better-convex/pull/34) [`e2a2f62`](https://github.com/udecode/better-convex/commit/e2a2f6258d75007c39b6dc86d6000e0a9460052d) Thanks [@zbeyens](https://github.com/zbeyens)! - URL searchParams now auto-coerce to numbers and booleans based on Zod schema type, eliminating `z.coerce.*` boilerplate:

  ```ts
  // Before: Required z.coerce.* boilerplate
  .searchParams(z.object({
    page: z.coerce.number().optional(),
    active: z.coerce.boolean().optional(),
  }))

  // After: Standard Zod schemas work directly
  .searchParams(z.object({
    page: z.number().optional(),
    active: z.boolean().optional(),
  }))
  ```

  Coercion behavior:
  - `z.number()` - parses string to number (`"5"` → `5`)
  - `z.boolean()` - parses `"true"`/`"1"` → `true`, everything else → `false`
  - Works with `.optional()`, `.nullable()`, `.default()` wrappers
  - `z.coerce.*` still works if preferred

  ### Vanilla CRPC client

  `useCRPCClient()` now returns a typed proxy for direct procedural calls without React Query:

  ```ts
  const client = useCRPCClient();

  // Convex functions
  const user = await client.user.get.query({ id });
  await client.user.update.mutate({ id, name: "test" });

  // HTTP endpoints
  const todos = await client.http.todos.list.query();
  await client.http.todos.create.mutate({ title: "New" });
  ```

  Useful for event handlers, effects, or when you don't need caching/deduplication.

  **Breaking:** `useCRPCClient()` return type changed from `ConvexReactClient` to typed proxy. Use `useConvex()` (now exported from `better-convex/react`) for raw client access.

  ### Error handling: `isCRPCError` helper

  New unified error check for retry logic - returns true for any deterministic CRPC error (Convex 4xx or HTTP 4xx):

  ```ts
  import { isCRPCError } from "better-convex/crpc";

  // In query client config
  retry: (failureCount, error) => {
    if (isCRPCError(error)) return false; // Don't retry client errors
    return failureCount < 3;
  };
  ```

## 0.4.0

### Minor Changes

- [#31](https://github.com/udecode/better-convex/pull/31) [`618ec38`](https://github.com/udecode/better-convex/commit/618ec386eaf7e893d87570616871386953789753) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Client: Hybrid API

  The HTTP client now uses a hybrid API combining tRPC-style JSON body at root level with explicit `params`/`searchParams` for URL data.

  #### Breaking Changes
  - **Query/mutation args restructured**: Path params and search params now use explicit keys instead of flat merging
    - Before: `queryOptions({ id: '123', limit: 10 })`
    - After: `queryOptions({ params: { id: '123' }, searchParams: { limit: '10' } })`
  - **Client options in args**: `fetch`, `init`, `headers` go in args (1st param)
    - `queryOptions(args?, queryOpts?)` - args = params/searchParams/form/headers/etc
    - `mutationOptions(mutationOpts?)` - client opts go in `mutate(args)` call
  - **Server handler `query` renamed to `searchParams`**: Consistent naming between client and server
    - Before: `.query(async ({ query }) => { query.limit })`
    - After: `.query(async ({ searchParams }) => { searchParams.limit })`

  #### New Features
  - **Explicit input args**: `params`, `searchParams` keys for clear separation
  - **JSON body at root**: Non-reserved keys spread at root level (tRPC-style): `mutate({ title: 'New' })`
  - **Typed form uploads**: `.form()` builder method for typed FormData schemas (client args + server handler)
  - **Client options in args**: Per-request `fetch`, `init`, `headers` in args (1st param)
  - **mutationOptions for GET**: Use `useMutation` for one-time fetches (exports/downloads) without caching

  #### Migration

  ```tsx
  // Client: Before
  crpc.http.todos.list.queryOptions({ limit: 10 });
  updateTodo.mutate({ id, completed: true });
  deleteTodo.mutate({ id });

  // Client: After
  crpc.http.todos.list.queryOptions({ searchParams: { limit: "10" } });
  updateTodo.mutate({ params: { id }, completed: true });
  deleteTodo.mutate({ params: { id } });

  // Headers go in args (1st param)
  // Before: queryOptions({ header: { 'X-Custom': 'value' } })
  // After:
  crpc.http.todos.list.queryOptions({ headers: { 'X-Custom': 'value' } });

  // Mutations: client opts in mutate args
  updateTodo.mutate({ params: { id }, completed: true, headers: { 'X-Custom': 'value' } });

  // Server: Before
  .query(async ({ query }) => ({ limit: query.limit }))

  // Server: After
  .query(async ({ searchParams }) => ({ limit: searchParams.limit }))

  // Server: Typed form (new)
  .form(z.object({ file: z.instanceof(Blob) }))
  .mutation(async ({ form }) => {
    // form.file is typed as Blob
  })
  ```

## 0.3.1

### Patch Changes

- [#29](https://github.com/udecode/better-convex/pull/29) [`2638311`](https://github.com/udecode/better-convex/commit/26383112835605dd806151832edfbcd98e1e75b2) Thanks [@zbeyens](https://github.com/zbeyens)! - - Move hono to peerDependencies (type-only imports in package)
  - Add stale cursor auto-recovery for `useInfiniteQuery` - automatically recovers from stale pagination cursors after WebSocket reconnection without losing scroll position

## 0.3.0

### Minor Changes

- [#27](https://github.com/udecode/better-convex/pull/27) [`6309e68`](https://github.com/udecode/better-convex/commit/6309e688b3f92b07877966a6f6f7929f2cb7ade0) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Router: Hono Integration

  The HTTP router now wraps a Hono app, enabling full middleware support.

  #### New Features
  - **Hono-based routing**: `createHttpRouter(app, router)` accepts a Hono app
  - **Auth middleware**: `authMiddleware(createAuth)` for Better Auth routes
  - **Hono context in handlers**: Access `c.json()`, `c.text()`, `c.redirect()`, `c.req`
  - **Non-JSON response support**
  - **CLI watch improvements**: Watches `routers/**/*.ts` and `http.ts` for changes

  #### Breaking Changes
  - **Removed `response()` mode**: Return `Response` directly from handler
  - **Removed per-procedure `cors()`**: Use Hono's `cors()` middleware
  - **CORS via Hono**: `app.use('/api/*', cors())` instead of router options
  - **Handler signature**: `{ ctx, c, input, params, query }` - `c` is Hono Context

  #### Migration

  Before:

  ```ts
  import { registerRoutes } from "better-convex/auth";
  import { registerCRPCRoutes } from "better-convex/server";
  import { httpRouter } from "convex/server";

  const http = httpRouter();

  registerRoutes(http, createAuth);

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: {
      allowedOrigins: [process.env.SITE_URL!],
      allowCredentials: true,
    },
  });

  export default http;
  ```

  After:

  ```ts
  import { authMiddleware } from "better-convex/auth";
  import { createHttpRouter } from "better-convex/server";
  import { Hono } from "hono";
  import { cors } from "hono/cors";

  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: process.env.SITE_URL!,
      credentials: true,
    }),
  );

  app.use(authMiddleware(createAuth));

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  export default createHttpRouter(app, appRouter);
  ```

  #### Handler Examples with `c`

  cRPC handlers now receive `c` (Hono Context) for custom responses:

  ```ts
  // File download with custom headers
  export const download = authRoute
    .get("/api/todos/export/:format")
    .params(z.object({ format: z.enum(["json", "csv"]) }))
    .query(async ({ ctx, params, c }) => {
      const todos = await ctx.runQuery(api.todos.list, {});

      c.header(
        "Content-Disposition",
        `attachment; filename="todos.${params.format}"`,
      );

      if (params.format === "csv") {
        return c.text(todos.map((t) => `${t.id},${t.title}`).join("\n"));
      }
      return c.json({ todos });
    });

  // Webhook with signature verification
  export const webhook = publicRoute
    .post("/webhooks/stripe")
    .mutation(async ({ ctx, c }) => {
      const signature = c.req.header("stripe-signature");
      if (!signature) throw new CRPCError({ code: "BAD_REQUEST" });

      const body = await c.req.text();
      await ctx.runMutation(internal.stripe.process, { body, signature });

      return c.text("OK", 200);
    });

  // Redirect
  export const redirect = publicRoute
    .get("/api/old-path")
    .query(async ({ c }) => c.redirect("/api/new-path", 301));
  ```

## 0.2.1

### Patch Changes

- [#24](https://github.com/udecode/better-convex/pull/24) [`b5555ea`](https://github.com/udecode/better-convex/commit/b5555eac9e67ef06328f5e122ce2d4512f3b3c7f) Thanks [@zbeyens](https://github.com/zbeyens)! - - Fix (`UNAUTHORIZED`) queries failing after switching tabs and returning to the app. The auth token is now preserved during session refetch instead of being cleared.
  - Fix (`UNAUTHORIZED`) `useSuspenseQuery` failing on initial page load when auth is still loading. WebSocket subscriptions now wait for auth to settle before connecting.
  - Fix logout setting `isAuthenticated: false` before unsubscribing to prevent query re-subscriptions.
  - Add missing `dotenv` dependency for CLI.

## 0.2.0

### Minor Changes

- [#22](https://github.com/udecode/better-convex/pull/22) [`27d355e`](https://github.com/udecode/better-convex/commit/27d355e4ac067503e00bf534164c6ce2974a8a46) Thanks [@zbeyens](https://github.com/zbeyens)! - **BREAKING:** Refactored `createCRPCContext` and `createServerCRPCProxy` to use options object:

  Before:

  ```ts
  createCRPCContext(api, meta);
  createServerCRPCProxy(api, meta);
  ```

  After:

  ```ts
  createCRPCContext<Api>({ api, meta, convexSiteUrl });
  createServerCRPCProxy<Api>({ api, meta });
  ```

  **BREAKING:** `getServerQueryClientOptions` now requires `convexSiteUrl`:

  ```ts
  getServerQueryClientOptions({
    getToken: caller.getToken,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });
  ```

  **Feature:** Added type-safe HTTP routes with tRPC-style client:

  ```ts
  // 1. Pass httpAction to initCRPC.create()
  const c = initCRPC.dataModel<DataModel>().create({
    query, mutation, action, httpAction,
  });
  export const publicRoute = c.httpAction;
  export const authRoute = c.httpAction.use(authMiddleware);
  export const router = c.router;

  // 2. Define routes with .get()/.post()/.patch()/.delete()
  export const health = publicRoute
    .get('/api/health')
    .output(z.object({ status: z.string() }))
    .query(async () => ({ status: 'ok' }));

  // 3. Use .params(), .searchParams(), .input() for typed inputs
  export const todosRouter = router({
    list: publicRoute.get('/api/todos')
      .searchParams(z.object({ limit: z.coerce.number().optional() }))
      .query(...),
    get: publicRoute.get('/api/todos/:id')
      .params(z.object({ id: zid('todos') }))
      .query(...),
    create: authRoute.post('/api/todos')
      .input(z.object({ title: z.string() }))
      .mutation(...),
  });

  // 4. Register with CORS
  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: { allowedOrigins: [process.env.SITE_URL!], allowCredentials: true },
  });

  // 5. Add to Api type for inference
  export type Api = WithHttpRouter<typeof api, typeof appRouter>;

  // 6. Client: TanStack Query integration via crpc.http.*
  const crpc = useCRPC();
  useSuspenseQuery(crpc.http.todos.list.queryOptions({ limit: 10 }));
  useMutation(crpc.http.todos.create.mutationOptions());
  queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());

  // 7. RSC: prefetch helper
  prefetch(crpc.http.health.queryOptions({}));
  ```

  **Fix:** Improved authentication in `ConvexAuthProvider`:
  - **FetchAccessTokenContext**: New context passes `fetchAccessToken` through React tree - eliminates race conditions where token wasn't available during render
  - **Token Expiration Tracking**: Added `expiresAt` field with `decodeJwtExp()` - 60s cache leeway prevents unnecessary token refreshes
  - **SSR Hydration Fix**: Defensive `isLoading` check prevents UNAUTHORIZED errors when Better Auth briefly returns null during hydration
  - **Removed HMR persistence**: No more globalThis Symbol storage (`getPersistedToken`/`persistToken`)
  - **Simplified AuthStore**: Removed `guard` method and `AuthEffect` - state synced via `useConvexAuth()` directly

## 0.1.0

### Minor Changes

- [#18](https://github.com/udecode/better-convex/pull/18) [`681e9ba`](https://github.com/udecode/better-convex/commit/681e9bafdeaa62928f15fe9781f944d42ce2d2b4) Thanks [@zbeyens](https://github.com/zbeyens)! - Initial release
