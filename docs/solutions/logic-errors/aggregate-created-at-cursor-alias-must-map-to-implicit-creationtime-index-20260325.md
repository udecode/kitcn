---
title: Aggregate cursor planners must treat createdAt as the implicit _creationTime index suffix
problem_type: logic_error
component: database
root_cause: logic_error
tags:
  - aggregate
  - count
  - orm
  - createdAt
  - _creationTime
  - cursor
severity: high
symptoms:
  - /aggregate shows count-window-cursor and aggregate-window-cursor-metrics as failing
  - count({ orderBy, cursor }) throws COUNT_NOT_INDEXED for [userId, deletionTime, createdAt]
  - aggregate({ orderBy, cursor, _sum/_avg/_min/_max }) throws AGGREGATE_NOT_INDEXED on todos
---

# Aggregate cursor planners must treat createdAt as the implicit _creationTime index suffix

## Problem

Cursor-windowed `count()` and `aggregate()` calls on tables that expose
`createdAt` through the system `_creationTime` alias were split across two
worlds.

The query layer was generating cursor filters for the planner, but the planner
and index matcher disagreed about whether that field should be `createdAt` or
`_creationTime`.

## Root cause

There were two separate bugs:

1. Cursor window coercion in `query.ts` injected range filters using the
   internal field name `_creationTime`. The no-scan aggregate planner accepts
   public filter keys, so that path was rejected as an unsupported filter.
2. After fixing the filter key, aggregate index matching still treated
   `_creationTime` like a normal explicit index field. For system timestamps,
   that is wrong: the range lives on the implicit trailing creation-time suffix
   of the aggregate index.

## Fix

1. In `query.ts`, build cursor filters with public field names:
   - `_id` -> `id`
   - `_creationTime` -> `createdAt`
2. In `aggregate-index/runtime.ts`, normalize public planner filters back to the
   internal fields before validation and planning:
   - `id` -> `_id`
   - `createdAt` -> `_creationTime`
3. In `pickRangeAggregateIndex(...)`, allow `_creationTime` to match as the
   implicit trailing range field even when the aggregate index definition only
   declares its finite prefix fields.

## Verification

- unit regression tests in
  `packages/kitcn/src/orm/query.is-nullish.test.ts`
  proving count and aggregate cursor plans compile through the `createdAt`
  alias
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- live `example` proof:
  - sign in anonymously
  - run `bun convex run --push --identity ... aggregateDemo:getSnapshot '{}'`
  - `count-window-cursor` returns `ok: true`
  - `aggregate-window-cursor-metrics` returns `ok: true`

## Takeaways

1. Public query filters and internal runtime planning are different seams.
   Fixing one does not prove the other.
2. System `createdAt` behaves like an alias at the API surface and like an
   implicit `_creationTime` suffix at index-planning time.
3. When proving package fixes against `example`, source tests are not enough.
   Rebuild `packages/kitcn/dist` before trusting live runtime output.
