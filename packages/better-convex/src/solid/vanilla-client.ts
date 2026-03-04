/**
 * Vanilla CRPC Client for SolidJS
 *
 * Creates a tRPC-like proxy for direct procedural calls to Convex functions.
 * Uses ConvexClient from convex/browser (no watchQuery - not available in browser client).
 *
 * @example
 * ```ts
 * const client = useCRPCClient();
 * const user = await client.user.get.query({ id: '123' });
 * await client.user.update.mutate({ id: '123', name: 'New Name' });
 * ```
 */

import type { ConvexClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import {
  type CombinedDataTransformer,
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type { VanillaCRPCClient } from '../crpc/types';
import type { CallerMeta } from '../server/caller';
import { getFuncRef, getFunctionType } from '../shared/meta-utils';

// ============================================================================
// Proxy Implementation
// ============================================================================

/**
 * Create a recursive proxy for vanilla (direct) calls.
 */
function createRecursiveVanillaProxy(
  api: Record<string, unknown>,
  path: string[],
  meta: CallerMeta,
  convexClient: ConvexClient,
  transformer: CombinedDataTransformer
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return; // Prevent Promise detection

      // Terminal method: query (for queries and actions)
      if (prop === 'query') {
        return async (args: Record<string, unknown> = {}) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);
          const wireArgs = transformer.input.serialize(args);

          if (fnType === 'action') {
            return transformer.output.deserialize(
              await convexClient.action(
                funcRef as FunctionReference<'action'>,
                wireArgs as any
              )
            );
          }

          return transformer.output.deserialize(
            await convexClient.query(
              funcRef as FunctionReference<'query'>,
              wireArgs as any
            )
          );
        };
      }

      // Terminal method: mutate (for mutations and actions)
      if (prop === 'mutate') {
        return async (args: Record<string, unknown> = {}) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);
          const wireArgs = transformer.input.serialize(args);

          if (fnType === 'action') {
            return transformer.output.deserialize(
              await convexClient.action(
                funcRef as FunctionReference<'action'>,
                wireArgs as any
              )
            );
          }

          return transformer.output.deserialize(
            await convexClient.mutation(
              funcRef as FunctionReference<'mutation'>,
              wireArgs as any
            )
          );
        };
      }

      // Continue path accumulation
      return createRecursiveVanillaProxy(
        api,
        [...path, prop],
        meta,
        convexClient,
        transformer
      );
    },
  });
}

/**
 * Create a vanilla CRPC proxy for direct procedural calls (SolidJS).
 *
 * Uses ConvexClient from convex/browser. No watchQuery support.
 */
export function createVanillaCRPCProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: CallerMeta,
  convexClient: ConvexClient,
  transformer?: DataTransformerOptions
): VanillaCRPCClient<TApi> {
  const resolvedTransformer = getTransformer(transformer);
  return createRecursiveVanillaProxy(
    api,
    [],
    meta,
    convexClient,
    resolvedTransformer
  ) as VanillaCRPCClient<TApi>;
}
