---
"kitcn": minor
"@kitcn/resend": patch
---

## Breaking changes

- Remove `registerRoutesLazy` and make `registerRoutes` lazy by default. If you use a custom auth base path, pass `basePath` explicitly.

```ts
// Before
import { registerRoutesLazy } from "kitcn/auth/http";

registerRoutesLazy(http, getAuth, {
  basePath: "/custom-auth",
  cors: {
    allowedOrigins: [process.env.SITE_URL!],
  },
  trustedOrigins: [process.env.SITE_URL!],
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

## Patches

- Let Convex handle anonymous non-interactive local setup without forcing `CONVEX_AGENT_MODE`.
- Warn when an app pins an older Convex dependency family than kitcn expects.
- Support Convex `dev --start` as a pre-run conflict flag.
- Sync Convex Better Auth runtime fixes, including `@convex-dev/better-auth@0.11.4` and auth adapter index matching.
