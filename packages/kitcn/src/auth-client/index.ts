/** biome-ignore-all lint/performance/noBarrelFile: package entry */
import { convexClient as baseConvexClient } from '@convex-dev/better-auth/client/plugins';
import type { BetterAuthClientPlugin } from 'better-auth';

type ConvexClientPlugin = ReturnType<typeof baseConvexClient> &
  BetterAuthClientPlugin;

export const convexClient = ((...args: Parameters<typeof baseConvexClient>) =>
  baseConvexClient(...args) as ConvexClientPlugin) as (
  ...args: Parameters<typeof baseConvexClient>
) => ConvexClientPlugin;
export * from './convex-auth-provider';
