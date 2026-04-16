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

## Patches

- Let Convex handle anonymous non-interactive local setup without forcing `CONVEX_AGENT_MODE`.
- Warn when an app pins an older Convex dependency family than kitcn expects.
- Support Convex `dev --start` as a pre-run conflict flag.
- Improve auth route registration so default Convex auth routes avoid eager Better Auth initialization during startup.
- Fix Better Auth adapter index matching and static filtering for composite and case-insensitive queries.
- Support `@convex-dev/better-auth@0.11.4`.
- Support the Better Auth 1.6 client surface in generated auth clients and providers.
