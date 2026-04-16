/** biome-ignore-all lint/performance/noBarrelFile: package entry */
import { convexClient as baseConvexClient } from '@convex-dev/better-auth/client/plugins';
import type { BetterAuthClientPlugin } from 'better-auth';
import type { createAuthClient } from 'better-auth/react';

type ConvexClientPlugin = ReturnType<typeof baseConvexClient> &
  BetterAuthClientPlugin;

export type KitcnAuthClient = ReturnType<typeof createAuthClient> & {
  getSession: (args?: unknown) => Promise<unknown>;
  signOut: (args?: unknown) => Promise<unknown>;
  signIn: {
    anonymous?: (args?: unknown) => Promise<unknown>;
    email: (args?: unknown) => Promise<unknown>;
    social: (args?: unknown) => Promise<unknown>;
  };
  signUp: {
    email: (args?: unknown) => Promise<unknown>;
  };
  useActiveOrganization?: () => unknown;
  useListOrganizations?: () => unknown;
  useSession: () => {
    data?: {
      user?: {
        email?: string | null;
        name?: string | null;
      } | null;
    } | null;
    isPending: boolean;
  };
  organization?: {
    checkRolePermission: (args: {
      permissions: unknown;
      role?: string | null;
    }) => unknown;
    listMembers: (args: unknown) => Promise<{
      error?: { message?: string };
    }>;
  };
};

export const convexClient = ((...args: Parameters<typeof baseConvexClient>) =>
  baseConvexClient(...args) as ConvexClientPlugin) as (
  ...args: Parameters<typeof baseConvexClient>
) => ConvexClientPlugin;
export * from './convex-auth-provider';
