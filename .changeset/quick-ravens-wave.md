---
"better-convex": minor
---

## Breaking changes

- Drop separate `meta` arguments and pass only `api` to cRPC context/proxy/auth/caller setup APIs.
- Drop the `@convex/types` workflow and use `@convex/api` for generated API types.
- Drop manual `convex/lib/orm.ts` imports in server code and use generated `convex/functions/generated.ts`.
- Drop manual cRPC bootstrap wiring in codegen-based apps and use generated `initCRPC` from `convex/functions/generated.ts`.
- Drop `OrmQueryCtx`/`OrmMutationCtx` as primary server ctx imports in example server modules and use `QueryCtx`/`MutationCtx`.

```ts
// Before
import type { Api, ApiInputs, ApiOutputs } from "@convex/types";

// After
import type { Api, ApiInputs, ApiOutputs } from "@convex/api";
```

```ts
// Before
createCRPCContext({ api, meta, convexSiteUrl });
createServerCRPCProxy({ api, meta });

// After
createCRPCContext({ api, convexSiteUrl });
createServerCRPCProxy({ api });
```

```ts
// Before
export const appRouter = router({ health, todos });
export default createHttpRouter(app, appRouter);

// After
export const httpRouter = router({ health, todos });
export default createHttpRouter(app, httpRouter);
```

```ts
// Before
import type { Select, Insert } from "./shared/types";

// After
import type { Select, Insert } from "@convex/api";
```

```ts
// Before
import type { OrmQueryCtx, OrmMutationCtx } from "../lib/orm";
import { withOrm } from "../lib/orm";

// After
import type { QueryCtx, MutationCtx } from "../functions/generated";
import { withOrm } from "../functions/generated";
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
  .meta<{ auth?: "optional" | "required"; role?: "admin"; rateLimit?: string }>()
  .create();

// After
import { initCRPC } from "../functions/generated";

const c = initCRPC
  .meta<{ auth?: "optional" | "required"; role?: "admin"; rateLimit?: string }>()
  .create();
```

## Features

- Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
- Add optional generated table helpers (`TableName`, `Select`, `Insert`) when your schema exports `tables`.
- Add generated `convex/functions/generated.ts` in example with server ORM runtime exports: `orm`, `withOrm`, `scheduledMutationBatch`, `scheduledDelete`.
- Add generated server ctx exports in example `generated.ts`: `QueryCtx`, `MutationCtx`, `GenericCtx`, `OrmCtx`.
- Add generated `initCRPC` in `convex/functions/generated.ts`:
  - With `relations`: prewired `.dataModel<DataModel>().context({ query, mutation })`.
  - Without `relations`: `.dataModel<DataModel>()` only.
- Keep manual `initCRPC` setup from `better-convex/server` fully supported for apps not using codegen.

## Patches

- Add Date-safe API inference from cRPC exports so `z.date()` fields remain typed as `Date`.
- Add generated internal API refs for async ORM workers under `internal.generated`.
- Improve generated `Api` typing so HTTP router types are embedded in `typeof api`, removing the need for manual `<Api>` generics in common setup calls.

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
