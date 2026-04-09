---
title: Codegen parse must skip helper files and support TSX imports
date: 2026-04-09
category: integration-issues
module: cli-codegen
problem_type: integration_issue
component: tooling
symptoms:
  - "`kitcn codegen` aborts when a real procedure module imports a `.tsx` file such as a React Email template"
  - "`kitcn codegen` aborts on helper files like `test.setup.ts` or `test.call-tracking.ts` even when they do not export procedures"
  - "fatal parse summaries include unrelated helper-file errors like `.glob is not a function`"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - codegen
  - parse-time
  - jiti
  - tsx
  - helper-files
  - react-email
---

# Codegen parse must skip helper files and support TSX imports

## Problem

`kitcn codegen` treated every eligible `.ts` file under the functions dir as a
module worth importing. That was too broad, and it also assumed Jiti's default
transform settings were enough for transitive `.tsx` imports.

## Symptoms

- `kitcn codegen aborted because module parsing failed`
- parse failures pointing at React Email or other `.tsx` files imported by a
  real procedure module
- helper files with top-level setup code failing parse-time import even though
  they were not procedures

## What Didn't Work

- Treating every non-excluded `.ts` file as a codegen entry
- Blaming app helper files for parse-time errors when codegen never needed to
  import them
- Relying on default Jiti settings for JSX-heavy transitive imports

## Solution

Gate parse-time imports behind a cheap source-level check, and enable JSX
support in the project Jiti helper.

```ts
const parseCandidateFiles = files.filter((file) =>
  hasPotentialCodegenExports(
    fs.readFileSync(path.join(functionsDir, file), "utf8"),
    file
  )
);

for (const file of parseCandidateFiles) {
  await parseModuleRuntime(path.join(functionsDir, file), jitiInstance);
}
```

```ts
export const createProjectJiti = (cwd = process.cwd()) =>
  createJiti(cwd, {
    interopDefault: true,
    jsx: {
      runtime: "automatic",
    },
    moduleCache: false,
    alias: {
      // ...
    },
  });
```

The source-level gate should treat these as parse candidates:

- files with `_crpcMeta` or `_crpcHttpRoute`
- exported native handler calls like `query(...)` or `internalMutation(...)`
- chained builder exports like `publicQuery.input(...).query(...)`
- `orm.api()` destructures
- `http.ts`

## Why This Works

The bug lived in codegen entry selection plus parse-time transform config.

Helper files such as setup and call-tracking modules are not part of the
generated API surface, so importing them during codegen is wasted risk. Once
codegen only imports files that plausibly define procedures or routes, those
helper failures disappear.

Real procedure modules still need their transitive graph to load. Enabling JSX
transform support in the shared Jiti helper makes parse-time imports tolerate
`.tsx` files instead of dying on valid React Email syntax.

## Prevention

- Treat parse-time entry discovery as its own contract; do not import every
  `.ts` file just because it exists under the functions dir
- Keep the shared project Jiti helper aligned with supported user module syntax,
  including `.tsx` imports
- Lock both cases with regressions: one for TSX transitive imports, one for
  non-procedure helper files that would throw if imported

## Related Issues

- `docs/solutions/integration-issues/parse-time-crpc-builder-stubs-must-implement-paginated-query-chains-20260408.md`
- `docs/solutions/integration-issues/concave-codegen-must-load-root-env-for-parse-time-modules-20260408.md`
- `docs/solutions/integration-issues/bunx-kitcn-self-resolution-must-not-break-scaffold-codegen-20260407.md`
