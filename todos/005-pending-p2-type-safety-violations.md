---
status: pending
priority: p2
issue_id: 65
tags: [code-review, typescript, type-safety, quality]
dependencies: []
---

# Type Safety Violations with Magic Strings

## Problem Statement

The dark mode toggle uses magic strings ('dark', 'light', 'theme') without type safety or validation. localStorage returns `string | null` but code doesn't validate values before use. If someone manually sets localStorage to an invalid value like 'blue', the code breaks silently.

**Why it matters:** Type safety prevents bugs. Without it, the component is fragile to invalid data from localStorage, user manipulation, or future code changes. This violates TypeScript best practices and Kieran's quality standards.

## Findings

**Location:** `example/src/components/dark-mode-toggle.tsx:14-18, 28`

**Evidence from kieran-typescript-reviewer:**
> **Type Safety Violations**: Magic strings without type safety. `localStorage.getItem` returns `string | null`, but we're comparing it directly. If someone manually sets localStorage to `'blue'`, this breaks silently.

**Current Code:**
```tsx
// Line 14: No type checking
const stored = localStorage.getItem('theme');  // string | null
const shouldBeDark = stored === 'dark' || (!stored && prefersDark);

// Line 28: Magic strings
localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
```

**Problems:**
1. No type definition for theme values
2. No validation of stored value
3. Magic strings scattered throughout
4. localStorage value could be anything

## Proposed Solutions

### Option 1: Type Guards with Const Assertion (Recommended)
**Description:** Define theme as a TypeScript type with validation.

```tsx
type Theme = 'light' | 'dark';
const THEMES = ['light', 'dark'] as const;
const THEME_KEY = 'theme' as const;

function isValidTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

// Usage:
const stored = localStorage.getItem(THEME_KEY);
const storedTheme = isValidTheme(stored) ? stored : null;
const shouldBeDark = storedTheme === 'dark' || (!storedTheme && prefersDark);

// Later:
localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
```

**Pros:**
- Full type safety
- Validates localStorage values
- Single source of truth for valid themes
- Prevents typos (TypeScript catches them)
- Follows TypeScript best practices

**Cons:**
- Slightly more code
- Need to import types if reused

**Effort:** Small (20 minutes)
**Risk:** Low (type safety improvement)

### Option 2: Zod Schema Validation
**Description:** Use Zod for runtime validation.

```tsx
import { z } from 'zod';

const ThemeSchema = z.enum(['light', 'dark']);
type Theme = z.infer<typeof ThemeSchema>;

const stored = localStorage.getItem('theme');
const parsed = ThemeSchema.safeParse(stored);
const storedTheme = parsed.success ? parsed.data : null;
```

**Pros:**
- Runtime validation
- Can export schema for reuse
- Type-safe by default
- Clear error messages

**Cons:**
- Dependency on Zod (though likely already in project)
- Overkill for simple enum

**Effort:** Small (15 minutes)
**Risk:** Low

### Option 3: Enum + Validation Function
**Description:** Use TypeScript enum with validation.

```tsx
enum Theme {
  Light = 'light',
  Dark = 'dark',
}

const THEME_VALUES = Object.values(Theme);

function parseTheme(value: string | null): Theme | null {
  return THEME_VALUES.includes(value as Theme) ? (value as Theme) : null;
}
```

**Pros:**
- Native TypeScript
- Strongly typed
- No dependencies

**Cons:**
- Enums are falling out of favor (const assertions preferred)
- More verbose than Option 1

**Effort:** Small (20 minutes)
**Risk:** Low

## Recommended Action

*To be filled during triage*

**Recommendation:** Option 1 (type guards) as it provides type safety without dependencies and follows modern TypeScript patterns.

## Technical Details

**Affected Files:**
- `example/src/components/dark-mode-toggle.tsx` - All theme string references

**Type Definitions to Add:**
```tsx
type Theme = 'light' | 'dark';
const THEME_KEY = 'theme' as const;
```

**Functions to Add:**
```tsx
function isValidTheme(value: string | null): value is Theme
```

**Components Affected:**
- DarkModeToggle component
- Any future theme consumers

**Database Changes:** None

## Acceptance Criteria

- [ ] Theme values use TypeScript type definition
- [ ] localStorage values validated before use
- [ ] No magic strings in code
- [ ] TypeScript catches invalid theme assignments
- [ ] Invalid localStorage values rejected gracefully
- [ ] Manual test: Set localStorage to 'invalid' → falls back correctly

## Work Log

- 2026-01-30: Initial finding from code review (kieran-typescript-reviewer)
- 2026-01-30: Implemented Option 1 (Type Guards with Const Assertion)
  - Added `type Theme = 'light' | 'dark'` definition
  - Added `THEME_KEY = 'theme' as const` constant
  - Added `isValidTheme(value: string | null): value is Theme` type guard
  - Updated localStorage.getItem to use THEME_KEY and validate with isValidTheme
  - Replaced magic string 'theme' with THEME_KEY in localStorage.setItem
  - All magic strings eliminated, full type safety implemented

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agent:** kieran-typescript-reviewer (agent ID: a055079)
- **References:**
  - TypeScript handbook: Type Guards
  - TypeScript handbook: Const Assertions
  - Kieran's review standards
