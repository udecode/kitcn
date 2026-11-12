---
extends: investigation
when: Use it for `verdict` on any input, "what would you do from <material>", a kitcn API, architecture or DX proposal to judge before any work, a `decide` chip, or "again" after a verdict.
---

# Verdict

Verdict says what to do from an input. Intake reads any input, such as a teammate's doc, a draft, an issue, a PR or a one-line idea, and writes one page that closes at once: pushback, one outcome per item and an order. The proposal path judges one API, architecture or DX question and writes a Stop, Pursue or Defer into a plan file. Chips, through `.agents/pstack/rules/chips.md` and the `chips` skill, hold every open question.

## Paths

The proposal path runs on:

- `verdict <material>` when the material is one API, architecture or DX proposal;
- a started `decide` chip;
- a verdict another playbook runs inside its own run, such as Build's verdict on a replaced panel-fix mechanism, Bug fix's verdict on an owner after failed fixes and Babysit's verdict on a review comment that changes a public API. It returns to that run, which owns the close.

Any other `verdict <material>` or "what would you do from <material>" runs intake. A bare `verdict` takes the material already in the request and asks for some when there is none. A paste with no ask is not a verdict request. "review PR <number>" stays with the Babysit playbook and a lone bug report with the Bug fix playbook.

## Intake

Intake judges each item of the input and writes no plan. It splits the input into items, one per claim, proposal, defect or question, and gives each one outcome. "Open question" is an item outcome, never the page's `## Open questions` section.

| Outcome | Intake gives it when | Evidence bar | Writes |
| --- | --- | --- | --- |
| Bug | Current behavior breaks a law, a decision or the user's job | The defect at a path and line read this session, claimed no wider than that read proves. P0 or P1 only when this session reran the repro or a failing test exists; otherwise P2 with the reported steps | A `fix` chip, a `decide` chip when the fix is itself a design choice, or a `folded` row on the open task that covers it |
| Settled | `VISION.md`, an accepted ADR in `docs/adr`, a plan's decision or landed code with its test answers the exact question, or the input's own later decision withdrew the proposal | The deciding artifact | Nothing; `open <n>` reverses it |
| Stop | The proposal earns no further work: a false premise, a law it breaks without arguing against it, or a shipped API that already does the job | The law or fact at a path and line, with the incumbent shown. Missing evidence is never Stop, and an argument that the law is wrong is an Open question | Nothing; `open <n>` reverses it |
| Defer | A named observation or prerequisite can change the answer | What would settle it and which result changes the answer | A chip for that evidence: one that waits on a real task, plan or PR where one exists, a P3 measurement chip when the measure cannot fit the hour, or, for an outside event such as a Convex release, a P3 chip whose finding names the event and where to look |
| Open question | A real choice remains between owners, stored shapes, APIs or behaviors, the input argues that a standing decision is wrong, or it proposes removing behavior | The question, the evidence and the lanes seen, not judged | A `decide` chip by Topics below. For a proposed removal the owner did not ask for, intake keeps the behavior, as the architecture reference's Hard cut says |

**Depth.** Intake settles an item only on an artifact it read this session, and only as wide as that artifact proves: a source trace shows ownership, not runtime behavior. It never gives a Pursue, because that needs the proposal path's requirements and lanes. An outside probe or a confidence label in the input is a claim, not evidence. An item that needs more than its cited spans and the governing law becomes an Open question or a Defer. When in doubt, offer the chip.

**Topics.** A chip takes the topic `chips` lists for its question, or a new one named for the owner question, never for an area, as chips.md says. Its `writes:` names the paths the answer would change, never the whole `docs/plans` folder, because the chips skill's Offer mode makes a task wait on every active plan whose files it writes. Its priority follows chips.md's Priority. Intake reads `node .agents/pstack/decisions-check.mjs chips all --session <id>`, or searches the ledger for each item's terms where the runtime's session tool gives no id, and the `chips brief <task id>` of each task whose title or topic touches an item. When the question challenges a design that an open task or plan builds, the chip is a `decide` chip that waits on nothing and names that task or plan in its finding; otherwise it is an offered `decide` chip. Offer each through the `chips` skill's Offer mode with `via: verdict`. Offer mode folds a finding into an open task that asks the same question. When `append` refuses one, follow its message.

**Page.** `docs/plans/<date>-<slug>-intake.md` and its decision log, with `Status: done: <n> items, <k> chips offered, <f> folded`, which closes it at once, and `Playbook: verdict`. Its sections are a lead paragraph, Brief, Pushback, Items, Order, Defaults for real picks only, Open work for each finding outside the input, with the chip id of each one that ranks P0 or P1, and Close. Pushback names the input's contradictions, doctrine it applies selectively, probes nobody can rerun, stale references and wrong premises. Items is one table: `#`, item, outcome, strongest reason, evidence, and next, a chip id or none. Order says what to do first and why. The page paraphrases the input and cites it by section, because it lands on the public branch. It lands through `land.mjs` before the hand-back, so a card session can read it, and publishes with `page-stop.mjs stop`. The reply is the page link, then Close's line on the tasks the run offered and carded, and the landed commit.

**Bounds.** Intake runs no lanes, `architect`, panel, arena or research, and writes no code, test, doc or plan besides its page and log. It reads the input, the spans it cites, the governing law and the chips board, plus one repro rerun of at most ten minutes for each claimed P0 or P1 bug. It gives no Pursue, plan or build, sends no public message, runs no chips sweep and takes one input per session.

