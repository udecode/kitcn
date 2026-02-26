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

## 11. Dev Scripts and CLI Workflow

### 11.1 Dev bootstrap functions (example parity mode)

If you want the same operational model as the canonical template shape, use these canonical templates.

**Create:** `convex/functions/init.ts`

```ts
import { z } from "zod";

import { createUser } from "../lib/auth/auth-helpers";
import { privateMutation } from "../lib/crpc";
import { getEnv } from "../lib/get-env";
import { createSeedHandler } from "./generated/seed.runtime";

export default privateMutation
  .meta({ dev: true })
  
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
      const handler = createSeedHandler(ctx);
      await handler.seed({});
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
import type { TableNames } from "./_generated/dataModel";
import { createResetCaller } from "./generated/reset.runtime";
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

export const reset = privateAction.action(async ({ ctx }) => {
  assertDevOnly();
  const caller = createResetCaller(ctx);

  for (const tableName of Object.keys(schema.tables)) {
    if (excludedTables.has(tableName as TableNames)) {
      continue;
    }

    await caller.schedule.now.deletePage({
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
  
  .mutation(async ({ ctx, input }) => {
    assertDevOnly();
    const caller = createResetCaller(ctx);

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
      await caller.schedule.now.deletePage({
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
# deploy with automatic aggregate backfill:
bunx better-convex deploy --prod
# aggregate index management:
bunx better-convex aggregate rebuild --prod
bunx better-convex aggregate backfill --prod
# bundle analysis:
bunx better-convex analyze
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
7. If auth enabled: `auth.config.ts`, `auth.ts`, `http.ts`, env sync complete.
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

## 13. Troubleshooting

See the [Troubleshooting Reference](#troubleshooting-reference) at the bottom of this document for the full symptom/cause/fix matrix.

## Coverage Matrix

Source coverage mapping used to build this runbook:

| Source                                               | Mapped In Setup                  |
| ---------------------------------------------------- | -------------------------------- |
| `www/content/docs/templates.mdx`                     | Sections 3, 4, 5, 6, 7, 8, 9, 11 |
| `www/content/docs/quickstart.mdx`                    | Sections 3, 4, 5, 12             |
| `www/content/docs/server/setup.mdx`                  | Section 5.3                      |
| `www/content/docs/auth/server.mdx`                   | Sections 6.1 - 6.10              |
| `www/content/docs/auth/client.mdx`                   | Section 7.1                      |
| `www/content/docs/auth/server.mdx#triggers`          | Section 6.3, 9.2                 |
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
| Core infra (`schema.ts`, `functions/generated/`, `crpc.ts`, `http.ts`)                                    | Sections 5, 6.6, 9.6            | `orm.md`, `http.md`                      |
| Shared contracts (`shared/api.ts`, `shared/auth-shared.ts`, `shared/polar-shared.ts`)                   | Sections 5.4, 6.3.2, 10.2, 10.3 | `auth-organizations.md`                  |
| Auth core (`auth.config.ts`, `auth.ts`)                                                                   | Section 6                       | `auth.md`                                |
| Auth plugins (`admin.ts`, `organization.ts`, `polar*`)                                                    | Section 10                      | `auth-admin.md`, `auth-organizations.md` |
| Feature modules (`user.ts`, `projects.ts`, `tags.ts`, `todoComments.ts`, `public.ts`, `items/queries.ts`) | Sections 5, 6.3.1, 9            | core `SKILL.md`, `orm.md`                |
| HTTP routers (`routers/health.ts`, `routers/todos.ts`, `routers/examples.ts`)                             | Section 9.6                     | `http.md`                                |
| Aggregates + rate limits (`aggregates.ts`, `lib/rate-limiter.ts`)                                         | Sections 9.3, 9.4               | `aggregates.md`, `orm.md`                |
| Scheduling + internals (`todoInternal.ts`, delayed jobs)                                                  | Sections 9.5, 11.1              | `scheduling.md`                          |
| Email + Resend (`functions/email.tsx`, `lib/emails/*`)                                                    | Section 9.7                     | `auth-organizations.md`                  |
| Dev bootstrap (`init.ts`, `seed.ts`, `reset.ts`)                                                          | Section 11.1                    | `testing.md` (for verification)          |
| Generated outputs (`functions/_generated/*`, `functions/generated/`, `shared/api.ts`)                     | Section 5.5                     | n/a (generated by CLI)                   |

