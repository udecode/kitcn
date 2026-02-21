import { type Auth, ac, roles } from '@convex/auth-shared';
import { polarClient } from '@polar-sh/better-auth';
import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth/client';
import { createAuthMutations } from 'better-convex/react';
import { env } from '@/env';

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SITE_URL,
  sessionOptions: {
    // Disable session polling on tab focus (saves ~500ms HTTP call per focus)
    refetchOnWindowFocus: false,
  },
  plugins: [
    inferAdditionalFields<Auth>(),
    adminClient(),
    organizationClient({
      ac,
      roles,
    }),
    polarClient(),
    convexClient(),
  ],
});

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
