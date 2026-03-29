---
name: scaffold-owned-plugin-schema-cutover
description: 'Skill: scaffold-owned-plugin-schema-cutover'
---

# Scaffold-Owned Plugin Schema Cutover

## Problem

Hard-removing package `/schema` entrypoints looks simple, then fails in five boring places:

- package build configs still point at `src/schema.ts`
- CLI scaffolds still import package schema modules
- example app still imports package schema modules
- docs and skills keep teaching dead imports
- tests keep assuming package-owned schema registration

## Trigger Conditions

Use this when all of these are true:

1. A first-party plugin schema moves to `convex/lib/plugins/<plugin>/schema.ts`
2. The package becomes runtime-only
3. CLI `add <plugin>` must scaffold and register the local schema file

## Solution

### 1. Cut the package entrypoint fully

- Delete `packages/<plugin>/src/schema.ts`
- Remove `./schema` from `package.json` exports
- Remove `src/schema.ts` from `tsdown.config.ts` entry maps

If you skip the `tsdown` entry cleanup, package builds fail with:

`Cannot resolve entry module src/schema.ts`

### 2. Move schema ownership into CLI templates

- Add `convex/lib/plugins/<plugin>/schema.ts` template in `packages/kitcn/src/cli/plugins/<plugin>/`
- Register it in `plugin-catalog.ts`
- Make function/runtime templates import local schema via a placeholder, not package `/schema`
- Update schema registration metadata so `kitcn add` imports the local extension into root schema

### 3. Regenerate scaffold outputs

- Never patch example plugin files first
- Regenerate with `kitcn add <plugin> --overwrite --no-codegen`
- Verify `example/convex/functions/schema.ts` imports `../lib/plugins/<plugin>/schema`

### 4. Update docs and skills in the same pass

Update all of these together:

- `www/content/docs/plugins/*`
- `www/content/docs/concepts.mdx`
- `www/content/docs/templates.mdx`
- `packages/kitcn/skills/convex/references/setup/*`
- `packages/kitcn/skills/convex/references/features/create-plugins.md`

The public story should be one thing only: runtime package + scaffolded local schema extension.

### 5. Update tests to assert local schema ownership

Minimum coverage:

- CLI `add` writes `convex/lib/plugins/<plugin>/schema.ts`
- Root schema imports local `<plugin>Extension`
- ORM tests use local `defineSchemaExtension(...)` fixtures, not package schema helpers
- Example/codegen/typecheck passes with local schema imports

## Verification

Run this set after the cutover:

```bash
bun --cwd packages/kitcn build
bun --cwd packages/resend build
bun --cwd packages/ratelimit build
touch example/convex/functions/schema.ts
bun run --cwd example codegen
bun lint:fix
bun typecheck
bun test packages/kitcn/src/cli/cli.test.ts packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/cli/config.test.ts packages/kitcn/src/orm/schema-integration.test.ts packages/kitcn/src/orm/create-orm.test.ts
```

## Example

Before:

```ts
import { ratelimitPlugin } from '@kitcn/ratelimit/schema';

export default defineSchema(tables, {
  plugins: [ratelimitPlugin()],
});
```

After:

```ts
import { ratelimitExtension } from '../lib/plugins/ratelimit/schema';

export default defineSchema(tables, {
  extensions: [ratelimitExtension()],
});
```

## Notes

If package build fails immediately after the deletion, check `tsdown.config.ts` before touching anything else. That one bites first and wastes time.

