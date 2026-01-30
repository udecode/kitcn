---
status: pending
priority: p3
issue_id: 65
tags: [code-review, memory-leak, cleanup, future-proofing]
dependencies: []
---

# Missing matchMedia Cleanup / Listener Pattern

## Problem Statement

The dark mode toggle creates a `matchMedia` object to check system preference but doesn't add a listener or cleanup. Currently harmless, but if someone later adds a listener to detect system preference changes at runtime, they'll likely forget cleanup, creating a memory leak that accumulates on every mount/unmount cycle.

**Why it matters:** This is future technical debt. When the inevitable feature request comes ("auto-switch when system theme changes"), the developer will add an event listener without cleanup because the pattern isn't established. Document this now or set up the pattern correctly from the start.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:15-17`

**Evidence from multiple reviewers:**
- julik-frontend-races-reviewer: "Missing Cleanup Opportunity (Severity: Low)"
- kieran-typescript-reviewer: "Missing Cleanup - No cleanup for media query listener"
- pattern-recognition-specialist: "Memory Leak Risk - Creates matchMedia object but doesn't add listener for runtime changes"

**Current Code:**
```tsx
// Line 15-17: One-time check, no listener
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
```

**Pattern in codebase (`use-mobile.ts`):**
```tsx
const mql = window.matchMedia('(max-width: 768px)');
const onChange = () => setIsMobile(window.innerWidth < 768);
mql.addEventListener('change', onChange);
setIsMobile(mql.matches);
return () => mql.removeEventListener('change', onChange);
```

## Proposed Solutions

### Option 1: Add Listener + Cleanup Now (Recommended)
**Description:** Set up the full pattern now to prevent future mistakes.

```tsx
useEffect(() => {
  setMounted(true);

  const stored = localStorage.getItem('theme');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Initial check
  const shouldBeDark = stored === 'dark' || (!stored && mediaQuery.matches);
  setIsDark(shouldBeDark);
  document.documentElement.classList.toggle('dark', shouldBeDark);

  // Listen for system preference changes
  const handleChange = (e: MediaQueryListEvent) => {
    // Only update if no explicit preference stored
    if (!localStorage.getItem('theme')) {
      setIsDark(e.matches);
      document.documentElement.classList.toggle('dark', e.matches);
    }
  };

  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}, []);
```

**Pros:**
- Follows codebase pattern (`use-mobile.ts`)
- Prevents future memory leaks
- Actually useful feature (respects runtime OS theme changes)
- Proper cleanup pattern established

**Cons:**
- Adds complexity
- Technically not needed right now

**Effort:** Small (15 minutes)
**Risk:** Low

### Option 2: Document Intent with Comment
**Description:** Add comment explaining the intentional choice.

```tsx
// Note: matchMedia is only used for initial check, not listening to changes.
// If you add a listener later, remember to clean up:
// return () => mediaQuery.removeEventListener('change', handler);
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
```

**Pros:**
- No code changes
- Prevents future mistakes
- Documents intent

**Cons:**
- Comments can be missed
- Doesn't establish the pattern

**Effort:** Trivial (1 minute)
**Risk:** None

### Option 3: Extract to Hook
**Description:** Create `useSystemPreference()` hook with proper cleanup.

```tsx
// hooks/use-system-preference.ts
export function useSystemPreference(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDark(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersDark;
}
```

**Pros:**
- Reusable
- Proper pattern
- Testable

**Cons:**
- Over-engineering for single use
- More files

**Effort:** Small (20 minutes)
**Risk:** Low

## Recommended Action

*To be filled during triage*

**Recommendation:** Option 1 if we want system theme tracking, Option 2 if we don't care about runtime changes.

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx:15-17`

**Components Affected:**
- DarkModeToggle component
- matchMedia usage

**Similar Patterns:**
- `/home/runner/work/better-convex/better-convex/example/src/hooks/use-mobile.ts` - Proper matchMedia cleanup

**Database Changes:** None

## Acceptance Criteria

**If Option 1 (Add Listener):**
- [ ] matchMedia listener added with cleanup
- [ ] System theme changes reflected in app (if no explicit preference set)
- [ ] No memory leaks on component unmount
- [ ] Listener only active when no stored preference exists
- [ ] Manual test: Change OS theme → app updates

**If Option 2 (Document):**
- [ ] Comment added explaining cleanup pattern
- [ ] Reference to use-mobile.ts pattern included

## Work Log

- 2026-01-30: Initial finding from code review (multiple agents)
- 2026-01-30: Implemented Option 1 - Added matchMedia listener with proper cleanup following use-mobile.ts pattern. Listener responds to system preference changes only when no explicit localStorage preference exists.

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agents:**
  - julik-frontend-races-reviewer (agent ID: a6581ae)
  - kieran-typescript-reviewer (agent ID: a055079)
  - pattern-recognition-specialist (agent ID: ace009c)
- **Pattern Reference:** `/home/runner/work/better-convex/better-convex/example/src/hooks/use-mobile.ts`
