---
name: convex
description: ALWAYS use this skill when working with convex or better-convex. Covers the common end-to-end feature path using cRPC + ORM + auth + React, with setup/bootstrap and niche depth in references.
# biome-ignore format: keep sources compact so intent's 500-line validator passes
sources: [www/content/docs/concepts.mdx, www/content/docs/orm/index.mdx, www/content/docs/orm/schema/relations.mdx, www/content/docs/orm/schema/triggers.mdx, www/content/docs/orm/queries/aggregates.mdx, www/content/docs/orm/queries/pagination.mdx, www/content/docs/server/error-handling.mdx, www/content/docs/server/http.mdx, www/content/docs/server/middlewares.mdx, www/content/docs/server/procedures.mdx, www/content/docs/server/server-side-calls.mdx, www/content/docs/react/queries.mdx, www/content/docs/react/mutations.mdx, www/content/docs/react/infinite-queries.mdx, www/content/docs/auth/client.mdx, www/content/docs/auth/server.mdx]
# biome-ignore format: mirror blog/spec shape without burning 30 lines
metadata: { sources: [www/content/docs/concepts.mdx, www/content/docs/orm/index.mdx, www/content/docs/orm/schema/relations.mdx, www/content/docs/orm/schema/triggers.mdx, www/content/docs/orm/queries/aggregates.mdx, www/content/docs/orm/queries/pagination.mdx, www/content/docs/server/error-handling.mdx, www/content/docs/server/http.mdx, www/content/docs/server/middlewares.mdx, www/content/docs/server/procedures.mdx, www/content/docs/server/server-side-calls.mdx, www/content/docs/react/queries.mdx, www/content/docs/react/mutations.mdx, www/content/docs/react/infinite-queries.mdx, www/content/docs/auth/client.mdx, www/content/docs/auth/server.mdx] }
---
# Better Convex Core Skill (80% Path)
Use this file first for everyday feature delivery in an already configured better-convex app.
- If setup/bootstrap/env/auth wiring or project structure mirroring is missing, use `references/setup/index.md` (then the relevant setup file).
- If the task is advanced or niche, load only the specific feature reference listed at the end.
## Scope
In scope:
- Add or update schema tables, indexes, relations, and triggers.
- Implement cRPC procedures (`query`, `mutation`, `action`, `httpAction`) with runtime auth + rate limits.
- Implement feature UI with `useCRPC()` + TanStack Query.
- Add minimal high-value tests for auth, errors, and side effects.
Out of scope:
- Greenfield setup/install/env/bootstrap.
- Full plugin deep-dives (admin/organizations/polar).
- Internal package-level parity testing.
## Skill Contract
1. Favor `ctx.orm` for app data access.
2. Keep list/read paths bounded and index-aware.
3. Use cRPC builders and middleware; avoid raw handler objects for new feature code.
4. Use `CRPCError` for expected failures.
5. Prefer schema triggers for cross-row invariants, but move invariant maintenance to explicit mutation helpers if trigger execution is unstable (for example init/seed hangs or recursive write paths).
6. Keep auth/rate-limit checks server-side.
7. **Inter-procedure calls**: `create<Module>Handler(ctx)` in queries/mutations (zero overhead) unless validation is relevant, `create<Module>Caller(ctx)` in actions/HTTP routes. In action context use `caller.actions.*` for action procedures and `caller.schedule.*` for scheduling. Import from `./generated/<module>.runtime`. Never call `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` directly for module procedures.
## Shortcut Mode (tRPC + Drizzle Mental Model)
Default assumption:
- cRPC behavior is tRPC-like (builder chain + middleware + TanStack options).
- ORM behavior is Drizzle-like (schema, relations, `findMany/findFirst`, `insert/update/delete`).
Only remember these non-parity deltas:
1. Procedure input root must be `z.object(...)` (no primitive root args).
2. No `z.void()` outputs; omit `.output(...)` for no-value mutations.
3. Stacked `.input(...)` calls merge input shapes.
4. `.paginated({ limit, item })` must be before `.query()` and auto-adds `input.cursor` + `input.limit`, output `{ page, continueCursor, isDone }`.
5. Metadata is codegen’d onto `@convex/api` leaves (`api.namespace.fn.meta`) so never put secrets in `.meta(...)`; chaining `.meta(...)` is shallow merge and supports `defaultMeta`.
6. Auth metadata drives client behavior: `auth: "optional"` waits for auth load then runs, `auth: "required"` waits then skips when logged out.
7. `ctx.orm` enforces constraints + RLS; `ctx.db` bypasses them.
8. Non-paginated `findMany()` must be explicitly sized (`limit`, cursor mode, schema `defaultLimit`, or explicit `allowFullScan`).
9. Predicate `where` requires explicit `.withIndex(...)`; no implicit full scan fallback.
10. Cursor pagination uses the first `orderBy` field; index that field for stable paging.
11. `maxScan` applies to cursor mode only; `allowFullScan` is for non-cursor full-scan opt-in.
12. String operators / `columns` projection / many-relation subfilters can run post-fetch; bound result size early.
13. Search mode is relevance-ordered and does not support `orderBy`; vector mode has stricter limits (no cursor/offset/top-level where/order).
14. Update/delete without `where` throws unless `allowFullScan()`.
15. `count()`, `aggregate()`, and `groupBy()` require a matching `aggregateIndex`. Use `groupBy({ by, _count, _sum })` instead of multiple `.count()` calls or `findMany` + manual JS grouping. Every `by` field must be finite-constrained (`eq`/`in`/`isNull`) in `where`. See `references/features/aggregates.md`.
16. cRPC React queries are real-time by default (`subscribe: true`); never use `queryClient.invalidateQueries` for these subscribed paths.
17. In RSC, `prefetch` hydrates client, `caller` is server-only and not hydrated, `preloadQuery` hydrates but can cause stale split ownership if also rendered client-side.
18. Better Auth Next.js shortcut is `convexBetterAuth(...)`; generic server-only shortcut is `createCallerFactory(...)`.
19. Use `createAuthMutations(authClient)` wrappers so logout unsubscribes auth queries before sign out.
20. **NEVER** use `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` directly for module-to-module calls. Use `create<Module>Handler(ctx)` or `create<Module>Caller(ctx)` from `convex/functions/generated/<module>.runtime` instead.
21. **`create<Module>Handler(ctx)`** — default choice for queries/mutations. Bypasses input validation, middleware, output validation → zero overhead. Query/mutation ctx only. Import from `./generated/<module>.runtime`.
22. **`create<Module>Caller(ctx)`** — use in actions and HTTP routes (where handler is unavailable). Goes through validation + middleware. Root caller exposes query+mutation procedures. In `ActionCtx`, action procedures are under `caller.actions.*`; scheduling is under `caller.schedule.now|after|at` with `caller.schedule.cancel(id)`. Import from `./generated/<module>.runtime`. Each caller/handler eagerly loads every procedure in its module (no lazy loading) — split large modules to keep bundles lean.
23. API types (`Api`, `ApiInputs`, `ApiOutputs`, `Select`, `Insert`, `TableName`) import from `@convex/api` — no manual `inferApiInputs<typeof api>`.
24. HTTP router must export as `httpRouter` (not `appRouter`) for codegen.
25. Server wiring imports come from `convex/functions/generated/` directory: `getAuth`, `defineAuth` from `generated/auth`; `initCRPC`, `QueryCtx`, `MutationCtx`, `OrmCtx` from `generated/server`; `create<Module>Caller`, `create<Module>Handler` from `generated/<module>.runtime`. No manual `convex/lib/orm.ts`.
26. `defineAuth((ctx) => ({ ...options, triggers }))` replaces split `getAuthOptions` + `authTriggers`. Trigger callbacks are doc-first: `beforeCreate(data)`, `onCreate(doc)`, `onUpdate(newDoc, oldDoc)` — no `ctx` first param.
27. Internal auth functions at `internal.generated.*` (not `internal.auth.*`).
28. Async mutation batching is the default (codegen wires it). Customize per call: `execute({ batchSize, delayMs })`. Opt into sync: `execute({ mode: 'sync' })` or `defineSchema(..., { defaults: { mutationExecutionMode: 'sync' } })`. Relevant defaults: `mutationBatchSize`, `mutationLeafBatchSize`, `mutationMaxRows`, `mutationScheduleCallCap`.
29. Polymorphic unions are schema-first: use `actionType: discriminator({ variants, as? })` in `convexTable(...)`. Query config does not include a `polymorphic` option. Writes stay flat; reads synthesize nested `details` (or custom alias). Use `withVariants: true` to auto-load all `one()` relations on discriminator tables.
30. Do not add manual ORM mutation batching loops in app/plugin code by default. Convex runtime batching already handles mutation execution. Prefer set-based deletes/updates over per-row loops. Only add explicit chunking when batching external side effects (for example Resend API calls) or bounded cleanup sweeps.
## Directory Boundary (Important)
This skill is directory-scoped. Do not depend on reading files outside `packages/better-convex/skills/convex/**`.
Use `references/setup/` when the task needs:
1. Project/file structure setup → `setup/index.md` + `setup/server.md`
2. Auth bootstrap → `setup/auth.md`
3. Client/provider wiring → `setup/react.md`
4. Framework-specific setup → `setup/next.md` or `setup/start.md`
For full template-level recreation: start with `setup/index.md`, then load relevant setup files, then load selected feature refs.
## First-Pass Feature Intake (Do This Before Edits)
Lock these decisions first:
1. Auth level per endpoint: `public` / `optionalAuth` / `auth` / `private`.
2. Data invariants: what must always be true after writes?
3. Query shape: list, detail, relation-loaded, search, or stream composition.
4. Pagination mode: offset, cursor, infinite.
5. Side effects: trigger vs scheduled function vs inline mutation.
6. UI consumption: client hook only, RSC prefetch, or server-only caller.
7. Risk paths: unauthorized, forbidden, not found, conflicts, rate limit.
## Canonical File Targets
Typical feature touches:
- `convex/functions/schema.ts`
- `convex/functions/<feature>.ts`
- `convex/lib/crpc.ts` (only if middleware/procedure builder changes)
- `src/lib/convex/crpc.tsx` (only if cRPC context/meta wiring changes)
- `src/**` feature UI files
- `convex/functions/http.ts` or `convex/routers/**` for HTTP endpoints
- `convex/functions/crons.ts` or scheduled handlers if needed
## E2E Build Order (Default)
1. Schema + indexes + relations.
2. Trigger hooks for cross-row invariants (or explicit mutation-side sync if trigger path is unstable).
3. Procedures with strict input/output + auth + rate limits.
4. React hooks (query/mutation/infinite) using cRPC options.
5. Optional: HTTP route(s), scheduling hooks.
6. Tests for auth/error/trigger behavior.

