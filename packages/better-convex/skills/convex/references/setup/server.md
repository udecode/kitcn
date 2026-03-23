## 5. Core Backend

For production bootstrap, start in the CLI Registry: use `bunx better-convex init -t <next|vite> --yes` for a fresh app, `bunx better-convex init --yes` to adopt the current app, and `bunx better-convex add <plugin>` for feature layers. This file is the manual backend wiring reference.

### 5.1 Define schema and relations

**Create:** `convex/functions/schema.ts`

```ts
import {
  boolean,
  convexTable,
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

export default defineSchema(tables, {
  strict: false,
}).relations((r) => ({
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
`convex/functions/generated/` directory is generated and is the canonical server contract.
It includes `initCRPC` (from `generated/server`) and ORM helpers when schema relations metadata exists.
If you are not using codegen, use manual `initCRPC` from `better-convex/server` with `.dataModel()` and optional `.context()`.

Why this shape:

1. `orm.with(ctx)` preserves query vs mutation capabilities in type space.
2. It avoids common setup-time type failures like missing `insert`/`update` on `ctx.orm` in mutation handlers.

### 5.3 Initialize cRPC and procedure builders

**Create:** `convex/lib/crpc.ts`

```ts
import { initCRPC } from "../functions/generated/server";

const c = initCRPC
  .meta<{
    // Reserved for auth phase; do not implement auth logic yet.
    auth?: "optional" | "required";
    role?: "admin";
    ratelimit?: string;
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
It is generated by `better-convex dev`.

Generated exports include:

1. `api` (typed procedure leaves + metadata)
2. `Api`, `ApiInputs`, `ApiOutputs`
3. `TableName`, `Select`, `Insert` (when `schema.ts` exports `tables`)

Consume these from `@convex/api` on app/client side.
Within Convex backend files, import server context/ORM helpers from `../functions/generated/server`.

### 5.5 Start dev/codegen

Run:

```bash
bunx better-convex dev
```

If this requires interactive Convex setup, run `bunx convex init` first, then continue.
Do not fake generated files.

Automation/non-interactive path:

1. Export `CONVEX_AGENT_MODE=anonymous` when you want local anonymous setup.
2. Run `bunx convex init`.
3. Run `bunx better-convex dev --once --typecheck disable`.
4. Confirm the generated runtime exists in `convex/functions/generated/server.ts`.
5. Then run `bunx better-convex dev` for ongoing codegen/API refresh.

Local deployment storage: New local and anonymous deployments store state under `.convex/` in the project root.

This generates:

- `convex/functions/_generated/*`
- `convex/functions/generated/` directory
- `convex/shared/api.ts`

Agent command policy:

1. Default to `bunx better-convex dev` (or one-shot `bunx better-convex dev --once --typecheck disable`).
2. `better-convex dev` already runs codegen/API generation.
3. Do not run `bunx better-convex codegen` as a separate default step.
4. Use manual `bunx better-convex codegen` only as fallback when `better-convex dev` cannot be run and backend is already active.
5. Use `bunx better-convex insights` for cloud-deployment debugging; it forwards to the upstream Convex insights CLI.

One-time codegen (optional; use only when `better-convex dev` is not running):

```bash
bunx better-convex codegen
```

Codegen runtime rule:

1. `better-convex codegen` still requires a configured Convex deployment.
2. If you see deployment/bootstrap errors, run `bunx convex init` first.
3. If you see `Local backend isn't running`, use `bunx better-convex dev --once --typecheck disable` instead of hand-holding a second terminal.

### 5.6 Import rules (hard requirement)

Never use lazy imports (`await import(...)`) in Convex code.

Rules:

1. Convex files (`convex/functions/**`, `convex/lib/**`, `convex/routers/**`) must use static imports only.
2. If generated modules are missing (`_generated/*`, `@convex/api`), stop and run `bunx better-convex dev` first.
3. Do not work around missing generated files with dynamic imports.

## 9. Optional Modules Setup (Feature Gates)

Enable only selected modules.

### 9.0 Component composition rule (`convex/functions/convex.config.ts`)

When components are enabled, register them in one `defineApp()` file:

```ts
import { defineApp } from "convex/server";
import myComponent from "some-component/convex.config";

const app = defineApp();

app.use(myComponent);

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
import { convexTable, defineTriggers, text } from "better-convex/orm";

const triggers = defineTriggers(relations, {
  post: {
    change: async (change, ctx) => {
      if (change.operation === "delete") return;
      // side effects here
    },
  },
});
```

Trigger guardrails:

1. Keep trigger work bounded and idempotent.
2. Avoid trigger chains that re-query/rewrite the same hot table rows during seed/init flows.
3. If `internal.seed.seed` or `internal.init.default` hangs, move counter/invariant sync into explicit mutation helpers and seed reconciliation.

### 9.3 Aggregates gate

Declare `aggregateIndex` and/or `rankIndex` in table definitions. Backfill runs automatically via `better-convex dev`.

```ts
// convex/functions/schema.ts
const postLikes = convexTable(
  "postLikes",
  { postId: text().notNull(), userId: text().notNull() },
  (t) => [aggregateIndex("by_post").on(t.postId)]
);

const scores = convexTable(
  "scores",
  { gameId: text().notNull(), score: integer().notNull() },
  (t) => [
    rankIndex("leaderboard")
      .partitionBy(t.gameId)
      .orderBy({ column: t.score, direction: "desc" }),
  ]
);
```

No trigger wiring needed — `aggregateIndex` and `rankIndex` are maintained automatically by the ORM.

If Aggregates are **disabled**, remove `aggregateIndex`/`rankIndex` declarations from table definitions and re-run `bunx better-convex dev --once --typecheck disable`.

### 9.4 Rate limiting gate

Use the built-in package module (no component registration):

```bash
bun add better-convex
```

`aggregateExtension` and `migrationExtension` are builtin in `defineSchema`.
Rate limiting is opt-in: scaffold the full starter once.

```bash
bunx better-convex add ratelimit
```

This creates `convex/lib/plugins/ratelimit/schema.ts`, `convex/lib/plugins/ratelimit/plugin.ts`, and registers `ratelimitExtension()` in `convex/functions/schema.ts`.

```ts
import { defineSchema } from "better-convex/orm";
import { ratelimitExtension } from "../lib/plugins/ratelimit/schema";

export default defineSchema(tables).extend(ratelimitExtension());
```

Create `convex/lib/plugins/ratelimit/plugin.ts` and call `ratelimit.middleware()` from mutation builders. Use the default bucket for normal writes and reserve `.meta({ ratelimit: ... })` for named overrides.

Use `RatelimitPlugin` from `better-convex/ratelimit`:

```ts
import { getSessionNetworkSignals } from "better-convex/auth";
import { MINUTE, Ratelimit, RatelimitPlugin } from "better-convex/ratelimit";
import type { MutationCtx } from "../../../functions/generated/server";
import type { Select } from "../../../shared/api";

const fixed = (rate: number) => Ratelimit.fixedWindow(rate, MINUTE);

export const ratelimitBuckets = {
  default: {
    public: fixed(30),
    free: fixed(60),
    premium: fixed(200),
  },
} as const;

type RatelimitTier = keyof (typeof ratelimitBuckets)["default"];
export type RatelimitBucket = keyof typeof ratelimitBuckets;

type RatelimitUser = {
  id: string;
  isAdmin?: boolean;
  plan?: "premium" | "team" | null;
  session?: Select<"session"> | null;
};

type RatelimitCtx = MutationCtx & {
  user?: RatelimitUser | null;
};

type RatelimitMeta = {
  ratelimit?: RatelimitBucket;
};

export function getUserTier(user: RatelimitUser | null): RatelimitTier {
  if (!user) return "public";
  if (user.isAdmin || user.plan) return "premium";
  return "free";
}

export const ratelimit = RatelimitPlugin.configure({
  buckets: ratelimitBuckets,
  getBucket: ({ meta }: { meta: RatelimitMeta }) => meta.ratelimit ?? "default",
  getUser: ({ ctx }: { ctx: RatelimitCtx }) => ctx.user ?? null,
  getIdentifier: ({ user }: { user: RatelimitUser | null }) =>
    user?.id ?? "anonymous",
  getTier: getUserTier,
  getSignals: ({
    ctx,
    user,
  }: {
    ctx: RatelimitCtx;
    user: RatelimitUser | null;
  }) => getSessionNetworkSignals(ctx, user?.session ?? null),
  prefix: ({ bucket, tier }) => `ratelimit:${bucket}:${tier}`,
  failureMode: "closed",
  enableProtection: true,
  denyListThreshold: 30,
});
```

### 9.5 Scheduling gate

Create `convex/functions/crons.ts` with `cronJobs()` and use `caller.schedule.now/after/at` in mutations/actions for delayed procedure jobs (`ctx.scheduler.*` only for raw `internal.*` functions).

### 9.6 HTTP router gate

If REST endpoints are needed, add cRPC route builders and register routers in `convex/functions/http.ts`; consume via `crpc.http.*` client proxies.

### 9.7 Email + Resend gate

Install packages:

```bash
bun add @better-convex/resend
```

`better-convex add resend` scaffolds `convex/lib/plugins/resend/schema.ts` and registers `resendExtension()` in `convex/functions/schema.ts`.

If `paths.env` is missing, the add flow also bootstraps `convex/lib/get-env.ts`, writes `paths.env` into `concave.json`, and adds resend env fields there. The schema keeps `RESEND_API_KEY` optional for local dev flow, and the add command reminds you to set it in `convex/.env` before sending email. Webhook secret and default sender stay optional.

```ts
import { resendExtension } from "../lib/plugins/resend/schema";

export default defineSchema(tables).extend(resendExtension());
```

Scaffold resend runtime + helpers:

```bash
bunx better-convex add resend
```

Recommended files for this gate:

- `convex/functions/plugins/resend.ts`
- `convex/functions/plugins/email.tsx`
- `convex/lib/plugins/resend/plugin.ts`
- `convex/lib/plugins/resend/webhook.ts`
- `convex/lib/plugins/resend/crons.ts`

If `plugins/email.tsx` is selected, install React Email deps:

```bash
bun add @react-email/components @react-email/render react-email react react-dom
```
