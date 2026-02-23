---
"better-convex": minor
---

## Auth

### Breaking changes

- Replace split auth exports (`getAuthOptions` + `authTriggers`) with one default `defineAuth((ctx) => ({ ...options, triggers }))` contract in `convex/functions/auth.ts`.
- Drop manual auth runtime exports from `convex/functions/auth.ts`; codegen now generates runtime handlers (`getAuth`, CRUD, trigger handlers, `auth`) in `convex/functions/generated/auth`.
- Drop trigger `ctx` as the first callback parameter and use doc-first signatures (`beforeCreate(data)`, `onCreate(doc)`, `onUpdate(newDoc, oldDoc)`, etc.).
- Rename `createApi` option `skipValidation` to `validateInput`; default is now `validateInput: false`.
- Rename auth package entrypoints from hyphenated to namespaced paths:
  - `better-convex/auth-client` -> `better-convex/auth/client`
  - `better-convex/auth-config` -> `better-convex/auth/config`
  - `better-convex/auth-nextjs` -> `better-convex/auth/nextjs`
- Move HTTP auth helpers to `better-convex/auth/http`:
  - `authMiddleware` and `registerRoutes` now import from `better-convex/auth/http` (not `better-convex/auth`).
  - `better-convex/auth/http` auto-installs the Convex-safe `MessageChannel` polyfill. You can remove your own `http-polyfills.ts` file.

```ts
// Before
export const getAuthOptions = (ctx) => ({ ...options });
export const authTriggers = { user: { onCreate: async (ctx, user) => {} } };

// After
import { defineAuth } from "./generated/auth";

export default defineAuth((ctx) => ({
  ...options,
  triggers: {
    user: {
      onCreate: async (user) => {},
    },
  },
}));
```

```ts
// Before
import { getAuth } from "./auth";
createApi(schema, getAuth, { skipValidation: true });

// After
import { getAuth } from "./generated/auth";
createApi(schema, getAuth); // validateInput defaults to false
createApi(schema, getAuth, { validateInput: true });
```

```ts
// Before
import { convexClient } from "better-convex/auth-client";
import { getAuthConfigProvider } from "better-convex/auth-config";
import { convexBetterAuth } from "better-convex/auth-nextjs";

// After
import { convexClient } from "better-convex/auth/client";
import { getAuthConfigProvider } from "better-convex/auth/config";
import { convexBetterAuth } from "better-convex/auth/nextjs";
```

```ts
// Before
import "../lib/http-polyfills";
import { authMiddleware, registerRoutes } from "better-convex/auth";

// After
import { authMiddleware, registerRoutes } from "better-convex/auth/http";
```

### Features

- Add `defineAuth` helpers to unify codegen and non-codegen auth setup.
- Add always-generated Better Auth runtime contract in `convex/functions/generated/auth.ts`.
- Add generated `defineAuth` export in `convex/functions/generated/auth.ts` for inference-first `auth.ts` authoring.

## Codegen

### Breaking changes

- Drop generated internal auth calls from `internal.auth.*`; use `internal.generated.*`.
- Drop manual `initCRPC.dataModel().context(...)` bootstrap; import generated `initCRPC` from `convex/functions/generated/server`.
- Drop manual `ctx.runQuery`/`ctx.runMutation` for inter-procedure calls; use per-module `create<Module>Handler`/`create<Module>Caller` from `convex/functions/generated/<module>.runtime`.
- Require `export const httpRouter = router(...)` in `convex/functions/http.ts` so codegen can include typed HTTP routes in generated API output.

```ts
// Before
import { initCRPC } from "better-convex/server";
import type { DataModel } from "./_generated/dataModel";

const c = initCRPC
  .dataModel<DataModel>()
  .context({
    query: (ctx) => withOrm(ctx),
    mutation: (ctx) => withOrm(ctx),
  })
  .meta<{
    auth?: "optional" | "required";
    role?: "admin";
    rateLimit?: string;
  }>()
  .create();

// After
import { initCRPC } from "./generated/server";

const c = initCRPC
  .meta<{
    auth?: "optional" | "required";
    role?: "admin";
    rateLimit?: string;
  }>()
  .create();
```

```ts
// Before (http.ts)
export const appRouter = router({
  health,
  todos: todosRouter,
});
export default createHttpRouter(app, appRouter);

// After (http.ts)
export const httpRouter = router({
  health,
  todos: todosRouter,
});
export default createHttpRouter(app, httpRouter);
```

### Features

- Add generated `convex/functions/generated/` directory:
  - `generated/server.ts` — ORM exports (`orm`, `withOrm`, `scheduledMutationBatch`, `scheduledDelete`), wrapped ctx types (`OrmCtx`, `QueryCtx`, `MutationCtx`, `GenericCtx`), prewired `initCRPC`.
  - `generated/auth.ts` — `defineAuth`, `getAuth`, auth runtime contract.
  - `generated/<module>.runtime.ts` — per-module scoped caller/handler factories.