## Core Patterns

### 1) Schema + Relations + Trigger

```ts
import {
  convexTable,
  defineSchema,
  id,
  integer,
  index,
  text,
  timestamp,
} from "better-convex/orm";

export const project = convexTable(
  "project",
  {
    name: text().notNull(),
    ownerId: id("user").notNull(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("ownerId_updatedAt").on(t.ownerId, t.updatedAt)]
);

export const task = convexTable(
  "task",
  {
    projectId: id("project").notNull(),
    title: text().notNull(),
    status: text().notNull().default("open"),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("projectId_updatedAt").on(t.projectId, t.updatedAt)]
);

export default defineSchema({ project, task })
  .relations((r) => ({
    project: {
      tasks: r.many.task(),
    },
    task: {
      project: r.one.project({ from: r.task.projectId, to: r.project.id }),
    },
  }))
  .triggers({
    task: {
      change: async (change, ctx) => {
        const projectId = change.newDoc?.projectId ?? change.oldDoc?.projectId;
        if (!projectId) return;
        const open = await ctx.orm.query.task.findMany({
          where: { projectId, status: "open" },
          columns: { id: true },
          limit: 500,
        });
        await ctx.orm.update(project).set({ openTaskCount: open.length });
      },
    },
  });
```

Schema rules that matter:

