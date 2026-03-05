/**
 * Vanilla CRPC Client (Solid.js)
 *
 * Creates a tRPC-like proxy for direct procedural calls to Convex functions.
 * Unlike the React version which uses ConvexReactClient, this uses ConvexClient
 * from convex/browser for framework-agnostic WebSocket access.
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
import type { CallerMeta } from '../server/caller';
import { getFuncRef, getFunctionType } from '../shared/meta-utils';
import type { VanillaCRPCClient } from './crpc-types';

// ============================================================================
// Proxy Implementation
// ============================================================================

/**
 * Create a recursive proxy for vanilla (direct) calls.
 * Uses ConvexClient from convex/browser instead of ConvexReactClient.
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

      // Terminal method: subscribe (Solid equivalent of React's watchQuery)
      if (prop === 'subscribe') {
        return (
          args: Record<string, unknown> = {},
          callback?: (result: unknown) => void,
          onError?: (error: Error) => void
        ) => {
          const funcRef = getFuncRef(api, path);
          const wireArgs = transformer.input.serialize(args);
          return convexClient.onUpdate(
            funcRef as FunctionReference<'query'>,
            wireArgs as any,
            callback ?? (() => {}),
            onError
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
 * Create a vanilla CRPC proxy for direct procedural calls (Solid.js version).
 *
 * Uses ConvexClient from convex/browser for framework-agnostic access.
 * Provides .query(), .subscribe(), and .mutate() methods.
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @param meta - Generated function metadata for runtime type detection
 * @param convexClient - The ConvexClient instance from convex/browser
 * @param transformer - Optional payload transformer
 * @returns A typed proxy with query/subscribe/mutate methods
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
