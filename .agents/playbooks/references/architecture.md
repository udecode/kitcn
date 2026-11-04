# kitcn architecture reference

The Plan playbook reads this file in full for an API or architecture plan, the Build playbook reads its Hard cut, a read-only architecture audit reads its Audit, and every P0 to P3 finding uses its Priority. The Verdict playbook judges a call shape, and `verify` owns the proof.

## Pick the owner

Read root `VISION.md` and `docs/README.md` first. VISION's laws bind every decision row; link them instead of copying them into the plan.

- One concept gets one canonical owner and public name. Put behavior in the package or runtime that owns it: the cRPC server or client, the ORM, auth and its better-auth adapter, a plugin, the CLI and its codegen, or a scaffold template. Root tooling coordinates workspaces and never absorbs package logic. Adapters translate at a boundary and never redefine the concept.
- Convex statically bundles each function entry and supports no dynamic import. Name each static import a function entry gains or loses, and prefer per-module callers, plugins and leaf imports over a registry every entry pulls in. Optional behavior lives behind a plugin.
- Generated output is never the owner. Fixtures, example plugin files, the repo-local kitcn skill copy and generated agent files change at their template or source, then regenerate.
- Before the first design, read how Drizzle, tRPC, TanStack Query, better-auth or shadcn does the same job, from its local clone in `..`, cloned there when missing. Copy the familiar mental model and deviate only where Convex semantics make it dishonest.
- Authorization fails closed at the data or action owner. UI state is not a permission boundary.

## Decision ledger

Keep one concept-level ledger in the plan:

| Surface | Current | Target | Owner | Reason | Adoption | Proof | Risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Verdicts are `keep`, `cut`, `rearchitect`, `rename`, `move`, `defer` or `gate`. Use one row per concept or runtime responsibility, not per exported symbol. A break row names its callers, `www` docs, kitcn skill references, templates, examples and fixtures, and its proof; `defer` names the missing evidence and the next owner. Rank changes by long-term value and order slices by dependency.

## Gates

