import type { BetterAuthClientPlugin } from 'better-auth';
import type { createAuthClient } from 'better-auth/solid';

type CrossDomainClient = BetterAuthClientPlugin;
type ConvexClient = BetterAuthClientPlugin;
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
