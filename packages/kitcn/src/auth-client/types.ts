import type { BetterAuthClientPlugin } from 'better-auth';
import type { createAuthClient } from 'better-auth/react';
import type { convexClient } from '../auth/internal/convex-client';

type ConvexClient = ReturnType<typeof convexClient>;
type CrossDomainClient = BetterAuthClientPlugin & {
  id: 'cross-domain';
  getActions: (...args: never[]) => {
    crossDomain: {
      oneTimeToken: {
        verify: (args: unknown) => Promise<unknown>;
      };
    };
    getCookie: () => string;
    notifySessionSignal: () => void;
  };
};

export type PluginsWithCrossDomain = (
  | CrossDomainClient
  | ConvexClient
  | BetterAuthClientPlugin
)[];

export type PluginsWithoutCrossDomain = (
  | ConvexClient
  | BetterAuthClientPlugin
)[];

type AuthSessionState = {
  data: unknown;
  error?: unknown;
  isPending: boolean;
  isRefetching?: boolean;
  refetch?: (...args: never[]) => unknown;
};

type AuthClientStore = {
  atoms?: {
    session?: unknown;
  };
};

type AuthConvexTokenArgs = {
  fetchOptions?: {
    headers?: {
      Authorization: string;
    };
    throw?: false;
  };
};

type AuthConvexTokenResult =
  | {
      data?: {
        token?: string | null;
      } | null;
    }
  | null
  | undefined;

export type ConvexAuthProviderClient = {
  $store?: AuthClientStore;
  convex: {
    token: (args: AuthConvexTokenArgs) => Promise<AuthConvexTokenResult>;
  };
  crossDomain?: unknown;
  getCookie?: (...args: never[]) => unknown;
  getSession?: (...args: never[]) => unknown;
  notifySessionSignal?: (...args: never[]) => unknown;
  updateSession?: (...args: never[]) => unknown;
  useSession: () => AuthSessionState;
} & Record<string, unknown>;

export type AuthClientWithPlugins<
  Plugins extends PluginsWithCrossDomain | PluginsWithoutCrossDomain,
> = ReturnType<typeof createAuthClient<{ plugins: Plugins }>>;

export type AuthClient =
  | AuthClientWithPlugins<PluginsWithCrossDomain>
  | AuthClientWithPlugins<PluginsWithoutCrossDomain>;
