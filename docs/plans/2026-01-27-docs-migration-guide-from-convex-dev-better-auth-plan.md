---
title: Migration Guide from @convex-dev/better-auth
type: docs
date: 2026-01-27
---

# Migration Guide from @convex-dev/better-auth to better-convex

## Overview

This guide walks you through migrating from `@convex-dev/better-auth` (the official Convex Better Auth package) to `better-convex`. We'll cover all the changes step-by-step, from removing the component pattern to setting up triggers and the new provider.

## Problem Statement

Users of `@convex-dev/better-auth` want to migrate to `better-convex` for:
- Built-in trigger system for user/session lifecycle hooks
- Simpler setup without Convex component pattern
- Enhanced React utilities (`createAuthMutations`, auth store)
- Better SSR support with initial token handling

## Key Differences

| Aspect | @convex-dev/better-auth | better-convex |
|--------|------------------------|---------------|
| Package | `@convex-dev/better-auth` | `better-convex` |
| Architecture | Convex component pattern | Direct integration |
| Triggers | Not built-in | `triggers: { user, session }` |
| Client Creation | `createClient(components.betterAuth, {...})` | `createClient({ authFunctions, schema, triggers })` |
| DB Adapter | `authComponent.adapter(ctx)` | `authClient.adapter(ctx)` + `authClient.httpAdapter(ctx)` |
| Provider | `ConvexBetterAuthProvider` | `ConvexAuthProvider` |
| React Utils | `AuthBoundary` | `createAuthMutations()`, auth store |

## Acceptance Criteria

- [x] Remove Convex component pattern (convex.config.ts, betterAuth folder)
- [x] Update all package imports from `@convex-dev/better-auth` to `better-convex`
- [x] Migrate `createClient` to new signature with triggers
- [x] Update auth.ts to use new `createApi` pattern
- [x] Replace `ConvexBetterAuthProvider` with `ConvexAuthProvider`
- [x] Update auth-client.tsx imports
- [x] Migrate any `AuthBoundary` usage to new patterns
- [x] Update env vars if needed (JWKS handling)

## MVP

### Step 1: Update Dependencies

Remove the old package and install better-convex.

```bash title="Terminal"
bun remove @convex-dev/better-auth
bun add better-convex
```

### Step 2: Remove Component Pattern

Delete the Convex component configuration files.

**Files to delete:**
- `convex/convex.config.ts` (or remove `app.use(betterAuth)` line)
- `convex/betterAuth/` folder (entire directory)

**Before** (`convex/convex.config.ts`):
```typescript showLineNumbers
import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import resend from "@convex-dev/resend/convex.config";

const app = defineApp();
app.use(betterAuth);  // Remove this
app.use(resend);

export default app;
```

**After** (`convex/convex.config.ts`):
```typescript showLineNumbers
import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config";

const app = defineApp();
app.use(resend);  // Keep other components

export default app;
```

### Step 3: Update auth.config.ts

The auth config stays largely the same, just update the import.

**Before:**
```typescript showLineNumbers
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

**After:**
```typescript showLineNumbers
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
} satisfies AuthConfig;
```

**Note:** You can now pass a static JWKS to avoid database queries during token verification.

### Step 4: Migrate auth.ts (Server Setup)

This is the main migration. We'll replace the component-based client with the new direct pattern.

**Before** (component pattern):
```typescript showLineNumbers title="convex/auth.ts"
import { components } from "./_generated/api";
import { createClient, GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import authSchema from "./betterAuth/schema";
import authConfig from "./auth.config";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  { local: { schema: authSchema }, verbose: false }
);

export const getAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: process.env.SITE_URL,
  database: authComponent.adapter(ctx),
  // ... plugins and options
});

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(getAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
```

**After** (direct pattern):
```typescript showLineNumbers title="convex/functions/auth.ts" {1-4,10-13,28-52,57-62}
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { createApi, createClient, type AuthFunctions } from "better-convex/auth";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import schema from "./schema";

// Reference internal auth functions
const authFunctions: AuthFunctions = internal.auth;

// Create the auth client with triggers
export const authClient = createClient<DataModel, typeof schema>({
  authFunctions,
  schema,
  triggers: {
    user: {
      beforeCreate: async (_ctx, data) => {
        // Transform user data before creation
        return data;
      },
      onCreate: async (ctx, user) => {
        // Side effects after user creation (e.g., create personal org)
        console.log("User created:", user._id);
      },
    },
    session: {
      onCreate: async (ctx, session) => {
        // Side effects after session creation
      },
    },
  },
});

// Create auth options factory
const getAuthOptions = (ctx: QueryCtx | MutationCtx | ActionCtx) =>
  ({
    baseURL: process.env.SITE_URL!,
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
    plugins: [
      convex({
        authConfig,
        jwks: process.env.JWKS,
      }),
    ],
    database: authClient.httpAdapter(ctx),
  }) satisfies BetterAuthOptions;

// Query/Mutation context auth
export const getAuth = <Ctx extends QueryCtx | MutationCtx>(ctx: Ctx) =>
  betterAuth({
    ...getAuthOptions(ctx),
    database: authClient.adapter(ctx, getAuthOptions),
  });

// Action context auth
export const createAuth = (ctx: ActionCtx) =>
  betterAuth(getAuthOptions(ctx));

// Generate internal CRUD functions
export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
  getLatestJwks,
  rotateKeys,
} = createApi(schema, createAuth);

