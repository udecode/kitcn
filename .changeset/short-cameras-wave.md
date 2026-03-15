---
"better-convex": minor
"@better-convex/resend": minor
---

## Breaking changes

- Replace standalone plugin drift and inventory commands with plan-driven
  inspection. Use `better-convex add <plugin> --dry-run|--diff [path]|--view [path]`,
  `better-convex view <plugin>`, `better-convex info`, and
  `better-convex docs <topic...>`. `better-convex diff` and
  `better-convex list` are gone.

```bash
# Before
npx better-convex diff resend --verbose-diff
npx better-convex list --json

# After
npx better-convex add resend --diff convex/plugins/resend.ts
npx better-convex view resend --json
npx better-convex info --json
```

- Use `concave.json` as the only Better Convex config source. Legacy
  `better-convex.json` and `better-convex.config.ts` are not loaded.
  Removed config keys include top-level `outputDir`,
  `meta["better-convex"].plugins`, `meta["better-convex"].api`,
  `meta["better-convex"].auth`, and plugin scaffold hooks outside
  `hooks.postAdd`.

```ts
// Before
// better-convex.config.ts
export default {
  outputDir: "convex/shared",
  plugins: {
    afterScaffold: ["bun run format"],
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

- Replace package-provided schema plugins with chained app-owned extensions.
  Opt-in schema plugin entrypoints are gone.

```ts
// Before
import { defineSchema } from "better-convex/orm";
import { ratelimitPlugin } from "better-convex/plugins/ratelimit";

export default defineSchema(tables, {
  plugins: [ratelimitPlugin()],
});

// After
import { defineSchema } from "better-convex/orm";
import { ratelimitExtension } from "../lib/plugins/ratelimit/schema";

export default defineSchema(tables).extend(ratelimitExtension());
```

- Move root schema relations into `defineSchema(...).relations(...)` instead of
  a separate `defineRelations(...)` export.

```ts
// Before
import { defineRelations, defineSchema } from "better-convex/orm";

export const schema = defineSchema(tables);

export const relations = defineRelations(tables, (r) => ({
  users: {
    posts: r.many.posts(),
  },
}));

// After
import { defineSchema } from "better-convex/orm";

export default defineSchema(tables).relations((r) => ({
  users: {
    posts: r.many.posts(),
  },
}));
```

- Use schema exports directly with `createOrm(...)`. App wiring no longer needs
  a separate `triggers` argument.

```ts
// Before
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

- Replace `better-convex env sync` with first-class `env push` / `env pull`
  commands, and use owned `env set|get|list|remove` wrappers for the rest of
  the Convex env surface.

```bash
# Before
npx better-convex env sync --auth
npx better-convex env sync --auth --rotate

# After
npx better-convex env push --auth
npx better-convex env push --auth --rotate
```

- Rename and relocate the public ratelimit surface to
  `better-convex/ratelimit` with `Ratelimit*` / `ratelimit` casing.

```ts
// Before
import { calculateRateLimit } from "better-convex/plugins/ratelimit";
import { useRateLimit } from "better-convex/plugins/ratelimit/react";

type ProcedureMeta = {
  rateLimit?: string;
};

// After
import { calculateRatelimit } from "better-convex/ratelimit";
import { useRatelimit } from "better-convex/ratelimit/react";

type ProcedureMeta = {
  ratelimit?: string;
};
```

## Features

- Add packaged Convex agent skills plus TanStack Intent metadata and shim files
  so `better-convex` can be discovered from installed npm packages by agent
  tooling.
- Split scaffolding into `better-convex create` for fresh starter apps and
  `better-convex init` for in-place adoption, with `create` owning
  `--template`, `--cwd`, `--name`, `--defaults`, and `--yes`.
- Add plan-driven plugin UX across `add`, `view`, and `info`, with one shared
  install plan covering scaffold files, root-schema validation, env bootstrap,
  `concave.json`, schema registration, `plugins.lock.json`, dependency install
  status, codegen/hooks, env reminders, stable JSON output, and
  formatter-insensitive preview/diff output.
- Add plugin docs metadata plus `better-convex docs <topic...>` for local and
  public docs links.
- Add app-owned resend and ratelimit scaffolds that register like any other
  scaffolded file, bootstrap `get-env.ts` + `paths.env`, and keep generated
  config in app code.
- Add `better-convex/plugins` authoring helpers with `definePlugin`,
  `resolvePluginOptions`, and `.extend(...)` preset composition.
- Add `@better-convex/resend` with `ResendPlugin`, typed `ctx.api.resend`
  runtime access, scaffolded webhook verification helpers, project-owned
  runtime/config files, and an optional React Email starter.
- Add `defineSchemaExtension("<key>", tables)` with chained `relations(...)`
  and `triggers(...)` for app-owned extension tables, typed
  `getSchemaRelations(schema)` access, and composition validation.
- Add a ratelimit scaffold with default `public`, `free`, and
  `premium` buckets, typed bucket overrides, plugin-owned middleware,
  `schema-only` support, and camelCase app schema keys over unchanged storage
  tables.
- Add plugin authoring support for
  `.extend(({ middleware }) => ({ middleware: ..., namedPreset: ... }))`
  without dropping configured middleware methods.
- Add `codegen.trimSegments` to keep generated runtime export names stable by
  default.
- Add builder-only `unionOf(...)` and wider `objectOf(...)` support so schema
  code can stay on ORM builders for mixed scalar unions and homogeneous object
  values.
- Add concrete starter templates through `better-convex create -t next` and
  `better-convex create -t vite`.
- Add `better-convex add auth` as the first auth bundle on top of the init
  baseline, scaffolding Better Auth server/client files, auth-aware provider
  wiring, auth env fields through `get-env`, auth cRPC families, and a minimal
  `/auth` page.
- Add `meta["better-convex"].dev.preRun`, run `convex init` automatically
  before Convex-backed `create`, `init`, and `dev`, and batch auth/env pushes
  through `better-convex env push --auth --rotate`.
- Support Convex 1.33 across the package, starter templates, example app, and
  scenario fixtures, and bump the minimum supported Convex peer dependency to
  `>=1.33`.

## Patches

- Fix generated placeholder runtime files so the temporary CommonJS `require`
  shims no longer trip ESLint before full codegen output exists.
- Fix `createEnv(...)` during codegen and auth-config analysis so missing
  optional env vars do not get treated as required.
- Fix generated schedule caller types so `schedule.now`, `schedule.after`, and
  `schedule.at` return `GenericId<'_scheduled_functions'>`, and
  `schedule.cancel(...)` requires the same id type.
- Fix gitignore bootstrap so Better Convex adds both `.convex/` and
  `.concave/` entries during init/dev flows.
