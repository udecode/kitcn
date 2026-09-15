# Fix cRPC client error guards across entrypoints

Objective:
Make `kitcn/crpc` guards recognise client errors produced through
`kitcn/react` and `kitcn/solid`, while preserving rejection of plain objects,
incomplete errors and unsupported codes.

Goal plan:
docs/plans/2026-09-10-fix-crpc-client-error-guards.md

Template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: single-PR bug fix
- id / link: N/A; no issue filed.
- title: fix(crpc): recognize client errors across entrypoints
- acceptance criteria: `isCRPCClientError`, `isCRPCError` and
  `isCRPCErrorCode` recognise errors across the React, Solid and cRPC
  entrypoints; code matching remains exact; same-entrypoint behaviour,
  HTTP 4xx/5xx classification and public type signatures remain unchanged.
- root-cause layer: constructor identity in the public cRPC error guards.

Task PR:
#464 https://github.com/udecode/kitcn/pull/464

Findings:
- tsdown builds client, Solid and server entrypoints in separate groups,
  producing separate copies of `CRPCClientError`.
- `isCRPCClientError` and `isCRPCError` used
  `instanceof CRPCClientError`; `isCRPCErrorCode` delegates to
  `isCRPCClientError`. An error produced by one bundle therefore fails
  guards imported from another.
- This misclassifies deterministic refusals such as `UNAUTHORIZED` and can
  cause consumers to retry them as transport failures.
- Existing source tests constructed errors using the same class as the guards,
  so they did not exercise the package boundary.
- On base commit `c12407fc` (kitcn 0.33.1), the built-entrypoint regression
  failed for both React and Solid before the fix.

Decisions and tradeoffs:
- Require `instanceof Error`, the `CRPCClientError` name, a supported code,
  and string `functionName` and `message` fields. The shared JavaScript
  `Error` constructor survives the entrypoint split; the package-specific
  class identity does not.
- Derive `ClientErrorCode` from a constant tuple so runtime validation and
  the type cannot drift.
- Reuse `isCRPCClientError` inside `isCRPCError`; preserve its HTTP branch.
- Fix the guard rather than the bundler: recognition should remain correct
  if the package's chunk layout changes.
- Preserve public exports and narrowing signatures. No new imports or Convex
  bundle dependencies are introduced.

Constraints:
- Keep server authorization and retry policy unchanged.
- Do not require package-specific constructor identity.
- Do not encode emitted chunk filenames or the number of class copies in tests.

Boundaries:
- Implementation: `packages/kitcn/src/crpc/error.ts`.
- Tests: `packages/kitcn/src/crpc/error.test.ts` and
  `packages/kitcn/src/crpc/package-entrypoints.integration.test.ts`.
- Release: `.changeset/crpc-guards-across-entrypoints.md`, a `kitcn` patch.
- Non-goals: `isHttpClientError`, `isAuthMutationError`, bundler
  deduplication, cross-realm or serialized error support, and a new error
  protocol.
- No CLI, scaffold, fixture, configuration or rendered UI changes.

Completion threshold:
- The built-entrypoint regression fails on the base build and passes with the
  fix for React and Solid.
- Source tests cover recognition, exact code matching, invalid lookalikes and
  unchanged HTTP classification.
- Package build, package and root typechecks, and lint pass.
- Record the full `bun check` result separately from focused verification.
- Include a patch changeset and identify the exact PR before closeout.

Blocked condition:
Resolved by merged prerequisite PR #467. Release PR #468 then consumed the
shared changeset, so this branch retains its standalone patch changeset.

Verification surface:
Run from the repository root using the declared `bun@1.3.9`:
- `bun --cwd packages/kitcn build` before testing built entrypoints.
- `bun test packages/kitcn/src/crpc`.
- `bun --cwd packages/kitcn typecheck` and `bun typecheck`.
- `bun lint`.
- `bun run check`.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Defect reproduced before fix | yes | React and Solid built-entrypoint cases failed on base `c12407fc` |
| Ownership boundary identified | yes | Public guards in `src/crpc/error.ts`; separate entrypoint builds explain the identity mismatch |
| Public API impact assessed | yes | Guard signatures and exports unchanged |
| Release artifact selected | yes | Patch changeset for published runtime behaviour |

Work Checklist:
- [x] Reproduce failures through the built React and Solid entrypoints.
- [x] Replace package-specific identity checks with validated error shape.
- [x] Cover code matching, lookalike rejection and unchanged HTTP classification.
- [x] Record package build, typecheck, lint and full-suite results.
- [x] Add a patch changeset.
- [x] Record the PR number.
- [x] Verify the PR body's plan reference.
- [x] Resolve the full-check blocker or record a maintainer disposition.

