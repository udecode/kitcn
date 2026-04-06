---
title: Aggregate range filters must normalize string-mode timestamps before bucket reads
date: 2026-04-06
category: logic-errors
module: orm
problem_type: logic_error
component: database
symptoms:
  - count() on a composite aggregateIndex returns 0 for eq-prefix plus range-suffix filters on timestamp({ mode: "string" })
  - findMany() over the matching normal index returns rows for the same where clause
  - no COUNT_NOT_INDEXED or COUNT_FILTER_UNSUPPORTED error is raised
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - aggregate
  - count
  - orm
  - timestamp
  - range
  - aggregate-index
  - string-mode
---

# Aggregate range filters must normalize string-mode timestamps before bucket reads

## Problem

`count()` and aggregate reads over a composite `aggregateIndex` could silently
return `0` when the suffix range field used `timestamp({ mode: "string" })`.

The planner matched the right aggregate index, but the final bucket filter
compared stored numeric millis against unnormalized ISO-string bounds.

## Symptoms

- `count({ where: { status: "completed", updatedAt: { gte, lte } } })`
  returns `0`
- the same `where` via `findMany()` returns the expected rows
- planner output shows the correct aggregate index and range field, so the bug
  hides below index selection

## What Didn't Work

- chasing `pickRangeAggregateIndex(...)` first; the range plan was already
  correct
- blaming key-hash prefix scans; synthetic string-key buckets matched fine
- checking `matchesRangeComparisons(...)` in isolation with string inputs; the
  real failure only appears when bucket key parts are numeric millis

## Solution

Normalize aggregate/count comparable values through the same temporal write-path
used by normal query filters.

```ts
const normalizeAggregateComparableValue = (
  tableConfig: TableRelationalConfig,
  fieldName: string,
  value: unknown
): unknown => {
  if (fieldName === INTERNAL_CREATION_TIME_FIELD) {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (Array.isArray(value)) {
      return value.map((entry) =>
        entry instanceof Date ? entry.getTime() : entry
      );
    }
    return value;
  }

  return normalizeTemporalComparableValue(
    tableConfig.table as any,
    fieldName,
    value
  );
};
```

Use that normalization inside aggregate filter parsing for:

- scalar equality values
- `in` arrays
- `gt` / `gte` / `lt` / `lte` range bounds

Add a regression proving `readCountFromBuckets(...)` matches a numeric
aggregate bucket when the public where-clause uses ISO-string timestamp bounds.

## Why This Works

`timestamp({ mode: "string" })` is a public API shape, not the storage shape.
Writes normalize those values to millis before they reach Convex, and aggregate
bucket keys are built from the stored document shape.

Before this fix, aggregate/count planning preserved ISO strings in
`rangeConstraint.comparisons`, so bucket reads compared:

- stored key part: `number`
- filter bound: `string`

That type mismatch never threw. It just made every range comparison fail, which
collapsed the result to zero.

Normalizing planner values at parse time fixes the whole aggregate path instead
of patching only `count()`.

## Prevention

- Any aggregate/count planner path that parses public filters must normalize
  temporal values to storage shape before constraint matching
- When aggregate planner output looks correct but results are empty, test with a
  synthetic bucket row that uses stored values, not hydrated public values
- Keep regression coverage at the bucket-read seam, not just planner selection

## Related Issues

- [GitHub issue #156](https://github.com/udecode/kitcn/issues/156)
- [Aggregate cursor planners must treat createdAt as the implicit _creationTime index suffix](./aggregate-created-at-cursor-alias-must-map-to-implicit-creationtime-index-20260325.md)
