## Task

Fix the remaining published-package `bunx --bun kitcn@latest init -t start --yes`
bootstrap parse failure where scaffolded `messages.ts`/`http.ts` still resolve
through Bun's install cache and crash on `convex/server`, while `kitcn dev`
already works.

## Source Of Truth

- User repro from published `kitcn@latest`
- `docs/solutions/integration-issues/bunx-kitcn-self-resolution-must-not-break-scaffold-codegen-20260407.md`
- Current parser + init scaffolding in `packages/kitcn/src/cli/**`

## Likely Seam

- `packages/kitcn/src/cli/utils/project-jiti.ts`
- `packages/kitcn/src/cli/codegen.ts`
- Published/package-intent regression coverage if the bug only reproduces from
  the packed artifact path

## Plan

1. Reproduce against a real temp app with published `kitcn`.
2. Compare the real start scaffold import graph vs existing codegen regressions.
3. Add a failing targeted regression at the parser/package seam.
4. Fix the import-resolution seam, not each scaffold file.
5. Verify with targeted tests, package build, and the real published-style path.

## Completion Checks

- `typecheck` if changed `.ts` files require it
- `lint:fix`
- targeted tests for the failing seam
- `bun --cwd packages/kitcn build`
- update active unreleased changeset if package code changes
- evaluate `ce-compound` only after the fix is verified
