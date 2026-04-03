---
description: Stress-test docs by simulating a human or agent following them literally
---

Use [docs/analysis/docs-stress-test-protocol.md](../../docs/analysis/docs-stress-test-protocol.md) as the source of truth.

Task: stress-test the docs for `#$ARGUMENTS`.

Rules:

1. Treat this as a docs validation run, not a product-building exercise.
2. Start with a literal reproduction pass. Follow the docs exactly and log
   friction before improvising.
3. Only after a failure or gap is captured may you inspect repo code for
   diagnosis and patch suggestions.
4. Validate published bootstrap commands separately from local project commands.
5. Prefer a scoped lane first. If no scope is provided, default to the bootstrap
   lane:
   - `www/content/docs/index.mdx`
   - `www/content/docs/quickstart.mdx`
6. Final output must follow the protocol’s findings format and include:
   - what worked
   - what broke or confused the follower
   - exact doc file/section for each finding
   - workaround used
   - proposed doc patch
