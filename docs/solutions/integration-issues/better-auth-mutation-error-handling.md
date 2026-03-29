---
title: Auth Mutation Hooks Treating Better Auth Errors as Success
category: integration-issues
tags:
  - auth
  - tanstack-query
  - better-auth
  - mutations
  - error-handling
symptoms:
  - onSuccess callbacks execute despite auth failures (401, 422)
  - onError callbacks never fire for auth errors
  - Must check data.error inside onSuccess as workaround
module: auth-mutations
resolved: 2026-01-30
issue: https://github.com/udecode/kitcn/issues/60
pr: https://github.com/udecode/kitcn/pull/61
---

# Auth Mutation Hooks Treating Better Auth Errors as Success

## Problem

When using `useSignUpMutationOptions()`, `useSignInMutationOptions()`, or other auth mutation hooks with TanStack Query, the `onSuccess` callback fires even when Better Auth returns an error (401, 422, etc.). The `onError` callback never executes for auth failures.

```tsx
// Broken: onSuccess runs even on 422 "email exists" error
const { mutate } = useMutation(
  useSignUpMutationOptions({
    onSuccess: () => router.push("/"),     // Runs on 422!
    onError: (error) => setFormError(error.message)  // Never runs
  })
);
```

## Investigation

1. **Checked TanStack Query behavior** - Confirmed it uses thrown exceptions to trigger `onError`
2. **Traced Better Auth responses** - Found it returns errors as values, not exceptions:
   ```typescript
   // Better Auth response on error
   { error: { status: 422, message: "User already exists", code: "EMAIL_ALREADY_REGISTERED" } }
   ```
3. **Examined auth-mutations.ts** - Found mutation functions return `res` even when `res.error` exists

## Root Cause

Better Auth returns errors as response values rather than throwing exceptions. The mutation hooks were returning these errors as success values:

```typescript
// Before fix (packages/kitcn/src/react/auth-mutations.ts)
mutationFn: async (args) => {
  const res = await authClient.signUp.email(args);
  if (!res?.error) {
    await waitForAuth(authStoreApi);
  }
  return res;  // Returns error as value - TanStack Query calls onSuccess
}
```

TanStack Query interprets non-throwing as success, so `onSuccess` was called with `{ error: {...} }` as the data.

## Solution

Convert error-as-value responses to thrown errors by creating `AuthMutationError` class and throwing when `res.error` exists:

```typescript
// packages/kitcn/src/react/auth-mutations.ts

export class AuthMutationError extends Error {
  code?: string;
  status: number;
  statusText: string;

  constructor(authError: {
    message?: string;
    status: number;
    statusText: string;
    code?: string;
  }) {
    super(authError.message || authError.statusText);
    this.name = 'AuthMutationError';
    this.code = authError.code;
    this.status = authError.status;
    this.statusText = authError.statusText;
  }
}

export function isAuthMutationError(error: unknown): error is AuthMutationError {
  return error instanceof AuthMutationError;
}

// Updated mutation pattern
mutationFn: async (args) => {
  const res = await authClient.signUp.email(args);
  if (res?.error) {
    throw new AuthMutationError(res.error);  // Now throws instead of returns
  }
  await waitForAuth(authStoreApi);
  return res;
}
```

## Verification

After fix:

```tsx
// Now works correctly
const signUp = useMutation(useSignUpMutationOptions({
  onSuccess: () => router.push('/'),  // Only on actual success
  onError: (error) => {
    if (isAuthMutationError(error)) {
      console.log(error.code);  // 'EMAIL_ALREADY_REGISTERED'
      console.log(error.status); // 422
    }
    toast.error(error.message);
  }
}));
```

## Prevention

1. **When integrating error-as-value APIs with TanStack Query**, always convert to thrown errors
2. **Create typed error classes** to preserve error details (code, status)
3. **Export type guards** for error handling (`isAuthMutationError`)

## Files Changed

- `packages/kitcn/src/react/auth-mutations.ts` - Added AuthMutationError class, fixed all 4 hooks

## Related

- Issue: https://github.com/udecode/kitcn/issues/60
- PR: https://github.com/udecode/kitcn/pull/61
- Skill: `.claude/rules/better-auth-error-handling.mdc`
- [TanStack Query Mutation Docs](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