## Proposal path

Decide whether further work is justified. Agreement is not the default, and "keep the current design; this change adds no material value" is a successful review.

| Verdict | Meaning | End of this review |
| --- | --- | --- |
| **Stop** | No material benefit, unjustified machinery, a violated hard constraint, or it loses to the current design. | State why and keep the current design. No plan, task or consolation backlog. |
| **Pursue** | Evidence supports a material problem and a better direction, which may replace the proposal. | Name the single next owner, and continue into the Plan playbook when it is that owner. |
| **Defer** | A named evidence gap or external prerequisite can change the verdict. | State what would settle it, offer a chip for that evidence by the intake Defer row, and a successor `decide` chip that waits on it. |

A governing rule can itself be the obstacle. When a rule in `VISION.md` or an ADR blocks the strongest target, list "the rule is wrong" as a lane: quote the rule, name the job it protected and show why that job no longer holds or another owner now carries it. A Pursue on that lane that changes `VISION.md` asks the owner under Open questions and keeps building whatever does not depend on the answer.

Missing evidence alone is not Stop, and an API that does not exist yet is design work, not an evidence gap. Stop only after the stronger change lanes also fail. Be blunt about the proposal, not the person: lead with the verdict and its strongest reason, without invented minor improvements or a menu of equal choices. A previous verdict is evidence, not law: changed requirements, contradictory evidence or a materially better argument reopen it at the question level. A Pursue whose target already landed is written as a Stop, with the landed work as evidence. A Stop cited from another workflow reads `verdict: stop: <reason>`.

## Sessions

One input or one proposal per session. A session that already gave a verdict leaves other inputs to chips: for each new one the owner brings, it offers a chip that runs `verdict` on it through the chips skill's Offer mode with `via: verdict`. "again", a verdict another playbook runs mid-run, and a Pursue's own plan and build are the exceptions.

## Steps

- **In** "Route through the **how** skill", for intake: skip the `how` skill. Read the input in full and split it into items. For each item, read the spans it cites and the law that governs it, and read the chips board as Topics says. Rerun a claimed P0 or P1 repro once, for at most ten minutes. Then give each item its outcome under Depth.
- **Before** "Route through the **how** skill", for the proposal path: reconcile the question's history. Search `docs/plans`, `docs/adr`, `docs/prds`, `docs/milestones`, `docs/brainstorms`, `docs/analysis` and `docs/solutions` for the user job, older package and API names and related consumers. Say "no prior work found" only after that search, with its limits stated. A started `decide` chip logs its task's rows from its brief, as `AGENTS.md`'s Suggested tasks rule says.
- **Replace** "Produce the `how`-shaped output": for intake, write the page under Page, offer its chips under Topics, land the page and its log and publish it. For the proposal path, give the question one verdict from the table above. Inspect the owning implementation, its public types and each materially different consumer, such as the example app, the scaffold templates and the docs, because a package-only trace cannot settle ownership. Read prior art and judge ownership with `.agents/playbooks/references/architecture.md`. Attack the user and job the change improves, why it belongs in kitcn rather than application code, the familiar mental model it keeps, its type flow, auth, data flow and bundle consequences, its CLI and agent DX, its generated ownership, its hard-cut stance and its proof. Before a lane deletes code that its owners call a workaround, run `pstack:why` on it. Write the verdict into a new `docs/plans/<date>-<slug>.md` before any panel. Its lead paragraph gives the verdict and the strongest reason, `## Public API` pairs the current and proposed normal call sites, or the ownership flow when no public call changes, and Defaults hold the picks among the lanes. Evidence opens with a `### Requirements` list of the question's current jobs and hard laws, explicit user constraints included, then a `### Lanes` list of at least two lanes considered, the strongest deletion or merger among them, and the proof limits, and a `Model:` line naming the model that ran the review. For a Stop or Defer, Defaults record hold, with again and interrogate as the words that change it. `Status:` becomes `planning` for Pursue, `closed: Stop verdict` for Stop, or `blocked: waiting on <evidence>` for Defer. A Defer offers its evidence chip by the intake Defer row and a successor `decide` chip that waits on it. A Stop or Defer verdict lands the page through `land.mjs`, publishes it and closes with the last hand-back step below. A Pursue verdict publishes the page with its verdict first, then continues in the same run into the Plan playbook on the same file, and the plan goes on to its build as the Autopilot rule says.
- **Replace** "Apply the **unslop** skill to the reply": write the reply clean as drafted, with no separate pass, per `AGENTS.md`'s Writing passes rule. The page gets one `unslop` pass.
- At the last hand-back, whether a Stop, a Defer, a plan that stops at the plan or a landed build, the lead runs the `chips` skill's Close after the last land and the page's close stop. Close cards the tasks this run offered and runs no sweep. A Stop adds no plan or task of its own. The reply is the page link, then Close's line on the tasks the run offered and carded, and the landed commits.
- After a verdict, a typed word picks the next step. "again" runs the same path once more on the same target and challenges the strongest alternative afresh; an intake folds what it finds into its own earlier offers and offers nothing twice. "interrogate" or "panel" runs the panel on the verdict's target with the configured seats. "plan" opens the Plan playbook on the verdict's file anyway. `open <n>` turns an intake item's Settled or Stop into an Open question, offers its chip, updates that row and the page's counts, and lands the page again.
