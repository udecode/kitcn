---
name: testing
description: Use when writing React hook tests, encountering test failures, flaky tests, cross-file contamination, or "Hook timed out" errors - Bun test patterns with proper spy cleanup
---

# Bun Testing Patterns

## Overview

Bun's test runner provides Jest-compatible API with TypeScript support and fast execution. **Critical**: Test globals (`describe`, `it`, `expect`, `mock`, `spyOn`, `beforeEach`, `afterEach`) are available globally via `tooling/global.d.ts` - no imports needed. **`mock.module()` is process-global** - use `spyOn()` instead.

## Setup (First-Time Installation)

### 1. bunfig.toml

```toml
[test]
# Preload scripts execute BEFORE any test file
preload = ["./tooling/test-setup.ts"]

# Coverage exclusions
coveragePathIgnorePatterns = [
  "node_modules/**",
  "**/*.d.ts",
]
```

### 2. tooling/global.d.ts

```typescript
/// <reference types="bun-types/test-globals" />

declare var mock: typeof import("bun:test").mock;
declare var spyOn: typeof import("bun:test").spyOn;
```

### 3. tooling/test-setup.ts

```typescript
import { afterEach, expect, mock, spyOn } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

// Make mock and spyOn globally available
(globalThis as any).mock = mock;
(globalThis as any).spyOn = spyOn;

// Register DOM globals synchronously
GlobalRegistrator.register();

// Ensure document.body exists
if (global.document && !global.document.body) {
  const body = global.document.createElement("body");
  global.document.documentElement.appendChild(body);
}

// Extend Bun's expect with Testing Library matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});
```

### 4. Dependencies

```bash
bun add -d @happy-dom/global-registrator @testing-library/react @testing-library/jest-dom
```

## When to Use

- Writing new tests for React hooks
- Debugging test failures, especially when tests pass individually but fail in full suite
- Fixing cross-file contamination ("test passes alone, fails with others")
- Encountering "Hook timed out", race conditions, or flaky tests

## Quick Reference

| Pattern                    | Use Case                 | Example                                                |
| -------------------------- | ------------------------ | ------------------------------------------------------ |
| No imports needed          | **Test globals**         | `describe`, `it`, `expect`, `mock`, `spyOn` are global |
| `toMatchObject(array)`     | **Array partial match**  | Checks properties exist, allows extras                 |
| `toEqual()`                | **Exact match**          | Validates complete structure                           |
| `expect(val as any)`       | **Type mismatch**        | Cast actual value, not expected                        |
| `mock()` not `jest.fn()`   | **Create mock function** | Bun test API                                           |
| `spyOn()` + `afterEach`    | **Mock with cleanup**    | Always `spy.mockRestore()`                             |
| `renderHook()` + `act()`   | **Test hooks**           | Wrap state changes in `act()`                          |
| `void act()`               | **Prevent warnings**     | Use with sync click/change events                      |
| `ReturnType<typeof mock>`  | **Type mock variables**  | `let mockFn: ReturnType<typeof mock>`                  |
| `ReturnType<typeof spyOn>` | **Type spy variables**   | `let spy: ReturnType<typeof spyOn>`                    |

## Core Patterns

### Test File Structure

```typescript
// NO bun:test imports needed - globals are available
import { act, renderHook } from "@testing-library/react";
import * as apiModule from "@/lib/api"; // Import as namespace for spyOn

describe("HookName", () => {
  let mockFunction: ReturnType<typeof mock>;
  let functionSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockFunction = mock();
    functionSpy = spyOn(apiModule, "functionName").mockImplementation(
      mockFunction
    );
    mockFunction.mockResolvedValue(defaultResponse);
  });

  afterEach(() => {
    // CRITICAL: Always restore spies
    functionSpy.mockRestore();
  });

  it("should do something", async () => {
    // Test implementation
  });
});
```

### Avoiding Cross-File Contamination

**Problem**: `mock.module()` is process-global. If `fileA.test.ts` uses `mock.module('@/lib/api')`, it contaminates `fileB.test.ts`.

**Solution**: Use `spyOn()` instead of `mock.module()`.

#### ❌ WRONG - Causes Cross-Contamination

```typescript
// This globally mocks the module for ALL test files
mock.module("@/lib/api", () => ({
  fetchData: mock(),
}));
```

#### ✅ CORRECT - File-Scoped Mocking

```typescript
import * as apiModule from "@/lib/api";

describe("MyHook", () => {
  let mockFetchData: ReturnType<typeof mock>;
  let fetchDataSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockFetchData = mock();
    fetchDataSpy = spyOn(apiModule, "fetchData").mockImplementation(
      mockFetchData
    );
    mockFetchData.mockResolvedValue({ data: "test" });
  });

  afterEach(() => {
    fetchDataSpy.mockRestore();
  });

  it("fetches data", async () => {
    const { result } = renderHook(() => useMyHook());

    await act(async () => {
      await result.current.fetch();
    });

    expect(mockFetchData).toHaveBeenCalled();
  });
});
```

**Key differences**:

