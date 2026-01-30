---
status: complete
priority: p1
issue_id: 65
tags: [code-review, race-condition, state-management, react]
dependencies: []
---

# DOM vs React State Desynchronization in Dark Mode Toggle

## Problem Statement

The dark mode toggle updates DOM and React state at different times, causing race conditions during rapid user interactions. DOM manipulation is synchronous while React state updates are batched, leading to desynchronization between visual state and component state.

**Why it matters:** Users who click the toggle rapidly will experience visual glitches where the theme flickers or gets stuck in the wrong state. This is a critical UX bug that makes the app feel unpolished.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:24-29`

**Evidence from julik-frontend-races-reviewer:**
```tsx
const toggleDarkMode = () => {
  const newIsDark = !isDark;
  setIsDark(newIsDark);  // Batched, scheduled for next render
  document.documentElement.classList.toggle('dark', newIsDark);  // Synchronous, immediate
  localStorage.setItem('theme', newIsDark ? 'dark' : 'light');  // Synchronous, immediate
};
```

**The race condition:**
- Click 1: DOM updates to dark, state update scheduled
- Click 2: DOM updates to light, state update scheduled
- Click 3: DOM updates to dark, state update scheduled
- React flushes all three state updates in sequence
- Final state might not match final DOM state depending on timing

## Proposed Solutions

### Option 1: Derive DOM from React State (Recommended)
**Description:** Move DOM manipulation into useEffect that depends on isDark state.

```tsx
useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  } catch (error) {
    console.warn('Failed to save theme:', error);
  }
}, [isDark]);

const toggleDarkMode = () => {
  setIsDark(!isDark);  // Single source of truth
};
```

**Pros:**
- Single source of truth (React state)
- Eliminates race conditions
- Cleaner separation of concerns
- State updates are automatically synchronized

**Cons:**
- DOM update happens after render (negligible visual delay)

**Effort:** Small (15 minutes)
**Risk:** Low (standard React pattern)

### Option 2: Use Ref for Synchronization
**Description:** Track intended state with ref to prevent stale closures.

```tsx
const isDarkRef = useRef(isDark);

const toggleDarkMode = () => {
  isDarkRef.current = !isDarkRef.current;
  setIsDark(isDarkRef.current);
  document.documentElement.classList.toggle('dark', isDarkRef.current);
  localStorage.setItem('theme', isDarkRef.current ? 'dark' : 'light');
};
```

**Pros:**
- Keeps synchronous DOM manipulation
- Prevents stale closure issues

**Cons:**
- More complex (ref + state)
- Doesn't follow React best practices
- Harder to maintain

**Effort:** Small (10 minutes)
**Risk:** Medium (adds complexity)

### Option 3: Debounce Toggle
**Description:** Prevent rapid clicks with debouncing.

**Pros:**
- Simple implementation
- Prevents user from triggering race

**Cons:**
- Doesn't fix underlying issue
- Makes UI feel sluggish
- Still has race condition for fast clickers

**Effort:** Small (5 minutes)
**Risk:** High (poor UX, doesn't solve root cause)

## Recommended Action

*To be filled during triage*

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx:24-29`

**Components Affected:**
- DarkModeToggle component
- Document root classList
- localStorage theme key

**Database Changes:** None

## Acceptance Criteria

- [ ] DOM classList always matches React state
- [ ] Rapid clicking (5+ clicks in 1 second) maintains consistent state
- [ ] localStorage value matches final visual state
- [ ] No visual flickering or glitches
- [ ] Component passes race condition test suite

## Work Log

- 2026-01-30: Initial finding from code review (julik-frontend-races-reviewer)
- 2026-01-30: Implemented Option 1 - moved DOM manipulation into useEffect
  - Created new useEffect synced to isDark state (lines 31-39)
  - Moved classList.toggle to useEffect with isDark dependency
  - Moved localStorage.setItem to useEffect with try-catch error handling
  - Simplified toggleDarkMode to only call setIsDark(!isDark)
  - React state is now single source of truth

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agent:** julik-frontend-races-reviewer (agent ID: a6581ae)
- **Pattern Reference:** React docs on effects and synchronization
