---
title: feat: Support nested files in meta generation
type: feat
date: 2026-01-27
deepened: 2026-01-27
---

# feat: Support nested files in meta generation

## Enhancement Summary

**Deepened on:** 2026-01-27
**Research agents used:** code-simplicity-reviewer, kieran-typescript-reviewer, Context7 Node.js docs

### Key Improvements
1. **Simpler approach**: Use flat keys with `/` separator instead of nested objects
2. **Type safety**: Added proper recursive types, eliminated `any`
3. **Edge case handling**: Input validation for empty/invalid paths
4. **DRY refactor**: Extract shared utilities before extending

### Critical Findings
- Flat keys (`'items/queries'`) are simpler than nested objects
- 4 files have duplicated `getFuncRef`/`getFunctionType` - extract first
- Node.js 22+ has built-in `globSync` from `node:fs`

---

## Overview

Add recursive directory scanning to `kitcn codegen` so meta is generated for nested file structures like `convex/functions/items/queries.ts`.

## Problem Statement

Current codegen only scans top-level `.ts` files in the functions directory:

```typescript
// codegen.ts:184-192
const files = fs
  .readdirSync(functionsDir)
  .filter((file) =>
    file.endsWith('.ts') && !file.startsWith('_') && !['schema.ts', ...].includes(file)
  );
```

Users organizing by domain (`convex/functions/items/queries.ts`, `convex/functions/items/mutations.ts`) get no meta generated.

## Research: How tRPC Does It

tRPC uses **manual router merging** - not automatic file scanning:

```typescript
// routers/_app.ts
import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = router({
  user: userRouter,  // namespace = 'user'
  post: postRouter,  // namespace = 'post'
});
```

**Key insight**: tRPC's namespace comes from the merge key, not the filename. This is manual but explicit.

## Proposed Solution (Revised)

### Research Insights

**Simplification from code-simplicity-reviewer:**

Use **flat keys with `/` separator** instead of nested objects. This:
- Requires no recursive object generation in codegen
- Needs minimal consumer changes (~3 lines each)
- Keeps meta structure flat and predictable

### Meta Output Format (Simplified)

```typescript
// Before (flat, top-level only)
export const meta = {
  todos: { create: {...}, list: {...} },
} as const;

// After (flat keys with path separator)
export const meta = {
  todos: { create: {...}, list: {...} },
  'items/queries': { list: {...}, get: {...} },
  'items/mutations': { create: {...}, update: {...} },
} as const;
```

**Why not nested objects?**
- Nested objects require recursive generation + traversal
- Flat keys work with existing lookup pattern
- Consumer change is trivial: just compute the key differently

## Technical Approach

### Phase 0: Extract Shared Utilities (DRY First)

**Current duplication found:**
- `getFuncRef` duplicated in 4 files (~60 LOC total)
- `getFunctionType` duplicated in 4 files

**Create shared utility:**

```typescript
// packages/kitcn/src/shared/meta-utils.ts

import type { Meta, FnMeta } from './types';

const EXCLUDED_FILES = new Set(['schema.ts', 'convex.config.ts', 'auth.config.ts']);

/**
 * Check if a file path should be included in meta generation
 */
export function isValidConvexFile(file: string): boolean {
  // Skip private files/directories (prefixed with _)
  if (file.startsWith('_') || file.includes('/_')) return false;

  // Skip known config files
  const basename = file.split('/').pop() ?? '';
  if (EXCLUDED_FILES.has(basename)) return false;

  return true;
}

/**
 * Get function metadata from nested path
 * @param meta - The meta object
 * @param namespace - Module namespace (e.g., 'todos' or 'items/queries')
 * @param fnName - Function name
 */
export function getFunctionMeta(
  meta: Meta,
  namespace: string,
  fnName: string
): FnMeta | undefined {
  return (meta as Record<string, Record<string, FnMeta>>)[namespace]?.[fnName];
}

/**
 * Get function type from meta
 */
export function getFunctionType(
  meta: Meta,
  namespace: string,
  fnName: string
): 'query' | 'mutation' | 'action' | undefined {
  return getFunctionMeta(meta, namespace, fnName)?.type;
}
```

### Phase 1: Update Codegen

