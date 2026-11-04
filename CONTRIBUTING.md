# Contributing

## How work runs

Install the pstack plugin as
[docs/development/agent-skills.md](docs/development/agent-skills.md#install)
says. Then describe the outcome you want to the agent, with the issue, package
or route when you know it.

The agent plans through the Plan playbook and builds through the Build
playbook in `.agents/playbooks/`, then lands the work through
`node .agents/pstack/land.mjs`. From a contributor's clone, `land.mjs` opens
the PR with the plan page as its body: a `## Why` section, a `## Verification`
section and a `Beyond the ask:` line.
[`.github/workflows/pr-body-check.yml`](.github/workflows/pr-body-check.yml)
checks that body on every contributor PR.

## Verification

Run the owning focused checks while iterating, then run the repository gate
before opening or updating a PR:

```bash
bun install
bun check
```

Edits to `.agents/rules/**` regenerate with `bun install`; never edit the
generated skill mirrors directly. Root `AGENTS.md` is edited by hand outside
its pstack block, which the `sync-pstack` skill renders.
