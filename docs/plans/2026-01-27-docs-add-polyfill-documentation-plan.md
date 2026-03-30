---
title: Add polyfill documentation
type: docs
date: 2026-01-27
---

# Add Polyfill Documentation

## Problem

PR #47 contributor noted: docs show `import '../lib/http-polyfills'` but no explanation of what it is or how to create it.

Current state:
- `www/content/docs/auth/server.mdx:360` imports polyfill without explanation
- Users don't know why it's needed or how to create the file

## Solution

Add polyfill section to auth/server.mdx explaining:
1. **Why**: Convex runtime lacks `MessageChannel` which Better Auth/Hono needs
2. **How**: Create `convex/lib/http-polyfills.ts` with the polyfill code

## Acceptance Criteria

- [x] Add "Polyfills" section to `www/content/docs/auth/server.mdx` before HTTP Routes section
- [x] Include the full polyfill code from `example/convex/lib/http-polyfills.ts`
- [x] Brief explanation of why it's needed

## MVP

### www/content/docs/auth/server.mdx

Add before "4. HTTP Routes" section (around line 353):

```mdx
## Polyfills (Required)

Convex's runtime environment doesn't include `MessageChannel`, which Better Auth's HTTP handling requires. Create this polyfill file:

```ts title="convex/lib/http-polyfills.ts" showLineNumbers
// polyfill MessageChannel without using node:events
if (typeof MessageChannel === 'undefined') {
  class MockMessagePort {
    onmessage: ((ev: MessageEvent) => void) | undefined;
    onmessageerror: ((ev: MessageEvent) => void) | undefined;

    addEventListener() {}
    close() {}

    dispatchEvent(_event: Event): boolean {
      return false;
    }

    postMessage(_message: unknown, _transfer: Transferable[] = []) {}
    removeEventListener() {}
    start() {}
  }

  class MockMessageChannel {
    port1: MockMessagePort;
    port2: MockMessagePort;

    constructor() {
      this.port1 = new MockMessagePort();
      this.port2 = new MockMessagePort();
    }
  }

  globalThis.MessageChannel =
    MockMessageChannel as unknown as typeof MessageChannel;
}
```

Import this at the top of your HTTP file (before other imports).
```

## References

- PR #47: https://github.com/udecode/kitcn/pull/47
- Example file: `example/convex/lib/http-polyfills.ts`
