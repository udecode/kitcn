# Better Convex Setup (Canonical, Greenfield)

Use this runbook to set up a project from scratch so agents can ship features end-to-end without additional setup context.

## 1. Purpose and Scope

This document is the canonical setup reference for better-convex in `.claude`.

In scope:

- Greenfield setup from empty/new app
- ORM-first backend (`ctx.orm`)
- cRPC setup, auth setup, client setup, framework setup
- Optional modules and plugin setup gates

Out of scope:

- Migrations from existing Convex/Ents/legacy data-layer projects

If migration is needed, stop and use migration docs separately. Do not mix migration steps into this runbook.

## 2. Agent Decision Intake

This is the **mandatory first prompt** for agents helping users set up better-convex.
Ask these questions before editing files.

### 2.1 Ask These First (match `/www/content/docs/index.mdx`)

#### Required choices

| Feature         | Options                                                              | Default            |
| --------------- | -------------------------------------------------------------------- | ------------------ |
| Approach        | Top-down (copy from Templates), Bottom-up (follow docs step-by-step) | Top-down           |
| React Framework | Next.js App Router, TanStack Start, Other                            | Next.js App Router |
| Database        | ORM (`ctx.orm`)                                                      | ORM                |

#### Optional features

| Feature       | Options                           | When to include                   |
| ------------- | --------------------------------- | --------------------------------- |
| Auth          | Better Auth, Custom, None         | Most apps need auth               |
| SSR/RSC       | Yes, No                           | Next.js App Router apps           |
| Triggers      | Yes, No                           | Auto side effects on data changes |
| Aggregates    | Yes, No                           | Counts, sums, leaderboards        |
| Rate Limiting | Yes, No                           | API protection                    |
| Scheduling    | Yes, No                           | Background jobs, delayed tasks    |
| HTTP router   | Yes, No                           | REST/webhook style endpoints      |
| RLS           | Yes, No                           | Runtime row-level access control  |
| Auth plugins  | admin, organizations, polar, none | Only when product requires them   |

### 2.2 First Prompt Template

Use this exact structure:

1. Approach: Top-down templates or bottom-up docs?
2. Framework: Next.js App Router, TanStack Start, or other?
3. Database: ORM (`ctx.orm`) or other?
4. Auth: Better Auth, custom auth, or no auth?
5. Need SSR/RSC?
6. Enable triggers?
7. Enable aggregates?
8. Enable rate limiting?
9. Enable scheduling?
10. Need HTTP router endpoints?
11. Enable RLS?
12. Any auth plugins (admin/organizations/polar)?

### 2.3 Decision Mapping

Map answers to setup execution in this order:

1. Build base setup first (non-auth only).
2. Pass the non-auth baseline gate (Section 11.2) before starting auth work.
3. If auth is enabled: add auth core.
4. If auth is enabled: pass the auth sign-in gate (Section 11.3) before optional modules/plugins.
5. Add framework branch (Next.js or TanStack Start).
6. Add optional modules/plugins only when selected.
7. If framework is `Other`, stop this runbook and route to non-setup docs (`react`, `server/*`) instead of guessing.

## 3. Base Bootstrap

### 3.1 Create app and install baseline packages

```bash
bunx create-next-app@latest my-app --typescript --tailwind --eslint --app --src-dir
cd my-app
bun add convex better-convex zod @tanstack/react-query
```

### 3.2 Create baseline folders

```bash
mkdir -p convex/functions convex/lib convex/shared src/lib/convex
```

If the goal is full template-level backend parity, also scaffold:

```bash
mkdir -p convex/functions/items convex/lib/auth convex/lib/emails convex/routers
```

Recommended monolithic structure:

```text
src/                    # app/client
convex/functions/       # deployed Convex functions
convex/lib/             # backend helpers (not deployed as API)
convex/shared/          # shared types/meta imported by client
```

### 3.3 Configure Convex functions path and static codegen

**Create:** `convex.json`

```json
{
  "functions": "convex/functions",
  "codegen": {
    "staticApi": true,
    "staticDataModel": true
  }
}
```

### 3.4 Configure TypeScript aliases and strict function typing

