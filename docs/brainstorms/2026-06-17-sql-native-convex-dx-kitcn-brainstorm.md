---
date: 2026-06-17
topic: sql-native-convex-dx-kitcn
status: handoff brainstorm
updated: prisma-next substrate spike + electric-first sync lane
---

# SQL-Native Convex DX For kitcn

## Executive Thesis

kitcn should become the **shadcn of full-stack application architecture**:

```txt
Convex DX. SQL power. App-owned code.
```

The current kitcn identity is too tightly framed as a Convex framework. That was
the right wedge, but it is not the biggest product.

The bigger product is:

```txt
Add Convex-like developer experience to a normal SQL app without surrendering
Postgres, Drizzle, TanStack, app-owned code, migrations, SQL tooling, or
framework escape hatches.
```

Do not build a hosted platform. Do not build a generic every-backend framework
first. Do not rebuild all of Convex. Build the missing shadcn-style
architecture layer that installs the right code into the user's app, using one
brutally opinionated SQL sync lane until the DX is excellent.

Do not let existing kitcn code, package names, Convex assumptions, scaffold
commands, or docs constrain the architecture. This project is still pre-prod.
Hard cuts are allowed. If the best stack requires deleting or replacing major
existing surfaces, do that instead of preserving weak compatibility.

## Product Line

Best line:

```txt
Convex DX on your Postgres, with code you own.
```

Alternative lines:

```txt
The app framework you can eject into.
```

```txt
shadcn for full-stack resources.
```

```txt
Add realtime resource DX to your existing SQL app.
```

## Why This Exists

Convex DX is excellent:

- typed server functions
- generated client API
- reactive reads
- optimistic mutations
- low ceremony
- colocated schema/function mental model
- agent-friendly structure

But Convex as the database substrate blocks too much of the serious app world:

- Postgres
- Drizzle
- Prisma
- Kysely
- SQL constraints
- SQL joins
- SQL views and materialized views
- raw SQL escape hatches
- `pgvector`
- full-text search
- BI/reporting tools
- mature migration workflows
- logical replication
- hosted Postgres choice
- existing database adoption

That is the opportunity. Keep the DX. Remove the database ceiling.

## The shadcn Principle

The product should feel closer to shadcn than to a traditional framework.

shadcn's deep lesson is not "nice components." It is:

```txt
Install useful source code into my app, give me excellent defaults, and let me
own the code.
```

kitcn should apply that to full-stack app primitives:

```txt
resources
procedures
auth scopes
projections
sync endpoints
client collections
optimistic mutations
tests
doctor checks
```

The user should be able to run a CLI command and receive normal app files they
can read, edit, delete, fork, or outgrow.

If users feel trapped inside kitcn runtime magic, the product failed.

## First Lane

Do not support every backend first. That is product cowardice.

Pick one excellent lane:

```txt
TanStack Start
+ Postgres
+ Prisma Next
+ Better Auth
+ ElectricSQL
+ TanStack Query
+ TanStack DB
+ kitcn cRPC/resources
```

This is the first "perfect stack."

This is not an adapter matrix. This is the product lane.

Do not expose a public `syncProvider` abstraction in v1. Do not pretend Zero,
PowerSync, Electric, and a custom SSE stream are equivalent before the resource
DX exists. Build on Electric first, reach Convex-level ergonomics, make the
tests pass, then decide what deserves decoupling.

Why this lane:

- TanStack Start aligns with TanStack Query and TanStack DB.
- Prisma Next appears to provide the contract/migration/runtime guardrails kitcn
  should not reinvent if the spike proves it works.
- Postgres is the serious default.
- Better Auth is already in the kitcn orbit.
- ElectricSQL already solves Postgres-to-client shape sync, which is the hard
  part kitcn should not hand-roll first.
- TanStack DB already solves client-side reactive collections and live queries.
- kitcn can own the generated app architecture layer instead of inventing
  sync/database/runtime from scratch.

