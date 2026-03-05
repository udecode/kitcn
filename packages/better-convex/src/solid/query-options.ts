/** biome-ignore-all lint/suspicious/noExplicitAny: Convex type compatibility */

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
  Meta,
} from '../crpc/types';
import { type AuthType, getAuthType } from '../internal/auth';
import type { DistributiveOmit } from '../internal/types';
import type {
  ConvexActionOptions,
  ConvexInfiniteQueryOptions,
  ConvexQueryOptions,
  InfiniteQueryOptsParam,
} from './crpc-types';

type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';
type ReservedMutationOptions = 'mutationFn';

/**
 * Create query options for a Convex query.
 * Unlike the React version, this is NOT a hook - it accepts auth state explicitly.
 */
export function createConvexQueryOptions<T extends FunctionReference<'query'>>(
  funcRef: T,
  args: FunctionArgs<T> | SkipToken,
  opts?: {
    meta?: Meta;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
    hookOptions?: ConvexQueryHookOptions &
      DistributiveOmit<
        SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
        ReservedQueryOptions
      >;
  }
): ConvexQueryOptions<T> & { meta: ConvexQueryMeta } {
  const isSkipped = args === skipToken;
  const meta = opts?.meta;
  const authState = opts?.authState ?? {
    isAuthenticated: false,
    isLoading: true,
  };

  const funcName = getFunctionName(funcRef);
  const authType = getAuthType(meta, funcName);
  const authLoadingApplies = authType === 'optional' || authType === 'required';
  const shouldSkip =
    opts?.hookOptions?.enabled === false ||
    (authLoadingApplies && authState.isLoading) ||
    (authType === 'required' &&
      !authState.isAuthenticated &&
      !authState.isLoading) ||
    (!authState.isAuthenticated &&
      !authState.isLoading &&
      !!opts?.hookOptions?.skipUnauth);

  const baseOptions = convexQuery(
    funcRef,
    isSkipped ? ({} as FunctionArgs<T>) : args
  );

  const { skipUnauth: _, subscribe, ...queryOptions } = opts?.hookOptions ?? {};

  return {
    ...baseOptions,
    ...queryOptions,
    enabled: isSkipped ? false : !shouldSkip,
    meta: {
      ...baseOptions.meta,
      authType,
      subscribe: subscribe !== false,
    },
  };
}

/** Create infinite query options for a paginated Convex query */
export function createConvexInfiniteQueryOptions<
  T extends FunctionReference<'query'>,
>(
  funcRef: T,
  args: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
  opts: InfiniteQueryOptsParam<T>,
  options?: {
    meta?: Meta;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
  }
): ConvexInfiniteQueryOptions<T> {
  const meta = options?.meta;
  const authState = options?.authState ?? {
    isAuthenticated: false,
    isLoading: true,
  };
  const isSkipped = args === skipToken;

  const enabledOpt =
    typeof opts.enabled === 'function' ? undefined : opts.enabled;
  const funcName = getFunctionName(funcRef);
  const authType = getAuthType(meta, funcName);
  const authLoadingApplies = authType === 'optional' || authType === 'required';
  const shouldSkip =
    enabledOpt === false ||
    (authLoadingApplies && authState.isLoading) ||
    (authType === 'required' &&
      !authState.isAuthenticated &&
      !authState.isLoading) ||
    (!authState.isAuthenticated && !authState.isLoading && !!opts.skipUnauth);

  const enabled = isSkipped || shouldSkip ? false : enabledOpt;

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
  };
}

/** Create action query options (one-shot, no subscription) */
export function createConvexActionQueryOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  args: FunctionArgs<Action> | SkipToken,
  options?: {
    meta?: Meta;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
    queryOptions?: { skipUnauth?: boolean } & DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<Action>, DefaultError>,
      ReservedQueryOptions
    >;
  }
): ConvexActionOptions<Action> {
  const isSkipped = args === skipToken;
  const meta = options?.meta;
  const authState = options?.authState ?? {
    isAuthenticated: false,
    isLoading: true,
  };

  const enabled =
    typeof options?.queryOptions?.enabled === 'function'
      ? undefined
      : options?.queryOptions?.enabled;
  const funcName = getFunctionName(action);
  const authType = getAuthType(meta, funcName);
  const authLoadingApplies = authType === 'optional' || authType === 'required';
  const shouldSkip =
    enabled === false ||
    (authLoadingApplies && authState.isLoading) ||
    (authType === 'required' &&
      !authState.isAuthenticated &&
      !authState.isLoading) ||
    (!authState.isAuthenticated &&
      !authState.isLoading &&
      !!options?.queryOptions?.skipUnauth);

  const baseOptions = convexAction(
    action,
    isSkipped ? ({} as FunctionArgs<Action>) : args
  );

  const { skipUnauth: _, ...queryOptions } = options?.queryOptions ?? {};

  return {
    ...baseOptions,
    ...queryOptions,
    enabled: isSkipped ? false : !shouldSkip,
  };
}

/** Create mutation options for a Convex mutation (no hooks, uses convexClient directly) */
export function createConvexMutationOptions<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  convexClient: { mutation: (funcRef: any, args: any) => Promise<any> },
  options?: {
    meta?: Meta;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
    mutationOptions?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<Mutation>,
        DefaultError,
        FunctionArgs<Mutation>
      >,
      ReservedMutationOptions
    >;
    transformer?: DataTransformerOptions;
  }
): SolidMutationOptions<
  FunctionReturnType<Mutation>,
  DefaultError,
  FunctionArgs<Mutation>
> {
  const meta = options?.meta;
  const authState = options?.authState ?? {
    isAuthenticated: false,
    isLoading: true,
  };
  const name = getFunctionName(mutation);
  const [namespace, fnName] = name.split(':');
  const authType = meta?.[namespace]?.[fnName]?.auth as AuthType;
  const resolvedTransformer = getTransformer(options?.transformer);

  return {
    ...options?.mutationOptions,
    mutationFn: async (args) => {
      if (
        authType === 'required' &&
        !authState.isAuthenticated &&
        !authState.isLoading
      ) {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: name,
        });
      }
      return convexClient.mutation(
        mutation,
        resolvedTransformer.input.serialize(args) as FunctionArgs<Mutation>
      );
    },
  };
}

/** Create action mutation options (no hooks, uses convexClient directly) */
export function createConvexActionMutationOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  convexClient: { action: (funcRef: any, args: any) => Promise<any> },
  options?: {
    meta?: Meta;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
    mutationOptions?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<Action>,
        DefaultError,
        FunctionArgs<Action>
      >,
      ReservedMutationOptions
    >;
    transformer?: DataTransformerOptions;
  }
): SolidMutationOptions<
  FunctionReturnType<Action>,
  DefaultError,
  FunctionArgs<Action>
> {
  const meta = options?.meta;
  const authState = options?.authState ?? {
    isAuthenticated: false,
    isLoading: true,
  };
  const name = getFunctionName(action);
  const [namespace, fnName] = name.split(':');
  const authType = meta?.[namespace]?.[fnName]?.auth as AuthType;
  const resolvedTransformer = getTransformer(options?.transformer);

  return {
    ...options?.mutationOptions,
    mutationFn: async (args) => {
      if (
        authType === 'required' &&
        !authState.isAuthenticated &&
        !authState.isLoading
      ) {
        throw new CRPCClientError({
          code: 'UNAUTHORIZED',
          functionName: name,
        });
      }
      return convexClient.action(
        action,
        resolvedTransformer.input.serialize(args) as FunctionArgs<Action>
      );
    },
  };
}
