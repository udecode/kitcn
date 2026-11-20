# Codegen shares its module graph only where sharing cannot change a result

Status: in review
Playbook: bug-fix

## Brief

### What will change?

Codegen shares its module graph only for Convex modules whose import closure has no cycle and no computed import. The rest are parsed alone, as 0.33.12 did, so no module runs twice and no value depends on read order.

### What could go wrong?

Projects with many import cycles lose most of #497's speed. A load the scan cannot see that reaches a cycle now rejects that module with both files named, where #497 wrote a value silently.

## Outcome

Since #497, `kitcn codegen` evaluates the project's modules in one graph per run. Two cases give a different result from evaluating each Convex module on its own:

1. A Convex module that an earlier Convex module imported is evaluated again from source as a root, so its module-level side effects run twice in one graph. A module that registers its own name in a module-level registry aborts codegen (`- y.ts: duplicate y`), where 0.33.12 succeeds.
2. A module in an import cycle keeps the partial exports seen by whichever Convex module entered the cycle first. With `x.ts` entering `a <-> b` at `b`, `y.ts`'s metadata becomes `p: "p:undefined"` instead of `p: "p:Q"`, only because `x.ts` exists.

Dropping and re-evaluating the cycle's modules is not enough: modules the earlier root left in the graph keep the side effects of the dropped ones, so a registration or a module-local counter still runs twice. After this change each Convex module is parsed either wholly in the shared graph or wholly in a fresh graph of its own, as 0.33.12 parses every module, and nothing is ever dropped from the shared graph. Generated output is unchanged on a 385-entry project.

## Scope

- `packages/kitcn/src/cli/utils/project-jiti.ts`: `planProjectGraph` scans each Convex module's static import closure (`@babel/parser`, resolution through the run's own jiti and missing-module fallbacks); `evaluateProjectRoot` runs a root in the mode the plan gives it; the shared graph's cache refuses to replace or remove an entry and rejects a root that reads an entry still loading, even if project code catches the error.
- `packages/kitcn/src/cli/codegen.ts`: the parse loop plans its graph; both root paths go through `evaluateProjectRoot`.
- `packages/kitcn/src/cli/codegen.test.ts`: eight `generateMeta` tests.
- `tooling/codegen-graph-bench.mjs`: a `--cyclic` option.
- `.changeset/orm-lazy-tables.md`: #497's Patches bullet, updated.

Out of scope: the schema metadata pass (one import), and import cycles that kitcn's own generated files close: a runtime caller that `require`s its module inside a resolver function, and `generated/auth.ts` importing `../auth`. Both read their partner lazily, so they cannot give a wrong value, but the scan counts them; a follow-up can let the scan skip imports inside function bodies and generate the auth module without that static import.

## Decisions

| Decision | Why |
| --- | --- |
| A root is parsed wholly in one mode, chosen before it runs | A graph that keeps some modules' state while evaluating others again can always repeat a side effect. With one mode per root, a module runs at most once in the shared graph, and a root in its own graph sees exactly what 0.33.12 shows it. |
| Isolate a root whose static closure holds an import cycle, a computed import (`import(expr)`, `require(expr)`, `require` read as a value or through `require.call`/`apply`/`bind`, `createRequire`, `eval`, `Function`), an import that does not resolve, or a file that does not parse | In an acyclic closure every import finishes before its importer continues, so no module sees another's partial exports; the other cases are ones a static scan cannot prove acyclic. |
| The shared cache rejects a root that reads an unfinished entry, recording the violation itself | Such a read means a cycle or a failed module the scan did not see. The loader keeps the violation and rejects the root after it evaluates, so project code that catches the thrown error cannot turn it into fallback metadata; a scan gap becomes a named error instead of a different generated file. |
| Nothing is dropped from the shared graph; a root that reaches a module an earlier root left unfinished runs in its own graph | It fails as it would alone, with the same error, and the failed module never runs twice in the shared graph. |
| Modules outside cycles stay shared across Convex modules | #497's speed. Module-level state is one instance per run for them: two Convex modules registering one name in a shared registry abort codegen, naming the second. |

## Steps

- [x] Each root wholly in one mode. Proof: `generateMeta gives a procedure module its own entry into an import cycle` and `generateMeta evaluates a procedure module once when another one imports it` fail on `main` and pass here.
- [x] No repeated side effects through a cycle. Proof: `generateMeta does not repeat the side effects of a module in an import cycle` and `generateMeta counts one evaluation of a module in an import cycle for each procedure module` fail on `main` (`z.ts: duplicate z`; `p:Q:2`) and pass here.
- [x] A computed import keeps its root out of the shared graph. Proof: `generateMeta parses a procedure module with a computed import in a graph of its own` fails on `main` and passes here.
- [x] A caught violation still rejects the root. Proof: `generateMeta rejects a procedure module whose shared-graph violation project code caught` fails on `main` and passes here; `generateMeta parses a procedure module that loads through require.call in a graph of its own` passes on both.
- [x] One instance per run outside cycles. Proof: `generateMeta keeps one module instance per run for procedure modules outside import cycles` passes on `main` and here.
- [x] Benchmark with cycles. Proof: `node tooling/codegen-graph-bench.mjs --cyclic <n>`, below.
- [x] Changeset. Proof: #497's bullet in `.changeset/orm-lazy-tables.md` describes the result.

## Proof

- `bun test packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/cli/utils/project-jiti.test.ts` on Bun 1.3.9: 103 pass, 0 fail; six of the eight new tests fail on `main` `fba09cba`.
- `node tooling/codegen-graph-bench.mjs --pkg <checkout>/packages/kitcn --runs 3 --cyclic <n>` (200 modules over a 100-module helper chain, Bun 1.3.9, p50, a loaded machine):

  | `--cyclic` | v0.33.12 | `main` | this change |
  | --- | --- | --- | --- |
  | 0 | 16.95 s, 20,000 helper evaluations | 1.39 s, 100 | 1.43 s, 100 |
  | 100 | 14.04 s, 20,000 | 1.78 s, 100 | 7.91 s, 10,100 |
  | 200 | 19.69 s, 20,000 | 2.90 s, 100 | 12.40 s, 20,000 |

- On a project with 385 Convex modules, 153 of which reach one of six import cycles: generated files byte-identical to 0.33.12's; module evaluations 63,729 on 0.33.12 and 40,282 here; CPU 139 s and 108 s.

## Open questions

None.