**Edit:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "strictFunctionTypes": false,
    "types": ["node"],
    "paths": {
      "@/*": ["./src/*"],
      "@convex/*": ["./convex/shared/*"]
    }
  }
}
```

Type-clean baseline notes:

1. Keep app/runtime node globals available (`types: ["node"]`) so `process.env` and server modules typecheck.
2. Add test-only globals (for example `vitest/globals`) in a test-specific tsconfig instead of the main app tsconfig.
3. If third-party declaration noise blocks setup, temporarily set `"skipLibCheck": true` and remove it once dependency versions are stabilized.
4. In backend Convex files, import `./_generated/*` relatively; `@convex/*` is for shared generated surface (`convex/shared/*`).

### 3.5 Enforce import boundaries (recommended)

**Edit:** `biome.jsonc`

```jsonc
{
  "extends": ["ultracite/core", "ultracite/react", "ultracite/next"],
  "overrides": [
    {
      "includes": ["src/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "convex/values": {
                    "importNames": ["ConvexError"],
                    "message": "Use CRPCError from 'better-convex/crpc' instead.",
                  },
                  "convex/react": "Use useCRPC from '@/lib/convex/crpc' instead.",
                  "convex/nextjs": "Use caller from '@/lib/convex/rsc' instead.",
                },
                "patterns": [
                  {
                    "group": ["**/../convex/**"],
                    "message": "Use @convex/* alias instead of relative convex imports.",
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      "includes": ["convex/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/*", "**/src/**"],
                    "message": "Convex files cannot import from src/.",
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      "includes": ["convex/shared/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["**/convex/lib/**"],
                    "message": "convex/shared cannot import from convex/lib.",
                  },
                ],
              },
            },
          },
        },
      },
    },
  ],
}
```

## 4. Environment Variables

### 4.1 Local

**Create:** `.env.local`

```bash
# Convex WebSocket API
NEXT_PUBLIC_CONVEX_URL=http://localhost:3210

# Convex HTTP site URL
NEXT_PUBLIC_CONVEX_SITE_URL=http://localhost:3211

# App URL for Better Auth client
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4.2 Cloud

```bash
# Generated by Convex
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

# Must be set manually
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-project.convex.site

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rule: real-time URL uses `.cloud`; HTTP/router/caller URL uses `.site`.

### 4.3 Typed env helper (recommended for full backend parity)

When multiple Convex functions and libs share env values (auth, billing, dev guards), create one typed helper:

**Create:** `convex/lib/get-env.ts`

```ts
import { createEnv } from "better-convex/server";
import { z } from "zod";

export const getEnv = createEnv({
  schema: z.object({
    DEPLOY_ENV: z.string().default("production"),
    SITE_URL: z.string().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string(),
    JWKS: z.string().optional(),
    ADMIN: z
      .string()
      .default("")
      .transform((s) => (s ? s.split(",") : []))
      .pipe(z.array(z.string())),
    RESEND_API_KEY: z.string().optional(),
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_SERVER: z.enum(["production", "sandbox"]).default("sandbox"),
    POLAR_PRODUCT_PREMIUM: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
  }),
});
```

Then prefer `getEnv()` in Convex code instead of scattered `process.env`.

## 5. Core Backend

### 5.1 Define schema and relations

**Create:** `convex/functions/schema.ts`

```ts
import {
  boolean,
  convexTable,
  defineRelations,
  defineSchema,
  index,
  text,
  timestamp,
} from "better-convex/orm";

export const user = convexTable(
  "user",
  {
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    role: text(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp(),
  },
  (t) => [index("email").on(t.email)]
);

export const session = convexTable(
  "session",
  {
    token: text().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    ipAddress: text(),
    userAgent: text(),
    impersonatedBy: text(),
  },
  (t) => [index("token").on(t.token), index("userId").on(t.userId)]
);

export const account = convexTable(
  "account",
  {
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
  },
  (t) => [index("accountId").on(t.accountId), index("userId").on(t.userId)]
);

export const verification = convexTable(
  "verification",
  {
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
  },
  (t) => [index("identifier").on(t.identifier)]
);

export const jwks = convexTable("jwks", {
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const project = convexTable(
  "project",
  {
    name: text().notNull(),
    ownerId: text()
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
  },
  (t) => [index("ownerId_updatedAt").on(t.ownerId, t.updatedAt)]
);

export const tables = { user, session, account, verification, jwks, project };

export default defineSchema(tables, { strict: false });

export const relations = defineRelations(tables, (r) => ({
  user: {
    projects: r.many.project(),
    sessions: r.many.session(),
    accounts: r.many.account(),
  },
  project: {
    owner: r.one.user({ from: r.project.ownerId, to: r.user.id }),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
}));
```

### 5.1.1 Reserved index fields (important)

Do not index `createdAt` directly in Better Convex ORM examples.
`createdAt` maps to Convex internal `_creationTime`, and explicit indexes on it can fail.
Prefer `updatedAt` (or a dedicated sortable field) for custom index definitions.

### 5.2 Attach ORM once (`ctx.orm`)

Do **not** create `convex/lib/orm.ts`.
`convex/functions/generated.ts` is generated and is the canonical server contract.
It includes `initCRPC` and ORM helpers when `relations` exists.
If you are not using codegen, use manual `initCRPC` from `better-convex/server` with `.dataModel()` and optional `.context()`.

Why this shape:

1. `orm.with(ctx)` preserves query vs mutation capabilities in type space.
2. It avoids common setup-time type failures like missing `insert`/`update` on `ctx.orm` in mutation handlers.

### 5.3 Initialize cRPC and procedure builders

**Create:** `convex/lib/crpc.ts`

```ts
import { initCRPC } from "../functions/generated";

const c = initCRPC
  .meta<{
    // Reserved for auth phase; do not implement auth logic yet.
    auth?: "optional" | "required";
    role?: "admin";
    rateLimit?: string;
  }>()
  .create();

// Phase 1 baseline: public + private only.
// Do not add auth-aware builders until Section 6.9 and Section 11.3 pass.
export const publicQuery = c.query;
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

export const publicRoute = c.httpAction;
export const router = c.router;
```

Phase ordering rule:

1. Keep this non-auth baseline until Section 11.2 fully passes.
2. Only then replace this file with the auth-aware variant in Section 6.9.

### 5.4 Shared API/type helpers (generated)

Do **not** create `convex/shared/api.ts` manually.
It is generated by `better-convex dev` / `better-convex codegen`.

Generated exports include:

1. `api` (typed procedure leaves + metadata)
2. `Api`, `ApiInputs`, `ApiOutputs`
3. `TableName`, `Select`, `Insert` (when `schema.ts` exports `tables`)

Consume these from `@convex/api` on app/client side.
Within Convex backend files, import server context/ORM helpers from `../functions/generated`.

### 5.5 Start dev/codegen

Run:

```bash
bunx better-convex dev
```

If this requires interactive Convex setup, pause and complete bootstrap before continuing.
Do not fake generated files.

Automation/non-interactive fallback (current CLI behavior):

1. `better-convex dev` delegates to `convex dev` and may prompt for interactive setup when bootstrap is missing.
2. For non-interactive agent terminals, bootstrap explicitly with:
   `bunx convex dev --once --configure new --team <team_slug> --project <project_slug> --dev-deployment local`
3. Confirm `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` were written.
4. Then run `bunx better-convex dev` (this already runs codegen/API generation).
5. If team/project values are unavailable, ask the user once and continue.
6. If bootstrap is still blocked, use low-friction fallback tests from `references/testing.md` (extract helper logic + unit tests) until deployment setup is complete.

Local deployment storage: New local and anonymous deployments store state under `.convex/` in the project root.

This generates:

- `convex/functions/_generated/*`
- `convex/functions/generated.ts`
- `convex/shared/api.ts`

Agent command policy:

1. Default to `bunx better-convex dev` (or one-shot `bunx better-convex dev --once --typecheck disable`).
2. `better-convex dev` already runs codegen/API generation.
3. Do not run `bunx better-convex codegen` as a separate default step.
4. Use manual `bunx better-convex codegen` only as fallback when `better-convex dev` cannot be run and backend is already active.

One-time codegen (optional; use only when `better-convex dev` is not running):

```bash
bunx better-convex codegen
```

Codegen runtime rule:

1. `better-convex codegen` still requires an active Convex backend connection.
2. If you see `Local backend isn't running`, start `bunx better-convex dev` in another terminal and retry.
3. If this remains blocked in agent mode, pause and ask the user to run `bunx better-convex dev`, then continue after it is live.

### 5.6 Import rules (hard requirement)

Never use lazy imports (`await import(...)`) in Convex code.

Rules:

1. Convex files (`convex/functions/**`, `convex/lib/**`, `convex/routers/**`) must use static imports only.
2. If generated modules are missing (`_generated/*`, `@convex/api`), stop and run `bunx better-convex dev` (or `bunx better-convex codegen`) first.
3. Do not work around missing generated files with dynamic imports.

## 6. Auth Core (Better Auth)

Feature gate: only apply this section if auth is enabled.

### 6.1 Install auth dependencies

```bash
bun add better-auth@1.4.9 better-convex hono
```

### 6.2 Auth config provider

**Create:** `convex/functions/auth.config.ts`

```ts
import { getAuthConfigProvider } from "better-convex/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    process.env.JWKS
      ? getAuthConfigProvider({ jwks: process.env.JWKS })
      : getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
```

Use static `JWKS` via Better Convex env sync:

```bash
bunx better-convex env sync --auth
```

What this does:

1. Syncs keys from `convex/.env` into the active Convex deployment.
2. With `--auth`, auto-generates and sets `BETTER_AUTH_SECRET` and `JWKS` if missing.
3. Treat generated auth secrets as owned by this flow; do not manually set `BETTER_AUTH_SECRET` in setup/simulation unless explicitly requested by the user.

Hard prerequisite:

1. `bunx better-convex dev` (or `bunx convex dev`) must be running first.
2. If no active deployment is reachable, env sync can fall back to anonymous mode and fail to set auth vars.

Quick check:

```bash
bunx convex env list
```

If the command reports local backend is not running, start `bunx better-convex dev` and retry.

This initializes `JWKS` (and `BETTER_AUTH_SECRET`) if missing when deployment access is healthy.
Malformed `JWKS` values can fail Convex module analysis during push/codegen.

### 6.3 Create auth client and options

**Create:** `convex/functions/auth.ts`

```ts
import { type BetterAuthOptions, betterAuth } from "better-auth";
import {
  type AuthFunctions,
  convex,
  createApi,
  createClient,
} from "better-convex/auth";

import { withOrm, type GenericCtx, type MutationCtx } from "../functions/generated";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import schema from "./schema";

const authFunctions: AuthFunctions = internal.auth;

export const authClient = createClient<
  DataModel,
  typeof schema,
  MutationCtx
>({
  authFunctions,
  schema,
  context: withOrm,
});

export const getAuthOptions = (ctx: GenericCtx) =>
  ({
    baseURL:
      process.env.SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000",
    database: authClient.adapter(ctx, getAuthOptions),
    plugins: [
      convex({
        authConfig,
        jwks: process.env.JWKS,
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24 * 15,
    },
    trustedOrigins: [
      process.env.SITE_URL ??
        process.env.NEXT_PUBLIC_SITE_URL ??
        "http://localhost:3000",
    ],
  }) satisfies BetterAuthOptions;

export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));

export const {
  beforeCreate,
  beforeDelete,
  beforeUpdate,
  onCreate,
  onDelete,
  onUpdate,
} = authClient.triggersApi();

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
} = createApi(schema, getAuth, {
  context: withOrm,
  skipValidation: true,
});

// biome-ignore lint/suspicious/noExplicitAny: required for CLI schema tooling
export const auth = betterAuth(getAuthOptions({} as any));
```

Canonical rule: always use `getAuth(ctx)` + `authClient.adapter(ctx, getAuthOptions)`.

Typing note:

1. Import `GenericCtx` from `../functions/generated` (generated) instead of redefining it locally.
2. Import `MutationCtx` from `../functions/generated` (generated) instead of deriving it inline.
3. Do not import a `GenericCtx` type from `better-convex/auth` for this file.

### 6.3.1 User session query module

Ordering note:

1. This module intentionally uses `publicQuery` + `getAuth(ctx)` so it works before Section 6.9 upgrades cRPC auth builders.

**Create:** `convex/functions/user.ts`

```ts
import { z } from "zod";
import { getHeaders } from "better-convex/auth";

import { getAuth } from "./auth";
import { publicQuery } from "../lib/crpc";

export const getSessionUser = publicQuery
  .output(
    z.union([
      z.object({
        id: z.string(),
        image: z.string().nullish(),
        isAdmin: z.boolean(),
        name: z.string().optional(),
        plan: z.string().optional(),
      }),
      z.null(),
    ])
  )
  .query(async ({ ctx }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    const user = session?.user;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      image: user.image,
      isAdmin: user.isAdmin ?? false,
      name: user.name,
      plan: user.plan,
    };
  });

export const getIsAuthenticated = publicQuery
  .output(z.boolean())
  .query(async ({ ctx }) => !!(await ctx.auth.getUserIdentity()));
```

### 6.3.2 Shared auth type contract

**Create:** `convex/shared/auth-shared.ts`

```ts
import type { Doc } from "../functions/_generated/dataModel";
import type { getAuth } from "../functions/auth";
import type { Select } from "./api";

export type Auth = ReturnType<typeof getAuth>;

export type SessionUser = Select<"user"> & {
  isAdmin: boolean;
  session: Doc<"session">;
  impersonatedBy?: string | null;
  plan?: "premium" | "team";
};
```

### 6.4 Define auth tables in schema

If you used section 5.1's schema template, these already exist.
Otherwise add these tables:

- `user`
- `session`
- `account`
- `verification`
- `jwks`

Keep all auth reads/writes on ORM table definitions in `convex/functions/schema.ts`.

### 6.5 Required polyfill for auth HTTP runtime

**Create:** `convex/lib/http-polyfills.ts`

```ts
if (typeof MessageChannel === "undefined") {
  class MockMessagePort {
    onmessage: ((ev: MessageEvent) => void) | undefined;
    onmessageerror: ((ev: MessageEvent) => void) | undefined;

    addEventListener() {}
    close() {}
    dispatchEvent(_event: Event): boolean {
      return false;
    }
    postMessage(_message: unknown, _transfer: Transferable[] = []) {}
    removeEventListener() {}
    start() {}
  }

  class MockMessageChannel {
    port1: MockMessagePort;
    port2: MockMessagePort;

    constructor() {
      this.port1 = new MockMessagePort();
      this.port2 = new MockMessagePort();
    }
  }

  globalThis.MessageChannel =
    MockMessageChannel as unknown as typeof MessageChannel;
}
```

### 6.6 Register auth HTTP routes

**Create:** `convex/functions/http.ts`

Bootstrap note:

1. `http.ts` is parsed during startup/codegen.
2. Keep imports static (no lazy imports in Convex code).
3. If `_generated/*` modules are missing, run `bunx better-convex dev` first, then continue.

cRPC + Hono route shape:

```ts
import "../lib/http-polyfills";

import { authMiddleware } from "better-convex/auth";
import { createHttpRouter } from "better-convex/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { router } from "../lib/crpc";
import { getAuth } from "./auth";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.SITE_URL!,
    allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
    exposeHeaders: ["Set-Better-Auth-Cookie"],
    credentials: true,
  })
);

app.use(authMiddleware(getAuth));

export const httpRouter = router({
  // register routers here
});

export default createHttpRouter(app, httpRouter);
```

### 6.7 Sync env and JWKS

**Create:** `convex/.env`

```bash
SITE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Sync:

```bash
bunx better-convex env sync --auth
```

Requires active deployment connectivity from `bunx better-convex dev` (or `bunx convex dev`) before running.

Rotate later:

```bash
bunx convex run auth:rotateKeys | bunx convex env set JWKS
```

### 6.8 Production bootstrap notes

First prod deploy requires JWKS initialization:

```bash
bunx convex deploy --prod
bunx convex run auth:getLatestJwks --prod | bunx convex env set JWKS --prod
```

### 6.9 Upgrade `convex/lib/crpc.ts` to auth-aware builders (only after Section 11.2 passes)

After non-auth baseline is green, replace `convex/lib/crpc.ts` with this auth-aware variant:

```ts
import { getHeaders } from "better-convex/auth";
import { CRPCError } from "better-convex/server";

import { getAuth } from "../functions/auth";
import { initCRPC } from "../functions/generated";

const c = initCRPC
  .meta<{
    auth?: "optional" | "required";
    role?: "admin";
    rateLimit?: string;
  }>()
  .create();

const roleMiddleware = c.middleware(({ meta, ctx, next }) => {
  if (meta.role !== "admin") return next({ ctx });

  const user = (ctx as { user?: { isAdmin?: boolean } }).user;
  if (!user?.isAdmin) {
    throw new CRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx });
});

function requireAuth<T>(user: T | null): T {
  if (!user) {
    throw new CRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return user;
}

export const publicQuery = c.query.meta({ auth: "optional" });
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

export const optionalAuthQuery = c.query
  .meta({ auth: "optional" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });

    return next({
      ctx: {
        ...ctx,
        user: session?.user ?? null,
        userId: session?.user?.id ?? null,
      },
    });
  });

export const authQuery = c.query
  .meta({ auth: "required" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    const user = requireAuth(session?.user ?? null);
    return next({ ctx: { ...ctx, user, userId: user.id } });
  })
  .use(roleMiddleware);

export const optionalAuthMutation = c.mutation
  .meta({ auth: "optional" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });

    return next({
      ctx: {
        ...ctx,
        user: session?.user ?? null,
        userId: session?.user?.id ?? null,
      },
    });
  });

export const authMutation = c.mutation
  .meta({ auth: "required" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    const user = requireAuth(session?.user ?? null);
    return next({ ctx: { ...ctx, user, userId: user.id } });
  })
  .use(roleMiddleware);

export const authAction = c.action
  .meta({ auth: "required" })
  .use(async ({ ctx, next }) => {
    const auth = getAuth(ctx);
    const session = await auth.api.getSession({
      headers: await getHeaders(ctx),
    });
    const user = requireAuth(session?.user ?? null);
    return next({ ctx: { ...ctx, user, userId: user.id } });
  });

export const publicRoute = c.httpAction;
export const authRoute = c.httpAction.use(async ({ ctx, next }) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new CRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: identity.subject,
      user: {
        id: identity.subject,
        email: identity.email,
        name: identity.name,
      },
    },
  });
});
export const optionalAuthRoute = c.httpAction.use(async ({ ctx, next }) => {
  const identity = await ctx.auth.getUserIdentity();
  return next({
    ctx: {
      ...ctx,
      userId: identity ? identity.subject : null,
      user: identity
        ? {
            id: identity.subject,
            email: identity.email,
            name: identity.name,
          }
        : null,
    },
  });
});
export const router = c.router;
```

### 6.10 Auth sign-in gate (required before Section 7+ and all optional modules/plugins)

Do not continue until all checks below pass:

1. `bunx better-convex dev --once --typecheck disable` (preferred; includes codegen)
2. `bun run typecheck || bunx tsc --noEmit`
3. `bun test`
4. `bun run build`
5. Headed browser auth verification:
   - Open `/auth`
   - Complete sign-in with configured provider/credentials
   - Confirm session is established (signed-in UI/state visible)
   - Execute one protected query or mutation and confirm it succeeds (no `UNAUTHORIZED`)
6. Signed-out enforcement check:
   - In a signed-out context, call one protected path and confirm `UNAUTHORIZED` is returned.

Stop/go rule:

1. If any sign-in gate check fails, fix auth wiring first.
2. Do not continue to Section 7, 8, 9, or 10 until this gate is green.

## 7. Client Core (after auth gate)

### 7.1 Auth client setup

Prerequisite:

1. Section 6.10 / Section 11.3 auth sign-in gate is green.

**Create:** `src/lib/convex/auth-client.ts`

```ts
import type { Auth } from "@convex/auth-shared";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "better-convex/auth-client";
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
import { ConvexAuthProvider } from "better-convex/auth-client";
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

## 8. Framework-Specific Setup

## 8.A Next.js App Router

### 8.A.1 Server caller + auth utilities

**Create:** `src/lib/convex/server.ts`

```ts
import { api } from "@convex/api";
import { convexBetterAuth } from "better-convex/auth-nextjs";

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

### 8.A.2 Auth API route

**Create:** `src/app/api/auth/[...all]/route.ts`

```ts
import { handler } from "@/lib/convex/server";

export const { GET, POST } = handler;
```

### 8.A.3 RSC helpers

**Create:** `src/lib/convex/rsc.tsx`

```tsx
import "server-only";

import { api } from "@convex/api";
import type { FetchQueryOptions } from "@tanstack/react-query";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import {
  createServerCRPCProxy,
  getServerQueryClientOptions,
} from "better-convex/rsc";
import { headers } from "next/headers";
import { cache } from "react";

import { hydrationConfig } from "./query-client";
import { createCaller, createContext } from "./server";

const createRSCContext = cache(async () =>
  createContext({ headers: await headers() })
);

export const caller = createCaller(createRSCContext);
export const crpc = createServerCRPCProxy({ api });

function createServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      ...hydrationConfig,
      ...getServerQueryClientOptions({
        getToken: caller.getToken,
        convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
      }),
    },
  });
}

export const getQueryClient = cache(createServerQueryClient);

export function prefetch<T extends { queryKey: readonly unknown[] }>(
  queryOptions: T
): void {
  void getQueryClient().prefetchQuery(queryOptions);
}

export function preloadQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends readonly unknown[] = readonly unknown[],
>(
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): Promise<TData> {
  return getQueryClient().fetchQuery(options);
}

export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
  );
}
```

### 8.A.4 Pass server token to provider

```tsx
// app/(app)/layout.tsx
import { BetterConvexProvider } from "@/lib/convex/convex-provider";
import { caller } from "@/lib/convex/rsc";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await caller.getToken();
  return <BetterConvexProvider token={token}>{children}</BetterConvexProvider>;
}
```

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

## 9. Optional Modules Setup (Feature Gates)

Enable only selected modules.

### 9.0 Component composition rule (`convex/functions/convex.config.ts`)

When multiple components are enabled, register all in one `defineApp()` file:

```ts
import aggregate from "@convex-dev/aggregate/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import resend from "@convex-dev/resend/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

// Enable only selected components:
app.use(rateLimiter);
app.use(resend);
app.use(aggregate, { name: "aggregateUsers" });
app.use(aggregate, { name: "aggregateTodosByUser" });

export default app;
```

### 9.1 RLS gate

Use `rlsPolicy` on ORM tables, evaluate through ORM context:

```ts
import { convexTable, id, rlsPolicy, text, eq } from "better-convex/orm";

export const secret = convexTable.withRLS(
  "secret",
  {
    ownerId: id("user").notNull(),
    value: text().notNull(),
  },
  (t) => [
    rlsPolicy("read_own", {
      for: "select",
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
  ]
);
```

### 9.2 Schema triggers gate

```ts
import { convexTable, onChange } from "better-convex/orm";

export const post = convexTable("post", { title: text().notNull() }, () => [
  onChange(async (ctx, change) => {
    if (change.operation === "delete") return;
    // side effects here
  }),
]);
```

Trigger guardrails:

1. Keep trigger work bounded and idempotent.
2. Avoid trigger chains that re-query/rewrite the same hot table rows during seed/init flows.
3. If `internal.seed.seed` or `internal.init.default` hangs, move counter/invariant sync into explicit mutation helpers and seed reconciliation.

### 9.3 Aggregates gate

Install and register component:

```bash
bun add @convex-dev/aggregate
```

```ts
// convex/functions/convex.config.ts
import aggregate from "@convex-dev/aggregate/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(aggregate, { name: "aggregatePostLikes" });
export default app;
```

Attach `TableAggregate.trigger()` in schema trigger list.

If Aggregates are **disabled** (`Aggregates: No`), remove all aggregate wiring in one pass:

1. Remove `app.use(aggregate, ...)` calls from `convex/functions/convex.config.ts`.
2. Remove aggregate helper modules (for example `convex/functions/aggregates.ts`).
3. Remove schema `aggregate*.trigger()` imports/hooks.
4. Re-run `bunx better-convex dev --once --typecheck disable` immediately to catch stale references.

### 9.4 Rate limiting gate

Install and register component:

```bash
bun add @convex-dev/rate-limiter
```

```ts
// convex/functions/convex.config.ts
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(rateLimiter);
export default app;
```

Create `convex/lib/rate-limiter.ts` and call guard from mutation middleware using `.meta({ rateLimit: 'scope/action' })`.

Use static `_generated/api` imports in Convex rate-limiter code:

```ts
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { CRPCError } from "better-convex/server";
import { components } from "../functions/_generated/api";

import type { ActionCtx, MutationCtx } from "../functions/_generated/server";
import type { SessionUser } from "../shared/auth-shared";

const rateLimitConfig = {
  "default:free": { kind: "fixed window", period: MINUTE, rate: 60 },
  "default:premium": { kind: "fixed window", period: MINUTE, rate: 200 },
  "default:public": { kind: "fixed window", period: MINUTE, rate: 30 },
  "todo/create:free": { kind: "fixed window", period: MINUTE, rate: 20 },
  "todo/create:premium": { kind: "fixed window", period: MINUTE, rate: 60 },
} as const;

const rateLimiter = new RateLimiter(components.rateLimiter, rateLimitConfig);

export function getRateLimitKey(
  baseKey: string,
  tier: "free" | "premium" | "public"
): string {
  const specificKey = `${baseKey}:${tier}`;

  if (specificKey in rateLimitConfig) {
    return specificKey;
  }

  return `default:${tier}`;
}

export function getUserTier(
  user: { isAdmin?: boolean; plan?: SessionUser["plan"] } | null
): "free" | "premium" | "public" {
  if (!user) return "public";
  if (user.isAdmin) return "premium";
  if (user.plan) return "premium";
  return "free";
}

export async function rateLimitGuard(
  ctx: (ActionCtx | MutationCtx) & {
    rateLimitKey: string;
    user: Pick<SessionUser, "id" | "plan"> | null;
  }
) {
  const tier = getUserTier(ctx.user);
  const limitKey = getRateLimitKey(ctx.rateLimitKey, tier);
  const identifier = ctx.user?.id ?? "anonymous";

  const status = await rateLimiter.limit(ctx, limitKey, { key: identifier });

  if (!status.ok) {
    throw new CRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded. Please try again later.",
    });
  }
}
```

### 9.5 Scheduling gate

Create `convex/functions/crons.ts` with `cronJobs()` and use `ctx.scheduler.runAfter/runAt` in mutations/actions for delayed jobs.

### 9.6 HTTP router gate

If REST endpoints are needed, add cRPC route builders and register routers in `convex/functions/http.ts`; consume via `crpc.http.*` client proxies.

### 9.7 Email + Resend gate

Install packages:

```bash
bun add @convex-dev/resend @react-email/components @react-email/render
```

Register component in `convex/functions/convex.config.ts`:

```ts
import resend from "@convex-dev/resend/convex.config";

app.use(resend);
```

Create action for organization invites or transactional mail:

```ts
"use node";

import { Resend } from "@convex-dev/resend";
import { privateAction } from "../lib/crpc";
import { components } from "./_generated/api";

const resendClient = new Resend(components.resend, { testMode: true });
```

Recommended files for this gate:

- `convex/functions/email.tsx`
- `convex/lib/emails/organization-invite.tsx`

## 10. Plugin Setup Modules

Feature gate each plugin independently after auth core.

### 10.1 Admin plugin

Server:

```ts
import { admin } from "better-auth/plugins";

plugins: [
  admin({
    defaultRole: "user",
  }),
];
```

Client:

```ts
import { adminClient } from "better-auth/client/plugins";

plugins: [adminClient()];
```

Schema needs admin fields on `user` + `impersonatedBy` on `session`.

### 10.2 Organizations plugin

Server: add `organization({...})` plugin config.

Client: add `organizationClient({...})` plugin config.

Schema: add `organization`, `member`, `invitation` (+ optional `team`, `teamMember`), and session fields `activeOrganizationId`/`activeTeamId`.

## 11. Dev Scripts and CLI Workflow

### 11.1 Dev bootstrap functions (example parity mode)

If you want the same operational model as the canonical template shape, use these canonical templates.

**Create:** `convex/functions/init.ts`

```ts
import { z } from "zod";

import { createUser } from "../lib/auth/auth-helpers";
import { privateMutation } from "../lib/crpc";
import { getEnv } from "../lib/get-env";
import { internal } from "./_generated/api";

export default privateMutation
  .meta({ dev: true })
  .output(z.null())
  .mutation(async ({ ctx }) => {
    const env = getEnv();
    const adminEmails = env.ADMIN;

    if (!adminEmails || adminEmails.length === 0) {
      return null;
    }

    let isFirstInit = true;

    for (const adminEmail of adminEmails) {
      const existingUser = await ctx.orm.query.user.findFirst({
        where: { email: adminEmail },
      });

      if (existingUser) {
        isFirstInit = false;
        continue;
      }

      await createUser(ctx, {
        email: adminEmail,
        name: "Admin",
        role: "admin",
      });
    }

    if (isFirstInit && getEnv().DEPLOY_ENV === "development") {
      await ctx.runMutation(internal.seed.seed, {});
    }

    return null;
  });
```

**Create:** `convex/functions/reset.ts`

```ts
/** biome-ignore-all lint/suspicious/noExplicitAny: dev */
import { eq } from "better-convex/orm";
import { CRPCError } from "better-convex/server";
import { z } from "zod";

