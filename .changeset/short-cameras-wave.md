---
"better-convex": minor
"@better-convex/resend": minor
---

## Breaking changes

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

- Add app-owned resend and ratelimit schema scaffolds under `convex/lib/plugins/<plugin>/schema.ts`, with CLI add/diff/list flows that register and track them like any other scaffold file.
- Add a real ratelimit starter scaffold at `convex/lib/plugins/ratelimit/plugin.ts`, with default `public` / `free` / `premium` buckets, typed `RatelimitBucket` overrides, plugin-owned middleware, and `schema-only` support that skips the runtime file cleanly.
- Add plugin authoring support for `.extend(({ middleware }) => ({ middleware: () => middleware().pipe(...), ...namedPresets }))`, with middleware overrides and named middleware methods preserved through `.configure(...)`.
- Add scaffold-owned resend runtime files that reuse project cRPC builders, generated callers, and local plugin hooks instead of creating local `initCRPC.create()` instances or using `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` directly.
- Add a default resend email scaffold and React Email dependency hints for `better-convex add resend`.
- Add env bootstrap to `better-convex add <plugin>`: if `paths.env` is missing, scaffold `get-env.ts`, write `paths.env` into `concave.json`, merge plugin env fields into the env schema, and print plugin-defined reminders for values that still need to be set in `<functionsDir>/.env`.
- Make resend config app-owned: scaffolded plugin config reads resend env from `getEnv()`, package runtime no longer falls back to `process.env`, scaffolded resend env schema keeps `RESEND_API_KEY` optional for local dev flow, and resend function templates drop the manual send-time API key guard.
- Add `codegen.trimSegments` and keep `plugins` trimmed from generated runtime export names by default.
- Add builder-only `unionOf(...)` and wider `objectOf(...)` support so schema code can stay off raw `v.*` for mixed scalar unions and homogeneous object values.

## Patches

- Fix `createEnv(...)` during codegen/auth-config analysis so missing optional env vars do not get treated as required.
- Fix generated schedule caller types so `schedule.now`, `schedule.after`, and `schedule.at` return `GenericId<'_scheduled_functions'>`, and `schedule.cancel(...)` requires the same id type.
- Fix resend scaffold queries to typecheck against the current ORM query API.
- Improve schema extension typing and IntelliSense so extension tables, extension relations, and chained app relations flow through generated data models and `getSchemaRelations(schema)` correctly.
- Improve schema composition validation so duplicate relation fields and duplicate trigger hooks fail fast.
- Use camelCase ratelimit schema keys in scaffolded app code while keeping the underlying Convex storage table names unchanged.
- Enforce `paths.env` in scaffold generation by rejecting resolved scaffold files that still read `process.env` directly.
