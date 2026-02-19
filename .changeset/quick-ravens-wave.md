---
"better-convex": minor
---

## Breaking changes

- Drop separate `meta` arguments and pass only `api` to cRPC context/proxy/auth/caller setup APIs.
- Drop the `@convex/types` workflow and use `@convex/api` for generated API types.

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

## Features

- Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
- Add Date-safe API inference from cRPC exports so `z.date()` fields remain typed as `Date`.
- Add optional generated table helpers (`TableName`, `Select`, `Insert`) when your schema exports `tables`.

## Patches

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
