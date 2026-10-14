/** biome-ignore-all lint/suspicious/noExplicitAny: Convex type compatibility */

/**
 * Query options factories for Convex functions.
 * Forked from @convex-dev/react-query to support auth-aware error handling.
 */

import {
  type DefaultError,
  type SkipToken,
  skipToken,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  useAction as useConvexActionBase,
  useMutation as useConvexMutationBase,
} from 'convex/react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import { getFunctionName } from 'convex/server';
import { useMemo } from 'react';
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
import { useAuthSkip } from '../internal/auth';
import { resolveEnabled } from '../internal/enabled';
import { createHashFn } from '../internal/hash';
import { isRecord, isShallowEqual } from '../internal/shallow';
import type { DistributiveOmit } from '../internal/types';
import { useStableIdentity } from '../internal/use-stable-identity';
import { useAuthGuard } from './auth-store';
import { useFnMeta, useMeta } from './context';
import type {
  ConvexActionOptions,
  ConvexInfiniteQueryOptions,
  ConvexOptimisticUpdateOption,
  ConvexQueryOptions,
  InfiniteQueryOptsParam,
} from './crpc-types';

// Reserved options that we control - users cannot override these
type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';
type ReservedMutationOptions = 'mutationFn';

const EMPTY_ARGS = {};
const hashConvexOptionsKey = createHashFn();

type QueryOptionsPrefix = 'convexQuery' | 'convexAction';
type StableQueryArgs<TArgs> = {
  hash: string;
  value: TArgs;
};

type QueryOptionsResult<T extends FunctionReference<'query'>> =
  ConvexQueryOptions<T> & { meta: ConvexQueryMeta };
type ActionQueryOptionsResult<T extends FunctionReference<'action'>> =
  ConvexActionOptions<T> & { meta: ConvexQueryMeta };

/**
 * Compare two computed option objects for observable equivalence.
 *
 * Top-level values are compared by reference so inline `select` /
 * `placeholderData` closures are never treated as equal. `meta` is exempt: it
 * is rebuilt from scalars by these hooks on every render, so comparing its
 * identity would defeat the whole check.
 */
