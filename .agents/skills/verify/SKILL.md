---
description: Review implementation ownership and verify kitcn packages, the CLI and its `kitcn init -t` scaffolds, prepared scenario apps, auth lanes, and the www docs and example app through their actual proof owners. Use before writing a plan's proof gates, before writing or changing any test, before claiming a fix works, before calling a failure pre-existing or unrelated, before closing any change with a browser-visible result, when choosing a scenario's proof path, and when a test is flaky, contaminated by another file or times out.
argument-hint: '[package | cli | scaffold | scenario <name> | www | example | auth | testing] <target>'
name: verify
metadata:
  skiller:
    source: .agents/rules/verify.mdc
---

# Verify

This is the driver skill for pstack's Bug fix playbook. It owns implementation
acceptance, proof selection, launch, doctor, driving and evidence for kitcn.
Its testing reference, `.agents/rules/verify/references/testing.md`, owns Bun
and React test design, suite contamination and flaky failures. Read that
reference in full before you write, change or debug a test.

## Completion boundary

Before you choose proof, state the reported setup, input, expected result and
any necessary follow-up. Keep them in the existing task plan or case.

Select the smallest proof owner that can observe each required result. A unit
test can diagnose a scaffold, runtime or browser defect without proving it. A
committed fixture snapshot proves generated output, not that the generated app
runs. A scenario that reaches ready proves runtime startup, not a browser auth
flow.

A follow-up from the reporter adds to the original acceptance. It never
replaces it. A narrower green test cannot discard an original requirement.

Report local verification separately from publication. A green local proof
says nothing about a published package until the packed artifact is checked.

## Review the implementation

For a changed implementation, review the final diff, its owning path and the
consumers that use it differently before you accept verification. Do this
before an expensive final replay. An existing review of the same candidate
counts.

- Keep the review proportional. A direct local correction needs a direct source
  check, not an architecture exercise.
- Each added effect, subscription, timer, cache, retry or fallback must earn its
  place through a current requirement and a correct lifetime. Remove the cause
  when you can, instead of compensating for it.
- Check that the proof observes the user invariant. A mock of the owner or an
  assertion on the new mechanism can hide the original design error.
- Scaffold output has one owner, the package scaffold source. A fix applied to
  `example/` output, an example plugin file or `fixtures/**` first is in the
  wrong owner. Change the package template, then regenerate with the CLI
  (`kitcn add ... --overwrite` for plugins, `bun run fixtures:sync` for
  fixtures).

Record the conclusion and its decisive source evidence in the task plan or
handoff. A verified ownership defect keeps the work open even when tests pass.
A clean design does not replace runtime proof, and passing runtime proof does
not accept a deficient design.

## Canonical inventory

Discover the inventory from these owners. Do not keep a second feature map or a
hand-maintained coverage count. `pstack:maintain-verification-skill` works on
this file and these owners.

