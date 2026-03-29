---
title: "fix: skipUnauth queries not resolving with @convex-dev/auth"
type: fix
date: 2026-01-27
deepened: 2026-01-27
---

# fix: skipUnauth queries not resolving with @convex-dev/auth

## Enhancement Summary

**Deepened on:** 2026-01-27
**Sections enhanced:** 6
**Research agents used:** kieran-typescript-reviewer, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist, security-sentinel, best-practices-researcher, framework-docs-researcher

### Key Improvements
1. **Alternative cleaner pattern** - Context provides auth value directly, eliminating conditional hook calls
2. **Must also fix useAuth()** - Same pattern issue exists in `useAuth()` hook (lines 100-133)
3. **Type safety improvements** - Explicit return types, context types, eslint-disable comments
4. **Security validated** - Fix is security-safe, server-side enforcement unchanged

### New Considerations Discovered
- Pattern recognition specialist identified a cleaner approach that eliminates hooks rule violations
- Dev-mode warning recommended for misconfiguration detection
- Testing strategies for context-dependent hooks

---

## Overview

Queries with `skipUnauth: true` never resolve for users using `@convex-dev/auth` (React Native). PR #44 introduced a regression where `useSafeConvexAuth()` assumes no auth exists when `authStore.store` is undefined, but `@convex-dev/auth` users don't use kitcn's `AuthProvider`.

