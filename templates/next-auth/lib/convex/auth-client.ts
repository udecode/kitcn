import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth/client';
import { createAuthMutations } from 'better-convex/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
