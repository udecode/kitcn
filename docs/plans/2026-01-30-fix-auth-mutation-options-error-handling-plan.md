---
title: "fix: Auth mutation options always call onSuccess on Better Auth errors"
type: fix
date: 2026-01-30
---

# fix: Auth mutation options always call onSuccess on Better Auth errors

## Overview

`useSignUpMutationOptions()`, `useSignInMutationOptions()`, and `useSignInSocialMutationOptions()` always run `onSuccess` even when Better Auth returns errors (e.g., 422 email exists). The `mutationFn` returns errors as values instead of throwing, so TanStack Query treats the result as success.

## Problem Statement

Better Auth returns errors as response values rather than throwing:

```typescript
// Better Auth response on error
{ error: { status: 422, message: "User already exists", code: "EMAIL_ALREADY_REGISTERED" } }
```

Current implementation returns this without throwing:

```typescript
// auth-mutations.ts:151-164
mutationFn: async (args) => {
  const res = await authClient.signUp.email(args);
  if (!res?.error) {
    await waitForAuth(authStoreApi);
  }
  return res;  // Returns error as value - TanStack Query calls onSuccess
}
```

**User impact:** Cannot handle auth errors properly:

```typescript
const { mutate } = useMutation(
  useSignUpMutationOptions({
    onSuccess: () => router.push("/"),     // Runs even on 422!
    onError: (error) => setFormError(error.message)  // Never runs
  })
);
```

## Proposed Solution

Throw when `res.error` exists so TanStack Query properly triggers `onError`.

## Technical Considerations

### Error Class Decision

| Option | Pros | Cons |
|--------|------|------|
| `throw new Error(message)` | Simple, minimal change | Loses error code/status info |
| `throw res.error` | Preserves all info | Not an Error instance, may break type guards |
| `throw new AuthMutationError(res.error)` | Full info + instanceof checks | More code, new export |

**Recommendation:** Create `AuthMutationError` class for better DX.

### Backward Compatibility

**Breaking change:** Anyone checking `data.error` in `onSuccess` will break:

```typescript
// OLD (workaround for the bug)
onSuccess: (data) => {
  if (data.error) toast.error(data.error.message);
  else router.push('/');
}

// NEW (correct usage)
onSuccess: () => router.push('/'),
onError: (error) => toast.error(error.message)
```

This is the fix - document in changelog/migration guide.

### Affected Files

| File | Lines | Hook |
|------|-------|------|
| [auth-mutations.ts](packages/kitcn/src/react/auth-mutations.ts#L120-L134) | 120-134 | `useSignInSocialMutationOptions` |
| [auth-mutations.ts](packages/kitcn/src/react/auth-mutations.ts#L136-L149) | 136-149 | `useSignInMutationOptions` |
| [auth-mutations.ts](packages/kitcn/src/react/auth-mutations.ts#L151-L164) | 151-164 | `useSignUpMutationOptions` |
| [auth-mutations.ts](packages/kitcn/src/react/auth-mutations.ts#L113) | ~113 | `useSignOutMutationOptions` (check if same issue) |

## Acceptance Criteria

- [x] `onError` fires when Better Auth returns error response (401, 400, 422, etc.)
- [x] `onSuccess` only fires on actual success (no error in response)
- [x] Thrown error contains: message, status, code
- [x] TypeScript types updated for mutation return (no longer includes error shape)
- [x] All 4 auth mutation hooks fixed consistently

## MVP

### packages/kitcn/src/react/auth-mutations.ts

```typescript
// New error class at top of file
export class AuthMutationError extends Error {
  code?: string;
  status: number;
  statusText: string;

  constructor(authError: { message?: string; status: number; statusText: string; code?: string }) {
    super(authError.message || authError.statusText);
    this.name = 'AuthMutationError';
    this.code = authError.code;
    this.status = authError.status;
    this.statusText = authError.statusText;
  }
}

// Updated pattern for each hook
const useSignUpMutationOptions = ((options) => {
  const authStoreApi = useAuthStore();

  return {
    ...options,
    mutationFn: async (args: Parameters<T['signUp']['email']>[0]) => {
      const res = await authClient.signUp.email(args);
      if (res?.error) {
        throw new AuthMutationError(res.error);
      }
      await waitForAuth(authStoreApi);
      return res;
    },
  };
}) as AuthMutationsResult<T>['useSignUpMutationOptions'];
```

### Type guard utility (optional)

```typescript
// packages/kitcn/src/react/auth-mutations.ts
export function isAuthMutationError(error: unknown): error is AuthMutationError {
  return error instanceof AuthMutationError;
}
```

## Test Cases

| Scenario | Expected |
|----------|----------|
| Sign up with existing email | `onError` called with 422 error |
| Sign in wrong password | `onError` called with 401 error |
| Sign in/up success | `onSuccess` called, error handler not called |
| Social OAuth provider error | `onError` called |
| Network failure | `onError` called (native fetch error) |
| Sign out with error | `onError` called |

## Questions

1. **Error class:** Simple `Error` vs `AuthMutationError` class?
2. **Sign out:** Also fix `useSignOutMutationOptions`?
3. **Breaking change:** Add to changelog + migration guide?

## References

- [auth-mutations.ts](packages/kitcn/src/react/auth-mutations.ts)
- [Better Auth error typing issue #3879](https://github.com/better-auth/better-auth/issues/3879)
- [TanStack Query mutation docs](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
