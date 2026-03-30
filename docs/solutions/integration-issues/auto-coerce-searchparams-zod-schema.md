---
title: Auto-coerce URL searchParams based on Zod schema type
category: integration-issues
tags:
  - zod
  - url-params
  - type-coercion
  - http-builder
  - schema-introspection
severity: medium
component: packages/kitcn/src/server/http-builder.ts
date: 2026-01-21
---

# Auto-coerce URL searchParams based on Zod schema type

## Problem

URL `searchParams` are always strings (e.g., `?page=1&active=true`), but Zod schemas expect typed values. This required verbose `z.coerce.*` boilerplate everywhere:

```typescript
// Before: Verbose boilerplate required
.searchParams(z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  active: z.coerce.boolean().optional(),
}))
```

## Root Cause

When implementing auto-coercion, we needed to unwrap Zod wrappers (Optional, Nullable, Default) to detect the base type. Initial implementation used:

```typescript
// BUGGY: Generic unwrap check
if ('unwrap' in schema && typeof schema.unwrap === 'function') {
  return getBaseSchema(schema.unwrap());
}
```

**Problem**: `ZodArray` also has an `unwrap()` method (returns element type), so arrays were incorrectly unwrapped. This caused `z.array(z.string())` to be detected as `z.string()`, breaking array coercion.

## Solution

Use explicit `instanceof` checks instead of generic property checks:

```typescript
// Helper to get base schema type (unwrap Optional/Nullable/Default wrappers)
function getBaseSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  // Only unwrap Optional and Nullable - NOT arrays (which also have unwrap())
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable
  ) {
    return getBaseSchema(schema.unwrap() as z.ZodTypeAny);
  }
  // ZodDefault - use _def.innerType
  if (schema instanceof z.ZodDefault) {
    return getBaseSchema((schema as any)._def.innerType);
  }
  return schema;
}

// Type detection helpers
function isArraySchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodArray;
}

function isNumberSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodNumber;
}

function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodBoolean;
}
```

Then in `parseQueryParams()`:

```typescript
for (const key of keys) {
  const values = url.searchParams.getAll(key);
  const fieldSchema = shape[key];

  if (fieldSchema) {
    if (isArraySchema(fieldSchema)) {
      params[key] = values;
    } else if (isNumberSchema(fieldSchema)) {
      params[key] = Number(values[0]);
    } else if (isBooleanSchema(fieldSchema)) {
      const val = values[0].toLowerCase();
      params[key] = val === 'true' || val === '1';
    } else {
      params[key] = values.length === 1 ? values[0] : values;
    }
  }
}
```

## Before/After

```typescript
// Before: Required z.coerce.* boilerplate
.searchParams(z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  active: z.coerce.boolean().optional(),
  tags: z.array(z.string()).optional(),
}))

// After: Standard Zod schemas work directly
.searchParams(z.object({
  page: z.number().default(1),
  limit: z.number().default(10),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
}))
```

## Prevention

**Use explicit `instanceof` checks instead of duck typing:**

```typescript
// BAD - Multiple Zod types have `unwrap()`
if ('unwrap' in schema) { ... }

// GOOD - Explicit type checking
if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) { ... }
```

**Zod types with `unwrap()` method:**
- `ZodOptional` - unwraps to inner type
- `ZodNullable` - unwraps to inner type
- `ZodArray` - unwraps to ELEMENT type (different behavior!)
- `ZodBranded` - unwraps to inner type
- `ZodReadonly` - unwraps to inner type

## Edge Cases

| Input | Schema | Output |
|-------|--------|--------|
| `?page=5` | `z.number()` | `5` (number) |
| `?page=abc` | `z.number()` | `NaN` → Zod error |
| `?active=true` | `z.boolean()` | `true` |
| `?active=1` | `z.boolean()` | `true` |
| `?active=0` | `z.boolean()` | `false` |
| `?tags=a&tags=b` | `z.array(z.string())` | `["a", "b"]` |
| `?tags=a` | `z.array(z.string()).optional()` | `["a"]` |

## Related

- [http-builder.ts](packages/kitcn/src/server/http-builder.ts) - Implementation
- [examples.ts](example/convex/routers/examples.ts) - Usage examples
- [http.mdx](www/content/docs/server/http.mdx) - HTTP documentation
