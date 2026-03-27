---
name: clone
description: 'Command: clone'
---

Dig into /tmp/cc-repos/drizzle-v1 for Drizzle v1 and /tmp/cc-repos/drizzle-orm-docs for Drizzle ORM docs - it's the latest version of Drizzle.
Make sure we maximize mirroring drizzle-v1 - dont forget all ts answers are in drizzle repo, dig into it when needed. they master more typescript than you. drizzle has many db integrations so just pick the most relevant one - making sure we mirror all typing magic - dig into /tmp/cc-repos/convex-backend if you need to dig into convex typing, testing or src code. We also have /tmp/cc-repos/convex-ents if needed. Any "new features" not part of drizzle-v1 should feel like an extension of drizzle parity. Not "separate helpers". If you need to read convex docs, see /tmp/cc-repos/convex-backend/npm-packages/docs/docs.
SAME for testing / type testing - but when you need to test convex part, see `.claude/skills/convex/references/testing.md` or convex-backend/npm-packages tests. Use tdd skill `.codex/skills/tdd/SKILL.md` when relevant. We don't want to reinvent the wheel, but we want the closest API to Drizzle. At the end of each package change, make sure you didn't break the types: `bun typecheck` at root and `bun run test` at root.

