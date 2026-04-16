import type { BetterAuthClientPlugin } from 'better-auth';
import type { BetterAuthClientOptions } from 'better-auth/client';
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

export type AuthClientWithPlugins<
  Plugins extends PluginsWithCrossDomain | PluginsWithoutCrossDomain,
> = ReturnType<
  typeof createAuthClient<
    BetterAuthClientOptions & {
      plugins: Plugins;
    }
  >
>;

export type AuthClient =
  | AuthClientWithPlugins<PluginsWithCrossDomain>
  | AuthClientWithPlugins<PluginsWithoutCrossDomain>;