Next.js can come later. Drizzle can come later or remain the fallback lane.
Zero/PowerSync can come later. Custom sync can come later if Electric becomes
the ceiling. Convex remains valuable as inspiration, but it stops being the
future identity.

## Prisma Next Substrate Check

Prisma Next changes the ORM decision. Treat it as the substrate candidate to
spike now, not as a second-lane afterthought.

It appears to pass the checks that matter for kitcn's long-term ambition:

| Check | Current read |
|---|---|
| Canonical schema / model boundary | Strong: `contract.json`, `contract.d.ts`, storage hashes, domain/storage split |
| TypeScript schema authoring | Strong |
| SQL escape hatch | Strong: SQL builder, raw/annotated query lanes |
| Migrations | Very strong: migration graph, `ops.json`, markers, pre/post checks |
| Runtime guardrails | Strong: middleware, lints, budgets, marker verification |
| Agent DX | Very strong: skills, deterministic commands, structured diagnostics |
| Extension model | Strong: packs, targets, adapters, codecs, capabilities |
| Existing DB adoption | Present: `db init`, `db update`, contract inference/adoption direction |
| Electric sync | Missing |
| TanStack DB integration | Missing |
| hard/soft predicates | Missing |
| optimistic client mutations | Missing |
| resource auth shape endpoints | Missing |
| first-class read projections/views | Weak or unclear |

That split is good.

Prisma Next can own:

```txt
data contract
migrations
query runtime
runtime guardrails
database marker verification
SQL escape hatches
extension-aware storage metadata
```

kitcn should own:

```txt
resources
auth-scoped Electric shape routes
hard/soft predicate model
TanStack DB collections
optimistic client mutations
React hooks
app scaffolding
doctor checks across the full app stack
```

This is likely a stronger foundation than Drizzle if the spike works. Drizzle
is still the fallback if Prisma Next's current APIs make Electric shape
generation or mutation wiring awkward.

Classic Prisma 7 is not the lane. When this document says Prisma from here on,
it means Prisma Next.

## Hard Cut Policy

No backwards-compatibility tax during the pivot.

Reject preserving:

- old Convex-first package boundaries
- current scaffold commands if they encode the wrong mental model
- docs that frame kitcn as a Convex framework
- generated examples that block the better stack
- public APIs that only exist because the old implementation needed them
- adapter abstractions added before the first blessed lane works

The rule is simple:

```txt
If the best kitcn is Prisma Next + Electric + TanStack DB, cut toward that.
Do not contort the future around yesterday's prototype.
```

## The Big Primitive: Resource

The core kitcn primitive should not be table, route, procedure, or component.

It should be:

```txt
Resource
```

A resource is the full-stack application unit:

```txt
contract model / projection
+ validation
+ permissions
+ procedures
+ mutations
+ projections
+ sync shape
+ client collection
+ optimistic patch contract
+ tests
+ docs
```

Example rough shape:

```ts
export const tasks = defineResource({
  model: models.Task,

  scope: ({ session, model }) => model.orgId.eq(session.orgId),

  procedures: (r) => ({
    list: r.query
      .input(listTasksInput)
      .handler(async ({ db, input }) => {
        return db.orm.Task.findMany({
          where: {
            orgId: input.orgId,
            status: input.status,
          },
          orderBy: { updatedAt: "desc" },
          limit: input.limit,
        });
      }),

    complete: r.mutation
      .input(completeTaskInput)
      .optimistic(({ input }) => [
        patch("taskBoard", input.id, { status: "complete" }),
      ])
      .handler(async ({ tx, input }) => {
        await tx.orm.Task.update({
          where: { id: input.id },
          data: { status: "complete" },
        });
      }),
  }),

  projections: {
    board: defineProjection({
      source: models.Task,
      sync: true,
      client: "tanstack-db",
    }),
  },
});
```

The exact API can change. The invariant should not:

```txt
one product unit should generate the server, sync, client, and test shape.
```

## Generated App-Owned Files

The CLI should write normal files. No hidden framework prison.

For:

```bash
kitcn add resource tasks --sync
```

Possible output:

```txt
src/prisma/contract.ts
src/server/resources/tasks.ts
src/server/procedures/tasks.ts
src/server/shapes/tasks.ts
src/server/sync/tasks.ts
src/client/collections/tasks.ts
src/client/mutations/tasks.ts
src/routes/api/kitcn/sync/tasks.ts
src/tests/tasks.resource.test.ts
```

The user owns these files.

The kitcn package provides:

- helpers
- types
- codegen
- doctor checks
- conventions
- scaffolding
- optional runtime utilities

It should not hide the application.

## Sync Engine Decision

Use ElectricSQL as the v1 sync substrate.

Tim's custom TanStack DB + SSE sync loop is a useful proof of shape:

```txt
on-demand collections
+ hard predicates that fetch
+ soft predicates that filter local cache
+ lightweight stream of versioned entity changes
+ reconstruction fallback when payloads are dropped or stale
```

That is fine for one app. It is not the right first foundation for a framework.
kitcn should steal the product ideas, not the bespoke transport.

Electric already provides the key primitive:

```txt
Postgres -> ShapeStream -> row-level deltas -> client
```

TanStack DB already has an Electric collection path and is designed for sync
engines. The natural stack is:

```txt
Prisma Next/Postgres canonical contract
-> Electric ShapeStream
-> TanStack DB collections
-> UI live queries
```

kitcn's job is not to compete with Electric.

kitcn's job is to make Electric + TanStack DB + Prisma Next feel like Convex:

```txt
typed resources
typed mutations
auth scopes
optimistic patches
generated collections
tests
doctor checks
deployment conventions
```

The v1 rule:

```txt
Electric owns replication.
TanStack DB owns client collections/live queries.
kitcn owns the resource contract and DX.
```

The API should have clean internal boundaries, but the public product should be
opinionated. Abstraction comes after the blessed lane works.

## What Existing Sync Tools Solve

| Tool | Solves | Why It Is Not The Whole Product |
|---|---|---|
| ElectricSQL | Postgres shape streams, partial replication, row deltas | Does not own resource/procedure/auth/optimistic app DX |
| TanStack DB | Client collections, live queries, optimistic local mutations | Client-side only; needs backend/resource contracts |
| Zero | Postgres-backed query-driven sync with local client store | More vertically integrated; not shadcn/app-owned-code first |
| PowerSync | Offline-first SQLite sync | Strong but heavier/offline-shaped for first web lane |
| Replicache | BYOB push/pull mutator protocol | Lower-level; kitcn would need more sync protocol code |
| Supabase Realtime | Postgres changes over realtime | Not full sync/client DB/projection architecture |

First bet:

```txt
ElectricSQL + TanStack DB
```

Future adapters can exist, but do not design v1 around them.

The wrong v1 API:

```ts
createSyncEngine({ provider: "electric" | "zero" | "custom" });
```

The right v1 API:

```ts
export const tasks = defineResource({
  model: models.Task,
  auth: ({ session, model }) => model.orgId.eq(session.orgId),
  sync: {
    shape: "taskBoard",
    hardPredicates: ["orgId", "projectId", "status"],
    softPredicates: ["search", "assigneeId"],
  },
});
```

kitcn can generate Electric shape routes and TanStack DB collections underneath.
Users should think in resources, scopes, predicates, and mutations, not sync
engine provider switches.

## Runtime Architecture

Recommended first-lane architecture:

```txt
Postgres
  -> Prisma Next contract and migrations
  -> Better Auth session
  -> kitcn cRPC procedures
  -> Electric shape endpoints/proxy
  -> TanStack DB client collections
  -> TanStack Query for ordinary server state
  -> TanStack Start routes and server functions
```

Data paths:

```txt
ordinary query:
  component -> TanStack Query -> kitcn cRPC query -> Prisma Next/Postgres

hot synced read:
  component -> TanStack DB live query -> Electric synced collection

mutation:
  component -> kitcn mutation helper
  -> optimistic TanStack DB patch
  -> cRPC mutation
  -> Prisma Next transaction/runtime
  -> Postgres commit
  -> Electric delta reconciliation
```