// Generate trigger API
export const {
  beforeCreate,
  beforeDelete,
  beforeUpdate,
  onCreate,
  onDelete,
  onUpdate,
} = authClient.triggersApi();

// Export for Better Auth CLI
export const auth = betterAuth(getAuthOptions({} as any));
```

**Important changes:**
- `createClient` now takes `{ authFunctions, schema, triggers }` instead of `(components.betterAuth, { local: {...} })`
- Two database adapters: `httpAdapter(ctx)` for HTTP routes, `adapter(ctx, getAuthOptions)` for queries/mutations
- `createApi()` generates internal functions instead of component access
- Triggers are built-in, not separate

### Step 5: Update auth-client.tsx (Client Setup)

Update the client-side auth setup with new imports.

**Before:**
```typescript showLineNumbers title="lib/auth-client.tsx"
"use client";

import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    convexClient(),
    // ... other plugins
  ],
});
```

**After:**
```typescript showLineNumbers title="lib/convex/auth-client.ts" {3,8-9}
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { createAuthMutations } from "better-convex/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  sessionOptions: {
    refetchOnWindowFocus: false,  // Recommended: saves HTTP calls
  },
  plugins: [
    convexClient(),
    // ... other plugins
  ],
});

// NEW: Export mutation hooks for TanStack Query integration
export const {
  useSignOutMutationOptions,
  useSignInSocialMutationOptions,
  useSignInMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
```

### Step 6: Update Provider (ConvexClientProvider.tsx)

Replace `ConvexBetterAuthProvider` with `ConvexAuthProvider`.

**Before:**
```typescript showLineNumbers title="app/ConvexClientProvider.tsx"
"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
```

**After:**
```typescript showLineNumbers title="lib/convex/convex-provider.tsx" {4-6,20-28}
"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "better-convex/auth/client";
import { authClient } from "@/lib/convex/auth-client";
import { useRouter } from "next/navigation";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function BetterConvexProvider({
  children,
  token,
}: {
  children: ReactNode;
  token?: string;
}) {
  const router = useRouter();

  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      initialToken={token}
      onMutationUnauthorized={() => {
        router.push("/login");
      }}
      onQueryUnauthorized={({ queryName }) => {
        router.push("/login");
      }}
    >
      {children}
    </ConvexAuthProvider>
  );
}
```

**New features:**
- `onMutationUnauthorized` - Handle auth errors on mutations
- `onQueryUnauthorized` - Handle auth errors on queries (includes `queryName` for debugging)

### Step 7: Remove AuthBoundary (Optional)

If you were using `AuthBoundary`, you can now handle auth errors via provider callbacks instead.

**Before:**
```typescript showLineNumbers
import { AuthBoundary } from "@convex-dev/better-auth/react";

export const ClientAuthBoundary = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  return (
    <AuthBoundary
      authClient={authClient}
      onUnauth={() => router.push("/sign-in")}
      getAuthUserFn={api.auth.getAuthUser}
      isAuthError={isAuthError}
    >
      {children}
    </AuthBoundary>
  );
};
```

**After:** Use the provider's `onQueryUnauthorized` and `onMutationUnauthorized` callbacks instead.

### Step 8: Update Schema (If Using Ents)

If you want to use Convex Ents for relationships, you'll need to define the schema yourself instead of using the auto-generated component schema.

```typescript showLineNumbers title="convex/functions/schema.ts"
import { authTables } from "better-convex/auth";
import { defineEnts, defineEntSchema, getEntDefinitions } from "convex-ents";

const entDefinitions = defineEnts(authTables, {
  user: {
    // Add custom fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  // Add custom tables
  organization: defineEnt({
    name: v.string(),
    slug: v.string(),
  }).edges("members", { ref: "member" }),
});

export const { entDefinitions } = getEntDefinitions(schema);
export default defineEntSchema(entDefinitions);
```

## Migration Checklist

- [ ] **Dependencies:** Remove `@convex-dev/better-auth`, install `better-convex`
- [ ] **convex.config.ts:** Remove `app.use(betterAuth)` line
- [ ] **betterAuth folder:** Delete the entire `convex/betterAuth/` directory
- [ ] **auth.config.ts:** Update import, add `jwks` option
- [ ] **auth.ts:** Rewrite using new `createClient` and `createApi` patterns
- [ ] **auth-client.ts:** Update imports, add `createAuthMutations`
- [ ] **Provider:** Replace `ConvexBetterAuthProvider` with `ConvexAuthProvider`
- [ ] **AuthBoundary:** Remove or migrate to provider callbacks
- [ ] **Schema:** Define custom schema if using Ents
- [ ] **Env vars:** Add `JWKS` if using static JWKS
- [ ] **Test:** Verify sign-in, sign-up, session persistence, and token refresh

## Troubleshooting

### "Cannot find module 'better-convex/auth'"

Make sure you've installed the package:
```bash
bun add better-convex
```

### "authFunctions is undefined"

Ensure you're referencing `internal.auth` correctly:
```typescript
const authFunctions: AuthFunctions = internal.auth;
```

### "Token not refreshing"

The new provider handles token refresh automatically. If issues persist, check that `onQueryUnauthorized` isn't redirecting before refresh completes.

### "Triggers not firing"

Triggers must be defined in `createClient`. They won't fire for direct database operations - only through Better Auth flows.

## References

- [better-convex example app](example/)
- [@convex-dev/better-auth repo](https://github.com/get-convex/better-auth)
- [Better Auth documentation](https://www.better-auth.com/)