- A high-risk change (public API or inferred types, cRPC procedure context or middleware, ORM query, mutation or relation semantics, auth and sessions, live subscriptions and invalidation, codegen, scaffold output or the CLI's `--json` output) records three realistic failures, its blast radius from `pstack:blast-radius`, its hard-cut answer and focused proof.
- A row that changes a function entry's import graph names the entry and each import it gains or loses, read from source after the change.
- A CLI row keeps the command deterministic, non-interactive under `--yes` and machine-readable under `--json`, and proves it with the command's own output.
- A cache, skip or selection rule that decides whether a check runs can let a broken change land, so before the plan accepts it, a probe replays the rule on a past change it must not skip and on an edit it must notice, and the probe stays as its test.
- A blast-radius probe that disproves a fact shipped code relies on confirms a violation. Run the Bug fix playbook's Pokayoke audit over every reader of that fact, and send the shipped defect to the Bug fix playbook beside the plan instead of only listing it as open work.

## Page sections

A plan that picks an API or architecture target writes these sections as its delta, each only when it applies. The plan page renders them right after Public API, in this order, because the Plan playbook's `page-lead` frontmatter names them and the plan names that playbook with a `Playbook: plan` line. The ledger stays the source for owners, verdicts and breaks.

- `## Prior art`, always: one sentence saying what was read (repository revision or package version) and the outcome, then a table with one row per library and one column per question the decision turns on, such as where the type flows or what the caller writes. Cover each library `VISION.md` names whose job matches; a library that was read but not run says so.
- `## Owner and bundle`, when a row moves or adds an owner or changes a function entry's imports: a table of `Change | Package | Export path | Why`, taken from the ledger's Owner column, with what a Convex function entry statically imports through that path.
- `## Hard cuts and migration`, when anything public is removed or breaks: what is deleted, the callers that break from `pstack:blast-radius`, and the app code, templates and docs that must change, with before and after code. That code is the changeset's Before/After snippet too.

## Ready

An architecture plan is ready only when every current-state claim has live evidence, every responsibility has one owner, every row has a resolved verdict, every public break has adoption, docs, changeset and proof answers, the slices and their verification are concrete, every conditional gate is resolved or marked inapplicable with a reason, every Page section that applies is written, and no decision-changing question remains. Missing evidence is an open gate, never a confidence score.

## Hard cut

kitcn is in closed alpha with no external users, so a breaking change lands as a hard cut: no alias, deprecated shim, fallback parsing, migration bridge or test of the previous API. A change that replaces an API with a better one for the same job carries that cut when its plan or the owner's request makes the change, and the plan records the break as a `look` Defaults row with the word that reverses it. Removing a feature whose job nothing replaces runs only when the user asks for that removal, through the Build playbook. A Pursue verdict on a review the user asked for counts as that ask for the removals its plan names. So does `VISION.md` when it already rules the removal or gives the job to another owner, and that row cites the law. Any other removal becomes a verdict item instead of an owner question. The run keeps the behavior as a `look` Defaults row. When the question is P0 or P1, or the run's verdict judges it, it offers the question as a `decide` chip, as the Verdict playbook's Topics says; otherwise it lists it in the plan's Open work, as chips.md's Offer says. A hard cut deletes the feature in one wave, per `pstack:principle-migrate-callers-then-delete-legacy-apis`, and reaches every caller.

- Delete the feature and its glue code: exports, CLI commands and flags, plugin options, codegen output, template files, types, state, tests of the deleted behavior, `www` docs, kitcn skill references, examples and comments about the old code.
- Leave no `Not implemented` throws, stub handlers, "feature removed" notices, compatibility aliases, shims, fallback parsing, migration bridges, dead enum or union members, permanently-false flag branches or unused env vars and config.
- Before deleting, run `pstack:blast-radius` on the removed feature to find the consumers grep misses: generated code, scaffold templates, fixtures, the example app, docs and skill references. An open plan, one whose `Status:` line names a state that `.agents/pstack/status.mjs` does not count as done, is a consumer when a step or proof command cites what the cut removes. Flag each on the page, per the Delivery rule.
- Keep cutting the dead code the removal exposes, then grep again for the removed name and its obvious aliases. Judge that grep on live source, current docs, skills and open plans. Decision logs and closed plans keep old names as history.

Closeout for a cut:

- `bun --cwd packages/kitcn build` when package source changed.
- `bun run fixtures:sync` then `bun run fixtures:check` when a template or scaffold changed.
- A `minor` changeset with a Before/After snippet for each break, per `changeset`.
- The `www` pages and kitcn skill references synced to the surviving API.
- The narrowest honest verification for the surviving product, through `verify`.

## Audit

An audit scores one scope's current architecture, read-only; it writes only its report. Build a bounded manifest of its units first and report `expected=<n> reviewed=<n> excluded=<n> missing=<n> duplicates=<n>`; each exclusion needs a reason, and a partial lexical search is not a complete manifest. A unit is one independently scoreable package, public export path, plugin, CLI command family or cross-package runtime owner. Score and rank each unit separately, and never publish an average across units, because averaging unrelated architecture hides blockers.

A package audit builds its manifest with `git ls-files --cached --others --exclude-standard packages/<package>`, so every untracked source, test and config file is a required row, and each row names its path, verdict, owner, evidence and next action.

Classify every state value before judging its API:

| Lifetime | Canonical owner |
| --- | --- |
| Durable data | Convex tables, through the ORM schema |
| Request state | the cRPC procedure context and its middleware |
| Client cache | TanStack Query, keyed by the procedure and kept live by its Convex subscription |
| Project configuration | `kitcn.json` and the CLI that reads it |
| Generated code | the codegen or template that writes it |

Then trace all writers, readers, invalidation and reset paths. A cache is not a second truth only when callers cannot write it independently and its source owns invalidation. Wrong ownership or lifetime is structural failure; tests and a short call site cannot average it away.

Grade each axis 0 to 4: 0 contradicted, 1 accidental (works through leaks, duplication or manual synchronization), 2 mixed (a plausible owner with parallel truths or partial adoption), 3 coherent (bounded adoption or proof gaps remain), 4 canonical (one truthful owner, complete adoption, direct proof). Missing evidence is not grade 0; it makes the audit incomplete.

| Axis | Weight | Question |
| --- | ---: | --- |
| `owner` | 2.0 | Is there one canonical owner with no competing writable truth? |
| `lifetime` | 2.0 | Does every value live, persist, reset and invalidate at the correct lifetime? |
| `boundary` | 1.0 | Do packages, export paths and dependencies tell the truth about where code runs? |
| `api` | 1.5 | Is the common public path small, inferable, composable and familiar? |
| `bundle` | 1.5 | Does each Convex function entry import only what its job needs? |
| `correctness` | 1.0 | Are data, auth and type-safety laws centrally preserved? |
| `proof` | 1.0 | Are the owner, adoption, docs, generated output and runtime paths directly proved? |

The raw score out of 10 is the sum of each grade divided by 4 times its weight; compute it in the report, never by eye. Every axis row gives the grade and weighted points, at least one current source citation, the reason, and the falsifier that would change the grade. Then apply the lowest evidenced cap: `wrong-owner` or `duplicate-truth` caps at 2.0, `wrong-lifetime` at 3.0, an export path that cannot run in its declared runtime at 5.0, a correctness blocker (data loss, an authorization leak or a broken type contract) at 1.0 and leads the verdict, and an incomplete manifest leaves no numeric score.

The report gives each finding one row:

| Priority | Surface | Current friction | Best direction | Delete / hide | Owner | Proof |
| --- | --- | --- | --- | --- | --- | --- |

## Priority

Every kitcn review, audit and research finding uses this scale; panel findings use the critical, warning and nit that `.agents/pstack/rules/panel.md` defines instead, and a chip's priority follows chips.md's Priority.

`P0` covers confirmed data loss, an authorization leak, a broken public contract or inferred type, a function entry that breaks Convex's static bundling, or a foundational public shape that would spread costly damage as more code adopts it. `P1` covers a wrong canonical owner or lifetime, competing writable truth, or high-frequency DX, inference, CLI or composition debt. `P2` covers bounded API, adoption, bundle or proof debt with a safe current path. `P3` covers local naming, teaching or cleanup debt with no architectural harm. A low score is not automatically P0, and a high score can still hide one P0 defect. Rank by user cost rather than redesign interest, ground every finding in current source and call sites, and keep implemented debt apart from speculative ideas.
