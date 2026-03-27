---
name: jotai-x
description: Use when working with Jotai X stores (createAtomStore), accessing state in components or callbacks, persisting state to cookies or localStorage
---

# Jotai X Consumer Patterns

## Core Principle

**Minimize subscriptions, maximize performance.** Use hooks (`useValue`) only when you need reactivity. Use store methods (`store.get`, `store.set`) everywhere else.

## When to Use

- Creating or consuming Jotai X stores (`createAtomStore`)
- Accessing state in components, callbacks, or event handlers
- Choosing between `useAppValue` vs `store.get`, `useAppSet` vs `store.set`
- Optimizing component re-renders and subscriptions

## The Golden Rule

```typescript
// ✅ Subscribe with hooks ONLY when component needs to re-render on change
const count = useAppValue("count"); // Component re-renders when count changes

// ✅ Read without subscribing in callbacks/handlers
const handleClick = () => {
  const count = store.get("count"); // Just reads current value, no subscription
  console.log(count);
};

// ✅ Write with store.set in callbacks/handlers
const handleIncrement = () => {
  store.set("count", (prev) => prev + 1);
};
```

## Decision Guide

**Reading State:**

- **Need component to re-render when value changes?** → `useAppValue('key')`
- **Just need current value once?** → `store.get('key')`
- **In callback/event handler?** → `store.get('key')`
- **In useEffect?** → Usually `store.get('key')` unless you need dependency

**Writing State:**

- **All cases** → `store.set('key', value)`

**Getting both read + write:**

- **Never use** `useAppState` or `useAppSet` - use combinations above

## Quick Reference

| Scenario                   | Use                         | Don't Use            |
| -------------------------- | --------------------------- | -------------------- |
| Component needs reactivity | `useAppValue('key')`        | `store.get('key')`   |
| Callback reads once        | `store.get('key')`          | `useAppValue('key')` |
| Event handler reads        | `store.get('key')`          | `useAppValue('key')` |
| Any write operation        | `store.set('key', val)`     | `useAppSet('key')`   |
| Need both read + write     | `useAppValue` + `store.set` | `useAppState`        |

## API Reference

### Creating a Store

```typescript
import { createAtomStore } from "jotai-x";

export const {
  useChatStore, // Get store instance
  useChatValue, // Subscribe to value (use sparingly!)
  ChatProvider, // Provider component
} = createAtomStore(
  {
    count: 0,
    name: "Alice",
    items: [] as string[],
  },
  {
    name: "chat", // Prefix for all hooks
  }
);
```

### Store Instance API

```typescript
const store = useChatStore();

// Read without subscribing
store.get("count"); // Get single value
store.getCount(); // Alternative syntax

// Write
store.set("count", 5); // Set value
store.set("count", (c) => c + 1); // Update with function
store.setCount(5); // Alternative syntax

// Subscribe (rarely needed - prefer useAppValue)
const unsub = store.subscribe("count", (value) => {
  console.log(value);
});
```

### Hook API (Use Sparingly)

```typescript
// Subscribe to value (component re-renders on change)
const count = useChatValue("count");

// With selector
const firstItem = useChatValue(
  "items",
  {
    selector: (items) => items[0],
  },
  []
);

// With equality function
const items = useChatValue(
  "items",
  {
    equalityFn: (a, b) => a.length === b.length,
  },
  []
);
```

## Complete Example

```typescript
import { createAtomStore } from "jotai-x";

// 1. Create store
export const { useChatStore, useChatValue, ChatProvider } = createAtomStore(
  {
    messages: [] as Message[],
    input: "",
    status: "idle" as "idle" | "loading",
  },
  {
    name: "chat",
  }
);

// 2. Custom hook for complex operations
export const useSendMessage = () => {
  const store = useChatStore();

  return async () => {
    // ✅ Use store.get to read without subscribing
    const input = store.get("input");
    const messages = store.get("messages");

    if (!input.trim()) return;

    // ✅ Use store.set to write
    store.set("status", "loading");
    store.set("input", "");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ input, messages }),
      });

      const newMessage = await response.json();

      // ✅ Functional update
      store.set("messages", (prev) => [...prev, newMessage]);
      store.set("status", "idle");
    } catch (error) {
      store.set("status", "idle");
      console.error(error);
    }
  };
};

// 3. Component with minimal subscriptions
function ChatMessages() {
  // ✅ Subscribe ONLY to what component needs to render
  const messages = useChatValue("messages");
  const status = useChatValue("status");

  return (
    <div>
      {messages.map((msg) => (
        <Message key={msg.id} {...msg} />
      ))}
      {status === "loading" && <LoadingSpinner />}
    </div>
  );
}

// 4. Component with event handlers
function ChatInput() {
  const store = useChatStore();
  const sendMessage = useSendMessage();

  // ✅ Subscribe to input for controlled input
  const input = useChatValue("input");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendMessage();
      }}
    >
      <input
        value={input}
        onChange={(e) => {
          // ✅ Use store.set directly
          store.set("input", e.target.value);
        }}
      />
      <button
        type="submit"
        onClick={() => {
          // ✅ Can read current value without subscribing
          if (store.get("status") === "loading") {
            return; // Don't submit while loading
          }
        }}
      >
        Send
      </button>
    </form>
  );
}
```

