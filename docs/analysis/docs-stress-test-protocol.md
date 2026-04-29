# Docs Stress-Test Protocol

Use this protocol when you want to pressure-test the docs the way a real
consumer would, catch lies and gaps, and turn them into patch-ready findings.

This is not a “build a demo SaaS app” challenge. It is a docs trustworthiness
check.

## Goal

Follow the docs literally enough to expose missing steps, bad commands, stale
assumptions, drift between docs surfaces, and places where the docs only work if
you already know the repo internals.

The app or project you create is evidence. The real output is the findings
report.

## Core Rules

1. Start in a brand-new temp workspace outside the repo.
2. Use the docs in scope as the source of truth for reproduction.
3. Do not silently fix docs mistakes during reproduction. Log them first.
4. Separate reproduction from diagnosis:
   - Pass 1 reproduces the doc flow literally.
   - Pass 2 inspects repo code and surrounding docs only after a failure,
     mismatch, or confusion point is logged.
5. Treat published bootstrap commands and local project commands as different
   contracts.
6. Use the actual runtime URL/port when verifying running apps. Do not pretend
   everything is always on `3000`.
7. When a doc is technically correct but confusing, log that too. Friction is
   still a docs bug.

## Persona Modes

Run one or both of these modes explicitly.

| Mode            | Behavior                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `human-literal` | Follow the docs like a smart developer who does not know repo internals and does not invent missing steps unless blocked |
| `agent-literal` | Follow the docs like an agent using the named docs/skills/tools, but still without cheating during reproduction          |

If the caller does not specify a mode, run both.

## Two-Pass Method

### Pass 1: Literal Reproduction

Use only the docs lane you are testing.

- For `www` docs, follow `www/content/docs/**`.
- For skill parity, follow `packages/kitcn/skills/kitcn/**`.
- If one lane references another surface explicitly, you may follow that link,
  but log the handoff.

During this pass:

- copy commands exactly unless the docs tell you to adapt them
- create files exactly as instructed
- record every blocker, missing step, stale command, surprising prerequisite,
  bad assumption, and ambiguity
- stop and log before using repo code to rescue yourself

### Pass 2: Repo-Aware Diagnosis

After a finding is logged, inspect repo code and nearby docs to answer:

- what actually went wrong
- whether the doc is wrong, incomplete, or misleading
- the smallest honest doc patch to fix it
- whether the same issue appears in the synced skill docs

Do not blur diagnosis notes back into the reproduction timeline.

## Validation Lanes

Choose the narrowest honest lane first.

### 1. Bootstrap Lane

Use this for first-run trust testing.

**Targets**

- `www/content/docs/index.mdx`
- `www/content/docs/quickstart.mdx`

**What to prove**

- remote bootstrap commands use the published CLI contract
- blank-directory setup works from the docs alone
- the first working app path is honest

### 2. Local Runtime Lane

Use this after bootstrap succeeds or when testing post-install docs.

**Targets**

- relevant pages under `www/content/docs/cli/**`
- relevant pages under `www/content/docs/auth/**`
- relevant pages under `www/content/docs/plugins/**`

**What to prove**

- local commands like `kitcn dev`, `kitcn add ...`, and `kitcn verify` work as
  documented inside the created project
- docs do not accidentally switch back to remote bootstrap behavior

### 3. Agent Parity Lane

Use this to catch drift between user docs and agent docs.

**Targets**

- `packages/kitcn/skills/kitcn/SKILL.md`
- matching files under `packages/kitcn/skills/kitcn/references/**`

**What to prove**

- the compressed agent guidance still matches the current user-facing docs
- the skill docs do not omit or contradict critical setup or runtime steps

### 4. Full Sweep Lane

Use this when you want the broadest docs audit.

**Targets**

- the full `www/content/docs/**` tree in nav order
- then the synced Convex skill surfaces
- note off-nav docs explicitly instead of skipping them silently

**What to prove**

- all major docs surfaces are internally consistent
- the same workflow does not drift between pages

## Bootstrap vs Local Runtime Contract

Do not mix these.

| Contract         | What it means                                                                    |
| ---------------- | -------------------------------------------------------------------------------- |
| Remote bootstrap | Blank-directory commands that fetch `kitcn@latest` from the package manager      |
| Local runtime    | Commands run after the project exists and should target the local project binary |

When testing docs, verify those seams separately. A page that gets one right and
the other wrong is still broken.

## Findings Format

Every finding should include:

```md
### [Severity] [Short title]

- **Persona:** `human-literal` | `agent-literal`
- **Lane:** bootstrap | local-runtime | agent-parity | full-sweep
- **Doc source:** `path/to/doc`
- **Section/step:** Exact heading, tab, or numbered step
- **Expected:** What the docs led the follower to expect
- **Actual:** What happened instead
- **Workaround:** What was required to continue, if anything
- **Likely root cause:** Wrong command, missing step, stale assumption, drift, broken snippet, misleading wording, etc.
- **Patch:** The smallest honest docs change that would fix it
```

Severity guidance:

| Severity   | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `critical` | The docs cannot be followed to completion                            |
| `high`     | The docs work only with hidden knowledge or non-obvious rescue steps |
| `medium`   | The docs work, but they waste time or mislead the reader             |
| `low`      | Polish issue, awkward wording, or minor friction                     |

## Success Evidence

Also record what worked.

For each lane, keep:

- temp workspace path
- commands actually run
- runtime URL/port when relevant
- browser or terminal proof for the claimed success state

The point is simple: don’t claim “docs passed” with vibes.

## Stop Conditions

A run may stop when one of these is true:

- a hard blocker is captured with enough evidence and diagnosis to patch the doc
- the scoped lane fully passes
- the requested doc set is exhausted

Do not keep expanding scope just because the temp app happens to exist.

## Final Report

End every run with:

1. Scope and persona modes used
2. What worked
3. Findings ordered by severity
4. Drift between `www` docs and Convex skill docs, if any
5. Concrete doc patch suggestions
6. Open questions that still need implementation-time proof
