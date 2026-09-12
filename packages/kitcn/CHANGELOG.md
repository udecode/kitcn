# kitcn

## 0.33.0

### Minor Changes

- [#456](https://github.com/udecode/kitcn/pull/456) [`5b0bd5a`](https://github.com/udecode/kitcn/commit/5b0bd5a1debb4a0e0bb87f79ef1a18f357b614c1) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Support index-ordered pagination for indexed filters with more than 64 values. Pages follow index order, grouped by the filtered value, rather than creation order. Add `orderBy` and `maxScan` to preserve newest-first paging.

  ```ts
  // Before
  const page = await db.query.users.withIndex("by_status").findMany({
    where: { status: { in: manyStatuses } },
    cursor: null,
    limit: 20,
    maxScan: 500,
  });

  // After
  const page = await db.query.users.withIndex("by_status").findMany({
    where: { status: { in: manyStatuses } },
    orderBy: { createdAt: "desc" },
    cursor: null,
    limit: 20,
    maxScan: 500,
  });
  ```

  ## Patches

  - Fix authenticated cRPC query results disappearing when a server-rendered page
    hydrates.
  - Fix unnecessary full-table reads for `select()` filters containing more than 64 values.
  - Fix unnecessary full-table reads for long `in` lists combined with another condition, such as `name: { contains: 'x' }`.
  - Improve limited reads with additional conditions so they stop after enough matching rows are found when index order satisfies the requested sort.
  - Support index-bounded reads for indexed `in`, `notIn`, `ne`, and same-field equality `OR` filters regardless of list length.
  - Support pagination without `maxScan` for wide filters whose requested order follows their indexed values; cross-value sorting, such as `orderBy: { createdAt: 'desc' }`, still requires `maxScan` past 64 values.

- [#449](https://github.com/udecode/kitcn/pull/449) [`b8df2da`](https://github.com/udecode/kitcn/commit/b8df2da49a8733b545f02b84bb538b1cbef275b0) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Read a `select().flatMap(relation, { where })` stage through an index that extends the relation's foreign key when the schema declares one. Children arrive in that index's order, so a lowered range field now orders them ahead of creation time, and outstanding page cursors for those queries do not carry over.

  ```ts
  // Before: every post by the author is read, then filtered, in creation order.
  // After: only the by_author_likes range is read, in numLikes order.
  index("by_author_likes").on(t.authorId, t.numLikes);

  await ctx.orm.query.users
    .select()
    .flatMap("posts", { includeParent: false, where: { numLikes: { gt: 10 } } })
    .paginate({ cursor: null, limit: 20 });
  ```

  ## Patches

  - Compile a `select().union([{ where }])` source `where` against the table's indexes instead of filtering every scanned row, so an object `where` on an indexed field bounds the read. A source keeps its unanchored read when the lowered one could not supply `interleaveBy`, and a `where` never displaces an index the source or the chain pinned with a range.
  - Report what a caller can actually do when a `predicate(...)` `where` runs over an unbounded pipeline read: a union source names its own `index` option, and a `flatMap` stage names the relation index it needs.
  - Resolve a `select()` union source or `flatMap` stage `where` once per read. A callback `where` runs a single time instead of twice, and an object `where` compiles once instead of once per row.

### Patch Changes

- [#455](https://github.com/udecode/kitcn/pull/455) [`a73de28`](https://github.com/udecode/kitcn/commit/a73de28bacf3e518a38762442270d2c54f6989e8) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `findMany` losing its read bound when a `limit` is combined with `in`, `ne`,
    `notIn` or a same-field `OR` on a table that has RLS enabled, or alongside a
    filter Convex cannot evaluate such as `contains`. Either one used to make the
    query read every row it matched against, so
    `findMany({ where: { ownerId: { in: [a, b] } }, limit: 3 })` read 500 documents
    on a 500-row table and 200 on a 200-row table. It now reads 6 at either size,
    and the count no longer grows with the table.
  - Improve how that `limit` is counted, so it bounds rows the caller can actually
    see: with 80 rows an RLS policy hides sitting in front of the matches,
    `limit: 3` still returns three rows and reads 86 documents instead of 200.
  - Support that bound for an `in` list of any length.

  Rows and their order are unchanged. A `where` that filters through a relation
  keeps its previous read cost, as does `ne`, `notIn` or `isNotNull` ordered by a
  field no index can serve.

- [#450](https://github.com/udecode/kitcn/pull/450) [`781af65`](https://github.com/udecode/kitcn/commit/781af65c6e2f9128362378f0cf358d2c8e509b7d) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve update read costs on `aggregateIndex` and `rankIndex` tables: read
    each row once unless a user `update.before` hook requires a fresh read.
  - Fix CLEARING checks for deletes of already-deleted rows: report the
    transient aggregate-index state instead of `Delete on non-existent doc`.

- [#451](https://github.com/udecode/kitcn/pull/451) [`80f7609`](https://github.com/udecode/kitcn/commit/80f7609cb107d23e4688b6877f35787107dd0a39) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve `aggregateIndex` bulk-write read costs by reusing bucket and member
    reads within uninterrupted ORM statements. User hooks and policy callbacks
    end reuse so nested mutation writes remain visible to later maintenance.

- [#454](https://github.com/udecode/kitcn/pull/454) [`f399843`](https://github.com/udecode/kitcn/commit/f399843c6bfb46e080558bc22d2cc4a77842cd16) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve bulk aggregate writes by folding shared bucket and extrema updates
    within uninterrupted statements. A 40-row key migration writes two shared
    buckets and two extrema entries, plus forty membership rows.
  - Preserve read-your-own-writes through aggregate reads and nested functions
    called by lifecycle hooks or RLS policies. Reads and callbacks flush pending
    writes; callbacks suspend batching until they settle.
  - Fix mid-statement aggregate reads through `withoutTriggers()` and an ORM
    rebuilt from a hook context to observe the same rows as `ctx.orm`.

## 0.32.2

### Patch Changes

- [#448](https://github.com/udecode/kitcn/pull/448) [`75ceda6`](https://github.com/udecode/kitcn/commit/75ceda65a12b4dfdd525c97a9401a31c54fd89d0) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve the read cost of a relation `where` on a relation joined on a column
    other than the primary id, including `through` targets and `_count` on a
    `through` relation.
  - Fix relation targets sharing one loaded document, which could add fields to a
    relation that only another relation in the same query requested.

## 0.32.1

### Patch Changes

- [#427](https://github.com/udecode/kitcn/pull/427) [`92381f5`](https://github.com/udecode/kitcn/commit/92381f56a660dfcd4679674f612e64c1518bcf75) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve the read cost of filtering parents by whether a related child exists.
    `where: { posts: { type: 'wanted' } }` now stops at the first matching child
    instead of loading the whole per-parent child window and testing it afterwards.
    On one parent with 61 posts and a match sorting first, that is 2 document reads
    instead of 62 — the same cost as the hand-written
    `with: { posts: { where: { type: 'wanted' }, limit: 1 } }`. The same applies to
    `where: { posts: true }`, to a relation existence test under `NOT`, and to
    `through` relations, where it also stops at the first matching junction row.
    Results are unchanged: the filter still decides from the same window it read
    before, so a match past `defaultLimit` is excluded exactly as it was.
  - A relation named more than once in one `where` — across `OR`, `AND` and `NOT`
    branches — keeps the previous single unbounded load, because those branches
    share it and each needs to read it in full.

## 0.32.0

### Minor Changes

- [#425](https://github.com/udecode/kitcn/pull/425) [`495eb0b`](https://github.com/udecode/kitcn/commit/495eb0b2bd285484250ca69d75de135287531bbb) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Cursor pages for an index-union filter with no `orderBy` are now in the order of the index the read walks, grouped by the probed value, instead of creation order. Add `orderBy` to keep newest-first paging.

  ```ts
  // Before
  const page = await db.query.users.withIndex("by_status").findMany({
    where: { status: { in: ["active", "pending"] } },
    cursor: null,
    limit: 20,
    maxScan: 500,
  });

  // After
  const page = await db.query.users.withIndex("by_status").findMany({
    where: { status: { in: ["active", "pending"] } },
    orderBy: { createdAt: "desc" },
    cursor: null,
    limit: 20,
  });
  ```

  ## Features

  - Page `in`, `notIn`, `ne`, and same-field equality `OR` filters from one index range per value instead of scanning the table. Cursor pagination over these filters no longer needs `maxScan`, and `orderBy` sorts across the whole result rather than per value.

  ## Patches

  - Fix `select()` composition and `endCursor` pagination reading a whole index instead of the compiled index ranges when the filter is an index union.
  - Keep no-`orderBy` cursor direction consistent when `endCursor` routes an index union through the advanced stream path.
  - Prevent `endCursor` narrowing from reopening disjoint equality ranges and duplicating merged-stream rows.
  - Fix cursor pagination with a residual post-filter reading a whole index instead of the compiled index ranges when the filter is an index union.
  - Fall back to a bounded scan when the probed index cannot supply the requested `orderBy` or the union is wider than 64 ranges.

### Patch Changes

- [#426](https://github.com/udecode/kitcn/pull/426) [`466623c`](https://github.com/udecode/kitcn/commit/466623c8b581c38a066fa078309d25cfab166ea7) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix a multi-field `orderBy` reading the whole table even when a declared
    compound index already produces that exact order. `orderBy: [asc(type),
asc(numLikes)]` with `limit: 5` against an index on `(type, numLikes)` now
    reads 5 documents instead of every row, at any table size — previously the
    read cost was the same whether you asked for 5 rows or 50. The same bound
    applies to relations: `with: { posts: { orderBy: { numLikes: 'asc' },
limit: 2 } }` now reads 2 children per parent instead of all of them.
  - Prefer an index that supplies more of the requested sort when several serve
    the filter equally well, so `(orgId, createdAt, title)` is chosen over
    `(orgId, createdAt)` for a sort on both `createdAt` and `title`. An index with
    another unrequested key after `title` is not treated as an exact sort because
    that key would change which tied rows survive `limit`.
  - Stop warning that secondary `orderBy` fields are unstable across pages when
    the index carries the whole sort. A Convex cursor is the index key, so those
    pages are stable. The warning still fires — with corrected wording — when no
    index serves the full sort and the extra fields really are dropped.
  - Sorts that mix directions, skip an index key, or run over a column that can
    be missing or null keep using the post-fetch sort, so row order and null
    placement are unchanged.
  - Use Convex value ordering for non-null post-fetch values, including UTF-8
    strings, signed zero, and NaN, so an index-backed top-k and its post-fetch
    fallback select the same rows.
  - Preserve the existing implicit creation-time tie order when an
    equality-pinned leading sort field points opposite to the moving fields.
    Add `createdAt` in the moving direction to make that sort index-bounded.

## 0.31.1

### Patch Changes

- [#424](https://github.com/udecode/kitcn/pull/424) [`0e3a221`](https://github.com/udecode/kitcn/commit/0e3a2214e8e1037b323e603f19c2df89b0d95602) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Stop `aggregateBackfill` rewriting the stored state it is about to delete.
    Clearing a `rankIndex` walked the btree once per member — a root-to-leaf
    descent plus a patch on every node along the way — and then dropped the whole
    tree regardless, so all of that work was thrown away. Clearing an
    `aggregateIndex` did the same thing with buckets, decrementing each one down to
    zero before deleting it. Both now delete their member rows outright and let the
    existing tree and bucket sweeps reclaim the rest. Clearing 120 rank members
    across three partitions went from 201 btree node writes to 15, one per node.
  - Fix a `rankIndex` clear crashing with `Unexpected field 'deletionStack'` once a
    partition holds more than a few hundred rows. The rank storage tables now
    reuse the same definitions the btree writes to, so a large tree can persist its
    traversal state and resume across mutations. Run
    `npx convex dev` (or your usual codegen) to pick the schema up.
  - Report real work from a clear chunk instead of a fixed guess, so
    `aggregateBackfill --batch-size` now bounds a clear by the documents it
    actually touches. Multi-partition rank indexes no longer schedule far more
    chunks than the remaining work needs.
  - Allow an app to declare `aggregateStorageTables` from `kitcn/aggregate`
    alongside a table that also declares a `rankIndex`. `defineSchema` used to
    reject that combination as a duplicate table name.

## 0.31.0

### Minor Changes

- [#423](https://github.com/udecode/kitcn/pull/423) [`8dbe02a`](https://github.com/udecode/kitcn/commit/8dbe02abeb2a0a5495a33a6a8206fbe53bfd1a16) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

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

## 0.30.0

### Minor Changes

- [#422](https://github.com/udecode/kitcn/pull/422) [`f677251`](https://github.com/udecode/kitcn/commit/f6772514d2525104ac6878c0eeb7334a84af981b) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix soft cascade delete re-reading every child it had already processed. New scheduled campaigns require and resume through an exact foreign-key index, keeping reads linear without allowing mutable trailing index fields to strand a child. Queued jobs reselect a newly available exact index or drain through the legacy replay path.

## 0.29.0

### Minor Changes

- [#421](https://github.com/udecode/kitcn/pull/421) [`26dd9b5`](https://github.com/udecode/kitcn/commit/26dd9b55357e4d49b7ada84812fefd52648f304a) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Register `migrationStatus` and `aggregateBackfillStatus` as internal
    **queries** instead of internal mutations. Polling migration or aggregate
    status no longer opens a write transaction, so a status monitor stops
    competing for OCC write slots on the very tables it is reporting on. Both can
    now back a live subscription, and neither can be scheduled any more.

  ```ts
  // Before — status read had to run from a mutation context
  export const getStatus = authMutation.mutation(async ({ ctx }) => {
    const server = createServerCaller(ctx);
    return await server.migrationStatus({});
  });

  // After — status reads from a query context
  export const getStatus = authQuery.query(async ({ ctx }) => {
    const server = createServerCaller(ctx);
    return await server.migrationStatus({});
  });
  ```

  - Accept an `internalQuery` builder in `createOrm(...)` alongside
    `internalMutation`. Apps generated by `kitcn codegen` pass it automatically;
    hand-written `createOrm` calls that use `orm.api()` should pass it too so the
    status procedures are built with the app's own Convex builder.

  ```ts
  // Before
  const orm = createOrm({ schema, ormFunctions, internalMutation });

  // After
  const orm = createOrm({
    schema,
    ormFunctions,
    internalMutation,
    internalQuery,
  });
  ```

  ## Patches

  - Fix `migrationStatus` reading the entire `migration_run` history to return the
    most recent runs. The listing now walks a new `by_started_at` index in reverse
    and stops at `limit`, so the cost of a status call no longer grows with the
    number of migrations ever run. Runs that share a `startedAt` millisecond now
    order newest-first.
  - Bound the `limit` argument of `migrationStatus` at `MAX_STATUS_RUN_LIMIT`
    (`100`, default `25`), exported from `kitcn/orm/migrations`, so a caller
    cannot reintroduce an unbounded read through the args.
  - Resolve `migrationStatus`'s `runId` and `activeRun` through their existing
    indexes instead of scanning the run history. `activeRun` now agrees with the
    run that `migrate cancel` targets.

## 0.28.1

### Patch Changes

- [#420](https://github.com/udecode/kitcn/pull/420) [`73741ed`](https://github.com/udecode/kitcn/commit/73741ed08779d539c9f186db366e326b138dbd36) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `insert()` re-reading the same parent row once per inserted row. Rows of one statement that share a foreign key now cost one existence check instead of one per row.
  - Fix the aggregate write barrier re-scanning the `CLEARING` index-state range once per written row. A multi-row write now checks it once per transaction, and a backfill that starts clearing an index still blocks the writes that follow it.
  - Fix a relation `where` re-reading the same related document once per scanned row. Filtering by a relation now reads each distinct related document once per query instead of once per candidate row.

## 0.28.0

### Minor Changes

- [#430](https://github.com/udecode/kitcn/pull/430) [`d90c209`](https://github.com/udecode/kitcn/commit/d90c20987a5a94a29d3fcb57aee85e060146a2a8) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Require Better Auth 1.7. Existing deployments need a maintenance window and
    two schema deployments. Do not refresh the required Better Auth 1.7 schema
    first: the old schema rejects new fields, while the required schema rejects
    old rows.

  ```ts
  // Before
  const account = { accountId, providerId, userId };

  // After
  const account = { accountId, issuer, providerId, userId };
  ```

  ### Deployment 1: optional fields and backfills

  Stop authentication writes, background jobs, and admin APIs that write
  `account`, `team`, or `teamMember`. Keep them stopped through deployment 2.

  Keep the currently deployed Better Auth version. Temporarily add `issuer` and
  the lookup index to the existing account schema owner. Apps using organization
  teams must also add optional `memberCount` and `membershipKey` fields plus the
  `membershipKey` index:

  ```ts
  // ORM account field/index
  issuer: text(),
  index("accountId_issuer").on(accountTable.accountId, accountTable.issuer),

  // ORM team and teamMember fields/index
  memberCount: integer(),
  membershipKey: text(),
  uniqueIndex("membershipKey").on(teamMemberTable.membershipKey),

  // Raw Convex account field/index
  issuer: v.optional(v.string()),
  .index("accountId_issuer", ["accountId", "issuer"])

  // Raw Convex team and teamMember fields/index
  memberCount: v.optional(v.number()),
  membershipKey: v.optional(v.string()),
  .index("membershipKey", ["membershipKey"])
  ```

  `membershipKey` stays optional in the generated Better Auth 1.7 schema, and
  the 1.7 adapter falls back to the existing `(teamId, userId)` pair when it is
  absent. Existing rows do not need a membership-key backfill; new 1.7 writes
  populate it.

  Create a migration with `bunx kitcn migrate create backfill_account_issuer`.
  Inventory every provider and resolve both parts of its 1.7 identity from
  trusted provider data. Credential accounts use `local:credential` and their
  linked user ID. OAuth providers without an issuer use
  `local:oauth:${encodeURIComponent(providerId)}` and keep their stable provider
  subject unless the 1.7 provider contract changed it.

  Microsoft is a required exception: map every `microsoft` and
  `microsoft-entra-id` row from its old `sub` to the verified directory `oid`
  from a verified stored ID token or trusted Entra export. Apply the same rule to
  custom OAuth/OIDC providers whose 1.7 `accountSubject` differs. Never derive an
  identity from email or another mutable profile field. The
  [Better Auth 1.7 upgrade guide](https://www.better-auth.com/docs/guides/1-7-upgrade-guide)
  owns the provider-specific mapping rules.

  ```ts
  import { defineMigration } from "kitcn/orm";

  const issuerByProviderId = {
    credential: "local:credential",
    github: "local:oauth:github",
    google: "https://accounts.google.com",
  } as const;

  // Add every row whose trusted 1.7 provider subject differs from accountId.
  const accountIdByRowId: Record<string, string> = {
    "microsoft-account-row-id": "verified-directory-oid",
  };

  export const migration = defineMigration({
    id: "20260826_000000_backfill_account_issuer",
    up: {
      table: "account",
      migrateOne: async (ctx, account) => {
        const issuer =
          issuerByProviderId[
            account.providerId as keyof typeof issuerByProviderId
          ];

        if (!issuer) {
          throw new Error(`Map issuer for provider ${account.providerId}`);
        }
        const mappedAccountId = accountIdByRowId[account._id];
        if (
          (account.providerId === "microsoft" ||
            account.providerId === "microsoft-entra-id") &&
          !mappedAccountId
        ) {
          throw new Error(`Map verified Microsoft oid for ${account._id}`);
        }
        const accountId =
          mappedAccountId ??
          (account.providerId === "credential"
            ? account.userId
            : account.accountId);
        if (!accountId) {
          throw new Error(`Map account subject for ${account._id}`);
        }

        if (account.issuer !== undefined && account.issuer !== issuer) {
          throw new Error(`Issuer mismatch for account ${account._id}`);
        }
        if (account.issuer === issuer && account.accountId === accountId) {
          return;
        }

        const collision = await ctx.db
          .query("account")
          .withIndex("accountId_issuer", (query) =>
            query.eq("accountId", accountId).eq("issuer", issuer)
          )
          .unique();

        if (collision && collision._id !== account._id) {
          throw new Error(`Duplicate account identity ${issuer}:${accountId}`);
        }

        return { accountId, issuer };
      },
    },
  });
  ```

  Apps using organization teams must also create a migration that sets every
  team's count from the indexed `teamMember` rows:

  ```ts
  export const teamMemberCountMigration = defineMigration({
    id: "20260826_000001_backfill_team_member_count",
    up: {
      table: "team",
      migrateOne: async (ctx, team) => {
        const members = await ctx.db
          .query("teamMember")
          .withIndex("teamId", (query) => query.eq("teamId", team._id))
          .collect();

        return { memberCount: members.length };
      },
    },
  });
  ```

  Deploy the optional schema and migration, then require a completed status:

  ```bash
  bunx kitcn codegen
  bunx kitcn deploy --prod
  bunx kitcn migrate status --prod
  ```

  Raw Convex apps use the same resolver and indexed collision check in a
  paginated internal mutation after deploying the optional fields and indexes.
  Team users must also count `teamMember` rows by the `teamId` index and patch
  every team using the team's Convex `_id`. Finish every page, verify no account
  lacks either identity field, verify no `(issuer, accountId)` collision exists,
  and verify every team count before continuing.

  ### Deployment 2: required Better Auth 1.7 schema

  After the backfill is complete, upgrade KitCN and Better Auth, refresh the
  auth-owned schema, and deploy the required field and compound identity index:

  ```bash
  # Default KitCN schema owner
  bunx kitcn add auth --schema --yes

  # Raw Convex schema owner; use this command instead of the default command
  bunx kitcn add auth --preset convex --yes

  bunx kitcn deploy --prod
  ```

  Verify returning credential, OAuth, and Microsoft sign-in plus team membership
  changes against the migrated data. Resume writes only after these checks pass.

  ## Features

  - Support Better Auth 1.7 account identity constraints, declared table indexes,
    atomic adapter mutations, stable join configuration, session hydration, and
    organization metadata reads.

  ## Patches

  - Fix OpenID discovery to advertise the configured JWT signing algorithm.

## 0.27.5

### Patch Changes

- [#414](https://github.com/udecode/kitcn/pull/414) [`7b01244`](https://github.com/udecode/kitcn/commit/7b0124498000e6e6ef190b4b529d10026f0a1f16) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Stop `insert().returning({ ... })` reading each row back after writing it. A
    projected `returning()` is now answered from the values that were just
    inserted, so an 8-row insert spends 0 reads on post-images instead of 8.
    Argument-less `returning()` still reads, because `createdAt` is only known
    once the row is stored.
  - Stop `insert().onConflictDoUpdate({ ... }).returning()` reading the row back
    after patching it.
  - Stop `returning({ _count })` re-fetching each affected row before counting its
    relations, on `insert()`, `update()` and `delete()`. That is one fewer read
    per row, and the counts, their `where` filters and `delete()`'s
    before-cascade ordering are unchanged.
  - Keep reading the row back on tables with triggers, `aggregateIndex` or
    `rankIndex`, where a hook can rewrite what gets stored.

## 0.27.4

### Patch Changes

- [#400](https://github.com/udecode/kitcn/pull/400) [`9963d33`](https://github.com/udecode/kitcn/commit/9963d33048ec532f0a2d9a06bb618486856178b1) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Speed up `kitcn analyze` by measuring every selected entry in one bundler pass
    instead of one pass per entry: 4.3 s → 0.8 s of bundling on the 24-entry example
    app, with byte-identical `OutMB`. Each entry is still sized as its own
    independently tree-shaken isolate, so the ranking is unchanged.
  - Report the hotspot `DepMB` and `Files` columns for the files that carry weight in
    each entry's isolate. They previously counted every file the bundler parsed,
    including files tree-shaking dropped entirely, which disagreed with the `--details`
    package and input tables directly beneath them. Expect both columns to read lower
    than before for the same code; `OutMB` and `LocMB` are unaffected.
  - Fix `kitcn analyze` crashing with a bundler stack trace when a Convex entry fails
    to build. It now lists the entry under `Failed entries:`, keeps reporting every
    entry that did build, and still exits `1`. This needs esbuild `0.27.7`, which is
    now the minimum.
  - Warn which entries had their `./schema` imports externalized after a build error,
    instead of leaving the default mode silent about approximate dependency sizes. The
    approximation is applied per entry, so one unbuildable schema import no longer
    shrinks the numbers for unrelated functions.
  - Open the interactive analyzer's package and input panes without a second bundle, so
    moving the selection no longer pauses to rebuild.
  - Document the hotspot ranking columns, in `--help` and in the CLI reference, along
    with the `--top-inputs` / `--top-packages` flags.

## 0.27.3

### Patch Changes

- [#398](https://github.com/udecode/kitcn/pull/398) [`71158af`](https://github.com/udecode/kitcn/commit/71158af254e97942d382c9b87f736466fb2fbdbd) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `aggregateBackfill` cutting an in-progress clear short when the same run
    also sees a changed metric definition. A `CLEARING` index now finishes draining
    before it moves to `BUILDING`, which is what `resume` already documented, and
    it applies to `aggregateIndex` and `rankIndex` alike. Previously a metric or
    sum change landing while `kitcn aggregate rebuild` was still draining could
    abandon the rebuild halfway and still report `READY`, leaving `count()`,
    `aggregate()` and `rank()` answering from state no document backs.
  - Refuse to advance an index out of `CLEARING` while any of its stored state
    survives. The backfill now fails loudly instead of rebuilding on top of a
    half-drained index and serving numbers that are quietly wrong.

## 0.27.2

### Patch Changes

- [#397](https://github.com/udecode/kitcn/pull/397) [`c90f821`](https://github.com/udecode/kitcn/commit/c90f821e9d416303147b93cc3a1b14a5ccff1fed) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix organization permission checks returning a false "not a member" once an
    organization grows past ~200 members. The generated auth schema now indexes
    the composite lookups the organization plugin actually issues:
    `member` by `organizationId` + `userId` and by `organizationId` + `role`,
    `teamMember` by `teamId` + `userId`, `invitation` by
    `organizationId` + `status` and by `email` + `organizationId` + `status`, and
    `organizationRole` by `organizationId` + `role`. Every index that was emitted
    before is still emitted, so this is additive — rerun
    `npx kitcn add auth --schema --yes` to pick the new ones up.

  - Fix `findOne` reporting "not found" when the scan budget ran out before
    reaching a matching row. Single-document reads now page until they match a row
    or exhaust the query, so an unindexed lookup is slow and warns rather than
    silently wrong. Watch for `Querying without an index on table "..."` in your
    logs and add the index it names.

## 0.27.1

### Patch Changes

- [#396](https://github.com/udecode/kitcn/pull/396) [`8fca5cc`](https://github.com/udecode/kitcn/commit/8fca5cc53c37bd6f651cfbfbf50b87d5461d0ce5) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Match every args variant from `crpc.<path>.queryFilter()` when `args` is
    omitted, `null`, or `{}`, in both the React and Solid bindings. The filter
    built a key with an empty args slot, which TanStack's partial matching never
    matched, so `invalidateQueries` silently refreshed nothing and stale data
    stayed on screen. Pass args to narrow the filter; omit them to reach every
    variant. `crpc.http.*.queryFilter()` follows the same rule.

  ```ts
  // Before
  crpc.analytics.getReport.queryFilter(); // ['convexQuery', 'analytics:getReport', undefined] — matched nothing
  queryClient.invalidateQueries(crpc.analytics.getReport.queryFilter()); // no-op

  // After
  crpc.analytics.getReport.queryFilter(); // ['convexQuery', 'analytics:getReport']
  queryClient.invalidateQueries(crpc.analytics.getReport.queryFilter()); // every args variant
  ```

## 0.27.0

### Minor Changes

- [#395](https://github.com/udecode/kitcn/pull/395) [`2c9ffd2`](https://github.com/udecode/kitcn/commit/2c9ffd20987e4a94cb5790cbb72e6249f1fdfcf4) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Nested `with:` now loads every level it is given, up to 10, instead of quietly dropping everything past the third. A config that nests deeper throws `RELATION_DEPTH_EXCEEDED` rather than returning a shorter tree. Deep `with:` configs that used to come back truncated now come back complete — and read the rows that completeness costs.

  ```ts
  // Before: the fourth level was dropped, with no error
  const rows = await ctx.orm.query.comments.findMany({
    limit: 20,
    with: {
      replies: {
        limit: 10,
        with: { replies: { limit: 10, with: { author: true } } },
      },
    },
  });
  rows[0].replies[0].replies[0].author; // undefined

  // After: loaded, because it was asked for
  rows[0].replies[0].replies[0].author; // { id, name }
  ```

  ## Patches

  - Resolve `with: { _count }` at every level of a nested `with:`, including the deepest one returned. A tree can now report how many children it withheld without a second pass that re-reads every node the caller already holds.

## 0.26.3

### Patch Changes

- [#394](https://github.com/udecode/kitcn/pull/394) [`1317349`](https://github.com/udecode/kitcn/commit/13173495fa8db3d8a0568642981c1cdef4dcdf2b) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Features

  - Support a per-source `index: { name, range }` on `select().union([...])`, so each source walks its own index range instead of re-walking one shared range and filtering the misses in JS.

  ```ts
  const page = await db.query.messages
    .select()
    .union([
      {
        index: {
          name: "by_from_to",
          range: (q) => q.eq("from", me).eq("to", them),
        },
      },
      {
        index: {
          name: "by_from_to",
          range: (q) => q.eq("from", them).eq("to", me),
        },
      },
    ])
    .interleaveBy(["createdAt", "id"])
    .paginate({ cursor: null, limit: 20 });
  ```

  - Support union sources anchored on different indexes, as long as each source pins its leading fields with `eq` and ends up ordered by the `interleaveBy` fields.

## 0.26.2

### Patch Changes

- [#393](https://github.com/udecode/kitcn/pull/393) [`5ebba20`](https://github.com/udecode/kitcn/commit/5ebba205900489ab204901f5487788a60b9d0dd4) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Speed up `kitcn codegen`. Each Convex module is now read once per run instead
    of up to four times, and the functions directory is listed once instead of
    twice. On an 82-module app that is 57 fewer file reads and 10 fewer directory
    listings per run, with identical generated output.

## 0.26.1

### Patch Changes

- [#392](https://github.com/udecode/kitcn/pull/392) [`72d3270`](https://github.com/udecode/kitcn/commit/72d327003547b1f4097aa72db0d35128ed57b04d) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix a crash when writing an object key that cannot be converted to a string,
    such as one created with `Object.create(null)`, into an `aggregateIndex` or
    `rankIndex`. Once enough keys accumulated to rebalance the index, the write
    failed with `TypeError: Cannot convert object to primitive value` instead of
    succeeding.

## 0.26.0

### Minor Changes

- [#401](https://github.com/udecode/kitcn/pull/401) [`947cd11`](https://github.com/udecode/kitcn/commit/947cd11fe4e461caca9d7cc934ef34d62599e136) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Require `api` on `convexBetterAuthReactStart`, which now returns `createCaller`
    and `createContext` alongside the auth helpers.

  ```ts
  // Before
  export const { handler, getToken } = convexBetterAuthReactStart({
    convexUrl: import.meta.env.VITE_CONVEX_URL!,
    convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
  });

  // After
  export const { handler, getToken, createCaller, createContext } =
    convexBetterAuthReactStart({
      api,
      convexUrl: import.meta.env.VITE_CONVEX_URL!,
      convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
    });
  ```

  - Drop `runServerCall` from the TanStack Start scaffold. Call procedures on a
    caller bound once with `createCaller()`.

  ```ts
  // Before
  export function runServerCall<T>(
    fn: (caller: ServerCaller) => Promise<T> | T
  ) {
    const caller = createServerCaller();
    return fn(caller);
  }
  await runServerCall((caller) => caller.user.getSessionUser({}));

  // After
  export const caller = createCaller();
  await caller.user.getSessionUser({});
  ```

  - Move TanStack Start JWT caching under `auth.jwtCache`, a boolean.

  ```ts
  // Before
  convexBetterAuthReactStart({
    jwtCache: { enabled: true, isAuthError },
    // ...
  });

  // After
  convexBetterAuthReactStart({
    auth: { jwtCache: true, isUnauthorized: isAuthError },
    // ...
  });
  ```

  ## Patches

  - Fetch the Convex auth token once per request on TanStack Start. Every
    procedure call, `getToken()`, and `fetchAuthQuery`/`fetchAuthMutation`/
    `fetchAuthAction` in a request now share one token, instead of each paying its
    own round trip.
  - Stop replaying a rejected auth token for the rest of a request. After a
    refresh, the remaining calls sharing that context use the new token instead of
    re-failing and re-running non-idempotent mutations and actions.
  - Refresh expired TanStack Start tokens instead of failing. Forced refresh and
    token freshness now reach the token layer, so a stale token retries once and a
    fresh one is no longer replayed on an authorization error.

  Existing TanStack Start apps: re-run `kitcn add auth --overwrite` to update
  `src/lib/convex/auth-server.ts` and `src/lib/convex/server.ts`.

## 0.25.7

### Patch Changes

- [#379](https://github.com/udecode/kitcn/pull/379) [`53fe88e`](https://github.com/udecode/kitcn/commit/53fe88e6911cdabdfcccba20337bfdadb7b6e5be) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix codegen schema loading with constrained required environment values.
  - Fix first-run codegen when schema triggers import newly generated callers.

## 0.25.6

### Patch Changes

- [#373](https://github.com/udecode/kitcn/pull/373) [`118093a`](https://github.com/udecode/kitcn/commit/118093aa97c269b4d6d544b31aa939bd62cb8ec4) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `.output()` validation failures reaching the client as an opaque
    `Server Error`. They now throw a `CRPCError` with code
    `INTERNAL_SERVER_ERROR`, message `Output validation failed`, and sanitized
    structural Zod issues in `error.data.ZodError`, so a handler returning the
    wrong shape names itself without exposing rejected server output.
    `.paginated()` is covered too.

  ```ts
  // A handler that returns the wrong shape
  c.query
    .output(z.object({ ok: z.boolean() }))
    .query(async () => ({ ok: "yes" }));

  // Client
  error.data.ZodError;
  // [{ expected: 'boolean', code: 'invalid_type', path: ['ok'] }]
  ```

  - Log server faults from HTTP routes. A route that fails its `.output()` schema
    still answers `500` with only a code and message, but the full error now
    reaches the server log instead of being discarded.

  - Ship `CHANGELOG.md` in the published package.

  - Document the `.output()` return contract: the handler returns the schema's
    input type, an `undefined` return is parsed as-is rather than substituted with
    `null`, and an absent value is modelled as `.nullable()` rather than a
    top-level `.optional()`, which Convex's returns validator cannot express.

## 0.25.5

### Patch Changes

- [#372](https://github.com/udecode/kitcn/pull/372) [`f288304`](https://github.com/udecode/kitcn/commit/f2883042f1c8f9467ea8f1bcb57ee88c43cbdfc2) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `kitcn codegen` and `kitcn dev` aborting on a `generated/server.ts` written
    by an older kitcn, or one that no longer matches the schema. That file is now
    rewritten from the schema before codegen reads any app module, so it repairs
    itself instead of failing every module with the error it is supposed to fix.
  - Keep the procedure names recorded by the last full run when running
    `kitcn codegen --scope auth` or `--scope orm`. Scoped runs no longer blank the
    lookup that middleware reads `procedure.name` from.
  - Fail `kitcn codegen` with the underlying error when `schema.ts` cannot be
    loaded, instead of silently regenerating the app as if it had no ORM schema
    and deleting the generated aggregate entry.
  - Point the aggregate and migration capability setup errors at a step that
    works. They previously advised rerunning the command that had just failed.

## 0.25.4

### Patch Changes

- [#371](https://github.com/udecode/kitcn/pull/371) [`80a8441`](https://github.com/udecode/kitcn/commit/80a84414ea684ac8faedc4b16181594528427079) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix large `in` and `notIn` filters across ORM reads, updates, and deletes.
  - Fix large `OR` and `AND` filters exceeding Convex's nesting limit.
  - Reject malformed empty logical filters before scheduled mutations run.

## 0.25.3

### Patch Changes

- [#370](https://github.com/udecode/kitcn/pull/370) [`54c88d1`](https://github.com/udecode/kitcn/commit/54c88d18acbcbe60ae17691ac813384b79e41182) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `count()`, `aggregate()`, `groupBy()`, and relation `_count` so `isNull: true` matches rows whose column is absent from the document, not just rows holding an explicit `null` — matching `findMany()` under the same filter.
  - Emit a single group keyed `null` for an `isNull`-constrained `groupBy()` field, combining every metric over both explicitly-`null` and absent rows.
  - Improve `groupBy()` fan-out guards so merged nullish groups count every physical aggregate bucket probe.

## 0.25.2

### Patch Changes

- [#352](https://github.com/udecode/kitcn/pull/352) [`942fb08`](https://github.com/udecode/kitcn/commit/942fb084db467fa76722941ede4b77781697cffd) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Cut ~256 KB (−22%) from the bundle Convex deploys for apps without Better Auth. `import { z } from 'zod'` binds zod's namespace object, which pins all 50 translation files; scaffolds and internals now use `import * as z from 'zod'`, which tree-shakes them. Apps using Better Auth are unchanged — it pins the barrel itself.
  - Improve `update().returning()`: it reuses the row it just wrote instead of reading it back, so a matched-row update costs one fewer read per row. Tables with lifecycle hooks or a self-referencing cascade still read back, since either can rewrite the row.
  - Improve `update()` foreign-key checks: a single-column reference supplied by `set()` is validated once per statement instead of once per matched row. Unique-index checks still run per row, as they must.
  - Speed up `kitcn analyze` by bundling entry points concurrently: 2.9 s → 2.1 s on a 20-entry app, with byte-identical output.
  - Reduce `kitcn add <plugin>` from three package-manager installs to two. Saves ~2 s on npm; bun is already fast enough that the difference is noise.

## 0.25.1

### Patch Changes

- [#343](https://github.com/udecode/kitcn/pull/343) [`3f9631c`](https://github.com/udecode/kitcn/commit/3f9631cad7e07fbe034afba702f84a9318067a77) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Support Convex commit timestamp validators in ORM and Zod conversion.
  - Warn when an installed Convex version is outside the supported minor range.
  - Keep emitted declarations compatible with the minimum supported Convex and
    forward commit timestamp variables through database wrappers.

## 0.25.0

### Minor Changes

- [#342](https://github.com/udecode/kitcn/pull/342) [`3aff976`](https://github.com/udecode/kitcn/commit/3aff976a2d955fb9dc916b94bd3cd39e3e2e418d) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - - Rerun `kitcn codegen` to register aggregate, rank, and migration runtimes through the generated ORM setup.
  - Register `aggregateCapability()` from `kitcn/orm/aggregate-index` and `migrationCapability()` from `kitcn/orm/migrations` when constructing a hand-written ORM that uses those subsystems.
  - Import aggregate backfill argument types from `kitcn/orm/aggregate-index` and migration argument types from `kitcn/orm/migrations`.
  - Keep `kitcn/orm` free of optional aggregate, rank, backfill, and migration runtime imports until the corresponding capability is registered.
  - Run `kitcn aggregate prune` after removing the final aggregate or rank index; the generated maintenance entry remains available and drains large rank trees in bounded chunks.
  - Read authenticated query and mutation sessions with `getSession(ctx)`, and keep authenticated action builders in a separate module that owns `getAuth(ctx)`.

## 0.24.0

### Minor Changes

- [#341](https://github.com/udecode/kitcn/pull/341) [`c255ae2`](https://github.com/udecode/kitcn/commit/c255ae2a9305c3ccd2793b109ef6a259202be906) Thanks [@RatelimitUser](https://github.com/RatelimitUser)! - ## Breaking changes

  - Resolve `getSignals` before `getIdentifier` in `RatelimitPlugin.configure` and
    pass its result in as `signals`. `getSignals` no longer receives `identifier`,
    and `getIdentifier` also receives `tier`.

  ```ts
  // Before
  getIdentifier: ({ user }: { user: RatelimitUser | null }) =>
    user?.id ?? 'anonymous',
  getSignals: ({ ctx }: { ctx: RatelimitCtx }) => getRequestSignals(ctx),

  // After
  getSignals: ({ ctx }: { ctx: RatelimitCtx }) => getRequestSignals(ctx),
  getIdentifier: ({
    user,
    signals,
  }: {
   | null;
    signals: LimitRequest | undefined;
  }) => (user ? user.id : signals?.ip ? `ip:${signals.ip}` : 'ip:unknown'),
  ```

  - Key anonymous rate-limit traffic by request IP instead of one shared
    identifier, so a single visitor can no longer spend every other visitor's
    budget or arm a 24 hour deny-list block against all of them. Run
    `kitcn add ratelimit --overwrite` to take the new plugin.
  - Add `cleanupRatelimitState` and scaffold an indexed, batched private mutation
    for manual cleanup of state older than a caller-owned cutoff. Repeat the
    on-demand call while it returns `hasMore: true`.
  - Store no-arg `crpc.http.*` entries under `['httpQuery', route, {}]` on both the
    client and the RSC server, so a server-prefetched route hydrates instead of
    refetching.
  - Return the exact cache key from `crpc.http.*.queryKey()`, `{}` included, so
    `getQueryData` and `setQueryData` hit. Use `queryFilter()` to match every args
    variant of a route.

  ```ts
  // Before
  queryClient.getQueryData(["httpQuery", "health", undefined]);
  crpc.http.health.queryKey(); // ['httpQuery', 'health']

  // After
  queryClient.getQueryData(crpc.http.health.queryKey());
  crpc.http.health.queryKey(); // ['httpQuery', 'health', {}]
  ```

  - Narrow `HttpQueryKey` to that exact three-element key. The route-wide prefix
    `queryFilter()` builds is typed as `HttpQueryPrefixKey`.

  ## Features

  - Add `timeout`, `dynamicLimits`, `denyList`, and `ephemeralCache` to
    `RatelimitPlugin.configure`. They reach the limiter instead of being dropped.

  ## Patches

  - Fix `crpc.http.*` routes being fetched twice on first paint. `queryOptions`
    carries a 30 second `staleTime` shared with the RSC QueryClient, overridable
    per call, and `refetchOnMount` keeps its default so a route invalidated while
    unmounted still refetches.
  - Fix the deny list blocking shared NAT and mobile-carrier IPs. Count only
    failures inside a rolling 10-minute window and cache values that reach
    `denyListThreshold` as blocked for up to 24 hours.
  - Fix deny-list memory growing without bound when callers forge `User-Agent`
    headers.
  - Fix `ephemeralCache: false` being ignored while a limit is evaluated, which
    kept an in-memory block cache alive after you disabled it.

## 0.23.0

### Minor Changes

- [#340](https://github.com/udecode/kitcn/pull/340) [`13fbae3`](https://github.com/udecode/kitcn/commit/13fbae321d73801c90423c8f9025fef5f958553d) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - `.output()` is now validated once, against the value your handler returned,
    instead of against its wire encoding. Schemas that transform a value into a
    `Date` (or into any type a custom wire codec owns) now encode correctly
    instead of being rejected, and `.output()` schemas using async refinements
    work. Procedure handlers return the schema input type; generated clients
    receive its output type.

  ```ts
  const at = c.query
    .output(z.object({ at: z.string().transform((s) => new Date(s)) }))
    .query(async () => ({ at: "2024-01-01T00:00:00.000Z" }));

  // Before: the schema ran after encoding, so the Date left the server raw
  // After:  { at: { __crpc: 1, t: '$date', v: 1704067200000 } }
  ```

  - `.output()` parses the handler's value as-is and no longer substitutes `null`
    for an `undefined` return. A nullable schema needs an explicit `null`; in
    exchange, `.output(z.string().default(...))` now applies its default to an
    `undefined` return instead of rejecting it. The low-level `returns:` option
    still substitutes. Handlers were already typed to return the schema's input
    type, so TypeScript rejects this ahead of runtime except where a lookup is
    typed as always-present — an index signature or `array[0]` under the default
    `noUncheckedIndexedAccess: false`.

  ```ts
  const name = c.query
    .input(z.object({ id: z.string() }))
    .output(z.string().nullable())
    // Before: an `undefined` return was parsed as `null`
    // After:  coalesce it
    .query(async ({ input }) => names[input.id] ?? null);
  ```

  ## Features

  - `zCustomQuery`, `zCustomMutation` and `zCustomAction` accept
    `skipZodReturnsValidation`, so `returns` can declare the Convex validator and
    the return type without also parsing the response in JS. The handler is then
    typed as the schema's output, since that value reaches Convex unchanged.

  ```ts
  zCustomQuery(
    query,
    customCtx(withUser)
  )({
    args: { id: z.string() },
    returns: z.object({ name: z.string() }),
    skipZodReturnsValidation: true,
    handler,
  });
  ```

  - Wire codecs accept `objectsOnly`, declaring that `isType` never claims a
    primitive. `serialize` then skips codec dispatch on primitive values.

  ```ts
  const mapCodec: WireCodec = {
    tag: "$map",
    objectsOnly: true,
    isType: (value) => value instanceof Map,
    encode: (value) => [...value],
    decode: (value) => new Map(value),
  };
  ```

  ## Patches

  - Cut one full traversal of every response with an `.output()` or
    `.paginated()` declaration.
  - Reuse the argument schema and its parse cache across requests instead of
    rebuilding them on every procedure call.
  - Resolve the multi-`.input()` merge plan when the procedure is defined.
    Declaring a key that `.paginated()` also declares no longer clones a schema
    on every request.
  - Skip codec dispatch on primitive values while encoding the built-in `Date`
    payloads, and stop walking a payload twice per direction when a transformer
    is passed to a server-side caller.
  - Resolve HTTP `searchParams` coercion per route instead of per request, and
    read the query string in a single pass.
  - Convert an `.input()` shape to its Convex validator once per procedure
    instead of three times.

## 0.22.1

### Patch Changes

- [#356](https://github.com/udecode/kitcn/pull/356) [`f5d9edd`](https://github.com/udecode/kitcn/commit/f5d9edd62670ce098bb18d7f4987ec1f3b3365aa) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix prefetched optional React pagination remaining disabled after authentication
  settles.

## 0.22.0

### Minor Changes

- [#339](https://github.com/udecode/kitcn/pull/339) [`ed72944`](https://github.com/udecode/kitcn/commit/ed72944a45e7cae642bd33c7b20dff2968c70508) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Features

  - Support stable identity values from custom Solid auth providers.

  ## Patches

  - Fix function-form `enabled` predicates in `kitcn/solid` query options so
    they gate both requests and live subscriptions.
  - Fix unauthenticated `auth: "required"` Solid action queries to reject locally with
    `CRPCClientError`, matching the React bindings.
  - Fix auth-bound cached data crossing identity transitions. Unobserved entries are
    removed; mounted entries are rebuilt without their previous `initialData`,
    return to pending without prior-account placeholder data, and refetch for the
    new account.

  - Fix `kitcn/solid` paginated lists on an `auth: 'required'` function never
    issuing a query. Auth state is tracked, so a list mounted before sign-in loads
    once auth settles instead of showing a permanent loading state, and logging
    out stops its page subscriptions.
  - Fix `kitcn/solid` tearing down a Convex subscription that another mounted
    component still needs when two components share a query key and one passes
    `enabled: false`. The remaining component keeps receiving real-time updates.
  - Fix `skipUnauth` being ignored by `kitcn/solid`. Queries marked
    `skipUnauth: true` resolve to `null` on an unauthorized result instead of
    sticking in an error state.
  - Fix `kitcn/solid` re-authenticating Convex on every JWT write. Signing in
    authenticates once instead of three times, and a scheduled token refresh no
    longer pauses the socket and re-runs every live subscription.
  - Fix `kitcn/solid` ignoring a `useAuth` that returns a new `fetchAccessToken`.
    Convex is rebound to the current fetcher instead of refreshing through the one
    captured for the previous session.
  - Fix provider-driven identity transitions retaining the previous account's
    auth-bound cache or Convex binding. `ConvexProviderWithAuth` accepts an
    optional stable `identity`; providers that omit it retain the safe legacy
    behavior of rebinding on reactive auth changes. Replacing a Better Auth
    session also invalidates its cached JWT and abandons in-flight token requests
    owned by the previous session before authenticating the new one. SSR tokens
    remain hydration fallbacks only until a client session is confirmed and
    cannot seed that session's cache identity. The first settled client identity
    clears auth-bound hydration state when its ownership cannot be proven.
  - Fix an account transition leaving the previous account's rows in disabled,
    unobserved, or non-subscribed queries.
  - Fix a paginated list restoring the previous account's cursors after signing
    in or out. An auth-bound list starts again from its first page instead of
    paging from cursors that point into another account's results.
  - Fix an auth-bound query refetching everything on every scheduled token
    refresh. A refreshed JWT for the same account leaves the cache alone; only an
    authorization identity change clears it, including tenant or role claims
    changing inside the same Better Auth session.
  - Fix sign-in and sign-up mutations clearing auth-bound queries before Convex
    adopts the new identity. The provider clears previous-account data while the
    binding changes, holds mounted observers idle, then restores and refetches
    only after Convex reports the transition as settled. Sign-out follows the
    same provider-owned transition.
  - Fix custom Solid Convex auth being replaced by the fallback Better Auth
    store. Query subscriptions follow the custom provider, settled identity and
    account epoch instead of remaining blocked or reusing another account's
    pagination state.
  - Fix account transitions retaining obsolete pagination ID entries. Pagination
    state in the QueryClient remains the persistence owner without a second
    process-wide key map.
  - Fix prefetched optional pagination queries fetching while authentication is
    loading. Hydrated data remains readable, but its observer stays disabled
    until the auth binding settles.
  - Fix overlapping auth transitions restoring stale observer options or letting
    an older settlement refetch during a newer identity change. Only the latest
    transition can restore and refetch, and option updates made while observers
    are suspended remain authoritative.
  - Keep auth-bound queries mounted during a Solid identity transition disabled
    until Convex confirms the new identity. Both one-shot requests and live
    subscriptions wait behind the same client-owned settlement barrier.
  - Ignore Convex auth-settlement callbacks from superseded bindings. A late
    callback from an older account cannot republish that identity or reopen the
    query barrier during a newer transition.

## 0.21.0

### Minor Changes

- [#338](https://github.com/udecode/kitcn/pull/338) [`7163710`](https://github.com/udecode/kitcn/commit/7163710aea8ec3758af04128836027aca8bf724b) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - `createClient` now takes a `getBetterAuthSchema` thunk and its `adapter(ctx)`
    takes only the context. The Better Auth table schema is derived once for the
    isolate and shared, instead of every adapter re-deriving it. `dbAdapter` drops
    its options-getter argument for the same reason.

  ```ts
  // Before
  const authClient = createClient({ authFunctions, schema });
  const database = authClient.adapter(ctx, getAuthOptions);

  // After
  const authClient = createClient({
    authFunctions,
    getBetterAuthSchema,
    schema,
  });
  const database = authClient.adapter(ctx);
  ```

  ## Patches

  - Improve authenticated request latency: `getAuth(ctx)` evaluates your
    `defineAuth` callback once per request instead of twice.
  - Improve `admin.listUsers` and other counted reads: totals no longer hold every
    matching row in memory while paginating.
  - Improve Better Auth record updates: an update is one Convex call that reads
    the row once, instead of a separate pre-check call that read it again. The
    "expected exactly 1 match" error now comes from the write itself, so it can no
    longer be invalidated by a concurrent insert or delete.
  - Improve auth request CPU: the Convex auth plugin reuses its OIDC provider, and
    unique-field lookups no longer rescan the auth schema on every read and write.
  - Fix session recovery from a persisted token issuing a fixed 250ms delay plus
    up to ten `/get-session` requests. A live token is recovered with one immediate
    request, a server-confirmed missing session stops after one, and only transport
    failures retry.
  - Fix a dropped `/get-session` request signing the user out. Transport failures
    retry with backoff for the rest of the session-sync grace window, so a session
    is restored in the same mount once connectivity returns.
  - Fix an outage during session recovery leaving the app stuck on `isLoading`.
    When the grace window closes with no answer, auth resolves to unauthenticated
    instead of holding a token no request ever confirmed. The persisted token is
    kept so the next mount can retry it.

## 0.20.0

### Minor Changes

- [#337](https://github.com/udecode/kitcn/pull/337) [`5d3172b`](https://github.com/udecode/kitcn/commit/5d3172b260bba6d44ba06b5639c22711c0d58f79) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Range-filtered `count()` and `aggregate()` now stop at `aggregateWorkBudget`
    work units and throw `COUNT_FILTER_UNSUPPORTED` /
    `AGGREGATE_FILTER_UNSUPPORTED` naming the index, instead of reading the whole
    equality prefix and failing on Convex's transaction read limit. Bucket scans
    cost one unit; `_min` and `_max` also reserve one extrema read per matching
    bucket. One budget covers every `IN` prefix and extrema metric sharing the
    range plan. Raise it cautiously if a wide range scan is intentional.

  ```ts
  // Before
  export default defineSchema({ runs });

  // After
  export default defineSchema(
    { runs },
    // Keep headroom below Convex's 32,000-document transaction ceiling.
    { defaults: { aggregateWorkBudget: 20_000 } }
  );
  ```

  ## Features

  - `kitcn aggregate rebuild` and index pruning clear stored aggregate state in
    scheduled batches, so rebuilding or dropping an `aggregateIndex` / `rankIndex`
    on a large table no longer has to fit in a single Convex mutation. Indexes
    report a `CLEARING` status while draining, and `kitcn aggregate prune` reports
    how many removed indexes are still being cleared in the background.
  - ORM writes targeting a declared index in `CLEARING` fail before the document
    write. Retry after the index advances to `BUILDING` or `READY`; this prevents
    concurrent writes from being erased by a multi-mutation clear.
  - Automatic pruning follows canonical aggregate lifecycle state instead of
    reverse-scanning every distinct backing-table index. Exact `tableName` and
    `indexName` handler arguments retain bounded recovery for state-less storage.

  ## Patches

  - Reduce database reads per rank-index write: the btree descent no longer
    re-queries the tree document at every node, re-reads nodes it just wrote, or
    re-reads the child it descends into.
  - Reduce database reads for `rank().min()`, `rank().max()` and `rank().random()`
    by dropping a redundant count scan per call.
  - Reduce document writes during aggregate backfill: a page of rows sharing a key
    tuple now writes its bucket once instead of once per row.
  - Stop writing `aggregate_member` rows when a mutation changes no aggregated
    field.
  - Improve `count()` and `aggregate()` latency for multi-value `IN` filters and
    for `_min` / `_max` by issuing independent bucket reads through a bounded pool.
  - Keep a partially cleared index in `CLEARING` when an error interrupts a
    rebuild, so a retry resumes clearing instead of building over stale buckets.

## 0.19.0

### Minor Changes

- [#336](https://github.com/udecode/kitcn/pull/336) [`aba33f5`](https://github.com/udecode/kitcn/commit/aba33f55f1eacacdf36c8408391068a7e3868132) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Read `.select().where({ id: { in: [...] } })` in the order the ids are given
    instead of creation order. Each page reads only the listed positions it
    visits rather than the complete ID list; missing or policy-filtered ids still
    count as reads. Add `orderBy` to keep creation order. Cursors issued by the
    previous behavior are not portable.

  ```ts
  // Before — creation order, and every page read the whole id list
  await ctx.orm.query.posts
    .select()
    .where({ id: { in: ids } })
    .map((row) => row)
    .paginate({ cursor, limit: 10 });

  // After — same call, rows come back in the order `ids` lists them
  await ctx.orm.query.posts
    .select()
    .where({ id: { in: ids } })
    .map((row) => row)
    .paginate({ cursor, limit: 10 });

  // After — creation order, which still reads every id in the list
  await ctx.orm.query.posts
    .select()
    .where({ id: { in: ids } })
    .orderBy({ createdAt: "asc" })
    .map((row) => row)
    .paginate({ cursor, limit: 10 });
  ```

  ## Patches

  - Fix `.distinct({ fields })` on more than one field growing exponentially more
    expensive with each row returned, which made pages of about twenty rows fail
    to return at all.
  - Fix `.distinct({ fields })` over `.union(...).interleaveBy(...)` slowing down
    sharply as the number of returned rows grows.
  - Support `maxScan` on paginated `where: { id: { in: [...] } }` reads, including
    reads ordered by a single indexed field.
  - Improve paginated reads to register fewer Convex queries per page, and to
    release the ones they opened when a page stops early.
  - Improve the per-row cost of every stream-backed read.

## 0.18.0

### Minor Changes

- [#335](https://github.com/udecode/kitcn/pull/335) [`9b3494d`](https://github.com/udecode/kitcn/commit/9b3494de4a057612b718b8c522d99c012926832f) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Fix `orderBy` returning the wrong rows when the `where` pins only part of a
    compound index. Ordering by `createdAt` under `where: { type: 'a' }` on an
    index of `(type, numLikes)` used to hand back the rows sorted by `numLikes`.
    It now returns creation order. Queries in that shape return different rows
    than before, and under `cursor` pagination with `strict` they now report that
    the field has no usable index instead of paginating in the wrong order.

  ```ts
  // Schema: index('numLikesAndType').on(t.type, t.numLikes)

  // Before — returned the two most-liked posts
  // After  — returns the two newest posts, as asked
  await ctx.orm.query.posts.findMany({
    where: { type: "a" },
    orderBy: { createdAt: "desc" },
    limit: 2,
  });

  // Pinning the narrower index leaves creation time as the implicit next key
  index("by_type").on(t.type);
  ```

  - Change which rows a `.through()` relation returns for a given `limit`. Each
    parent now gets its own first `limit` links instead of a window over the
    order in which targets happened to be discovered across the whole page.
    `orderBy` on a through relation is unaffected.

  ## Patches

  - Push `limit` and `orderBy` on a `many()` relation into the relation index.
    `with: { posts: { limit: 5, orderBy: { createdAt: 'desc' } } }` reads five
    posts per parent instead of every post of every parent.
  - Bound `.through()` relation reads by the requested `limit` instead of reading
    every junction row of every parent. Links whose target is missing or is
    dropped by RLS or the relation `where` do not consume a slot, so the page
    still comes back full.
  - Fill `limit` with rows that survive RLS and relation `where` instead of
    filtering after the read. `findMany({ where: { ownerId }, limit: 3 })` on a
    table with a select policy used to return only whichever of the first three
    stored rows happened to be visible — often none.
  - Push `limit` into `in`, `notIn`, `ne` and `isNotNull` reads, which previously
    read every matching row and sliced afterwards.
  - Use an index for `in` combined with another filter — `where: { status: { in:
[...] }, name: { contains: 'x' } }` scanned the whole table.
  - Order by a field the `where` does not pin without reading the whole bucket,
    as long as the index sorts by it next.
  - Prefer an index that also supplies the requested order, so a compound
    `(tenantId, createdAt)` is chosen over a narrow `(tenantId)` for a
    tenant-scoped feed.
  - Serve `orderBy` on the leading field of a pinned `.withIndex()` from the
    index instead of scanning the table.
  - Stop loading nested `with:` data, extras and column selection for relation
    rows that the per-parent `limit` or `offset` then discards. Deeply nested
    reads that previously failed the relation fan-out guard now succeed.
  - Read each shared target once when counting a `.through()` relation with a
    `where`, instead of once per parent row.
  - Reuse aggregate bucket reads across rows of a `with._count`.
  - Build the ORM once per request instead of twice; the RLS bypass client is
    now created only when it is used.
  - Reduce per-row work on filtered reads, relation counts, and query planning.

## 0.17.5

### Patch Changes

- [#332](https://github.com/udecode/kitcn/pull/332) [`2609245`](https://github.com/udecode/kitcn/commit/2609245de4e468715e4691f9a159c88a659d4f75) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix auth-bound queries being reset every time Convex refreshes the access
    token. Convex rotates the token roughly every 15 minutes and on every socket
    reauth, and each mint carried a new timestamp, so the whole page flashed back
    to its loading state and every query ran twice against the backend. Queries now
    keep their data and their live subscriptions across a refresh, and still reset
    on a real identity change — sign in, sign out, session rotation, or an
    organization/role switch.
  - Fix `fetchNextPage` from `useInfiniteQuery` getting a new identity on every
    render, which re-registered any effect keyed on it — including the
    infinite-scroll observer pattern the docs recommend. It is now stable for the
    life of the hook.
  - Improve `useInfiniteQuery` to reuse its page queries and aggregation across
    unrelated re-renders, instead of re-hashing arguments once per loaded page and
    re-scanning every loaded item.
  - Improve `queryOptions()` to keep its result referentially stable when nothing
    changed, including the two-argument form with inline options.
  - Fix query options losing referential stability entirely on pages that hold more
    than 500 distinct sets of query arguments.
  - Improve `useCRPC()` and `useCRPCClient()` to return the same value across
    renders, so they are safe to place in a dependency array.
  - Improve real-time updates to skip a redundant query-key hash per pushed query.

## 0.17.4

### Patch Changes

- [#331](https://github.com/udecode/kitcn/pull/331) [`23c0c99`](https://github.com/udecode/kitcn/commit/23c0c999adda8aab66d4d4f88806368fbcff8d2f) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Improve mutation latency on tables with triggers, `aggregateIndex()` or
    `rankIndex()`. Writes no longer re-read the document after patching or
    replacing it, and no longer read it at all when no hook consumes it.
  - Improve `update()` and `delete()` cascade latency: `set null`, `set default`
    and cascade-update fan-out now apply their patches concurrently with a
    bounded pool instead of one round trip at a time. Tables with hooks keep
    their strict write order.
  - Improve read throughput on row-level-security tables. Policy `using` /
    `withCheck` callbacks run once per query execution or write-free mutation
    decision batch instead of once per returned row. Multi-row insert and delete
    re-resolve stateful policies after each write.
  - Fix row-level-security visibility when one query object is awaited more than
    once. Every await re-resolves the table's policies, so a policy that reads
    the database sees writes made between the two awaits.
  - Improve CPU cost of every ORM read and every `returning()` row by reshaping
    documents in a single pass.
  - Improve `returning({ _count })` on multi-row mutations: the aggregate-index
    readiness check now runs once per index instead of once per row.
  - Improve cascade delete throughput on schemas with many triggered or
    aggregate-indexed tables by removing per-row table-name probing.
  - Improve mutations that issue concurrent writes to a hooked table: the
    internal write lock now hands off to one waiter instead of waking all of
    them.
  - Fix `kitcn codegen` dropping nested cRPC HTTP routes when parsing projects
    through generated server placeholders.

## 0.17.3

### Patch Changes

- [#330](https://github.com/udecode/kitcn/pull/330) [`b78d94a`](https://github.com/udecode/kitcn/commit/b78d94a53d2f044816944317acea0ee9973739d8) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Start the CLI faster. esbuild, Babel, jiti, dotenv and the interactive prompt
    stack are loaded the first time a command needs them instead of on every
    invocation, so `kitcn --version`, `kitcn --help` and `--json` calls no longer
    pay for tooling they never use.
  - Run `kitcn codegen` with less repeated work: one module loader per run instead
    of two, and the parse shim resolved once instead of once per Convex module.
  - Speed up `kitcn add`, `kitcn view` and `kitcn info` on large schemas by
    parsing each schema revision once instead of once per managed table.
  - Speed up `kitcn init` and `kitcn add` file comparison, which no longer copies
    and serializes both syntax trees before comparing them.
  - Fix `kitcn dev` ignoring edits to shared routers, builders and contracts that
    sit next to the functions directory. Changing one regenerates the api like
    changing a function file does, for any functions path configured in
    `convex.json`.
  - Generate api and procedure metadata in a stable order regardless of the
    filesystem's directory listing order.
  - Shrink the `kitcn dev` file watcher, which no longer loads the rest of the CLI
    into the background process it keeps alive for the session.

## 0.17.2

### Patch Changes

- [#329](https://github.com/udecode/kitcn/pull/329) [`c853115`](https://github.com/udecode/kitcn/commit/c853115311cc6b2645c47736db529731af3fc2c6) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `useInfiniteQuery` from `kitcn/solid` crashing with `state.map is not a function` on every mount.
  - Update Solid infinite query results field by field, so a component reading `status` is not re-run when only `data` changes.

## 0.17.1

### Patch Changes

- [#324](https://github.com/udecode/kitcn/pull/324) [`0536f17`](https://github.com/udecode/kitcn/commit/0536f17bbd22f11d325c26c5e64bed160825a908) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `kitcn codegen` emitting both the `api` and `internal` type imports into
    generated runtime files that only reference one of them. A module whose
    procedures are all internal, or all public, no longer carries an unused import
    that editors grey out and that `tsc` rejects with `TS6196` when
    `noUnusedLocals` is enabled. Each generated runtime now imports only the api
    roots its procedures reference.

- [#326](https://github.com/udecode/kitcn/pull/326) [`6196625`](https://github.com/udecode/kitcn/commit/6196625d8ce3e9bd08f25373a7e536a43718b167) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `CRPCError` reaching the client as a bare `Error` with the message
    redacted to `Server Error` and `error.data` undefined. Errors converted by
    cRPC — a procedure calling another procedure through a caller, an ORM
    not-found, a Better Auth `APIError`, or any error wrapped by
    `getCRPCErrorFromUnknown` — now arrive as a `ConvexError` carrying the
    original `code`, `message`, and custom `data`.

    ```ts
    // convex/functions/payment.ts — internal procedure
    throw new CRPCError({
      code: "BAD_REQUEST",
      message: "Declined: INSUFFICIENT_FUNDS",
      data: { processorCode },
    });

    // Before — the public procedure delegating to it lost the reason
    onError: (error) => {
      error.data; // undefined
    };

    // After
    onError: (error) => {
      error.data; // { code: 'BAD_REQUEST', message: 'Declined: …', processorCode }
    };
    ```

  - Fix converted errors losing every source-mapped frame in Convex dashboard
    logs. Traces carry frames again; the original throw site stays on
    `error.cause`.

## 0.17.0

### Minor Changes

- [#322](https://github.com/udecode/kitcn/pull/322) [`b80d734`](https://github.com/udecode/kitcn/commit/b80d73402165543c91c7f83bba3eae59a6a82184) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - `kitcn add` no longer replaces scaffold files you have edited. Files that still
    match the scaffold are upgraded as before; edited files are kept, listed under
    `Refused files`, and the command exits `1` because the plugin is only partially
    installed. Pass `--overwrite` for the previous behavior.

  ```bash
  # Before — edits to crpc.ts were replaced, exit 0
  kitcn add auth --yes

  # After — edits are kept and the run fails until you choose
  kitcn add auth --yes --overwrite
  ```

  - `kitcn add --json` splits the old `skipped` list in two. `skipped` now means
    "already up to date", refused files move to `refused`, and `complete` reports
    whether everything was applied.

  ```jsonc
  // Before
  { "skipped": ["convex/lib/crpc.ts"] }

  // After
  { "skipped": [], "refused": ["convex/lib/crpc.ts"], "complete": false }
  ```

  ## Patches

  - Fix `kitcn codegen` leaving a hidden parse snapshot behind when a Convex module
    fails to load, which kept reporting the old error after the real file was
    fixed. Codegen evaluates modules in memory instead of mirroring them to a
    sibling file, so it no longer writes to — or deletes from — your Convex
    directory, and import-time stack traces now point at the real module rather
    than a temporary path. A file of your own ending in `.kitcn-parse.ts` is left
    untouched.
  - Fix plugin registration landing inside a comment or string that happens to
    mention `defineSchema(`, which recorded the plugin as installed while its
    tables and relations never reached the schema.
  - Fix `kitcn add auth` deleting a table's index callback when it was written as a
    block-bodied arrow or a named function. The callback is now preserved while
    managed fields are merged.
  - Fix schema patching merging value imports into a type-only `kitcn/orm` import,
    which produced duplicate identifiers, and skipping the import entirely when
    only `import * as orm from 'kitcn/orm'` was present.

- [#320](https://github.com/udecode/kitcn/pull/320) [`799dc4f`](https://github.com/udecode/kitcn/commit/799dc4f80ab998646fd1960fbf82d6f536e5317a) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Improve Convex and HTTP middleware to wrap the whole procedure: `next()`
    resolves after the handler runs, so timing, error reporting, and cleanup
    around it observe the handler, and handler errors propagate through every
    wrapping `catch`. A `ctx` changed on the return path no longer reaches the
    handler — pass it to `next()` instead.

    ```ts
    // Before — logged 0ms, never saw handler errors, and this ctx was ignored
    .use(async ({ ctx, next }) => {
      const start = Date.now();
      const result = await next({ ctx });
      console.log(`${Date.now() - start}ms`);
      return { ...result, ctx: { ...ctx, tenant } };
    })

    // After — times the handler, sees its errors, and passes ctx forward
    .use(async ({ ctx, next }) => {
      const start = Date.now();
      try {
        return await next({ ctx: { ...ctx, tenant } });
      } finally {
        console.log(`${Date.now() - start}ms`);
      }
    })
    ```

  - Improve chained `.input()` to apply each schema on its own instead of
    flattening them into one shape, so object-level rules run. A key declared by
    more than one schema is validated only by the last schema to declare it, even
    when an earlier schema carries object-level rules.

    ```ts
    // Before — the object-level rule was dropped and both fields reached the handler
    .input(z.object({ password: z.string(), confirm: z.string() }))

    // After — mismatched values are rejected before the handler runs
    .input(
      z
        .object({ password: z.string(), confirm: z.string() })
        .refine((v) => v.password === v.confirm)
    )
    ```

  ## Patches

  - Fix `.input()` schemas running twice per request, which made field transforms
    apply to their own output — `z.string().transform(s => s.length)` threw on
    valid input and `z.number().transform(n => n * 2)` doubled twice. Transforms
    and refinements now run exactly once.
  - Fix `next({ input })` being dropped for every middleware after the first, so
    input enrichment placed after an auth middleware no longer silently no-ops.
  - Fix HTTP routes returning a retryable `500` for errors raised by a procedure
    they called through a caller. `NOT_FOUND`, `FORBIDDEN`, and other codes now
    keep their status and message.
  - Fix HTTP routes returning `500` for the twelve error codes missing from the
    route status map, including `PAYLOAD_TOO_LARGE` (`413`),
    `UNSUPPORTED_MEDIA_TYPE` (`415`), and `PRECONDITION_FAILED` (`412`).
  - Fix a malformed or empty JSON body returning `500` instead of `400`,
    including when HTTP middleware reads it through `getRawInput()`.

- [#317](https://github.com/udecode/kitcn/pull/317) [`b765f01`](https://github.com/udecode/kitcn/commit/b765f016cc82aabaad9d5f4d218955163f1a73a5) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - `orderBy` on a field that no index _leads_ now sorts after reading, and under
    cursor pagination it raises instead of returning a page ordered by the wrong
    column. An index merely containing the field no longer counts: Convex walks an
    index in full key order, so `on(type, numLikes)` orders by `type` first. Add an
    index led by the sort field, or read without a cursor.

  ```ts
  // Before: paged, silently ordered by `type`
  index("numLikesAndType").on(t.type, t.numLikes);

  await db.query.posts.findMany({
    orderBy: { numLikes: "desc" },
    cursor: null,
    limit: 20,
  });

  // After: add an index the sort field leads
  index("numLikesAndType").on(t.type, t.numLikes);
  index("by_num_likes").on(t.numLikes);

  await db.query.posts.findMany({
    orderBy: { numLikes: "desc" },
    cursor: null,
    limit: 20,
  });
  ```

  - `.withIndex(name, range)` now wins over the index a `where` object would have
    selected, so a `where` the pinned index cannot serve becomes a scan the caller
    has to bound. Under cursor pagination that combination now asks for `maxScan`
    instead of quietly reading through a different index.

  ```ts
  // Before: scanned `by_status` and returned rows from every city
  await db.query.users
    .withIndex("by_city", (q) => q.eq("cityId", cityId))
    .findMany({ where: { status: "active" }, cursor: null, limit: 20 });

  // After: bound the scan
  await db.query.users
    .withIndex("by_city", (q) => q.eq("cityId", cityId))
    .findMany({
      where: { status: "active" },
      cursor: null,
      limit: 20,
      maxScan: 500,
    });
  ```

  ## Patches

  - Fix `.withIndex(name, range)` being ignored whenever the `where` object also
    matched another index. The index and its bounds you asked for are now the ones
    scanned — including under cursor pagination — so a range used to scope a query,
    a tenant id for instance, can no longer be dropped and return rows outside it.
  - Fix `where: { field: { in: [...] } }` combined with `orderBy` and `limit`
    returning an arbitrary slice — usually the oldest rows — instead of the
    requested window.
  - Fix `like`, `ilike`, `notLike`, and `notIlike` matching nothing when the
    pattern has a wildcard anywhere but the ends. `%` now matches any run of
    characters and `_` matches exactly one Unicode character, at any position.
  - Fix `eq`, `ne`, `in`, and `notIn` never matching array or object columns.
    Values are compared by content, in queries and in `update`/`delete` filters.
  - Fix `select()` returning raw rows for a `where: { id }` lookup, which silently
    skipped `map`, `filter`, `flatMap`, and `distinct`. `pageByKey` with the same
    `where` also returns its page shape instead of a bare array. A `where` on `id`
    or `id: { in: [...] }` reads those rows by key rather than scanning the table
    for them, so `select()` costs one read per id however large the table is.
    Cursor pagination rejects `id: { in: [...] }` with `maxScan`, because sorting
    arbitrary IDs by creation time requires reading the complete list first.
  - Apply RLS to source rows before any `select()` pipeline callback runs, so a
    mapper or flat-map stage cannot inspect or project a forbidden document.
  - Fix `flatMap`'s `limit` counting rows excluded by its `where`, which returned
    fewer children than asked for and often none. The limit now counts matching
    children, stays stable across pages instead of yielding a fresh batch per page,
    and reads each child once within the `maxScan` budget. It also stops on the
    last child it can return instead of reading one past it, so a small `limit`
    across many parents no longer spends reads no page can show. Exhausted and
    missing optional relations advance cursors without duplicates or loops.
  - Fix a relation `limit` combined with a relation `where` returning too few
    children — none when enough non-matching children sorted first. The limit now
    counts matching children. Without an explicit relation `orderBy`, the scan
    also stops after the requested visible rows, including rows filtered by RLS.

- [#316](https://github.com/udecode/kitcn/pull/316) [`59b80d0`](https://github.com/udecode/kitcn/commit/59b80d0f7c8c9aea78a15b427449907ef8976750) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Require `rls.roleResolver` for policies scoped with `to`. A role-scoped policy
    previously applied to every caller when no resolver was configured; it now
    throws `RLS_ROLE_RESOLVER_REQUIRED`. Queries and mutations check this for
    every table they touch before reading rows, so the error depends only on
    configuration and not on whether the table holds rows. SQL pseudo-roles
    (`public`, `current_user`, `current_role`, `session_user`) apply to everyone
    and still need no resolver.

  ```ts
  // Before
  const ormDb = orm.db(ctx, { rls: { ctx } });

  // After
  const ormDb = orm.db(ctx, {
    rls: { ctx, roleResolver: (ctx) => ctx.roles ?? [] },
  });
  ```

  - Deny RLS policy comparisons against a missing value, following SQL null
    semantics. A policy written as `eq(column, null)` now denies instead of
    matching explicitly-null columns, and an unauthenticated caller no longer
    matches rows whose owner column was never set. Use `isNull` to match absent
    or null columns.

  ```ts
  // Before
  rlsPolicy("read_unassigned", {
    for: "select",
    using: (ctx, t) => eq(t.ownerId, null),
  });

  // After
  rlsPolicy("read_unassigned", {
    for: "select",
    using: (ctx, t) => isNull(t.ownerId),
  });
  ```

  ## Patches

  - Fix many-to-many relations ignoring the junction table's RLS policies, which
    revealed which rows other users were linked to. Loading a relation with `with`
    now enforces the junction table's policies alongside the related table's.

- [#319](https://github.com/udecode/kitcn/pull/319) [`2aee478`](https://github.com/udecode/kitcn/commit/2aee478fcc750d06bd914bf5cd701045d1c79736) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Breaking changes

  - Enforce the configured total budget across all `shards`.

    ```ts
    // 20 per minute in total, spread over 4 shards
    Ratelimit.fixedWindow(20, "1 m", { shards: 4 });
    ```

  - Preserve configured `maxReserved` headroom across sharded limiters.
  - Reject limiter budgets that leave any shard with less than one usable token.
  - Reject non-positive, non-finite, or unservable dynamic limit overrides.

  - Evaluate the requested `count` / `rate` in `check()` against the tokens already
    spent. It previously evaluated nothing and returned `success: true` for every
    caller, so a pre-flight gate now reports `success: false` where it always said
    "allowed".

    ```ts
    // Before: always true, even for an exhausted identifier
    const gate = await limiter.check(userId, { count: 5 });

    // After: matches what limit() would decide, without consuming tokens
    const gate = await limiter.check(userId, { count: 5 });
    if (!gate.success) return { retryAt: gate.reset };
    ```

  ## Features

  - Add `snapshotToState` to convert a `getValue()` snapshot into the state shape
    `calculateRatelimit()` expects. Snapshots retain the full projected state,
    including sliding-window current and previous counts, so later projections
    preserve boundary decay.
  - Add `remainingRaw` to `calculateRatelimit()` results for the exact token
    balance, including the negative value when a request overdraws.

  ## Patches

  - Fix `getRemaining()` inverting sliding-window quotas. An identifier with no
    traffic reported `remaining: 0`, and quota banners or `X-RateLimit-Remaining`
    headers showed the opposite of the truth.
  - Fix `resetUsedTokens()` leaving an identifier blocked by the ephemeral cache,
    so an admin quota reset silently failed for the rest of the window.
  - Key the ephemeral block cache per shard. One exhausted shard used to block the
    identifier outright, stranding every other shard's tokens until the window
    reset and enforcing well under the configured limit.
  - Sum every shard in `getRemaining()` rather than extrapolating the fullest one.
    A half-drained sharded limiter reported its full budget as still available.
  - Improve shard selection to compare exact token balances, so sharded limiters
    spread load onto the emptier shard instead of tying on rounded counts.
  - Retry the remaining shards when the preferred candidates are exhausted, so
    routing cannot deny a request while another shard can still serve it.
  - Preserve whole-request capacity for fractional budgets by dealing the whole
    portion and keeping the fractional remainder on one shard.
  - Scale fixed-window snapshots and response balances by `capacity` rather than
    the refill `limit`, so burst configurations report valid remaining tokens.
  - Scope ephemeral blocks by shard, requested count, and reservation mode, so a
    failed large or ordinary request does not hide tokens from a smaller or
    reserved request, and include cached shards when reporting the earliest
    global retry time.
  - Prune expired ephemeral block variants when recording a new block.
  - Allocate token-bucket refill rates in proportion to shard capacity, preserving
    the full configured refill when capacity shares are uneven.
  - Compute reserved-request retry times against `maxReserved` headroom rather
    than the non-reserved zero-debt threshold.
  - Evaluate sampled shard states at one common read timestamp, avoid refilling
    their aggregate again, and sum each shard's independently usable whole tokens
    in `getRemaining()` without netting debt or fractions across isolated shards.
  - Preserve sampled per-shard state in snapshots so all-shard projections retain
    independent capacity saturation and sliding-window decay.
  - Read each candidate shard set concurrently, including exhaustion fallbacks.
  - Reject requests that exceed every shard's capacity and reservation headroom
    with `reason: "requestTooLarge"` and no retry deadline or shard reads.
  - Exclude permanently undersized shards from retry deadlines and invalidate
    local snapshot and block-decision caches when dynamic limits change.
  - Preserve permanent oversized denials through all-shard snapshots and React
    projections without scheduling an infinite retry timer.
  - Apply per-shard capacity guards to partial snapshots while retaining uncapped
    reservation headroom when `maxReserved` is omitted.
  - Reject negative, non-finite `maxReserved` values before sharding or retry
    calculation.
  - Normalize shard-local algorithms, enforce per-shard capacity for fresh
    projections, and generation-guard cache writes across dynamic updates.
  - Skip infinite block-cache entries and retain at most 32 finite variants per
    identifier.

### Patch Changes

- [#318](https://github.com/udecode/kitcn/pull/318) [`eddfc08`](https://github.com/udecode/kitcn/commit/eddfc083de4e1656237f1b871919c9c382eeb67e) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix auth queries that filter by `id` resolving records from the wrong model,
    which let a lookup, update, or delete for one model read, patch, or destroy a
    record belonging to another. IDs are now checked against the model being
    queried, and IDs that belong elsewhere or are malformed resolve to "not
    found" instead of a foreign record or an error.
  - Fix `findMany` and `count` returning duplicated records past the first page,
    which also inflated counts used for membership, role, and API key limits.
  - Fix mixed `AND`/`OR` filters in `findMany` and `count` returning records the
    filter excluded, such as rows outside the requested organization. Mixed
    filters are now rejected, matching `updateMany` and `deleteMany`.
  - Fix `not_in` filters returning no match when the matching record was not
    among the first records scanned, which made those updates fail and those
    deletes silently do nothing.
  - Fix `auth.jwtCache: false` in the Next.js integration disabling
    authentication instead of just the JWT cookie cache, which made every server
    request anonymous.

- [#321](https://github.com/udecode/kitcn/pull/321) [`9a7feab`](https://github.com/udecode/kitcn/commit/9a7feab2f99ee383a02225c293137416a0438fbd) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix signed-in users being signed out when their name or email contains
    non-ASCII characters.
  - Fix server callers re-running a failed mutation or action after a
    non-authorization error, which could charge a card or write a row twice.
  - Fix results of auth-scoped actions surviving sign-out and being served to the
    next user in the same tab.
  - Fix `skipUnauth` being ignored on queries and action queries, so backend
    authorization errors resolve to `null` as documented instead of surfacing as
    query errors.
  - Fix `Date` values in query args crashing the render.
  - Fix a function-form `enabled` being ignored on queries, action queries, and
    infinite queries, which ran queries the caller had disabled.
  - Fix mutating a query args object in place returning another component's args
    for a previously used key, which subscribed to the wrong Convex query.
  - Fix RSC prefetch of `crpc.http.*` building a different URL than the browser
    client for `params` and `searchParams`, so prefetched data now hydrates
    instead of being refetched.

## 0.16.1

### Patch Changes

- [#314](https://github.com/udecode/kitcn/pull/314) [`e01e3f5`](https://github.com/udecode/kitcn/commit/e01e3f58ae33e118f1bf844e7d5a98694ce10ab0) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `like`, `ilike`, `contains`, `endsWith`, and the array operators returning
    too few rows — often none — when combined with `limit`. These operators are
    matched after the rows are read, so `limit` now counts matches instead of
    scanned rows. `offset` counts matches too.
  - Fix those same operators being ignored entirely under cursor pagination, which
    returned pages containing rows that did not match. Pages now hold only
    matching rows.
  - Fix `NOT` around one of those operators matching nothing instead of negating,
    with or without a cursor.
  - Fix `isNull` skipping rows whose column was never written once that column is
    indexed. Absent and explicitly-null columns now both match, with or without an
    index.
  - Fix `flatMap` pagination dropping and duplicating children after the first
    page. Walking every page now returns the same rows as reading them at once.
  - Fix soft cascade deletes rescheduling themselves forever and never reaching
    the children past the first batch.

## 0.16.0

### Minor Changes

- [#310](https://github.com/udecode/kitcn/pull/310) [`a229128`](https://github.com/udecode/kitcn/commit/a229128a94605c229d0ba9a5e9e7f2f98ee76e7e) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Require Convex 1.42 or newer.

    ```bash
    # Before
    bun add convex@1.38.0

    # After
    bun add convex@1.42.3
    ```

### Patch Changes

- [#311](https://github.com/udecode/kitcn/pull/311) [`644ed41`](https://github.com/udecode/kitcn/commit/644ed41f38db3796790a947019ea089c224bf83d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix unbounded auth queries hanging after 200 rows.
  - Prevent action contexts from exposing mutation-only transaction options.

## 0.15.18

### Patch Changes

- [#308](https://github.com/udecode/kitcn/pull/308) [`65a331b`](https://github.com/udecode/kitcn/commit/65a331b7b9cb541b46c031e9afabdadd4d9d0c91) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix ORM ID queries and relation loading to treat malformed IDs as missing
    records.

## 0.15.17

### Patch Changes

- [#305](https://github.com/udecode/kitcn/pull/305) [`b7ccc0b`](https://github.com/udecode/kitcn/commit/b7ccc0b19fb79017a9116bebc548b63b6081b822) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix cRPC infinite queries backed by native Convex pagination loading pages
    before `fetchNextPage()` is called.

## 0.15.16

### Patch Changes

- [#301](https://github.com/udecode/kitcn/pull/301) [`3248105`](https://github.com/udecode/kitcn/commit/32481058f1043a4f9a0a897ee966d9048dc79739) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add provider-owned Convex authentication recovery after transient token failures.

## 0.15.15

### Patch Changes

- [#297](https://github.com/udecode/kitcn/pull/297) [`4fba1b8`](https://github.com/udecode/kitcn/commit/4fba1b8dcef38e3433984553063306aafd87a453) Thanks [@MikeyZhang75](https://github.com/MikeyZhang75)! - ## Patches

  - Fix `kitcn deploy` and `kitcn aggregate backfill|rebuild|prune` failing with `Too many documents read in a single function execution (limit: 32000)` once a table with an `aggregateIndex()` grows past ~32k rows. Backfill kickoff now discovers removed aggregate indexes with bounded distinct-key index scans instead of reading every aggregate row. Clearing a removed index whose aggregate rows already exceed platform limits still requires a chunked prune.
  - Fix `backend=concave` failing to locate the Concave CLI with `@concavejs/cli` releases that do not export `./package.json`.
  - Pin `@concavejs/cli` in concave scaffolds to the supported version instead of `latest`.

## 0.15.14

### Patch Changes

- [#293](https://github.com/udecode/kitcn/pull/293) [`0fcbae0`](https://github.com/udecode/kitcn/commit/0fcbae099b0658c2d921a42a189e713a71ebeb71) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix Better Auth client type compatibility for auth providers and organization-heavy auth clients.
  - Support Better Auth 1.6.18 across generated auth apps.

## 0.15.13

### Patch Changes

- [#289](https://github.com/udecode/kitcn/pull/289) [`4aae1ee`](https://github.com/udecode/kitcn/commit/4aae1ee1dfac8ae85fe0999fba8a78e523fec975) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth adapter updates with no `where` clauses to return `null`.
  - Fix Next.js and TanStack Start auth proxies to strip hop-by-hop headers.
  - Update supported Better Auth installs to `1.6.15` with a `>=1.6.11 <1.7.0` peer range.

## 0.15.12

### Patch Changes

- [#285](https://github.com/udecode/kitcn/pull/285) [`0ca9202`](https://github.com/udecode/kitcn/commit/0ca9202b83ccaa692507242aee99e086c1994cb1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth providers to accept plugin-rich Better Auth clients without casts.

## 0.15.11

### Patch Changes

- [#283](https://github.com/udecode/kitcn/pull/283) [`2e09a29`](https://github.com/udecode/kitcn/commit/2e09a297e27ea714fe73d0a388d3ed11359630c3) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn init -t start` to preserve the shadcn Start template while safely staging existing empty target directories.
  - Fix `rankIndex().orderBy()` so documented direction objects typecheck and normalize correctly.

## 0.15.10

### Patch Changes

- [#280](https://github.com/udecode/kitcn/pull/280) [`a684485`](https://github.com/udecode/kitcn/commit/a6844855d69725321ddfbd4b50e8a1f517e70e96) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn init -t start` to preserve the shadcn Start template while safely staging existing empty target directories.

## 0.15.9

### Patch Changes

- [`386b54e`](https://github.com/udecode/kitcn/commit/386b54e2d5a9c1b48e9a8db5604d29d8e9013f9f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn init -t start` for TanStack Start scaffolds that use Vite
    `resolve.tsconfigPaths`.
  - Improve the packaged kitcn agent skill prompt and reference footprint.

## 0.15.8

### Patch Changes

- [#275](https://github.com/udecode/kitcn/pull/275) [`4dd56d0`](https://github.com/udecode/kitcn/commit/4dd56d062dbd268e7768f0a0e854572a840d7de6) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Support Better Auth plugin sign-in methods in `useSignInMutationOptions`.

## 0.15.7

### Patch Changes

- [#272](https://github.com/udecode/kitcn/pull/272) [`d286077`](https://github.com/udecode/kitcn/commit/d286077bf388956d8f423eaaa1afed18b0b4b7b9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix ORM update and delete filters on primary id arrays so bounded mutations do not require `allowFullScan`.
  - Bound sync primary-id mutation fanout by `mutationBatchSize` and keep legacy scheduled cursors on the query-pagination path.

## 0.15.6

### Patch Changes

- [#270](https://github.com/udecode/kitcn/pull/270) [`2703bf0`](https://github.com/udecode/kitcn/commit/2703bf056b129c783ec772280b4e1648bffdf171) Thanks [@zbeyens](https://github.com/zbeyens)! - Support `OPTIONS` preflight forwarding in `kitcn/auth/nextjs` route handlers and generated Next auth routes.

## 0.15.5

### Patch Changes

- [#268](https://github.com/udecode/kitcn/pull/268) [`da34316`](https://github.com/udecode/kitcn/commit/da34316d76a64ebd6d0ac683ded2472246bb9439) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Support syncing shared Convex query clients directly from `ConvexAuthProvider`.

  ## Patches

  - Keep the existing auth store attached when reusing a Convex query client before `ConvexAuthProvider` resyncs it.
  - Fix `kitcn/auth/start/server` so Nitro production builds can trace and include the TanStack Start server dependency without making `kitcn/auth/start` unsafe for browser loaders.

## 0.15.4

### Patch Changes

- [#266](https://github.com/udecode/kitcn/pull/266) [`5de6e94`](https://github.com/udecode/kitcn/commit/5de6e9466bf066180b76062cbbb5632e27fc6bd1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Support syncing shared Convex query clients directly from `ConvexAuthProvider`.

## 0.15.3

### Patch Changes

- [#264](https://github.com/udecode/kitcn/pull/264) [`21760cb`](https://github.com/udecode/kitcn/commit/21760cb994a8f3e093795c342cdbda11ae8e8819) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix Convex query cache updates when a subscription returns `null`.

## 0.15.2

### Patch Changes

- [#262](https://github.com/udecode/kitcn/pull/262) [`a33d263`](https://github.com/udecode/kitcn/commit/a33d2633e0b2c2e016f4d951b3bea8a2852b7a03) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix Resend scaffolds to resolve optional Resend env values from Convex runtime env proxies.
  - Fix Resend env helper reruns to update noncanonical `createEnv` formatting instead of silently skipping `readOptionalRuntimeEnv`.
  - Fix env helper reruns to fail loudly instead of duplicating or rewriting non-literal `readOptionalRuntimeEnv` options.
  - Fix Resend scaffold table names to match the camelCase schema extension keys.

## 0.15.1

### Patch Changes

- [#260](https://github.com/udecode/kitcn/pull/260) [`b9ae68b`](https://github.com/udecode/kitcn/commit/b9ae68bc6c3c26b783f6ae491555026f05510d80) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add a TanStack Start loader auth helper for priming Convex query clients before protected route loaders run.

## 0.15.0

### Minor Changes

- [#257](https://github.com/udecode/kitcn/pull/257) [`d476288`](https://github.com/udecode/kitcn/commit/d476288e617db8d5d44821a70af3ec787280ea5c) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Require Convex 1.38.0 or newer for generated apps and peer dependency checks.

  ```sh
  # Before
  bun add convex@1.36.1 kitcn

  # After
  bun add convex@1.38.0 kitcn
  ```

  ## Features

  - Support IP-aware rate-limit scaffolds with Convex request metadata.

  ## Patches

  - Support Expo app adoption and avoid Bun-only Expo scaffolding in npm-launched init flows.
  - Document Convex request metadata for IP-aware rate-limit protection.

## 0.14.3

### Patch Changes

- [#255](https://github.com/udecode/kitcn/pull/255) [`0bf1fc2`](https://github.com/udecode/kitcn/commit/0bf1fc2136bf9a2dd1f2ac218d614dcb58a5888b) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix plugin dependency installs to use the project's package manager.

## 0.14.2

### Patch Changes

- [`21acedd`](https://github.com/udecode/kitcn/commit/21acedd829df53c9207c75cee4fe7f68c6a0bd24) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw Convex auth adoption for TanStack Start apps that do not keep a kitcn provider at the default path.
  - Clarify organization auth guidance for Stripe-style plugin side effects in Convex actions.

## 0.14.1

### Patch Changes

- [#251](https://github.com/udecode/kitcn/pull/251) [`8ac174c`](https://github.com/udecode/kitcn/commit/8ac174cde9642dd61d5e9420b6cbc53ef7a7c124) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix ORM updates so timestamp `$onUpdateFn` hooks can return `Date` values.

## 0.14.0

### Minor Changes

- [#248](https://github.com/udecode/kitcn/pull/248) [`26023d2`](https://github.com/udecode/kitcn/commit/26023d2ae1b359174658aa4e9dabaeb3683d2142) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Require Convex 1.36 or newer.

  ```bash
  # Before
  bun add convex@1.35.1

  # After
  bun add convex@1.36.1
  ```

  ## Features

  - Add `kitcn env default` passthrough for Convex default environment variables.

  ## Patches

  - Align Better Auth scaffolds and auth runtime helpers with Better Auth 1.6.9.
  - Document Convex inline query, branch deployment, deploy message, and preview deployment passthroughs.

## 0.13.10

### Patch Changes

- [#245](https://github.com/udecode/kitcn/pull/245) [`547ccfd`](https://github.com/udecode/kitcn/commit/547ccfd2673c0099c63b55137b201476da13a56e) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `createAuthMutations` support for Better Auth clients that use the Convex client plugin.

## 0.13.9

### Patch Changes

- [#240](https://github.com/udecode/kitcn/pull/240) [`042a568`](https://github.com/udecode/kitcn/commit/042a5684066e6a6691f858afc22de68c71b58136) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw Convex auth reruns so added Better Auth plugins refresh the generated schema without `--overwrite`.

## 0.13.8

### Patch Changes

- [#238](https://github.com/udecode/kitcn/pull/238) [`f43fc36`](https://github.com/udecode/kitcn/commit/f43fc3623b7f05fb8d55d9be1144d192c3e9235f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn add auth --preset convex` so schema registration reuses existing `authSchema` imports.

## 0.13.7

### Patch Changes

- [#236](https://github.com/udecode/kitcn/pull/236) [`508f6df`](https://github.com/udecode/kitcn/commit/508f6df2cfb0e7177fefcdc48767473560b4b69b) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth Stripe subscription writes so `createdAt` and `updatedAt` are only written when the target table defines them.

## 0.13.6

### Patch Changes

- [#234](https://github.com/udecode/kitcn/pull/234) [`f137874`](https://github.com/udecode/kitcn/commit/f13787454ca5cf9a7ea37ca48d021b19de38a2db) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix React query options to stay stable for equal Convex query args.

## 0.13.5

### Patch Changes

- [#232](https://github.com/udecode/kitcn/pull/232) [`24ca124`](https://github.com/udecode/kitcn/commit/24ca124401b22f0ce370709675f796260bebb74e) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix noisy `oidc-provider` deprecation warnings from the internal Convex auth plugin.

## 0.13.4

### Patch Changes

- [#229](https://github.com/udecode/kitcn/pull/229) [`a93f264`](https://github.com/udecode/kitcn/commit/a93f264c522f2818a0166b85770ffe88d1a1eb6d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn migrate` and `kitcn aggregate` so Convex prod-target runs keep
    ambient deployment auth env in CI.

## 0.13.3

### Patch Changes

- [#227](https://github.com/udecode/kitcn/pull/227) [`2446f3e`](https://github.com/udecode/kitcn/commit/2446f3e53fd74153a1e5ffffc7773553086f899b) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `kitcn init -t expo` for a fresh Expo scaffold built on the official
  `create-expo-app` shell, including the Convex baseline, starter messages
  screen, and first-class `kitcn add auth` parity on the Expo scaffold.

  Expo local env now also owns `EXPO_PUBLIC_SITE_URL`, so Concave dev and Expo
  auth keep one local app-origin contract instead of drifting back to
  `http://localhost:3000`.

## 0.13.2

### Patch Changes

- [`0f1bed4`](https://github.com/udecode/kitcn/commit/0f1bed493208211e3f452420b2756456ed16f5de) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn add auth` in fresh apps so the CLI does not require `better-auth` to be installed before the auth scaffold planner runs.

## 0.13.1

### Patch Changes

- [#219](https://github.com/udecode/kitcn/pull/219) [`3ec2d3b`](https://github.com/udecode/kitcn/commit/3ec2d3b4d4049817124dc4fff12162d1fed2b1a5) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth env sync and local auth bootstrap so `kitcn add auth`, `kitcn env push`, and `kitcn dev --bootstrap` use the real Convex CLI entrypoint more reliably across runtimes and platforms.
  - Fix `kitcn init -t <next|start|vite>` custom shadcn preset exits so they stop with a clear rerun instruction instead of crashing while patching scaffold files.
  - Improve `kitcn init -t <next|start|vite>` fresh scaffolds by syncing the shadcn wrapper to `shadcn@4.3.0` and regenerating the starter outputs against the latest upstream template contract.

## 0.13.0

### Minor Changes

- [#213](https://github.com/udecode/kitcn/pull/213) [`71dbc28`](https://github.com/udecode/kitcn/commit/71dbc28f9a59716f8ecd41fda8ee61709ad9c9da) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Require explicit `basePath` when `registerRoutes` is used with non-default auth routes.

  ```ts
  // Before
  import { registerRoutes } from "kitcn/auth/http";

  // auth config uses basePath: "/custom-auth"
  registerRoutes(http, getAuth, {
    cors: {
      allowedOrigins: [process.env.SITE_URL!],
    },
  });

  // After
  import { registerRoutes } from "kitcn/auth/http";

  registerRoutes(http, getAuth, {
    basePath: "/custom-auth",
    cors: {
      allowedOrigins: [process.env.SITE_URL!],
    },
  });
  ```

  - Require `better-auth@1.6.5`.

  ```bash
  # Before
  bun add better-auth@1.5.3

  # After
  bun add better-auth@1.6.5
  ```

  ## Patches

  - Let Convex handle anonymous non-interactive local setup without forcing `CONVEX_AGENT_MODE`.
  - Warn when an app pins an older Convex dependency family than kitcn expects.
  - Support Convex `dev --start` as a pre-run conflict flag.
  - Improve auth route registration so default Convex auth routes avoid eager Better Auth initialization during startup.
  - Preserve forwarded host and protocol headers through Next.js, TanStack Start, and Convex auth route proxies.
  - Fix auth helper token refresh, custom auth `basePath` support, and async custom JWT payload resolution.
  - Fix Better Auth adapter index matching and static filtering for composite and case-insensitive queries.
  - Support Better Auth `1.6.5` auth clients without user-code casts.

## 0.12.28

### Patch Changes

- [#210](https://github.com/udecode/kitcn/pull/210) [`1b3468a`](https://github.com/udecode/kitcn/commit/1b3468a867d62a9b55679170628d5a78c747f156) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw Convex auth adoption so `kitcn add auth --preset convex --yes`
    installs `kitcn` before codegen and local bootstrap.
  - Fix `kitcn deploy` so CI deployment env vars reach Convex deploy, migrations,
    and aggregate backfill.

## 0.12.27

### Patch Changes

- [#206](https://github.com/udecode/kitcn/pull/206) [`7edbb5e`](https://github.com/udecode/kitcn/commit/7edbb5e3e445ed7331a4cc19ec795900ccb9ca52) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `bunx --bun kitcn init -t start --yes` so Bun-native parse-time imports
    no longer bypass project aliases and crash first-run codegen on scaffolded
    Start files.
  - Fix raw auth reruns so `http.ts` import detection respects both quote styles,
    `registerRoutes(http, getAuth, ...)` accepts Better Auth route contracts
    without a type cast, and raw auth clients keep the app `SITE_URL` while
    preserving user-edited raw `auth-client.ts` files on reruns.

## 0.12.26

### Patch Changes

- [`897a06b`](https://github.com/udecode/kitcn/commit/897a06b9e6ee5289ccf507d6c878d377ecfb1475) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw auth reruns so `http.ts` import detection respects both quote styles,
    and `registerRoutes(http, getAuth, ...)` accepts Better Auth route contracts
    without a type cast.

## 0.12.25

### Patch Changes

- [`c1bc1a0`](https://github.com/udecode/kitcn/commit/c1bc1a046e71af2b311a3568fa397b57093138b1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix raw TanStack Start auth adoption reruns so `http.ts` import detection
    respects both quote styles and `registerRoutes(http, getAuth, ...)`
    typechecks without casts.

## 0.12.24

### Patch Changes

- [#202](https://github.com/udecode/kitcn/pull/202) [`10c2dc4`](https://github.com/udecode/kitcn/commit/10c2dc4f6de34fd7aaf1ac7bb6c964d7e63fcd3d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Support `kitcn add auth --preset convex --yes` on TanStack Start apps
    without falling through the Vite `main.tsx` patch path.

## 0.12.23

### Patch Changes

- [#200](https://github.com/udecode/kitcn/pull/200) [`7531fc9`](https://github.com/udecode/kitcn/commit/7531fc90d77b12b2e0815b8775ccecab3134784e) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix React auth hooks so `useAuth()` and `useSafeConvexAuth()` stay loading
    while a cached session token is still syncing to Convex, which prevents a
    brief signed-out flash before the signed-in state settles.

## 0.12.22

### Patch Changes

- [`998ee69`](https://github.com/udecode/kitcn/commit/998ee69335c3e8f4b86333b15c14d0965a3aaae9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` so local Convex preflight uses `convex init` by default, and only falls back to the upgrade-capable local dev lane when older local backends require it.
  - Improve auth and backend docs so Convex and Concave env/JWKS flows are split into explicit backend lanes.

## 0.12.21

### Patch Changes

- [`96d5572`](https://github.com/udecode/kitcn/commit/96d55722434c09f7acbfbc8b89efc22f9e24768f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Improve TanStack Start auth migration docs and clarify the `kitcn add auth --schema --yes` schema refresh flow.
  - Fix the Next.js auth proxy so POST auth errors return the upstream response instead of crashing with a 500.
  - Fix `kitcn dev` local bootstrap so older local Convex backends auto-upgrade without hanging on a non-interactive prompt, and preserve local component targeting during preflight.

## 0.12.20

### Patch Changes

- [#193](https://github.com/udecode/kitcn/pull/193) [`db4b2a9`](https://github.com/udecode/kitcn/commit/db4b2a9c0e7ba4bf2fe52eba2f6d00c6c82bf605) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Improve mutation-driven action-caller guidance so `requireActionCtx()` points
    scheduler-capable flows to `requireSchedulerCtx()` and `caller.schedule.*`.
  - Fix server-side call docs so mutation-or-action callbacks schedule actions
    instead of showing an invalid direct action call path.
  - Improve React error-handling docs to recommend `error.data?.message` and a
    global mutation toast pattern with `meta.errorMessage`.

## 0.12.19

### Patch Changes

- [#187](https://github.com/udecode/kitcn/pull/187) [`269966e`](https://github.com/udecode/kitcn/commit/269966eddf9c2a3407e284c86ef3becca9ff441a) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` watcher codegen so Convex parse-time imports read local env
    values from `.env` and `convex/.env`, matching the initial codegen path.
  - Ignore watcher-owned `*.kitcn-parse.ts` temp files during `kitcn dev` so
    parse-time source rewrites do not retrigger codegen in a save loop.
  - Fix `kitcn codegen` so parse-time imports skip helper `.ts` files that do not
    define procedures, and support transitive `.tsx` imports like React Email
    templates.
  - Add server-only middleware procedure info for logging and tracing. Standard
    `export const` queries, mutations, and actions infer `module:function`
    automatically through app `generated/server`; `.name("module:function")`
    overrides when needed, and HTTP routes expose route method and path
    automatically.
  - Add `requireSchedulerCtx()` for mutation-or-action scheduling flows so auth
    callbacks and other generic ctx paths can enqueue work without lying about
    action context.

## 0.12.18

### Patch Changes

- [#183](https://github.com/udecode/kitcn/pull/183) [`40db401`](https://github.com/udecode/kitcn/commit/40db401bc93a9eb1ed7f2398445ba0cebc0a5b28) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn codegen` parse-time cRPC builder stubs so `.paginated()` chains
    after `.input()` keep working and preserve pagination metadata.
  - Fix TanStack Start auth reloads so `createAuthMutations()` persists the
    returned Better Auth session token/data and `ConvexAuthProvider` restores the
    signed-in state after a page refresh.

- [#183](https://github.com/udecode/kitcn/pull/183) [`1218930`](https://github.com/udecode/kitcn/commit/1218930db83b112a43dca074d457ed76c9d4f4c7) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Support custom structured `data` payloads on `CRPCError` so conflict and
    validation handlers can return client-readable metadata alongside the built-in
    error code and message.

## 0.12.17

### Patch Changes

- [#179](https://github.com/udecode/kitcn/pull/179) [`4d2158b`](https://github.com/udecode/kitcn/commit/4d2158b09b4a316df96b4597e9c999517d7a44f8) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn codegen` module parsing so project `tsconfig.json` path aliases
    like `@/lib/crpc` resolve during codegen.
  - Fix `kitcn dev` and `kitcn codegen` parse-time env loading so Concave apps
    can read required values from the project root `.env`.

## 0.12.16

### Patch Changes

- [#177](https://github.com/udecode/kitcn/pull/177) [`2c7ff80`](https://github.com/udecode/kitcn/commit/2c7ff80b571147183316115e86df53f2dc1269d6) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix shared `c.middleware()` auth chains so mutation procedures keep mutation
    writer types like `ctx.db.insert`.
  - Improve shared middleware docs so mutation-only middleware uses
    `c.middleware<MutationCtx>(...)` instead of a query-only workaround.

## 0.12.15

### Patch Changes

- [`a0037ff`](https://github.com/udecode/kitcn/commit/a0037ff26d46749f60788548cb73bf81404fbbc8) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix the remaining `bunx --bun kitcn@latest init -t start --yes` bootstrap
    codegen failure when scaffolded files import `kitcn/server`.

## 0.12.14

### Patch Changes

- [`a5974eb`](https://github.com/udecode/kitcn/commit/a5974ebf70ce984aab6098ffad397c9b116fa7b9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix the remaining `bunx --bun kitcn@latest init -t start --yes` bootstrap
    parse failure by inlining a bootstrap-safe generated server stub for the real
    nested scaffold chain.

## 0.12.13

### Patch Changes

- [#170](https://github.com/udecode/kitcn/pull/170) [`437eff4`](https://github.com/udecode/kitcn/commit/437eff4f19222867dafc278f8f39aef9a81d4647) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `bunx --bun kitcn init -t start --yes` bootstrap parsing so scaffolded
    backend files resolve against the project install instead of the Bun cache,
    and preserve anonymous local Convex mode for follow-up `kitcn dev` runs.

## 0.12.12

### Patch Changes

- [#163](https://github.com/udecode/kitcn/pull/163) [`38ffd3c`](https://github.com/udecode/kitcn/commit/38ffd3c3843cc4549fd6366190b43977e23d34c0) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Add `kitcn auth jwks` for manual static JWKS export and key rotation when a
    deployment cannot use the Convex-only `env push` flow.

## 0.12.11

### Patch Changes

- [#166](https://github.com/udecode/kitcn/pull/166) [`3a95ffb`](https://github.com/udecode/kitcn/commit/3a95ffbf86872dbd29dbe806c1a48a10189ce611) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn init -t next` monorepo scaffolds so the Next overlay targets the real app root under `apps/*` and uses the workspace package manager instead of assuming a single-app root layout.

- [#163](https://github.com/udecode/kitcn/pull/163) [`38ffd3c`](https://github.com/udecode/kitcn/commit/38ffd3c3843cc4549fd6366190b43977e23d34c0) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix Concave local `kitcn dev` schema watches so `schema.ts` edits rerun fresh codegen and refresh generated schema outputs without a manual `kitcn codegen`.
  - Fix `count()` and aggregate range filters on `timestamp({ mode: "string" })`
    aggregateIndex suffix fields so stored millis buckets match ISO-string
    filters instead of silently returning zero.

## 0.12.10

### Patch Changes

- [#157](https://github.com/udecode/kitcn/pull/157) [`bb038d8`](https://github.com/udecode/kitcn/commit/bb038d880902ef3c2b7388161945dd067073c08f) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix auth-bound React Query data so guest, sign-in, and account-switch transitions do not keep stale cached user data.

## 0.12.9

### Patch Changes

- [#154](https://github.com/udecode/kitcn/pull/154) [`4681298`](https://github.com/udecode/kitcn/commit/46812983553da242a7ee478fc2ec7d024ca018cc) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn dev` so projects with a remote Convex deployment in `.env.local` keep using that remote target instead of falling back to local Convex.

## 0.12.8

### Patch Changes

- [#152](https://github.com/udecode/kitcn/pull/152) [`92dd2bc`](https://github.com/udecode/kitcn/commit/92dd2bcf1ce35c1eb34315b88f025c7ee360a9a1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix interactive scaffold selection so duplicate file paths are shown once and the active preset stays selected.
  - Fix generated auth demo pages so sign-in and sign-up stay on the signed-in view instead of bouncing back to the auth route.

## 0.12.7

### Patch Changes

- [#150](https://github.com/udecode/kitcn/pull/150) [`9fb1adf`](https://github.com/udecode/kitcn/commit/9fb1adf3a8f9bb7b54ba4dd42c809c9b54ba7e31) Thanks [@zbeyens](https://github.com/zbeyens)! - - Pin the scaffolded Zod install to the supported Zod 4 line so npm
  `kitcn init -t start` resolves without the peer conflict hit during release
  validation.

## 0.12.6

### Patch Changes

- [#148](https://github.com/udecode/kitcn/pull/148) [`8c59d89`](https://github.com/udecode/kitcn/commit/8c59d892f5fdfc12448aee35d86f286378e61aa6) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add `kitcn init -t start` for fresh TanStack Start apps.
  - Add `kitcn/auth/start` and Start-specific auth scaffolding for `kitcn add auth`.

  ## Patches

  - Fix generated file rewrites so unchanged codegen output does not trigger
    repeated TanStack Start reloads during local development.

## 0.12.5

## 0.12.4

### Patch Changes

- [`d264542`](https://github.com/udecode/kitcn/commit/d264542e0e6818693cad2ad9520da145c0a72694) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix `kitcn add auth` in fresh apps so auth planning installs its required dependencies before the scaffold loads Better Auth internals.

## 0.12.3

### Patch Changes

- [`ec0aaaa`](https://github.com/udecode/kitcn/commit/ec0aaaa525a95788db5b2ec76626ae445e68eae2) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix scenario packaging for `@kitcn/resend` after the plugin moved `kitcn` to peer dependencies.

## 0.12.2

### Patch Changes

- [`4f9907e`](https://github.com/udecode/kitcn/commit/4f9907e95ceae9f30499b2bad0d1fb20d1fa5fc1) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix fresh `bunx kitcn` installs so the CLI keeps TypeScript off the cold
    startup path and still boots when Bun omits `typescript` from the transient
    install tree.

## 0.12.1

### Patch Changes

- [`93726d3`](https://github.com/udecode/kitcn/commit/93726d3d337a7469f98efbf5d932beb370d09d5d) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches

  - Fix fresh `bunx kitcn init` installs so the published CLI ships its runtime
    TypeScript dependency instead of failing before scaffold setup starts.
  - Fix `kitcn init -t next --yes` so non-interactive local bootstrap provisions
    an anonymous Convex deployment instead of stopping on a login prompt.

## 0.12.0

### Minor Changes

- [#139](https://github.com/udecode/kitcn/pull/139) [`11aa0ee`](https://github.com/udecode/kitcn/commit/11aa0ee2091827e6d52b30c261004f4ed64cac07) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Use `kitcn` and `@kitcn/resend` as the published package names, CLI
    commands, import paths, generated comments, and scaffold output.

  ```ts
  // Before
  import { defineSchema } from "<previous package name>/orm";
  import { sendEmail } from "<previous scoped plugin>/resend";

  // After
  import { defineSchema } from "kitcn/orm";
  import { sendEmail } from "@kitcn/resend";
  ```

  - Use `kitcn.json` as the default discovered kitcn config file.

  ```ts
  // Before
  export default {
    outputDir: "convex/shared",
  };

  // After
  {
    "paths": {
      "shared": "convex/shared"
    }
  }
  ```

  - Use app-owned schema composition from the default export. Package schema
    plugin entrypoints are gone, and relations/triggers chain on
    `defineSchema(...)`.

  ```ts
  // Before
  import { defineRelations, defineSchema } from "kitcn/orm";
  import { ratelimitPlugin } from "kitcn/plugins/ratelimit";

  export const schema = defineSchema(tables, {
    plugins: [ratelimitPlugin()],
  });

  export const relations = defineRelations(tables, (r) => ({
    users: {
      posts: r.many.posts(),
    },
  }));

  // After
  import { defineSchema } from "kitcn/orm";
  import { ratelimitExtension } from "../lib/plugins/ratelimit/schema";

  export default defineSchema(tables)
    .extend(ratelimitExtension())
    .relations((r) => ({
      users: {
        posts: r.many.posts(),
      },
    }));
  ```

  - Use `kitcn env push` and `kitcn env pull` for env sync.
    `env sync` is gone.

  ```bash
  # Before
  npx kitcn env sync --auth

  # After
  npx kitcn env push
  ```

  - Use `kitcn/ratelimit` and `kitcn/ratelimit/react`. The old
    `kitcn/plugins/ratelimit*` surface is gone.

  ```ts
  // Before
  import { calculateRateLimit } from "kitcn/plugins/ratelimit";
  import { useRateLimit } from "kitcn/plugins/ratelimit/react";

  // After
  import { calculateRatelimit } from "kitcn/ratelimit";
  import { useRatelimit } from "kitcn/ratelimit/react";
  ```

  ## Features

  - Add a registry-driven CLI with `init`, `add`, `view`, `info`, and `docs`,
    plus `--json`, dry-run, and diff output for scaffold changes.
  - Add backend-aware CLI support for both Convex and Concave, including
    `kitcn.json`, local bootstrap wrappers, and `kitcn verify`.
  - Add project-owned ORM migrations with generated `defineMigration(...)`
    helpers, migration manifests, docs, and `kitcn migrate`.
  - Add starter scaffolds for Next.js and Vite, plus adoption flows for raw
    Convex and create-convex-style apps.
  - Add packaged Convex skills and TanStack Intent metadata so installed apps
    carry their own agent guidance.
  - Add auth scaffolding and schema sync that picks up plugin changes from
    `auth.ts`, keeps `jwks` wired on first install, and supports raw Convex
    auth adoption.
  - Add `kitcn/auth/generated` and typed auth runtime helpers for
    generated auth files.
  - Add `@kitcn/resend` with scaffolded schema, plugin, webhook, cron,
    and email helpers.
  - Add app-owned schema extensions, typed plugin middleware helpers, and
    project-owned ratelimit scaffolding.
  - Add `codegen.trimSegments`, `unionOf(...)`, and broader `objectOf(...)`
    support for generated runtimes and schema builders.

  ## Patches

  - Improve local dev and codegen so env bootstrap, JWKS sync, watcher reruns,
    and supported-Node re-exec behave consistently in real apps.
  - Improve `dev` and `verify` output so one-shot bootstrap stays readable while
    long-running dev still preserves raw Convex logs.
  - Improve codegen failure handling so fatal parse errors keep the last good
    generated files instead of clobbering them with partial output.
  - Fix relation pairing for aliased auth organization edges so generated
    runtimes recover cleanly in apps with multiple relations between the same
    tables.
  - Fix TanStack Query/provider drift and generated runtime typing so local apps
    avoid duplicate React Query context failures and self-import cycles.
  - Improve auth runtime behavior so local auth metadata routes stay quiet, state
    updates land immediately, and optional env values do not break auth analysis.
  - Improve schema-only auth refresh so app-owned `schema.ts` files merge missing
    compatible auth fields, indexes, and relations, then stop on real conflicts
    with manual-action guidance.
  - Keep internal example and scenario typechecks pointed at workspace source so
    fresh CI runs do not depend on stale built package output after package
    renames.
  - Fix ratelimit storage and generated scaffolds so apps use the real
    ratelimit tables instead of failing with bogus missing-table guidance.
  - Keep scaffolded apps on the tested Hono and TanStack Query baselines across
    the example app, generated fixtures, and prepared scenarios.

## 0.11.0

### Minor Changes

- [#135](https://github.com/udecode/kitcn/pull/135) [`2977aa6`](https://github.com/udecode/kitcn/commit/2977aa68204f239bce5214582f111901affdc2ee) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking changes

  - Drop Better Auth `1.4` support and align auth integrations with Better Auth `1.5.3` and `@convex-dev/better-auth@0.11.1`.
  - Remove bundled passkey schema assumptions and follow the upstream `oauthApplication.redirectUrls` rename during `0.11` migrations.

  ```ts
  // Before
  "better-auth": "1.4.9";
  "@convex-dev/better-auth": "0.10.11";

  oauthApplication: {
    redirectURLs: ["https://example.com/callback"];
  }

  // After
  "better-auth": "1.5.3";
  "@convex-dev/better-auth": "0.11.1";

  oauthApplication: {
    redirectUrls: ["https://example.com/callback"];
  }
  ```

  ## Patches

  - Improve Next.js server-side token forwarding by forcing `accept-encoding: identity` for internal auth fetches behind proxy compression.
  - Fix auth adapter selection and OR-query handling so `id` selects preserve `_id`, nullish filters behave correctly, unsupported `experimental.joins` are rejected, and OR updates/deletes/counts dedupe by document id.
  - Improve auth route origin handling by filtering nullish `trustedOrigins` values before CORS matching.
  - Reduce generated runtime boilerplate by moving lazy registry/factory caching and caller/handler context typing into shared server helpers without changing generated caller or handler types.

## 0.10.3

### Patch Changes

- [#132](https://github.com/udecode/kitcn/pull/132) [`7182e18`](https://github.com/udecode/kitcn/commit/7182e18a00ee038d64d14c0078a456678fa9e79f) Thanks [@thuillart](https://github.com/thuillart)! - Support loading ORM triggers from `triggers.ts` during codegen, with fallback to `schema.ts` for backward compatibility. This keeps `schema.ts` schema-safe when triggers need generated runtime helpers like `createXCaller(...)`.

## 0.10.2

### Patch Changes

- [#129](https://github.com/udecode/kitcn/pull/129) [`9262e6f`](https://github.com/udecode/kitcn/commit/9262e6fe823bf8ededc84c1ee2ba9087efa96aa9) Thanks [@thuillart](https://github.com/thuillart)! - Fix trigger-generated callers in `schema.ts` so they stay schema-safe during Convex pushes, and preserve mutation scheduling APIs when triggers are parameterized with `MutationCtx`.

## 0.10.1

### Patch Changes

- [#128](https://github.com/udecode/kitcn/pull/128) [`24e1e60`](https://github.com/udecode/kitcn/commit/24e1e60877b1a0c46631abc6d4118058d42acd4e) Thanks [@thuillart](https://github.com/thuillart)! - ## Patches
  - Fix `kitcn dev` codegen watch mode so added, changed, and removed procedure files regenerate runtime artifacts more reliably during local development.

## 0.10.0

### Minor Changes

- [#121](https://github.com/udecode/kitcn/pull/121) [`7aa4f16`](https://github.com/udecode/kitcn/commit/7aa4f1643b2538627d3c6e51a6e5ab34bec0b500) Thanks [@carere](https://github.com/carere)! - ## Features
  - Add SolidJS flavor with full feature parity to React integration
  - Add `ConvexProvider`, `ConvexProviderWithAuth`, `useConvex`, and `useConvexAuth` for SolidJS
  - Add `createConvexQueryClient` and `useConvexQuery` bridging Convex subscriptions to TanStack Solid Query
  - Add cRPC layer for SolidJS with typed query/mutation/action proxies
  - Add `useConvexInfiniteQuery` for paginated queries in SolidJS
  - Add `createConvexHTTPProxy` for SSR-compatible HTTP client in SolidJS
  - Add auth mutation helpers (`useSignIn`, `useSignUp`, `useSignOut`) for SolidJS
  - Add `useRateLimit` hook for SolidJS using `client.onUpdate()` subscriptions
  - Add `./solid` and `./plugins/ratelimit/solid` package exports

### Patch Changes

- [#126](https://github.com/udecode/kitcn/pull/126) [`0c88268`](https://github.com/udecode/kitcn/commit/0c88268d8efe4160a734ff119aba859d8b4b3fb3) Thanks [@thuillart](https://github.com/thuillart)! - Preserve real `createdAt` columns during ORM writes so auth records keep schema-defaulted timestamps when created through the generated auth runtime.

## 0.9.2

### Patch Changes

- [#123](https://github.com/udecode/kitcn/pull/123) [`ba8ce1a`](https://github.com/udecode/kitcn/commit/ba8ce1aaf23c7a152047115763d5e4b7a3e84a64) Thanks [@thuillart](https://github.com/thuillart)! - Pass the Convex deployment URL through the SSR server caller instead of falling back to `NEXT_PUBLIC_CONVEX_URL`.

  `createCallerFactory` now derives the `.convex.cloud` URL from `convexSiteUrl` by default and also accepts an explicit `convexUrl` override for frameworks that do not use Next.js env naming.

- [#124](https://github.com/udecode/kitcn/pull/124) [`e19de1d`](https://github.com/udecode/kitcn/commit/e19de1d431857851012f9e5e4a1dfa276700c2cd) Thanks [@thuillart](https://github.com/thuillart)! - fix(auth): persist createdAt for auth records

## 0.9.1

### Patch Changes

- [#116](https://github.com/udecode/kitcn/pull/116) [`2c98958`](https://github.com/udecode/kitcn/commit/2c98958f35953dfb4514ee038d2363e3ac92df88) Thanks [@thuillart](https://github.com/thuillart)! - Fix `createEnv` throwing "Invalid environment variables" during `kitcn dev`. The CLI now sets a `globalThis.__KITCN_CODEGEN__` sentinel before importing Convex files via jiti, and `createEnv` reads that sentinel (instead of `process.env`) to activate a safe fallback — using `options[0]` for `z.enum` fields instead of `""` to avoid false validation failures.

- [#120](https://github.com/udecode/kitcn/pull/120) [`c50c99b`](https://github.com/udecode/kitcn/commit/c50c99b5585721e9e6dccc371c3007def1abd09c) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix SSR auth token refresh when Convex requests `forceRefreshToken` during pending Better Auth session hydration.

  `ConvexAuthProvider` now fetches a fresh JWT instead of reusing the cached SSR token in that forced-refresh path, so Convex can schedule preemptive refresh instead of waiting for an auth failure.

## 0.9.0

### Minor Changes

- [#112](https://github.com/udecode/kitcn/pull/112) [`5bd956c`](https://github.com/udecode/kitcn/commit/5bd956c7d6602d14f3a8f9062638b31879fa1160) Thanks [@zbeyens](https://github.com/zbeyens)! - ORM Discriminator (polymorphic):

  - Drop the experimental query-level `polymorphic` config from `findMany`, `findFirst`, and `findFirstOrThrow`.

  ```ts
  // Before
  await db.query.auditLogs.findMany({
    polymorphic: {
      discriminator: "actionType",
      schema: targetSchema,
      cases: { role_change: "roleChange", document_update: "documentUpdate" },
    },
    limit: 20,
  });

  // After
  const rows = await db.query.auditLogs.findMany({ limit: 20 });
  // Polymorphic data is synthesized from table schema at row.details
  ```

  - Add schema-first polymorphic discriminator columns via `discriminator({ variants, as? })` directly in `convexTable(...)`.
  - Add typed nested read unions at `details` by default (or custom alias via `as`).
  - Add `withVariants: true` as a query shortcut to auto-load one() relations on discriminator tables.
  - Reject invalid branch writes when required variant fields are missing.
  - Reject cross-branch write combinations that set fields outside the active discriminator variant.

### Patch Changes

- [#115](https://github.com/udecode/kitcn/pull/115) [`dab1447`](https://github.com/udecode/kitcn/commit/dab14473a9d2285459add2781fa5fbf9c8bd8569) Thanks [@zbeyens](https://github.com/zbeyens)! - - Improve `kitcn analyze` to respect `convex.json` `functions` paths so non-default layouts are discovered.

## 0.8.4

### Patch Changes

- [#110](https://github.com/udecode/kitcn/pull/110) [`589e2bc`](https://github.com/udecode/kitcn/commit/589e2bc932b78c552233babe37441deae7ebdcb9) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches
  - Fix nested `arrayOf(objectOf(...))` field nullability so `text()` and `text().notNull()` produce distinct schema/data-model types and avoid deploy mismatches.

## 0.8.3

### Patch Changes

- [`7f23a8e`](https://github.com/udecode/kitcn/commit/7f23a8eb512b626b952313b31ed0c2a74b1bee46) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix generated caller support for non-cRPC Convex procedure exports (like `orm.api()` internals such as `migrationStatus`).

- [`02e40e8`](https://github.com/udecode/kitcn/commit/02e40e8610b6f51962326abce95c51277c3d0177) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features

  - Add `polymorphic` query config support for `findMany()`, `findFirst()`, and `findFirstOrThrow()` to synthesize discriminated-union targets from `one()` relations.
  - Support custom target aliases with `polymorphic.as` (default alias is `target`) while preserving discriminated-union narrowing by discriminator value.

  ## Patches

  - Validate polymorphic configs at runtime and throw on discriminator/case mismatches or schema parse failures.
  - Auto-load required polymorphic case relations during synthesis and strip them from results unless explicitly requested via `with`.
  - Reject `pipeline` + `polymorphic` combinations with explicit query-builder errors.

## 0.8.2

### Patch Changes

- [`fb0064b`](https://github.com/udecode/kitcn/commit/fb0064bba994ba0ea9db7d7862a6632f53c9cede) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features
  - Add `getSessionNetworkSignals(ctx, session?)` in `kitcn/auth` to expose session-derived `ip` and `userAgent` for query/mutation middleware and rate-limit guards without per-endpoint HTTP wrappers.

## 0.8.1

### Patch Changes

- [`fc9e17c`](https://github.com/udecode/kitcn/commit/fc9e17c7cf220435451e45eeb2cc08c8d34c7d46) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Fixes
  - Fix `kitcn/plugins/ratelimit` so `limit()` and `check()` no longer call timer APIs (`setTimeout`/`clearTimeout`) during normal execution.
  - Remove `blockUntilReady()`

## 0.8.0

### Minor Changes

- [#105](https://github.com/udecode/kitcn/pull/105) [`9ea3902`](https://github.com/udecode/kitcn/commit/9ea3902a9b37bf1206c99c46d3121b95b10af8e7) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Breaking Changes

  - Moved imports from `kitcn/migration` to `kitcn/orm`.

  ## Features

  - Add `arrayOf(...)` and `objectOf(...)` ORM helpers to reduce `custom(...)` boilerplate for nested array/object schemas.
  - Add schema plugin pipeline to `defineSchema(...)` with builtin/default `aggregatePlugin()` and `migrationPlugin()`.
  - Add optional `plugins` option on `defineSchema` so feature tables can be opt-in.
  - Expose `aggregatePlugin` and `migrationPlugin` from `kitcn/plugins`.
  - Add new `kitcn/plugins/ratelimit` module with Upstash-style APIs (`limit`, `check`, `getRemaining`, `blockUntilReady`, `resetUsedTokens`, dynamic limits, timeout/cache/deny reasons) backed by Convex DB tables.
  - Add `kitcn/plugins/ratelimit/react` with `useRateLimit` hook support for browser-side status checks and retry timing.
  - Add `ratelimitPlugin()` for explicit ratelimit internal table enablement in ORM `defineSchema`.

  Usage:

  - Replace example app rate limiting from `@convex-dev/rate-limiter` component usage to `kitcn/plugins/ratelimit`.
  - Add `/ratelimit` coverage demo and guard test suite for ratelimit coverage definitions.
  - Rewrite rate-limiting docs/template references to the new `kitcn/plugins/ratelimit` package surface.

## 0.7.3

### Patch Changes

- [#103](https://github.com/udecode/kitcn/pull/103) [`590c6e3`](https://github.com/udecode/kitcn/commit/590c6e37d1d61cd4f91b7edba3cd3120206d751a) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Features
  - Add built-in ORM migrations with `defineMigration`, `defineMigrationSet`, and typed migration plan/status helpers.
  - Add generated migration procedures (`migrationRun`, `migrationRunChunk`, `migrationStatus`, `migrationCancel`) to generated server/runtime contracts.
  - Add `kitcn migrate` CLI commands: `create`, `up`, `down`, `status`, and `cancel`.
  - Add migration orchestration to `kitcn dev` and `kitcn deploy` with configurable strictness, waiting, batching, and drift policy.
  - Add safe-bypass migration writes by default with per-migration `writeMode: "normal"` override.
  - Make `kitcn reset` clear migration state/history tables (`migration_state`, `migration_run`) in addition to user and aggregate tables.

## 0.7.2

### Patch Changes

- [`9bccd91`](https://github.com/udecode/kitcn/commit/9bccd91a5ac883fcfe6d1345d1f04ca000dcd62e) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix auth adapter date output regression.

  `getAuth(ctx).api.*` date fields are normalized back to Convex-safe unix millis (`number`) on output, preventing unsupported `Date` values from leaking into raw Convex query/mutation/action returns (for example `auth.api.listOrganizations`).

## 0.7.1

### Patch Changes

- [#99](https://github.com/udecode/kitcn/pull/99) [`ea02427`](https://github.com/udecode/kitcn/commit/ea02427192747fe18859de2e65ede0a96ba7a446) Thanks [@zbeyens](https://github.com/zbeyens)! - ## Patches
  - Fix server auth queries and mutations to refresh stale JWTs and retry once on unauthorized responses before returning unauthenticated results.
  - Fix auth header generation to fall back to Better Auth session-token cookies when JWT identity is unavailable, including secure and custom cookie prefixes.
  - Update `@convex-dev/better-auth` support to `0.10.11` to include upstream cross-domain and Convex plugin auth fixes.
  - Fix `ConvexAuthProvider` token refresh behavior by deduplicating concurrent token fetches and forcing non-throwing internal token fetch calls.
  - Improve SSR/OTT auth stability in `ConvexAuthProvider` so session hydration and one-time-token URL handling avoid transient unauthorized states.
  - Align reactive auth query subscriptions with `skipUnauth` semantics so unauthorized subscription updates resolve to `null` instead of triggering unauthorized callbacks.
  - Ensure `ConvexAuthProvider` auth state follows confirmed Better Auth session state so stale JWTs do not keep authenticated state after sign-out.
  - Fix auth adapter date output normalization to return `Date` values for date fields.
  - Fix Next.js auth token forwarding by removing body-related headers from internal token fetch requests.
  - Prefer `better-auth/minimal` imports in auth runtime/type paths where available

## 0.7.0

### Minor Changes

- [#97](https://github.com/udecode/kitcn/pull/97) [`4f83203`](https://github.com/udecode/kitcn/commit/4f83203381bbd5030db77b76baed47db29d25057) Thanks [@{](https://github.com/{)! - ## Auth

  ### Breaking changes

  - Redesign auth trigger API from flat callbacks to nested `{ create, update, delete, change }` shape matching ORM `defineTriggers` pattern.
  - Replace split auth exports (`getAuthOptions` + `authTriggers`) with one default `defineAuth((ctx) => ({ ...options, triggers }))` contract.
  - Drop generated trigger procedures (`beforeCreate`, `onCreate`, `beforeUpdate`, `onUpdate`, `beforeDelete`, `onDelete`); triggers now run inline in the same CRUD transaction.
  - Add `ctx` as second parameter to all trigger callbacks for access to mutation context.
  - Add `before` hook return contract: `void` (continue unchanged), `{ data }` (shallow merge into payload), `false` (cancel write).
  - Add unified `change(change, ctx)` handler with discriminated union `{ operation, id, newDoc, oldDoc }`.
  - Rename `createApi` option `skipValidation` to `validateInput`; default is now `validateInput: false`.
  - Rename auth package entrypoints from hyphenated to namespaced paths:
    - `kitcn/auth-client` -> `kitcn/auth/client`
    - `kitcn/auth-config` -> `kitcn/auth/config`
    - `kitcn/auth-nextjs` -> `kitcn/auth/nextjs`
  - Move HTTP auth helpers to `kitcn/auth/http`:
    - `authMiddleware` and `registerRoutes` now import from `kitcn/auth/http` (not `kitcn/auth`).
    - `kitcn/auth/http` auto-installs the Convex-safe `MessageChannel` polyfill. You can remove your own `http-polyfills.ts` file.

  ```ts
  // Before
  export const getAuthOptions = (ctx) => ({ ...options });
  export const authTriggers = { user: { onCreate: async (ctx, user) => {} } };

  // After
  import { defineAuth } from "./generated/auth";

  export default defineAuth((ctx) => ({
    ...options,
    triggers: {

        create: {
          before: async (data, ctx) => ({ data: { ...data, role: "user" } }),
          after: async (doc, ctx) => {},
        },
        update: {
          after: async (newDoc, ctx) => {},
        },
        change: async (change, ctx) => {
          // change.operation: 'insert' | 'update' | 'delete'
          // change.id, change.newDoc, change.oldDoc
        },
      },
    },
  }));
  ```

  ```ts
  // Before
  import { getAuth } from "./auth";
  createApi(schema, getAuth, { skipValidation: true });

  // After
  import { getAuth } from "./generated/auth";
  createApi(schema, getAuth); // validateInput defaults to false
  createApi(schema, getAuth, { validateInput: true });
  ```

  ```ts
  // Before
  import { convexClient } from "kitcn/auth-client";
  import { getAuthConfigProvider } from "kitcn/auth-config";
  import { convexBetterAuth } from "kitcn/auth-nextjs";

  // After
  import { convexClient } from "kitcn/auth/client";
  import { getAuthConfigProvider } from "kitcn/auth/config";
  import { convexBetterAuth } from "kitcn/auth/nextjs";
  ```

  ```ts
  // Before
  import "../lib/http-polyfills";
  import { authMiddleware, registerRoutes } from "kitcn/auth";

  // After
  import { authMiddleware, registerRoutes } from "kitcn/auth/http";
  ```

  ### Features

  - Add `defineAuth` helpers to unify codegen and non-codegen auth setup.
  - Add always-generated Better Auth runtime contract in `convex/functions/generated/auth.ts`.
  - Add generated `defineAuth` export in `convex/functions/generated/auth.ts` for inference-first `auth.ts` authoring.
  - Support ORM-aware auth writes (insert/update/delete go through ORM when available).

  ## Codegen

  ### Breaking changes

  - Drop generated internal auth calls from `internal.auth.*`; use `internal.generated.*`.
  - Drop manual `initCRPC.dataModel().context(...)` bootstrap; import generated `initCRPC` from `convex/functions/generated/server`.
  - Drop manual `ctx.runQuery`/`ctx.runMutation` for inter-procedure calls; use per-module `create<Module>Handler`/`create<Module>Caller` from `convex/functions/generated/<module>.runtime`.
  - Require `export const httpRouter = router(...)` in `convex/functions/http.ts` so codegen can include typed HTTP routes in generated API output.

  ```ts
  // Before
  import { initCRPC } from "kitcn/server";
  import type { DataModel } from "./_generated/dataModel";

  const c = initCRPC
    .dataModel<DataModel>()
    .context({
      query: (ctx) => withOrm(ctx),
      mutation: (ctx) => withOrm(ctx),
    })
    .meta<{
      auth?: "optional" | "required";
      role?: "admin";
      rateLimit?: string;
    }>()
    .create();

  // After
  import { initCRPC } from "./generated/server";

  const c = initCRPC
    .meta<{
      auth?: "optional" | "required";
      role?: "admin";
      rateLimit?: string;
    }>()
    .create();
  ```

  ```ts
  // Before (http.ts)
  export const appRouter = router({
    health,
    todos: todosRouter,
  });
  export default createHttpRouter(app, appRouter);

  // After (http.ts)
  export const httpRouter = router({
    health,
    todos: todosRouter,
  });
  export default createHttpRouter(app, httpRouter);
  ```

  ### Features

  - Add generated `convex/functions/generated/` directory:
    - `generated/server.ts` — ORM exports (`orm`, `withOrm`, `scheduledMutationBatch`, `scheduledDelete`), wrapped ctx types (`OrmCtx`, `QueryCtx`, `MutationCtx`, `GenericCtx`), prewired `initCRPC`.
    - `generated/auth.ts` — `defineAuth`, `getAuth`, auth runtime contract.
    - `generated/<module>.runtime.ts` — per-module scoped caller/handler factories.
  - Add per-module `create<Module>Handler(ctx)` (DEFAULT) for zero-overhead internal composition in queries/mutations. Bypasses input validation, middleware, and output validation. Same transaction, no serialization.
  - Add per-module `create<Module>Caller(ctx)` for actions and HTTP routes only. Goes through validation + middleware.
    - Root calls in `ActionCtx` dispatch via `ctx.runQuery` / `ctx.runMutation`.
    - Direct action calls are explicit under `caller.actions.*` and dispatch via `ctx.runAction`.
    - Scheduled calls are available under `caller.schedule.*`:
      - `caller.schedule.now.<mutation|action>(input)` (alias for `after(0)`)
      - `caller.schedule.after(ms).<mutation|action>(input)`
      - `caller.schedule.at(dateOrMs).<mutation|action>(input)`
      - `caller.schedule.cancel(jobId)`
    - Auto-generate procedure registry per module from cRPC exports (public + internal).
    - Enforce call matrix: query ctx → root queries only; mutation ctx → root queries+mutations plus `schedule`; action ctx → root queries+mutations plus `actions` and `schedule`.
    - Reserve module export names `actions` and `schedule` in runtime callers (codegen throws explicit conflict error).
  - Never use `ctx.runQuery`/`ctx.runMutation` directly — always use `create<Module>Handler` or `create<Module>Caller`.
  - Keep manual `initCRPC` setup from `kitcn/server` supported for apps not using codegen.
  - Add `kitcn.json` support (plus `--config <path>`) for codegen/dev defaults, feature toggles (`api`, `auth`), and passthrough Convex arg presets.

  ```ts
  // Before — manual runQuery/runMutation with function references
  import { api, internal } from "./_generated/api";

  const result = await ctx.runQuery(api.todos.list, { limit: 10 });
  await ctx.runMutation(internal.todoInternal.create, { userId, ...input });

  // After (query/mutation) — per-module handler, zero overhead, same transaction
  import { createSeedHandler } from "./generated/seed.runtime";

  const handler = createSeedHandler(ctx);
  await handler.cleanupSeedData();
  await handler.seedUsers();
  ```

  ```ts
  // After (action/HTTP) — per-module caller, validation + middleware
  import { createSeedCaller } from "./generated/seed.runtime";

  const caller = createSeedCaller(ctx);
  await caller.generateSamplesBatch({ count: 5, userId, batchIndex: 0 });
  ```

  ### Patches

  - Add generated internal API refs for async ORM workers and generated auth handlers under `internal.generated`.

  ## API Types

  ### Breaking changes

  - Drop separate `meta` arguments in context/proxy/caller/auth setup APIs; pass only `api`.
  - Drop the `@convex/types` workflow and use generated `@convex/api` types.
  - Drop manual codegen outputs `convex/shared/meta.ts` and `convex/shared/types.ts` in favor of generated `convex/shared/api.ts`.

  ```ts
  // Before
  import type { Api, ApiInputs, ApiOutputs } from "@convex/types";
  createCRPCContext({ api, meta, convexSiteUrl });
  createServerCRPCProxy({ api, meta });

  // After
  import type { Api, ApiInputs, ApiOutputs } from "@convex/api";
  createCRPCContext({ api, convexSiteUrl });
  createServerCRPCProxy({ api });
  ```

  ```ts
  // Before
  import type { Select, Insert } from "./shared/types";

  // After
  import type { Select, Insert } from "@convex/api";
  ```

  ### Features

  - Add a single generated `@convex/api` surface that exports `api`, `Api`, `ApiInputs`, and `ApiOutputs` for client typing.
  - Add optional generated table helpers (`TableName`, `Select`, `Insert`) when schema exports `tables`.

  ### Patches

  - Add Date-safe API inference from cRPC exports so `z.date()` fields stay typed as `Date` in generated API input/output types.
  - Improve generated `Api` typing so HTTP router types are embedded in `typeof api`, reducing manual `<Api>` generics in common setup calls.
  - Build function metadata from the generated `api` object at runtime, eliminating separate `meta` plumbing in cRPC React/RSC/server helpers.
  - Filter internal/private namespaces from generated client/caller type surfaces (e.g. `_http`, `_generated`-style keys).
  - Improve lazy caller invalid-path errors with clearer failure messages.

  ```ts
  // Before
  import type { Api } from "@convex/api";

  export const { CRPCProvider, useCRPC, useCRPCClient } =
    createCRPCContext<Api>({
      api,
      convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
    });

  export const crpc = createServerCRPCProxy<Api>({ api });

  // After
  export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
    api,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });

  export const crpc = createServerCRPCProxy({ api });
  ```

  ## Dependency

  ### Breaking changes

  - Bump Convex minimum peer dependency to `>=1.32`.

  ## ORM

  ### Breaking changes

  - Drop manual `convex/lib/orm.ts` server wiring; import `orm`/`withOrm` from `convex/functions/generated/server`.
  - Drop `OrmQueryCtx`/`OrmMutationCtx`; import wrapped `QueryCtx`/`MutationCtx` from `convex/functions/generated/server`.
  - Table-level lifecycle registration in `convexTable(..., extraConfig)` is removed.
  - Lifecycle helpers `onInsert`, `onUpdate`, `onDelete`, and `onChange` are removed from `kitcn/orm`.

  ```ts
  // Before
  import type { OrmQueryCtx, OrmMutationCtx } from "../lib/orm";
  import { withOrm } from "../lib/orm";

  // After
  import type { QueryCtx, MutationCtx } from "./generated/server";
  import { withOrm } from "./generated/server";
  ```

  ### Features

  - ORM triggers are schema-level only and must be exported as `export const triggers = defineTriggers(relations, { ... })`.
  - Trigger definitions use object hooks per table:
    - `create.before` / `create.after`
    - `update.before` / `update.after`
    - `delete.before` / `delete.after`
    - `change(change, ctx)`
  - `before` return contract is:
    - `void` => continue unchanged
    - `{ data }` => shallow merge into write payload
    - `false` => cancel write via `TriggerCancelledError`
  - Generated server wiring includes `triggers` only when `schema.ts` exports both `relations` and `triggers`.
  - Add `createOrm({ schema, triggers })` support for generated and manual setups.
  - Add `ctx.orm.withoutTriggers(callback)` to bypass trigger hooks for bulk operations (e.g. data resets, migrations). The callback receives a trigger-free ORM instance scoped to the same transaction.

  ## Aggregates

  ### Features

  - Add built-in aggregate-core runtime (B-tree backed).
  - Add `aggregateIndex` schema builder for declaring ORM count and aggregate index coverage:
    - `aggregateIndex(name).on(field1, field2)` — filter key fields.
    - `aggregateIndex(name).all()` — unfiltered (global) metrics.
    - Chainable metric methods: `.count(field)`, `.sum(field)`, `.avg(field)`, `.min(field)`, `.max(field)`.

  ```ts
  // Schema declaration
  const orders = convexTable(
    "orders",
    { orgId: text(), amount: integer(), score: integer() },
    (t) => [
      aggregateIndex("by_org")
        .on(t.orgId)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
      aggregateIndex("all_metrics").all().sum(t.amount).count(t.orgId),
    ]
  );
  ```

  - Add `ctx.orm.query.<table>.count()` and `ctx.orm.query.<table>.count({ where, select, orderBy, skip, take, cursor })` for O(1) filtered counts backed by `aggregateIndex`. Windowed count (`skip`/`take`/`cursor`) counts rows within a window defined by ordering and bounds.
  - Add `ctx.orm.query.<table>.aggregate({ where, _count, _sum, _avg, _min, _max, orderBy, skip, take, cursor })` for Prisma-style aggregate blocks with optional windowed bounds.
  - Add safe finite `OR` rewrite for aggregate/count `where` — `OR` branches collapse when each is index-plannable (differs on one scalar eq/in/isNull field).
  - Add `findMany({ distinct })` deterministic `DISTINCT_UNSUPPORTED` error directing to `select().distinct({ fields })` pipeline.
  - Add relation `_count` loading via `with: { _count: { todos: true } }` with optional filtered variants.
  - Add through-filtered relation `_count` for `through()` relations using indexed lookups + no-scan-safe filter validation.
  - Add mutation `returning({ _count })` for insert/update/delete via split selection + relation count loading.
  - Add Prisma-style `_sum` nullability: returns `null` for empty sets or all-null field values (instead of `0`).
  - Add `groupBy()` to the ORM query builder with Prisma-style `by`, `_count`, `_sum`, `_avg`, `_min`, `_max` blocks. Requires finite `where` constraints (`eq`/`in`/`isNull`) on every `by` field — no `having`/`orderBy`/`skip`/`take`/`cursor` in v1.

  ```ts
  // Count
  const total = await ctx.orm.query.todos.count({ where: { projectId } });

  // Aggregate
  const stats = await ctx.orm.query.orders.aggregate({
    where: { orgId: "org-1" },
    _count: { _all: true },
    _sum: { amount: true },
    _avg: { amount: true },
  });

  // Relation _count
  const users = await ctx.orm.query.user.findMany({
    with: { _count: { todos: { where: { completed: true } } } },
  });
  ```

  - Add generated `aggregateBackfill` and `aggregateBackfillStatus` procedures for index building and status polling.
  - Add ORM internal storage tables (`aggregate_bucket`, `aggregate_member`, `aggregate_extrema`, `aggregate_state`, `aggregate_rank_tree`, `aggregate_rank_node`) auto-injected by `defineSchema`. Convex rejects table names starting with `_`, so internals use the `aggregate_` prefix.
  - Add `rankIndex` schema builder for declaring ranked/ordered aggregate indexes:
    - `rankIndex(name).partitionBy(field1, field2).orderBy(t.score).sum(t.amount)` — partitioned rank index with optional weighted sum.
    - `rankIndex(name).all().orderBy(t.score)` — unpartitioned (global) rank index.
    - `orderBy()` supports `integer()`/`timestamp()`/`date()` columns only.
  - Add `db.query.<table>.rank(indexName, { where })` query builder with O(log n) operations:
    - `.count()`, `.sum()` — aggregate reads.
    - `.at(offset)` — positional access by rank.
    - `.indexOf({ id })` — rank lookup by document ID.
    - `.paginate({ cursor, limit })` — cursor-based ranked pagination.
    - `.min()`, `.max()`, `.random()` — extrema and random sampling.
  - Add backfill support for rank indexes alongside metric indexes (shared `aggregateBackfill`/`aggregateBackfillStatus` procedures).

  ## CLI

  ### Features

  - Add `kitcn analyze` command with two modes:
    - Default **hotspot** mode: per-entry bundle analysis showing output size, dependency size, and handler counts. Interactive TUI with keyboard navigation, live filtering, sort cycling, detail panes (handlers/packages/inputs), and file watch for auto-refresh.
    - `--deploy` mode: single-isolate bundle analysis matching Convex deploy bundling. Reports total size, top inputs, and top packages.
    - `--fail-mb <n>` for CI gating: exit 1 if largest entry or chunk exceeds threshold.
    - Positional regex argument to filter entry points (e.g. `kitcn analyze "auth.*"`).
  - Add `kitcn deploy` command that wraps `convex deploy` with automatic post-deploy aggregate backfill.
  - Add `kitcn aggregate rebuild` command for full aggregate index rebuild.
  - Add `kitcn aggregate backfill` command for resume-mode backfill (no clear/rebuild).
  - Add automatic aggregate backfill to `kitcn dev` (auto-resumes on startup, non-blocking).
  - Add `aggregateBackfill` config section in `kitcn.json` for both `dev` and `deploy`:
    - `enabled`: `"auto"` (skip if function not found), `"on"`, or `"off"`.
    - `wait`: poll until all indexes READY or timeout (default `true`).
    - `batchSize`, `pollIntervalMs`, `timeoutMs`: tuning knobs.
    - `strict`: exit 1 on failure/timeout (default `true` for deploy, `false` for dev).
  - Add CLI flags for aggregate backfill overrides: `--backfill`, `--backfill-wait`, `--backfill-strict`, `--backfill-batch-size`, `--backfill-timeout-ms`, `--backfill-poll-ms`.
  - Add `kitcn reset --yes` command: calls `generated/server:reset`. Supports `--before <fn>` and `--after <fn>` hooks.

## 0.6.4

### Patch Changes

- [#93](https://github.com/udecode/kitcn/pull/93) [`8153811`](https://github.com/udecode/kitcn/commit/81538110000a33855f1b5bb9b66f613604cd8388) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix `findFirst` now returns `null` instead of `undefined` when no result is found. Fix `.returning()` crash on nullable timestamp fields.

## 0.6.3

### Patch Changes

- [#88](https://github.com/udecode/kitcn/pull/88) [`207d62f`](https://github.com/udecode/kitcn/commit/207d62f19912ccf355ff4c5e9ec5fee56ecf58cb) Thanks [@zbeyens](https://github.com/zbeyens)! - ORM/RLS update: async policy callbacks, safe empty `inArray([])` handling in query + mutation paths, and runtime+types support for system fields (`t.id`) in `extraConfig` callbacks.

## 0.6.2

### Patch Changes

- [#86](https://github.com/udecode/kitcn/pull/86) [`49098fa`](https://github.com/udecode/kitcn/commit/49098fa5919b4a9c4a3e73b989ab55d897df02c3) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix Better Auth HTTP adapter error handling to preserve auth error status/code instead of surfacing unexpected 500s.

## 0.6.1

### Patch Changes

- [#82](https://github.com/udecode/kitcn/pull/82) [`aed9972`](https://github.com/udecode/kitcn/commit/aed9972f5869949cfc02ca2eb6bfcb7e57fb754d) Thanks [@zbeyens](https://github.com/zbeyens)! - Migration example: https://github.com/udecode/kitcn/pull/82

  Added `AnyColumn` type export for self-referencing foreign keys (mirrors Drizzle's `AnyPgColumn`).

  ```ts
  import { type AnyColumn, convexTable, text } from "kitcn/orm";

  export const comments = convexTable("comments", {
    body: text().notNull(),
    parentId: text().references((): AnyColumn => comments.id, {
      onDelete: "cascade",
    }),
  });
  ```

## 0.6.0

### Minor Changes

- [#75](https://github.com/udecode/kitcn/pull/75) [`54eeb6d`](https://github.com/udecode/kitcn/commit/54eeb6d68909737b21b3dddfa860de0fc84e7924) Thanks [@zbeyens](https://github.com/zbeyens)! - - Added `kitcn/orm` as the recommended DB API surface (Drizzle-style schema/query/mutation API).

  - Docs: [/docs/db/orm](https://www.kitcn.dev/docs/db/orm)
  - Migration guide: [/docs/migrations/convex](https://www.kitcn.dev/docs/migrations/convex)

  ## Breaking changes

  - `createAuth(ctx)` is removed. Use `getAuth(ctx)` for query/mutation/action/http.

  ```ts
  // Before
  export const createAuth = (ctx: ActionCtx) =>
    betterAuth(createAuthOptions(ctx));
  app.use(authMiddleware(createAuth));

  // After
  export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));
  app.use(authMiddleware(getAuth));
  ```

  - `authClient.httpAdapter` is no longer needed. Use context-aware `adapter(...)`.

  ```ts
  // Before
  database: authClient.httpAdapter(ctx);

  // After
  database: authClient.adapter(ctx, getAuthOptions);
  ```

  - cRPC templates now use `ctx.orm` (not `ctx.table`) and string IDs at the API boundary.

  ```ts
  // Before
  input: z.object({ id: zid("user") });
  const user = await ctx.table("user").get(input.id);

  // After
  input: z.object({ id: z.string() });
  const user = await ctx.orm.query.user.findFirst({ where: { id: input.id } });
  ```

  - cRPC/auth context ID types are now string-based at the procedure boundary (`ctx.userId`, params, input/output IDs).

  ```ts
  // Before
  const userId: Id<"user"> = ctx.userId;

  // After
  const userId: string = ctx.userId;
  ```

  - `getAuthConfigProvider` should be imported from `kitcn/auth/config`.
    (instead of legacy `@convex-dev/better-auth/auth-config`, or old `kitcn/auth` docs)

  ```ts
  // Before
  import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

  // After
  import { getAuthConfigProvider } from "kitcn/auth/config";
  ```

  - Remove legacy app deps: `@convex-dev/better-auth`, `convex-ents`, and `convex-helpers`.

  ```sh
  bun remove @convex-dev/better-auth convex-ents convex-helpers
  ```

  - `convex-helpers` primitives are no longer part of the template path.
    Replace `zid(...)` with `z.string()`, and remove `customMutation`/`Triggers` wrappers in favor of:
    - `initCRPC.create()` defaults
    - trigger declarations in schema table config
  - ORM row shape is `id`/`createdAt` (not `_id`/`_creationTime`) at the app boundary.
    Update UI/client code and shared types accordingly.

  ## Features

  - `initCRPC.create()` supports default Convex builders, so old manual wiring is usually unnecessary.

  ```ts
  // Before (remove this boilerplate)
  const c = initCRPC.create({
    query,
    internalQuery,
    mutation,
    internalMutation,
    action,
    internalAction,
    httpAction,
  });
  const internalMutationWithTriggers = customMutation(...);

  // After
  const c = initCRPC.create();
  // Triggers are declared in schema table config.
  ```

  - cRPC now supports wire transformers end-to-end (Date codec included by default).
    - Supported in `initCRPC.create({ transformer })`, HTTP proxy, server caller, React client, and RSC query client.

  ```ts
  const c = initCRPC.create({ transformer: superjson });

  const http = createHttpProxy({
    convexSiteUrl,
    routes,
    transformer: superjson,
  });
  ```

  - Auth setup supports `triggers` + `context` in `createClient`, and `context` in `createApi`.

  ```ts
  const authClient = createClient({
    authFunctions,
    schema,
    triggers,
    context: getOrmCtx,
  });

  const authApi = createApi(schema, getAuth, {
    context: getOrmCtx,
  });
  ```

  - `createEnv` can replace manual env parsing/throw boilerplate.

  ```ts
  // Before
  export const getEnv = () => {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) throw new Error("Invalid environment variables");
    return parsed.data;
  };

  // After
  export const getEnv = createEnv({ schema: envSchema });
  ```

  - Added new public server helpers: context guards (`isActionCtx`/`requireActionCtx`, etc.).

  ## Patched

  - Updated template and docs to use:
    - `kitcn/auth/client` (`convexClient`)
    - `kitcn/auth/config` (`getAuthConfigProvider`)
  - Example app migration now reflects the current user-facing API (`ctx.orm`, `getAuth(ctx)`, simpler `initCRPC.create()`).
  - cRPC/server error handling now normalizes known causes into deterministic CRPC errors:
    - `OrmNotFoundError` -> `NOT_FOUND`
    - `APIError` status/statusCode -> mapped cRPC code
    - standard `Error.message`/stack preservation on wrapped errors
  - HTTP route validation errors (params/query/body/form) now return `BAD_REQUEST` consistently.
  - `createAuthMutations` now throws `AUTH_STATE_TIMEOUT` when auth token never appears after sign-in/up flow.
  - `getSession` now returns `null` when no session id is present (instead of attempting invalid DB lookups).
  - CLI reliability improvements (`kitcn dev/codegen/env`): argument parsing and entrypoint resolution are more robust across runtime/symlink setups.

  ```ts
  // Client import migration
  // Before
  import { convexClient } from "@convex-dev/better-auth/client/plugins";

  // After
  import { convexClient } from "kitcn/auth/client";
  ```

  ```ts
  // Retry only non-deterministic errors
  import { isCRPCError } from "kitcn/crpc";

  retry: (count, error) => !isCRPCError(error) && count < 3;
  ```

## 0.5.8

### Patch Changes

- [#73](https://github.com/udecode/kitcn/pull/73) [`232d126`](https://github.com/udecode/kitcn/commit/232d12697602e5c1cb3965b6e12cfe9b880d3c5c) Thanks [@zbeyens](https://github.com/zbeyens)! - Support multiple WHERE conditions in `update()` for Better Auth organization plugin compatibility.
  - Multiple AND conditions with equality checks now work
  - Validates exactly 1 document matches before updating (prevents accidental bulk updates)
  - OR conditions and non-eq operators still require `updateMany()`

## 0.5.7

### Patch Changes

- [#61](https://github.com/udecode/kitcn/pull/61) [`7e63e54`](https://github.com/udecode/kitcn/commit/7e63e541fc2853d8d1d45e4f1fb7db3f82e0592c) Thanks [@zbeyens](https://github.com/zbeyens)! - Auth mutation hooks now properly trigger `onError` when Better Auth returns errors (401, 422, etc.).

  ```tsx
  // Before: onSuccess always ran, even on errors
  // After: onError fires on auth failures

  const signUp = useMutation(
    useSignUpMutationOptions({
      onSuccess: () => router.push("/"), // Only on success now
      onError: (error) => toast.error(error.message), // Fires on auth errors
    })
  );
  ```

  New exports: `AuthMutationError` class and `isAuthMutationError` type guard for error handling.

## 0.5.6

### Patch Changes

- [`fdeae26`](https://github.com/udecode/kitcn/commit/fdeae26ef81b46dc1334a4940814628d398659d9) Thanks [@zbeyens](https://github.com/zbeyens)! - - Support Convex 1.31.6
  - Missing `jotai` dependency

## 0.5.5

### Patch Changes

- [#56](https://github.com/udecode/kitcn/pull/56) [`b34a396`](https://github.com/udecode/kitcn/commit/b34a39621af83c6b6f2b2e6e11e35997981c5bb4) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `ConvexProviderWithAuth` for `@convex-dev/auth` users (React Native):

  ```tsx
  import { ConvexProviderWithAuth } from "kitcn/react";

  <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
    <App />
  </ConvexProviderWithAuth>;
  ```

  Enables `skipUnauth` queries, `useAuth`, and conditional rendering components.

## 0.5.4

### Patch Changes

- [#54](https://github.com/udecode/kitcn/pull/54) [`4321118`](https://github.com/udecode/kitcn/commit/43211189285333f998cef34c7726efa1735837aa) Thanks [@zbeyens](https://github.com/zbeyens)! - Support nested file structures in meta generation:

  ```
  convex/functions/
    todos.ts           → crpc.todos.*
    items/queries.ts   → crpc.items.queries.*
  ```

  - Organize functions in subdirectories
  - `_` prefixed files/directories are excluded

## 0.5.3

### Patch Changes

- [#44](https://github.com/udecode/kitcn/pull/44) [`ea6bfce`](https://github.com/udecode/kitcn/commit/ea6bfce4fb20dda7afdad4a9d0663aa7021e2a88) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix queries throwing without auth provider.

## 0.5.2

### Patch Changes

- [`185f496`](https://github.com/udecode/kitcn/commit/185f496c6b64e70cba96adcfe25e459c8c559a92) Thanks [@zbeyens](https://github.com/zbeyens)! - Add `staticQueryOptions` method to CRPC proxy for non-hook usage in event handlers.

- [`2288076`](https://github.com/udecode/kitcn/commit/228807652c04df9bdb1e9f054a0664d35a643ff2) Thanks [@zbeyens](https://github.com/zbeyens)! - Fix `MiddlewareBuilder` generic parameter mismatch causing typecheck failures when using reusable middleware with `.use()`. Factory functions now correctly pass through the `TInputOut` parameter added in v0.5.1.

## 0.5.1

### Patch Changes

- [#39](https://github.com/udecode/kitcn/pull/39) [`ede0d47`](https://github.com/udecode/kitcn/commit/ede0d473ed8f7254f44b9edb86172cfd3c900857) Thanks [@zbeyens](https://github.com/zbeyens)! - Middleware now receives `input` and `getRawInput` parameters:

  ```ts
  publicQuery
    .input(z.object({ projectId: zid("projects") }))
    .use(async ({ ctx, input, next }) => {
      // input.projectId is typed!
      const project = await ctx.db.get(input.projectId);
      return next({ ctx: { ...ctx, project } });
    });
  ```

  - Middleware after `.input()` receives typed input
  - Middleware before `.input()` receives `unknown`
  - `getRawInput()` returns raw input before validation
  - `next({ input })` allows modifying input for downstream middleware
  - Non-breaking: existing middleware works unchanged

## 0.5.0

### Minor Changes

- [#34](https://github.com/udecode/kitcn/pull/34) [`e2a2f62`](https://github.com/udecode/kitcn/commit/e2a2f6258d75007c39b6dc86d6000e0a9460052d) Thanks [@zbeyens](https://github.com/zbeyens)! - URL searchParams now auto-coerce to numbers and booleans based on Zod schema type, eliminating `z.coerce.*` boilerplate:

  ```ts
  // Before: Required z.coerce.* boilerplate
  .searchParams(z.object({
    page: z.coerce.number().optional(),
    active: z.coerce.boolean().optional(),
  }))

  // After: Standard Zod schemas work directly
  .searchParams(z.object({
    page: z.number().optional(),
    active: z.boolean().optional(),
  }))
  ```

  Coercion behavior:

  - `z.number()` - parses string to number (`"5"` → `5`)
  - `z.boolean()` - parses `"true"`/`"1"` → `true`, everything else → `false`
  - Works with `.optional()`, `.nullable()`, `.default()` wrappers
  - `z.coerce.*` still works if preferred

  ### Vanilla CRPC client

  `useCRPCClient()` now returns a typed proxy for direct procedural calls without React Query:

  ```ts
  const client = useCRPCClient();

  // Convex functions
  const user = await client.user.get.query({ id });
  await client.user.update.mutate({ id, name: "test" });

  // HTTP endpoints
  const todos = await client.http.todos.list.query();
  await client.http.todos.create.mutate({ title: "New" });
  ```

  Useful for event handlers, effects, or when you don't need caching/deduplication.

  **Breaking:** `useCRPCClient()` return type changed from `ConvexReactClient` to typed proxy. Use `useConvex()` (now exported from `kitcn/react`) for raw client access.

  ### Error handling: `isCRPCError` helper

  New unified error check for retry logic - returns true for any deterministic CRPC error (Convex 4xx or HTTP 4xx):

  ```ts
  import { isCRPCError } from "kitcn/crpc";

  // In query client config
  retry: (failureCount, error) => {
    if (isCRPCError(error)) return false; // Don't retry client errors
    return failureCount < 3;
  };
  ```

## 0.4.0

### Minor Changes

- [#31](https://github.com/udecode/kitcn/pull/31) [`618ec38`](https://github.com/udecode/kitcn/commit/618ec386eaf7e893d87570616871386953789753) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Client: Hybrid API

  The HTTP client now uses a hybrid API combining tRPC-style JSON body at root level with explicit `params`/`searchParams` for URL data.

  #### Breaking Changes

  - **Query/mutation args restructured**: Path params and search params now use explicit keys instead of flat merging
    - Before: `queryOptions({ id: '123', limit: 10 })`
    - After: `queryOptions({ params: { id: '123' }, searchParams: { limit: '10' } })`
  - **Client options in args**: `fetch`, `init`, `headers` go in args (1st param)
    - `queryOptions(args?, queryOpts?)` - args = params/searchParams/form/headers/etc
    - `mutationOptions(mutationOpts?)` - client opts go in `mutate(args)` call
  - **Server handler `query` renamed to `searchParams`**: Consistent naming between client and server
    - Before: `.query(async ({ query }) => { query.limit })`
    - After: `.query(async ({ searchParams }) => { searchParams.limit })`

  #### New Features

  - **Explicit input args**: `params`, `searchParams` keys for clear separation
  - **JSON body at root**: Non-reserved keys spread at root level (tRPC-style): `mutate({ title: 'New' })`
  - **Typed form uploads**: `.form()` builder method for typed FormData schemas (client args + server handler)
  - **Client options in args**: Per-request `fetch`, `init`, `headers` in args (1st param)
  - **mutationOptions for GET**: Use `useMutation` for one-time fetches (exports/downloads) without caching

  #### Migration

  ```tsx
  // Client: Before
  crpc.http.todos.list.queryOptions({ limit: 10 });
  updateTodo.mutate({ id, completed: true });
  deleteTodo.mutate({ id });

  // Client: After
  crpc.http.todos.list.queryOptions({ searchParams: { limit: "10" } });
  updateTodo.mutate({ params: { id }, completed: true });
  deleteTodo.mutate({ params: { id } });

  // Headers go in args (1st param)
  // Before: queryOptions({ header: { 'X-Custom': 'value' } })
  // After:
  crpc.http.todos.list.queryOptions({ headers: { 'X-Custom': 'value' } });

  // Mutations: client opts in mutate args
  updateTodo.mutate({ params: { id }, completed: true, headers: { 'X-Custom': 'value' } });

  // Server: Before
  .query(async ({ query }) => ({ limit: query.limit }))

  // Server: After
  .query(async ({ searchParams }) => ({ limit: searchParams.limit }))

  // Server: Typed form (new)
  .form(z.object({ file: z.instanceof(Blob) }))
  .mutation(async ({ form }) => {
    // form.file is typed as Blob
  })
  ```

## 0.3.1

### Patch Changes

- [#29](https://github.com/udecode/kitcn/pull/29) [`2638311`](https://github.com/udecode/kitcn/commit/26383112835605dd806151832edfbcd98e1e75b2) Thanks [@zbeyens](https://github.com/zbeyens)! - - Move hono to peerDependencies (type-only imports in package)
  - Add stale cursor auto-recovery for `useInfiniteQuery` - automatically recovers from stale pagination cursors after WebSocket reconnection without losing scroll position

## 0.3.0

### Minor Changes

- [#27](https://github.com/udecode/kitcn/pull/27) [`6309e68`](https://github.com/udecode/kitcn/commit/6309e688b3f92b07877966a6f6f7929f2cb7ade0) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Router: Hono Integration

  The HTTP router now wraps a Hono app, enabling full middleware support.

  #### New Features

  - **Hono-based routing**: `createHttpRouter(app, router)` accepts a Hono app
  - **Auth middleware**: `authMiddleware(createAuth)` for Better Auth routes
  - **Hono context in handlers**: Access `c.json()`, `c.text()`, `c.redirect()`, `c.req`
  - **Non-JSON response support**
  - **CLI watch improvements**: Watches `routers/**/*.ts` and `http.ts` for changes

  #### Breaking Changes

  - **Removed `response()` mode**: Return `Response` directly from handler
  - **Removed per-procedure `cors()`**: Use Hono's `cors()` middleware
  - **CORS via Hono**: `app.use('/api/*', cors())` instead of router options
  - **Handler signature**: `{ ctx, c, input, params, query }` - `c` is Hono Context

  #### Migration

  Before:

  ```ts
  import { registerRoutes } from "kitcn/auth/http";
  import { registerCRPCRoutes } from "kitcn/server";
  import { httpRouter } from "convex/server";

  const http = httpRouter();

  registerRoutes(http, createAuth);

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: {
      allowedOrigins: [process.env.SITE_URL!],
      allowCredentials: true,
    },
  });

  export default http;
  ```

  After:

  ```ts
  import { authMiddleware } from "kitcn/auth/http";
  import { createHttpRouter } from "kitcn/server";
  import { Hono } from "hono";
  import { cors } from "hono/cors";

  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: process.env.SITE_URL!,
      credentials: true,
    })
  );

  app.use(authMiddleware(createAuth));

  export const appRouter = router({
    health,
    todos: todosRouter,
  });

  export default createHttpRouter(app, appRouter);
  ```

  #### Handler Examples with `c`

  cRPC handlers now receive `c` (Hono Context) for custom responses:

  ```ts
  // File download with custom headers
  export const download = authRoute
    .get("/api/todos/export/:format")
    .params(z.object({ format: z.enum(["json", "csv"]) }))
    .query(async ({ ctx, params, c }) => {
      const todos = await ctx.runQuery(api.todos.list, {});

      c.header(
        "Content-Disposition",
        `attachment; filename="todos.${params.format}"`
      );

      if (params.format === "csv") {
        return c.text(todos.map((t) => `${t.id},${t.title}`).join("\n"));
      }
      return c.json({ todos });
    });

  // Webhook with signature verification
  export const webhook = publicRoute
    .post("/webhooks/stripe")
    .mutation(async ({ ctx, c }) => {
      const signature = c.req.header("stripe-signature");
      if (!signature) throw new CRPCError({ code: "BAD_REQUEST" });

      const body = await c.req.text();
      await ctx.runMutation(internal.stripe.process, { body, signature });

      return c.text("OK", 200);
    });

  // Redirect
  export const redirect = publicRoute
    .get("/api/old-path")
    .query(async ({ c }) => c.redirect("/api/new-path", 301));
  ```

## 0.2.1

### Patch Changes

- [#24](https://github.com/udecode/kitcn/pull/24) [`b5555ea`](https://github.com/udecode/kitcn/commit/b5555eac9e67ef06328f5e122ce2d4512f3b3c7f) Thanks [@zbeyens](https://github.com/zbeyens)! - - Fix (`UNAUTHORIZED`) queries failing after switching tabs and returning to the app. The auth token is now preserved during session refetch instead of being cleared.
  - Fix (`UNAUTHORIZED`) `useSuspenseQuery` failing on initial page load when auth is still loading. WebSocket subscriptions now wait for auth to settle before connecting.
  - Fix logout setting `isAuthenticated: false` before unsubscribing to prevent query re-subscriptions.
  - Add missing `dotenv` dependency for CLI.

## 0.2.0

### Minor Changes

- [#22](https://github.com/udecode/kitcn/pull/22) [`27d355e`](https://github.com/udecode/kitcn/commit/27d355e4ac067503e00bf534164c6ce2974a8a46) Thanks [@zbeyens](https://github.com/zbeyens)! - **BREAKING:** Refactored `createCRPCContext` and `createServerCRPCProxy` to use options object:

  Before:

  ```ts
  createCRPCContext(api, meta);
  createServerCRPCProxy(api, meta);
  ```

  After:

  ```ts
  createCRPCContext<Api>({ api, meta, convexSiteUrl });
  createServerCRPCProxy<Api>({ api, meta });
  ```

  **BREAKING:** `getServerQueryClientOptions` now requires `convexSiteUrl`:

  ```ts
  getServerQueryClientOptions({
    getToken: caller.getToken,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });
  ```

  **Feature:** Added type-safe HTTP routes with tRPC-style client:

  ```ts
  // 1. Pass httpAction to initCRPC.create()
  const c = initCRPC.dataModel<DataModel>().create({
    query, mutation, action, httpAction,
  });
  export const publicRoute = c.httpAction;
  export const authRoute = c.httpAction.use(authMiddleware);
  export const router = c.router;

  // 2. Define routes with .get()/.post()/.patch()/.delete()
  export const health = publicRoute
    .get('/api/health')
    .output(z.object({ status: z.string() }))
    .query(async () => ({ status: 'ok' }));

  // 3. Use .params(), .searchParams(), .input() for typed inputs
  export const todosRouter = router({
    list: publicRoute.get('/api/todos')
      .searchParams(z.object({ limit: z.coerce.number().optional() }))
      .query(...),
    get: publicRoute.get('/api/todos/:id')
      .params(z.object({ id: zid('todos') }))
      .query(...),
    create: authRoute.post('/api/todos')
      .input(z.object({ title: z.string() }))
      .mutation(...),
  });

  // 4. Register with CORS
  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: { allowedOrigins: [process.env.SITE_URL!], allowCredentials: true },
  });

  // 5. Add to Api type for inference
  export type Api = WithHttpRouter<typeof api, typeof appRouter>;

  // 6. Client: TanStack Query integration via crpc.http.*
  const crpc = useCRPC();
  useSuspenseQuery(crpc.http.todos.list.queryOptions({ limit: 10 }));
  useMutation(crpc.http.todos.create.mutationOptions());
  queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());

  // 7. RSC: prefetch helper
  prefetch(crpc.http.health.queryOptions({}));
  ```

  **Fix:** Improved authentication in `ConvexAuthProvider`:

  - **FetchAccessTokenContext**: New context passes `fetchAccessToken` through React tree - eliminates race conditions where token wasn't available during render
  - **Token Expiration Tracking**: Added `expiresAt` field with `decodeJwtExp()` - 60s cache leeway prevents unnecessary token refreshes
  - **SSR Hydration Fix**: Defensive `isLoading` check prevents UNAUTHORIZED errors when Better Auth briefly returns null during hydration
  - **Removed HMR persistence**: No more globalThis Symbol storage (`getPersistedToken`/`persistToken`)
  - **Simplified AuthStore**: Removed `guard` method and `AuthEffect` - state synced via `useConvexAuth()` directly

## 0.1.0

### Minor Changes

- [#18](https://github.com/udecode/kitcn/pull/18) [`681e9ba`](https://github.com/udecode/kitcn/commit/681e9bafdeaa62928f15fe9781f944d42ce2d2b4) Thanks [@zbeyens](https://github.com/zbeyens)! - Initial release