This gives the Convex feel without Convex owning data.

## Predicate Model

The hard/soft predicate split is important enough to be first-class.

Hard predicates:

```txt
change the server-side shape
fetch or subscribe to different rows
affect authorization and data volume
belong in the generated Electric shape route
```

Examples:

```txt
orgId
facilityId
projectId
patientStatus
date window
```

Soft predicates:

```txt
filter or sort rows already present in the client collection
do not hit the server
do not expand authorization scope
belong in TanStack DB live queries
```

Examples:

```txt
search text
local tab
visual grouping
client-only sort
```

This is one of the core ways kitcn can improve on Convex ergonomics. Realtime
should not mean "subscribe to too much and pray the bill behaves."

## Projection Model

Do not sync raw domain tables by default.

Favor explicit projection/resource shapes:

```txt
canonical tables answer: what is true?
projection shapes answer: what does this UI need locally?
sync answers: what must update while the user is looking?
```

For simple apps, a projection can be a direct model/table shape.

For serious apps, a projection should be an explicit table, contract model,
view/materialized view, or SQL query-backed shape.

The resource API should support both:

```ts
defineProjection({
  name: "taskBoard",
  source: models.Task,
  mode: "direct",
});
```

and:

```ts
defineProjection({
  name: "taskBoard",
  source: taskBoardProjection,
  mode: "table",
});
```

or eventually:

```ts
defineProjection({
  name: "taskBoard",
  source: sql`
    select ...
  `,
  mode: "query",
});
```

Start simple. Keep the concept honest.

## Package Shape

First-lane packages:

```txt
@kitcn/cli
@kitcn/core
@kitcn/server
@kitcn/react
@kitcn/react-db
@kitcn/sync
@kitcn/prisma-next
@kitcn/auth
```

Later:

```txt
@kitcn/convex
@kitcn/drizzle
@kitcn/kysely
@kitcn/zero
@kitcn/powersync
```

But do not design the v1 API around all of them. For now, package boundaries are
for code organization and future extraction, not a promise that every backend is
pluggable.

## Adoption Model

This must be additive.

Bad product:

```txt
Start with kitcn or you cannot use kitcn.
```

Good product:

```txt
You already have TanStack Start + Prisma Next + Postgres.
Run `kitcn add sync`.
Adopt one resource at a time.
```

Adoption commands:

```bash
kitcn init
kitcn add sync
kitcn add resource tasks --from prisma-next --sync
kitcn add collection task-board
```

Adoption should work resource by resource:

```txt
existing Prisma Next model
-> generated resource
-> generated procedures
-> generated synced collection
-> migrate one screen
```

That is very shadcn. No rewrite tax.

## CLI Philosophy

The CLI should be first-class for humans and agents:

- deterministic
- non-interactive defaults with `--yes`
- machine-readable `--json`
- dry-run support
- explicit file ownership
- idempotent where possible
- doctor commands that explain exactly what is wrong
- no hidden "trust us" patching

Core commands:

```bash
kitcn init
kitcn doctor
kitcn add auth
kitcn add sync
kitcn add resource <name>
kitcn add projection <name>
kitcn add collection <name>
kitcn add mutation <resource>.<mutation>
kitcn generate
kitcn verify
```

Doctor checks should include:

- Prisma Next contract discovery
- missing indexes for synced shapes
- missing auth scope
- Electric shape reachability
- TanStack DB collection drift
- mutation optimistic patch drift
- projection/source mismatch
- generated file stale state

## What To Steal

### From shadcn

- app-owned code
- registry distribution
- CLI installation
- editable defaults
- "not a library, how you build your library"
- AI-readable code

### From Convex

- typed server functions
- generated client API
- realtime-by-default feel
- optimistic mutation ergonomics
- low ceremony
- clear query/mutation/action split

### From tRPC

- procedure builder
- middleware
- type inference
- client/server contract

### From Prisma Next

