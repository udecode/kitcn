# kitcn

## 0.12.27

### Patch Changes

- [#206](https://github.com/udecode/kitcn/pull/206) [`7edbb5e`](https://github.com/udecode/kitcn/commit/7edbb5e3e445ed7331a4cc19ec795900ccb9ca52) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `bunx --bun kitcn init -t start --yes` so Bun-native parse-time imports
    no longer bypass project aliases and crash first-run codegen on scaffolded
    Start files.
  - Fix raw auth reruns so `http.ts` import detection respects both quote styles,
    `registerRoutes(http, getAuth, ...)` accepts Better Auth route contracts
    without a type cast, and raw auth clients keep the app `SITE_URL` while
    preserving user-edited raw `auth-client.ts` files on reruns.

## 0.12.26

### Patch Changes

- [`897a06b`](https://github.com/udecode/kitcn/commit/897a06b9e6ee5289ccf507d6c878d377ecfb1475) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw auth reruns so `http.ts` import detection respects both quote styles,
    and `registerRoutes(http, getAuth, ...)` accepts Better Auth route contracts
    without a type cast.

## 0.12.25

### Patch Changes

- [`c1bc1a0`](https://github.com/udecode/kitcn/commit/c1bc1a046e71af2b311a3568fa397b57093138b1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw TanStack Start auth adoption reruns so `http.ts` import detection
    respects both quote styles and `registerRoutes(http, getAuth, ...)`
    typechecks without casts.

## 0.12.24

### Patch Changes

- [#202](https://github.com/udecode/kitcn/pull/202) [`10c2dc4`](https://github.com/udecode/kitcn/commit/10c2dc4f6de34fd7aaf1ac7bb6c964d7e63fcd3d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Support `kitcn add auth --preset convex --yes` on TanStack Start apps
    without falling through the Vite `main.tsx` patch path.

## 0.12.23

### Patch Changes

- [#200](https://github.com/udecode/kitcn/pull/200) [`7531fc9`](https://github.com/udecode/kitcn/commit/7531fc90d77b12b2e0815b8775ccecab3134784e) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix React auth hooks so `useAuth()` and `useSafeConvexAuth()` stay loading
    while a cached session token is still syncing to Convex, which prevents a
    brief signed-out flash before the signed-in state settles.

## 0.12.22

### Patch Changes

- [`998ee69`](https://github.com/udecode/kitcn/commit/998ee69335c3e8f4b86333b15c14d0965a3aaae9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` so local Convex preflight uses `convex init` by default, and only falls back to the upgrade-capable local dev lane when older local backends require it.
  - Improve auth and backend docs so Convex and Concave env/JWKS flows are split into explicit backend lanes.

## 0.12.21

### Patch Changes

- [`96d5572`](https://github.com/udecode/kitcn/commit/96d55722434c09f7acbfbc8b89efc22f9e24768f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Improve TanStack Start auth migration docs and clarify the `kitcn add auth --schema --yes` schema refresh flow.
  - Fix the Next.js auth proxy so POST auth errors return the upstream response instead of crashing with a 500.
  - Fix `kitcn dev` local bootstrap so older local Convex backends auto-upgrade without hanging on a non-interactive prompt, and preserve local component targeting during preflight.

## 0.12.20

### Patch Changes

- [#193](https://github.com/udecode/kitcn/pull/193) [`db4b2a9`](https://github.com/udecode/kitcn/commit/db4b2a9c0e7ba4bf2fe52eba2f6d00c6c82bf605) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Improve mutation-driven action-caller guidance so `requireActionCtx()` points
    scheduler-capable flows to `requireSchedulerCtx()` and `caller.schedule.*`.
  - Fix server-side call docs so mutation-or-action callbacks schedule actions
    instead of showing an invalid direct action call path.
  - Improve React error-handling docs to recommend `error.data?.message` and a
    global mutation toast pattern with `meta.errorMessage`.

## 0.12.19

### Patch Changes

- [#187](https://github.com/udecode/kitcn/pull/187) [`269966e`](https://github.com/udecode/kitcn/commit/269966eddf9c2a3407e284c86ef3becca9ff441a) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` watcher codegen so Convex parse-time imports read local env
    values from `.env` and `convex/.env`, matching the initial codegen path.
  - Ignore watcher-owned `*.kitcn-parse.ts` temp files during `kitcn dev` so
    parse-time source rewrites do not retrigger codegen in a save loop.
  - Fix `kitcn codegen` so parse-time imports skip helper `.ts` files that do not
    define procedures, and support transitive `.tsx` imports like React Email
    templates.
  - Add server-only middleware procedure info for logging and tracing. Standard
    `export const` queries, mutations, and actions infer `module:function`
    automatically through app `generated/server`; `.name("module:function")`
    overrides when needed, and HTTP routes expose route method and path
    automatically.
  - Add `requireSchedulerCtx()` for mutation-or-action scheduling flows so auth
    callbacks and other generic ctx paths can enqueue work without lying about
    action context.

## 0.12.18

### Patch Changes

- [#183](https://github.com/udecode/kitcn/pull/183) [`40db401`](https://github.com/udecode/kitcn/commit/40db401bc93a9eb1ed7f2398445ba0cebc0a5b28) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn codegen` parse-time cRPC builder stubs so `.paginated()` chains
    after `.input()` keep working and preserve pagination metadata.
  - Fix TanStack Start auth reloads so `createAuthMutations()` persists the
    returned Better Auth session token/data and `ConvexAuthProvider` restores the
    signed-in state after a page refresh.

- [#183](https://github.com/udecode/kitcn/pull/183) [`1218930`](https://github.com/udecode/kitcn/commit/1218930db83b112a43dca074d457ed76c9d4f4c7) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Support custom structured `data` payloads on `CRPCError` so conflict and
    validation handlers can return client-readable metadata alongside the built-in
    error code and message.

## 0.12.17

### Patch Changes

- [#179](https://github.com/udecode/kitcn/pull/179) [`4d2158b`](https://github.com/udecode/kitcn/commit/4d2158b09b4a316df96b4597e9c999517d7a44f8) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn codegen` module parsing so project `tsconfig.json` path aliases
    like `@/lib/crpc` resolve during codegen.
  - Fix `kitcn dev` and `kitcn codegen` parse-time env loading so Concave apps
    can read required values from the project root `.env`.

## 0.12.16

### Patch Changes

- [#177](https://github.com/udecode/kitcn/pull/177) [`2c7ff80`](https://github.com/udecode/kitcn/commit/2c7ff80b571147183316115e86df53f2dc1269d6) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix shared `c.middleware()` auth chains so mutation procedures keep mutation
    writer types like `ctx.db.insert`.
  - Improve shared middleware docs so mutation-only middleware uses
    `c.middleware<MutationCtx>(...)` instead of a query-only workaround.

## 0.12.15

### Patch Changes

- [`a0037ff`](https://github.com/udecode/kitcn/commit/a0037ff26d46749f60788548cb73bf81404fbbc8) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix the remaining `bunx --bun kitcn@latest init -t start --yes` bootstrap
    codegen failure when scaffolded files import `kitcn/server`.

## 0.12.14

### Patch Changes

- [`a5974eb`](https://github.com/udecode/kitcn/commit/a5974ebf70ce984aab6098ffad397c9b116fa7b9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix the remaining `bunx --bun kitcn@latest init -t start --yes` bootstrap
    parse failure by inlining a bootstrap-safe generated server stub for the real
    nested scaffold chain.

## 0.12.13

### Patch Changes

- [#170](https://github.com/udecode/kitcn/pull/170) [`437eff4`](https://github.com/udecode/kitcn/commit/437eff4f19222867dafc278f8f39aef9a81d4647) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `bunx --bun kitcn init -t start --yes` bootstrap parsing so scaffolded
    backend files resolve against the project install instead of the Bun cache,
    and preserve anonymous local Convex mode for follow-up `kitcn dev` runs.

## 0.12.12

### Patch Changes

- [#163](https://github.com/udecode/kitcn/pull/163) [`38ffd3c`](https://github.com/udecode/kitcn/commit/38ffd3c3843cc4549fd6366190b43977e23d34c0) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Add `kitcn auth jwks` for manual static JWKS export and key rotation when a
    deployment cannot use the Convex-only `env push` flow.

## 0.12.11

### Patch Changes

- [#166](https://github.com/udecode/kitcn/pull/166) [`3a95ffb`](https://github.com/udecode/kitcn/commit/3a95ffbf86872dbd29dbe806c1a48a10189ce611) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn init -t next` monorepo scaffolds so the Next overlay targets the real app root under `apps/*` and uses the workspace package manager instead of assuming a single-app root layout.

- [#163](https://github.com/udecode/kitcn/pull/163) [`38ffd3c`](https://github.com/udecode/kitcn/commit/38ffd3c3843cc4549fd6366190b43977e23d34c0) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix Concave local `kitcn dev` schema watches so `schema.ts` edits rerun fresh codegen and refresh generated schema outputs without a manual `kitcn codegen`.
  - Fix `count()` and aggregate range filters on `timestamp({ mode: "string" })`
    aggregateIndex suffix fields so stored millis buckets match ISO-string
    filters instead of silently returning zero.

## 0.12.10

### Patch Changes

- [#157](https://github.com/udecode/kitcn/pull/157) [`bb038d8`](https://github.com/udecode/kitcn/commit/bb038d880902ef3c2b7388161945dd067073c08f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth-bound React Query data so guest, sign-in, and account-switch transitions do not keep stale cached user data.

## 0.12.9

### Patch Changes

- [#154](https://github.com/udecode/kitcn/pull/154) [`4681298`](https://github.com/udecode/kitcn/commit/46812983553da242a7ee478fc2ec7d024ca018cc) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` so projects with a remote Convex deployment in `.env.local` keep using that remote target instead of falling back to local Convex.

## 0.12.8

### Patch Changes

- [#152](https://github.com/udecode/kitcn/pull/152) [`92dd2bc`](https://github.com/udecode/kitcn/commit/92dd2bcf1ce35c1eb34315b88f025c7ee360a9a1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix interactive scaffold selection so duplicate file paths are shown once and the active preset stays selected.
  - Fix generated auth demo pages so sign-in and sign-up stay on the signed-in view instead of bouncing back to the auth route.

## 0.12.7

### Patch Changes

- [#150](https://github.com/udecode/kitcn/pull/150) [`9fb1adf`](https://github.com/udecode/kitcn/commit/9fb1adf3a8f9bb7b54ba4dd42c809c9b54ba7e31) Thanks [@zbeyens](https://github.com/zbeyens)! - - Pin the scaffolded Zod install to the supported Zod 4 line so npm
  `kitcn init -t start` resolves without the peer conflict hit during release
  validation.

## 0.12.6

### Patch Changes

- [#148](https://github.com/udecode/kitcn/pull/148) [`8c59d89`](https://github.com/udecode/kitcn/commit/8c59d892f5fdfc12448aee35d86f286378e61aa6) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add `kitcn init -t start` for fresh TanStack Start apps.
  - Add `kitcn/auth/start` and Start-specific auth scaffolding for `kitcn add auth`.

  ## Patches

  - Fix generated file rewrites so unchanged codegen output does not trigger
    repeated TanStack Start reloads during local development.

## 0.12.5

## 0.12.4

### Patch Changes

- [`d264542`](https://github.com/udecode/kitcn/commit/d264542e0e6818693cad2ad9520da145c0a72694) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn add auth` in fresh apps so auth planning installs its required dependencies before the scaffold loads Better Auth internals.

## 0.12.3

### Patch Changes

- [`ec0aaaa`](https://github.com/udecode/kitcn/commit/ec0aaaa525a95788db5b2ec76626ae445e68eae2) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix scenario packaging for `@kitcn/resend` after the plugin moved `kitcn` to peer dependencies.

## 0.12.2

### Patch Changes

- [`4f9907e`](https://github.com/udecode/kitcn/commit/4f9907e95ceae9f30499b2bad0d1fb20d1fa5fc1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix fresh `bunx kitcn` installs so the CLI keeps TypeScript off the cold
    startup path and still boots when Bun omits `typescript` from the transient
    install tree.

## 0.12.1

### Patch Changes

- [`93726d3`](https://github.com/udecode/kitcn/commit/93726d3d337a7469f98efbf5d932beb370d09d5d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix fresh `bunx kitcn init` installs so the published CLI ships its runtime
    TypeScript dependency instead of failing before scaffold setup starts.
  - Fix `kitcn init -t next --yes` so non-interactive local bootstrap provisions
    an anonymous Convex deployment instead of stopping on a login prompt.

## 0.12.0

### Minor Changes

- [#139](https://github.com/udecode/kitcn/pull/139) [`11aa0ee`](https://github.com/udecode/kitcn/commit/11aa0ee2091827e6d52b30c261004f4ed64cac07) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

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

  - Use `kitcn.json` as the default discovered kitcn config file.

  ```ts
  // Before
  export default {
    outputDir: "convex/shared",
  };

  // After
  {
    "paths": {
      "shared": "convex/shared"
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
    `kitcn.json`, local bootstrap wrappers, and `kitcn verify`.
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

## 0.11.0

### Minor Changes

- [#135](https://github.com/udecode/kitcn/pull/135) [`2977aa6`](https://github.com/udecode/kitcn/commit/2977aa68204f239bce5214582f111901affdc2ee) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Drop Better Auth `1.4` support and align auth integrations with Better Auth `1.5.3` and `@convex-dev/better-auth@0.11.1`.
  - Remove bundled passkey schema assumptions and follow the upstream `oauthApplication.redirectUrls` rename during `0.11` migrations.

  ```ts
  // Before
  "better-auth": "1.4.9";
  "@convex-dev/better-auth": "0.10.11";

  oauthApplication: {
    redirectURLs: ["https://example.com/callback"];
  }

  // After
  "better-auth": "1.5.3";
  "@convex-dev/better-auth": "0.11.1";

  oauthApplication: {
    redirectUrls: ["https://example.com/callback"];
  }
  ```

  ## Patches

  - Improve Next.js server-side token forwarding by forcing `accept-encoding: identity` for internal auth fetches behind proxy compression.
  - Fix auth adapter selection and OR-query handling so `id` selects preserve `_id`, nullish filters behave correctly, unsupported `experimental.joins` are rejected, and OR updates/deletes/counts dedupe by document id.
  - Improve auth route origin handling by filtering nullish `trustedOrigins` values before CORS matching.
  - Reduce generated runtime boilerplate by moving lazy registry/factory caching and caller/handler context typing into shared server helpers without changing generated caller or handler types.

## 0.10.3

### Patch Changes

- [#132](https://github.com/udecode/kitcn/pull/132) [`7182e18`](https://github.com/udecode/kitcn/commit/7182e18a00ee038d64d14c0078a456678fa9e79f) Thanks [@thuillart](https://github.com/thuillart)! - Support loading ORM triggers from `triggers.ts` during codegen, with fallback to `schema.ts` for backward compatibility. This keeps `schema.ts` schema-safe when triggers need generated runtime helpers like `createXCaller(...)`.

## 0.10.2

### Patch Changes

- [#129](https://github.com/udecode/kitcn/pull/129) [`9262e6f`](https://github.com/udecode/kitcn/commit/9262e6fe823bf8ededc84c1ee2ba9087efa96aa9) Thanks [@thuillart](https://github.com/thuillart)! - Fix trigger-generated callers in `schema.ts` so they stay schema-safe during Convex pushes, and preserve mutation scheduling APIs when triggers are parameterized with `MutationCtx`.

## 0.10.1

### Patch Changes

- [#128](https://github.com/udecode/kitcn/pull/128) [`24e1e60`](https://github.com/udecode/kitcn/commit/24e1e60877b1a0c46631abc6d4118058d42acd4e) Thanks [@thuillart](https://github.com/thuillart)! - ## Patches
  - Fix `kitcn dev` codegen watch mode so added, changed, and removed procedure files regenerate runtime artifacts more reliably during local development.

## 0.10.0

### Minor Changes

- [#121](https://github.com/udecode/kitcn/pull/121) [`7aa4f16`](https://github.com/udecode/kitcn/commit/7aa4f1643b2538627d3c6e51a6e5ab34bec0b500) Thanks [@carere](https://github.com/carere)! - ## Features
  - Add SolidJS flavor with full feature parity to React integration
  - Add `ConvexProvider`, `ConvexProviderWithAuth`, `useConvex`, and `useConvexAuth` for SolidJS
  - Add `createConvexQueryClient` and `useConvexQuery` bridging Convex subscriptions to TanStack Solid Query
  - Add cRPC layer for SolidJS with typed query/mutation/action proxies
  - Add `useConvexInfiniteQuery` for paginated queries in SolidJS
  - Add `createConvexHTTPProxy` for SSR-compatible HTTP client in SolidJS
  - Add auth mutation helpers (`useSignIn`, `useSignUp`, `useSignOut`) for SolidJS
  - Add `useRateLimit` hook for SolidJS using `client.onUpdate()` subscriptions
  - Add `./solid` and `./plugins/ratelimit/solid` package exports

### Patch Changes

- [#126](https://github.com/udecode/kitcn/pull/126) [`0c88268`](https://github.com/udecode/kitcn/commit/0c88268d8efe4160a734ff119aba859d8b4b3fb3) Thanks [@thuillart](https://github.com/thuillart)! - Preserve real `createdAt` columns during ORM writes so auth records keep schema-defaulted timestamps when created through the generated auth runtime.

## 0.9.2

### Patch Changes

- [#123](https://github.com/udecode/kitcn/pull/123) [`ba8ce1a`](https://github.com/udecode/kitcn/commit/ba8ce1aaf23c7a152047115763d5e4b7a3e84a64) Thanks [@thuillart](https://github.com/thuillart)! - Pass the Convex deployment URL through the SSR server caller instead of falling back to `NEXT_PUBLIC_CONVEX_URL`.

  `createCallerFactory` now derives the `.convex.cloud` URL from `convexSiteUrl` by default and also accepts an explicit `convexUrl` override for frameworks that do not use Next.js env naming.

- [#124](https://github.com/udecode/kitcn/pull/124) [`e19de1d`](https://github.com/udecode/kitcn/commit/e19de1d431857851012f9e5e4a1dfa276700c2cd) Thanks [@thuillart](https://github.com/thuillart)! - fix(auth): persist createdAt for auth records

## 0.9.1

### Patch Changes

- [#116](https://github.com/udecode/kitcn/pull/116) [`2c98958`](https://github.com/udecode/kitcn/commit/2c98958f35953dfb4514ee038d2363e3ac92df88) Thanks [@thuillart](https://github.com/thuillart)! - Fix `createEnv` throwing "Invalid environment variables" during `kitcn dev`. The CLI now sets a `globalThis.__KITCN_CODEGEN__` sentinel before importing Convex files via jiti, and `createEnv` reads that sentinel (instead of `process.env`) to activate a safe fallback — using `options[0]` for `z.enum` fields instead of `""` to avoid false validation failures.

- [#120](https://github.com/udecode/kitcn/pull/120) [`c50c99b`](https://github.com/udecode/kitcn/commit/c50c99b5585721e9e6dccc371c3007def1abd09c) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix SSR auth token refresh when Convex requests `forceRefreshToken` during pending Better Auth session hydration.

  `ConvexAuthProvider` now fetches a fresh JWT instead of reusing the cached SSR token in that forced-refresh path, so Convex can schedule preemptive refresh instead of waiting for an auth failure.

## 0.9.0

### Minor Changes

- [#112](https://github.com/udecode/kitcn/pull/112) [`5bd956c`](https://github.com/udecode/kitcn/commit/5bd956c7d6602d14f3a8f9062638b31879fa1160) Thanks [@zbeyens](https://github.com/zbeyens)! - ORM Discriminator (polymorphic):

  - Drop the experimental query-level `polymorphic` config from `findMany`, `findFirst`, and `findFirstOrThrow`.

  ```ts
  // Before
  await db.query.auditLogs.findMany({
    polymorphic: {
      discriminator: "actionType",
      schema: targetSchema,
      cases: { role_change: "roleChange", document_update: "documentUpdate" },
    },
    limit: 20,
  });

  // After
  const rows = await db.query.auditLogs.findMany({ limit: 20 });
  // Polymorphic data is synthesized from table schema at row.details
  ```

  - Add schema-first polymorphic discriminator columns via `discriminator({ variants, as? })` directly in `convexTable(...)`.
  - Add typed nested read unions at `details` by default (or custom alias via `as`).
  - Add `withVariants: true` as a query shortcut to auto-load one() relations on discriminator tables.
  - Reject invalid branch writes when required variant fields are missing.
  - Reject cross-branch write combinations that set fields outside the active discriminator variant.

### Patch Changes

- [#115](https://github.com/udecode/kitcn/pull/115) [`dab1447`](https://github.com/udecode/kitcn/commit/dab14473a9d2285459add2781fa5fbf9c8bd8569) Thanks [@zbeyens](https://github.com/zbeyens)! - - Improve `kitcn analyze` to respect `convex.json` `functions` paths so non-default layouts are discovered.

## 0.8.4

### Patch Changes

- [#110](https://github.com/udecode/kitcn/pull/110) [`589e2bc`](https://github.com/udecode/kitcn/commit/589e2bc932b78c552233babe37441deae7ebdcb9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches
  - Fix nested `arrayOf(objectOf(...))` field nullability so `text()` and `text().notNull()` produce distinct schema/data-model types and avoid deploy mismatches.

## 0.8.3

### Patch Changes

- [`7f23a8e`](https://github.com/udecode/kitcn/commit/7f23a8eb512b626b952313b31ed0c2a74b1bee46) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix generated caller support for non-cRPC Convex procedure exports (like `orm.api()` internals such as `migrationStatus`).

- [`02e40e8`](https://github.com/udecode/kitcn/commit/02e40e8610b6f51962326abce95c51277c3d0177) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add `polymorphic` query config support for `findMany()`, `findFirst()`, and `findFirstOrThrow()` to synthesize discriminated-union targets from `one()` relations.
  - Support custom target aliases with `polymorphic.as` (default alias is `target`) while preserving discriminated-union narrowing by discriminator value.

  ## Patches

  - Validate polymorphic configs at runtime and throw on discriminator/case mismatches or schema parse failures.
  - Auto-load required polymorphic case relations during synthesis and strip them from results unless explicitly requested via `with`.
  - Reject `pipeline` + `polymorphic` combinations with explicit query-builder errors.

## 0.8.2

### Patch Changes

- [`fb0064b`](https://github.com/udecode/kitcn/commit/fb0064bba994ba0ea9db7d7862a6632f53c9cede) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features
  - Add `getSessionNetworkSignals(ctx, session?)` in `kitcn/auth` to expose session-derived `ip` and `userAgent` for query/mutation middleware and rate-limit guards without per-endpoint HTTP wrappers.

## 0.8.1

### Patch Changes

- [`fc9e17c`](https://github.com/udecode/kitcn/commit/fc9e17c7cf220435451e45eeb2cc08c8d34c7d46) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Fixes
  - Fix `kitcn/plugins/ratelimit` so `limit()` and `check()` no longer call timer APIs (`setTimeout`/`clearTimeout`) during normal execution.
  - Remove `blockUntilReady()`

## 0.8.0

### Minor Changes

- [#105](https://github.com/udecode/kitcn/pull/105) [`9ea3902`](https://github.com/udecode/kitcn/commit/9ea3902a9b37bf1206c99c46d3121b95b10af8e7) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking Changes

  - Moved imports from `kitcn/migration` to `kitcn/orm`.

  ## Features

  - Add `arrayOf(...)` and `objectOf(...)` ORM helpers to reduce `custom(...)` boilerplate for nested array/object schemas.
  - Add schema plugin pipeline to `defineSchema(...)` with builtin/default `aggregatePlugin()` and `migrationPlugin()`.
  - Add optional `plugins` option on `defineSchema` so feature tables can be opt-in.
  - Expose `aggregatePlugin` and `migrationPlugin` from `kitcn/plugins`.
  - Add new `kitcn/plugins/ratelimit` module with Upstash-style APIs (`limit`, `check`, `getRemaining`, `blockUntilReady`, `resetUsedTokens`, dynamic limits, timeout/cache/deny reasons) backed by Convex DB tables.
  - Add `kitcn/plugins/ratelimit/react` with `useRateLimit` hook support for browser-side status checks and retry timing.
  - Add `ratelimitPlugin()` for explicit ratelimit internal table enablement in ORM `defineSchema`.

  Usage:

  - Replace example app rate limiting from `@convex-dev/rate-limiter` component usage to `kitcn/plugins/ratelimit`.
  - Add `/ratelimit` coverage demo and guard test suite for ratelimit coverage definitions.
  - Rewrite rate-limiting docs/template references to the new `kitcn/plugins/ratelimit` package surface.

## 0.7.3

### Patch Changes

- [#103](https://github.com/udecode/kitcn/pull/103) [`590c6e3`](https://github.com/udecode/kitcn/commit/590c6e37d1d61cd4f91b7edba3cd3120206d751a) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features
  - Add built-in ORM migrations with `defineMigration`, `defineMigrationSet`, and typed migration plan/status helpers.
  - Add generated migration procedures (`migrationRun`, `migrationRunChunk`, `migrationStatus`, `migrationCancel`) to generated server/runtime contracts.
  - Add `kitcn migrate` CLI commands: `create`, `up`, `down`, `status`, and `cancel`.
  - Add migration orchestration to `kitcn dev` and `kitcn deploy` with configurable strictness, waiting, batching, and drift policy.
  - Add safe-bypass migration writes by default with per-migration `writeMode: "normal"` override.
  - Make `kitcn reset` clear migration state/history tables (`migration_state`, `migration_run`) in addition to user and aggregate tables.

## 0.7.2

### Patch Changes

- [`9bccd91`](https://github.com/udecode/kitcn/commit/9bccd91a5ac883fcfe6d1345d1f04ca000dcd62e) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix auth adapter date output regression.

  `getAuth(ctx).api.*` date fields are normalized back to Convex-safe unix millis (`number`) on output, preventing unsupported `Date` values from leaking into raw Convex query/mutation/action returns (for example `auth.api.listOrganizations`).

## 0.7.1

### Patch Changes

- [#99](https://github.com/udecode/kitcn/pull/99) [`ea02427`](https://github.com/udecode/kitcn/commit/ea02427192747fe18859de2e65ede0a96ba7a446) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches
  - Fix server auth queries and mutations to refresh stale JWTs and retry once on unauthorized responses before returning unauthenticated results.
  - Fix auth header generation to fall back to Better Auth session-token cookies when JWT identity is unavailable, including secure and custom cookie prefixes.
  - Update `@convex-dev/better-auth` support to `0.10.11` to include upstream cross-domain and Convex plugin auth fixes.
  - Fix `ConvexAuthProvider` token refresh behavior by deduplicating concurrent token fetches and forcing non-throwing internal token fetch calls.
  - Improve SSR/OTT auth stability in `ConvexAuthProvider` so session hydration and one-time-token URL handling avoid transient unauthorized states.
  - Align reactive auth query subscriptions with `skipUnauth` semantics so unauthorized subscription updates resolve to `null` instead of triggering unauthorized callbacks.
  - Ensure `ConvexAuthProvider` auth state follows confirmed Better Auth session state so stale JWTs do not keep authenticated state after sign-out.
  - Fix auth adapter date output normalization to return `Date` values for date fields.
  - Fix Next.js auth token forwarding by removing body-related headers from internal token fetch requests.
  - Prefer `better-auth/minimal` imports in auth runtime/type paths where available

## 0.7.0

### Minor Changes

- [#97](https://github.com/udecode/kitcn/pull/97) [`4f83203`](https://github.com/udecode/kitcn/commit/4f83203381bbd5030db77b76baed47db29d25057) Thanks [@{](https://github.com/{)! - ## Auth

  ### Breaking changes

  - Redesign auth trigger API from flat callbacks to nested `{ create, update, delete, change }` shape matching ORM `defineTriggers` pattern.
  - Replace split auth exports (`getAuthOptions` + `authTriggers`) with one default `defineAuth((ctx) => ({ ...options, triggers }))` contract.
  - Drop generated trigger procedures (`beforeCreate`, `onCreate`, `beforeUpdate`, `onUpdate`, `beforeDelete`, `onDelete`); triggers now run inline in the same CRUD transaction.
  - Add `ctx` as second parameter to all trigger callbacks for access to mutation context.
  - Add `before` hook return contract: `void` (continue unchanged), `{ data }` (shallow merge into payload), `false` (cancel write).
  - Add unified `change(change, ctx)` handler with discriminated union `{ operation, id, newDoc, oldDoc }`.
  - Rename `createApi` option `skipValidation` to `validateInput`; default is now `validateInput: false`.
  - Rename auth package entrypoints from hyphenated to namespaced paths:
    - `kitcn/auth-client` -> `kitcn/auth/client`
    - `kitcn/auth-config` -> `kitcn/auth/config`
    - `kitcn/auth-nextjs` -> `kitcn/auth/nextjs`
  - Move HTTP auth helpers to `kitcn/auth/http`:
    - `authMiddleware` and `registerRoutes` now import from `kitcn/auth/http` (not `kitcn/auth`).
    - `kitcn/auth/http` auto-installs the Convex-safe `MessageChannel` polyfill. You can remove your own `http-polyfills.ts` file.

  ```ts
  // Before
  export const getAuthOptions = (ctx) => ({ ...options });
  export const authTriggers = { user: { onCreate: async (ctx, user) => {} } };

  // After
  import { defineAuth } from "./generated/auth";

  export default defineAuth((ctx) => ({
    ...options,
    triggers: {

        create: {
          before: async (data, ctx) => ({ data: { ...data, role: "user" } }),
          after: async (doc, ctx) => {},
        },
        update: {
          after: async (newDoc, ctx) => {},
        },
        change: async (change, ctx) => {
          // change.operation: 'insert' | 'update' | 'delete'
          // change.id, change.newDoc, change.oldDoc
        },
      },
    },
  }));
  ```

  ```ts
  // Before
  import { getAuth } from "./auth";
  createApi(schema, getAuth, { skipValidation: true });

  // After
  import { getAuth } from "./generated/auth";
  createApi(schema, getAuth); // validateInput defaults to false
  createApi(schema, getAuth, { validateInput: true });
  ```

  ```ts
  // Before
  import { convexClient } from "kitcn/auth-client";
  import { getAuthConfigProvider } from "kitcn/auth-config";
  import { convexBetterAuth } from "kitcn/auth-nextjs";

  // After
  import { convexClient } from "kitcn/auth/client";
  import { getAuthConfigProvider } from "kitcn/auth/config";
  import { convexBetterAuth } from "kitcn/auth/nextjs";
  ```

  ```ts
  // Before
  import "../lib/http-polyfills";
  import { authMiddleware, registerRoutes } from "kitcn/auth";

  // After
  import { authMiddleware, registerRoutes } from "kitcn/auth/http";
  ```

  ### Features

  - Add `defineAuth` helpers to unify codegen and non-codegen auth setup.
  - Add always-generated Better Auth runtime contract in `convex/functions/generated/auth.ts`.
  - Add generated `defineAuth` export in `convex/functions/generated/auth.ts` for inference-first `auth.ts` authoring.
  - Support ORM-aware auth writes (insert/update/delete go through ORM when available).

  ## Codegen

  ### Breaking changes

  - Drop generated internal auth calls from `internal.auth.*`; use `internal.generated.*`.
  - Drop manual `initCRPC.dataModel().context(...)` bootstrap; import generated `initCRPC` from `convex/functions/generated/server`.
  - Drop manual `ctx.runQuery`/`ctx.runMutation` for inter-procedure calls; use per-module `create<Module>Handler`/`create<Module>Caller` from `convex/functions/generated/<module>.runtime`.
  - Require `export const httpRouter = router(...)` in `convex/functions/http.ts` so codegen can include typed HTTP routes in generated API output.

  ```ts
  // Before
  import { initCRPC } from "kitcn/server";
  import type { DataModel } from "./_generated/dataModel";

  const c = initCRPC
    .dataModel<DataModel>()
    .context({
      query: (ctx) => withOrm(ctx),
      mutation: (ctx) => withOrm(ctx),
    })
    .meta<{
      auth?: "optional" | "required";
      role?: "admin";
      rateLimit?: string;
    }>()
    .create();

  // After
  import { initCRPC } from "./generated/server";

  const c = initCRPC
    .meta<{
      auth?: "optional" | "required";
      role?: "admin";
      rateLimit?: string;
    }>()
    .create();
  ```

  ```ts
  // Before (http.ts)
  export const appRouter = router({
    health,
    todos: todosRouter,
  });
  export default createHttpRouter(app, appRouter);

  // After (http.ts)
  export const httpRouter = router({
    health,
    todos: todosRouter,
  });
  export default createHttpRouter(app, httpRouter);
  ```

  ### Features

  - Add generated `convex/functions/generated/` directory:
    - `generated/server.ts` — ORM exports (`orm`, `withOrm`, `scheduledMutationBatch`, `scheduledDelete`), wrapped ctx types (`OrmCtx`, `QueryCtx`, `MutationCtx`, `GenericCtx`), prewired `initCRPC`.
    - `generated/auth.ts` — `defineAuth`, `getAuth`, auth runtime contract.
    - `generated/<module>.runtime.ts` — per-module scoped caller/handler factories.
  - Add per-module `create<Module>Handler(ctx)` (DEFAULT) for zero-overhead internal composition in queries/mutations. Bypasses input validation, middleware, and output validation. Same transaction, no serialization.
  - Add per-module `create<Module>Caller(ctx)` for actions and HTTP routes only. Goes through validation + middleware.
    - Root calls in `ActionCtx` dispatch via `ctx.runQuery` / `ctx.runMutation`.
    - Direct action calls are explicit under `caller.actions.*` and dispatch via `ctx.runAction`.
    - Scheduled calls are available under `caller.schedule.*`:
      - `caller.schedule.now.<mutation|action>(input)` (alias for `after(0)`)
      - `caller.schedule.after(ms).<mutation|action>(input)`
      - `caller.schedule.at(dateOrMs).<mutation|action>(input)`
      - `caller.schedule.cancel(jobId)`
    - Auto-generate procedure registry per module from cRPC exports (public + internal).
    - Enforce call matrix: query ctx → root queries only; mutation ctx → root queries+mutations plus `schedule`; action ctx → root queries+mutations plus `actions` and `schedule`.
    - Reserve module export names `actions` and `schedule` in runtime callers (codegen throws explicit conflict error).
  - Never use `ctx.runQuery`/`ctx.runMutation` directly — always use `create<Module>Handler` or `create<Module>Caller`.
  - Keep manual `initCRPC` setup from `kitcn/server` supported for apps not using codegen.
  - Add `kitcn.json` support (plus `--config <path>`) for codegen/dev defaults, feature toggles (`api`, `auth`), and passthrough Convex arg presets.

  ```ts
  // Before — manual runQuery/runMutation with function references
  import { api, internal } from "./_generated/api";

  const result = await ctx.runQuery(api.todos.list, { limit: 10 });
  await ctx.runMutation(internal.todoInternal.create, { userId, ...input });

  // After (query/mutation) — per-module handler, zero overhead, same transaction
  import { createSeedHandler } from "./generated/seed.runtime";

  const handler = createSeedHandler(ctx);
  await handler.cleanupSeedData();
  await handler.seedUsers();
  ```

  ```ts
  // After (action/HTTP) — per-module caller, validation + middleware
  import { createSeedCaller } from "./generated/seed.runtime";

  const caller = createSeedCaller(ctx);
  await caller.generateSamplesBatch({ count: 5, userId, batchIndex: 0 });
  ```

  ### Patches

  - Add generated internal API refs for async ORM workers and generated auth handlers under `internal.generated`.

  ## API Types

  ### Breaking changes

  - Drop separate `meta` arguments in context/proxy/caller/auth setup APIs; pass only `api`.
  - Drop the `@convex/types` workflow and use generated `@convex/api` types.
  - Drop manual codegen outputs `convex/shared/meta.ts` and `convex/shared/types.ts` in favor of generated `convex/shared/api.ts`.

  ```ts
  // Before
  import type { Api, ApiInputs, ApiOutputs } from "@convex/types";
  createCRPCContext({ api, meta, convexSiteUrl });
  createServerCRPCProxy({ api, meta });

  // After
  import type { Api, ApiInputs, ApiOutputs } from "@convex/api";
  createCRPCContext({ api, convexSiteUrl });
  createServerCRPCProxy({ api });
  ```

  ```ts
  // Before
  import type { Select, Insert } from "./shared/types";

  // After
  import type { Select, Insert } from "@convex/api";
  ```

  ### Features

  - Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
  - Add optional generated table helpers (`TableName`, `Select`, `Insert`) when schema exports `tables`.

  ### Patches

  - Add Date-safe API inference from cRPC exports so `z.date()` fields stay typed as `Date` in generated API input/output types.
  - Improve generated `Api` typing so HTTP router types are embedded in `typeof api`, reducing manual `<Api>` generics in common setup calls.
  - Build function metadata from the generated `api` object at runtime, eliminating separate `meta` plumbing in cRPC React/RSC/server helpers.
  - Filter internal/private namespaces from generated client/caller type surfaces (e.g. `_http`, `_generated`-style keys).
  - Improve lazy caller invalid-path errors with clearer failure messages.

  ```ts
  // Before
  import type { Api } from "@convex/api";

  export const { CRPCProvider, useCRPC, useCRPCClient } =
    createCRPCContext<Api>({
      api,
      convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
    });

  export const crpc = createServerCRPCProxy<Api>({ api });

  // After
  export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
    api,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });

  export const crpc = createServerCRPCProxy({ api });
  ```

  ## Dependency

  ### Breaking changes

  - Bump Convex minimum peer dependency to `>=1.32`.

  ## ORM

  ### Breaking changes

  - Drop manual `convex/lib/orm.ts` server wiring; import `orm`/`withOrm` from `convex/functions/generated/server`.
  - Drop `OrmQueryCtx`/`OrmMutationCtx`; import wrapped `QueryCtx`/`MutationCtx` from `convex/functions/generated/server`.
  - Table-level lifecycle registration in `convexTable(..., extraConfig)` is removed.
  - Lifecycle helpers `onInsert`, `onUpdate`, `onDelete`, and `onChange` are removed from `kitcn/orm`.

  ```ts
  // Before
  import type { OrmQueryCtx, OrmMutationCtx } from "../lib/orm";
  import { withOrm } from "../lib/orm";

  // After
  import type { QueryCtx, MutationCtx } from "./generated/server";
  import { withOrm } from "./generated/server";
  ```

  ### Features

  - ORM triggers are schema-level only and must be exported as `export const triggers = defineTriggers(relations, { ... })`.
  - Trigger definitions use object hooks per table:
    - `create.before` / `create.after`
    - `update.before` / `update.after`
    - `delete.before` / `delete.after`
    - `change(change, ctx)`
  - `before` return contract is:
    - `void` => continue unchanged
    - `{ data }` => shallow merge into write payload
    - `false` => cancel write via `TriggerCancelledError`
  - Generated server wiring includes `triggers` only when `schema.ts` exports both `relations` and `triggers`.
  - Add `createOrm({ schema, triggers })` support for generated and manual setups.
  - Add `ctx.orm.withoutTriggers(callback)` to bypass trigger hooks for bulk operations (e.g. data resets, migrations). The callback receives a trigger-free ORM instance scoped to the same transaction.

  ## Aggregates

  ### Features

  - Add built-in aggregate-core runtime (B-tree backed).
  - Add `aggregateIndex` schema builder for declaring ORM count and aggregate index coverage:
    - `aggregateIndex(name).on(field1, field2)` — filter key fields.
    - `aggregateIndex(name).all()` — unfiltered (global) metrics.
    - Chainable metric methods: `.count(field)`, `.sum(field)`, `.avg(field)`, `.min(field)`, `.max(field)`.

  ```ts
  // Schema declaration
  const orders = convexTable(
    "orders",
    { orgId: text(), amount: integer(), score: integer() },
    (t) => [
      aggregateIndex("by_org")
        .on(t.orgId)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
      aggregateIndex("all_metrics").all().sum(t.amount).count(t.orgId),
    ]
  );
  ```

  - Add `ctx.orm.query.<table>.count()` and `ctx.orm.query.<table>.count({ where, select, orderBy, skip, take, cursor })` for O(1) filtered counts backed by `aggregateIndex`. Windowed count (`skip`/`take`/`cursor`) counts rows within a window defined by ordering and bounds.
  - Add `ctx.orm.query.<table>.aggregate({ where, _count, _sum, _avg, _min, _max, orderBy, skip, take, cursor })` for Prisma-style aggregate blocks with optional windowed bounds.
  - Add safe finite `OR` rewrite for aggregate/count `where` — `OR` branches collapse when each is index-plannable (differs on one scalar eq/in/isNull field).
  - Add `findMany({ distinct })` deterministic `DISTINCT_UNSUPPORTED` error directing to `select().distinct({ fields })` pipeline.
  - Add relation `_count` loading via `with: { _count: { todos: true } }` with optional filtered variants.
  - Add through-filtered relation `_count` for `through()` relations using indexed lookups + no-scan-safe filter validation.
  - Add mutation `returning({ _count })` for insert/update/delete via split selection + relation count loading.
  - Add Prisma-style `_sum` nullability: returns `null` for empty sets or all-null field values (instead of `0`).
  - Add `groupBy()` to the ORM query builder with Prisma-style `by`, `_count`, `_sum`, `_avg`, `_min`, `_max` blocks. Requires finite `where` constraints (`eq`/`in`/`isNull`) on every `by` field — no `having`/`orderBy`/`skip`/`take`/`cursor` in v1.

  ```ts
  // Count
  const total = await ctx.orm.query.todos.count({ where: { projectId } });

  // Aggregate
  const stats = await ctx.orm.query.orders.aggregate({
    where: { orgId: "org-1" },
    _count: { _all: true },
    _sum: { amount: true },
    _avg: { amount: true },
  });

  // Relation _count
  const users = await ctx.orm.query.user.findMany({
    with: { _count: { todos: { where: { completed: true } } } },
  });
  ```

  - Add generated `aggregateBackfill` and `aggregateBackfillStatus` procedures for index building and status polling.
  - Add ORM internal storage tables (`aggregate_bucket`, `aggregate_member`, `aggregate_extrema`, `aggregate_state`, `aggregate_rank_tree`, `aggregate_rank_node`) auto-injected by `defineSchema`. Convex rejects table names starting with `_`, so internals use the `aggregate_` prefix.
  - Add `rankIndex` schema builder for declaring ranked/ordered aggregate indexes:
    - `rankIndex(name).partitionBy(field1, field2).orderBy(t.score).sum(t.amount)` — partitioned rank index with optional weighted sum.
    - `rankIndex(name).all().orderBy(t.score)` — unpartitioned (global) rank index.
    - `orderBy()` supports `integer()`/`timestamp()`/`date()` columns only.
  - Add `db.query.<table>.rank(indexName, { where })` query builder with O(log n) operations:
    - `.count()`, `.sum()` — aggregate reads.
    - `.at(offset)` — positional access by rank.
    - `.indexOf({ id })` — rank lookup by document ID.
    - `.paginate({ cursor, limit })` — cursor-based ranked pagination.
    - `.min()`, `.max()`, `.random()` — extrema and random sampling.
  - Add backfill support for rank indexes alongside metric indexes (shared `aggregateBackfill`/`aggregateBackfillStatus` procedures).

  ## CLI

  ### Features

  - Add `kitcn analyze` command with two modes:
    - Default **hotspot** mode: per-entry bundle analysis showing output size, dependency size, and handler counts. Interactive TUI with keyboard navigation, live filtering, sort cycling, detail panes (handlers/packages/inputs), and file watch for auto-refresh.
    - `--deploy` mode: single-isolate bundle analysis matching Convex deploy bundling. Reports total size, top inputs, and top packages.
    - `--fail-mb <n>` for CI gating: exit 1 if largest entry or chunk exceeds threshold.
    - Positional regex argument to filter entry points (e.g. `kitcn analyze "auth.*"`).
  - Add `kitcn deploy` command that wraps `convex deploy` with automatic post-deploy aggregate backfill.
  - Add `kitcn aggregate rebuild` command for full aggregate index rebuild.
  - Add `kitcn aggregate backfill` command for resume-mode backfill (no clear/rebuild).
  - Add automatic aggregate backfill to `kitcn dev` (auto-resumes on startup, non-blocking).
  - Add `aggregateBackfill` config section in `kitcn.json` for both `dev` and `deploy`:
    - `enabled`: `"auto"` (skip if function not found), `"on"`, or `"off"`.
    - `wait`: poll until all indexes READY or timeout (default `true`).
    - `batchSize`, `pollIntervalMs`, `timeoutMs`: tuning knobs.
    - `strict`: exit 1 on failure/timeout (default `true` for deploy, `false` for dev).
  - Add CLI flags for aggregate backfill overrides: `--backfill`, `--backfill-wait`, `--backfill-strict`, `--backfill-batch-size`, `--backfill-timeout-ms`, `--backfill-poll-ms`.
  - Add `kitcn reset --yes` command: calls `generated/server:reset`. Supports `--before <fn>` and `--after <fn>` hooks.

## 0.6.4

### Patch Changes

- [#93](https://github.com/udecode/kitcn/pull/93) [`8153811`](https://github.com/udecode/kitcn/commit/81538110000a33855f1b5bb9b66f613604cd8388) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix `findFirst` now returns `null` instead of `undefined` when no result is found. Fix `.returning()` crash on nullable timestamp fields.

## 0.6.3

### Patch Changes

- [#88](https://github.com/udecode/kitcn/pull/88) [`207d62f`](https://github.com/udecode/kitcn/commit/207d62f19912ccf355ff4c5e9ec5fee56ecf58cb) Thanks [@zbeyens](https://github.com/zbeyens)! - ORM/RLS update: async policy callbacks, safe empty `inArray([])` handling in query + mutation paths, and runtime+types support for system fields (`t.id`) in `extraConfig` callbacks.

## 0.6.2

### Patch Changes

- [#86](https://github.com/udecode/kitcn/pull/86) [`49098fa`](https://github.com/udecode/kitcn/commit/49098fa5919b4a9c4a3e73b989ab55d897df02c3) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix Better Auth HTTP adapter error handling to preserve auth error status/code instead of surfacing unexpected 500s.

## 0.6.1

### Patch Changes

- [#82](https://github.com/udecode/kitcn/pull/82) [`aed9972`](https://github.com/udecode/kitcn/commit/aed9972f5869949cfc02ca2eb6bfcb7e57fb754d) Thanks [@zbeyens](https://github.com/zbeyens)! - Migration example: https://github.com/udecode/kitcn/pull/82

  Added `AnyColumn` type export for self-referencing foreign keys (mirrors Drizzle's `AnyPgColumn`).

  ```ts
  import { type AnyColumn, convexTable, text } from "kitcn/orm";

  export const comments = convexTable("comments", {
    body: text().notNull(),
    parentId: text().references((): AnyColumn => comments.id, {
      onDelete: "cascade",
    }),
  });
  ```

## 0.6.0

### Minor Changes

- [#75](https://github.com/udecode/kitcn/pull/75) [`54eeb6d`](https://github.com/udecode/kitcn/commit/54eeb6d68909737b21b3dddfa860de0fc84e7924) Thanks [@zbeyens](https://github.com/zbeyens)! - - Added `kitcn/orm` as the recommended DB API surface (Drizzle-style schema/query/mutation API).

  - Docs: [/docs/db/orm](https://www.kitcn.dev/docs/db/orm)
  - Migration guide: [/docs/migrations/convex](https://www.kitcn.dev/docs/migrations/convex)

  ## Breaking changes

  - `createAuth(ctx)` is removed. Use `getAuth(ctx)` for query/mutation/action/http.

  ```ts
  // Before
  export const createAuth = (ctx: ActionCtx) =>
    betterAuth(createAuthOptions(ctx));
  app.use(authMiddleware(createAuth));

  // After
  export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));
  app.use(authMiddleware(getAuth));
  ```

  - `authClient.httpAdapter` is no longer needed. Use context-aware `adapter(...)`.

  ```ts
  // Before
  database: authClient.httpAdapter(ctx);

  // After
  database: authClient.adapter(ctx, getAuthOptions);
  ```

  - cRPC templates now use `ctx.orm` (not `ctx.table`) and string IDs at the API boundary.

  ```ts
  // Before
  input: z.object({ id: zid("user") });
  const user = await ctx.table("user").get(input.id);

  // After
  input: z.object({ id: z.string() });
  const user = await ctx.orm.query.user.findFirst({ where: { id: input.id } });
  ```

  - cRPC/auth context ID types are now string-based at the procedure boundary (`ctx.userId`, params, input/output IDs).

  ```ts
  // Before
  const userId: Id<"user"> = ctx.userId;

  // After
  const userId: string = ctx.userId;
  ```

  - `getAuthConfigProvider` should be imported from `kitcn/auth/config`.
    (instead of legacy `@convex-dev/better-auth/auth-config`, or old `kitcn/auth` docs)

  ```ts
  // Before
  import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

  // After
  import { getAuthConfigProvider } from "kitcn/auth/config";
  ```

  - Remove legacy app deps: `@convex-dev/better-auth`, `convex-ents`, and `convex-helpers`.

  ```sh
  bun remove @convex-dev/better-auth convex-ents convex-helpers
  ```

  - `convex-helpers` primitives are no longer part of the template path.
    Replace `zid(...)` with `z.string()`, and remove `customMutation`/`Triggers` wrappers in favor of:
    - `initCRPC.create()` defaults
    - trigger declarations in schema table config
  - ORM row shape is `id`/`createdAt` (not `_id`/`_creationTime`) at the app boundary.
    Update UI/client code and shared types accordingly.

  ## Features

  - `initCRPC.create()` supports default Convex builders, so old manual wiring is usually unnecessary.

  ```ts
  // Before (remove this boilerplate)
  const c = initCRPC.create({
    query,
    internalQuery,
    mutation,
    internalMutation,
    action,
    internalAction,
    httpAction,
  });
  const internalMutationWithTriggers = customMutation(...);

  // After
  const c = initCRPC.create();
  // Triggers are declared in schema table config.
  ```

  - cRPC now supports wire transformers end-to-end (Date codec included by default).
    - Supported in `initCRPC.create({ transformer })`, HTTP proxy, server caller, React client, and RSC query client.

  ```ts
  const c = initCRPC.create({ transformer: superjson });

  const http = createHttpProxy({
    convexSiteUrl,
    routes,
    transformer: superjson,
  });
  ```

  - Auth setup supports `triggers` + `context` in `createClient`, and `context` in `createApi`.

  ```ts
  const authClient = createClient({
    authFunctions,
    schema,
    triggers,
    context: getOrmCtx,
  });

  const authApi = createApi(schema, getAuth, {
    context: getOrmCtx,
  });
  ```

  - `createEnv` can replace manual env parsing/throw boilerplate.

  ```ts
  // Before
  export const getEnv = () => {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) throw new Error("Invalid environment variables");
    return parsed.data;
  };

  // After
  export const getEnv = createEnv({ schema: envSchema });
  ```

  - Added new public server helpers: context guards (`isActionCtx`/`requireActionCtx`, etc.).

  ## Patched

  - Updated template and docs to use:
    - `kitcn/auth/client` (`convexClient`)
    - `kitcn/auth/config` (`getAuthConfigProvider`)
  - Example app migration now reflects the current user-facing API (`ctx.orm`, `getAuth(ctx)`, simpler `initCRPC.create()`).
  - cRPC/server error handling now normalizes known causes into deterministic CRPC errors:
    - `OrmNotFoundError` -> `NOT_FOUND`
    - `APIError` status/statusCode -> mapped cRPC code
    - standard `Error.message`/stack preservation on wrapped errors
  - HTTP route validation errors (params/query/body/form) now return `BAD_REQUEST` consistently.
  - `createAuthMutations` now throws `AUTH_STATE_TIMEOUT` when auth token never appears after sign-in/up flow.
  - `getSession` now returns `null` when no session id is present (instead of attempting invalid DB lookups).
  - CLI reliability improvements (`kitcn dev/codegen/env`): argument parsing and entrypoint resolution are more robust across runtime/symlink setups.

  ```ts
  // Client import migration
  // Before
  import { convexClient } from "@convex-dev/better-auth/client/plugins";

  // After
  import { convexClient } from "kitcn/auth/client";
  ```

  ```ts
  // Retry only non-deterministic errors
  import { isCRPCError } from "kitcn/crpc";

  retry: (count, error) => !isCRPCError(error) && count < 3;
  ```

## 0.5.8

### Patch Changes

- [#73](https://github.com/udecode/kitcn/pull/73) [`232d126`](https://github.com/udecode/kitcn/commit/232d12697602e5c1cb3965b6e12cfe9b880d3c5c) Thanks [@zbeyens](https://github.com/zbeyens)! - Support multiple WHERE conditions in `update()` for Better Auth organization plugin compatibility.
  - Multiple AND conditions with equality checks now work
  - Validates exactly 1 document matches before updating (prevents accidental bulk updates)
  - OR conditions and non-eq operators still require `updateMany()`

## 0.5.7

### Patch Changes

- [#61](https://github.com/udecode/kitcn/pull/61) [`7e63e54`](https://github.com/udecode/kitcn/commit/7e63e541fc2853d8d1d45e4f1fb7db3f82e0592c) Thanks [@zbeyens](https://github.com/zbeyens)! - Auth mutation hooks now properly trigger `onError` when Better Auth returns errors (401, 422, etc.).

  ```tsx
  // Before: onSuccess always ran, even on errors
  // After: onError fires on auth failures

  const signUp = useMutation(
    useSignUpMutationOptions({
      onSuccess: () => router.push("/"), // Only on success now
      onError: (error) => toast.error(error.message), // Fires on auth errors
    })
  );
  ```

  New exports: `AuthMutationError` class and `isAuthMutationError` type guard for error handling.

## 0.5.6

### Patch Changes

- [`fdeae26`](https://github.com/udecode/kitcn/commit/fdeae26ef81b46dc1334a4940814628d398659d9) Thanks [@zbeyens](https://github.com/zbeyens)! - - Support Convex 1.31.6
  - Missing `jotai` dependency

## 0.5.5

### Patch Changes

- [#56](https://github.com/udecode/kitcn/pull/56) [`b34a396`](https://github.com/udecode/kitcn/commit/b34a39621af83c6b6f2b2e6e11e35997981c5bb4) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `ConvexProviderWithAuth` for `@convex-dev/auth` users (React Native):

  ```tsx
  import { ConvexProviderWithAuth } from "kitcn/react";

  <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
    <App />
  </ConvexProviderWithAuth>;
  ```

  Enables `skipUnauth` queries, `useAuth`, and conditional rendering components.

## 0.5.4

### Patch Changes

- [#54](https://github.com/udecode/kitcn/pull/54) [`4321118`](https://github.com/udecode/kitcn/commit/43211189285333f998cef34c7726efa1735837aa) Thanks [@zbeyens](https://github.com/zbeyens)! - Support nested file structures in meta generation:

  ```
  convex/functions/
    todos.ts           → crpc.todos.*
    items/queries.ts   → crpc.items.queries.*
  ```

  - Organize functions in subdirectories
  - `_` prefixed files/directories are excluded

## 0.5.3

### Patch Changes

- [#44](https://github.com/udecode/kitcn/pull/44) [`ea6bfce`](https://github.com/udecode/kitcn/commit/ea6bfce4fb20dda7afdad4a9d0663aa7021e2a88) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix queries throwing without auth provider.

## 0.5.2

### Patch Changes

- [`185f496`](https://github.com/udecode/kitcn/commit/185f496c6b64e70cba96adcfe25e459c8c559a92) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `staticQueryOptions` method to CRPC proxy for non-hook usage in event handlers.

- [`2288076`](https://github.com/udecode/kitcn/commit/228807652c04df9bdb1e9f054a0664d35a643ff2) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix `MiddlewareBuilder` generic parameter mismatch causing typecheck failures when using reusable middleware with `.use()`. Factory functions now correctly pass through the `TInputOut` parameter added in v0.5.1.

## 0.5.1

### Patch Changes

- [#39](https://github.com/udecode/kitcn/pull/39) [`ede0d47`](https://github.com/udecode/kitcn/commit/ede0d473ed8f7254f44b9edb86172cfd3c900857) Thanks [@zbeyens](https://github.com/zbeyens)! - Middleware now receives `input` and `getRawInput` parameters:

  ```ts
  publicQuery
    .input(z.object({ projectId: zid("projects") }))
    .use(async ({ ctx, input, next }) => {
      // input.projectId is typed!
      const project = await ctx.db.get(input.projectId);
      return next({ ctx: { ...ctx, project } });
    });
  ```

  - Middleware after `.input()` receives typed input
  - Middleware before `.input()` receives `unknown`
  - `getRawInput()` returns raw input before validation
  - `next({ input })` allows modifying input for downstream middleware
  - Non-breaking: existing middleware works unchanged

## 0.5.0

### Minor Changes

- [#34](https://github.com/udecode/kitcn/pull/34) [`e2a2f62`](https://github.com/udecode/kitcn/commit/e2a2f6258d75007c39b6dc86d6000e0a9460052d) Thanks [@zbeyens](https://github.com/zbeyens)! - URL searchParams now auto-coerce to numbers and booleans based on Zod schema type, eliminating `z.coerce.*` boilerplate:

  ```ts
  // Before: Required z.coerce.* boilerplate
  .searchParams(z.object({
    page: z.coerce.number().optional(),
    active: z.coerce.boolean().optional(),
  }))

  // After: Standard Zod schemas work directly
  .searchParams(z.object({
    page: z.number().optional(),
    active: z.boolean().optional(),
  }))
  ```

  Coercion behavior:

  - `z.number()` - parses string to number (`"5"` → `5`)
  - `z.boolean()` - parses `"true"`/`"1"` → `true`, everything else → `false`
  - Works with `.optional()`, `.nullable()`, `.default()` wrappers
  - `z.coerce.*` still works if preferred

  ### Vanilla CRPC client

  `useCRPCClient()` now returns a typed proxy for direct procedural calls without React Query:

  ```ts
  const client = useCRPCClient();

  // Convex functions
  const user = await client.user.get.query({ id });
  await client.user.update.mutate({ id, name: "test" });

  // HTTP endpoints
  const todos = await client.http.todos.list.query();
  await client.http.todos.create.mutate({ title: "New" });
  ```

  Useful for event handlers, effects, or when you don't need caching/deduplication.

  **Breaking:** `useCRPCClient()` return type changed from `ConvexReactClient` to typed proxy. Use `useConvex()` (now exported from `kitcn/react`) for raw client access.

  ### Error handling: `isCRPCError` helper

  New unified error check for retry logic - returns true for any deterministic CRPC error (Convex 4xx or HTTP 4xx):

  ```ts
  import { isCRPCError } from "kitcn/crpc";

  // In query client config
  retry: (failureCount, error) => {
    if (isCRPCError(error)) return false; // Don't retry client errors
    return failureCount < 3;
  };
  ```

## 0.4.0

### Minor Changes

- [#31](https://github.com/udecode/kitcn/pull/31) [`618ec38`](https://github.com/udecode/kitcn/commit/618ec386eaf7e893d87570616871386953789753) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Client: Hybrid API

  The HTTP client now uses a hybrid API combining tRPC-style JSON body at root level with explicit `params`/`searchParams` for URL data.

  #### Breaking Changes

  - **Query/mutation args restructured**: Path params and search params now use explicit keys instead of flat merging
    - Before: `queryOptions({ id: '123', limit: 10 })`
    - After: `queryOptions({ params: { id: '123' }, searchParams: { limit: '10' } })`
  - **Client options in args**: `fetch`, `init`, `headers` go in args (1st param)
    - `queryOptions(args?, queryOpts?)` - args = params/searchParams/form/headers/etc
    - `mutationOptions(mutationOpts?)` - client opts go in `mutate(args)` call
  - **Server handler `query` renamed to `searchParams`**: Consistent naming between client and server
    - Before: `.query(async ({ query }) => { query.limit })`
    - After: `.query(async ({ searchParams }) => { searchParams.limit })`

  #### New Features

  - **Explicit input args**: `params`, `searchParams` keys for clear separation
  - **JSON body at root**: Non-reserved keys spread at root level (tRPC-style): `mutate({ title: 'New' })`
  - **Typed form uploads**: `.form()` builder method for typed FormData schemas (client args + server handler)
  - **Client options in args**: Per-request `fetch`, `init`, `headers` in args (1st param)
  - **mutationOptions for GET**: Use `useMutation` for one-time fetches (exports/downloads) without caching

  #### Migration

  ```tsx
  // Client: Before
  crpc.http.todos.list.queryOptions({ limit: 10 });
  updateTodo.mutate({ id, completed: true });
  deleteTodo.mutate({ id });

  // Client: After
  crpc.http.todos.list.queryOptions({ searchParams: { limit: "10" } });
  updateTodo.mutate({ params: { id }, completed: true });
  deleteTodo.mutate({ params: { id } });

  // Headers go in args (1st param)
  // Before: queryOptions({ header: { 'X-Custom': 'value' } })
  // After:
  crpc.http.todos.list.queryOptions({ headers: { 'X-Custom': 'value' } });

  // Mutations: client opts in mutate args
  updateTodo.mutate({ params: { id }, completed: true, headers: { 'X-Custom': 'value' } });

  // Server: Before
  .query(async ({ query }) => ({ limit: query.limit }))

  // Server: After
  .query(async ({ searchParams }) => ({ limit: searchParams.limit }))

  // Server: Typed form (new)
  .form(z.object({ file: z.instanceof(Blob) }))
  .mutation(async ({ form }) => {
    // form.file is typed as Blob
  })
  ```

## 0.3.1

### Patch Changes

- [#29](https://github.com/udecode/kitcn/pull/29) [`2638311`](https://github.com/udecode/kitcn/commit/26383112835605dd806151832edfbcd98e1e75b2) Thanks [@zbeyens](https://github.com/zbeyens)! - - Move hono to peerDependencies (type-only imports in package)
  - Add stale cursor auto-recovery for `useInfiniteQuery` - automatically recovers from stale pagination cursors after WebSocket reconnection without losing scroll position

## 0.3.0

### Minor Changes

- [#27](https://github.com/udecode/kitcn/pull/27) [`6309e68`](https://github.com/udecode/kitcn/commit/6309e688b3f92b07877966a6f6f7929f2cb7ade0) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Router: Hono Integration

  The HTTP router now wraps a Hono app, enabling full middleware support.

  #### New Features

  - **Hono-based routing**: `createHttpRouter(app, router)` accepts a Hono app
  - **Auth middleware**: `authMiddleware(createAuth)` for Better Auth routes
  - **Hono context in handlers**: Access `c.json()`, `c.text()`, `c.redirect()`, `c.req`
  - **Non-JSON response support**
  - **CLI watch improvements**: Watches `routers/**/*.ts` and `http.ts` for changes

  #### Breaking Changes

  - **Removed `response()` mode**: Return `Response` directly from handler
  - **Removed per-procedure `cors()`**: Use Hono's `cors()` middleware
  - **CORS via Hono**: `app.use('/api/*', cors())` instead of router options
  - **Handler signature**: `{ ctx, c, input, params, query }` - `c` is Hono Context

  #### Migration

  Before:

  ```ts
  import { registerRoutes } from "kitcn/auth/http";
  import { registerCRPCRoutes } from "kitcn/server";
  import { httpRouter } from "convex/server";

  const http = httpRouter();

  registerRoutes(http, createAuth);

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: {
      allowedOrigins: [process.env.SITE_URL!],
      allowCredentials: true,
    },
  });

  export default http;
  ```

  After:

  ```ts
  import { authMiddleware } from "kitcn/auth/http";
  import { createHttpRouter } from "kitcn/server";
  import { Hono } from "hono";
  import { cors } from "hono/cors";

  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: process.env.SITE_URL!,
      credentials: true,
    })
  );

  app.use(authMiddleware(createAuth));

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  export default createHttpRouter(app, appRouter);
  ```

  #### Handler Examples with `c`

  cRPC handlers now receive `c` (Hono Context) for custom responses:

  ```ts
  // File download with custom headers
  export const download = authRoute
    .get("/api/todos/export/:format")
    .params(z.object({ format: z.enum(["json", "csv"]) }))
    .query(async ({ ctx, params, c }) => {
      const todos = await ctx.runQuery(api.todos.list, {});

      c.header(
        "Content-Disposition",
        `attachment; filename="todos.${params.format}"`
      );

      if (params.format === "csv") {
        return c.text(todos.map((t) => `${t.id},${t.title}`).join("\n"));
      }
      return c.json({ todos });
    });

  // Webhook with signature verification
  export const webhook = publicRoute
    .post("/webhooks/stripe")
    .mutation(async ({ ctx, c }) => {
      const signature = c.req.header("stripe-signature");
      if (!signature) throw new CRPCError({ code: "BAD_REQUEST" });

      const body = await c.req.text();
      await ctx.runMutation(internal.stripe.process, { body, signature });

      return c.text("OK", 200);
    });

  // Redirect
  export const redirect = publicRoute
    .get("/api/old-path")
    .query(async ({ c }) => c.redirect("/api/new-path", 301));
  ```

## 0.2.1

### Patch Changes

- [#24](https://github.com/udecode/kitcn/pull/24) [`b5555ea`](https://github.com/udecode/kitcn/commit/b5555eac9e67ef06328f5e122ce2d4512f3b3c7f) Thanks [@zbeyens](https://github.com/zbeyens)! - - Fix (`UNAUTHORIZED`) queries failing after switching tabs and returning to the app. The auth token is now preserved during session refetch instead of being cleared.
  - Fix (`UNAUTHORIZED`) `useSuspenseQuery` failing on initial page load when auth is still loading. WebSocket subscriptions now wait for auth to settle before connecting.
  - Fix logout setting `isAuthenticated: false` before unsubscribing to prevent query re-subscriptions.
  - Add missing `dotenv` dependency for CLI.

## 0.2.0

### Minor Changes

- [#22](https://github.com/udecode/kitcn/pull/22) [`27d355e`](https://github.com/udecode/kitcn/commit/27d355e4ac067503e00bf534164c6ce2974a8a46) Thanks [@zbeyens](https://github.com/zbeyens)! - **BREAKING:** Refactored `createCRPCContext` and `createServerCRPCProxy` to use options object:

  Before:

  ```ts
  createCRPCContext(api, meta);
  createServerCRPCProxy(api, meta);
  ```

  After:

  ```ts
  createCRPCContext<Api>({ api, meta, convexSiteUrl });
  createServerCRPCProxy<Api>({ api, meta });
  ```

  **BREAKING:** `getServerQueryClientOptions` now requires `convexSiteUrl`:

  ```ts
  getServerQueryClientOptions({
    getToken: caller.getToken,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });
  ```

  **Feature:** Added type-safe HTTP routes with tRPC-style client:

  ```ts
  // 1. Pass httpAction to initCRPC.create()
  const c = initCRPC.dataModel<DataModel>().create({
    query, mutation, action, httpAction,
  });
  export const publicRoute = c.httpAction;
  export const authRoute = c.httpAction.use(authMiddleware);
  export const router = c.router;

  // 2. Define routes with .get()/.post()/.patch()/.delete()
  export const health = publicRoute
    .get('/api/health')
    .output(z.object({ status: z.string() }))
    .query(async () => ({ status: 'ok' }));

  // 3. Use .params(), .searchParams(), .input() for typed inputs
  export const todosRouter = router({
    list: publicRoute.get('/api/todos')
      .searchParams(z.object({ limit: z.coerce.number().optional() }))
      .query(...),
    get: publicRoute.get('/api/todos/:id')
      .params(z.object({ id: zid('todos') }))
      .query(...),
    create: authRoute.post('/api/todos')
      .input(z.object({ title: z.string() }))
      .mutation(...),
  });

  // 4. Register with CORS
  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: { allowedOrigins: [process.env.SITE_URL!], allowCredentials: true },
  });

  // 5. Add to Api type for inference
  export type Api = WithHttpRouter<typeof api, typeof appRouter>;

  // 6. Client: TanStack Query integration via crpc.http.*
  const crpc = useCRPC();
  useSuspenseQuery(crpc.http.todos.list.queryOptions({ limit: 10 }));
  useMutation(crpc.http.todos.create.mutationOptions());
  queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());

  // 7. RSC: prefetch helper
  prefetch(crpc.http.health.queryOptions({}));
  ```

  **Fix:** Improved authentication in `ConvexAuthProvider`:

  - **FetchAccessTokenContext**: New context passes `fetchAccessToken` through React tree - eliminates race conditions where token wasn't available during render
  - **Token Expiration Tracking**: Added `expiresAt` field with `decodeJwtExp()` - 60s cache leeway prevents unnecessary token refreshes
  - **SSR Hydration Fix**: Defensive `isLoading` check prevents UNAUTHORIZED errors when Better Auth briefly returns null during hydration
  - **Removed HMR persistence**: No more globalThis Symbol storage (`getPersistedToken`/`persistToken`)
  - **Simplified AuthStore**: Removed `guard` method and `AuthEffect` - state synced via `useConvexAuth()` directly

## 0.1.0

### Minor Changes

- [#18](https://github.com/udecode/kitcn/pull/18) [`681e9ba`](https://github.com/udecode/kitcn/commit/681e9bafdeaa62928f15fe9781f944d42ce2d2b4) Thanks [@zbeyens](https://github.com/zbeyens)! - Initial release
