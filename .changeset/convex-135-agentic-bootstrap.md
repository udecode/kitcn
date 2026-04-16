---
"kitcn": minor
---

## Breaking changes

- Require explicit `basePath` when `registerRoutes` is used with non-default auth routes.

```ts
// Before
import { registerRoutes } from "kitcn/auth/http";

// auth config uses basePath: "/custom-auth"
registerRoutes(http, getAuth, {
  cors: {
    allowedOrigins: [process.env.SITE_URL!],
  },
});

// After
import { registerRoutes } from "kitcn/auth/http";

registerRoutes(http, getAuth, {
  basePath: "/custom-auth",
  cors: {
    allowedOrigins: [process.env.SITE_URL!],
  },
});
```

- Require `better-auth@1.6.5`.

```bash
# Before
bun add better-auth@1.5.3

# After
bun add better-auth@1.6.5
```

- Drop `createAuthClient` from `kitcn/auth/client`. Import it from `better-auth/react`.

```ts
// Before
import { convexClient, createAuthClient } from "kitcn/auth/client";

// After
import { createAuthClient } from "better-auth/react";
import { convexClient } from "kitcn/auth/client";
```

## Patches

- Let Convex handle anonymous non-interactive local setup without forcing `CONVEX_AGENT_MODE`.
- Warn when an app pins an older Convex dependency family than kitcn expects.
- Support Convex `dev --start` as a pre-run conflict flag.
- Improve auth route registration so default Convex auth routes avoid eager Better Auth initialization during startup.
- Preserve forwarded host and protocol headers through Next.js, TanStack Start, and Convex auth route proxies.
- Fix Better Auth adapter index matching and static filtering for composite and case-insensitive queries.
- Replace the `@convex-dev/better-auth` runtime dependency with internal kitcn auth helpers.
- Support the Better Auth 1.6 client surface without requiring casts in app auth clients.
