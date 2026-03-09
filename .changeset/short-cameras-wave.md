---
"better-convex": minor
"@better-convex/resend": minor
---

## Breaking changes

- Replace standalone plugin drift/inventory commands with plan-driven plugin inspection. Use `better-convex add <plugin> --dry-run|--diff [path]|--view [path]`, `better-convex view <plugin>`, `better-convex info`, and `better-convex docs <topic...>`. `better-convex diff` and `better-convex list` are gone.

```bash
# Before
npx better-convex diff resend --verbose-diff
npx better-convex list --json

# After
npx better-convex add resend --diff convex/plugins/resend.ts
npx better-convex view resend --json
npx better-convex info --json
```

- Use `concave.json` as the only Better Convex config source. Legacy `better-convex.json` and `better-convex.config.ts` are not loaded. Removed config keys include top-level `outputDir`, `meta["better-convex"].plugins`, `meta["better-convex"].api`, `meta["better-convex"].auth`, and plugin scaffold hooks outside `hooks.postAdd`. `paths.lib` and `paths.shared` resolve from project root.

```ts
// Before
// better-convex.config.ts
export default {
  outputDir: 'convex/shared',
  plugins: {
    afterScaffold: ['bun run format'],
  },
};

// After
// concave.json
{
  "meta": {
    "better-convex": {
      "paths": {
        "shared": "convex/shared",
        "lib": "convex/lib"
      },
      "hooks": {
        "postAdd": ["bun run format"]
      },
      "codegen": {
        "scope": "all",
        "trimSegments": ["generated"]
      }
    }
  }
}
```

- Use `better-convex init` as the baseline bootstrap, `better-convex init -t next` for the shadcn-backed Next.js path, and let `better-convex add <plugin>` bootstrap missing Better Convex baseline files before applying plugin scaffolds. Init also runs the first Better Convex runtime generation pass, retries real codegen with anonymous local bootstrap or explicit `--team/--project` bootstrap when needed, and only falls back to a stubbed runtime for plain non-template init when real codegen stays unavailable. Template verification validates a fresh generated app with install, lint, typecheck, and build before it compares the normalized fixture snapshot.

- Select the backend explicitly with `meta["better-convex"].backend` in `concave.json` or `--backend <convex|concave>`. Better Convex now routes `init`, `dev`, `codegen`, `deploy`, `migrate`, `aggregate`, `reset`, and unknown passthrough commands through the selected backend CLI. `tooling/template-next.ts` uses `--backend concave` for repo sync/check, and raw `better-convex env ...` passthrough stays Convex-only because Concave has no upstream env command.
- Use `concave codegen --static` for the Concave template-init lane. Repo template sync/check keeps the public scaffold contract but avoids Concave runtime-analysis flakiness in that path.

```bash
# Before
bunx create-next-app@latest my-app
cd my-app
bunx better-convex add resend

# After
bunx better-convex init -t next
bunx better-convex add resend
```

- Add a Better Convex codegen script to template-mode init scaffolds. The Next scaffold uses `codegen` when free, and falls back to `convex:codegen` when an app already owns `codegen`.

- Author schema with chained composition and app-owned local extensions. First-party plugin schema entrypoints are gone, and `defineSchemaRelations(...)` is gone.

```ts
// Before
import { defineSchema, defineSchemaRelations } from "better-convex/orm";
import { resendPlugin } from "@better-convex/resend/schema";

export default defineSchema(tables, {
  plugins: [resendPlugin()],
  relations: defineSchemaRelations<typeof tables>()({
    users: (r) => ({
      posts: r.many.posts(),
    }),
  }),
});

// After
import { defineSchema } from "better-convex/orm";
import { resendExtension } from "../lib/plugins/resend/schema";

export default defineSchema(tables)
  .extend(resendExtension())
  .relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
  }));
```

- Change schema extension authoring to `defineSchemaExtension('<key>', tables)` with chained `relations(...)` and `triggers(...)`.

```ts
// Before
import { defineSchemaExtension } from "better-convex/orm";

export const resendExtension = defineSchemaExtension("resend", {
  tables: { resendEmails },
});

// After
import { defineSchemaExtension } from "better-convex/orm";

export const resendExtension = defineSchemaExtension("resend", {
  resendEmails,
}).relations((r) => ({
  resendEmails: {
    deliveryEvents: r.many.resendDeliveryEvents(),
  },
}));
```