## Common Mistakes

### ❌ Using hooks in callbacks

```typescript
// ❌ WRONG - Creates subscription for no reason
function Component() {
  const count = useChatValue("count"); // Subscribes!

  const handleClick = () => {
    console.log(count); // Uses stale closure
  };
}

// ✅ CORRECT - Read when needed
function Component() {
  const store = useChatStore();

  const handleClick = () => {
    console.log(store.get("count")); // Always current
  };
}
```

### ❌ Using useAppState

```typescript
// ❌ WRONG - Over-subscribing
const [count, setCount] = useChatState("count");

// ✅ CORRECT - Subscribe only if component needs reactivity
const count = useChatValue("count");
const store = useChatStore();
// Then use store.set('count', ...) to write
```

### ❌ Using useAppSet

```typescript
// ❌ WRONG - Unnecessary hook call
const setCount = useChatSet("count");
setCount(5);

// ✅ CORRECT - Direct access
const store = useChatStore();
store.set("count", 5);
```

### ❌ Over-subscribing

```typescript
// ❌ WRONG - Component subscribes to everything
function Component() {
  const input = useChatValue("input");
  const status = useChatValue("status");
  const messages = useChatValue("messages");
  const error = useChatValue("error");

  // But only renders messages and status
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.text}</div>
      ))}
      {status === "loading" && <Spinner />}
    </div>
  );
}

// ✅ CORRECT - Subscribe only to what you render
function Component() {
  const messages = useChatValue("messages");
  const status = useChatValue("status");
  // Access input/error with store.get when needed
}
```

## Rationalization Table

| Excuse                                         | Reality                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| "README shows useAppValue, so I should use it" | README shows all features. Use store.get/set for better performance.              |
| "Hooks are the React way"                      | Hooks for reactivity. Store methods for one-time access. Both are React patterns. |
| "store.get/set is more advanced"               | Actually simpler - direct access without subscription overhead.                   |
| "Using hooks everywhere is more consistent"    | Consistency at the cost of performance. Each tool for its purpose.                |
| "Official docs recommend useAppValue"          | Docs show options. Choose based on whether you need subscription.                 |
| "I need the setter from useAppState"           | Use `store.set` instead - works everywhere, not just in components.               |
| "I'll optimize later, hooks for now"           | Wrong pattern from start = tech debt. Use store.get/set from beginning.           |
| "Getting store adds extra line of code"        | One line enables all direct access. More efficient than multiple hooks.           |
| "What if I need value multiple times?"         | store.get is instant, no overhead. Call it as many times as needed.               |
| "Hooks auto-subscribe, don't have to think"    | Thinking prevents bugs. Explicit > implicit. Performance > convenience.           |

## Red Flags - Check Your Code

If you see any of these patterns, reconsider:

- `useAppState` anywhere (almost never needed)
- `useAppSet` anywhere (use `store.set`)
- `useAppValue` in a callback/event handler (use `store.get`)
- More than 2-3 `useAppValue` calls in one component (over-subscribing)
- `useAppValue` but never using the returned value in JSX (just use `store.get`)

**All of these mean: Switch to `store.get` or `store.set`.**

## Performance Impact

**Bad pattern** (unnecessary subscriptions):

```typescript
function UserProfile() {
  const firstName = useChatValue("firstName");
  const lastName = useChatValue("lastName");
  const email = useChatValue("email");
  const age = useChatValue("age");

  // Component re-renders on ANY change to firstName, lastName, email, OR age
  return (
    <div>
      {firstName} {lastName}
    </div>
  );
}
// Subscribes to 4 atoms, only uses 2 in render
```

**Good pattern** (minimal subscriptions):

