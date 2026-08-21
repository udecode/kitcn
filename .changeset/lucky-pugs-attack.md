---
"kitcn": minor
---

## Breaking changes

- The generated auth runtime exports a new internal `count` query. Rerun
  `npx kitcn codegen` and redeploy before upgrading — Better Auth's `count()`
  calls it on every request that reads a total, and a deployment that predates
  it will fail those requests with a missing-function error.

```ts
// convex/functions/generated/auth.ts — regenerated
export const {
  authEnabled,
  authClient,
  getAuth,
  auth,
  count,
  create,
  // ...
} = authRuntime;
```

## Patches

- Fix Better Auth's `count()` reading every matching row 200 at a time. A count
  with no filter is now answered by Convex directly and reads no documents at
  all, so `/admin/list-users` and any other total over a whole auth table no
  longer scales with the table. Previously this ran one paginated query per 200
  rows, and inside a query or mutation every one of those rows landed in the
  same transaction, so a large enough table failed on the per-transaction
  document-read limit instead of returning a number.
- Support constant-cost counts on filtered auth tables. When a table declares an
  `aggregateIndex` whose fields exactly match the fields being counted, counts
  such as members-per-organization read a bucket instead of the members. Counts
  that no index can serve, including anything using `contains`, `ne`, `in`, or
  an OR clause, still page through rows and return the same number as before.
