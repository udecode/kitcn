# Auth Query Cache After Auth Switch

## Scope

Plan only.

Fix stale auth-bound query data after auth identity changes in `kitcn/react`,
using Next as the proving lane.

## Grounded context

- Context snapshot:
  [auth-query-cache-stale-20260405T194310Z](/Users/zbeyens/git/better-convex/.omx/context/auth-query-cache-stale-20260405T194310Z.md)
- Repro we already have:
  in a temp Next auth app, signed-in UI showed account 1 while the auth-bound
  query still rendered `guest`
- Screenshot proof:
  [next-auth-viewer-stuck-guest.png](/Users/zbeyens/.dev-browser/tmp/next-auth-viewer-stuck-guest.png)
- Likely code seam:
  [auth-mutations.ts](/Users/zbeyens/git/better-convex/packages/kitcn/src/react/auth-mutations.ts)
  and
  [client.ts](/Users/zbeyens/git/better-convex/packages/kitcn/src/react/client.ts)

## RALPLAN-DR

### Principles

- Auth changes must invalidate user-scoped truth, not preserve it.
- Fix the cache ownership seam, not each caller page.
- Preserve real-time subscriptions where possible, but correctness beats cache warmth.
- Prove with Next before widening confidence claims.

### Decision drivers

1. The cache key currently does not vary by auth identity.
2. Sign-out unsubscribes auth-required subscriptions but does not clear cached data.
3. Sign-in/sign-up do not force auth-bound queries to refresh.

### Viable options

#### Option A: auth-transition cache reset in the query client

- Add a first-class query-client operation for auth transitions.
- On auth identity changes, clear or invalidate auth-bound cached queries and
  resubscribe as needed.

Pros
- Smallest durable fix at the real ownership seam
- No public query-key contract churn
- Works for existing callers without page changes

Cons
- Need a clear rule for optional-auth queries vs required-auth queries
- Can cause a brief refetch after auth transitions

#### Option B: partition auth-bound query keys by auth identity

- Include an auth discriminator in the query key/hash for auth-aware queries.

Pros
- Strong isolation between guest/account 1/account 2 data
- Makes cross-user cache bleed structurally impossible

Cons
- Broader API/runtime change
- More SSR/hydration/key-compat risk
- Likely touches more surfaces than the bug justifies right now

#### Option C: hybrid

- Add transition-time cache reset now
- Leave room for future identity-key partitioning if more edge cases remain

Pros
- Fastest path to correctness
- Keeps the door open for stronger long-term isolation

Cons
- Two-step strategy instead of one hard cut

### Chosen direction

Option C, implemented as Option A now.

Architect correction:
- the primitive belongs in the query client
- mutation hooks are only one trigger source, not the whole design

### Why not the weaker alternatives

- Not Option B now:
  too broad for the current evidence. We already have a reproducible auth
  transition seam in the query client. Re-keying every auth-bound query is a
  larger contract change than this bug needs.
- Not "do nothing and tell users to avoid TanStack cache":
  that is just surrender. The bug is inside kitcn’s auth/query integration.

## ADR

### Decision

Add an auth-transition cache-management seam in `kitcn/react`, owned by the
query client, then route auth identity changes through it.

### Drivers

- Existing query cache survives auth identity changes.
- The stale state reproduces in a real Next auth lane.
- The current auth mutation layer already owns part of the transition path, but
  not all auth-state changes.

### Alternatives considered

- Query-key partitioning by auth identity
- Caller-level manual invalidation
- No framework change

### Why chosen

- Lowest-risk seam with the highest leverage
- Keeps the fix inside the auth/query integration where the bug originates
- Leaves room to escalate to identity-key partitioning if transition-time reset
  is not sufficient

### Consequences

- Auth transitions will intentionally drop or refetch some cached query data
- Optional-auth and required-auth query handling must be made explicit
- Any auth-state change path outside sign-in/sign-up/sign-out must be audited,
  or stale data can survive through a side door

### Follow-ups

- If stale cross-user data still survives after transition-time cache reset,
  reopen Option B and key auth-bound queries by identity
- If auth can change outside mutation hooks in practice, add one central
  auth-transition notifier instead of duplicating cache-reset calls

## Plan

### 1. Add failing regressions first

- Add a `createAuthMutations` regression proving:
  guest-scoped cached query data does not survive sign-in
- Add a `ConvexQueryClient` lifecycle regression proving:
  account 1 cached auth-bound data does not survive sign-out -> account 2
- Keep the first slice unit-level and deterministic

### 2. Introduce one query-client auth-transition primitive

- Add a method on `ConvexQueryClient` for auth transitions
- It should:
  - remove or invalidate auth-bound cached queries
  - unsubscribe active auth-bound subscriptions
  - leave clearly public queries alone
- It should accept enough context to distinguish:
  - guest -> signed-in
  - signed-in -> guest
  - signed-in user A -> signed-in user B

Open design call inside the implementation:
- default to clearing both `required` and `optional` auth queries
- reason:
  optional-auth queries can still be identity-sensitive, and our repro already
  shows stale guest data after sign-in

### 3. Audit and wire transition triggers