```typescript
function UserProfile() {
  // Only subscribe to what we render
  const firstName = useChatValue("firstName");
  const lastName = useChatValue("lastName");

  // Access others with store.get when needed in callbacks
  const store = useChatStore();

  const handleSubmit = () => {
    const email = store.get("email");
    const age = store.get("age");
    // ...
  };

  return (
    <div>
      {firstName} {lastName}
    </div>
  );
}
// Subscribes to 2 atoms, exactly what we render
```

## Advanced Patterns

### Derived Values

```typescript
// Custom hook with derived state
export const useChatEmpty = () => {
  // ✅ Subscribe only to values used in computation
  const status = useChatValue("status");
  const messages = useChatValue("messages");
  const hasSubmitted = useChatValue("hasSubmitted");

  return !hasSubmitted && messages.length === 0 && status === "ready";
};
```

### Switching State

```typescript
export const useSwitchChat = () => {
  const store = useChatStore();
  const currentChatId = useChatValue("chatId");

  return (chatId: string) => {
    if (chatId === currentChatId) return;

    // ✅ Multiple writes with store.set
    store.set("chatId", chatId);
    store.set("newChatId", null);
    store.set("status", "syncing");
    store.get("actions").setMessages([]);
    store.set("hasSubmitted", false);
  };
};
```

### Complex Operations

```typescript
export const useRetry = () => {
  const store = useChatStore();
  // ✅ Subscribe only if we need reactivity for computation
  const messages = useChatValue("messages");

  return async (messageId?: string) => {
    const currentIdx = messageId
      ? messages.findIndex((m) => m.id === messageId)
      : messages.findLastIndex((m) => m.role === "assistant");

    // ✅ Read values with store.get - no subscription needed
    const chatId = store.get("chatId");
    const actions = store.get("actions");

    // Perform async operation...
    await deleteMessages(chatId, messageId);

    // ✅ Write with store.set
    const newMessages = messages.slice(0, currentIdx);
    actions.setMessages(newMessages);
    actions.regenerate();
  };
};
```

## Persistent State

Persist store values to cookies or localStorage by using `atomWithCookie` or `atomWithLocalStorage` directly in store definition.

### When to Use Which

| Storage      | Use Case                                             |
| ------------ | ---------------------------------------------------- |
| Cookie       | Server-side access needed, SSR hydration, small data |
| LocalStorage | Client-only, larger data, no SSR needed              |

### atomWithCookie (SSR-friendly)

**1. Store definition** - Replace primitive with `atomWithCookie`:

```typescript
import { atomWithCookie } from "@/lib/utils/atomWithCookie";

export const { useChatStore, useChatValue, ChatProvider } = createAtomStore(
  {
    isOpen: atomWithCookie("chat_isOpen", true), // ✅ Direct assignment
    // ... other state
  },
  { name: "chat" }
);
```

**2. Server-side hydration** - Read cookie and pass to Provider:

```typescript
// Layout.tsx (Server Component)
import { cookies } from "next/headers";
import { getCookieParser } from "@/lib/utils/getCookieParser";

export async function Layout({ children }) {
  const cookieStore = await cookies();
  const parser = getCookieParser(cookieStore);
  const isOpen = parser.boolean("chat_isOpen") ?? true;

  return <ChatProvider initialValues={{ isOpen }}>{children}</ChatProvider>;
}
```

**Cookie naming convention:** `prefix_key` (e.g., `chat_isOpen`, `chat_mode`)

### atomWithLocalStorage (Client-only)

```typescript
import { atomWithLocalStorage } from "@/lib/utils/atomWithLocalStorage";

export const { useAppStore, useAppValue, AppProvider } = createAtomStore(
  {
    theme: atomWithLocalStorage("app_theme", "light"),
    // ... other state
  },
  { name: "app" }
);
```

No server hydration needed - localStorage is client-only.

### Common Mistakes

```typescript
// ❌ WRONG - Don't use extend option for persistence
createAtomStore(
  { isOpen: true },
  {
    name: "chat",
    extend: (atoms) => ({ ...atoms, isOpen: someAtom }), // Unnecessary complexity
  }
);

// ✅ CORRECT - Direct assignment
createAtomStore({ isOpen: atomWithCookie("chat_isOpen", true) }, { name: "chat" });

// ❌ WRONG - Forgetting server hydration with cookies
<ChatProvider initialValues={{}}> // Cookie value ignored on first render

// ✅ CORRECT - Pass server-read value
<ChatProvider initialValues={{ isOpen }}> // Hydrated from cookie
```