1. Index fields that power filters/order/search.
2. `many()` relation paths need child FK indexes.
3. Trigger logic must be bounded and non-recursive.
4. Use table defaults for consistent write behavior.
5. Keep full ORM/query edge cases in `references/features/orm.md`.

### 2) Procedure Builders + Middleware

```ts
import { getHeaders } from "better-convex/auth";
import { CRPCError } from "better-convex/server";
import { getAuth } from "../functions/generated/auth";
import { initCRPC } from "../functions/generated/server";

const c = initCRPC
  .meta<{
    auth?: "optional" | "required";
    role?: "admin";
    ratelimit?: string;
  }>()
  .create();

function requireAuth<T>(user: T | null): T {
  if (!user) {
    throw new CRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return user;
}
export const publicQuery = c.query.meta({ auth: "optional" });
export const authQuery = c.query
  .meta({ auth: "required" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    const user = requireAuth(session?.user ?? null);
    return next({ ctx: { ...ctx, user, userId: user.id } });
  });
export const authMutation = c.mutation
  .meta({ auth: "optional" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    return next({
      ctx: {
        ...ctx,
        user: session?.user ?? null,
        userId: session?.user?.id ?? null,
      },
    });
  });
```

Builder rules that matter:

1. Build `public`, `optional`, `auth`, and `private` procedure families once in `convex/lib/crpc.ts`.
2. `.meta(...)` is client-visible via generated API metadata. Never put secrets there.
3. Resolve session/user once in middleware. Do not re-fetch auth state in every procedure.
4. Keep deeper auth/runtime edge cases in `references/setup/server.md` and `references/features/auth*.md`.

