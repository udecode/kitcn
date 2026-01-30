---
status: complete
priority: p2
issue_id: 65
tags: [code-review, code-duplication, refactoring, react]
dependencies: []
---

# Should Use Existing useMounted Hook

## Problem Statement

The dark mode toggle reimplements mounting detection with `useState` + `useEffect`, but the codebase already has a `useMounted` hook that handles this correctly using React 18's `useSyncExternalStore`. This is code duplication that violates DRY and misses a more idiomatic implementation.

**Why it matters:** The existing hook is more correct (uses `useSyncExternalStore`), more performant, and already tested. Reimplementing this pattern adds unnecessary code and maintenance burden.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:8-12, 32-33`

**Evidence from pattern-recognition-specialist:**
> **PATTERN DUPLICATION**: Codebase already has `/example/src/hooks/use-mounted.ts` that handles mounting state using React 18's `useSyncExternalStore` (more idiomatic)

**Current Implementation (dark-mode-toggle.tsx):**
```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
  // ... other logic
}, []);

if (!mounted) {
  return <Button>...</Button>;
}
```

**Existing Hook (use-mounted.ts):**
```tsx
export const useMounted = () => {
  return useSyncExternalStore(
    subscribe,
    () => true,  // client
    () => false  // server
  );
};
```

**Why existing hook is better:**
- Uses React 18's `useSyncExternalStore` (designed for this exact use case)
- No unnecessary state update on mount
- More efficient (no re-render from `setMounted(true)`)
- Already tested and used in codebase

## Proposed Solutions

### Option 1: Use Existing Hook (Recommended)
**Description:** Replace manual mounting detection with `useMounted` hook.

```tsx
import { useMounted } from '@/hooks/use-mounted';

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    // Only runs on mount, no setMounted call needed
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = stored === 'dark' || (!stored && prefersDark);

    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  if (!mounted) {
    return (
      <Button aria-label="Toggle dark mode" size="sm" variant="ghost">
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button onClick={toggleDarkMode} aria-label="Toggle dark mode" size="sm" variant="ghost">
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{isDark ? 'Dark' : 'Light'}</span>
    </Button>
  );
}
```

**Pros:**
- Uses existing tested code
- More idiomatic React 18 pattern
- Reduces re-renders by 1 (no `setMounted` call)
- Follows codebase patterns
- Less code to maintain

**Cons:**
- Requires import

**Effort:** Small (5 minutes)
**Risk:** Low (using existing, tested hook)

### Option 2: Inline useSyncExternalStore
**Description:** Use `useSyncExternalStore` directly without helper hook.

```tsx
import { useSyncExternalStore } from 'react';

const mounted = useSyncExternalStore(
  () => () => {},  // subscribe (no-op)
  () => true,       // client
  () => false       // server
);
```

**Pros:**
- No additional imports
- Direct React API usage

**Cons:**
- Reinvents the wheel (hook already exists)
- Less clear than named hook
- Need to understand `useSyncExternalStore` pattern

**Effort:** Small (10 minutes)
**Risk:** Low

### Option 3: Keep Current Implementation
**Description:** Do nothing, accept the duplication.

**Pros:**
- No changes needed
- Works correctly

**Cons:**
- Code duplication
- Less efficient (extra re-render)
- Doesn't follow codebase patterns
- Harder to maintain

**Effort:** None
**Risk:** None (but technical debt)

## Recommended Action

*To be filled during triage*

**Recommendation:** Option 1 (use existing hook) - it's a 5-minute change that improves consistency and reduces code.

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx` - Replace mounting logic

**Code Changes:**
- Remove: `const [mounted, setMounted] = useState(false);`
- Remove: `setMounted(true);` from useEffect
- Add: `import { useMounted } from '@/hooks/use-mounted';`
- Add: `const mounted = useMounted();`

**Components Affected:**
- DarkModeToggle component

**Performance Impact:**
- Current: 3 renders on mount
- After: 2 renders on mount (eliminate setMounted re-render)

**Database Changes:** None

## Acceptance Criteria

- [ ] Component uses `useMounted` hook
- [ ] Manual mounting state removed
- [ ] Component behavior unchanged
- [ ] No additional re-renders
- [ ] Import path correct
- [ ] Tests still pass

## Work Log

- 2026-01-30: Initial finding from code review (pattern-recognition-specialist)
- 2026-01-30: Replaced manual mounting detection with `useMounted` hook in dark-mode-toggle.tsx
  - Added import: `import { useMounted } from '@/hooks/use-mounted';`
  - Replaced `const [mounted, setMounted] = useState(false)` with `const mounted = useMounted()`
  - Removed `setMounted(true)` call from useEffect
  - Component behavior preserved, hydration mismatch prevention intact
  - Reduces re-renders by 1 (eliminates setMounted call)

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agent:** pattern-recognition-specialist (agent ID: ace009c)
- **Existing Hook:** `/home/runner/work/better-convex/better-convex/example/src/hooks/use-mounted.ts`
- **React Docs:** useSyncExternalStore
