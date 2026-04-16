/** biome-ignore-all lint/performance/noBarrelFile: package entry */
import type { BetterAuthClientOptions } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
export { convexClient } from '../auth/internal/convex-client';

type BetterAuthReactClient<Option extends BetterAuthClientOptions> = ReturnType<
  typeof createBetterAuthClient<Option>
>;

type AuthClientMethod = (args?: unknown) => Promise<unknown>;

type KitcnAuthClientSurface = {
  getSession: (args?: {
    fetchOptions?: {
      credentials?: RequestCredentials;
      headers?: Record<string, string>;
    };
  }) => Promise<{ data?: unknown; error?: unknown } | null | undefined>;
  signOut: AuthClientMethod;
  signIn: {
    anonymous: AuthClientMethod;
    email: AuthClientMethod;
    social: AuthClientMethod;
  };
  signUp: {
    email: AuthClientMethod;
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
    error?: unknown;
    isPending: boolean;
    isRefetching?: boolean;
    refetch?: () => Promise<void>;
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

export type KitcnAuthClient<
  Option extends BetterAuthClientOptions = BetterAuthClientOptions,
> = Omit<BetterAuthReactClient<Option>, keyof KitcnAuthClientSurface> &
  KitcnAuthClientSurface;

export const createAuthClient = <
  Option extends BetterAuthClientOptions = BetterAuthClientOptions,
>(
  options?: Option
): KitcnAuthClient<Option> =>
  createBetterAuthClient(options) as unknown as KitcnAuthClient<Option>;

export * from './convex-auth-provider';
