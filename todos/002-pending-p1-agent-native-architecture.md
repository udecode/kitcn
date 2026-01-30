---
status: pending
priority: p1
issue_id: 65
tags: [code-review, agent-native, architecture, convex]
dependencies: []
---

# Dark Mode Toggle Not Agent-Accessible

## Problem Statement

The dark mode toggle feature is completely inaccessible to agents - a critical violation of agent-native architecture principles. Agents cannot read current theme state, toggle dark mode, or persist theme preferences. This creates capability asymmetry where users can control theme but agents cannot.

**Why it matters:** If a user says "switch to dark mode" or "what theme am I using?", the agent has no capability to help. This violates the core principle that agents should have parity with users.

## Findings

**Agent-Native Score: 0/3** capabilities are agent-accessible:
- ❌ Toggle theme
- ❌ Read current theme
- ❌ Persist theme preference server-side

**Evidence from agent-native-reviewer:**

**Location:** `example/src/components/dark-mode-toggle.tsx`
- Theme state stored only in client localStorage (line 14, 28)
- No Convex queries/mutations for theme access
- No agentation tools configured
- No server-side persistence in user schema

**Current Implementation:**
```tsx
// Client-only, agent-invisible
const stored = localStorage.getItem('theme');
localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
```

**Missing Infrastructure:**
- No `convex/routers/preferences.ts` with theme functions
- No `theme` field in user schema (`convex/functions/schema.ts`)
- No agentation tool configuration in layout

## Proposed Solutions

### Option 1: Server-Backed Theme with Convex (Recommended)
**Description:** Add theme field to user schema, create Convex queries/mutations, update component to use Convex instead of localStorage.

```typescript
// convex/routers/preferences.ts (new file)
export const getTheme = authQuery
  .output(z.object({ theme: z.enum(['light', 'dark', 'system']) }))
  .query(async ({ ctx }) => {
    const user = await ctx.table('user').getX(ctx.userId);
    return { theme: user.theme ?? 'system' };
  });

export const setTheme = authMutation
  .input(z.object({ theme: z.enum(['light', 'dark', 'system']) }))
  .mutation(async ({ ctx, input }) => {
    await ctx.table('user').getX(ctx.userId).patch({ theme: input.theme });
    return { success: true };
  });

// convex/functions/schema.ts
user: defineEnt({
  // ... existing fields
  theme: v.optional(v.union(
    v.literal('light'),
    v.literal('dark'),
    v.literal('system')
  )),
})

// example/src/components/dark-mode-toggle.tsx
const { data: themeData } = useQuery(api.preferences.getTheme);
const setThemeMutation = useMutation(api.preferences.setTheme);

const toggleDarkMode = () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  setThemeMutation({ theme: newTheme });
};
```

**Pros:**
- Full agent accessibility
- Syncs across devices
- Single source of truth
- Leverages existing Convex infrastructure
- Enables future features (theme presets, schedules)

**Cons:**
- Requires authentication (users must be logged in)
- Migration needed for existing localStorage users

**Effort:** Medium (2-3 hours)
**Risk:** Low (uses established patterns)

### Option 2: Hybrid Approach (localStorage + Server)
**Description:** Keep localStorage for guest users, sync to Convex for authenticated users.

```tsx
const { data: themeData } = useQuery(api.preferences.getTheme);
const isAuthenticated = !!themeData;

const toggleDarkMode = () => {
  const newTheme = ...;
  if (isAuthenticated) {
    setThemeMutation({ theme: newTheme });
  } else {
    localStorage.setItem('theme', newTheme);
  }
};
```

**Pros:**
- Works for both guest and authenticated users
- Gradual migration path
- No breaking changes

**Cons:**
- More complex (two code paths)
- Agents still can't help guest users
- Harder to maintain

**Effort:** Medium (2-3 hours)
**Risk:** Medium (complexity)

### Option 3: Agentation Tools Only (Not Recommended)
**Description:** Keep localStorage but add agentation tools that manipulate it.

**Pros:**
- Minimal changes to existing code

**Cons:**
- Doesn't solve cross-device sync
- localStorage manipulation from server is hacky
- Still no server-side state
- Partial solution only

**Effort:** Small (1 hour)
**Risk:** High (technical debt, doesn't address root cause)

## Recommended Action

*To be filled during triage*

## Technical Details

**Files to Create:**
- `convex/routers/preferences.ts` - Theme queries/mutations

**Files to Modify:**
- `convex/functions/schema.ts` - Add theme field to user table
- `example/src/components/dark-mode-toggle.tsx` - Replace localStorage with Convex
- System prompt or agentation config - Document theme tools

**Components Affected:**
- DarkModeToggle component
- User schema
- Agent capabilities

**Database Changes:**
- Add `theme` field to `user` table (optional enum: 'light' | 'dark' | 'system')

## Acceptance Criteria

- [ ] Agent can read current user theme via Convex query
- [ ] Agent can toggle theme via Convex mutation
- [ ] Theme syncs across devices for authenticated users
- [ ] Agent receives theme state in system prompt/context
- [ ] E2E test: "Agent toggles dark mode and verifies state change"
- [ ] Documentation includes agent-accessible theme tools

## Work Log

- 2026-01-30: Initial finding from code review (agent-native-reviewer)

## Resources

- **PR:** https://github.com/udecode/better-convex/pull/TBD
- **Related Issue:** #65
- **Review Agent:** agent-native-reviewer (agent ID: aafe382)
- **Codebase Examples:**
  - Existing CRPC setup: `convex/lib/crpc.ts`
  - Existing auth patterns: `convex/routers/*.ts`
  - Existing agentation integration: `example/src/app/layout.tsx:39`
