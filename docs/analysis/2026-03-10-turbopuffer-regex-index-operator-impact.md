# Turbopuffer Regex Indexes: Operator Impact on kitcn ORM

This note captures the current analysis for Turbopuffer-backed regex/glob
indexing and what it would mean for kitcn's Drizzle-style ORM docs and
API shape.

## Source Status as of March 10, 2026

Confirmed from Turbopuffer public sources:

- `regex: true` is schema metadata on a string field, separate from
  `full_text_search`.
- query filtering exposes `Regex`, `Glob`, and `IGlob` operators.
- the December 4, 2025 FTS v2 post explicitly added regex filtering.

Important caveat:

- current public docs still describe regex as exhaustive and non-prefix globs
  as full-scan-like paths.
- the newer "trigram index avoids full-table scans" behavior appears in the
  user-provided screenshot, but is not yet reflected in the public docs we
  checked.

Conclusion:

- the optimization looks real, but the exact public contract is lagging the
  implementation.
- treat any "trigram-backed regex/glob" statement as an inference about
  execution cost, not a fully documented API guarantee.

## What This Changes Conceptually

Today the kitcn docs split text filtering into two buckets:

1. Native indexable string filters:
   - `startsWith(...)`
   - `like("prefix%")`
2. Slow/full-scan/post-fetch string filters:
   - `contains(...)`
   - `endsWith(...)`
   - `ilike(...)`
   - non-prefix `like(...)`

Turbopuffer regex/glob indexes create a third bucket:

3. Provider-backed pattern filters:
   - fast substring, suffix, wildcard, and regex matching
   - filtering semantics, not relevance-ranking semantics

That third bucket does **not** fit the current Convex-native `search` story.
It is not BM25/full-text search. It is accelerated pattern filtering.

## Operators That Would Benefit

### Clear winners

These are the operators that should benefit the most from regex/glob indexing:

- `contains(x)`
  - natural mapping: regex `.*x.*` or glob `*x*`
  - biggest improvement candidate
- `endsWith(x)`
  - natural mapping: regex `x$` or glob `*x`
  - replaces today's reversed-string workaround
- `like("%x%")`
- `like("%x")`
- `ilike("%x%")`
- `ilike("%x")`
- explicit future `regex(...)`
- explicit future `glob(...)`
- explicit future case-insensitive glob / regex variants

### Little or no real benefit

These are already handled efficiently without trigram-style pattern indexing:

- `startsWith(x)`
  - already compiles to a native range index
- `like("prefix%")`
  - already compiles to a native range index
- equality/range operators
  - `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `in`, etc.

### Bad fit / probably still not "indexed"

These are not good candidates to market as regex-index-backed:

- `notLike(...)`
- `notIlike(...)`
- future `NOT regex`
- future `NOT glob`

Reason:

- negation usually does not become a clean index-first plan just because the
  positive predicate is indexable.
- at best, the positive form can narrow candidates before a complement step.

## Mapping to kitcn ORM Operators

If kitcn gains Turbopuffer-backed text filtering, the practical mapping
should be:

| ORM operator                     | Status today                            | With Turbopuffer regex/glob index |
| -------------------------------- | --------------------------------------- | --------------------------------- |
| `startsWith(x)`                  | native indexed                          | unchanged                         |
| `like("prefix%")`                | native indexed                          | unchanged                         |
| `contains(x)`                    | post-fetch / workaround                 | provider-accelerated              |
| `endsWith(x)`                    | post-fetch / reversed-string workaround | provider-accelerated              |
| `like("%x%")`                    | post-fetch                              | provider-accelerated              |
| `like("%x")`                     | post-fetch                              | provider-accelerated              |
| `ilike("%x%")`                   | post-fetch / lowercase workaround       | provider-accelerated              |
| `ilike("%x")`                    | post-fetch / lowercase workaround       | provider-accelerated              |
| `regex(...)`                     | not exposed today                       | direct beneficiary                |
| `glob(...)` / `iglob(...)`       | not exposed today                       | direct beneficiary                |
| `notLike(...)` / `notIlike(...)` | post-fetch                              | likely still fallback/post-filter |

## Why This Does Not Belong in `searchIndex`

This is the key architectural point.

Turbopuffer regex/glob indexes are filter capabilities, not relevance-ordering
capabilities. That means they belong on the `where` side of the API, not under
the current `findMany({ search })` lane.

Why:

- `search` in kitcn currently means relevance-ordered full-text search
  with its own restrictions.
- regex/glob are pattern predicates.
- collapsing them into `search` would lie about semantics and confuse users.

Strong recommendation:

- do **not** model this as a native core `regexIndex()` inside the Convex
  schema abstraction.
- if we support it, model it as a provider-backed external text capability.

## Recommended Product Shape

If kitcn experiments with Turbopuffer here, the clean shape is:

1. Keep the current Convex-native story unchanged.
2. Add a generic external text-provider seam.
3. Mark eligible operators as provider-accelerated only when the backing field
   or index is configured for that provider.
4. Keep `search` reserved for relevance/BM25-style search.

In plain English:

- native Convex keeps the current docs
- Turbopuffer-backed fields make `contains`, `endsWith`, non-prefix `like`,
  non-prefix `ilike`, `glob`, and `regex` fast
- users should not expect `search` semantics from those operators

## Existing kitcn Docs That Would Need Updates

Primary files:

- `www/content/docs/comparison/drizzle.mdx`
- `www/content/docs/orm/api-reference.mdx`
- `www/content/docs/orm/queries/filters.mdx`
- `www/content/docs/orm/queries/operators.mdx`
- `www/content/docs/orm/schema/indexes-constraints.mdx`
- `packages/kitcn/skills/kitcn/references/features/orm.md`

Most important doc changes:

- stop saying `contains` / `endsWith` / `ilike` are always slow
- distinguish native Convex indexing from provider-backed pattern indexing
- avoid pretending regex/glob is part of the existing `search` abstraction

## Current Codebase Constraints

Relevant current behavior:

- only `startsWith` and `like("prefix%")` are compiled to native range-index
  plans.
- `contains`, `endsWith`, `ilike`, `notLike`, and `notIlike` are still treated
  as full-scan operators in type-level guardrails.
- there is already a provider seam for `vectorSearch`, but not a generic
  provider seam for external text/pattern filtering.

That means:

- a Turbopuffer integration here is not just "add an operator"
- it likely needs an external text-provider abstraction first

## Bottom Line

Turbopuffer regex indexes mostly help the current "pattern but not prefix"
bucket:

- `contains`
- `endsWith`
- non-prefix `like`
- non-prefix `ilike`
- future `regex`
- future `glob`

They do **not** meaningfully change:

- `startsWith`
- prefix `like`
- normal equality/range filters

So if we support this, the honest story is:

- not "search got better"
- not "Convex indexes now do regex"
- but "provider-backed pattern filters can now make formerly full-scan string
  operators fast"

## External Sources

- Turbopuffer schema docs: https://turbopuffer.com/docs/schema
- Turbopuffer query filtering docs: https://turbopuffer.com/docs/query-filtering
- Turbopuffer performance docs: https://turbopuffer.com/docs/performance
- Turbopuffer FTS v2 post: https://turbopuffer.com/blog/fts-v2