| Surface | Inventory owner | Proof and driving recipe |
| --- | --- | --- |
| Package behavior | `packages/*` sources and their `*.test.ts`, `*.vitest.ts` and `*.test-d.ts` files; `convex/**/*.test.ts` | `bun run test` runs `bun test` (root `./packages`, preload `tooling/test-setup.ts`) and then `vitest run` (`vitest.config.mts`, the `integration` and `solid` projects). Run one file first with `bun test <file>` or `bunx vitest run <file>`. |
| Types | `turbo typecheck` across workspaces | `bun typecheck`. Typecheck is source-first, so do not build a package just to run types. |
| Package artifact and exports | `packages/kitcn/package.json` exports and build output | `bun --cwd packages/kitcn build` after any package change and for any artifact or export claim. `bun run intent:pack` lists what would publish. |
| CLI commands | `packages/kitcn/src/cli/` | `bun run test:cli` runs `cli.commands.ts` with `CI=1`. A behavior claim about a command also runs that command in a prepared scenario project. |
| `kitcn init -t` scaffolds | `tooling/template.config.ts`; committed output in `fixtures/*` | `bun run fixtures:sync`, then `bun run fixtures:check`. `fixtures:check:full` builds the package and checks the full scope. |
| Runtime scenarios | `SCENARIO_KEYS` and `SCENARIO_DEFINITIONS` in `tooling/scenario.config.ts`; `resolveScenarioProofPath` in `tooling/scenarios.ts` | The proof path for each key, as [Scenario proof](#scenario-proof) says. |
| Concave backend | `test/concave/` | `bun run test:concave`. |
| `kitcn verify` in a fresh app | `test:verify` in root `package.json` | `bun run test:verify` prepares `create-convex-bare` and runs `bunx kitcn verify` inside it. |
| www docs | `www/content/docs/**`, `www/app/` | `bun dev` serves the docs app. Drive the route in the browser. |
| Example app | `example/` (Next on port 3005 with a kitcn Convex backend) | The [example launch](#launch) and a browser drive. |
| Auth browser flows | `tooling/auth-smoke.ts`, `tooling/auth-e2e.ts` | `bun run test:auth -- <name|url>` and `bun run test:e2e -- <name|url>` against a running app. |

For each selected item, record its user entry, setup and action, expected
effect and gotchas from the source and its existing proof. A file count is
discovery only.

## Scenario proof

Committed `fixtures/*` are sources only. Never run them in place. Each runnable
app is prepared into `tmp/scenarios/<name>/project`. `fixtures:*` commands own
the committed snapshot sync and check. `scenario:*` commands own the runnable
temporary apps.

```bash
bun run scenario:prepare -- <name>
bun run scenario:dev -- <name>
bun run scenario:check -- <name>
bun run scenario:test -- <name>
bun run test:runtime
```

`scenario:test -- <name>` runs the key's whole proof path and stops what it
started. `test:runtime` runs `scenario:test -- runtime`, which is every key
whose proof path is not `check`, and is the default non-browser runtime gate.
`test:auth` and `test:e2e` assume the scenario already runs.

Read `resolveScenarioProofPath` in `tooling/scenarios.ts` for the key's proof
path. It returns one of four paths:

- **`runtime`.** Prepare, run `scenario:dev` until the ready URL answers, then
  stop. `scenario:test -- <name>` does all three.
- **`auth-demo`** (`next-auth`, `start-auth`). The runtime proof plus
  `test:auth`, which `scenario:test` runs once the app is ready. This proves
  runtime and auth smoke only. Browser auth proof is the separate `test:e2e`
  lane. Prepare, start `scenario:dev`, then run `bun run test:e2e -- <name>`.
- **`auth-runtime`** (`expo-auth`, `vite-auth`). The runtime proof only. These
  apps have no `/auth` page or other browser auth page. Do not fake
  `test:e2e` or add `test:auth` here unless the registry grows an auth proof
  lane for them.
- **`check`** (the bootstrap-heavy Convex keys in `BOOTSTRAP_CHECK_SCENARIOS`).
  `bun run scenario:check -- <name>` is the proof. Do not replace it with an
  ad-hoc `scenario:dev`. Fresh kitcn lanes bootstrap during `scenario:prepare`
  through `kitcn init -t <next|vite> --yes`, then finish with an in-place
  `kitcn init --yes` after plugin setup. The raw Convex auth adoption lanes own
  `convex init` plus `kitcn add auth --preset convex --yes`. They are not a
  `next-auth` browser demo, so do not invent `/auth` for them.

Run `test:e2e` only when an auth page or flow changed. Default `bun check` never
depends on it.

If a scenario has no real browser auth page, do not invent one. Stop once
the assigned proof path succeeds. Do not keep poking the app after that.

Re-run `bun run scenario:prepare -- <name>` once when any of these holds:

- package or scaffold source changed after the app was prepared;
- the app is missing expected local env or generated files.

Otherwise reuse the prepared app. If it still fails after one re-prepare, debug
the cause. Do not loop on re-prepare.

## Launch

Run from the current checkout. Read the relevant script first, and never reuse
a port or path from another checkout. Start each long-running process in the
background and keep its handle for cleanup.

1. A fresh worktree needs its env files and dependencies first. Copy every
   nested `.env` and `.env.local` from the source checkout, including
   `example/.env.local` and `example/convex/.env`, then run `bun install`.
   `bun install` also regenerates the skills from `.agents/rules`. Before the
   first scenario or fixture run, run `bun run build:pkg`. Scenario prepare
   builds `kitcn` itself but packs `packages/resend/dist` as it is, so without
   that build it fails with `ENOENT` on that folder.
2. Pick the launch that matches the surface:
   - **Scenario.** `bun run scenario:dev -- <name>` after `scenario:prepare`.
     It starts the app and its backend from `tmp/scenarios/<name>/project`. It
     is ready when the URL in the project's `NEXT_PUBLIC_SITE_URL` or
     `VITE_SITE_URL` answers, or `http://127.0.0.1:3210/_dashboard` when the
     project has no site URL. The app's dev port starts at 3005 and moves up
     when that port is taken.
   - **www docs.** `bun dev` runs `next dev` in `www`. It is ready when Next
     prints its ready line and the route renders.
   - **Example app.** `bun --cwd example dev` runs `mprocs`, a terminal UI an
     agent cannot drive. Start its two processes instead,
     `bun --cwd example convex:dev` and `bun --cwd example dev:app`. The app is
     ready when `NEXT_PUBLIC_SITE_URL` (port 3005) renders the route and the
     backend at `NEXT_PUBLIC_CONVEX_URL` answers.
   - **Library only.** Use the package test and type scripts. No app launch is
     needed unless the claim depends on rendering or a running backend.
3. Run one scenario dev process at a time per checkout. Scenarios share the
   local Convex backend port, so two at once can drive the wrong backend.

Ready means the route renders current source. A process that listens is not
proof. If a launch fails, capture its output and clean what you started before
another attempt.

## Doctor

Run these read-only checks before driving and after anything surprising:

1. Bind the process to this checkout. On macOS,
   `lsof -nP -iTCP:<port> -sTCP:LISTEN` names the listener and
   `lsof -a -p <pid> -d cwd -Fn` its cwd. A listener from another checkout is
   not yours to use or stop.
2. Request the route with `curl --fail --silent --show-error <url>`, then open
   it in the browser. HTTP success proves reachability only. The browser must
   show the route without a build error or overlay.
3. For a scenario, read `tmp/scenarios/<name>/.kitcn-scenario/scenario.json`.
   Its `kitcnPackageSpec` and `steps` name what the app was prepared from. If
   package or scaffold source changed since, re-prepare once.
4. When the process is healthy but the app state is wedged, reset to a known
   state or relaunch. A failed drive always runs doctor and cleanup before
   another attempt.

Two failure shapes have a known local recovery. Run each recovery once, then
rerun the exact failing command:

- **Local env rot.** Typecheck, build, dev or a test fails with missing-module
  or package-resolution errors the diff does not explain, or with local React
  runtime errors (`Invalid hook call`, a null dispatcher in
  `resolveDispatcher()`, a package-local `node_modules/react` under
  `packages/*`, mixed `.bun` and `.pnpm` React paths in one stack). Run
  `bun install` once. If the failure changes or disappears, it was env rot.
  If not, debug the code. Reinstalling is never a substitute for fixing a real
  code error. If you see
  `failed to load config from .../vitest.config.mts`, remove every
  `**/node_modules` and install again.
- **`fixtures:sync` EPIPE.** `bun run fixtures:sync` dies with a Convex or
  esbuild `EPIPE`, `The service was stopped` or
  `Timed out waiting for local Convex bootstrap`. Kill the stale esbuild and
  Convex workers this checkout's earlier runs left, found by cwd with `lsof`,
  once, then rerun the sync. If the workers stay in the `U` state after
  `kill -9`, the host needs a reboot. Ask the owner for it.

## Drive

Drive the real user path. Prefer stable handles such as route paths, ARIA
labels, visible text and CLI flags over coordinates.

**Browser.** Use the runtime's browsers in this order:

1. The in-app browser first, for route navigation, DOM checks, forms,
   screenshots, responsive checks and rendered UI proof. In Claude Code that is
   the Browser pane. In Codex it is the Browser plugin.
2. Chrome directly when the claim involves native browser, profile or OS
   behavior, such as downloads, print preview, file pickers, uploads,
   clipboard, permissions, dialogs, extension or profile state, or exact Chrome
   rendering. In Claude Code that is Claude in Chrome. In Codex it is the Chrome
   plugin. Browser proof alone does not close such a claim.
3. Computer use only when native Chrome or OS UI must be inspected or operated
   and Chrome automation cannot read it, such as print preview, save and open
   dialogs or permission sheets.

When the in-app browser hits a known limit and native proof matters, switch to
Chrome or computer use. Do not lower the claim or ask the owner to confirm. Do
not substitute Puppeteer, standalone Playwright or raw Chrome DevTools for these
browsers.

For a UI change, cover the route at each breakpoint it changes and every state
the `design` skill's Honest States list names that the change touches.

**Docs.** Wait for the page heading and rendered body after navigation. HTTP
success and title metadata can arrive before the content.

**CLI.** Run the command inside a prepared scenario project, never in
`fixtures/*` or the example app. Use `--yes` for non-interactive runs and
`--json` when the claim is about output. Check the files the command wrote, its
stdout and its exit code. A dry run is a separate claim from a write run, so
observe the files for each.

**Scaffolds.** After any `init -t` template or scaffold change, run
`bun run fixtures:sync` and then `bun run fixtures:check`, with no exceptions.
The sync regenerates every file under `fixtures/**`, including each committed
fixture `package.json`. Never patch a fixture file by hand. Review the fixture
diff the sync produced as part of the proof.

**Auth.** Prepare and start the scenario, then run `bun run test:auth -- <name>`
for auth smoke or `bun run test:e2e -- <name>` for the browser auth lane. Pass a
URL instead of a name to drive another running app, such as the example app at
`http://localhost:3005`.

## Evidence

Keep command logs, the route and host, the input or action, the observed
result, runtime errors and screenshots under the main checkout's
`docs/plans/artifacts/<task-slug>/`, written by absolute path. Git ignores that
folder, and removing a worktree would delete a copy kept inside it. Never
commit proof logs. Keep the concise conclusion and the proof references in the
task plan.

Each base, candidate and control run writes its own named log. Capture the
action and the resulting state, plus follow-up input and side effects such as
files written, rows inserted or emails sent when the claim needs them. Mock only
a boundary production code already isolates, and say what the mock cannot
prove. A test run that prints an uncaught error stack is not green even when the
runner reports a pass.

A requested gate that fails keeps the work open until the same gate passes on
the final bytes. Calling a failure unrelated does not close it. Only the same
command failing the same way at the base commit, run in a clean detached
worktree, makes it pre-existing.

The final repo gate is `bun check`. `bun check --list` names its steps: the
package build, intent validation, lint, typecheck, the Bun, Vitest, tooling,
CLI and Concave tests, `fixtures:check`, `test:verify` and `test:runtime`.
Run it before a PR, after `bun lint:fix`. `bun check <step>` reruns one step.

## Cleanup

Stop only the processes you started, by their handle or a PID you verified.
Never kill by process name, and never stop another checkout's listener. Stop
spawned scenario dev processes once their proof succeeds or fails.
`scenario:test` and `scenario:check` stop what they start. Remove only this
run's temporary state. A prepared `tmp/scenarios/<name>` may stay for reuse.

Then confirm every cited evidence file still exists. Cleanup that deletes
evidence invalidates the run.
