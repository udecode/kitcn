# Fix auth JWT cookie hook

Objective:
Skip Convex JWT generation for auth steps without a session and pass valid
Headers to Better Auth's token endpoint, preventing an internal error during
the initial social sign-in redirect.

Goal plan:
docs/plans/2026-09-11-fix-auth-jwt-cookie-hook.md

Template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: single-PR bug fix
- id / link: N/A; no issue filed.
- title: fix(auth): skip JWT minting for sessionless auth steps
- acceptance criteria: a sessionless social sign-in start logs no internal
  error and sets no Convex JWT cookie; new and existing sessions retain cookie
  issuance; the token endpoint receives a Headers instance.
- root-cause layer: the Convex JWT cookie `after` hook.

Task PR:
#465 https://github.com/udecode/kitcn/pull/465

Findings:
- The hook matches sign-in routes, including an initial social redirect that
  produces no session, and calls the JWT token endpoint with `headers: {}`.
- In the tested Better Auth 1.7.3 and 1.7.4 versions, the endpoint reads
  `ctx.headers?.get("cookie")` on this path. A plain object has no `get`
  method, producing a logged internal error even though the hook catches it.
- Pinned Better Auth 1.7.1 returns before that access. The HTTP tests pass on
  the unfixed implementation at this pin.
- A direct token-guard test is required because the pinned-version HTTP test
  cannot detect removal of either fix.
- Both affected versions fall within the supported peer range
  `>=1.7.0 <1.8.0`. The evidence establishes behaviour on the tested
  versions, not every release within that range.

Decisions and tradeoffs:
- Return before context mutation if neither `session` nor `newSession`
  exists.
- Retain the existing temporary session assignment for token generation and
  restoration afterward; pass `new Headers()` to the token endpoint.
- Keep the token guard internal and inject the endpoint call in its unit test,
  proving both the sessionless short-circuit and `Headers` input without
  widening the package API.
- Preserve the dependency pin and public plugin signature.
- Exercise the real Better Auth HTTP handler with an in-memory adapter and
  synthetic credentials. No live OAuth exchange or backend is required.

Constraints:
- Keep the change local to the JWT cookie hook.
- Preserve cookie issuance when a session exists.
- Preserve the existing session restoration assignment, error handling and
  cookie-clearing hook.

Boundaries:
- Implementation: `packages/kitcn/src/auth/internal/convex-plugin.ts`.
- Tests: `packages/kitcn/src/auth/internal/convex-plugin-cookie.vitest.ts` and
  `packages/kitcn/src/auth/internal/convex-plugin-cookie-hook.vitest.ts`.
- Release: `.changeset/auth-jwt-cookie-sessionless-start.md`, a kitcn patch.
  Release PR #469 consumed the earlier living cRPC draft before this repair
  landed, so the auth note is standalone on the final parent.
- Non-goals: other auth hooks, dependency upgrades, public APIs, CLI,
  environment management and scaffold changes.

Completion threshold:
- Reproduce the logged TypeError through real HTTP handlers on affected
  versions, then demonstrate its absence with the fix.
- Verify sessionless starts set no JWT cookie, email sign-up sets one, and
  authenticated `get-session` returns the expected user and sets one.
- Directly verify a sessionless hook skips the endpoint and a session-bearing
  hook supplies a `Headers` instance.
- Run package build, package/root typechecks and lint; record the full
  repository check separately.
- Include a patch changeset and identify the exact PR before closeout.

Blocked condition:
None. Prerequisite #467 repaired the generated Next fixture lint lane before
this closeout, and #464 supplied the current living kitcn changeset.

Verification surface:
From the repository root, using the declared Bun 1.3.9:
- `bunx vitest run packages/kitcn/src/auth/internal/convex-plugin-cookie.vitest.ts`
  exercises source on pinned Better Auth 1.7.1.
- `bunx vitest run packages/kitcn/src/auth/internal/convex-plugin-cookie-hook.vitest.ts`
  directly exercises the session guard and token-request headers.
- The compatibility recipe below exercises the same cases through the packed
  `kitcn/auth` entrypoint on 1.7.1, 1.7.3 and 1.7.4.
- `bun --cwd packages/kitcn build`.
- `bun --cwd packages/kitcn typecheck` and `bun typecheck`.
- `bun lint` and `bun run check`.

