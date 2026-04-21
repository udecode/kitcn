---
title: React queryOptions equal args must keep observer options stable
date: 2026-04-21
category: integration-issues
module: kitcn/react queryOptions
problem_type: integration_issue
component: tooling
symptoms:
  - TanStack emits observerOptionsUpdated after rerender with equal query args
  - cRPC queryOptions rebuilds queryKey and meta references for new object literals
  - Convex devtools can show repeated traffic for logically unchanged live queries
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [react-query, tanstack-query, query-options, memoization, convex-query]
---

# React queryOptions equal args must keep observer options stable

## Problem

`crpc.*.queryOptions({})` and `crpc.*.queryOptions({ id })` are natural render
call sites. If the hook rebuilds `queryKey` and `meta` references for equal args,
TanStack Query treats observer options as changed even when the logical query key
hash is unchanged.

## Symptoms

- `QueryObserver.setOptions()` emits `observerOptionsUpdated` after rerendering
  with a fresh object literal containing the same values.
- The query hash stays value-equal, but top-level options are not shallow-equal.
- Convex live-query tooling can look noisy because unchanged queries still cause
  option-update churn.

## What Didn't Work

- Checking only the query hash is incomplete. TanStack also shallow-compares
  observer options, so stable hashing does not help if `queryKey` or `meta`
  references churn.
- A render-time `useRef` memo is the wrong fix under React Compiler-era linting.
  `react-hooks/refs` rejects reading or writing refs during render.

## Solution

Reproduce at the same boundary TanStack uses:

```ts
const observer = new QueryObserver(queryClient, result.current);

events.length = 0;
rerender({ petId: "p1" });
observer.setOptions(result.current);

expect(events).not.toContain("observerOptionsUpdated");
```

Fix the hook by canonicalizing args through the same Convex query-key hash used
for TanStack caching, then memoize the returned options from that stable args
reference. Keep the canonical cache bounded so render-time canonicalization does
not retain unlimited arg objects.

## Why This Works

TanStack Query does two separate things:

1. hashes `queryKey` by value to find the query
2. shallow-compares observer options to decide whether options changed

The bug lived in the second step. Equal-by-value args still produced new
`queryKey` and `meta` references, so shallow comparison failed. Reusing the args
reference for the same Convex query-key hash lets the hook reuse `convexQuery`
output and return shallow-stable observer options.

## Prevention

- Reproduce React Query churn with `QueryObserver` events, not only cache hashes.
- Keep `queryKey` and `meta` references stable when a hook returns TanStack
  options for equal logical input.
- Avoid ref-based memoization that reads or writes `ref.current` during render.
  Use hook dependency contracts or explicit canonicalization instead.

## Related Issues

- [React Query peer drift creates duplicate contexts](./react-query-peer-drift-creates-duplicate-contexts-20260325.md)
