# Create Plugins

Canonical patterns for new Better Convex plugins.

## Goals

1. Keep runtime bundles entry-local.
2. Keep plugin install/type-gating schema-driven.
3. Keep scaffolds predictable and user-owned.
4. Keep CLI generic; plugin behavior comes from plugin manifests.

## Package Layout

Use split package entries:

1. `@better-convex/<plugin>`: runtime middleware capability + stable runtime helpers.
2. `@better-convex/<plugin>/schema`: lightweight schema plugin factory + CLI manifest metadata.

Do not make schema entry import heavy runtime deps.

## Runtime API Contract

Use middleware-scoped access with one runtime primitive:

```ts
// app code
import { MyPlugin } from '@better-convex/my-plugin';
import { createPluginsMyPluginCaller } from './generated/plugins/my-plugin.runtime';
import { privateMutation } from './lib/crpc';

export const myPlugin = MyPlugin.configure({
  enabled: true,
});

export const myProcedure = privateMutation.use(myPlugin.middleware())
  .mutation(async ({ ctx }) => {
    const caller = createPluginsMyPluginCaller(ctx);
    await caller.doWork({});
  });
```

Rules:

1. No `ctx.getApi(...)` runtime path.
2. Middleware injects plugin config at `ctx.plugins.<plugin>`.
3. Use generated callers (`createPlugins<Plugin>Caller(ctx)`) for internal function composition.
4. Reusable defaults go on plugin chain via `.configure(...)`.
5. Prefer object config:

```ts
const myPlugin = MyPlugin.configure({ foo: 'bar' });
```

6. Use callback config only when context is required:

```ts
const myPlugin = MyPlugin.configure(({ ctx }) => ({
  userId: (ctx as { userId?: string }).userId,
}));
```

7. No helper alternatives like `getMyPlugin(...)`.
8. Plugin runtime code must use ORM context (`ctx.orm`); never call raw `ctx.db`.

## Private Procedure Contract

Plugin internal Convex functions should be scaffold-owned cRPC private procedures.

Rules:

1. Reuse project cRPC builders from `convex/<paths.lib>/crpc.ts`.
2. Define plugin internals with `privateQuery`, `privateMutation`, `privateAction` and chain plugin middleware per procedure.
3. Do not define plugin internals with vanilla `internalQuery/internalMutation/internalAction`.
4. Do not ship `create*Runtime` factory patterns from plugin packages.
5. Do not ship `build*Handlers` wrapper factories from plugin packages.
6. Do not use `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` for plugin internal composition. Use `create<Module>Caller(ctx)` from `generated/<module>.runtime`.
7. Hook/callback fanout should be scaffold-owned internal procedures (for example `onEmailEvent`), not dynamic function-handle config.

## Schema Plugin Contract

Plugin schema package should expose a schema-only descriptor.

Expected shape:

1. `key`
2. `schema.tableNames`
3. `schema.inject(...)`
4. optional `schema.relations(...)`

Do not put CLI scaffolding or codegen module metadata on `OrmSchemaPlugin`.
CLI metadata lives in central catalog: `packages/better-convex/src/cli/plugin-catalog.ts`.

Relation composition rules:

1. Plugin `schema.relations(...)` is merged before app `defineSchema(..., { relations })`.
2. Duplicate relation fields (`table.field`) throw.
3. Use plugin relation defaults for baseline wiring; app-level relations should extend, not duplicate fields.

Table override rules:

1. First-party schema factories can expose `tables` overrides for advanced users.
2. Overrides should replace by logical key (for example `resendEmails`) while keeping canonical table names.
3. Keep override API explicit in plugin factory options; do not auto-detect from app schema keys.

Schema install is canonical:

```ts
import { myPlugin } from '@better-convex/my-plugin/schema';

export default defineSchema(tables, {
  plugins: [myPlugin()],
});
```

## Scaffold Rules

1. Plugin Convex function exports live in one scaffold-owned file: `<functionsDir>/plugins/<plugin>.ts`.
2. Non-function helpers live under `convex/<paths.lib>/plugins/<plugin>/...` (default `convex/lib/plugins/<plugin>/...`).
3. `better-convex codegen` must not generate plugin runtime modules.
4. Scaffold templates need stable template IDs.
5. `add` can merge/upsert scaffold mappings; never clobber custom files unless overwrite is explicit.
6. `diff` is read-only drift detection.
7. If plugin packages expose runtime helpers, keep them focused on stable logic; function wiring stays in scaffold files.
8. Keep ORM usage (`ctx.orm`) inside scaffold-owned procedures. Package code should avoid direct plugin procedure ORM orchestration.

## Lockfile Rules

Lockfile path is fixed:

`<functionsDir>/plugins.lock.json`

Current contract:

1. `plugins.<plugin>.package = <packageName>` (required)
2. optional `plugins.<plugin>.files.<templateId> = <relativePath>`

No `version` or timestamp fields in lockfile.

## CLI Manifest Guidance

Each plugin should provide:

1. label/description for prompts and list output
2. preset definitions (only for real variants, not pseudo options)
3. scaffold template resolver
4. schema import + plugin registration metadata

CLI stays plugin-agnostic; plugin-specific flags should not be added globally.

## Test Checklist

1. middleware ctx typing: `ctx.plugins.<plugin>` available only after `.use(plugin.middleware())`
2. codegen: no plugin runtime artifacts are generated
3. stale cleanup: `generated/plugins/**` artifacts are removed
4. add flow: idempotent scaffold writes + lockfile mapping
5. diff flow: changed/missing scaffold drift
6. runtime parity tests for plugin API methods exposed via middleware
