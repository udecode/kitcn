/**
 * Server Caller for direct data fetching without React Query cache.
 *
 * Similar to tRPC's caller pattern - invokes queries/mutations directly
 * and returns data without storing in React Query cache.
 */

import type { FunctionReference, FunctionReturnType } from 'convex/server';
import type { DataTransformerOptions } from '../crpc/transformer';
import { getTransformer } from '../crpc/transformer';
import type { EmptyObject } from '../internal/upstream';
import { getFuncRef, getFunctionType } from '../shared/meta-utils';

/** Metadata for a single function */
type FnMeta = {
  type?: 'query' | 'mutation' | 'action';
  [key: string]: unknown;
};

/** Metadata for all functions in a module */
type ModuleMeta = Record<string, FnMeta>;

/** Metadata for all modules - from generated `@convex/api` */
export type CallerMeta = Record<string, ModuleMeta>;

/** Options for individual caller function calls */
export type CallerOpts = {
  /** Skip query silently when unauthenticated (returns null instead of throwing) */
  skipUnauth?: boolean;
};

// Conditional return type based on skipUnauth
type CallerReturn<T, Opts extends CallerOpts | undefined> = Opts extends {
  skipUnauth: true;
}
  ? T | null
  : T;

type FetchFn<T extends 'query' | 'mutation' | 'action'> = <
  Fn extends FunctionReference<T>,
>(
  fn: Fn,
  args: Fn['_args'],
  opts?: CallerOpts
) => Promise<FunctionReturnType<Fn> | null>;

type CreateCallerOptions = {
  fetchQuery: FetchFn<'query'>;
  fetchMutation: FetchFn<'mutation'>;
  fetchAction: FetchFn<'action'>;
  meta: CallerMeta;
  transformer?: DataTransformerOptions;
};

type ResolvedCreateCallerOptions = Omit<CreateCallerOptions, 'transformer'> & {
  transformer: ReturnType<typeof getTransformer>;
};

// Helper type for optional args when empty
type ServerCallerFn<
  TApi,
  K extends keyof TApi,
> = TApi[K] extends FunctionReference<infer T, 'public'>
  ? T extends 'query' | 'mutation' | 'action'
    ? keyof TApi[K]['_args'] extends never
      ? // No args defined → optional
        <Opts extends CallerOpts | undefined = undefined>(
          args?: EmptyObject,
          opts?: Opts
        ) => Promise<CallerReturn<FunctionReturnType<TApi[K]>, Opts>>
      : EmptyObject extends TApi[K]['_args']
        ? // All args optional → optional
          <Opts extends CallerOpts | undefined = undefined>(
            args?: TApi[K]['_args'],
            opts?: Opts
          ) => Promise<CallerReturn<FunctionReturnType<TApi[K]>, Opts>>
        : // Has required args → required
          <Opts extends CallerOpts | undefined = undefined>(
            args: TApi[K]['_args'],
            opts?: Opts
          ) => Promise<CallerReturn<FunctionReturnType<TApi[K]>, Opts>>
    : never
  : ServerCaller<TApi[K]>;

// Recursive type for the caller proxy
export type ServerCaller<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K extends 'http'
        ? never
      : K
    : K]: ServerCallerFn<TApi, K>;
};

function createRecursiveProxy(
  api: Record<string, unknown>,
  path: string[],
  createOpts: ResolvedCreateCallerOptions
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      return createRecursiveProxy(api, [...path, prop], createOpts);
    },
    apply(_target, _thisArg, argsList) {
      const funcRef = getFuncRef(api, path);
      const args = createOpts.transformer.input.serialize(argsList[0] ?? {});
      const callerOpts = argsList[1] as CallerOpts | undefined;
      const fnType = getFunctionType(path, createOpts.meta);

      if (fnType === 'query') {
        return createOpts
          .fetchQuery(
            funcRef as FunctionReference<'query'>,
            args as any,
            callerOpts
          )
          .then((result) => createOpts.transformer.output.deserialize(result));
      }
      if (fnType === 'mutation') {
        return createOpts
          .fetchMutation(
            funcRef as FunctionReference<'mutation'>,
            args as any,
            callerOpts
          )
          .then((result) => createOpts.transformer.output.deserialize(result));
      }
      // action
      return createOpts
        .fetchAction(
          funcRef as FunctionReference<'action'>,
          args as any,
          callerOpts
        )
        .then((result) => createOpts.transformer.output.deserialize(result));
    },
  });
}

/**
 * Create a server caller for direct data fetching without React Query.
 *
 * This is detached from React Query cache - data is NOT available in client components.
 * Use for server-only data that doesn't need to be shared with the client.
 *
 * @example
 * ```tsx
 * // src/lib/convex/rsc.tsx
 * export const caller = createServerCaller(api, {
 *   fetchQuery: fetchAuthQuery,
 *   fetchMutation: fetchAuthMutation,
 * });
 *
 * // app/page.tsx (RSC)
 * const posts = await caller.posts.list();
 * return <div>{posts?.length} posts</div>;
 * ```
 */
export function createServerCaller<TApi extends Record<string, unknown>>(
  api: TApi,
  opts: CreateCallerOptions
): ServerCaller<TApi> {
  return createRecursiveProxy(api, [], {
    ...opts,
    transformer: getTransformer(opts.transformer),
  }) as ServerCaller<TApi>;
}
