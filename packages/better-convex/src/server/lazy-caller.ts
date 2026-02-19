/**
 * Lazy caller that creates context on each procedure invocation.
 * Matches tRPC's appRouter.createCaller(createTRPCContext) pattern.
 */

import { getFuncRef } from '../shared/meta-utils';
import type { ServerCaller } from './caller';

// Context shape with caller and auth properties
type CallerContext<TApi> = {
  caller: ServerCaller<TApi>;
  token: string | undefined;
  isAuthenticated: boolean;
};

/**
 * Lazy caller with auth helper methods.
 * Context is created on first procedure invocation, not at definition time.
 */
export type LazyCaller<TApi> = ServerCaller<TApi> & {
  /** Check if user is authenticated */
  isAuth: () => Promise<boolean>;
  /** Check if user is unauthenticated */
  isUnauth: () => Promise<boolean>;
  /** Get the auth token (for RSC prefetching) */
  getToken: () => Promise<string | undefined>;
};

function traverseCaller<TApi>(
  caller: ServerCaller<TApi>,
  path: string[]
): (args: any, opts?: any) => Promise<any> {
  let target: any = caller;

  for (const key of path) {
    target = target[key];
  }

  return target;
}

function createRecursiveProxyWithLazyContext<
  TApi extends Record<string, unknown>,
>(
  api: TApi,
  path: string[],
  createContext: () => Promise<CallerContext<TApi>>
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      // Handle auth methods at root level
      if (path.length === 0 && prop === 'isAuth') {
        return async () => {
          const ctx = await createContext();
          return ctx.isAuthenticated;
        };
      }
      if (path.length === 0 && prop === 'isUnauth') {
        return async () => {
          const ctx = await createContext();
          return !ctx.isAuthenticated;
        };
      }
      if (path.length === 0 && prop === 'getToken') {
        return async () => {
          const ctx = await createContext();
          return ctx.token;
        };
      }

      return createRecursiveProxyWithLazyContext(
        api,
        [...path, prop],
        createContext
      );
    },
    async apply(_target, _thisArg, argsList) {
      // Validate path exists in api
      try {
        getFuncRef(api, path);
      } catch (error) {
        const displayPath = path.length > 0 ? path.join('.') : '<root>';
        throw new Error(`Invalid caller path: ${displayPath}`, {
          cause: error as Error,
        });
      }

      // Lazy context creation happens here
      const ctx = await createContext();

      // Traverse the context's caller to the target function
      const fn = traverseCaller(ctx.caller, path);

      // Pass both args and opts
      return fn(argsList[0] ?? {}, argsList[1]);
    },
  });
}

/**
 * Create a lazy caller that creates context on each procedure invocation.
 * Matches tRPC's `appRouter.createCaller(createTRPCContext)` pattern.
 *
 * @example
 * ```ts
 * // server.ts
 * const { createContext, createCaller } = createCallerFactory({...});
 *
 * // rsc.tsx
 * const createRSCContext = cache(async () => {
 *   const heads = await headers();
 *   return createContext({ headers: heads });
 * });
 * export const caller = createCaller(createRSCContext);
 *
 * // app/page.tsx - single call! Context created lazily
 * const posts = await caller.posts.list();
 * ```
 */
export function createLazyCaller<TApi extends Record<string, unknown>>(
  api: TApi,
  createContext: () => Promise<CallerContext<TApi>>
): LazyCaller<TApi> {
  return createRecursiveProxyWithLazyContext(
    api,
    [],
    createContext
  ) as LazyCaller<TApi>;
}
