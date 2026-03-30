## 8.B TanStack Start

Explicit exception: current docs still use `@convex-dev/better-auth/*` helpers for TanStack Start integration.

### 8.B.1 Auth client + auth server helpers

**Create:** `src/lib/convex/auth/auth-client.ts`

```ts
import type { Auth } from "@convex/auth-shared";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (import.meta.env.VITE_SITE_URL as string | undefined)
      : window.location.origin,
  sessionOptions: { refetchOnWindowFocus: false },
  plugins: [inferAdditionalFields<Auth>(), adminClient(), convexClient()],
});
```

**Create:** `src/lib/convex/auth/auth-server.ts`

```ts
import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: process.env.VITE_CONVEX_URL!,
  convexSiteUrl: process.env.VITE_CONVEX_SITE_URL!,
});
```

### 8.B.2 Auth API endpoint

**Create:** `src/routes/api/auth/$.ts`

```ts
import { createFileRoute } from "@tanstack/react-router";
import { handler } from "@/lib/convex/auth/auth-server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
```

### 8.B.3 Caller/context and providers

Use docs pattern from `tanstack-start.mdx` for:

- `createCallerFactory` + `runServerCall`
- router context values (`convex`, `queryClient`, `convexQueryClient`)
- provider wrapping with `ConvexAuthProvider` and `initialToken`

