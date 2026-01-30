/** biome-ignore-all lint/performance/noBarrelFile: package entry */
export { ConvexProvider, ConvexReactClient, useConvex } from 'convex/react';
export * from './auth-mutations';
export * from './auth-store';
export { useSafeConvexAuth as useConvexAuth } from './auth-store';
export * from './client';
export * from './context';
export * from './http-proxy';
export * from './proxy';
export * from './singleton';
export * from './use-infinite-query';
export * from './vanilla-client';

/**
 * Hook that returns TanStack Query options for Convex queries with real-time subscriptions.
 *
 * @remarks
 * This hook creates query options that can be passed to TanStack Query's `useQuery` hook.
 * It automatically handles WebSocket subscriptions for real-time updates and auth state.
 *
 * @example Basic usage
 * ```tsx
 * const { data } = useQuery(useConvexQueryOptions(api.user.get, { id }));
 * ```
 *
 * @example With conditional query (skipToken)
 * ```tsx
 * const { data } = useQuery(
 *   useConvexQueryOptions(api.user.get, userId ? { id: userId } : skipToken)
 * );
 * ```
 *
 * @returns Query options object with queryKey, queryFn, and metadata for TanStack Query
 *
 * @see {@link https://tanstack.com/query/latest/docs/framework/react/guides/queries | TanStack Query Documentation}
 */
export { useConvexQueryOptions } from './use-query-options';
