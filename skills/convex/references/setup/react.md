## 7. Client Core (after auth gate)

### 7.1 Auth client setup

Prerequisite:

1. Section 6.10 / Section 11.3 auth sign-in gate is green.

**Create:** `src/lib/convex/auth-client.ts`

```ts
import type { Auth } from "@convex/auth-shared";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "better-convex/auth/client";
import { createAuthMutations } from "better-convex/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  sessionOptions: {
    // Disable session polling on tab focus (saves ~500ms HTTP call per focus)
    refetchOnWindowFocus: false,
  },
  plugins: [inferAdditionalFields<Auth>(), adminClient(), convexClient()],
});

export const { useActiveOrganization, useListOrganizations } = authClient;

export const {
  useSignOutMutationOptions,
  useSignInSocialMutationOptions,
  useSignInMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
```

### 7.2 QueryClient setup

**Create:** `src/lib/convex/query-client.ts`

```ts
import {
  type DefaultOptions,
  defaultShouldDehydrateQuery,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { isCRPCClientError, isCRPCError } from "better-convex/crpc";
import SuperJSON from "superjson";

export const hydrationConfig: Pick<DefaultOptions, "dehydrate" | "hydrate"> = {
  dehydrate: {
    serializeData: SuperJSON.serialize,
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) || query.state.status === "pending",
    shouldRedactErrors: () => false,
  },
  hydrate: {
    deserializeData: SuperJSON.deserialize,
  },
};

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isCRPCClientError(error)) {
          console.warn(`[CRPC] ${error.code}:`, error.functionName);
        }
      },
    }),
    defaultOptions: {
      ...hydrationConfig,
      queries: {
        retry: (failureCount, error) => {
          if (isCRPCError(error)) return false;
          return failureCount < 3;
        },
      },
    },
  });
}
```

### 7.3 cRPC React context

**Create:** `src/lib/convex/crpc.tsx`

Preconditions:

1. Complete Section 5.5 first so `@convex/api` exists.
2. Complete Section 7.4 so `CRPCProvider` is mounted before any `useCRPC()` call.

```tsx
import { api } from "@convex/api";
import { createCRPCContext } from "better-convex/react";

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

### 7.4 Provider composition

**Create:** `src/lib/convex/convex-provider.tsx`

Hard rule:

1. Any component using `useCRPC`, `useCRPCClient`, or cRPC hooks must render under `CRPCProvider`.
2. If not, runtime will crash with `useCRPC must be used within CRPCProvider`.

```tsx
"use client";

import { QueryClientProvider as TanstackQueryClientProvider } from "@tanstack/react-query";
import { ConvexAuthProvider } from "better-convex/auth/client";
import {
  ConvexReactClient,
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
  useAuthStore,
} from "better-convex/react";
import type { ReactNode } from "react";

import { authClient } from "./auth-client";
import { CRPCProvider } from "./crpc";
import { createQueryClient } from "./query-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function BetterConvexProvider({
  children,
  token,
}: {
  children: ReactNode;
  token?: string;
}) {
  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      initialToken={token}
    >
      <QueryProvider>{children}</QueryProvider>
    </ConvexAuthProvider>
  );
}

function QueryProvider({ children }: { children: ReactNode }) {
  const authStore = useAuthStore();

  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({
    authStore,
    convex,
    queryClient,
  });

  return (
    <TanstackQueryClientProvider client={queryClient}>
      <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
        {children}
      </CRPCProvider>
    </TanstackQueryClientProvider>
  );
}
```

Provider mount checklist:

1. `BetterConvexProvider` wraps app routes before client feature components render.
2. `CRPCProvider` is nested inside TanStack Query provider (`QueryClientProvider`).
3. Next.js apps pass token where required (Section 8.A.4) or intentionally run without token for public-only paths.

