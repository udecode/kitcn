---
name: changeset
description: Use when writing changesets for releases
---

# Changeset Writing

Always mirror @packages/better-convex/CHANGELOG.md tone and structure.

Versioning rule (still v0):

- Breaking change => `minor`
- Non-breaking change => `patch`

Formatting rules:

- Write changeset body as concise bullet points
- Start bullets with clear user-facing action verbs: `Add`, `Support`, `Fix`, `Improve`, `Deprecate`, `Remove`, `Drop`.
- Mention migration/upgrade action only when needed.

User-focused, not technical:

- Describe what users can DO now, not implementation details
- NO internal function names, file paths, or algorithms
- Include before/after behavior only if it improves clarity
