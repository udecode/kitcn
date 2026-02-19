Use this as your battle-test prompt:

```md
I want you to simulate onboarding for a brand-new better-convex app and ship a full-stack demo app in 4 hard-gated phases.

Important framing:
- Simulate a real new user who does not know better-convex internals.
- Use `skills/convex/SKILL.md` for all better-convex-specific setup/implementation details.
- Keep this runbook outcome-focused; avoid hardcoding low-level framework internals here.

## Global Rules

1. Work in a brand-new repository at `/tmp/simulation-1` (create if missing).
2. All code, planning files, and verification artifacts must live under `/tmp/simulation-1`.
3. Do **not** read or modify the current repository.
4. Use `.codex/skills/planning-with-files/planning-with-files.mdc` for tracking/reporting.
5. Keep `task_plan.md`, `progress.md`, and `findings.md` updated continuously.
6. In `findings.md`, log blockers/friction with: severity, phase, source file/section, issue, proposed fix.
7. Do not use `@ts-nocheck`.
8. No subscriptions in this simulation (no subscriptions table, feature paths, or billing flow).
9. Headed `agent-browser` is required at each phase gate.
10. Fail-fast sequencing: never start phase N+1 before phase N gate fully passes.
11. Use the actual running dev server URL/port for browser smoke (port may not be 3000).

## Phase 1: Public CRUD Foundation (No Auth)

Scope:
- Bootstrap app foundation.
- Implement public CRUD for core entities (projects/todos/tags/comments).
- Add basic public API demo endpoints (`/api/health`, `/api/demo/echo`).
- Add seed/reset skeleton.

## Phase 2: Auth + Org/Admin

Scope:
- Add auth end-to-end in one phase, including org/admin capabilities.
- Add auth UX routes and one protected mutation flow.
- Confirm signed-in success and signed-out protection.

## Phase 3: Full Product Surface (No Subscriptions)

Scope:
- Expand to full domain surface (users/orgs/todos/projects/tags/comments).
- Deepen relation handling and ownership/org scoping.
- Expand RSC + React Query usage across key flows.
- Expand HTTP router coverage for domain use cases.

## Phase 4: Full Coverage Hardening

Scope:
- Complete hardening and integrity features (aggregates, triggers, rate limiting, ORM safety behavior).
- Finalize seed/reset robustness.
- Prepare doc patch suggestions from findings.

## Per-Phase Gate (required after every phase)

1. Run `bunx better-convex dev --once --typecheck disable` (preferred; includes codegen).
2. Run `bun run typecheck` (fallback `bunx tsc --noEmit`).
3. Run `bun test`.
4. Run `bun run build`.
5. Run headed `agent-browser` smoke for the phase route set.
6. Save evidence under `/tmp/simulation-1/evidence/phase-N/`.
7. If any check fails, fix in-phase and rerun gate. Do not continue.

## Route Smoke Matrix

- Phase 1: `/`, `/todos`, `/projects`, `/tags`, `/http-demo`
- Phase 2: `/auth`, `/org`, plus one protected mutation flow
- Phase 3: `/`, `/auth`, `/todos`, `/projects`, `/tags`, `/org`, `/http-demo`
- Phase 4: full matrix from Phase 3 plus final API smoke

## Mandatory Validation Focus

- Phase 1: public CRUD happy path, not-found path, public HTTP checks.
- Phase 2: unauthenticated rejection, forbidden admin path, org membership guard, successful sign-in check.
- Phase 3: relation-depth reads, ownership/org scoping, RSC prefetch + hydrate behavior.
- Phase 4: trigger side-effect correctness, aggregate consistency, rate-limit enforcement, full-route browser smoke, final API smoke.

## Final Report Requirements

Final output must include:
1. What worked.
2. Blockers/friction encountered.
3. Evidence paths for each phase gate.
4. Concrete doc patch suggestions.
5. Confirmation that all 4 phase gates passed in order.
```
