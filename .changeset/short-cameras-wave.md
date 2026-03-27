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

- Use `better-convex init` as the scaffold and adoption entrypoint. The old
  `create` flow is gone.

```bash
# Before
npx better-convex create -t next --yes

# After
npx better-convex init -t next --yes
```

- Use plan-driven plugin commands. `better-convex diff` and
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

- Use app-owned schema composition. Package-provided schema plugin entrypoints
  are gone, root relations move into `defineSchema(...).relations(...)`, and
  `createOrm(...)` reads the schema export directly.

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

- Use `better-convex env push` / `env pull` and the owned env wrappers. `env sync`
  and the old auth-specific flag flow are gone.

```bash
# Before
npx better-convex env sync --auth

# After
npx better-convex env push
```

- Use the new ratelimit surface under `better-convex/ratelimit`. The old
  `better-convex/plugins/ratelimit` import path is gone.

```ts
// Before
import { calculateRateLimit } from "better-convex/plugins/ratelimit";
import { useRateLimit } from "better-convex/plugins/ratelimit/react";

// After
import { calculateRatelimit } from "better-convex/ratelimit";
import { useRatelimit } from "better-convex/ratelimit/react";
```

## Features

- Add a full CLI registry flow with `init`, `add`, `view`, `info`, and `docs`,
  plus deterministic dry-run and diff output for plugin installs.
- Add first-class starter templates for Next.js and Vite, scenario fixtures,
  fixture sync/check tooling, and runtime verification lanes for prepared apps.
- Add `better-convex verify` for one-shot local runtime proof and make local
  bootstrap flows agent-friendly.
- Add packaged Convex skills and TanStack Intent metadata so installed
  `better-convex` packages carry their own agent guidance.
- Add scaffolded auth adoption for both the Better Convex baseline and raw
  Convex apps, including `add auth --only schema --yes` for schema-only auth
  refresh.
- Add one-pass managed auth schema ownership so auth installs claim `jwks`
  immediately, export stable auth table identifiers, and keep organization auth
  helper fields in sync with generated schema output.
- Add the `@better-convex/resend` package and project-owned Resend scaffolding,
  including webhook, email, cron, and schema helpers.
- Add app-owned schema extensions, typed plugin authoring helpers, and the new
  ratelimit scaffold with project-owned schema and middleware files.
- Add plugin docs metadata, `better-convex docs <topic...>`, and repo-owned
  scenario/runtime tooling for auth smoke and browser proof.
- Add `codegen.trimSegments`, builder-side `unionOf(...)`, and broader
  `objectOf(...)` support for generated exports and schema builders.

## Patches

- Improve local Convex dev, codegen, and init flows so auth env bootstrap,
  JWKS sync, generated runtime output, and runtime verification behave
  consistently in real apps and scenarios.
- Improve local Convex bootstrap so `dev` watches `convex/.env`, `dev.preRun`
  uses native `convex dev --run`, and local runtime commands re-exec under a
  supported Node automatically when Bun launches them under the wrong one.
- Improve generated auth and runtime output so local scaffolds stay cold when
  auth is absent and avoid self-import or duplicate-context failures when auth
  is present.
- Improve auth runtime behavior so local auth metadata routes stay quiet,
  sign-in and sign-out update state immediately, and optional env values do not
  break codegen or auth-config analysis.
- Improve schema-only auth refresh so `add auth --only schema --overwrite`
  respects auth tables already marked local instead of rewriting app-owned auth
  schemas.
- Fix ratelimit storage and scaffolding so generated apps use the real
  `ratelimitState`, `ratelimitDynamicLimit`, and `ratelimitProtectionHit`
  tables instead of failing with bogus missing-table guidance.
- Improve fixture and scenario sync so committed manifests, generated fixtures,
  and prepared apps stay on the same pinned dependency baseline.
- Update the scaffolded Hono baseline to `4.12.9`.
