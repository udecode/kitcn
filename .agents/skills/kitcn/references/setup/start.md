## 8.B TanStack Start

CLI-first flow: scaffold the app, run `kitcn add auth --yes`, then treat the
files below as the generated reference output. They are not a separate manual
install path.

After changing plugins or auth fields in `<functionsDir>/auth.ts`, refresh
auth-owned schema blocks with `bunx kitcn add auth --schema --yes`. Keep
`bunx kitcn dev` running as the local Convex + codegen loop.
### 8.B.1 Auth client + auth server helpers

**Create:** `src/lib/convex/auth-client.ts`

```ts
import { createAuthClient } from "better-auth/react";
import { convexClient } from "kitcn/auth/client";
import { createAuthMutations } from "kitcn/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (import.meta.env.VITE_SITE_URL as string | undefined)
      : window.location.origin,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
```

**Create:** `src/lib/convex/auth-server.ts`

```ts
import { convexBetterAuthReactStart } from "kitcn/auth/start";

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: import.meta.env.VITE_CONVEX_URL!,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
});
```

For client-side route loaders that fetch protected Convex queries through the
router `queryClient`, prime the shared Convex client in the root `beforeLoad`
before child loaders run:

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { syncConvexAuthForStartLoader } from "kitcn/auth/start";
import type { ConvexQueryClient } from "kitcn/react";

import { getToken } from "@/lib/convex/auth-server";

const getLoaderToken = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export const Route = createRootRouteWithContext<{
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context }) => {
    return await syncConvexAuthForStartLoader({
      convex: context.convexQueryClient,
      getToken: getLoaderToken,
    });
  },
});
```

Use `runServerCall` or `fetchAuthQuery` for server-side loaders. Use
`syncConvexAuthForStartLoader` only for client/router loaders that execute
shared `ConvexQueryClient` queries before `ConvexAuthProvider` mounts.

### 8.B.2 Auth API endpoint

**Create:** `src/routes/api/auth/$.ts`

```ts
import { createFileRoute } from "@tanstack/react-router";
import { handler } from "@/lib/convex/auth-server";

export const Route = createFileRoute("/api/auth/$" as never)({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
```

### 8.B.3 Caller/context and providers

**Create:** `src/lib/convex/server.ts`

```ts
import { api } from "@convex/api";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createCallerFactory } from "kitcn/server";

import { getToken } from "@/lib/convex/auth-server";

const { createContext, createCaller } = createCallerFactory({
  api,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
  auth: {
    getToken: async () => {
      return {
        token: await getToken(),
      };
    },
  },
});

type ServerCaller = ReturnType<typeof createCaller>;

async function makeContext() {
  const headers = await getRequestHeaders();
  return createContext({ headers });
}

function createServerCaller(): ServerCaller {
  return createCaller(async () => {
    return await makeContext();
  });
}

export function runServerCall<T>(fn: (caller: ServerCaller) => Promise<T> | T) {
  const caller = createServerCaller();
  return fn(caller);
}
```

Use the docs pattern from `tanstack-start.mdx` for:

- `src/routes/__root.tsx` shell/provider wiring
- `src/lib/convex/convex-provider.tsx`