Completion Gates:
| Gate | Applies | Result | Evidence |
| --- | --- | --- | --- |
| Focused regression | yes | passed | 36 cRPC tests pass after rebuilding |
| Package build | yes | passed | All four build groups |
| Typechecks | yes | passed | Package and repository root |
| Lint | yes | passed | `biome check && eslint` |
| Code review | yes | passed | Local P0/P1 autoreview clean at 0.94; automated final-head review clean |
| Release artifact | yes | present | `.changeset/crpc-guards-across-entrypoints.md` at final head |
| Full repository check | yes | passed | Exact-head CI run `34916336275` passed in 6m38s |
| PR ownership | yes | recorded | #464 |
| PR plan reference | yes | passed | Body names this plan and fetched head contains exact PR #464 |

Phase / pass table:
| Phase | Status | Evidence |
| --- | --- | --- |
| Reproduction | complete | Built React and Solid tests fail on base `c12407fc` |
| Implementation | complete | Validated shape check; shared guard delegation |
| Focused verification | complete | cRPC tests, build, typechecks and lint pass |
| Full repository verification | complete | Local `bun check` and exact-head CI passed |
| PR delivery | complete | Receipt `5673217013`; merged as `ac73cc6a` |

Verification evidence:
Results recorded during implementation on 2026-09-14:
- Before the fix, with the package built from `c12407fc`,
  `bun test packages/kitcn/src/crpc/package-entrypoints.integration.test.ts`
  failed 2/2. Both adapters produced refusals that the built `kitcn/crpc`
  guards rejected.
- After the fix and rebuild, `bun test packages/kitcn/src/crpc`:
  36 pass, 0 fail.
- `bun --cwd packages/kitcn build`: exit 0, four build groups.
- Package and root typechecks: exit 0.
- `bun lint`: passed.
- `bun run check`: exit 2. Lint, typecheck, Bun tests (1435 pass),
  Vitest (1050 pass, 14 skipped), CLI tests (124 pass) and the Concave smoke
  test passed before `fixtures:check` failed in the generated Next fixture.
- Fixture failure: ESLint 10.10.0 with `eslint-plugin-react` 7.37.5,
  `react/display-name` throws
  `contextOrFilename.getFilename is not a function`.
  The implementation review recorded the same failure in upstream CI run
  34713975670 on base `c12407fc`. This patch changes no fixture, scaffold
  or lint configuration. Merged prerequisite #467 repaired that shared gate;
  CI run `34914786162` passed in 6m28s after updating this PR onto `main`.

Review closure:
- P1 [discussion_r4010936839](https://github.com/udecode/kitcn/pull/464#discussion_r4010936839) was valid at head `74622953`, where the updated parent owned the
  unreleased `kitcn` patch in `.changeset/quiet-maps-lint.md`. The bullet was
  folded into that draft. Release PR #468 then consumed the draft before this
  PR merged, so conflict resolution preserves the released ESLint note in the
  changelog and restores only this PR's cRPC note as a standalone changeset.

Regression coverage:
| Behaviour | Coverage |
| --- | --- |
| Same-entrypoint recognition | Source guard tests |
| React and Solid errors recognised by cRPC guards | Built public entrypoint tests driving `ConvexQueryClient.queryFn()` |
| Matching code accepted; different code rejected | Source and built-entrypoint tests |
| Plain objects, incomplete lookalikes and unsupported codes rejected | Source guard tests |
| Ordinary errors, null and primitives rejected | Source guard tests |
| HTTP 4xx deterministic; HTTP 5xx retryable | Source guard tests |
| `defaultIsUnauthorized` recognises adapter refusals | Built-entrypoint tests |

Open risks:
- A forged `Error` with the complete shape is recognised. These guards
  classify errors; they are not an authorization boundary.
- Errors from another JavaScript realm fail `instanceof Error`.
  The reproduced package-entrypoint failure occurs within one realm.
- An unsupported code supplied by bypassing TypeScript is rejected.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Complete; PR #464 is merged |
| Where am I going? | Parent autoclosure goal completion |
| What is the goal? | Recognize cRPC client errors across built package entrypoints |
| What have I learned? | Release #468 consumed the earlier living changeset before final merge |
| What have I done? | Passed final proof, resolved feedback, posted receipt, and merged `ac73cc6a` |
