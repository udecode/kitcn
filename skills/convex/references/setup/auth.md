## 6. Auth Core (Better Auth)

Feature gate: only apply this section if auth is enabled.

### 6.1 Install auth dependencies

```bash
bun add better-auth@1.4.9 better-convex hono
```

### 6.2 Auth config provider

**Create:** `convex/functions/auth.config.ts`

```ts
import { getAuthConfigProvider } from "better-convex/auth/config";
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

### 6.3 Define auth contract

**Create:** `convex/functions/auth.ts`

```ts
import { convex } from "better-convex/auth";
import authConfig from "./auth.config";
import { defineAuth } from "./generated/auth";

export default defineAuth((ctx) => {
  return {
    baseURL:
      process.env.SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000",
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
    triggers: {
      user: {
        create: {
          before: async (data, triggerCtx) => {
            const adminEmails = (process.env.ADMIN ?? "").split(",");
            const role =
              data.role !== "admin" && adminEmails.includes(data.email)
                ? "admin"
                : data.role;
            return { data: { ...data, role } };
          },
        },
      },
    },
  };
});
```

Canonical rule:

1. Run `bunx better-convex dev` first to generate `convex/functions/generated/` directory.
2. `auth.ts` default-exports `defineAuth((ctx) => ({ ...options, triggers }))` imported from `./generated/auth`.
3. Import runtime auth contract (`getAuth`, `authClient`, CRUD/triggers, `auth`) from `convex/functions/generated/auth`.
4. If `auth.ts` is missing or incomplete, codegen still succeeds and generated runtime exports `authEnabled = false` with setup guidance at call time.

Do not manually create `authClient`, `createApi` exports, or static `auth` in `auth.ts`.

### 6.3.1 User session query module

Ordering note:

1. This module intentionally uses `publicQuery` + `getAuth(ctx)` so it works before Section 6.9 upgrades cRPC auth builders.

**Create:** `convex/functions/user.ts`

```ts
import { z } from "zod";
import { getHeaders } from "better-convex/auth";

import { getAuth } from "./generated/auth";
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
import type { getAuth } from "../functions/generated/auth";
import type { Select } from "./api";

export type Auth = ReturnType<typeof getAuth>;

export type SessionUser = Select<"user"> & {
  isAdmin: boolean;
  session: Select<"session">;
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

### 6.5 Register auth HTTP routes

Use `better-convex/auth/http` for `authMiddleware` or `registerRoutes`.
It auto-installs the Convex-safe `MessageChannel` polyfill, so no manual `http-polyfills.ts` file is needed.

**Create:** `convex/functions/http.ts`

Bootstrap note:

1. `http.ts` is parsed during startup/codegen.
2. Keep imports static (no lazy imports in Convex code).
3. If `_generated/*` modules are missing, run `bunx better-convex dev` first, then continue.

cRPC + Hono route shape:

```ts
import { authMiddleware } from "better-convex/auth/http";
import { createHttpRouter } from "better-convex/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { router } from "../lib/crpc";
import { getAuth } from "./generated/auth";

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

### 6.6 Sync env and JWKS

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

### 6.7 Production bootstrap notes

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

import { getAuth } from "../functions/generated/auth";
import { initCRPC } from "../functions/generated/server";

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
