---
status: complete
priority: p2
issue_id: 65
tags: [code-review, error-handling, defensive-programming]
dependencies: []
---

# Missing Error Handling for localStorage Access

## Problem Statement

The dark mode toggle accesses localStorage without error handling. localStorage can throw exceptions in private browsing mode (Safari), when quota is exceeded, or in cross-origin contexts. This will crash the component and break the entire page.

**Why it matters:** While uncommon, localStorage failures do occur in the wild (private browsing, corporate restrictions, storage quota). Without error handling, users in these scenarios get a broken app instead of graceful degradation.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:14, 28`

**Evidence from multiple reviewers:**
- security-sentinel: "Missing error handling for localStorage (Priority: MEDIUM)"
- performance-oracle: "No error handling for localStorage access"

**Current Code:**
```tsx
// Line 14 - Can throw in private browsing
const stored = localStorage.getItem('theme');

// Line 28 - Can throw when quota exceeded
localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
```

**Failure scenarios:**
1. Safari private browsing - throws SecurityError
2. Storage quota exceeded - throws QuotaExceededError
3. Cross-origin iframe - throws SecurityError
4. Browser extensions blocking - throws Error

## Proposed Solutions

### Option 1: Try-Catch with Fallback (Recommended)
**Description:** Wrap localStorage access in try-catch, fall back to system preference.

```tsx
const safeLocalStorage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('localStorage unavailable:', error);
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  },
};

useEffect(() => {
  setMounted(true);
  const stored = safeLocalStorage.get('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = stored === 'dark' || (!stored && prefersDark);
  setIsDark(shouldBeDark);
  document.documentElement.classList.toggle('dark', shouldBeDark);
}, []);

const toggleDarkMode = () => {
  const newIsDark = !isDark;
  setIsDark(newIsDark);
  document.documentElement.classList.toggle('dark', newIsDark);
  safeLocalStorage.set('theme', newIsDark ? 'dark' : 'light');
};
```

**Pros:**
- Defensive programming
- Graceful degradation
- Still works in restricted environments
- Clear console warnings for debugging

**Cons:**
- Slightly more code
- Silent failures (but logged)

**Effort:** Small (15 minutes)
**Risk:** Low (safety improvement)

### Option 2: Check localStorage Availability First
**Description:** Test if localStorage is available before using it.

```tsx
const isLocalStorageAvailable = () => {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const hasLocalStorage = isLocalStorageAvailable();

// Later use:
if (hasLocalStorage) {
  const stored = localStorage.getItem('theme');
  // ...
}
```

**Pros:**
- Explicit availability check
- Avoids repeated try-catch

**Cons:**
- Availability can change between check and use
- More complex
- Still need try-catch for quota exceeded

**Effort:** Small (20 minutes)
**Risk:** Low

### Option 3: User Notification
**Description:** Add error handling with user-visible toast notification.

```tsx
const toggleDarkMode = () => {
  // ... toggle logic ...
  try {
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
  } catch (error) {
    toast.error('Unable to save theme preference');
  }
};
```

**Pros:**
- User knows something went wrong
- Clear feedback

**Cons:**
- Requires toast library
- May be noisy for unavoidable failures
- Doesn't solve the core issue

**Effort:** Small (10 minutes, if toast lib exists)
**Risk:** Low

## Recommended Action

*To be filled during triage*

**Recommendation:** Option 1 (try-catch with fallback) as it provides the best balance of safety and UX without dependencies.

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx:14, 28`

**Components Affected:**
- DarkModeToggle component
- localStorage access points

**Database Changes:** None

**Error Types to Handle:**
- SecurityError (private browsing, cross-origin)
- QuotaExceededError (storage full)
- Generic Error (blocked by extensions)

## Acceptance Criteria

- [ ] Component doesn't crash when localStorage is unavailable
- [ ] Falls back to system preference when localStorage fails
- [ ] Console warnings logged for debugging
- [ ] Theme toggle still works (just doesn't persist)
- [ ] Manual test: Run in Safari private browsing → no errors
- [ ] Manual test: Fill localStorage quota → graceful degradation

## Work Log

- 2026-01-30: Initial finding from code review (security-sentinel, performance-oracle)
- 2026-01-30: Implemented Option 1 - Added safeLocalStorage helper with try-catch, replaced all localStorage access points

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agents:**
  - security-sentinel (agent ID: a2391b0)
  - performance-oracle (agent ID: ac5f3c1)
- **References:**
  - MDN: localStorage exceptions
  - Safari private browsing behavior