1. Import module as namespace: `import * as apiModule from './api'`
2. Create spies in `beforeEach`: `spyOn(apiModule, 'function')`
3. Always `mockRestore()` in `afterEach`
4. Use mock variables in assertions: `expect(mockFn)` not `expect(apiModule.fn)`

### Testing React Hooks

```typescript
import { act, renderHook } from "@testing-library/react";

it("updates state correctly", async () => {
  const { result } = renderHook(() => useCustomHook());

  await act(async () => {
    await result.current.fetchData();
  });

  expect(result.current.data).toEqual(expectedData);
  expect(result.current.loading).toBe(false);
});

// Use void to prevent unused promise warnings
void act(() => getByText("button").click());
```

**Custom wrapper pattern** for context providers:

```typescript
const createWrapper = (props) => ({ children }: any) => (
  <Provider {...props}>{children}</Provider>
);

const wrapper = createWrapper({ value: 'test' });
const { result } = renderHook(() => useCustomHook(), { wrapper });
```

### Testing Async Errors

```typescript
it("handles async errors", async () => {
  mockFetch.mockRejectedValue(new Error("Network error"));

  const { result } = renderHook(() => useCustomHook());

  await act(async () => {
    try {
      await result.current.fetchData();
    } catch (error) {
      expect(error).toEqual(new Error("Failed to load"));
    }
  });

  expect(result.current.error).toBe("Failed to load");
});
```

### Matcher Selection

```typescript
// ✅ Array partial matching
expect(children).toMatchObject([{ text: "one" }, { text: "two" }]);

// ✅ Exact matching
expect(result).toEqual({ data: "test" });

// ✅ Cast actual value for type mismatches
expect(node as any).toEqual({ text: "one" });

// ❌ Don't cast expected value
expect(children).toEqual([{ text: "one" }] as any);

// ❌ Don't use toMatchObject() for single objects (won't catch extra props)
expect(node).toMatchObject({ text: "one" });
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific file
bun test src/hooks/useMyHook.test.ts

# Watch mode
bun test --watch

# Coverage
bun test --coverage

# Bail on first failure
bun test --bail
```

## Common Mistakes

| Mistake                        | Problem                         | Fix                                        |
| ------------------------------ | ------------------------------- | ------------------------------------------ |
| Importing from `bun:test`      | Unnecessary, globals available  | Remove imports                             |
| Using `mock.module()`          | Cross-file contamination        | Use `spyOn()` + `afterEach` cleanup        |
| Forgetting `afterEach` cleanup | Spies persist across tests      | Always `spy.mockRestore()`                 |
| Direct import for spyOn        | Can't spy on named exports      | `import * as module`                       |
| Forgetting `act()`             | React warnings, flaky tests     | Wrap state changes in `act()`              |
| `jest.fn()` / `jest.Mock`      | Wrong framework                 | Use `mock()` and `ReturnType<typeof mock>` |
| No type for mocks              | Type errors, autocomplete fails | `ReturnType<typeof mock>`                  |

## Debugging Test Failures

### Test passes alone, fails in suite

**Symptom**: `bun test file.test.ts` passes, `bun test` fails.

**Cause**: Cross-file contamination from `mock.module()`.

**Fix**:

1. Search for `mock.module()` calls
2. Refactor to `spyOn()` pattern with `afterEach` cleanup

### "Expected to be called but it was not called"

**Cause**: Wrong mock variable or wrong function name.

**Fix**:

1. Verify spy setup: `spyOn(module, 'correctFunctionName')`
2. Check assertions use mock variable: `expect(mockFn)` not `expect(module.fn)`

### "Hook timed out after 5000ms"

**Cause**: Missing `await`, unresolved promise.

**Fix**:

1. Ensure all async operations are `await`ed
2. Check mock returns resolved promises: `mockResolvedValue()`
3. Increase timeout if needed: `it('name', fn, 10000)`

## Red Flags - Cross-Contamination Risk

- Using `mock.module()` outside of preload scripts
- Importing modules directly instead of as namespace for spyOn
- Missing `afterEach()` with `mockRestore()` calls
- Tests passing individually but failing in full suite

**All indicate cross-file contamination. Refactor to spyOn pattern.**

## Implementation Checklist

For each new hook test file:

- [ ] NO imports from `bun:test` - globals are available
- [ ] Import `renderHook`, `act` from `@testing-library/react` when testing hooks
- [ ] Import modules as namespace for spyOn: `import * as module`
- [ ] Declare mock variables with `ReturnType<typeof mock>`
- [ ] Declare spy variables with `ReturnType<typeof spyOn>`
- [ ] Create spies in `beforeEach` with `spyOn(module, 'fn')`
- [ ] Set default mock return values in `beforeEach`
- [ ] **CRITICAL**: Restore spies in `afterEach` with `spy.mockRestore()`
- [ ] Wrap React state changes in `act()`
- [ ] Use mock variables in assertions, not module functions
- [ ] Verify tests pass both individually and in full suite

## TDD Workflow

1. **Red**: Write failing test for hook behavior
2. **Green**: Implement minimal code to pass test
3. **Refactor**: Clean up implementation
4. **Repeat**: Add next test case
