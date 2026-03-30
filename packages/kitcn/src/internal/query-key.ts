/**
 * Shared query key utilities for Convex + TanStack Query.
 * This file has NO React dependencies so it can be imported in both
 * server (RSC) and client contexts.
 */

import { convexToJson, type Value } from 'convex/values';

/**
 * Check if query key is for a Convex query function.
 * Format: ['convexQuery', 'namespace:functionName', { args }]
 */
export function isConvexQuery(
  queryKey: readonly unknown[]
): queryKey is ['convexQuery', string, Record<string, unknown>] {
  return queryKey.length >= 2 && queryKey[0] === 'convexQuery';
}

/**
 * Check if query key is for a Convex action function.
 * Format: ['convexAction', 'namespace:functionName', { args }]
 */
export function isConvexAction(
  queryKey: readonly unknown[]
): queryKey is ['convexAction', string, Record<string, unknown>] {
  return queryKey.length >= 2 && queryKey[0] === 'convexAction';
}

/**
 * Create stable hash for Convex query keys.
 * Uses Convex's JSON serialization for consistent argument hashing.
 */
export function hashConvexQuery(
  queryKey: ['convexQuery', string, Record<string, unknown>]
): string {
  const [, funcName, args] = queryKey;
  return `convexQuery|${funcName}|${JSON.stringify(convexToJson(args as Value))}`;
}

/**
 * Create stable hash for Convex action keys.
 * Uses Convex's JSON serialization for consistent argument hashing.
 */
export function hashConvexAction(
  queryKey: ['convexAction', string, Record<string, unknown>]
): string {
  const [, funcName, args] = queryKey;
  return `convexAction|${funcName}|${JSON.stringify(convexToJson(args as Value))}`;
}