## Troubleshooting Reference

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
| Sign-in fails on `/auth` (loop, no session, or immediate sign-out)                    | Auth route/env/provider wiring mismatch                                                         | Recheck Sections 6.5-6.7 (`authMiddleware`, route registration, env sync), verify provider credentials/URLs, then rerun Section 11.3                                                        |
| `UNAUTHORIZED` on protected procedures                                                | auth middleware not attaching `userId`                                                          | Ensure `getAuth(ctx)` + `getHeaders(ctx)` session lookup is in middleware                                                                                                                   |
| `ctx.orm` missing in handlers                                                         | Generated `initCRPC` not used                                                                  | Use `initCRPC` from `../functions/generated/server` — ORM context is pre-wired                                                                                                              |
| `Property 'insert'/'update' does not exist on type 'OrmReader'`                       | Using query context for mutations                                                               | Ensure mutation handlers use `publicMutation` / `protectedMutation` builders                                                                                                                 |
| `useCRPC must be used within CRPCProvider`                                            | Provider chain not mounted around route tree                                                    | Wrap app with `BetterConvexProvider` and verify `CRPCProvider` is inside QueryClientProvider (Section 7.4 / 8.A.4)                                                                          |
| Route auth cookies not set                                                            | Missing CORS auth headers                                                                       | Add `Better-Auth-Cookie` allow/expose headers + credentials                                                                                                                                 |
| TanStack Start auth helper import errors                                              | Using `better-convex/auth/nextjs` in Start app                                                  | Use TanStack Start exception with `@convex-dev/better-auth/*` helpers                                                                                                                       |
| `Returned promise will never resolve` from internal function                          | Trigger path is recursively querying/updating related rows or stale component wiring still runs | Isolate failing write with logs, disable/move trigger-side sync into explicit mutation helper, rerun `bunx better-convex dev --once --typecheck disable`, then retry bootstrap smoke checks |
| Better Auth secret mismatch/warnings in setup flows                                   | `BETTER_AUTH_SECRET` manually set inconsistently or low entropy                                 | Generate and sync via `bunx better-convex env sync --auth`; avoid manual secret setting unless explicitly needed                                                                            |
| `Invalid orderBy value. Use a column or asc()/desc()`                                 | Wrong `orderBy` shape (`[{ field, direction }]`)                                                | Use object form only, e.g. `orderBy: { updatedAt: "desc" }`                                                                                                                                 |
| `Invalid argument id for db.get` while testing `NOT_FOUND`                            | Fabricated Convex document ID                                                                   | Use real inserted IDs or non-ID lookup keys (slug/name/email) for not-found tests                                                                                                           |
| Trigger side effects too slow                                                         | Heavy sync work inside trigger                                                                  | Move heavy work to scheduled actions via `ctx.scheduler`                                                                                                                                    |
| Rate limiter no-op                                                                    | component not registered in `convex.config.ts`                                                  | Add `@convex-dev/rate-limiter` app component                                                                                                                                                |
| fallback `better-convex codegen` fails after disabling aggregates                     | Aggregate helper/import references still exist                                                  | Remove `app.use(aggregate...)`, `defineTriggers` aggregate handlers, and aggregate helper modules in the same change; prefer rerunning `better-convex dev --once`                           |
| Aggregate counts drift                                                                | trigger not registered in `defineTriggers`                                                      | Register `aggregate.trigger` in `defineTriggers` `change:` handler                                                                                                                          |
| Invite emails never send                                                              | `@convex-dev/resend` component not registered                                                   | Add `app.use(resend)` and wire `functions/email.tsx`                                                                                                                                        |
| Dev reset/seed commands do nothing                                                    | `init.ts`/`seed.ts`/`reset.ts` missing or not wired                                             | Add dev bootstrap functions and scripts from Section 11.1                                                                                                                                   |
