/**
 * Query options factories for Convex functions (SolidJS).
 * Port of the React version — uses ConvexClient directly instead of convex/react hooks.
 *
 * Note: In @tanstack/solid-query, UseMutationOptions and UseQueryOptions are
 * Accessor wrappers. We use SolidMutationOptions and SolidQueryOptions (plain
 * object types) for parameters and return values.
 */

import {
  type DefaultError,
  type SkipToken,
  type SolidMutationOptions,
  type SolidQueryOptions,
  skipToken,
} from '@tanstack/solid-query';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import { getFunctionName } from 'convex/server';
import { CRPCClientError } from '../crpc/error';
import {
  convexAction,
  convexInfiniteQueryOptions,
  convexQuery,
} from '../crpc/query-options';
import {
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type {
  ConvexQueryHookOptions,
  ConvexQueryMeta,
  InfiniteQueryInput,
} from '../crpc/types';
import type { DistributiveOmit } from '../internal/types';
import { useAuthSkip, useFnMeta, useMeta } from './auth';
import { useAuthGuard } from './auth-store';
import { useConvex } from './convex-solid';
import type {
  ConvexActionOptions,
  ConvexInfiniteQueryOptions,
  ConvexQueryOptions,
  InfiniteQueryOptsParam,
} from './crpc-types';

// Reserved options that we control - users cannot override these
type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';
type ReservedMutationOptions = 'mutationFn';

/**
 * Hook that returns query options for use with useQuery.
 * Handles skipUnauth by setting enabled: false when unauthorized.
 *
 * @example
 * ```tsx
 * const { data } = useQuery(useConvexQueryOptions(api.user.get, { id }));
 * ```
 *
 * @example With skipToken for conditional queries
 * ```tsx
 * const { data } = useQuery(useConvexQueryOptions(api.user.get, userId ? { id: userId } : skipToken));
 * ```
 *
 * @example With skipUnauth
 * ```tsx
 * const { data } = useQuery(useConvexQueryOptions(api.user.get, { id }, { skipUnauth: true }));
 * ```
 *
 * @example With TanStack Query options
 * ```tsx
 * const { data } = useQuery(useConvexQueryOptions(api.user.get, { id }, { enabled: !!id, placeholderData: [] }));
 * ```
 */
export function useConvexQueryOptions<T extends FunctionReference<'query'>>(
  funcRef: T,
  args: FunctionArgs<T> | SkipToken,
  options?: ConvexQueryHookOptions &
    DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
): ConvexQueryOptions<T> & { meta: ConvexQueryMeta } {
  // Handle skipToken - return disabled query with proper queryKey
  const isSkipped = args === skipToken;

  // Convert enabled to boolean (TanStack Query allows function)
  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const authSkip = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });

  // Get base options from convexQuery (use empty args for skipToken to generate queryKey)
  const baseOptions = convexQuery(
    funcRef,
    isSkipped ? ({} as FunctionArgs<T>) : args
  );

  // Extract ConvexQueryHookOptions from merged options
  const { skipUnauth: _, subscribe, ...queryOptions } = options ?? {};

  return {
    ...baseOptions,
    ...queryOptions, // Spread user options
    enabled: isSkipped ? false : !authSkip.shouldSkip,
    meta: {
      ...baseOptions.meta,
      authType: authSkip.authType,
      subscribe: subscribe !== false,
    },
  };
}

/**
 * Hook that returns infinite query options for use with useInfiniteQuery.
 * Handles auth type detection from meta and skipUnauth.
 *
 * @example
 * ```tsx
 * const { data } = useInfiniteQuery(
 *   useConvexInfiniteQueryOptions(api.posts.list, { userId }, { limit: 20 })
 * );
 * ```
 *
 * @example With skipToken for conditional queries
 * ```tsx
 * const { data } = useInfiniteQuery(
 *   useConvexInfiniteQueryOptions(api.posts.list, userId ? { userId } : skipToken, { limit: 20 })
 * );
 * ```
 *
 * @example With skipUnauth
 * ```tsx
 * const { data } = useInfiniteQuery(
 *   useConvexInfiniteQueryOptions(api.posts.list, { userId }, { limit: 20, skipUnauth: true })
 * );
 * ```
 */
export function useConvexInfiniteQueryOptions<
  T extends FunctionReference<'query'>,
>(
  funcRef: T,
  args: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
  opts: InfiniteQueryOptsParam<T>
): ConvexInfiniteQueryOptions<T> {
  const meta = useMeta();
  const isSkipped = args === skipToken;

  // Convert enabled to boolean (TanStack Query allows function)
  const enabledOpt =
    typeof opts.enabled === 'function' ? undefined : opts.enabled;

  const authSkip = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabledOpt,
    skipUnauth: opts.skipUnauth,
  });

  // Determine final enabled state
  const enabled = isSkipped || authSkip.shouldSkip ? false : enabledOpt;

  const baseOptions = convexInfiniteQueryOptions(
    funcRef,
    isSkipped ? ({} as InfiniteQueryInput<FunctionArgs<T>>) : args,
    { ...opts, enabled },
    meta
  );

  return {
    ...baseOptions,
    meta: {
      ...baseOptions.meta,
      authType: authSkip.authType,
    },
  } as ConvexInfiniteQueryOptions<T>;
}

/**
 * Hook that returns query options for using an action as a one-shot query.
 * Actions don't support WebSocket subscriptions - they're one-time calls.
 *
 * @example
 * ```tsx
 * const { data } = useQuery(useConvexActionQueryOptions(api.ai.analyze, { id }));
 * ```
 *
 * @example With skipToken for conditional queries
 * ```tsx
 * const { data } = useQuery(useConvexActionQueryOptions(api.ai.analyze, id ? { id } : skipToken));
 * ```
 *
 * @example With skipUnauth
 * ```tsx
 * const { data } = useQuery(useConvexActionQueryOptions(api.ai.analyze, { id }, { skipUnauth: true }));
 * ```
 */