Reproducing the compatibility checks:
Build the current package first with `bun --cwd packages/kitcn build`.
Then run the following in Bash from the repository root. It packs that build,
copies the committed tests into temporary projects and changes only their
runner and plugin imports. Dependencies and caches are isolated from the
checkout. Registry access is required; dependency lifecycle scripts are disabled.

```bash
(
set -eu
export JWT_COOKIE_REPO="$PWD"
export JWT_COOKIE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/kitcn-jwt-cookie.XXXXXX")"
export BUN_INSTALL_CACHE_DIR="$JWT_COOKIE_TMP/bun-cache"
export TMPDIR="$JWT_COOKIE_TMP"
npm pack ./packages/kitcn --ignore-scripts \
  --cache "$JWT_COOKIE_TMP/npm-cache" \
  --pack-destination "$JWT_COOKIE_TMP" --json > "$JWT_COOKIE_TMP/pack.json"

node --input-type=module <<'NODE'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.JWT_COOKIE_REPO;
const temp = process.env.JWT_COOKIE_TMP;
const [{ filename }] = JSON.parse(readFileSync(join(temp, 'pack.json'), 'utf8'));
const test = readFileSync(join(root,
  'packages/kitcn/src/auth/internal/convex-plugin-cookie.vitest.ts'), 'utf8')
  .replace("from 'vitest'", "from 'bun:test'")
  .replace("from './convex-plugin'", "from 'kitcn/auth'");

for (const version of ['1.7.1', '1.7.3', '1.7.4']) {
  const directory = join(temp, version);
  mkdirSync(directory);
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'jwt-cookie-compat', private: true, type: 'module',
    dependencies: {
      'better-auth': version, convex: '1.44.0', zod: '4.3.6',
      kitcn: join(temp, filename),
    },
  }, null, 2));
  writeFileSync(join(directory, 'cookie.test.ts'), test);
}
NODE

jwt_cookie_failed=0
for version in 1.7.1 1.7.3 1.7.4; do
  printf 'Better Auth %s\n' "$version"
  (
    cd "$JWT_COOKIE_TMP/$version"
    bun install --ignore-scripts && bun test cookie.test.ts
  ) || jwt_cookie_failed=1
done
printf 'Compatibility files: %s\n' "$JWT_COOKIE_TMP"
exit "$jwt_cookie_failed"
)
```

Expected results: two passing tests on each version. The script retains the
temporary projects and lockfiles at the printed path for inspection.

For before/after reproduction, use a disposable checkout containing this test
and the plugin from base `c12407fc`. Build and run the same recipe there:
1.7.1 should pass both cases; 1.7.3 and 1.7.4 should fail the sessionless
OAuth case with the logged TypeError. Apply the two hook changes, rebuild and
rerun to verify both cases pass. A fresh packed build is required for each run.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Defect reproduced before fix | yes | Real-handler failure on Better Auth 1.7.3 and 1.7.4 |
| Version dependence identified | yes | Pinned 1.7.1 passes before and after |
| Ownership boundary identified | yes | Convex JWT cookie hook |
| Public API impact assessed | yes | No signature or dependency changes |
| Release artifact selected | yes | Patch changeset |

Work Checklist:
- [x] Reproduce the failure on affected supported versions.
- [x] Skip sessionless token generation and supply valid Headers.
- [x] Verify sessionless, sign-up and authenticated get-session HTTP cases.
- [x] Document a reproducible affected-version compatibility check.
- [x] Record package and repository verification results.
- [x] Add a patch changeset.
- [x] Record the PR number.
- [x] Verify the PR body's plan reference.
- [x] Resolve the full-check blocker or record a maintainer disposition.

Completion Gates:
| Gate | Applies | Result | Evidence |
| --- | --- | --- | --- |
| Affected-version regression | yes | passed | Recorded red-then-green runs on 1.7.3 and 1.7.4 |
| Pinned-version behaviour | yes | passed | Two HTTP tests pass on 1.7.1; direct guard test passed red-green |
| Package build and typechecks | yes | passed | Recorded exit 0 |
| Lint | yes | passed | Recorded clean result |
| Code review | yes | passed | P0/P1 autoreview clean at 0.94 |
| Release artifact | yes | present | Standalone auth patch after #469 consumed the prior living draft |
| Full repository check | yes | passed | All component lanes passed on final #469 parent |
| PR ownership | yes | recorded | #465 |
| PR plan reference | yes | passed | PR body names this exact plan |