### 3) Query + Mutation Procedure Template

```ts
import { z } from "zod";
import { eq } from "better-convex/orm";
import { CRPCError } from "better-convex/server";
import { authMutation, authQuery } from "../lib/crpc";
import { project } from "./schema";

export const listProjects = authQuery
  .paginated({ limit: z.number().min(1).max(50).default(20), item: project })
  .query(async ({ ctx, input }) =>
    ctx.orm.query.project.findMany({
      where: { ownerId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      cursor: input.cursor,
      limit: input.limit,
    })
  );

export const renameProject = authMutation
  .input(z.object({ id: z.string(), name: z.string().min(1).max(120) }))
  .mutation(async ({ ctx, input }) => {
    const current = await ctx.orm.query.project.findFirst({
      where: { id: input.id, ownerId: ctx.userId },
      columns: { id: true },
    });
    if (!current) {
      throw new CRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }
    await ctx.orm
      .update(project)
      .set({ name: input.name })
      .where(eq(project.id, current.id));
    return null;
  });
```

Procedure rules that matter:

1. Root input must be `z.object(...)`.
2. Use strict `.input(...)`; add `.output(...)` only when needed.
3. Omit `.output(...)` for no-value mutations.
4. Use the default mutation rate limit; add `.meta({ ratelimit: ... })` only for named bucket overrides.
5. Throw `CRPCError` for expected outcomes.
6. Bound every list with `limit`, cursor, or `.paginated(...)`.
7. Move advanced query-builder shapes to `references/features/orm.md`.

### 3b) Inter-Procedure Composition

Use:

1. `create<Module>Handler(ctx)` in queries/mutations.
2. `create<Module>Caller(ctx)` in actions/HTTP routes.
3. `caller.actions.*` for action procedures.
4. `caller.schedule.*` for scheduled procedures.
5. Never `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` for module procedures.

### 4) Query Modes (Use The Right One)

1. Default to object `where`.
2. Use callback `where` only when composition reads better than object form.
3. Predicate/filter callbacks require `.withIndex(...)` first plus explicit `limit`/`maxScan`.
4. Full-text search uses `search: { index, query, filters }` and does not support `orderBy`.
5. Cursor paging is only stable when the `orderBy` field is indexed.
6. Advanced modes (`pageByKey`, vector search, pipelines, aggregate indexes) live in `references/features/orm.md`.

### 5) Mutation Patterns (Most Used)

1. Use `.returning(...)` on inserts when caller needs created ids.
2. Every update/delete path gets an explicit `where(...)`.
3. Clear optional columns with `unsetToken`.
4. Async mutation execution is the default; use `.execute({ mode: "sync" })` only when atomic all-at-once behavior is required.
5. Prefer set-based deletes/updates. Add chunking only for external side effects or bounded cleanups.
6. Upsert, conflict handling, mutation batching, and schema extension edge cases live in `references/features/orm.md`.

### 6) Error Model

Use this map consistently:

1. `BAD_REQUEST`: invalid input or business precondition.
2. `UNAUTHORIZED`: no session.
3. `FORBIDDEN`: session exists, permission missing.
4. `NOT_FOUND`: missing or inaccessible resource.
5. `CONFLICT`: duplicate or conflicting write.
6. `TOO_MANY_REQUESTS`: rate limit.
7. `INTERNAL_SERVER_ERROR`: unexpected failures only.

Required tests:

1. unauthenticated rejection
2. permission rejection when relevant
3. missing resource path
4. conflict path when relevant
5. rate-limited write path when relevant

### 7) React Query Integration

Preconditions (must be true before writing/using `useCRPC()` code paths):

1. Generated imports exist (`@convex/api`) from setup bootstrap.
2. Provider chain is mounted (`CRPCProvider` inside QueryClient + Convex provider flow).
3. If bootstrap/provider prerequisites are missing, stop feature work and finish `references/setup/` first.
4. Backend state is project-local in `.convex/`, not `~/.convex`.

`useCRPC()` pattern: `const crpc = useCRPC(); const projects = useQuery(crpc.project.listProjects.queryOptions({ cursor: null, limit: 20 })); const createProject = useMutation(crpc.project.createProject.mutationOptions());`

