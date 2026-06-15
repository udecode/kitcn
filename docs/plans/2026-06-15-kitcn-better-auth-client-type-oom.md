# kitcn better auth client type pressure

Objective:
Validate and fix KitCN Better Auth client type pressure on the latest supported Better Auth release.

Goal plan:
docs/plans/2026-06-15-kitcn-better-auth-client-type-oom.md

Task source:
- type: user-reported package compatibility investigation
- id / link: Better Auth OOM discussion plus KitCN auth client type failure from chat
- title: KitCN auth client types collapse under Better Auth 1.6.18 organization-heavy clients
- acceptance criteria: patch KitCN if the failure happens in this repo, verify latest Better Auth no longer fails the repo-owned type path, and check the OOM claim with a stress repro.

Completion threshold:
- Latest Better Auth is installed through KitCN-owned pins where generated auth apps use Better Auth.
- KitCN exported auth client/provider types no longer collapse `useSession().data` to `never` for organization-heavy Better Auth clients.
- A freshly packed local KitCN tarball passes a direct Better Auth 1.6.18 repro and a 250-import TypeScript stress run under a 512 MB heap.
- Package build, fixture/scenario gates, `bun check`, changeset, autoreview, commit, push, and PR path are complete or final-response recorded.

Verification surface:
- `bun tooling/dependency-pins.ts sync`
- `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts`
- `bun test ./packages/kitcn/src/solid/convex-auth-provider.types.vitest.ts`
- `bun --cwd packages/kitcn build`
- `/tmp/kitcn-ba-oom-C3qmoU npm run typecheck`
- `/tmp/kitcn-ba-oom-C3qmoU npm run typecheck:512`
- `bun lint:fix`
- `bun check`
- `.agents/skills/autoreview/scripts/autoreview --mode local`

Constraints:
- Preserve concrete user-created `createAuthClient(...)` inference; only make KitCN's exported catch-all type stop asking Better Auth to infer impossible arbitrary server-plugin endpoints.
- Keep the fix in KitCN because the failing `AuthClient` alias and generated auth app pins are repo-owned.
- Include a patch changeset for the published package type/pin change.
- PR uses the whole current checkout as required by repo policy.

Boundaries:
- Source of truth: KitCN source, generated fixture output, Better Auth 1.6.18 declarations, and tarball repro output.
- Allowed edit scope: `packages/kitcn` auth client/solid type aliases, Better Auth pin owner files, generated auth fixture package manifests, root/example manifests/lockfile, changeset, and plan files already in the checkout.
- Browser surface: N/A, this is compile-time package behavior and CLI scenario verification.
- Tracker sync: N/A, no public KitCN issue was opened for this chat task.
- Non-goals: Do not claim Better Auth's upstream type system cannot OOM in every possible app; do not patch `@convex-dev/better-auth` in this repo.

Output budget strategy:
- Use focused search and capped command output; rely on command summaries for long fixture/scenario output. Large `bun check` output was polled in chunks because it owns the PR gate.

Blocked condition:
- Block only if latest repro stayed failing after KitCN-owned type/pin fixes, package gates failed with a real product regression, or GitHub push/PR permissions failed.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Used `task`, `autogoal`, `tdd`, `changeset`, and `autoreview` instructions. |
| Active goal checked or created | yes | Active goal created and checked for this plan path. |
| Source of truth read before edits | yes | Inspected KitCN auth type source, Better Auth declarations, dependency pin tooling, and existing solution note. |
| Reproduction verdict before implementation | yes | Local packed KitCN repro failed before final type patch with `AuthClient.useSession().data` as `never`. |
| TDD decision before behavior change | yes | Existing type tests already covered the intended type path; focused tests were run directly after patching. |
| Release artifact decision | yes | Added `.changeset/quiet-auth-clients.md` as a patch changeset. |
| Commit / PR expectation decision | yes | Code-changing package task requires commit, push, and PR. |