export function useConvexActionQueryOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  args: FunctionArgs<Action> | SkipToken,
  options?: { skipUnauth?: boolean } & DistributiveOmit<
    SolidQueryOptions<FunctionReturnType<Action>, DefaultError>,
    ReservedQueryOptions
  >
): ConvexActionOptions<Action> {
  const isSkipped = args === skipToken;

  // Convert enabled to boolean (TanStack Query allows function)
  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const authSkip = useAuthSkip(action, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });

  // Get base options from convexAction (use empty args for skipToken)
  const baseOptions = convexAction(
    action,
    isSkipped ? ({} as FunctionArgs<Action>) : args
  );

  // Extract skipUnauth from options before spreading
  const { skipUnauth: _, ...queryOptions } = options ?? {};

  return {
    ...baseOptions,
    ...queryOptions,
    enabled: isSkipped ? false : !authSkip.shouldSkip,
  };
}

type AuthType = 'required' | 'optional' | undefined;

/**
 * Hook that returns mutation options for use with useMutation.
 * Wraps the Convex mutation with auth guard logic.
 *
 * @example
 * ```tsx
 * const { mutate } = useMutation(useConvexMutationOptions(api.user.update));
 * ```
 *
 * @example With TanStack Query options
 * ```tsx
 * const { mutate } = useMutation(useConvexMutationOptions(api.user.update, {
 *   onSuccess: () => toast.success('Updated!'),
 * }));
 * ```
 */
export function useConvexMutationOptions<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<Mutation>,
      DefaultError,
      FunctionArgs<Mutation>
    >,
    ReservedMutationOptions
  >,
  transformer?: DataTransformerOptions
): SolidMutationOptions<
  FunctionReturnType<Mutation>,
  DefaultError,
  FunctionArgs<Mutation>
> {
  const guard = useAuthGuard();
  const getMeta = useFnMeta();
  const name = getFunctionName(mutation);
  const [namespace, fnName] = name.split(':');
  const authType = getMeta(namespace, fnName)?.auth as AuthType;
  const convex = useConvex();
  const resolvedTransformer = getTransformer(transformer);

  return {
    ...options, // Spread user options FIRST
    mutationFn: async (args) => {
      // Only guard if auth is required
      if (authType === 'required' && guard()) {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: name,
        });
      }

      return convex.mutation(
        mutation,
        resolvedTransformer.input.serialize(args) as FunctionArgs<Mutation>
      );
    },
  };
}

/**
 * Hook that returns action options for use with useMutation.
 * Wraps the Convex action with auth guard logic.
 *
 * @example
 * ```tsx
 * const { mutate } = useMutation(useConvexActionOptions(api.ai.generate));
 * ```
 *
 * @example With TanStack Query options
 * ```tsx
 * const { mutate } = useMutation(useConvexActionOptions(api.ai.generate, {
 *   onSuccess: (data) => console.info(data),
 * }));
 * ```
 */
export function useConvexActionOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<Action>,
      DefaultError,
      FunctionArgs<Action>
    >,
    ReservedMutationOptions
  >,
  transformer?: DataTransformerOptions
): SolidMutationOptions<
  FunctionReturnType<Action>,
  DefaultError,
  FunctionArgs<Action>
> {
  const guard = useAuthGuard();
  const getMeta = useFnMeta();
  const name = getFunctionName(action);
  const [namespace, fnName] = name.split(':');
  const authType = getMeta(namespace, fnName)?.auth as AuthType;
  const convex = useConvex();
  const resolvedTransformer = getTransformer(transformer);

  return {
    ...options, // Spread user options FIRST
    mutationFn: async (args) => {
      // Only guard if auth is required
      if (authType === 'required' && guard()) {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: name,
        });
      }

      return convex.action(
        action,
        resolvedTransformer.input.serialize(args) as FunctionArgs<Action>
      );
    },
  };
}

/**
 * Hook that returns upload mutation options for use with useMutation.
 * Generates a presigned URL, then uploads the file directly to storage.
 *
 * @example
 * ```tsx
 * const { mutate } = useMutation(useUploadMutationOptions(api.storage.generateUrl));
 * mutate({ file, ...otherArgs });
 * ```
 *
 * @example With TanStack Query options
 * ```tsx
 * const { mutate } = useMutation(useUploadMutationOptions(api.storage.generateUrl, {
 *   onSuccess: (result) => console.info('Uploaded:', result.key),
 * }));
 * ```
 */
export function useUploadMutationOptions<
  TGenerateUrlMutation extends FunctionReference<
    'mutation',
    'public',
    any,
    { key: string; url: string }
  >,
>(
  generateUrlMutation: TGenerateUrlMutation,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<TGenerateUrlMutation>,
      DefaultError,
      { file: File } & FunctionArgs<TGenerateUrlMutation>
    >,
    ReservedMutationOptions
  >
): SolidMutationOptions<
  FunctionReturnType<TGenerateUrlMutation>,
  DefaultError,
  { file: File } & FunctionArgs<TGenerateUrlMutation>
> {
  const convex = useConvex();

  return {
    ...options,
    mutationFn: async ({ file, ...args }) => {
      const result = await convex.mutation(
        generateUrlMutation,
        args as FunctionArgs<TGenerateUrlMutation>
      );
      const { url } = result;

      const response = await fetch(url, {
        body: file,
        headers: { 'Content-Type': file.type },
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return result;
    },
  };
}
