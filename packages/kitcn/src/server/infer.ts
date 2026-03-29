import type { FunctionReference, FunctionReturnType } from 'convex/server';

import type { InferHttpInput, InferHttpOutput } from '../crpc/http-types';
import type { CRPCHttpRouter, HttpRouterRecord } from './http-router';
import type { HttpProcedure } from './http-types';

/**
 * Combine a Convex API with an HTTP router for unified type inference.
 *
 * @example
 * ```ts
 * import type { WithHttpRouter } from 'kitcn/server';
 *
 * export type AppRouter = WithHttpRouter<typeof api, typeof httpRouter>;
 * export type ApiInputs = inferApiInputs<AppRouter>;
 * // ApiInputs['http']['todos']['create'] works
 * ```
 */
export type WithHttpRouter<TApi, TRouter> = TApi & { http?: TRouter };

/** Helper to unwrap optional/nullable types for inference */
type UnwrapOptional<T> = T extends undefined ? never : NonNullable<T>;
type PublicApiKey<K> = K extends string
  ? K extends `_${string}`
    ? never
    : K
  : K;

/** Recursive output inference that handles optional properties */
type InferOutputsRecursive<T> =
  T extends FunctionReference<infer _T, 'public'>
    ? FunctionReturnType<T>
    : T extends HttpProcedure
      ? InferHttpOutput<T>
      : T extends CRPCHttpRouter<infer R>
        ? inferApiOutputs<R>
        : T extends HttpRouterRecord
          ? inferApiOutputs<T>
          : inferApiOutputs<T>;

/**
 * Infer all output types from a Convex API (including HTTP routes).
 * Optional properties (like `http?`) are unwrapped for easier access.
 *
 * @example
 * ```ts
 * import { api } from '@convex/api';
 * import type { inferApiOutputs } from 'kitcn/server';
 *
 * type AppRouter = typeof api & { http?: typeof httpRouter };
 * type ApiOutputs = inferApiOutputs<AppRouter>;
 *
 * type LinkData = ApiOutputs['scraper']['scrapeLink'];
 * type TodoList = ApiOutputs['http']['todos']['list'];
 * ```
 */
export type inferApiOutputs<TApi> = {
  [K in keyof TApi as PublicApiKey<K>]-?: InferOutputsRecursive<
    UnwrapOptional<TApi[K]>
  >;
};

/** Recursive input inference that handles optional properties */
type InferInputsRecursive<T> =
  T extends FunctionReference<infer _T, 'public'>
    ? T['_args']
    : T extends HttpProcedure
      ? InferHttpInput<T>
      : T extends CRPCHttpRouter<infer R>
        ? inferApiInputs<R>
        : T extends HttpRouterRecord
          ? inferApiInputs<T>
          : inferApiInputs<T>;

/**
 * Infer all input types from a Convex API (including HTTP routes).
 * Optional properties (like `http?`) are unwrapped for easier access.
 *
 * @example
 * ```ts
 * import { api } from '@convex/api';
 * import type { inferApiInputs } from 'kitcn/server';
 *
 * type AppRouter = typeof api & { http?: typeof httpRouter };
 * type ApiInputs = inferApiInputs<AppRouter>;
 *
 * type ScrapeLinkInput = ApiInputs['scraper']['scrapeLink'];
 * type CreateTodoInput = ApiInputs['http']['todos']['create'];
 * ```
 */
export type inferApiInputs<TApi> = {
  [K in keyof TApi as PublicApiKey<K>]-?: InferInputsRecursive<
    UnwrapOptional<TApi[K]>
  >;
};
