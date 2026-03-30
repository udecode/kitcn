---
"kitcn": minor
"@kitcn/resend": minor
---

## Breaking changes

- Use `kitcn` and `@kitcn/resend` as the published package names, CLI
  commands, import paths, generated comments, and scaffold output.

```ts
// Before
import { defineSchema } from "<previous package name>/orm";
import { sendEmail } from "<previous scoped plugin>/resend";

// After
import { defineSchema } from "kitcn/orm";
import { sendEmail } from "@kitcn/resend";
```

- Use `concave.json` as the kitcn config file. `kitcn.json`
  and `kitcn.config.ts` are not loaded.

```ts
// Before
export default {
  outputDir: "convex/shared",
};

// After
{
  "meta": {
    "kitcn": {
      "paths": {
        "shared": "convex/shared"
      }
    }
  }
}
```

- Use app-owned schema composition from the default export. Package schema
  plugin entrypoints are gone, and relations/triggers chain on
  `defineSchema(...)`.

```ts
// Before
import { defineRelations, defineSchema } from "kitcn/orm";
import { ratelimitPlugin } from "kitcn/plugins/ratelimit";

export const schema = defineSchema(tables, {
  plugins: [ratelimitPlugin()],
});

export const relations = defineRelations(tables, (r) => ({
  users: {
    posts: r.many.posts(),
  },
}));

// After
import { defineSchema } from "kitcn/orm";
import { ratelimitExtension } from "../lib/plugins/ratelimit/schema";

export default defineSchema(tables)
  .extend(ratelimitExtension())
  .relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
  }));
```

- Use `kitcn env push` and `kitcn env pull` for env sync.
  `env sync` is gone.

```bash
# Before
npx kitcn env sync --auth

# After
npx kitcn env push
```

- Use `kitcn/ratelimit` and `kitcn/ratelimit/react`. The old
  `kitcn/plugins/ratelimit*` surface is gone.

```ts
// Before
import { calculateRateLimit } from "kitcn/plugins/ratelimit";
import { useRateLimit } from "kitcn/plugins/ratelimit/react";

// After
import { calculateRatelimit } from "kitcn/ratelimit";
import { useRatelimit } from "kitcn/ratelimit/react";
```

## Features

- Add a registry-driven CLI with `init`, `add`, `view`, `info`, and `docs`,
  plus `--json`, dry-run, and diff output for scaffold changes.
- Add backend-aware CLI support for both Convex and Concave, including
  `concave.json`, local bootstrap wrappers, and `kitcn verify`.
- Add project-owned ORM migrations with generated `defineMigration(...)`
  helpers, migration manifests, docs, and `kitcn migrate`.
- Add starter scaffolds for Next.js and Vite, plus adoption flows for raw
  Convex and create-convex-style apps.
- Add packaged Convex skills and TanStack Intent metadata so installed apps
  carry their own agent guidance.
- Add auth scaffolding and schema sync that picks up plugin changes from
  `auth.ts`, keeps `jwks` wired on first install, and supports raw Convex
  auth adoption.
- Add `kitcn/auth/generated` and typed auth runtime helpers for
  generated auth files.
- Add `@kitcn/resend` with scaffolded schema, plugin, webhook, cron,
  and email helpers.
- Add app-owned schema extensions, typed plugin middleware helpers, and
  project-owned ratelimit scaffolding.
- Add `codegen.trimSegments`, `unionOf(...)`, and broader `objectOf(...)`
  support for generated runtimes and schema builders.

## Patches

- Improve local dev and codegen so env bootstrap, JWKS sync, watcher reruns,
  and supported-Node re-exec behave consistently in real apps.
- Improve `dev` and `verify` output so one-shot bootstrap stays readable while
  long-running dev still preserves raw Convex logs.
- Improve codegen failure handling so fatal parse errors keep the last good
  generated files instead of clobbering them with partial output.
- Fix relation pairing for aliased auth organization edges so generated
  runtimes recover cleanly in apps with multiple relations between the same
  tables.
- Fix TanStack Query/provider drift and generated runtime typing so local apps
  avoid duplicate React Query context failures and self-import cycles.
- Improve auth runtime behavior so local auth metadata routes stay quiet, state
  updates land immediately, and optional env values do not break auth analysis.
- Improve schema-only auth refresh so app-owned `schema.ts` files merge missing
  compatible auth fields, indexes, and relations, then stop on real conflicts
  with manual-action guidance.
- Keep internal example and scenario typechecks pointed at workspace source so
  fresh CI runs do not depend on stale built package output after package
  renames.
- Fix ratelimit storage and generated scaffolds so apps use the real
  ratelimit tables instead of failing with bogus missing-table guidance.
- Keep scaffolded apps on the tested Hono and TanStack Query baselines across
  the example app, generated fixtures, and prepared scenarios.
