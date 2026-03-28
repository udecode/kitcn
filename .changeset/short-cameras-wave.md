---
"better-convex": minor
"@better-convex/resend": minor
---

## Breaking changes

- Use `concave.json` as the Better Convex config file. `better-convex.json`
  and `better-convex.config.ts` are not loaded.

```ts
// Before
export default {
  outputDir: "convex/shared",
};

// After
{
  "meta": {
    "better-convex": {
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
import { defineRelations, defineSchema } from "better-convex/orm";
import { ratelimitPlugin } from "better-convex/plugins/ratelimit";

export const schema = defineSchema(tables, {
  plugins: [ratelimitPlugin()],
});

export const relations = defineRelations(tables, (r) => ({
  users: {
    posts: r.many.posts(),
  },
}));

// After
import { defineSchema } from "better-convex/orm";
import { ratelimitExtension } from "../lib/plugins/ratelimit/schema";

export default defineSchema(tables)
  .extend(ratelimitExtension())
  .relations((r) => ({
    users: {
      posts: r.many.posts(),
    },
  }));
```

- Use `better-convex env push` and `better-convex env pull` for env sync.
  `env sync` is gone.

```bash
# Before
npx better-convex env sync --auth

# After
npx better-convex env push
```

- Use `better-convex/ratelimit` and `better-convex/ratelimit/react`. The old
  `better-convex/plugins/ratelimit*` surface is gone.

```ts
// Before
import { calculateRateLimit } from "better-convex/plugins/ratelimit";
import { useRateLimit } from "better-convex/plugins/ratelimit/react";

// After
import { calculateRatelimit } from "better-convex/ratelimit";
import { useRatelimit } from "better-convex/ratelimit/react";
```

## Features

- Add a registry-driven CLI with `init`, `add`, `view`, `info`, and `docs`,
  plus `--json`, dry-run, and diff output for scaffold changes.
- Add backend-aware CLI support for both Convex and Concave, including
  `concave.json`, local bootstrap wrappers, and `better-convex verify`.
- Add project-owned ORM migrations with generated `defineMigration(...)`
  helpers, migration manifests, docs, and `better-convex migrate`.
- Add starter scaffolds for Next.js and Vite, plus adoption flows for raw
  Convex and create-convex-style apps.
- Add packaged Convex skills and TanStack Intent metadata so installed apps
  carry their own agent guidance.
- Add auth scaffolding and schema sync that picks up plugin changes from
  `auth.ts`, keeps `jwks` wired on first install, and supports both Better
  Convex and raw Convex auth adoption.
- Add `better-convex/auth/generated` and typed auth runtime helpers for
  generated auth files.
- Add `@better-convex/resend` with scaffolded schema, plugin, webhook, cron,
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
- Fix ratelimit storage and generated scaffolds so apps use the real
  ratelimit tables instead of failing with bogus missing-table guidance.
- Keep scaffolded apps on the tested Hono and TanStack Query baselines across
  the example app, generated fixtures, and prepared scenarios.
