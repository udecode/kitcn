---
status: pending
priority: p3
issue_id: "003"
tags: [refactor, simplicity, performance, code-quality]
dependencies: []
---

# Remove Mounted Guard Pattern for Simpler Implementation

## Problem Statement

The theme toggle uses a mounted guard pattern to prevent hydration mismatches, adding 50% more code (13 lines) than necessary. The `suppressHydrationWarning` on the html element already solves this problem at the root level.

**Impact:** Unnecessary complexity, harder to understand code, slight performance overhead from extra state and effect.

## Findings

**Source:** code-simplicity-reviewer and performance-oracle agents

**Evidence:**
- Current implementation: 26 lines with mounted guard
- Simplified version: 13 lines without guard
- `suppressHydrationWarning` on `<html>` already prevents mismatch errors
- Extra useState and useEffect adds runtime overhead
- Pattern is common but often cargo-culted

**Current Code:**
```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

if (!mounted) {
  return <Button disabled><Sun /></Button>;
}
```

**Why It's Not Needed:**
- `layout.tsx` has `<html suppressHydrationWarning>`
- Theme class mismatch is suppressed
- Button itself doesn't need to prevent rendering
- next-themes handles the actual theme sync

## Proposed Solutions

### Option 1: Remove Mounted Guard (Recommended)
Delete useState, useEffect, and conditional return. Rely on suppressHydrationWarning.

**Pros:**
- 50% less code (26 → 13 lines)
- Easier to understand
- Slight performance improvement
- Removes unnecessary state
- Follows KISS principle

**Cons:**
- Potential flash of wrong icon on first render
- Less defensive programming

**Effort:** Tiny (5 minutes)
**Risk:** Low

**Simplified Code:**
```tsx
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      size="icon"
      variant="ghost"
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
```

### Option 2: Keep Mounted Guard for Safety
Leave as-is for defensive programming.

**Pros:**
- Explicitly handles hydration
- More defensive
- Prevents potential issues

**Cons:**
- Adds complexity
- Duplicates suppressHydrationWarning
- More code to maintain

**Effort:** None (current state)
**Risk:** None

### Option 3: Use CSS-Only Solution
Hide button until JS loads using CSS.

**Pros:**
- No React state needed
- Pure CSS solution
- Still defensive

**Cons:**
- Less explicit than mounted guard
- Harder to understand intent

**Effort:** Small (15 minutes)
**Risk:** Low

## Recommended Action

_(To be filled during triage)_

## Technical Details

**Affected Files:**
- `example/src/components/theme-toggle.tsx:11-19` - Mounted guard implementation

**Performance Impact:**
- Saves 1 useState allocation
- Saves 1 useEffect subscription
- Removes conditional rendering branch
- Reduces component complexity

## Acceptance Criteria

- [ ] Theme toggle renders without mounted guard
- [ ] No hydration mismatch warnings in console
- [ ] Correct icon displays on initial render
- [ ] Tests still pass
- [ ] Visual testing confirms no flash of wrong icon

## Work Log

### 2026-01-30 - Initial Finding

**By:** code-simplicity-reviewer and performance-oracle agents

**Actions:**
- Identified unnecessary mounted guard
- Calculated 50% code reduction opportunity
- Verified suppressHydrationWarning already in place

**Learnings:**
- suppressHydrationWarning at root level may make component-level guards redundant
- Common patterns aren't always necessary
- Simpler code is often better code

## Resources

- **PR:** (to be added)
- **Related Issues:** #65
- **Pattern Discussion:** https://github.com/pacocoursey/next-themes/discussions
- **React Docs:** https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors
