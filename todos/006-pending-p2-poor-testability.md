---
status: pending
priority: p2
issue_id: 65
tags: [code-review, testing, architecture, refactoring]
dependencies: []
---

# Poor Testability Due to Browser API Coupling

## Problem Statement

The dark mode toggle directly couples to browser APIs (localStorage, window.matchMedia, document.documentElement), making it extremely difficult to test without extensive mocking. The component violates the principle "hard-to-test code = poor structure."

**Why it matters:** Untestable code leads to bugs in production because behavior can't be verified. Without tests, refactoring becomes risky. This violates Kieran's quality standards where testability is a primary indicator of good design.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:14-21, 24-29`

**Evidence from kieran-typescript-reviewer:**
> **Poor Testability**: Direct browser API coupling makes testing difficult. Without mocking `localStorage`, `window.matchMedia`, and DOM manipulation, this is untestable. Hard-to-test code = poor structure.

**Current Code:**
```tsx
useEffect(() => {
  // Direct browser API access - requires mocking
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', shouldBeDark);
}, []);

const toggleDarkMode = () => {
  // More direct manipulation
  document.documentElement.classList.toggle('dark', newIsDark);
  localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
};
```

**Testing challenges:**
1. Must mock `localStorage` global
2. Must mock `window.matchMedia`
3. Must mock `document.documentElement.classList`
4. DOM manipulation side effects hard to verify
5. Can't test theme logic in isolation

## Proposed Solutions

### Option 1: Extract Theme Hook (Recommended)
**Description:** Extract all theme logic to a custom `useDarkMode` hook that can be tested independently.

```tsx
// hooks/use-dark-mode.ts
type Theme = 'light' | 'dark';

interface ThemeStorage {
  get(): Theme | null;
  set(theme: Theme): void;
}

interface UseThemeOptions {
  storage?: ThemeStorage;
  getSystemPreference?: () => boolean;
}

export function useDarkMode(options?: UseThemeOptions): [boolean, () => void] {
  const storage = options?.storage ?? {
    get: () => localStorage.getItem('theme') as Theme | null,
    set: (theme) => localStorage.setItem('theme', theme),
  };

  const getSystemPreference = options?.getSystemPreference ??
    (() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [isDark, setIsDark] = useState(() => {
    const stored = storage.get();
    return stored === 'dark' || (stored === null && getSystemPreference());
  });

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      storage.set(next ? 'dark' : 'light');
      return next;
    });
  }, [storage]);

  return [isDark, toggle];
}

// component usage
export function DarkModeToggle() {
  const [isDark, toggle] = useDarkMode();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return <Button onClick={toggle}>...</Button>;
}

// test example
test('useDarkMode returns dark when stored', () => {
  const mockStorage = {
    get: () => 'dark' as const,
    set: vi.fn(),
  };

  const { result } = renderHook(() => useDarkMode({ storage: mockStorage }));
  expect(result.current[0]).toBe(true);
});
```

**Pros:**
- Theme logic testable in isolation
- No browser mocking needed in hook tests
- Reusable across components
- Follows codebase pattern (`use-mobile.ts`, `use-mounted.ts`)
- Dependency injection for easy testing

**Cons:**
- More files
- Requires refactoring

**Effort:** Medium (1-2 hours)
**Risk:** Low (improves architecture)

### Option 2: Adapter Pattern
**Description:** Create adapter interfaces for browser APIs.

```tsx
interface StorageAdapter {
  getTheme(): string | null;
  setTheme(theme: string): void;
}

interface SystemPreferenceAdapter {
  prefersDark(): boolean;
}

interface DOMAdapter {
  applyTheme(isDark: boolean): void;
}

// Real implementations
const browserStorage: StorageAdapter = {
  getTheme: () => localStorage.getItem('theme'),
  setTheme: (theme) => localStorage.setItem('theme', theme),
};

// Mock implementations for tests
const mockStorage: StorageAdapter = {
  getTheme: () => 'dark',
  setTheme: vi.fn(),
};
```

**Pros:**
- Clean separation of concerns
- Easy to mock for tests
- Explicit dependencies

**Cons:**
- More boilerplate
- Over-engineering for simple component

**Effort:** Medium (1.5 hours)
**Risk:** Low

### Option 3: Add Test Utilities
**Description:** Keep component as-is, create comprehensive test mocks.

```tsx
// test-utils/setup.ts
export function mockBrowserAPIs() {
  const storage = new Map<string, string>();
  global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    // ...
  };

  global.window.matchMedia = vi.fn((query) => ({
    matches: false,
    addEventListener: vi.fn(),
    // ...
  }));
}
```

**Pros:**
- No component changes
- Quick solution

**Cons:**
- Doesn't improve architecture
- Tests still complex
- Mocking global state is fragile

**Effort:** Small (30 minutes)
**Risk:** Medium (doesn't address root cause)

## Recommended Action

*To be filled during triage*

**Recommendation:** Option 1 (extract theme hook) as it improves both testability and architecture, following existing codebase patterns.

## Technical Details

**Files to Create:**
- `example/src/hooks/use-dark-mode.ts` - Extracted theme logic
- `example/src/hooks/use-dark-mode.test.ts` - Unit tests

**Files to Modify:**
- `example/src/components/dark-mode-toggle.tsx` - Use new hook

**Existing Patterns to Follow:**
- `example/src/hooks/use-mobile.ts` - Similar pattern with window API
- `example/src/hooks/use-mounted.ts` - Hook extraction pattern

**Components Affected:**
- DarkModeToggle component

**Database Changes:** None

## Acceptance Criteria

- [ ] Theme logic extracted to testable hook
- [ ] Hook has >80% test coverage
- [ ] Tests don't require browser API mocking
- [ ] Component still works identically
- [ ] Test: theme defaults to system preference
- [ ] Test: stored theme overrides system preference
- [ ] Test: toggle changes theme
- [ ] Test: theme persists across hook instances

## Work Log

- 2026-01-30: Initial finding from code review (kieran-typescript-reviewer)

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agent:** kieran-typescript-reviewer (agent ID: a055079)
- **Pattern Examples:**
  - `/home/runner/work/better-convex/better-convex/example/src/hooks/use-mobile.ts`
  - `/home/runner/work/better-convex/better-convex/example/src/hooks/use-mounted.ts`
  - `/home/runner/work/better-convex/better-convex/example/src/hooks/use-random.ts`
