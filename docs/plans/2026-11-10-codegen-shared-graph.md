# Codegen evaluates each project module once per run

Status: in review
Playbook: build

## Outcome

`kitcn codegen` imports every candidate Convex module to read its cRPC metadata. Each root import gets a fresh jiti graph cache, so a module that N candidates import is evaluated N times per run. On a project with 1,764 `.ts` files under `convex/`, one cold run evaluated 899 project files 63,031 times. After this change each project module evaluates once per run, generated output is byte-identical, and a module that throws still fails every candidate that imports it.

## Scope

- `packages/kitcn/src/cli/utils/project-jiti.ts`: `withSharedProjectGraph` scopes one graph cache to a pass; `projectGraphCache` hands each root import that cache, after dropping entries jiti did not mark `loaded`.
- `packages/kitcn/src/cli/codegen.ts`: the parse loop runs inside `withSharedProjectGraph`; the `kitcn/server`-rewritten root path passes the same cache to `evalModule`.
- `packages/kitcn/src/cli/codegen.test.ts`: two `generateMeta` tests.
- `tooling/codegen-graph-bench.mjs`: a synthetic benchmark.
- `.changeset/orm-lazy-tables.md`: one Patches bullet, in the unreleased changeset.

Out of scope: the schema metadata pass (one import), `kitcn dev`'s watcher (each run already calls `generateMeta`, so it starts from an empty graph), and jiti's `moduleCache` (process-global, which the watcher cannot invalidate per run).

## Decisions

| Decision | Why |
| --- | --- |
| One graph cache per parse loop, not `moduleCache: true` | `moduleCache` is Node's process-global CJS cache; the watcher would serve a module's first evaluation for the whole session, which `createProjectJiti`'s comment already rules out. A cache scoped to one pass sees every edit made before the pass starts. |
| Drop entries that are not `loaded` before each root | jiti stores a module in the graph cache before evaluating it and marks it `loaded` only on success. A failed module left in a shared cache would hand a later root its partial exports and hide the failure. Dropping it makes every importer evaluate it, and fail, as it does today. |
| Roots still evaluate from source | `parseModuleRuntime` reads each root's exports; re-evaluating a root that an earlier root imported costs one evaluation and keeps the existing read path. |
| Scope with `AsyncLocalStorage` | `importProjectGraph` already carries its graph in one; a second store needs no new parameter through `createProjectJiti`'s callers. |

## Steps

- [x] Share one graph per parse loop. Proof: `generateMeta evaluates a module shared by many procedure modules once per run` fails on `main` (3 evaluations, expected 1) and passes here.
- [x] A second run sees an edit to a shared module. Proof: the same test's second run reads the edited `type`; a graph that outlives the run fails it (2 evaluations expected, 1 received).
- [x] A module that throws fails every importer. Proof: `generateMeta fails every procedure module that imports a module that throws` passes on `main` and here, and fails with the unloaded-entry drop removed (`b.ts` missing from the failures).
- [x] Benchmark. Proof: `node tooling/codegen-graph-bench.mjs`, below.
- [x] Changeset. Proof: one Patches bullet in `.changeset/orm-lazy-tables.md`.

## Proof

- `bun test packages/kitcn/src/cli/codegen.test.ts`, `bun lint`, `bun typecheck`, `bun --cwd packages/kitcn build`.
- `node tooling/codegen-graph-bench.mjs --pkg <main checkout>/packages/kitcn` against `node tooling/codegen-graph-bench.mjs` (200 modules over a 100-module helper chain, 3 cold runs each, p50, two rounds): `main` 6.2 s and 4.4 s with 20,000 helper evaluations; this change 0.61 s and 0.63 s with 100.
- `bun check --ci`: test-bun (13), test-cli (21) and fixtures (`eslint-config-next` drift) fail identically on `main` `182403a7`; every other step passes.
- On the 1,764-file project, cold, Linux, Node 22: 47.9 s and 45.2 s on 0.33.12, 10.3 s and 9.3 s with this change. The 164 generated files are byte-identical, and a helper that throws, imported by three modules, aborts with the same three failures on both.

## Open questions

None.