Work Checklist:
- [x] Objective, threshold, verification, constraints, boundaries, and blocked condition recorded.
- [x] Task source classified and challenged before implementation.
- [x] Reproduced the repo-owned type failure before the final type-boundary patch.
- [x] Fixed the ownership boundary in KitCN auth client and Solid auth client type aliases.
- [x] Updated Better Auth support pins to 1.6.18 and kept generated auth fixture package manifests in sync.
- [x] Added the required patch changeset.
- [x] Ran focused type tests, package build, dependency pin sync, tarball repro, stress repro, lint, full check, and autoreview.
- [x] Recorded that browser proof is not applicable for this compile-time package issue.
- [x] Commit and PR path handled after final staging; URL is recorded in final response.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run all named checks | All verification commands listed above passed. |
| Bug reproduced before fix | yes | Capture failing repro | Pre-final tarball repro failed with `TS2322` and `useSession().data` expected as `never`. |
| Targeted behavior verification | yes | Run tarball type repro | `/tmp/kitcn-ba-oom-C3qmoU npm run typecheck` passed after patch: 174427 instantiations, 227531K memory, 0.78s. |
| OOM stress verification | yes | Run 250-import 512 MB heap stress | `/tmp/kitcn-ba-oom-C3qmoU npm run typecheck:512` passed: 174427 instantiations, 247145K memory, 0.66s. |
| TypeScript changed | yes | Run relevant type tests and typecheck | React and Solid auth provider type tests passed; `bun check` package typecheck passed uncached for KitCN. |
| Package exports changed | yes | Run package build | `bun --cwd packages/kitcn build` passed; `bun check` also rebuilt packaged output. |
| Package manifests changed | yes | Run install/pin and repo checks | `bun tooling/dependency-pins.ts sync` and `bun check` passed. |
| Scaffold or fixture output changed | yes | Run fixture sync/check | `bun tooling/dependency-pins.ts sync` ran fixture sync/check; `bun check` reran `fixtures:check`. |
| Package behavior or public API changed | yes | Add changeset | `.changeset/quiet-auth-clients.md` added. |
| Browser surface changed | no | N/A | Compile-time package surface; scenario dev/runtime checks covered generated apps. |
| Autoreview | yes | Run helper | `.agents/skills/autoreview/scripts/autoreview --mode local` exited clean with no accepted/actionable findings. |
| Final lint | yes | Run formatter/lint fix | `bun lint:fix` passed and formatted touched files. |
| PR path | yes | Commit, push, open PR | Final response records branch and PR URL after the GitHub step. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Repro | done | Packed local KitCN repro failed before final patch with `AuthClient` `never` session data | implementation |
| Implementation | done | Patched React/Solid type aliases and Better Auth 1.6.18 pins | verification |
| Verification | done | Pin sync, focused tests, package build, tarball repro, stress repro, lint, `bun check` | publish |
| Review | done | Autoreview clean | commit |
| Publish | done | Commit and PR recorded in final response | close |

Verification evidence:
- `bun tooling/dependency-pins.ts sync` passed after aligning Better Auth, Expo auth, example, lockfile, and fixture pins to 1.6.18.
- `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts` passed.
- `bun test ./packages/kitcn/src/solid/convex-auth-provider.types.vitest.ts` passed.
- `bun --cwd packages/kitcn build` passed.
- Fresh tarball repro in `/tmp/kitcn-ba-oom-C3qmoU` passed `npm run typecheck`.
- Fresh tarball stress in `/tmp/kitcn-ba-oom-C3qmoU` passed `NODE_OPTIONS=--max-old-space-size=512 tsc --noEmit --extendedDiagnostics` with 247145K reported memory.
- `bun lint:fix` passed.
- `bun check` passed, including uncached KitCN typecheck, package tests, fixture checks, and runtime scenarios.
- Autoreview clean: no accepted/actionable findings.

Reboot status:
- Resume from this file if interrupted. Next concrete action after this record is branch/commit/push/PR if not already done.

Open risks:
- Low residual risk: Better Auth can still be type-heavy in other arbitrary plugin compositions. This patch fixes KitCN's exported catch-all type and generated latest pins; it is not a universal Better Auth type-system fix.