Phase / pass table:
| Phase | Status | Evidence |
| --- | --- | --- |
| Reproduction | complete | Affected-version real-handler failures |
| Implementation | complete | Sessionless guard and valid Headers |
| Focused verification | complete | HTTP cases pass on all three tested versions |
| Full repository verification | complete | `bun check` passed all lanes |
| PR delivery | complete | #465; final repair ready for exact-head push |

Verification evidence:
The documented compatibility recipe was verified on 2026-09-14 against the
existing fixed build: two tests passed on each of Better Auth 1.7.1, 1.7.3
and 1.7.4 in freshly installed temporary projects.

Results recorded during implementation on 2026-09-14:
- Unfixed packed build: Better Auth 1.7.3 and 1.7.4 each report one pass and
  one failure, with `ctx.headers?.get is not a function` on the sessionless
  social sign-in start.
- Fixed rebuilt package: both affected-version harnesses report two passes.
- Pinned 1.7.1 source test: two passes before and after the fix.
- Package build, package/root typechecks and lint passed.
- Full `bun run check`: exit 2. Lint, typecheck, Bun tests (1431 pass),
  Vitest (1052 pass, 14 skipped), CLI tests (124 pass) and the Concave smoke
  test passed before generated Next fixture lint failed.
- Fixture error: ESLint 10.10.0, `react/display-name`,
  `contextOrFilename.getFilename is not a function`. The implementation
  report identifies the same signature on upstream base `c12407fc`.
  This patch changes no fixture or lint configuration; the full check
  nevertheless remains failing.

Closeout evidence on 2026-09-15:
- The direct guard test failed before the internal helper existed, then all
  three focused tests passed after the helper was wired into the hook.
- Fresh packed builds passed both HTTP cases on Better Auth 1.7.1, 1.7.3 and
  1.7.4.
- Package and root typechecks, package build and lint passed after merging
  current `main`.
- Full `bun check` passed, including fixture parity and runtime scenario lanes.
- Release PR #469 then consumed the cRPC living draft. Source-backed conflict
  resolution preserved its changelog/version bump and restored only this PR's
  auth note as a standalone patch.
- On the final #469 parent, `bun check` passed lint, typechecks, Bun/Vitest/CLI
  tests and Concave smoke before one temporary Next install lost `diff.min.js`.
  After the policy-required `bun install`, the exact failed `fixtures:check`
  lane passed, followed by `test:verify` and every `test:runtime` scenario.

Regression coverage:
| Behaviour | Evidence |
| --- | --- |
| Sessionless social start returns the authorization URL without logged errors | Real HTTP handler on all three tested versions |
| Sessionless start sets no Convex JWT cookie | Response cookie assertion |
| New session receives a JWT cookie | Email sign-up response |
| Existing session receives a JWT cookie | Authenticated get-session response |
| Existing session returns the expected user | Get-session response body |
| Sessionless hook never calls the token endpoint | Direct injected-endpoint assertion |
| Session-bearing hook supplies real Headers | Direct injected-endpoint assertion |

Verification limits:
- Returning a user from `get-session` does not directly prove restoration of
  the hook's internal `ctx.context.session`. The restoration assignment is
  preserved in source; no direct restoration assertion is claimed.
- Tests cover the initial social redirect, email sign-up and authenticated
  get-session. They do not complete an external OAuth callback or exercise
  every session-producing route.
- The pinned-version HTTP tests do not detect removal of this fix by
  themselves; the direct guard test and affected-version recipe close that
  gap.
- The before/after HTTP cases establish the combined fix; they do not isolate
  each changed line as independently necessary.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Final repair verified and ready to push to PR #465 |
| Where am I going? | Exact-head CI, feedback read-back, terminal receipt and merge |
| What is the goal? | Merge the sessionless JWT-cookie fix with durable regression proof |
| What have I learned? | Pinned 1.7.1 needs a direct guard test; affected versions prove the public failure |
| What have I done? | Merged current main, closed both review findings, and passed every local gate |

Open risks:
- GitHub exact-head CI and automated review must rerun after the final push.
- Vercel preview authorization is unavailable for the contributor fork, but
  this package-only change has no rendered UI surface and Vercel is not a
  required repository check.