- canonical contract artifacts
- TypeScript contract authoring
- storage hashes and database markers
- migration graph and `ops.json`
- runtime middleware, lints, budgets, and marker verification
- SQL builder and raw/annotated query lanes
- extension packs and codec-aware storage metadata
- agent-facing skills and diagnostics

### From Drizzle

- SQL-native TypeScript schema
- visible query builder
- migrations close to DB reality
- relation/query patterns users already understand

Drizzle is still useful as a reference and fallback, but not the current
preferred substrate if Prisma Next spike passes.

### From TanStack Query

- server-state lifecycle
- mutation callbacks
- stale/cache defaults
- devtools

### From TanStack DB

- normalized client collections
- live queries
- optimistic transaction model
- differential client-side recomputation

### From ElectricSQL

- Postgres partial replication
- shape streams
- row-level deltas
- explicit shape boundaries

## What To Reject

Reject hard:

- supporting all backends in v1
- public sync-provider abstraction in v1
- Convex as the future identity
- classic Prisma 7 as the first foundation
- preserving current kitcn/Convex APIs because they already exist
- treating existing code as an architecture constraint
- building a new ORM
- a generic sync engine abstraction first
- a hand-rolled sync stream as the framework foundation before Electric is
  exhausted
- hiding generated code
- hosted-platform dependency
- local-first religion before excellent online-first
- syncing every table by default
- realtime everywhere by default
- magic permission DSL detached from app code
- wrapper APIs that users cannot eject from

## What To Defer

Defer:

- Drizzle adapter unless Prisma Next fails the spike
- Kysely adapter
- Next.js first-class lane
- Zero adapter
- PowerSync adapter
- custom kitcn sync engine
- provider-agnostic sync API
- hosted sync
- full offline-first
- conflict resolution policy beyond server-authoritative optimistic writes
- generic multi-backend resources
- advanced projection rebuild orchestration
- Prisma Next decoupling until the blessed lane proves its shape

These may matter later. They should not shape v1.

## When To Decouple

Do not decouple because architecture diagrams look cleaner.

Decouple only after the Electric lane proves:

- resource generation feels Convex-level fast
- optimistic mutations reconcile cleanly
- auth-scoped shapes are safe and readable
- hard/soft predicates are ergonomic
- dropped stream/reset behavior is boring
- `kitcn doctor` catches common sync wiring failures
- tests cover the vertical slice end to end

Only then inspect what is truly Electric-specific:

```txt
shape route generation
collection materialization
reset/reconstruction behavior
deployment wiring
auth proxying
```

If those are small, extract interfaces. If they are the product, keep Electric
as the product lane longer. No fake modularity.

## Opinionated V1 Scope

V1 should prove:

```txt
Add Convex-like synced resource DX to a TanStack Start + Prisma Next app.
```

Minimum vertical slice:

1. `kitcn init` detects TanStack Start + Prisma Next.
2. `kitcn add sync` installs Electric/TanStack DB wiring.
3. `kitcn add resource tasks --sync` generates:
   - resource definition
   - cRPC procedures
   - Electric shape/proxy route
   - TanStack DB collection
   - optimistic mutation helper
   - focused tests
4. Demo screen uses:
   - synced collection for list
   - optimistic mutation for create/update/complete
   - Prisma Next transaction/runtime for canonical writes
   - Electric delta reconciliation after server write
   - hard predicates for server scope
   - soft predicates for local filtering
5. `kitcn doctor` can detect broken wiring.
6. The spike proves that Prisma Next contract metadata can generate safe
   Electric shape routes without awkward manual duplication.

Do not start by trying to make every table/resource shape perfect.
Do not start by making the sync engine replaceable.
Do not preserve old kitcn package/API surfaces if they distort this slice.

## Example End-State Developer Experience

```bash
bun create tanstack@latest my-app
cd my-app
bun add prisma-next @tanstack/db @electric-sql/client
bunx kitcn init --yes
bunx kitcn add auth --yes
bunx kitcn add sync --yes
bunx kitcn add resource tasks --from prisma-next --sync --yes
```

