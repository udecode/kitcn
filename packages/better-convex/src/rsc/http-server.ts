/**
 * HTTP Server Query Options
 *
 * Server-side HTTP query options builder for RSC prefetching.
 * Query execution is delegated to getServerQueryClientOptions.
 */

import type { QueryOptions } from '@tanstack/react-query';
import type { HttpRouteInfo } from '../crpc/http-types';
import type {
  CombinedDataTransformer,
  DataTransformerOptions,
} from '../crpc/transformer';
import { decodeWire } from '../crpc/transformer';

/** Metadata attached to HTTP query options for execution by QueryClient */
export interface HttpQueryMeta {
  method: string;
  path: string;
}

/**
 * Build query options for an HTTP route (server-side).
 * Does NOT include queryFn - execution handled by getServerQueryClientOptions.
 */
export function buildHttpQueryOptions(
  route: HttpRouteInfo,
  routeKey: string,
  args: unknown
): QueryOptions {
  return {
    // Match client query key format for hydration
    queryKey: ['httpQuery', routeKey, args] as const,
    // Route info stored in meta for queryFn to use
    meta: {
      path: route.path,
      method: route.method,
    } satisfies HttpQueryMeta,
  };
}

/**
 * Execute an HTTP route fetch.
 * Called by getServerQueryClientOptions queryFn.
 */
export async function fetchHttpRoute(
  convexSiteUrl: string,
  routeMeta: HttpQueryMeta,
  args: unknown,
  token?: string,
  transformer?: DataTransformerOptions | CombinedDataTransformer
): Promise<unknown> {
  const url = buildUrl(
    convexSiteUrl,
    routeMeta.path,
    args as Record<string, unknown>
  );

  const response = await fetch(url, {
    method: routeMeta.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  // Handle empty responses
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0' || response.status === 204) {
    return null;
  }

  return decodeWire(await response.json(), transformer);
}

/**
 * Build URL with path params and query params.
 */
function buildUrl(
  convexSiteUrl: string,
  pathTemplate: string,
  args: Record<string, unknown>
): string {
  // Clone args to avoid mutation
  const remaining = { ...args };

  // Replace path params: /todos/:id -> /todos/123
  const path = pathTemplate.replace(/:(\w+)/g, (_, key) => {
    const value = remaining[key];
    delete remaining[key];
    return value !== null && value !== undefined
      ? encodeURIComponent(String(value))
      : '';
  });

  // Remaining args -> query params for GET
  const queryEntries = Object.entries(remaining).filter(
    ([_, v]) => v !== undefined && v !== null
  );
  if (queryEntries.length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of queryEntries) {
      params.set(key, String(value));
    }
    return `${convexSiteUrl}${path}?${params.toString()}`;
  }

  return convexSiteUrl + path;
}
