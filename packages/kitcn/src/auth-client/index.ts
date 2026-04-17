/** biome-ignore-all lint/performance/noBarrelFile: package entry */
export { convexClient } from '../auth/internal/convex-client';
export * from './convex-auth-provider';
export type {
  AuthClient,
  AuthClientWithPlugins,
  PluginsWithCrossDomain,
  PluginsWithoutCrossDomain,
} from './types';