Then in UI:

```tsx
const { data: tasks } = useLiveQuery((q) =>
  q
    .from({ task: taskCollection })
    .where(({ task }) => eq(task.status, "open"))
    .orderBy(({ task }) => task.updatedAt, "desc")
);

const completeTask = useKitcnMutation(api.tasks.complete);
```

This should feel like Convex:

```txt
define resource -> use generated client -> UI updates live
```

But the files are normal app files, and the database is Postgres.

## Open Questions

### API

- Should `defineResource` live in app source or generated files only?
- Should `defineResource` wrap Prisma Next models directly or generate a thin
  app-owned resource file beside the Prisma Next contract?
- Should projections be declared inside resources or beside them?
- How much of the optimistic patch API should be declarative versus ordinary
  TypeScript?
- Should collection names map to resource names or projection names?

### Sync

- Should v1 rely directly on Electric shape URLs or always proxy through app
  routes for auth/scope control?
- Should synced shapes use direct tables first or generated projection tables?
- What is the reset strategy when a client shape drifts?
- How should mutation ack/reject reconcile with Electric-delivered deltas?
- How should hard predicates map to Electric shape params?
- How should soft predicates map to TanStack DB live queries?
- What minimum metadata does kitcn need around Electric streams for doctor
  checks and reconstruction?
- Can Prisma Next's contract IR derive every Electric shape route field without
  duplicating schema metadata?

### Auth

- Does Better Auth own session shape for Electric shape authorization?
- Should kitcn generate scoped shape endpoints rather than exposing generic
  Electric URLs?
- How should org/team scoping be expressed so it stays readable and safe?

### CLI

- How much existing-app detection is required for v1?
- Should `kitcn add resource --from prisma-next` inspect `contract.json`,
  `contract.d.ts`, or the TS contract source?
- What is the minimum useful `kitcn doctor` for sync?

## Suggested Next Plan

Create a real implementation plan around one vertical slice:

```txt
tasks resource in TanStack Start + Prisma Next + Electric + TanStack DB
```

Plan phases:

1. Source study:
   - current kitcn cRPC runtime
   - current Prisma Next contract/runtime/migration APIs
   - Electric ShapeStream docs/examples
   - TanStack DB Electric collection docs
   - Tim-style hard predicate / soft predicate sync loop as a product pattern,
     not as transport foundation
2. API sketch:
   - `defineResource`
   - `defineProjection`
   - hard predicates
   - soft predicates
   - optimistic mutation helper
3. Prototype:
   - hand-write the files first in an example app
   - no generator until the shape feels right
4. Extract:
   - convert repeated code into kitcn helpers
   - then add CLI generation
5. Verify:
   - typecheck
   - Prisma Next contract emit/apply loop
   - mutation optimistic path
   - Electric delta reconciliation
   - generated code ownership
   - `doctor` catches broken config
6. Decision:
   - if Prisma Next shape generation and mutation wiring are clean, hard-cut
     the SQL lane to Prisma Next
   - if Prisma Next blocks the DX, fall back to Drizzle with the same resource
     contract

## Final Recommendation

Do this next:

```txt
spike kitcn SQL lane = TanStack Start + Prisma Next + Postgres + Better Auth +
ElectricSQL + TanStack DB
```

Position it as:

```txt
Convex DX on your SQL app, with shadcn-style code ownership.
```

Start by integrating Electric deeply, not replacing it and not abstracting it
too early.

Start by trying Prisma Next as the data contract/runtime substrate, not by
defaulting back to Drizzle.

Use ElectricSQL for Postgres-to-client deltas.

Use TanStack DB for local collections/live queries.

Use kitcn for the full-stack architecture contract:

```txt
resource -> procedure -> projection -> sync shape -> collection -> optimistic mutation
```

That is the biggest version of kitcn.

The cleanest final stance:

```txt
Prisma Next substrate spike. Electric first. Convex DX target.
Hard-cut old kitcn constraints. Decouple later, only after the lane is proven.
```