- Use schema exports directly with `createOrm(...)`. App wiring no longer needs a separate `triggers` argument or a pre-resolved relations object.

```ts
// Before
const relations = requireSchemaRelations(schema);
const triggers = getSchemaTriggers(schema);
const orm = createOrm({
  schema: relations,
  triggers,
  ormFunctions,
});

// After
const orm = createOrm({
  schema,
  ormFunctions,
});
```

- Rename runtime plugin authoring helpers in `better-convex/plugins`, and keep `@better-convex/resend` focused on the runtime plugin plus stable helpers. Resend internals and schema are scaffold-owned, and package-level runtime helpers like `buildResendHandlers` / `createResend*` are gone.

```ts
// Before
import {
  definePluginMiddleware,
  type PluginMiddleware,
  resolvePluginMiddlewareOptions,
} from "better-convex/plugins";
import { buildResendHandlers } from "@better-convex/resend";

// After
import {
  definePlugin,
  type Plugin,
  resolvePluginOptions,
} from "better-convex/plugins";
import { ResendPlugin } from "@better-convex/resend";
import { createResendCaller } from "./generated/plugins/resend.runtime";
```

- Expose plugin runtime surfaces at `ctx.api.<plugin>`, define runtime plugins with `definePlugin('<key>', provide)`, and extend plugin middleware with `.extend(({ middleware }) => ({ middleware: ..., namedPreset: ... }))`. Package-specific resolver helpers like `resolveResendOptions(...)` are gone.

```ts
// Before
export const ResendPlugin = definePlugin("resend", ({ options }) => ({
  options: {
    apiKey: options?.apiKey ?? process.env.RESEND_API_KEY ?? "",
    webhookSecret:
      options?.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET ?? "",
  },
}));

const secret = ctx.plugins.resend.options.webhookSecret;

// After
export const ResendPlugin = definePlugin("resend", ({ options }) => ({
  apiKey: options?.apiKey ?? "",
  webhookSecret: options?.webhookSecret ?? "",
  initialBackoffMs: options?.initialBackoffMs ?? 30_000,
  retryAttempts: options?.retryAttempts ?? 5,
  testMode: options?.testMode ?? true,
}));

const secret = ctx.api.resend.webhookSecret;
```

- Rename `ResendResolvedOptions` to `ResendApi`.

```ts
// Before
import type { ResendOptions, ResendResolvedOptions } from "@better-convex/resend";

type Api = ResendResolvedOptions;

// After
import type { ResendApi, ResendOptions } from "@better-convex/resend";

type Api = ResendApi;
```

- Move Resend webhook verification onto `ctx.api.resend.verifyWebhookEvent(req)` and scaffold webhook routes as plain exported procedures. `verifyResendWebhookEvent(...)` and `registerResendWebhook(http)` are gone from the public path.

```ts
// Before
import { verifyResendWebhookEvent } from "@better-convex/resend";
import { registerResendWebhook } from "../lib/plugins/resend/webhook";

const event = await verifyResendWebhookEvent(req, ctx.api.resend.webhookSecret);
registerResendWebhook(http);

// After
const event = await ctx.api.resend.verifyWebhookEvent(req);

export const httpRouter = router({
  resendWebhook,
});
```

- Rename the exposed ratelimit API to `Ratelimit*` / `ratelimit` casing.

```ts
// Before
import { RateLimit, RateLimitPlugin } from "better-convex/ratelimit";
import { useRateLimit } from "better-convex/ratelimit/react";

type RateLimitBucket = "default";

const ratelimit = RateLimitPlugin.configure({
  getBucket: ({ meta }) => meta.rateLimit ?? "default",
});

const snapshot = useRateLimit("ratelimit/getRatelimit", { count: 1 });

// After
import { Ratelimit, RatelimitPlugin } from "better-convex/ratelimit";
import { useRatelimit } from "better-convex/ratelimit/react";

type RatelimitBucket = "default";

const ratelimit = RatelimitPlugin.configure({
  getBucket: ({ meta }) => meta.ratelimit ?? "default",
});

const snapshot = useRatelimit("ratelimit/getRatelimit", { count: 1 });
```

## Features