import { privateAction, privateMutation } from "../lib/crpc";
import { getEnv } from "../lib/get-env";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import schema, { tables } from "./schema";

const DELETE_BATCH_SIZE = 64;
const excludedTables = new Set<TableNames>();

const assertDevOnly = () => {
  if (getEnv().DEPLOY_ENV === "production") {
    throw new CRPCError({
      code: "FORBIDDEN",
      message: "This function is only available in development",
    });
  }
};

export const reset = privateAction.output(z.null()).action(async ({ ctx }) => {
  assertDevOnly();

  for (const tableName of Object.keys(schema.tables)) {
    if (excludedTables.has(tableName as TableNames)) {
      continue;
    }

    await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
      cursor: null,
      tableName,
    });
  }

  return null;
});

export const deletePage = privateMutation
  .input(
    z.object({
      cursor: z.union([z.string(), z.null()]),
      tableName: z.string(),
    })
  )
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    assertDevOnly();

    const table = (tables as Record<string, any>)[input.tableName];
    if (!table) {
      throw new CRPCError({
        code: "BAD_REQUEST",
        message: `Unknown table: ${input.tableName}`,
      });
    }

    const query = (ctx.orm.query as Record<string, any>)[input.tableName];
    if (!query || typeof query.findMany !== "function") {
      throw new CRPCError({
        code: "BAD_REQUEST",
        message: `Unknown query table: ${input.tableName}`,
      });
    }

    const results = await query.findMany({
      cursor: input.cursor,
      limit: DELETE_BATCH_SIZE,
    });

    for (const row of results.page) {
      try {
        await ctx.orm.delete(table).where(eq(table.id, (row as any).id));
      } catch {
        // Can already be deleted by trigger or concurrent process.
      }
    }

    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
        cursor: results.continueCursor,
        tableName: input.tableName,
      });
    }

    return null;
  });
