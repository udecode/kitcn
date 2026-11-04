# Use the kitcn skills

This page is an index. It says what to type and which file owns each process,
and it restates no rule, so open the linked file for the rule itself.
[AGENTS.md](../../AGENTS.md) holds the rules every task needs and the routing
table.

## Install

kitcn runs on the `pstack@pstack-claude` plugin, pinned to one tag in
[`.claude/settings.json`](../../.claude/settings.json). In Claude Code, trust the
folder and run `claude plugin install pstack@pstack-claude --scope project`. In
Codex, run `codex plugin marketplace add michael-denyer/pstack-claude --ref
<tag>` and `codex plugin add pstack@pstack-claude` from your home directory with
the same tag, then trust the session hook in `/hooks`. Codex loads only the
first 32 KiB of `AGENTS.md` by default, so also put
`project_doc_max_bytes = 131072` above the first table in `~/.codex/config.toml`.

## Start with the outcome

Describe the result you want, with the package, route, issue or plan when you
know it. pstack's `poteto-mode` routes the request to a playbook, and kitcn's
playbooks in [`.agents/playbooks/`](../../.agents/playbooks/) build on pstack's.

| You say | What runs |
| --- | --- |
| "next" | [chips](../../.agents/skills/chips/SKILL.md), answering about open suggested tasks |
| "verdict <doc, draft, issue or idea>" or "what would you do from this?" | [Verdict](../../.agents/playbooks/verdict.md) |
| "plan" or `plan <goal>` | [Plan](../../.agents/playbooks/plan.md) |
| "go" | [Build](../../.agents/playbooks/build.md) |
| A bug report, screenshot or recording | [Bug fix](../../.agents/playbooks/bug-fix.md) |
| "babysit <number>", "clean up PR <number>" or "finish the current tree" | [Babysit](../../.agents/playbooks/babysit.md) |
| "clean up <surface>" | [Refactoring](../../.agents/playbooks/refactoring.md) |

Your own clone lands work straight on `main`; a contributor's clone opens a PR.
Both go through `node .agents/pstack/land.mjs`, as
[land.md](../../.agents/pstack/rules/land.md) says.

## Find the rule

| Process | Owner |
| --- | --- |
| Every task's rules, stops, delivery and the pstack overrides | [AGENTS.md](../../AGENTS.md) |
| Code rules, read before writing, reviewing or cleaning up code | [4-ultracite](../../.agents/rules/4-ultracite.mdc) |
| Product, API and DX law | [VISION.md](../../VISION.md) |
| Landing a task on `main` | [land.md](../../.agents/pstack/rules/land.md) |
| Panels, `architect`, arena and review rounds | [panel.md](../../.agents/pstack/rules/panel.md) |
| Plan pages and the hand-back reply | [pages.md](../../.agents/pstack/rules/pages.md) |
| Suggested tasks and their ledger | [chips.md](../../.agents/pstack/rules/chips.md) |
| Long runs, `/loop`, `/goal` and compaction | [long-runs.md](../../.agents/pstack/rules/long-runs.md) |
| The one-hour budget | [time.md](../../.agents/pstack/rules/time.md) |
| Tests | [tests.md](../../.agents/pstack/rules/tests.md) |
| Driving a browser | [browser.md](../../.agents/pstack/rules/browser.md) |
| Session titles | [title.md](../../.agents/pstack/rules/title.md) |
| Reflect, corrections and agent files | [reflect.md](../../.agents/pstack/rules/reflect.md) |
| Proof of packages, fixtures, scenarios, the example app and browsers | [verify](../../.agents/skills/verify/SKILL.md) |

## Installed skills

These skills live in this checkout's `.agents/skills` directory. pstack's skills
come from the pinned plugin; invoke them as `/pstack:<name>`, such as
`/pstack:how` or `/pstack:reflect`.

