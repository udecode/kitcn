import { createAuthClient } from 'better-auth/react';
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