```

`convex/functions/seed.ts` stays project-specific, but should expose a `privateMutation` entrypoint used by `init.ts`.

Recommended scripts:

```json
{
  "scripts": {
    "convex:dev": "convex dev --until-success --run init && better-convex dev",
    "reset": "convex run reset:reset && sleep 5 && convex run init",
    "seed": "convex run seed:seed",
    "sync:jwks": "better-convex env sync --auth",
    "sync:rotate": "convex run auth:rotateKeys | convex env set JWKS"
  }
}
```

CLI commands:

```bash
bunx better-convex dev
# deterministic one-shot setup/codegen pass for agent simulations:
bunx better-convex dev --once --typecheck disable
# optional fallback only if dev cannot run and backend is already active:
bunx better-convex codegen
bunx better-convex env sync
bunx better-convex env sync --auth
bunx better-convex env sync --auth --prod
```

### 11.2 Phase A gate: non-auth baseline (required before auth work)

Run these after base setup (Sections 3-5) and before starting Section 6:

```bash
bunx better-convex dev --once --typecheck disable
bunx convex run internal.seed.seed
bunx convex run internal.init.default
# run project checks after bootstrap smoke:
bun run typecheck || bunx tsc --noEmit
bun test
bun run build
```

Then sanity-check runtime paths (non-auth only):

1. Run one public query endpoint.
2. Run one public mutation endpoint.
3. Run one public HTTP route endpoint.
4. Do not proceed to Section 6 until this gate is green.

### 11.3 Phase B gate: auth sign-in working (required before optional modules/plugins)

Run this after Section 6 and before Sections 7-10:

```bash
bunx better-convex dev --once --typecheck disable
bun run typecheck || bunx tsc --noEmit
bun test
bun run build
```

Then sanity-check auth runtime paths:

1. Sign in successfully from `/auth` in headed browser.
2. Run one protected query/mutation in signed-in context and confirm success.
3. Run one protected endpoint in signed-out context and confirm `UNAUTHORIZED`.
4. Do not proceed to optional modules/plugins until this gate is green.

## 12. Final From-Scratch Execution Checklist

1. `convex.json` configured with `functions: convex/functions` and static codegen enabled.
2. `tsconfig.json` has `strictFunctionTypes: false` and `@convex/*` alias.
3. `.env.local` has `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`.
4. `schema.ts` + `relations` + generated `initCRPC` wiring are in place.
5. `crpc.ts` builders exported and app procedures use `ctx.orm`.
6. `better-convex dev` runs and generates `_generated` + `api.ts`.
7. If auth enabled: `auth.config.ts`, `auth.ts`, `http-polyfills.ts`, `http.ts`, env sync complete.
8. Client `CRPCProvider` + QueryClient + Convex provider are mounted.
9. Framework branch is complete (Next.js or TanStack Start).
10. If using typed envs: `convex/lib/get-env.ts` exists and Convex code reads through `getEnv()`.
11. Optional modules/plugins added only if selected.
12. If multiple components enabled: `convex/functions/convex.config.ts` composes all `app.use(...)` calls in one file.
13. If organizations + invite mail enabled: `email.tsx` + invite template + resend component are wired.
14. If dev bootstrap mode enabled: `init.ts`, `seed.ts`, `reset.ts` exist and scripts call them.
15. If `Aggregates: No`, no aggregate helper/import/config references remain.
16. Phase A gate (Section 11.2) passes before any auth implementation.
17. If auth enabled: Phase B auth sign-in gate (Section 11.3) passes before optional modules/plugins.
18. No legacy Ents patterns in setup code.
19. NEVER use `@ts-nocheck` in app/convex source files.

## 13. Troubleshooting Matrix

| Symptom                                                                               | Likely Cause                                                                                    | Fix                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex/api` not found                                                               | `better-convex dev` not run                                                                     | Run `bunx better-convex dev` and regenerate API metadata                                                                                                                                     |
| `Cannot prompt for input in non-interactive terminals` during bootstrap               | Convex setup needs explicit project/team flags                                                  | Run `bunx convex dev --once --configure new --team <team_slug> --project <project_slug> --dev-deployment local`, then start `bunx better-convex dev`                                        |
| Can't find new local backend files under `~/.convex`                                  | Convex now stores new local deployment state per project                                        | Check `.convex/local/default/` in the current project root; treat `~/.convex/**` as legacy storage                                                                                          |
| `better-convex env sync --auth` says anonymous deployment or fails to set vars        | No active deployment connection                                                                 | Start `bunx better-convex dev` (or `bunx convex dev`) first, then rerun sync                                                                                                                |
| `Failed to analyze auth.js` with `Unexpected token` / `map is not a function` on JWKS | Static `JWKS` value is malformed JSON                                                           | Unset/fix `JWKS`; use `getAuthConfigProvider()` fallback or resync with `bunx better-convex env sync --auth`                                                                                |
| `Local backend isn't running` during manual `better-convex codegen`                   | Convex local deployment not active                                                              | Prefer `bunx better-convex dev` (it already codegens); use manual `codegen` only as fallback with active backend                                                                            |
| HTTP calls fail but queries work                                                      | `.site` URL missing or wrong                                                                    | Set `NEXT_PUBLIC_CONVEX_SITE_URL` correctly                                                                                                                                                 |
| Auth works locally but fails in prod                                                  | JWKS not synced                                                                                 | Run `bunx better-convex env sync --auth --prod`                                                                                                                                             |
| Sign-in fails on `/auth` (loop, no session, or immediate sign-out)                    | Auth route/env/provider wiring mismatch                                                         | Recheck Sections 6.6-6.8 (`authMiddleware`, route registration, env sync), verify provider credentials/URLs, then rerun Section 11.3                                                        |
| `UNAUTHORIZED` on protected procedures                                                | auth middleware not attaching `userId`                                                          | Ensure `getAuth(ctx)` + `getHeaders(ctx)` session lookup is in middleware                                                                                                                   |
| `ctx.orm` missing in handlers                                                         | Generated `initCRPC` not used (or manual ORM context not wired)                                | Use `initCRPC` from `../functions/generated`; if manual, ensure `query` + `mutation` both use `withOrm(ctx)`                                                                                |
| `Property 'insert'/'update' does not exist on type 'OrmReader'`                       | ORM context wrapper used reader-only shape                                                      | Use `orm.with(ctx)` in `withOrm` helper (Section 5.2)                                                                                                                                       |
| `useCRPC must be used within CRPCProvider`                                            | Provider chain not mounted around route tree                                                    | Wrap app with `BetterConvexProvider` and verify `CRPCProvider` is inside QueryClientProvider (Section 7.4 / 8.A.4)                                                                          |
| Route auth cookies not set                                                            | Missing CORS auth headers                                                                       | Add `Better-Auth-Cookie` allow/expose headers + credentials                                                                                                                                 |
| TanStack Start auth helper import errors                                              | Using `better-convex/auth-nextjs` in Start app                                                  | Use TanStack Start exception with `@convex-dev/better-auth/*` helpers                                                                                                                       |
| `Returned promise will never resolve` from internal function                          | Trigger path is recursively querying/updating related rows or stale component wiring still runs | Isolate failing write with logs, disable/move trigger-side sync into explicit mutation helper, rerun `bunx better-convex dev --once --typecheck disable`, then retry bootstrap smoke checks |
| Better Auth secret mismatch/warnings in setup flows                                   | `BETTER_AUTH_SECRET` manually set inconsistently or low entropy                                 | Generate and sync via `bunx better-convex env sync --auth`; avoid manual secret setting unless explicitly needed                                                                            |
| `Invalid orderBy value. Use a column or asc()/desc()`                                 | Wrong `orderBy` shape (`[{ field, direction }]`)                                                | Use object form only, e.g. `orderBy: { updatedAt: "desc" }`                                                                                                                                 |
| `Invalid argument id for db.get` while testing `NOT_FOUND`                            | Fabricated Convex document ID                                                                   | Use real inserted IDs or non-ID lookup keys (slug/name/email) for not-found tests                                                                                                           |
| Trigger side effects too slow                                                         | Heavy sync work inside trigger                                                                  | Move heavy work to scheduled actions via `ctx.scheduler`                                                                                                                                    |
| Rate limiter no-op                                                                    | component not registered in `convex.config.ts`                                                  | Add `@convex-dev/rate-limiter` app component                                                                                                                                                |
| fallback `better-convex codegen` fails after disabling aggregates                     | Aggregate helper/import references still exist                                                  | Remove `app.use(aggregate...)`, schema aggregate hooks, and aggregate helper modules in the same change; prefer rerunning `better-convex dev --once`                                        |
| Aggregate counts drift                                                                | trigger not attached in schema                                                                  | Attach `aggregate.trigger()` in table extra config                                                                                                                                          |
| Invite emails never send                                                              | `@convex-dev/resend` component not registered                                                   | Add `app.use(resend)` and wire `functions/email.tsx`                                                                                                                                        |
| Dev reset/seed commands do nothing                                                    | `init.ts`/`seed.ts`/`reset.ts` missing or not wired                                             | Add dev bootstrap functions and scripts from Section 11.1                                                                                                                                   |

## Coverage Matrix

Source coverage mapping used to build this runbook:

| Source                                               | Mapped In Setup                  |
| ---------------------------------------------------- | -------------------------------- |
| `www/content/docs/templates.mdx`                     | Sections 3, 4, 5, 6, 7, 8, 9, 11 |
| `www/content/docs/quickstart.mdx`                    | Sections 3, 4, 5, 12             |
| `www/content/docs/server/setup.mdx`                  | Section 5.3                      |
| `www/content/docs/auth/server.mdx`                   | Sections 6.1 - 6.10              |
| `www/content/docs/auth/client.mdx`                   | Section 7.1                      |
| `www/content/docs/auth/triggers.mdx`                 | Section 6.3, 9.2                 |
| `www/content/docs/react/index.mdx`                   | Sections 7.2 - 7.4               |
| `www/content/docs/nextjs/index.mdx`                  | Section 8.A                      |
| `www/content/docs/tanstack-start.mdx`                | Section 8.B                      |
| `www/content/docs/server/http.mdx`                   | Sections 6.6, 9.6                |
| `www/content/docs/server/server-side-calls.mdx`      | Section 8.A.1, 8.B.3             |
| `www/content/docs/server/advanced/rate-limiting.mdx` | Section 9.4                      |
| `www/content/docs/server/advanced/aggregates.mdx`    | Section 9.3                      |
| `www/content/docs/server/advanced/scheduling.mdx`    | Section 9.5                      |
| `www/content/docs/orm/queries/index.mdx`             | Sections 5, 12                   |
| `www/content/docs/orm/mutations/index.mdx`           | Sections 5, 12                   |
| `www/content/docs/orm/triggers.mdx`                  | Sections 9.2, 9.3                |
| `www/content/docs/orm/rls.mdx`                       | Section 9.1                      |
| `www/content/docs/auth/plugins/admin.mdx`            | Section 10.1                     |
| `www/content/docs/auth/plugins/organizations.mdx`    | Section 10.2                     |
| `www/content/docs/auth/plugins/polar.mdx`            | Section 10.3                     |
| `www/content/docs/cli.mdx`                           | Section 11                       |

### Template Coverage (Recreation Target)

This runbook + references map to the canonical template shape as follows:

| Example Group                                                                                             | Primary Setup Section           | Additional Reference                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| Core infra (`schema.ts`, `functions/generated.ts`, `crpc.ts`, `http.ts`)                                  | Sections 5, 6.6, 9.6            | `orm.md`, `http.md`                      |
| Shared contracts (`shared/api.ts`, `shared/auth-shared.ts`, `shared/polar-shared.ts`)                   | Sections 5.4, 6.3.2, 10.2, 10.3 | `auth-organizations.md`                  |
| Auth core (`auth.config.ts`, `auth.ts`)                                                                   | Section 6                       | `auth.md`                                |
| Auth plugins (`admin.ts`, `organization.ts`, `polar*`)                                                    | Section 10                      | `auth-admin.md`, `auth-organizations.md` |
| Feature modules (`user.ts`, `projects.ts`, `tags.ts`, `todoComments.ts`, `public.ts`, `items/queries.ts`) | Sections 5, 6.3.1, 9            | core `SKILL.md`, `orm.md`, `filters.md`  |
| HTTP routers (`routers/health.ts`, `routers/todos.ts`, `routers/examples.ts`)                             | Section 9.6                     | `http.md`                                |
| Aggregates + rate limits (`aggregates.ts`, `lib/rate-limiter.ts`)                                         | Sections 9.3, 9.4               | `aggregates.md`, `orm.md`                |
| Scheduling + internals (`todoInternal.ts`, delayed jobs)                                                  | Sections 9.5, 11.1              | `scheduling.md`                          |
| Email + Resend (`functions/email.tsx`, `lib/emails/*`)                                                    | Section 9.7                     | `auth-organizations.md`                  |
| Dev bootstrap (`init.ts`, `seed.ts`, `reset.ts`)                                                          | Section 11.1                    | `testing.md` (for verification)          |
| Generated outputs (`functions/_generated/*`, `functions/generated.ts`, `shared/api.ts`)                   | Section 5.5                     | n/a (generated by CLI)                   |
