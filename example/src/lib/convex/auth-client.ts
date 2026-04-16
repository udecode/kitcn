import { type Auth, ac, roles } from '@convex/auth-shared';
import {
  adminClient,
  anonymousClient,
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';
import { env } from '@/env';

type ExampleAuthClient = ReturnType<typeof createAuthClient> & {
  getSession: (args?: unknown) => Promise<unknown>;
  signOut: (args?: unknown) => Promise<unknown>;
  signIn: {
    anonymous: (args?: unknown) => Promise<unknown>;
    email: (args?: unknown) => Promise<unknown>;
    social: (args?: unknown) => Promise<unknown>;
  };
  signUp: {
    email: (args?: unknown) => Promise<unknown>;
  };
  useActiveOrganization: () => unknown;
  useListOrganizations: () => unknown;
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
  organization: {
    checkRolePermission: (args: {
      permissions: unknown;
      role?: string | null;
    }) => unknown;
    listMembers: (args: unknown) => Promise<{
      error?: { message?: string };
    }>;
  };
};

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SITE_URL,
  sessionOptions: {
    // Disable session polling on tab focus (saves ~500ms HTTP call per focus)
    refetchOnWindowFocus: false,
  },
  plugins: [
    inferAdditionalFields<Auth>(),
    adminClient(),
    anonymousClient(),
    organizationClient({
      ac,
      roles,
    }),
    convexClient(),
  ],
}) as unknown as ExampleAuthClient;

// Export hooks from the auth client
export const { useActiveOrganization, useListOrganizations } = authClient;

// Export mutation hooks
export const {
  useSignOutMutationOptions,
  useSignInSocialMutationOptions,
  useSignInMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);

export function checkRolePermission(args: {
  permissions: NonNullable<
    Parameters<
      typeof authClient.organization.checkRolePermission
    >[0]['permissions']
  >;
  role?: string | null;
}) {
  const normalizedRole = (args.role === 'owner' ? 'owner' : 'member') as
    | 'member'
    | 'owner';

  return authClient.organization.checkRolePermission({
    permissions: args.permissions,
    role: normalizedRole,
  });
}