- Add per-module `create<Module>Handler(ctx)` (DEFAULT) for zero-overhead internal composition in queries/mutations. Bypasses input validation, middleware, and output validation. Same transaction, no serialization.
- Add per-module `create<Module>Caller(ctx)` for actions and HTTP routes only. Goes through validation + middleware.
  - Root calls in `ActionCtx` dispatch via `ctx.runQuery` / `ctx.runMutation`.
  - Direct action calls are explicit under `caller.actions.*` and dispatch via `ctx.runAction`.
  - Scheduled calls are available under `caller.schedule.*`:
    - `caller.schedule.now.<mutation|action>(input)` (alias for `after(0)`)
    - `caller.schedule.after(ms).<mutation|action>(input)`
    - `caller.schedule.at(dateOrMs).<mutation|action>(input)`
    - `caller.schedule.cancel(jobId)`
  - Auto-generate procedure registry per module from cRPC exports (public + internal).
  - Enforce call matrix: query ctx → root queries only; mutation ctx → root queries+mutations plus `schedule`; action ctx → root queries+mutations plus `actions` and `schedule`.
  - Reserve module export names `actions` and `schedule` in runtime callers (codegen throws explicit conflict error).
- Never use `ctx.runQuery`/`ctx.runMutation` directly — always use `create<Module>Handler` or `create<Module>Caller`.
- Keep manual `initCRPC` setup from `better-convex/server` supported for apps not using codegen.
- Add `better-convex.json` support (plus `--config <path>`) for codegen/dev defaults, feature toggles (`api`, `auth`), and passthrough Convex arg presets.

```ts
// Before — manual runQuery/runMutation with function references
import { api, internal } from "./_generated/api";

const result = await ctx.runQuery(api.todos.list, { limit: 10 });
await ctx.runMutation(internal.todoInternal.create, { userId, ...input });

// After (query/mutation) — per-module handler, zero overhead, same transaction
import { createSeedHandler } from "./generated/seed.runtime";

const handler = createSeedHandler(ctx);
await handler.cleanupSeedData();
await handler.seedUsers();
```

```ts
// After (action/HTTP) — per-module caller, validation + middleware
import { createSeedCaller } from "./generated/seed.runtime";

const caller = createSeedCaller(ctx);
await caller.generateSamplesBatch({ count: 5, userId, batchIndex: 0 });
```

### Patches

- Add generated internal API refs for async ORM workers and generated auth handlers under `internal.generated`.

## API Types

### Breaking changes

- Drop separate `meta` arguments in context/proxy/caller/auth setup APIs; pass only `api`.
- Drop the `@convex/types` workflow and use generated `@convex/api` types.
- Drop manual codegen outputs `convex/shared/meta.ts` and `convex/shared/types.ts` in favor of generated `convex/shared/api.ts`.

```ts
// Before
import type { Api, ApiInputs, ApiOutputs } from "@convex/types";
createCRPCContext({ api, meta, convexSiteUrl });
createServerCRPCProxy({ api, meta });

// After
import type { Api, ApiInputs, ApiOutputs } from "@convex/api";
createCRPCContext({ api, convexSiteUrl });
createServerCRPCProxy({ api });
```

```ts
// Before
import type { Select, Insert } from "./shared/types";

// After
import type { Select, Insert } from "@convex/api";
```

### Features

- Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
- Add optional generated table helpers (`TableName`, `Select`, `Insert`) when schema exports `tables`.

### Patches

- Add Date-safe API inference from cRPC exports so `z.date()` fields stay typed as `Date` in generated API input/output types.
- Improve generated `Api` typing so HTTP router types are embedded in `typeof api`, reducing manual `<Api>` generics in common setup calls.
- Build function metadata from the generated `api` object at runtime, eliminating separate `meta` plumbing in cRPC React/RSC/server helpers.
- Filter internal/private namespaces from generated client/caller type surfaces (e.g. `_http`, `_generated`-style keys).
- Improve lazy caller invalid-path errors with clearer failure messages.

```ts
// Before
import type { Api } from "@convex/api";

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext<Api>({
  api,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
});

export const crpc = createServerCRPCProxy<Api>({ api });

// After
export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
});

export const crpc = createServerCRPCProxy({ api });
```

## Dependency

### Breaking changes

- Bump Convex minimum peer dependency to `>=1.32`.

## ORM

### Breaking changes

- Drop manual `convex/lib/orm.ts` server wiring; import `orm`/`withOrm` from `convex/functions/generated/server`.
- Drop `OrmQueryCtx`/`OrmMutationCtx`; import wrapped `QueryCtx`/`MutationCtx` from `convex/functions/generated/server`.
- Table-level lifecycle registration in `convexTable(..., extraConfig)` is removed.
- Lifecycle helpers `onInsert`, `onUpdate`, `onDelete`, and `onChange` are removed from `better-convex/orm`.

```ts
// Before
import type { OrmQueryCtx, OrmMutationCtx } from "../lib/orm";
import { withOrm } from "../lib/orm";

// After
import type { QueryCtx, MutationCtx } from "./generated/server";
import { withOrm } from "./generated/server";
```

### Features

- ORM triggers are schema-level only and must be exported as `export const triggers = defineTriggers(relations, { ... })`.
- Trigger definitions use object hooks per table:
  - `create.before` / `create.after`
  - `update.before` / `update.after`
  - `delete.before` / `delete.after`
  - `change(change, ctx)`
- `before` return contract is:
  - `void` => continue unchanged
  - `{ data }` => shallow merge into write payload
  - `false` => cancel write via `TriggerCancelledError`
- Generated server wiring includes `triggers` only when `schema.ts` exports both `relations` and `triggers`.
- Add `createOrm({ schema, triggers })` support for generated and manual setups.

## Aggregates

### Features

- Add `better-convex/aggregate` entrypoint.
- Add `createAggregate`, support both trigger invocation forms:
  - `aggregate.trigger()`
  - `aggregate.trigger(change, ctx)`
- Add optional peer dependency `@convex-dev/aggregate >=0.2.0`.
