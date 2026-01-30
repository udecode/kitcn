---
status: pending
priority: p3
issue_id: "004"
tags: [performance, optimization, react]
dependencies: []
---

# Memoize Theme Toggle Handler

## Problem Statement

The theme toggle creates a new arrow function on every render, potentially causing unnecessary re-renders if the Button component is memoized or if the component re-renders frequently.

**Impact:** Minor performance inefficiency. Not critical since theme toggles are infrequent user interactions.

## Findings

**Source:** performance-oracle agent review

**Evidence:**
- Current: `onClick={() => setTheme(isDark ? 'light' : 'dark')}`
- Creates new function reference on every render
- Button component receives different onClick prop each render
- Prevents React.memo optimization if applied to Button

**Performance Impact:**
- Negligible for this use case (user action, not animation)
- Theme toggle not in hot path
- User clicks once every few hours at most
- Optimization is premature

## Proposed Solutions

### Option 1: Use useCallback with Dependencies
Memoize the handler function to maintain referential equality.

**Pros:**
- Stable function reference
- Enables potential Button memoization
- Follows React optimization patterns

**Cons:**
- Adds complexity for minimal gain
- useCallback has its own overhead
- Dependencies array can be error-prone

**Effort:** Small (10 minutes)
**Risk:** Low

**Implementation:**
```tsx
const toggleTheme = useCallback(() => {
  setTheme(isDark ? 'light' : 'dark');
}, [isDark, setTheme]);

return <Button onClick={toggleTheme} />;
```

### Option 2: Extract Handler Function
Define handler outside component or as class method.

**Pros:**
- No useCallback needed
- Simpler than useCallback

**Cons:**
- Loses access to component scope
- Requires passing isDark as parameter
- Less intuitive

**Effort:** Small (15 minutes)
**Risk:** Low

### Option 3: Do Nothing (Recommended)
Leave as-is since optimization not needed.

**Pros:**
- Simplest code
- No premature optimization
- Inline function is readable
- Performance impact unmeasurable

**Cons:**
- Not maximally optimized
- Could prevent future memo optimization

**Effort:** None
**Risk:** None

## Recommended Action

_(To be filled during triage)_

## Technical Details

**Affected Files:**
- `example/src/components/theme-toggle.tsx:27` - onClick handler

**Performance Metrics:**
- Function creation: ~0.0001ms per render
- Theme toggle frequency: ~1-5 times per session
- Total overhead: immeasurable

**React Docs Guidance:**
> "You might not need useCallback as much as you think. If you're not noticing performance problems, you can skip it."

## Acceptance Criteria

- [ ] Handler function maintains referential equality across renders
- [ ] No performance regression
- [ ] Code remains readable
- [ ] Tests still pass

## Work Log

### 2026-01-30 - Initial Finding

**By:** performance-oracle agent

**Actions:**
- Identified inline arrow function
- Assessed performance impact
- Concluded optimization premature

**Learnings:**
- Not all function recreations need memoization
- User interaction handlers rarely need useCallback
- Readability often more valuable than micro-optimization

## Resources

- **PR:** (to be added)
- **Related Issues:** #65
- **React Docs:** https://react.dev/reference/react/useCallback#should-you-add-usecallback-everywhere
- **Performance:** https://kentcdodds.com/blog/usememo-and-usecallback
