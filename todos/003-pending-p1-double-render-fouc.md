---
status: pending
priority: p1
issue_id: 65
tags: [code-review, performance, ux, react, hydration]
dependencies: []
---

# Double-Render Causes Flash of Wrong Theme

## Problem Statement

The dark mode toggle causes a visible flash of incorrect theme (FOUC - Flash of Unstyled Content) on every page load. Users see the Sun icon briefly before it switches to Moon icon if they prefer dark mode. This happens because the component renders twice with different states during hydration.

**Why it matters:** Every user sees this flash on every page load. It makes the app feel cheap and unpolished - like watching poorly synchronized subtitles. This is a universal UX degradation that affects 100% of page loads.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:11-22, 32-43`

**Evidence from multiple reviewers:**
- julik-frontend-races-reviewer: "FOUC on Mount (Severity: High)"
- performance-oracle: "Eliminate Flash of Wrong Theme"
- architecture-strategist: "Flash of Incorrect Theme (FOIT)"

**The render sequence:**
1. SSR renders with `mounted=false` → Sun icon appears
2. Hydration matches → Still Sun icon
3. `useEffect` fires, calls `setMounted(true)` → Re-render #1 with Sun icon (isDark still false)
4. Same tick: localStorage check completes, determines theme is dark
5. `setIsDark(true)` is called → Re-render #2 with Moon icon

**Current Code:**
```tsx
const [isDark, setIsDark] = useState(false);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);  // Causes re-render #1
  // ... theme detection logic ...
  setIsDark(shouldBeDark);  // Causes re-render #2
  document.documentElement.classList.toggle('dark', shouldBeDark);
}, []);

if (!mounted) return <Button><Sun /></Button>;
return <Button>{isDark ? <Moon /> : <Sun />}</Button>;
```

## Proposed Solutions

### Option 1: Blocking Script in Layout (Recommended)
**Description:** Add inline script in app layout head to apply theme class before React hydrates.

```tsx
// app/layout.tsx in <head>
<script dangerouslySetInnerHTML={{
  __html: `
    (function() {
      try {
        var theme = localStorage.getItem('theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (theme === 'dark' || (!theme && prefersDark)) {
          document.documentElement.classList.add('dark');
        }
      } catch(e) {}
    })();
  `
}} />
```

**Pros:**
- Eliminates flash completely (0ms)
- Runs before any React code
- Industry standard pattern (used by next-themes, etc.)
- No changes to component needed

**Cons:**
- Inline script (small security consideration, but safe for localStorage)
- Code duplication (theme logic in 2 places)

**Effort:** Small (10 minutes)
**Risk:** Low (well-established pattern)

### Option 2: Batch State Updates
**Description:** Use startTransition to batch both state updates.

```tsx
useEffect(() => {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = stored === 'dark' || (!stored && prefersDark);

  document.documentElement.classList.toggle('dark', shouldBeDark);

  startTransition(() => {
    setMounted(true);
    setIsDark(shouldBeDark);
  });
}, []);
```

**Pros:**
- Reduces re-renders from 3 to 2
- No additional files needed
- Uses React 18 feature

**Cons:**
- Still has flash (just shorter)
- Doesn't eliminate the problem
- useTransition is low-priority update

**Effort:** Small (5 minutes)
**Risk:** Low

### Option 3: useLayoutEffect + Synchronous Init
**Description:** Switch to useLayoutEffect and initialize state synchronously.

```tsx
const getInitialTheme = () => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return stored === 'dark' || (!stored && prefersDark);
};

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
}
```

**Pros:**
- Runs before browser paint
- Reduces flash by 16-32ms (1-2 frames)
- Cleaner component logic

**Cons:**
- Still has brief flash
- useLayoutEffect can cause SSR warnings

**Effort:** Small (10 minutes)
**Risk:** Low

### Option 4: Cookie-Based SSR (Most Complete)
**Description:** Store theme in cookie, read on server, apply class to <html> tag during SSR.

```tsx
// app/layout.tsx (server component)
export default function RootLayout({ children }) {
  const theme = cookies().get('theme')?.value ?? 'light';
  return (
    <html className={theme}>
      <body>
        <ThemeProvider defaultTheme={theme}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Pros:**
- Zero flash (server-rendered correctly)
- Best UX
- Enables proper SSR for theme

**Cons:**
- Requires cookie instead of localStorage
- More significant refactor
- Need theme provider

**Effort:** Medium (1-2 hours)
**Risk:** Medium (larger change)

## Recommended Action

*To be filled during triage*

**Immediate recommendation:** Option 1 (blocking script) for quick fix with zero flash. Option 4 (cookie-based SSR) for long-term architecture.

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx` - Component logic
- `example/src/app/layout.tsx` - Add blocking script or cookie handling

**Components Affected:**
- DarkModeToggle component
- Document root classList
- Page layout hydration

**Database Changes:** None

**Performance Impact:**
- Current: 3 renders on mount (~1.5ms)
- Option 1: 2 renders, 0ms flash
- Option 2: 2 renders, <16ms flash
- Option 4: 1 render, 0ms flash

## Acceptance Criteria

- [ ] No visible flash of wrong icon on page load
- [ ] Theme applies before first paint
- [ ] Works correctly in both light and dark modes
- [ ] System preference detection still works
- [ ] No console errors or warnings
- [ ] Manual test: Clear localStorage, reload page in dark mode preference → no Sun flash

## Work Log

- 2026-01-30: Initial finding from code review (multiple agents)
- 2026-01-30: Implemented Option 1 (blocking script in layout head) - added inline script to apply theme class before React hydrates, eliminating flash

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agents:**
  - julik-frontend-races-reviewer (agent ID: a6581ae)
  - performance-oracle (agent ID: ac5f3c1)
  - architecture-strategist (agent ID: a1e80e8)
- **Pattern References:**
  - next-themes library implementation
  - Next.js docs on avoiding FOUC
  - React docs on useLayoutEffect
