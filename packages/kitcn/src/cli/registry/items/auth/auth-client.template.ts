export const AUTH_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  getSession: (args?: unknown) => Promise<unknown>;
  signOut: (args?: unknown) => Promise<unknown>;
  signIn: {
    email: (args?: unknown) => Promise<unknown>;
    social: (args?: unknown) => Promise<unknown>;
  };
  signUp: {
    email: (args?: unknown) => Promise<unknown>;
  };
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
};

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
}) as unknown as KitcnAuthClient;

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  getSession: (args?: unknown) => Promise<unknown>;
  signOut: (args?: unknown) => Promise<unknown>;
  signIn: {
    email: (args?: unknown) => Promise<unknown>;
    social: (args?: unknown) => Promise<unknown>;
  };
  signUp: {
    email: (args?: unknown) => Promise<unknown>;
  };
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL!,
  plugins: [convexClient()],
}) as unknown as KitcnAuthClient;

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_START_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  getSession: (args?: unknown) => Promise<unknown>;
  signOut: (args?: unknown) => Promise<unknown>;
  signIn: {
    email: (args?: unknown) => Promise<unknown>;
    social: (args?: unknown) => Promise<unknown>;
  };
  signUp: {
    email: (args?: unknown) => Promise<unknown>;
  };
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
};

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (import.meta.env.VITE_SITE_URL as string | undefined)
      : window.location.origin,
  plugins: [convexClient()],
}) as unknown as KitcnAuthClient;

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_CONVEX_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';

type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
};

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
}) as unknown as KitcnAuthClient;
`;

export const AUTH_CONVEX_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';

type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SITE_URL!,
  plugins: [convexClient()],
}) as unknown as KitcnAuthClient;
`;
