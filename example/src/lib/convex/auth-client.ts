import { type Auth, ac, roles } from '@convex/auth-shared';
import {
  adminClient,
  anonymousClient,
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { convexClient, type KitcnAuthClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';
import { env } from '@/env';

type ExampleAuthClient = KitcnAuthClient & {
  signIn: KitcnAuthClient['signIn'] & {
    anonymous: (args?: unknown) => Promise<unknown>;
  };
  useActiveOrganization: () => unknown;
  useListOrganizations: () => unknown;
  organization: NonNullable<KitcnAuthClient['organization']>;
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