Key client defaults/deltas:

1. Queries are real-time by default (`subscribe: true`).
2. Never use `queryClient.invalidateQueries` for subscribed cRPC query paths.
3. Use `{ subscribe: false }` only for one-time fetches; refresh those with explicit `refetch`/`fetchQuery`.
4. Use `skipUnauth: true` to avoid unauthorized fetch churn.
5. For pagination, use `useInfiniteQuery` from `better-convex/react`.
6. Prefer typed `queryKey(...)` helpers for cache read/write/fetch ops instead of manual keys.
7. For auth flows, prefer `createAuthMutations(...)` wrappers (not raw auth client calls) to avoid logout race errors.
8. Full client/RSC depth lives in `references/features/react.md`.

### 8) RSC Patterns (Next.js)

Choose one per use case:

1. `prefetch(...)` (preferred): non-blocking, hydrated, client owns data.
2. `caller.*`: blocking server-only logic (redirects/auth checks), not hydrated.
3. `preloadQuery(...)`: blocking + hydrated when server needs data immediately.

Do not render `preloadQuery` result on server and again on client for the same data path.

1. `HydrateClient` must wrap all client components that consume prefetched queries.
2. Next.js-specific setup and deeper hydration tradeoffs live in `references/setup/next.md` and `references/features/react.md`.

### 9) HTTP Route Pattern (When Feature Needs REST/Webhooks)

```ts
import { createTaskCaller } from "../functions/generated/task.runtime";

export const createTaskRoute = authRoute
  .post("/api/projects/:projectId/tasks")
  .params(z.object({ projectId: z.string() }))
  .input(z.object({ title: z.string().min(1) }))
  .output(z.object({ id: z.string() }))
  .mutation(async ({ ctx, params, input }) => {
    const caller = createTaskCaller(ctx);
    const id = await caller.createFromHttp({
      projectId: params.projectId,
      title: input.title,
      userId: ctx.userId,
    });
    return { id };
  });
```

HTTP-specific rules:

1. Use `z.coerce.*` for search params.
2. Keep auth and permission checks in middleware/procedure.
3. Apply rate limits to public/heavy endpoints.
4. Validate webhook signatures before any side effects.
5. Use `publicRoute` / `authRoute` / `optionalAuthRoute` builders from `convex/lib/crpc.ts`.
6. Compose endpoints with `router(...)` for feature-level HTTP grouping.
7. Client calls must pass path/query args as `{ params, searchParams }`; query values are strings.
8. Webhooks, streaming, and Hono-specific patterns live in `references/features/http.md`.

### 10) Scheduling Pattern (If Needed)

Example: `const caller = createTaskCaller(ctx); await caller.schedule.now.sendTaskCreated({ taskId: created.id, userId: ctx.userId }); await caller.schedule.at(input.sendAt).sendReminder({ taskId: input.taskId, userId: ctx.userId });`

Scheduling rules:

1. Auth context is not propagated; pass user/org IDs explicitly.
2. Mutation scheduling is atomic with the mutation transaction.
3. Store returned job IDs when cancellation is required.
4. Scheduling inside actions is not atomic with action failure.
5. Cron schedules run in UTC.
6. Use `ctx.scheduler.*` directly only when you must schedule non-procedure `internal.*` functions.
7. Cron expressions and operational details live in `references/features/scheduling.md`.

### 11) Testing Baseline (High Signal)

Minimum feature test set:

1. happy path query/mutation
2. unauthenticated rejection (`UNAUTHORIZED`)
3. permission/ownership rejection (`FORBIDDEN` where relevant)
4. missing resource (`NOT_FOUND`)
5. trigger side effect assertion
6. scheduler assertion if feature schedules work
7. not-found checks should use real IDs or non-ID lookup keys (slug/name/email), not synthetic IDs
8. Full testing recipes live in `references/features/testing.md`.
9. If Convex bootstrap blocks integration tests, extract pure guards/helpers and keep one smoke integration test once bootstrap works.

## Performance + Safety Checklist

Before calling a feature done:

1. Every list query is bounded (`limit`/cursor).
2. Filters/order align with indexes.
3. Expensive post-fetch logic uses pre-narrowed index path.
4. Mutations use targeted `where` and avoid accidental full scans.
5. Trigger logic is bounded, idempotent, and avoids ping-pong loops.
6. Error codes are explicit and intentional.
7. User-facing writes have rate-limit metadata.
8. Tests cover auth + not-found + side effects.
9. `ctx.db` is not used on paths that rely on ORM constraints/RLS.
10. Paginated endpoints use `.paginated(...)` + ORM cursor flow (not ad-hoc wrappers).
11. For any predicate/full-scan-like path, `.withIndex(...)` + bound (`limit`/`maxScan`) is explicit.
12. NEVER use `@ts-nocheck`, no global lint-rule downgrades, no unresolved lint warnings in touched files.