- Wire sign-in, sign-up, and sign-out through that primitive
- Audit whether any other auth-state transition path can bypass mutation hooks:
  - session restore
  - OTT / token hydration
  - cross-tab session changes
- If such paths exist, route them through the same primitive or explicitly
  document them as out of scope for this cut

- In
  [auth-mutations.ts](/Users/zbeyens/git/better-convex/packages/kitcn/src/react/auth-mutations.ts):
  - sign-out should clear auth-bound cache, not just unsubscribe required queries
  - sign-in/sign-up should also clear auth-bound cache before the next read path
- Keep token/session hydration order explicit so the refetch happens against the
  new auth state

### 4. Prove in Next

- Reuse `next-auth` as the browser lane
- First prove the simpler guest -> account 1 transition, because it already
  reproduces the same bug family
- Then prove account 1 -> sign-out -> account 2 if the first fix lands cleanly
- Add a committed repro surface only if unit tests cannot cover the final bug
  honestly; otherwise keep the browser-only surface temporary

## Acceptance criteria

- After guest -> sign-in, auth-bound query data no longer shows guest-scoped
  cached output
- After account 1 -> sign-out -> account 2, auth-bound query data no longer
  shows account 1 output
- Public queries remain cached as before
- Auth transitions do not leave orphaned subscriptions behind
- Auth-transition fix works for both `required` and `optional` auth-bound query
  lanes
- Next auth browser proof passes with no stale user data

## Verification

### Targeted tests

- `bun test ./packages/kitcn/src/react/auth-mutations.test.tsx`
- `bun test ./packages/kitcn/src/react/client.lifecycle.test.ts`

Add specific new cases for:
- guest cache cleared on sign-in
- required auth cache cleared on sign-out
- optional auth cache cleared on identity change
- transition path does not rely on page remount or route navigation

### Runtime proof

- `bun run scenario:prepare -- next-auth`
- run the Next auth repro lane on `/auth` first
- browser proof:
  - while signed out, auth-dependent query shows guest
  - sign in as account 1
  - confirm auth-dependent query no longer shows guest
  - sign in as account 1
  - confirm auth-bound query shows account 1
  - sign out
  - sign in as account 2
  - confirm auth-bound query shows account 2, not guest/account 1

### Final gate

- `bun lint:fix`
- `bun typecheck`
- `bun --cwd packages/kitcn build`
- `bun check`

## Risks

- Clearing optional-auth queries may be more aggressive than some callers expect
- If auth session hydration lags behind token changes, the first refetch can
  still race unless mutation ordering is explicit
- Browser repro surface may need a small committed test page if unit proof is
  not enough
- Mutation-hook-only wiring is insufficient if auth can change through restore
  or callback paths without those hooks firing

## Execution handoff

### Available agent types

- `executor`: runtime seam changes in `client.ts` / `auth-mutations.ts`
- `test-engineer`: regression tests in `auth-mutations.test.tsx` /
  `client.lifecycle.test.ts`
- `verifier`: Next browser repro + final gate
- `debugger`: fallback if transition-time cache reset does not eliminate stale
  auth data on first pass

### Suggested seam

- Main execution seam:
  [auth-mutations.ts](/Users/zbeyens/git/better-convex/packages/kitcn/src/react/auth-mutations.ts)
  +
  [client.ts](/Users/zbeyens/git/better-convex/packages/kitcn/src/react/client.ts)

### Suggested reasoning

- Core runtime/cache lane: `high`
- Test lane: `medium`
- Browser verification lane: `medium`

### Available agent types

- `ralph`
- `team`
- `planner`
- `architect`
- `critic`
- worker models for team execution: `codex`, `claude`, `gemini`

### RALPH staffing

- One sequential pass is fine:
  runtime seam -> regressions -> Next browser proof -> final gate

### TEAM staffing

- Worker 1: runtime seam in `client.ts` / `auth-mutations.ts`
- Worker 2: regression tests in `auth-mutations.test.tsx` /
  `client.lifecycle.test.ts`
- Leader: Next browser repro + final integration gate

### Launch hints

- `ralph`:
  sequential execution is enough for this bug; use one lane for runtime seam,
  then tests, then Next browser proof, then final gate
- `$team` / `omx team`:
  split runtime, tests, and browser proof into separate lanes; keep the leader
  on verification and merge decisions

### Team verification path

1. targeted regressions in `auth-mutations.test.tsx`
2. targeted regressions in `client.lifecycle.test.ts`
3. temp Next auth browser repro proving guest/account-1 stale data is gone
4. `bun lint:fix`
5. `bun typecheck`
6. `bun --cwd packages/kitcn build`
7. `bun check`

### Launch hints

- `ralph`:
  execute this exact plan sequentially from the runtime seam outward
- `$team`:
  split runtime, tests, and browser verification into the three lanes above
- `omx team`:
  same split as `$team`, with the leader owning `next-auth` browser proof and
  final `bun check`

### Team verification path

1. Reproduce on the simpler Next lane: `guest -> account1`
2. Land unit regressions for cache reset on auth transition
3. Reprove browser state on `next-auth`
4. Run `bun lint:fix`
5. Run `bun typecheck`
6. Run `bun --cwd packages/kitcn build`
7. Run `bun check`
