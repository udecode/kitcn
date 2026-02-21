---
"better-convex": minor
---

## Breaking changes

### Auth

- Replace split auth exports (`getAuthOptions` + `authTriggers`) with one default `defineAuth((ctx) => ({ ...options, triggers }))` contract in `convex/functions/auth.ts`.
- Drop manual auth runtime exports from `convex/functions/auth.ts`; import runtime handlers (`getAuth`, CRUD, trigger handlers, `auth`) from `convex/functions/generated.ts`.
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
import { defineAuth } from "./generated";

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
import { getAuth } from "./generated";
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

### Generated Server Contract

- Drop manual `convex/lib/orm.ts` server wiring and import `orm`/`withOrm` from `convex/functions/generated.ts`.
- Drop `OrmQueryCtx`/`OrmMutationCtx` primary usage and import wrapped `QueryCtx`/`MutationCtx` from `convex/functions/generated.ts`.
- Drop generated internal auth calls from `internal.auth.*`; use `internal.generated.*`.

```ts
// Before
import type { OrmQueryCtx, OrmMutationCtx } from "../lib/orm";
import { withOrm } from "../lib/orm";
await ctx.runMutation(internal.auth.beforeCreate, args);

// After
import type { QueryCtx, MutationCtx } from "../functions/generated";
import { withOrm } from "../functions/generated";
await ctx.runMutation(internal.generated.beforeCreate, args);
```

### API Types + cRPC Setup

- Drop separate `meta` arguments in context/proxy/caller/auth setup APIs; pass only `api`.
- Drop the `@convex/types` workflow and use generated `@convex/api` types.
- Drop manual codegen outputs `convex/shared/meta.ts` and `convex/shared/types.ts` in favor of generated `convex/shared/api.ts`.
- In codegen flows, drop manual `initCRPC.dataModel().context(...)` bootstrap and import generated `initCRPC`.
- Require `export const httpRouter = router(...)` in `convex/functions/http.ts` so codegen can include typed HTTP routes in generated API output.

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

```ts
// Before
import { initCRPC } from "better-convex/server";
import type { DataModel } from "../functions/_generated/dataModel";
import { withOrm } from "../functions/generated";

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
import { initCRPC } from "../functions/generated";

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

### Dependency

- Bump Convex minimum peer dependency to `>=1.32`.

## Features

- Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
- Add optional generated table helpers (`TableName`, `Select`, `Insert`) when schema exports `tables`.
- Add generated `convex/functions/generated.ts` with server ORM exports (`orm`, `withOrm`, `scheduledMutationBatch`, `scheduledDelete`) and wrapped ctx exports (`OrmCtx`, `QueryCtx`, `MutationCtx`, `GenericCtx`).
- Add generated `initCRPC` in `convex/functions/generated.ts`:
  - With `relations`: prewired `.dataModel<DataModel>().context({ query, mutation })`.
  - Without `relations`: `.dataModel<DataModel>()` only.
- Add always-generated Better Auth runtime contract in `convex/functions/generated.ts` (`authEnabled`, `getAuth`, `authClient`, CRUD/JWKS handlers, trigger handlers, static `auth`).
- Add generated `defineAuth` export in `convex/functions/generated.ts` for inference-first `auth.ts` authoring.
- Add `defineAuth`, `createAuthRuntime`, and `createDisabledAuthRuntime` helpers to unify codegen and non-codegen auth setup.
- Keep manual `initCRPC` setup from `better-convex/server` supported for apps not using codegen.

## Patches

- Add Date-safe API inference from cRPC exports so `z.date()` fields stay typed as `Date` in generated API input/output types.
- Add generated internal API refs for async ORM workers and generated auth handlers under `internal.generated`.
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