## Common Mistakes (And Fixes)

| Mistake                                                         | Correct pattern                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw Convex handler for new feature procedures                   | cRPC builders (`publicQuery`, `authMutation`, etc.)                                                                                                                                  |
| Write-time side effects duplicated across mutations             | Schema trigger, or one centralized mutation-side sync helper when trigger path is unsafe                                                                                             |
| Missing bounds on list/search                                   | Add `limit` + cursor/pagination                                                                                                                                                      |
| `orderBy` written as array objects                              | Use object form: `orderBy: { updatedAt: "desc" }`                                                                                                                                    |
| Using `ctx.db` for policy-sensitive reads                       | Use `ctx.orm` (RLS/constraints path)                                                                                                                                                 |
| Throwing generic `Error` for expected outcomes                  | Throw `CRPCError` with explicit code                                                                                                                                                 |
| Infinite list with TanStack native hook directly                | Use `useInfiniteQuery` from `better-convex/react`                                                                                                                                    |
| Primitive root input (`z.string()`)                             | Use root `z.object(...)` input schema                                                                                                                                                |
| Returning nothing with `z.void()`                               | Omit explicit output                                                                                                                                                                 |
| Manual pagination wrappers for infinite endpoints               | Use `.paginated({ limit, item })`                                                                                                                                                    |
| Synthetic Convex IDs in tests (`"missing-id"`)                  | Use inserted IDs or semantic lookup keys                                                                                                                                             |
| Aggregates disabled but helper/config still present             | Remove aggregate helper + `defineTriggers` handlers + app config together                                                                                                            |
| Putting secrets in `.meta(...)`                                 | Keep metadata non-sensitive (client-visible)                                                                                                                                         |
| Using `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` directly | Use `create<Module>Handler(ctx)` in queries/mutations, `create<Module>Caller(ctx)` in actions/HTTP with `caller.actions.*` / `caller.schedule.*` (from `generated/<module>.runtime`) |
| Using `createCaller` in query/mutation context                  | Use `create<Module>Handler(ctx)` — zero overhead, bypasses redundant validation                                                                                                      |
| Adding `// @ts-nocheck` to unblock compile                      | NEVER do this; fix the underlying types using canonical patterns in `references/setup/`                                                                                              |
| Relaxing lint rules to pass checks                              | Keep baseline lint config; fix code-level warnings/errors instead                                                                                                                    |

## Reference Escalation Map (Load Only If Needed)

**Setup (once per project):**

- `references/setup/index.md`: bootstrap, env, decision intake, gates, checklist, troubleshooting
- `references/setup/server.md`: core backend (schema, ORM, cRPC) + optional module gates
- `references/setup/auth.md`: auth core bootstrap + plugin setup
- `references/setup/react.md`: client core (QueryClient, provider, cRPC context)
- `references/setup/next.md`: Next.js App Router setup
- `references/setup/start.md`: TanStack Start setup
- `references/setup/doc-guidelines.md`: skill/docs sync contract

**Features (per session, self-contained):**

- `references/features/orm.md`: full ORM API, constraints, RLS, advanced mutations, filtering/search/composition/pagination
- `references/features/react.md`: full client, RSC, hydration, error handling matrix
- `references/features/http.md`: typed REST routes, webhooks, streaming
- `references/features/scheduling.md`: cron + delayed job patterns
- `references/features/testing.md`: deeper testing scenarios
- `references/features/aggregates.md`: aggregate component patterns
- `references/features/migrations.md`: built-in online data migrations (defineMigration, CLI, deploy, drift). Load when: task involves data backfills, optional→required field hardening, field renames/removals, type narrowing, or `better-convex migrate` CLI commands. Skip for backward-compatible changes (new optional fields, new tables, code-level defaults).
- `references/features/create-plugins.md`: canonical plugin authoring patterns (split package entries, token config, scaffold/lockfile/CLI manifest rules). Load when: creating or refactoring plugins.
- `references/features/auth.md`: full Better Auth core flow
- `references/features/auth-admin.md`: admin plugin details
- `references/features/auth-organizations.md`: org/multi-tenant plugin details
