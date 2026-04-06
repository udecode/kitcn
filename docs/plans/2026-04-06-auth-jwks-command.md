# Auth JWKS command

- Request: add a manual `auth jwks` command for Concave/manual env sync
- Skills: task, learnings-researcher, tdd, concave-parity
- Type: package feature, non-trivial, parity/tooling
- Chosen seam: new CLI auth subcommand, not fake `env push` on Concave
- Tests first: command parsing/help + runtime behavior around printing/exporting JWKS
- Release artifact: update existing unreleased `.changeset/smooth-cows-invite.md`
- Required verify: targeted tests, `lint:fix`, `typecheck`, `bun --cwd packages/kitcn build`
