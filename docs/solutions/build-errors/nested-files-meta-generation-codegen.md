---
title: Support nested files in meta generation
category: build-errors
tags:
  - codegen
  - meta-generation
  - nested-files
  - recursive-scanning
  - globSync
severity: medium
component: packages/kitcn/src/cli/codegen.ts
date: 2026-01-27
---

# Support nested files in meta generation

## Problem

Codegen only scanned top-level `.ts` files in the functions directory, causing users organizing code by domain (e.g., `convex/functions/items/queries.ts`) to have no meta generated for nested files.

```typescript
// codegen.ts:184-192 - Original implementation
const files = fs
  .readdirSync(functionsDir)
  .filter((file) =>
    file.endsWith('.ts') && !file.startsWith('_') && !['schema.ts', ...].includes(file)
  );
```

## Root Cause

The original design used `fs.readdirSync()` which only reads immediate children of a directory. There was no recursive scanning logic, so nested file structures were completely ignored during meta generation.

## Solution

### 1. Use flat keys with `/` separator

Instead of nested objects, use flat keys with path separator:

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

### 2. Replace flat scan with recursive glob

```typescript
import { globSync } from 'node:fs';  // Node.js 22+ built-in

const files = globSync('**/*.ts', { cwd: functionsDir })
  .filter(isValidConvexFile);

for (const file of files) {
  const namespace = file.replace(/\.ts$/, '');  // 'items/queries'
  // ... generate meta for namespace
}
```

### 3. Extract shared utilities (DRY)

Created `packages/kitcn/src/shared/meta-utils.ts`:

```typescript
const EXCLUDED_FILES = new Set(['schema.ts', 'convex.config.ts', 'auth.config.ts']);

export function isValidConvexFile(file: string): boolean {
  if (file.startsWith('_') || file.includes('/_')) return false;
  const basename = file.split('/').pop() ?? '';
  if (EXCLUDED_FILES.has(basename)) return false;
  return true;
}

export function getFunctionMeta(
  meta: Meta,
  namespace: string,
  fnName: string
): FnMeta | undefined {
  if (!namespace || !fnName) return undefined;
  return (meta as Record<string, Record<string, FnMeta>>)[namespace]?.[fnName];
}

export function getFunctionType(
  meta: Meta,
  namespace: string,
  fnName: string
): 'query' | 'mutation' | 'action' | undefined {
  return getFunctionMeta(meta, namespace, fnName)?.type;
}
```

### 4. Update consumers

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

## Why Flat Keys Over Nested Objects

- Requires no recursive object generation in codegen
- Needs minimal consumer changes (~3 lines each)
- Keeps meta structure flat and predictable
- Works with existing lookup patterns

## Prevention

- When designing lookup systems, consider nested paths from the start
- Prefer flat data structures with path-based keys over deeply nested objects
- Use `globSync` from Node.js 22+ for recursive file scanning (no external deps)

## Files Modified

### New Files
- `packages/kitcn/src/shared/meta-utils.ts` - shared utilities

### Modified Files
- `packages/kitcn/src/cli/codegen.ts` - recursive scanning
- `packages/kitcn/src/react/proxy.ts` - use shared utility
- `packages/kitcn/src/react/vanilla-client.ts` - use shared utility
- `packages/kitcn/src/server/caller.ts` - use shared utility
- `packages/kitcn/src/rsc/proxy-server.ts` - use shared utility

## Related

- [codegen.ts](packages/kitcn/src/cli/codegen.ts) - Implementation
- [Node.js glob docs](https://nodejs.org/api/fs.html#fsglobsyncpattern-options) - globSync reference
- [tRPC merging routers](https://trpc.io/docs/server/merging-routers) - Similar namespace pattern
