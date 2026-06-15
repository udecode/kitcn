/** biome-ignore-all lint/performance/noBarrelFile: package entry */
export { convexClient } from '../auth/internal/convex-client';
export * from './convex-auth-provider';
export type {
  AuthClient,
  AuthClientWithPlugins,
  ConvexAuthProviderClient,
  PluginsWithCrossDomain,
  PluginsWithoutCrossDomain,
} from './types';