**Issue:** [#52](https://github.com/udecode/kitcn/issues/52)
**Regression from:** [PR #44](https://github.com/udecode/kitcn/pull/44)

## Problem Statement

### Current Behavior

```typescript
// auth-store.tsx:87-98
export function useSafeConvexAuth() {
  const authStore = useAuthStore();

  // BUG: authStore.store is undefined for @convex-dev/auth users
  if (!authStore.store) {
    return { isAuthenticated: false, isLoading: false }; // Always returns this!
  }

  return useConvexAuth();
}
```

**Flow for @convex-dev/auth users:**
1. User wraps app with `ConvexProviderWithAuth` (from `@convex-dev/auth`)
2. No `AuthProvider` from kitcn → `authStore.store` is undefined
3. `useSafeConvexAuth()` returns `{ isAuthenticated: false, isLoading: false }`
4. `useAuthSkip()` condition: `(!isAuthenticated && !isAuthLoading && !!opts?.skipUnauth)` → TRUE
5. Query is ALWAYS skipped, never resolves

### Expected Behavior

Queries with `skipUnauth: true` should:
- Execute when user is authenticated (via any auth provider)
- Skip (return null) when user is not authenticated
- Wait during auth loading phase

### Research Insights - Problem Analysis

**Framework docs research confirmed:**
- `ConvexAuthContext` is **NOT exported** from Convex SDK - cannot detect provider directly
- `useConvexAuth()` throws if called outside `ConvexProviderWithAuth` (cannot try/catch)
- `authStore.store` check is the correct jotai-x pattern per library docs

---

## Proposed Solution

### Approach A: Context Bridge (Original Plan)

Create a `ConvexAuthAvailableContext` that signals whether `useConvexAuth()` is safe to call.

```typescript
// auth-store.tsx

type ConvexAuthResult = { isAuthenticated: boolean; isLoading: boolean };

const ConvexAuthAvailableContext = createContext<boolean>(false);

export function useSafeConvexAuth(): ConvexAuthResult {
  const authStore = useAuthStore();
  const convexAuthAvailable = useContext(ConvexAuthAvailableContext);

  if (authStore.store) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexAuth();
  }

  if (convexAuthAvailable) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexAuth();
  }

  return { isAuthenticated: false, isLoading: false };
}

/**
 * Bridge for @convex-dev/auth users who don't use better-auth.
 * Wrap your app with this inside ConvexProviderWithAuth.
 *
 * @example
 * <ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
 *   <ConvexAuthBridge>
 *     <App />
 *   </ConvexAuthBridge>
 * </ConvexProviderWithAuth>
 */
export function ConvexAuthBridge({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthAvailableContext.Provider value={true}>
      {children}
    </ConvexAuthAvailableContext.Provider>
  );
}
```

### Research Insights - Alternative Pattern

**Pattern recognition specialist recommends Approach B** - eliminates conditional hook calls entirely:

### Approach B: Context Provides Value (Recommended)

```typescript
// auth-store.tsx

type ConvexAuthResult = { isAuthenticated: boolean; isLoading: boolean };

// Context that HOLDS the auth value (not just a boolean signal)
const ConvexAuthContext = createContext<ConvexAuthResult | null>(null);

export function useSafeConvexAuth(): ConvexAuthResult {
  const authStore = useAuthStore();
  const bridgeAuth = useContext(ConvexAuthContext);

  // Check kitcn AuthProvider first
  if (authStore.store) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexAuth();
  }

  // Check ConvexAuthBridge (provides value directly - no conditional hook!)
  if (bridgeAuth !== null) {
    return bridgeAuth;
  }

  // No auth configured
  return { isAuthenticated: false, isLoading: false };
}

/**
 * Bridge for @convex-dev/auth users who don't use better-auth.
 * Calls useConvexAuth() unconditionally and provides value via context.
 */
export function ConvexAuthBridge({ children }: { children: ReactNode }) {
  const auth = useConvexAuth(); // Called unconditionally in this component
  return (
    <ConvexAuthContext.Provider value={auth}>
      {children}
    </ConvexAuthContext.Provider>
  );
}
```

**Why Approach B is better:**
- `useConvexAuth()` is called unconditionally in `ConvexAuthBridge` (follows Rules of Hooks)
- `useSafeConvexAuth()` only has ONE conditional hook call (for better-auth path)
- Cleaner separation: Bridge provides auth, hook consumes it
- Matches TanStack Query/tRPC patterns

### Usage for @convex-dev/auth Users

```tsx
// Before (broken)
<ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
  <App />
</ConvexProviderWithAuth>

// After (fixed)
<ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
  <ConvexAuthBridge>
    <App />
  </ConvexAuthBridge>
</ConvexProviderWithAuth>
```

---

## Technical Approach

### Files to Modify

1. **`packages/kitcn/src/react/auth-store.tsx`**
   - Add `ConvexAuthContext` (holds auth result)
   - Update `useSafeConvexAuth()` to check context
   - **Also update `useAuth()` hook** (lines 100-133) - same pattern issue
   - Export `ConvexAuthBridge` component

2. **`packages/kitcn/src/react/index.ts`**
   - Export `ConvexAuthBridge`

3. **`packages/kitcn/src/auth-client/convex-auth-provider.tsx`** (optional symmetry)
   - Wrap children with `ConvexAuthContext.Provider` for consistency

### Research Insights - Architecture

**Architecture strategist identified:**
- `useAuth()` hook (lines 100-133) has the **same bug** and must be fixed
- Consider adding ConvexAuthContext to `ConvexAuthProviderInner` for symmetry
- Dev-mode warning recommended for misconfiguration

### Edge Cases to Handle

| Scenario | authStore.store | ConvexAuthContext | Result |
|----------|-----------------|-------------------|--------|
| better-auth | Defined | null | useConvexAuth() |
| @convex-dev/auth + Bridge | undefined | { auth values } | context value |
| No auth at all | undefined | null | {false, false} |
| ConvexProvider only | undefined | null | {false, false} |
| Both better-auth + Bridge | Defined | { auth values } | useConvexAuth() (authStore wins) |

### Research Insights - Security

**Security sentinel confirmed:**
- **Risk Level: LOW** - Fix does not introduce security vulnerabilities
- Server-side auth enforcement unchanged (middleware validates on server)
- Defaults are fail-secure (`false` for context, `{false, false}` for no auth)
- Context spoofing provides no security benefit (actual auth comes from Convex SDK)
- Race conditions handled by existing loading state logic

---

## Acceptance Criteria

- [ ] Queries with `skipUnauth: true` resolve for @convex-dev/auth users
- [ ] Queries with `skipUnauth: true` skip when unauthenticated
- [ ] Queries wait during auth loading (don't skip immediately)
- [ ] Existing better-auth users unaffected (backward compatible)
- [ ] Users without auth unaffected
- [ ] Export `ConvexAuthBridge` from `kitcn/react`
- [ ] **Fix `useAuth()` hook** with same pattern
- [ ] Add unit tests for all scenarios
- [ ] Update documentation

---

## Testing Scenarios

### Research Insights - Testing

**Best practices research provided testing patterns:**

### Unit Tests

```typescript
import { renderHook } from '@testing-library/react';

// Wrapper factory pattern
const createWrapper = (options: {
  authStore?: boolean;
  bridgeAuth?: { isAuthenticated: boolean; isLoading: boolean } | null
}) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MockAuthStoreProvider hasStore={options.authStore ?? false}>
      <ConvexAuthContext.Provider value={options.bridgeAuth ?? null}>
        {children}
      </ConvexAuthContext.Provider>
    </MockAuthStoreProvider>
  );
};

describe('useSafeConvexAuth', () => {
  it('returns defaults when no auth available', () => {
    const { result } = renderHook(() => useSafeConvexAuth(), {
      wrapper: createWrapper({ authStore: false, bridgeAuth: null }),
    });
    expect(result.current).toEqual({ isAuthenticated: false, isLoading: false });
  });

  it('returns bridge auth when ConvexAuthBridge present', () => {
    const { result } = renderHook(() => useSafeConvexAuth(), {
      wrapper: createWrapper({
        authStore: false,
        bridgeAuth: { isAuthenticated: true, isLoading: false }
      }),
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('prefers authStore when both configured', () => {
    // authStore.store check comes first
    const { result } = renderHook(() => useSafeConvexAuth(), {
      wrapper: createWrapper({
        authStore: true,  // Will use useConvexAuth()
        bridgeAuth: { isAuthenticated: false, isLoading: false }
      }),
    });
    // Would need to mock useConvexAuth for this test
  });
});
```

### Test Scenarios Matrix

| # | Test | authStore | bridgeAuth | Expected |
|---|------|-----------|------------|----------|
| 1 | `useSafeConvexAuth` with AuthProvider | Defined | null | Real auth state |
| 2 | `useSafeConvexAuth` with ConvexAuthBridge | undefined | {values} | Bridge values |
| 3 | `useSafeConvexAuth` with neither | undefined | null | {false, false} |
| 4 | `useAuthSkip` skipUnauth=true, authenticated | - | - | shouldSkip=false |
| 5 | `useAuthSkip` skipUnauth=true, not auth | - | - | shouldSkip=true |
| 6 | `useAuthSkip` skipUnauth=true, loading | - | - | shouldSkip=false (wait) |

### Integration Tests

7. Query with skipUnauth resolves for @convex-dev/auth user
8. Query with skipUnauth skips for unauthenticated user
9. Infinite query with skipUnauth works

---

## Alternative Approaches Considered

### Option A: Try/catch around useConvexAuth()

```typescript
export function useSafeConvexAuth() {
  try {
    return useConvexAuth();
  } catch {
    return { isAuthenticated: false, isLoading: false };
  }
}
```

**Rejected:** Violates React hooks rules (conditional hook call). May work but fragile.

### Option B: Check for ConvexProviderWithAuth context directly

```typescript
const convexContext = useContext(ConvexReactContext);
if (convexContext?.auth) {
  return useConvexAuth();
}
```

**Rejected:** `ConvexAuthContext` is NOT exported from Convex SDK (confirmed via framework docs research).

### Option C: Auto-detect via error boundary

Wrap `useConvexAuth()` in an error boundary component.

**Rejected:** Complex, requires component restructuring.

### Research Insights - Why Proposed Solution is Correct

**Pattern recognition analysis confirmed:**
- Signal context pattern (boolean indicating availability) is established
- Used by feature flag systems, progressive enhancement
- Matches patterns in Clerk, NextAuth, Auth0 (all require provider wrapper)
- No auth library auto-detects provider existence without explicit wrapper

---

## Questions Resolved

| Question | Answer | Source |
|----------|--------|--------|
| Fix useSafeConvexAuth or useAuthSkip? | useSafeConvexAuth (root cause) | Architecture review |
| Require user code changes? | Yes - add ConvexAuthBridge wrapper | Simplicity review |
| Affect useAuth hook too? | Yes - same fix applies | Architecture review |
| Is fix security-safe? | Yes - server-side enforcement unchanged | Security review |
| Why not auto-detect? | ConvexAuthContext not exported from SDK | Framework docs research |

---

## Implementation Checklist

- [ ] Add `ConvexAuthContext` with explicit type
- [ ] Update `useSafeConvexAuth()` with return type annotation
- [ ] Add eslint-disable comments on conditional hook calls
- [ ] Add JSDoc documentation on `ConvexAuthBridge`
- [ ] **Update `useAuth()` hook** with same pattern (lines 100-133)
- [ ] Export `ConvexAuthBridge` from index.ts
- [ ] Add `ConvexAuthContext.Provider` to `ConvexAuthProviderInner` (optional symmetry)
- [ ] Consider dev-mode warning for misconfiguration
- [ ] Write unit tests using wrapper factory pattern
- [ ] Update documentation

---

## References

- Issue: [#52](https://github.com/udecode/kitcn/issues/52)
- Regression PR: [#44](https://github.com/udecode/kitcn/pull/44)
- [auth-store.tsx:87-98](packages/kitcn/src/react/auth-store.tsx#L87-L98) - useSafeConvexAuth
- [auth-store.tsx:100-133](packages/kitcn/src/react/auth-store.tsx#L100-L133) - useAuth (also needs fix)
- [auth.ts:19-38](packages/kitcn/src/internal/auth.ts#L19-L38) - useAuthSkip
- [Kent C. Dodds - React Context Effectively](https://kentcdodds.com/blog/how-to-use-react-context-effectively)
- [React Rules of Hooks](https://legacy.reactjs.org/docs/hooks-rules.html)