```typescript
// codegen.ts changes
import { globSync } from 'node:fs';  // Node.js 22+ built-in
import { basename } from 'node:path';
import { isValidConvexFile } from '../shared/meta-utils';

// Replace flat file scan with recursive
const files = globSync('**/*.ts', { cwd: functionsDir })
  .filter(isValidConvexFile);

// For each file, use path (minus .ts) as namespace key
for (const file of files) {
  const namespace = file.replace(/\.ts$/, '');  // 'items/queries'

  const { meta: moduleMeta } = await parseModuleRuntime(
    path.join(functionsDir, file),
    jiti
  );

  if (moduleMeta) {
    meta[namespace] = moduleMeta;
  }
}
```

**Research Insights - Node.js glob:**

```typescript
// Node.js 22+ has built-in globSync
import { globSync } from 'node:fs';
console.log(globSync('**/*.ts'));

// With ignore patterns
const files = globSync('**/*.ts', {
  cwd: functionsDir,
  ignore: ['_*', '*/_*', 'schema.ts', 'convex.config.ts', 'auth.config.ts']
});
```

### Phase 2: Update Consumers

**Minimal change - compute namespace from path:**

```typescript
// Before (assumes flat structure)
const [namespace, fnName] = funcRef.split('.');
const fnType = meta[namespace]?.[fnName]?.type;

// After (supports nested paths)
const parts = funcRef.split('.');
const fnName = parts.pop()!;
const namespace = parts.join('/');  // 'items.queries' -> 'items/queries'
const fnType = getFunctionType(meta, namespace, fnName);
```

**Files to update:**
1. `proxy.ts:71` - use shared `getFunctionType`
2. `vanilla-client.ts:51` - use shared `getFunctionType`
3. `caller.ts:107` - use shared `getFunctionType`
4. `proxy-server.ts:118` - use shared `getFunctionType`

### Edge Cases to Handle

**From TypeScript review:**

```typescript
// Input validation for namespace/fnName
export function getFunctionMeta(
  meta: Meta,
  namespace: string,
  fnName: string
): FnMeta | undefined {
  // Validate inputs
  if (!namespace || !fnName) return undefined;
  if (typeof namespace !== 'string' || typeof fnName !== 'string') return undefined;

  return (meta as Record<string, Record<string, FnMeta>>)[namespace]?.[fnName];
}
```

**Edge cases covered:**
- Empty path: `''` → returns undefined
- Invalid path: `'.foo'`, `'foo.'` → returns undefined
- Missing namespace: `'missingModule.fn'` → returns undefined

## Acceptance Criteria

- [x] Codegen recursively scans subdirectories in functions dir
- [x] Nested files use path as namespace key (e.g., `'items/queries'`)
- [x] Flat files continue to work (backward compatible)
- [x] `_` prefixed dirs/files are excluded
- [x] Shared `getFunctionType` utility created and used
- [x] Edge cases handled (empty paths, invalid inputs)
- [x] Existing tests pass
- [x] Add tests for nested file structures

## Files to Modify

### New Files
1. `packages/kitcn/src/shared/meta-utils.ts` - shared utilities

### Modified Files
1. `packages/kitcn/src/cli/codegen.ts` - recursive scanning
2. `packages/kitcn/src/react/proxy.ts` - use shared utility
3. `packages/kitcn/src/react/vanilla-client.ts` - use shared utility
4. `packages/kitcn/src/server/caller.ts` - use shared utility
5. `packages/kitcn/src/rsc/proxy-server.ts` - use shared utility

## Implementation Order

1. **Create shared utility** - `meta-utils.ts` with `getFunctionType`, `isValidConvexFile`
2. **Update consumers** - Replace duplicated code with shared utility (DRY)
3. **Update codegen** - Add recursive glob scanning
4. **Add tests** - Test nested file structures
5. **Update docs** - Document nested file support

## Questions Resolved

| Question | Answer |
|----------|--------|
| Nested objects vs flat keys? | **Flat keys** - simpler, minimal changes |
| Extract shared utilities first? | **Yes** - DRY before extending |
| Node.js glob availability? | **Node 22+** has built-in `globSync` |
| Handle >2 levels nesting? | **Yes** - `a/b/c` works as namespace |

## References

- Current codegen: [codegen.ts:184-192](packages/kitcn/src/cli/codegen.ts#L184-L192)
- tRPC merging routers: https://trpc.io/docs/server/merging-routers
- Convex API structure: Uses nested `api.folder.file.function` pattern
- Node.js glob docs: https://nodejs.org/api/fs.html#fsglobsyncpattern-options