function areQueryOptionsEquivalent(a: object, b: object): boolean {
  const keys = Object.keys(a);

  if (keys.length !== Object.keys(b).length) {
    return false;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;

  for (const key of keys) {
    if (!Object.hasOwn(right, key)) {
      return false;
    }

    const previous = left[key];
    const next = right[key];

    if (Object.is(previous, next)) {
      continue;
    }
    if (
      key === 'meta' &&
      isRecord(previous) &&
      isRecord(next) &&
      isShallowEqual(previous, next)
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function useStableQueryArgs<TArgs>(
  prefix: QueryOptionsPrefix,
  funcRef: FunctionReference<'query' | 'action'>,
  args: TArgs | SkipToken
): StableQueryArgs<TArgs> {
  const resolvedArgs = (
    args === skipToken || args == null ? EMPTY_ARGS : args
  ) as TArgs;
  const argsHash = hashConvexOptionsKey([
    prefix,
    getFunctionName(funcRef),
    resolvedArgs,
  ]);

  // Keyed on the structural hash only. Call sites pass inline object literals,
  // so an identity dep would rebuild on every render; the hash fully determines
  // the value. The clone is kept because a caller that mutates its args object
  // after render must not be able to rewrite the queryKey the QueryCache holds.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- argsHash fully determines resolvedArgs
  const value = useMemo(() => structuredClone(resolvedArgs), [argsHash]);

  return useMemo(() => ({ hash: argsHash, value }), [argsHash, value]);
}

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
      UseQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
): QueryOptionsResult<T> {
  // Handle skipToken - return disabled query with proper queryKey
  const isSkipped = args === skipToken;

  // Convert enabled to boolean (TanStack Query allows function)
  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const { authType, shouldSkip } = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });
  const stableArgs = useStableQueryArgs(
    'convexQuery',
    funcRef,
    isSkipped ? (EMPTY_ARGS as FunctionArgs<T>) : args
  );

  // Get base options from convexQuery (use empty args for skipToken to generate queryKey)
  const baseOptions = useMemo(
    () => convexQuery(funcRef, stableArgs.value),
    [funcRef, stableArgs]
  );

  const next = useMemo<QueryOptionsResult<T>>(() => {
    // Extract ConvexQueryHookOptions from merged options
    const {
      enabled: userEnabled,
      skipUnauth,
      subscribe,
      ...queryOptions
    } = options ?? {};

    return {
      ...baseOptions,
      ...queryOptions, // Spread user options
      enabled: resolveEnabled(!(isSkipped || shouldSkip), userEnabled),
      meta: {
        ...baseOptions.meta,
        authType,
        skipUnauth,
        subscribe: subscribe !== false,
      },
    };
  }, [authType, baseOptions, isSkipped, options, shouldSkip]);

  // The idiomatic two-argument call passes an inline options literal, so the
  // memo above always recomputes. Stabilize the output instead of the input:
  // a value-equal result keeps its identity, which is what lets
  // QueryObserver.setOptions' shallowEqualObjects guard succeed.
  return useStableIdentity(next, areQueryOptionsEquivalent);
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

  const { authType, shouldSkip } = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabledOpt,
    skipUnauth: opts.skipUnauth,
  });

  // Determine final enabled state (keeps a caller-supplied predicate)
  const enabled = resolveEnabled(!(isSkipped || shouldSkip), opts.enabled);

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
      authType,
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
    UseQueryOptions<FunctionReturnType<Action>, DefaultError>,
    ReservedQueryOptions
  >
): ActionQueryOptionsResult<Action> {
  const isSkipped = args === skipToken;

  // Convert enabled to boolean (TanStack Query allows function)
  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const { authType, shouldSkip } = useAuthSkip(action, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });
  const stableArgs = useStableQueryArgs(
    'convexAction',
    action,
    isSkipped ? (EMPTY_ARGS as FunctionArgs<Action>) : args
  );

  // Get base options from convexAction (use empty args for skipToken)
  const baseOptions = useMemo(
    () => convexAction(action, stableArgs.value),
    [action, stableArgs]
  );

  const next = useMemo<ActionQueryOptionsResult<Action>>(() => {
    // Extract skipUnauth from options before spreading
    const { enabled: userEnabled, skipUnauth, ...queryOptions } = options ?? {};

    return {
      ...baseOptions,
      ...queryOptions,
      enabled: resolveEnabled(!(isSkipped || shouldSkip), userEnabled),
      meta: {
        ...baseOptions.meta,
        authType,
        skipUnauth,
      },
    };
  }, [authType, baseOptions, isSkipped, options, shouldSkip]);

  return useStableIdentity(next, areQueryOptionsEquivalent);
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
    UseMutationOptions<
      FunctionReturnType<Mutation>,
      DefaultError,
      FunctionArgs<Mutation>
    >,
    ReservedMutationOptions
  > &
    ConvexOptimisticUpdateOption<FunctionArgs<Mutation>>,
  transformer?: DataTransformerOptions
): UseMutationOptions<
  FunctionReturnType<Mutation>,
  DefaultError,
  FunctionArgs<Mutation>
> {
  const guard = useAuthGuard();
  const getMeta = useFnMeta();
  const name = getFunctionName(mutation);
  const [namespace, fnName] = name.split(':');
  const authType = getMeta(namespace, fnName)?.auth as AuthType;
  const { optimisticUpdate, ...mutationOptions } = options ?? {};
  const reactMutation = useConvexMutationBase(mutation);
  const convexMutation = optimisticUpdate
    ? reactMutation.withOptimisticUpdate(optimisticUpdate)
    : reactMutation;
  const resolvedTransformer = getTransformer(transformer);

  return {
    ...mutationOptions, // Spread user options FIRST
    mutationFn: async (args) => {
      // Only guard if auth is required
      if (authType === 'required' && guard()) {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: name,
        });
      }

      return convexMutation(
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
    UseMutationOptions<
      FunctionReturnType<Action>,
      DefaultError,
      FunctionArgs<Action>
    >,
    ReservedMutationOptions
  >,
  transformer?: DataTransformerOptions
): UseMutationOptions<
  FunctionReturnType<Action>,
  DefaultError,
  FunctionArgs<Action>
> {
  const guard = useAuthGuard();
  const getMeta = useFnMeta();
  const name = getFunctionName(action);
  const [namespace, fnName] = name.split(':');
  const authType = getMeta(namespace, fnName)?.auth as AuthType;
  const convexAction = useConvexActionBase(action);
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

      return convexAction(
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
    UseMutationOptions<
      FunctionReturnType<TGenerateUrlMutation>,
      DefaultError,
      { file: File } & FunctionArgs<TGenerateUrlMutation>
    >,
    ReservedMutationOptions
  >
): UseMutationOptions<
  FunctionReturnType<TGenerateUrlMutation>,
  DefaultError,
  { file: File } & FunctionArgs<TGenerateUrlMutation>
> {
  const generateUrl = useConvexMutationBase(generateUrlMutation);

  return {
    ...options,
    mutationFn: async ({ file, ...args }) => {
      const result = await generateUrl(
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
