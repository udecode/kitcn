import { hashKey } from '@tanstack/query-core';

import {
  hashConvexAction,
  hashConvexQuery,
  isConvexAction,
  isConvexQuery,
} from './query-key';

/**
 * Create a hash function for TanStack Query that handles Convex keys.
 */
export function createHashFn(
  fallback: (key: readonly unknown[]) => string = hashKey
) {
  return (queryKey: readonly unknown[]): string => {
    if (isConvexQuery(queryKey)) {
      return hashConvexQuery(queryKey);
    }
    if (isConvexAction(queryKey)) {
      return hashConvexAction(queryKey);
    }
    return fallback(queryKey);
  };
}
