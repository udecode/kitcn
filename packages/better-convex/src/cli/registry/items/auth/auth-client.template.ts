export const AUTH_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
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
`;

export const AUTH_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth/client';
import { createAuthMutations } from 'better-convex/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL!,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_CONVEX_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  plugins: [convexClient()],
});
`;

export const AUTH_CONVEX_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL!,
  plugins: [convexClient()],
});
`;
