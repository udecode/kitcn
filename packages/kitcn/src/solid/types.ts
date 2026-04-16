import type { BetterAuthClientPlugin } from 'better-auth';
import type { createAuthClient } from 'better-auth/solid';
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
type PluginsWithCrossDomain = (
  | CrossDomainClient
  | ConvexClient
  | BetterAuthClientPlugin
)[];
type PluginsWithoutCrossDomain = (ConvexClient | BetterAuthClientPlugin)[];

type AuthClientWithPlugins<
  Plugins extends PluginsWithCrossDomain | PluginsWithoutCrossDomain,
> = ReturnType<
  typeof createAuthClient<BetterAuthClientPlugin & { plugins: Plugins }>
>;

export type SolidAuthClient =
  | AuthClientWithPlugins<PluginsWithCrossDomain>
  | AuthClientWithPlugins<PluginsWithoutCrossDomain>;
