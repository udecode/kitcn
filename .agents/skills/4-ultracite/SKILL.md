---
description: kitcn's code standards for formatting, style, correctness, React and performance. Read in full before planning, writing, reviewing or deslopping any source, test or tooling change.
name: 4-ultracite
metadata:
  skiller:
    source: .agents/rules/4-ultracite.mdc
---

## Code Standards

When writing code in a project with Ultracite, follow these standards.

Key rules at a glance:

**Formatting:** 2-space indent, semicolons, double quotes, 80-char width, ES5 trailing commas, LF line endings.

**Style:** Arrow functions preferred. `const` by default, never `var`. `for...of` over `.forEach()`. Template literals over concatenation. No enums (use objects with `as const`). No nested ternaries. Kebab-case filenames.

**Correctness:** No unused imports/variables. No `any` (use `unknown`). Always `await` promises in async functions. No `console.log`/`debugger`/`alert` in production.

**React:** Function components only. Hooks at top level. Exhaustive deps. `key` on iterables (no array index). No nested component definitions. Semantic HTML + ARIA.

**Performance:** No accumulating spread in loops. No barrel files. Avoid namespace imports except `import * as z from "zod"` when it is required to keep deployed entry graphs tree-shakeable. Top-level regex.

**Security:** `rel="noopener"` on `target="_blank"`. No `dangerouslySetInnerHTML`. No `eval()`.
