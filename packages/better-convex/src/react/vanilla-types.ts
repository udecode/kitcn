import type { Watch, WatchQueryOptions } from 'convex/react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import type {
  VanillaAction,
  VanillaMutation,
  VanillaQuery,
} from '../crpc/types';

type EmptyObject = Record<string, never>;

/** Vanilla query with watchQuery support (React-specific, uses convex/react Watch) */
export type VanillaQueryWithWatch<T extends FunctionReference<'query'>> =
  VanillaQuery<T> & {
    watchQuery: keyof FunctionArgs<T> extends never
      ? (
          args?: EmptyObject,
          opts?: WatchQueryOptions
        ) => Watch<FunctionReturnType<T>>
      : EmptyObject extends FunctionArgs<T>
        ? (
            args?: FunctionArgs<T>,
            opts?: WatchQueryOptions
          ) => Watch<FunctionReturnType<T>>
        : (
            args: FunctionArgs<T>,
            opts?: WatchQueryOptions
          ) => Watch<FunctionReturnType<T>>;
  };

/**
 * React-specific vanilla CRPC client with watchQuery support.
 * Use this type when you need watchQuery on queries (React/convex/react only).
 */
export type ReactVanillaCRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? VanillaQueryWithWatch<TApi[K]>
    : TApi[K] extends FunctionReference<'mutation'>
      ? VanillaMutation<TApi[K]>
      : TApi[K] extends FunctionReference<'action'>
        ? VanillaAction<TApi[K]>
        : TApi[K] extends Record<string, unknown>
          ? ReactVanillaCRPCClient<TApi[K]>
          : never;
};
