/** biome-ignore-all lint/performance/noBarrelFile: package entry */
export { convexClient } from '../auth/internal/convex-client';
export type {
  AuthClient,
  AuthClientWithPlugins,
  PluginsWithCrossDomain,
  PluginsWithoutCrossDomain,
} from './types';
export * from './convex-auth-provider';
