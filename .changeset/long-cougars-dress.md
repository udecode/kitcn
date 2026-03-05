---
"better-convex": minor
"@better-convex/resend": minor
---

## Breaking changes

- Remove `buildResendHandlers` from `@better-convex/resend` exports. Resend internal procedures are now scaffold-owned in `convex/functions/plugins/resend.ts`.

- Remove `Resend` class and `createResend` helper exports from `@better-convex/resend`. Use `ctx.getApi(resendPlugin)` exclusively.

- Remove validator value exports from `@better-convex/resend` root (`vEmailId`, `vEmailEvent`, `vOptions`, `vStatus`, `vTemplate`). Keep validators internal; consume exported types instead.

- Remove `cancelEmail`, `status`, and `get` from `ctx.getApi(resendPlugin)` package API. Use generated resend callers (`createResendCaller`) for those internal procedure calls when needed.

```ts
// Before
import { buildResendHandlers } from '@better-convex/resend';

const handlers = buildResendHandlers(internal.plugins.resend, { withOrm });
export const sendEmail = c.mutation.internal().input(z.object({}).passthrough()).mutation(({ ctx, input }) =>
  handlers.sendEmail(ctx, input)
);

// After
import { createResendCaller } from '../generated/plugins/resend.runtime';

export const sendEmail = c.mutation.internal().input(z.object({}).passthrough()).mutation(async ({ ctx, input }) => {
  // full procedure logic lives in scaffold
  return await doSendEmailWithOrm(ctx, input);
});

export const callResendAPIWithBatch = c.action.internal().input(z.object({}).passthrough()).action(async ({ ctx, input }) => {
  const caller = createResendCaller(ctx);
  // caller-based internal composition (no ctx.run*)
  return await sendBatchViaCaller(caller, input);
});
```

- Drop dynamic `onEmailEvent` function-handle runtime config wiring (`fnHandle`). Event fanout now always goes through scaffolded `onEmailEvent`.

```ts
// Before
const resendPlugin = ResendPlugin.configure({
  onEmailEvent: internal.someModule.someHandler,
});

// After
const resendPlugin = ResendPlugin.configure({
  apiKey: process.env.RESEND_API_KEY,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
});

// Customize scaffolded internal handler directly:
// convex/functions/plugins/resend.ts -> export const onEmailEvent = ...
```

- Drop codegen dependency on named `relations` / `triggers` exports. Schema metadata from `defineSchema(..., { relations, triggers })` is now canonical.

```ts
// Before
const tables = { user, post };
export default defineSchema(tables, { strict: false });
const relations = defineRelations(tables, (r) => ({
  user: { posts: r.many.post() },
  post: { author: r.one.user({ from: r.post.authorId, to: r.user.id }) },
}));
const triggers = defineTriggers(relations, { post: { change: async () => {} } });

// After
const tables = { user, post };
export default defineSchema(tables, {
  strict: false,
  relations: (r) => ({
    user: { posts: r.many.post() },
    post: { author: r.one.user({ from: r.post.authorId, to: r.user.id }) },
  }),
  triggers: (relations) =>
    defineTriggers(relations, { post: { change: async () => {} } }),
});
```

## Features

- Add scaffold-owned resend runtime template that includes full internal procedure logic with ORM access and caller-based composition.
- Add caller-only resend scaffold contract (`createResendCaller`) for internal composition from actions/mutations without direct `ctx.run*` calls.
- Add schema-first relations/triggers metadata on default schema exports; codegen now resolves ORM wiring from schema metadata instead of named exports.

## Patches

- Improve resend plugin docs to reflect scaffold-owned runtime and scaffolded `onEmailEvent` customization.
- Improve plugin authoring guidance with explicit rules for caller-based internal composition and scaffold-owned callback hooks.
