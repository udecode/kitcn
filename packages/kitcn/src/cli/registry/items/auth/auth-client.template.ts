export const AUTH_CLIENT_TEMPLATE = `import { convexClient, createAuthClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

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

export const AUTH_REACT_CLIENT_TEMPLATE = `import { convexClient, createAuthClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

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

export const AUTH_START_CLIENT_TEMPLATE = `import { convexClient, createAuthClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (import.meta.env.VITE_SITE_URL as string | undefined)
      : window.location.origin,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_CONVEX_CLIENT_TEMPLATE = `import { convexClient, createAuthClient } from 'kitcn/auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
});
`;

export const AUTH_CONVEX_REACT_CLIENT_TEMPLATE = `import { convexClient, createAuthClient } from 'kitcn/auth/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SITE_URL!,
  plugins: [convexClient()],
});
`;