| Skill | Purpose |
| --- | --- |
| [4-ultracite](../../.agents/skills/4-ultracite/SKILL.md) | kitcn's code standards for formatting, style, correctness, React and performance. |
| [agent-browser-issue](../../.agents/skills/agent-browser-issue/SKILL.md) | Open a concise GitHub follow-up for a reusable browser-use limitation. |
| [better-auth-best-practices](../../.agents/skills/better-auth-best-practices/SKILL.md) | Configure Better Auth server and client, database adapters, sessions, plugins and environment variables. |
| [changeset](../../.agents/skills/changeset/SKILL.md) | Write the changeset for a release. |
| [changeset-doc-sync](../../.agents/skills/changeset-doc-sync/SKILL.md) | Sync every doc in `www` and the published skill to the active changesets. |
| [changeset-resolve](../../.agents/skills/changeset-resolve/SKILL.md) | Repair an unreleased changeset so it matches the branch's real change against `main`. |
| [chips](../../.agents/skills/chips/SKILL.md) | Run the project's suggested-task ledger, the chips. |
| [cleanup](../../.agents/skills/cleanup/SKILL.md) | Remove the git worktrees and Next.js cache folders nothing uses. |
| [component-colocation](../../.agents/skills/component-colocation/SKILL.md) | Merge over-split components, colocate files where they are used and remove unused code. |
| [concave](../../.agents/skills/concave/SKILL.md) | Work on the Concave runtime. |
| [concave-parity](../../.agents/skills/concave-parity/SKILL.md) | Keep Concave in parity with Convex. |
| [convex-release-audit](../../.agents/skills/convex-release-audit/SKILL.md) | Audit newer Convex npm releases against kitcn. |
| [design](../../.agents/skills/design/SKILL.md) | Design and build kitcn UI from the live `www` and `example` tokens and base components, with browser proof. |
| [jotai-x](../../.agents/skills/jotai-x/SKILL.md) | Work with Jotai X stores and their persisted state. |
| [kitcn](../../.agents/skills/kitcn/SKILL.md) | The published end-user skill: Convex and kitcn setup and feature work across cRPC, ORM, auth and React. |
| [next-dev-loop](../../.agents/skills/next-dev-loop/SKILL.md) | Verify Next.js runtime behavior after editing app code. |
| [nextjs](../../.agents/skills/nextjs/SKILL.md) | Next.js routing with typed routes, page and layout props, and nuqs URL state. |
| [package-release-audit](../../.agents/skills/package-release-audit/SKILL.md) | Audit newer npm package releases against kitcn. |
| [plan-page](../../.agents/skills/plan-page/SKILL.md) | Write, check, repair and publish a plan page. |
| [react-query](../../.agents/skills/react-query/SKILL.md) | TanStack Query ownership for cRPC queries, mutations, live subscriptions, RSC preloading and invalidation. |
| [redo](../../.agents/skills/redo/SKILL.md) | Redo a prior pstack run at a higher effort or a stronger model. |
| [research-wiki](../../.agents/skills/research-wiki/SKILL.md) | Run the `docs/research` compiled layer in full or maintain mode. |
| [shadcn-parity](../../.agents/skills/shadcn-parity/SKILL.md) | Keep kitcn's registry in parity with shadcn. |
| [sync-convex-auth](../../.agents/skills/sync-convex-auth/SKILL.md) | Sync `zbeyens/convex-better-auth` with upstream, then kitcn with it. |
| [test-audit](../../.agents/skills/test-audit/SKILL.md) | Remove or rewrite low-value, duplicated or implementation-coupled tests on evidence. |
| [toast](../../.agents/skills/toast/SKILL.md) | Toast notifications with Sonner. |
| [turborepo](../../.agents/skills/turborepo/SKILL.md) | Turborepo task graphs, caching, filtering and package tasks. |
| [verify](../../.agents/skills/verify/SKILL.md) | Prove kitcn behavior through its real owners: tests, fixtures, scenarios, the example app and the browser. |
| [video-transcripts](../../.agents/skills/video-transcripts/SKILL.md) | Transcribe a video with Gemini. |
| [walkthrough](../../.agents/skills/walkthrough/SKILL.md) | Make a short annotated walkthrough from real final-state screenshots. |

## Edit the rules

Edit repository rules in `.agents/rules` and run `bun install`, which
regenerates `.agents/skills` and `.claude/skills`. The pstack block in
`AGENTS.md`, `.agents/pstack.json`, `.agents/pstack/` and its rule files come
from the `sync-pstack` skill in `udecode/dotai`, so shared rules change there.
kitcn stays out of syncs that name no project until the owner adds it.

## Retired commands

The owner retired kitcn's own workflow skills on 2026-11-04. Older plans and
PRs still name them.

| Old command | Today |
| --- | --- |
| `task`, `autogoal` | "go" through the [Build](../../.agents/playbooks/build.md) playbook, which keeps a decision log |
| `major-task`, `to-prd`, `to-milestone`, `vision`, `sync-vision` | "plan" through the [Plan](../../.agents/playbooks/plan.md) playbook, against `VISION.md` |
| `auto`, `autoclosure`, `resolve-pr-feedback` | the [Babysit](../../.agents/playbooks/babysit.md) playbook |
| `grill-with-vision`, `avoid-feature-creep` | the [Verdict](../../.agents/playbooks/verdict.md) playbook |
| `architecture-cleanup` | the [Refactoring](../../.agents/playbooks/refactoring.md) playbook |
| `hard-cut` | the Build playbook's hard cut |
| `diagnosing-bugs` | the [Bug fix](../../.agents/playbooks/bug-fix.md) playbook |
| `autoreview`, `agent-native-reviewer` | a panel, `/pstack:interrogate` |
| `prototype` | pstack's Prototype playbook |
| `orchestrator`, `linear-backlog` | suggested tasks through `chips` |
| `resolving-merge-conflicts` | `/pstack:fix-merge-conflicts` |
| `deslop`, `tdd` | `/pstack:deslop`, `/pstack:tdd` |
| `scenarios`, `testing` | `verify` |
| `find-skills` | none; ask the owner |
