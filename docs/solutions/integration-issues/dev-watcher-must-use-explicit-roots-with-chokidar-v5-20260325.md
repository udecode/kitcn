---
title: Dev watcher must use explicit roots with chokidar v5
problem_type: integration_issue
component: development_workflow
root_cause: missing_tooling
tags:
  - convex
  - dev
  - watcher
  - codegen
  - chokidar
severity: medium
symptoms:
  - better-convex dev does not print any codegen rerun signal after editing Convex files
  - shared API output stops updating during local dev even though startup still succeeds
  - mocked watcher tests pass while the real packaged watcher misses source edits
---

# Dev watcher must use explicit roots with chokidar v5

## Problem

`better-convex dev` got quieter, but local edits stopped showing any codegen
rerun signal.

Worse, the shared API watcher was not just silent. It was dead. Editing a real
Convex source file in a prepared app no longer regenerated shared API output.

## Root cause

The watcher still passed glob patterns like `convex/**/*.ts` into `chokidar`.

That used to work. `chokidar@5` does not support globs anymore, so the live
watcher never subscribed to real source changes. The existing test used a fake
watcher stub, so it never caught the break.

## Fix

Treat the watcher like a real `chokidar@5` client:

1. Watch explicit roots instead of globs.
2. Replace glob-based ignore lists with an ignore predicate.
3. Keep the concise success line on rerun: `Convex api updated`.
4. Add one real-file watcher test that uses `chokidar` against a temp app dir.

## Verification

- targeted watcher test proving a real file edit triggers codegen under
  `chokidar@5`
- package typecheck
- package build
- repo `lint:fix`
- live proof in a prepared `create-convex-bare` app:
  - start `better-convex dev`
  - edit `convex/myFunctions.ts`
  - observe `Convex api updated`

## Takeaways

1. Mocked watcher tests are too polite for filesystem bugs.
2. `chokidar` major bumps are not cosmetic. Read the upgrade notes or eat shit.
3. Local dev needs one concise rerun signal, or users assume the watcher died.
