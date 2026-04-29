# Testing (Consumer App Focus)

Use this for testing your app features built on kitcn.
This intentionally excludes internal package parity harnesses and deep type-matrix maintenance.

What to test + practical checklist → SKILL.md Section 11.

## Minimal Runtime Harness

```ts
import { test, expect } from "vitest";
import schema from "../schema";
import { convexTest, runCtx } from "../setup.testing";

test("feature", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    // test logic
  });
});
```

## Core Runtime Scenarios

### 1) Happy-path mutation

```ts
test("creates project", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const id = await ctx.orm.insert(project).values({
      name: "Launch",
      ownerId: "user_123",
    });

    const row = await ctx.orm.query.project.findFirstOrThrow({ where: { id } });
    expect(row.name).toBe("Launch");
  });
});
```

### 2) Auth required

```ts
test("rejects unauthenticated call", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    await expect(
      baseCtx.runMutation(api.project.renameProject, {
        id: "proj_1",
        name: "Renamed",
      })
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
});
```

### 3) Ownership / forbidden

```ts
test("rejects non-owner update", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const id = await ctx.orm.insert(project).values({
      name: "Secret",
      ownerId: "owner_1",
    });

    await expect(
      baseCtx.runMutation(api.project.renameProject, {
        id,
        name: "Hacked",
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
```

### 4) Not-found path

```ts
test("returns not found for missing row", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    await expect(
      baseCtx.runMutation(api.project.renameProject, {
        id: "missing",
        name: "x",
      })
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
```

### 5) Trigger side effects

```ts
test("updating message updates thread timestamp via trigger", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const threadId = await ctx.orm.insert(thread).values({ title: "T1" });
    const messageId = await ctx.orm.insert(message).values({
      threadId,
      body: "hello",
      authorId: "user_1",
    });

    await ctx.orm
      .update(message)
      .set({ body: "hello again" })
      .where(eq(message.id, messageId));

    const threadRow = await ctx.orm.query.thread.findFirstOrThrow({
      where: { id: threadId },
    });
    expect(threadRow.lastMessageAt).toBeTruthy();
  });
});
```

### 6) Scheduled jobs

```ts
import { vi } from "vitest";

test("scheduled cleanup runs", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const caller = createJobsCaller(ctx);
    await caller.schedule.after(1000).cleanup({ orgId: "org_1" });
    vi.advanceTimersByTime(1000);
    await t.finishAllScheduledFunctions();

    const remaining = await ctx.orm.query.tempRecords.findMany({
      where: { orgId: "org_1" },
      limit: 10,
    });
    expect(remaining.length).toBe(0);
  });

  vi.useRealTimers();
});
```

## Lightweight Type Checks (Optional)

Only keep app-facing type checks:
- procedure input/output DTOs
- key ORM return shapes used by UI

```ts
import { expectTypeOf } from "vitest";

test("list query result shape", async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const rows = await ctx.orm.query.project.findMany({ limit: 5 });

    expectTypeOf(rows[0]).toMatchTypeOf<{
      id: string;
      name: string;
      createdAt: number;
    }>();
  });
});
```

## Compile-Time Type Suites (Example-Parity Optional)

If you want parity with `example/convex` type hardening, add compile-time-only files:

- `convex/lib/crpc-test.ts`:
  - procedure-builder type coverage (`public`, `optionalAuth`, `auth`, `private`)
  - `.paginated(...)` cursor/limit type checks
  - `@ts-expect-error` assertions for invalid usage
- `convex/shared/types-typecheck.ts`:
  - `Select`/`Insert` alias integrity checks
  - generated API input/output shape checks
  - temporal field type assertions

These files are validated by `tsc`/`bun typecheck`; they are not runtime tests.

## Keep / Drop Guidance

Keep:
- feature tests tied to user-visible behavior
- auth/rules tests
- trigger and scheduler tests
- API contract checks at app boundary

Drop:
- internal ORM parity progress tracking
- assertion counting workflows
- package-internal generic/type torture suites
- duplicate runtime snippets with same intent

→ Practical test checklist: SKILL.md Section 11 (items 1–7).
