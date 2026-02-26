import { fetchAction, fetchQuery } from 'convex/nextjs';
import type { FunctionReference } from 'convex/server';
import { defaultIsUnauthorized } from '../crpc/error';
import {
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type { ConvexQueryMeta } from '../crpc/types';
import { createHashFn } from '../internal/hash';
import { fetchHttpRoute, type HttpQueryMeta } from './http-server';

export type GetServerQueryClientOptionsParams = {
  /** Function to get auth token for authenticated queries. Use `caller.getToken` from your RSC setup. */
  getToken?: () => Promise<string | undefined>;
  /** Base URL for HTTP routes (e.g., NEXT_PUBLIC_CONVEX_SITE_URL). Required for crpc.http.* queries. */
  convexSiteUrl?: string;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
};

/**
 * Get server QueryClient options for RSC prefetching.
 * Handles both WebSocket queries (convexQuery/convexAction) and HTTP routes (httpQuery).
 *
 * @example
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *     ...getServerQueryClientOptions({
 *       getToken: caller.getToken,
 *       convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
 *     }),
 *   },
 * });
 * ```
 */
export function getServerQueryClientOptions({
  getToken,
  convexSiteUrl,
  transformer: transformerOptions,
}: GetServerQueryClientOptionsParams = {}) {
  const transformer = getTransformer(transformerOptions);
  return {
    queries: {
      staleTime: 30_000,
      queryFn: async ({
        queryKey,
        meta,
      }: {
        queryKey: readonly unknown[];
        meta?: Record<string, unknown>;
      }) => {
        const [type, ...rest] = queryKey;
        const token = await getToken?.();

        // Handle HTTP queries (crpc.http.*)
        if (type === 'httpQuery') {
          const [routeKey, args] = rest as [string, unknown];
          const routeMeta = meta as HttpQueryMeta | undefined;

          if (!convexSiteUrl) {
            throw new Error(
              'convexSiteUrl required for HTTP queries. Pass it to getServerQueryClientOptions().'
            );
          }
          if (!routeMeta?.path) {
            throw new Error(`HTTP route metadata missing for: ${routeKey}`);
          }

          return await fetchHttpRoute(
            convexSiteUrl,
            routeMeta,
            args,
            token,
            transformer
          );
        }

        // Handle WebSocket queries (convexQuery/convexAction)
        const [funcRef, args] = rest as [
          FunctionReference<'query' | 'action'>,
          Record<string, unknown>,
        ];
        const wireArgs = transformer.input.serialize(args);

        // Auto-skip auth-required queries when not authenticated
        const queryMeta = meta as ConvexQueryMeta | undefined;
        const skipUnauth = queryMeta?.skipUnauth;
        const authRequired = queryMeta?.authType === 'required';
        if (!token && (skipUnauth || authRequired)) {
          return null;
        }

        // Use convex fetch directly - works for public queries too
        const opts = token ? { token } : undefined;
        try {
          return transformer.output.deserialize(
            type === 'convexQuery'
              ? await fetchQuery(
                  funcRef as FunctionReference<'query'>,
                  wireArgs as any,
                  opts
                )
              : await fetchAction(
                  funcRef as FunctionReference<'action'>,
                  wireArgs as any,
                  opts
                )
          );
        } catch (error) {
          if ((skipUnauth || authRequired) && defaultIsUnauthorized(error)) {
            return null;
          }
          throw error;
        }
      },
      queryKeyHashFn: createHashFn(),
    },
  };
}