- Add plan-driven plugin UX across `add`, `view`, and `info`, with one shared install plan covering scaffold files, env bootstrap, `concave.json`, schema registration, `plugins.lock.json`, dependency install status, codegen/hooks, env reminders, and stable JSON output.
- Add shadcn-style CLI presentation for plugin plan commands with colorized dry-run summaries, focused `--diff` / `--view` output, shared logger/highlighter utilities, and command/module file structure under `src/cli/commands/*` and `src/cli/utils/*`.
- Add plugin docs metadata plus `better-convex docs <topic...>` for local and public docs links.
- Add app-owned resend and ratelimit schema scaffolds under `convex/lib/plugins/<plugin>/schema.ts`, with plan-driven CLI add/view/info flows that register and track them like any other scaffold file.
- Add a real ratelimit starter scaffold at `convex/lib/plugins/ratelimit/plugin.ts`, with default `public` / `free` / `premium` buckets, typed `RatelimitBucket` overrides, plugin-owned middleware, and `schema-only` support that skips the runtime file cleanly.
- Add plugin authoring support for `.extend(({ middleware }) => ({ middleware: () => middleware().pipe(...), ...namedPresets }))`, with middleware overrides and named middleware methods preserved through `.configure(...)`.

## Patches

- Use `getEnv()` in scaffolded Convex plugin files and email templates consistently. `better-convex add <plugin>` always bootstraps `${paths.lib}/get-env.ts` when needed instead of generating `process.env` fallbacks.
- Add scaffold-owned resend runtime files that reuse project cRPC builders, generated callers, and local plugin hooks instead of creating local `initCRPC.create()` instances or using `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` directly.
- Add a default resend email scaffold and React Email dependency hints for `better-convex add resend`.
- Add env bootstrap to `better-convex add <plugin>`: if `paths.env` is missing, scaffold `get-env.ts`, write `paths.env` into `concave.json`, merge plugin env fields into the env schema, and print plugin-defined reminders for values that still need to be set in `<functionsDir>/.env`.
- Make resend config app-owned: scaffolded plugin config reads resend env from `getEnv()`, package runtime no longer falls back to `process.env`, scaffolded resend env schema keeps `RESEND_API_KEY` optional for local dev flow, and resend function templates drop the manual send-time API key guard.
- Add `codegen.trimSegments` and keep `plugins` trimmed from generated runtime export names by default.
- Add builder-only `unionOf(...)` and wider `objectOf(...)` support so schema code can stay off raw `v.*` for mixed scalar unions and homogeneous object values.

- Fail fast when plugin plan commands run without `<functionsDir>/schema.ts`.
- Ignore formatter-only drift in `.ts`, `.tsx`, `.js`, `.jsx`, and `.json` plugin preview/apply comparisons so `add --dry-run`, `--diff`, `view`, and `info` only surface meaningful scaffold changes.
- Fix `createEnv(...)` during codegen/auth-config analysis so missing optional env vars do not get treated as required.
- Fix generated schedule caller types so `schedule.now`, `schedule.after`, and `schedule.at` return `GenericId<'_scheduled_functions'>`, and `schedule.cancel(...)` requires the same id type.
- Fix resend scaffold queries to typecheck against the current ORM query API.
- Improve schema extension typing and IntelliSense so extension tables, extension relations, and chained app relations flow through generated data models and `getSchemaRelations(schema)` correctly.
- Improve schema composition validation so duplicate relation fields and duplicate trigger hooks fail fast.
- Use camelCase ratelimit schema keys in scaffolded app code while keeping the underlying Convex storage table names unchanged.
## Improvements

- `better-convex init -t next --yes` now uses a pinned shadcn bootstrap, resolves `--cwd` + `--name` into the real app directory before applying the Better Convex overlay, and emits the first real generated runtime instead of relying on a fixture-only handwritten `generated/server.ts`.

- `better-convex init -t next --yes` now keeps shadcn as the source of truth for the app shell and Next config files, adds the Better Convex client core directly (`.env.local`, `components/providers.tsx`, `lib/convex/{query-client,crpc,convex-provider,server,rsc}`), patches `layout.tsx` minimally to mount `Providers`, patches `tsconfig.json` to add `@convex/*`, and only adjusts `components.json` when the resolved app root requires a different `tailwind.css` path. Template init still infers `src/` vs root layouts and fails fast on ambiguous mixed roots.
- The committed `templates/next` fixture now preserves the real scaffold dependency versions, only applies repo-local normalization (`better-convex` -> `workspace:*`, fixture package name, volatile file stripping), and fails drift checks if template init ever falls back to a stubbed runtime.
