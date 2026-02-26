/** biome-ignore-all lint/suspicious/noExplicitAny: lib */

/**
 * Framework-agnostic caller factory.
 * getToken is passed as a parameter - decoupled from @convex-dev/better-auth.
 */

import { fetchAction, fetchMutation, fetchQuery } from 'convex/nextjs';
import type {
  ArgsAndOptions,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { EmptyObject } from '../internal/upstream';
import { buildMetaIndex } from '../shared/meta-utils';
import {
  type CallerOpts,
  createServerCaller,
  type ServerCaller,
} from './caller';
import { createLazyCaller, type LazyCaller } from './lazy-caller';

// Token result from getToken
type TokenResult = {
  token?: string;
  isFresh?: boolean;
};

// GetToken function signature - matches @convex-dev/better-auth/utils
type GetTokenFn = (
  siteUrl: string,
  headers: Headers,
  opts?: unknown
) => Promise<TokenResult>;

/** Auth options for server-side calls. */
type AuthOptions = {
  /** Function to extract auth token from request headers. */
  getToken: GetTokenFn;
  /** Custom function to detect UNAUTHORIZED errors. Default checks code property. */
  isUnauthorized?: (error: unknown) => boolean;
};

type CreateCallerFactoryOptions<TApi> = {
  /** Your Convex API object. */
  api: TApi;
  /** Convex site URL (must end in `.convex.site`). */
  convexSiteUrl: string;
  /** Auth options. Pass to enable authenticated calls with JWT caching. */
  auth?: AuthOptions;
  /** Optional wire transformer for request/response payloads (always composed with Date). */
  transformer?: DataTransformerOptions;
};

type OptionalArgs<FuncRef extends FunctionReference<any, any>> =
  FuncRef['_args'] extends EmptyObject
    ? [args?: EmptyObject]
    : [args: FuncRef['_args']];

const getArgsAndOptions = <FuncRef extends FunctionReference<any, any>>(
  args: OptionalArgs<FuncRef>,
  token?: string
): ArgsAndOptions<FuncRef, { token?: string }> => [args[0], { token }];

const parseConvexSiteUrl = (url: string) => {
  if (!url) {
    throw new Error(
      'CONVEX_SITE_URL is not set. This must be set in the environment.'
    );
  }
  if (url.endsWith('.convex.cloud')) {
    throw new Error(
      `CONVEX_SITE_URL should end in .convex.site, not .convex.cloud. Currently set to ${url}.`
    );
  }
  return url;
};

// Context shape returned by createContext
export type ConvexContext<TApi> = {
  token: string | undefined;
  isAuthenticated: boolean;
  caller: ServerCaller<TApi>;
};

/**
 * Framework-agnostic caller factory.
 *
 * @example
 * ```ts
 * const { createContext, createCaller } = createCallerFactory({
 *   api,
 *   convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
 *   auth: { getToken },
 * });
 * ```
 */
// Default getToken returns no auth
const noAuthGetToken: GetTokenFn = () => Promise.resolve({ token: undefined });

export function createCallerFactory<TApi extends Record<string, unknown>>(
  opts: CreateCallerFactoryOptions<TApi>
) {
  const siteUrl = parseConvexSiteUrl(opts.convexSiteUrl);
  const getToken = opts.auth?.getToken ?? noAuthGetToken;
  const isUnauthorized = opts.auth?.isUnauthorized;
  const crpcMeta = buildMetaIndex(opts.api);

  // Internal: call with token and retry logic
  const callWithTokenAndRetry = async <
    FnType extends 'query' | 'mutation' | 'action',
    Fn extends FunctionReference<FnType>,
  >(
    fn: (token?: string) => Promise<FunctionReturnType<Fn>>,
    tokenResult: TokenResult,
    headers: Headers
  ): Promise<FunctionReturnType<Fn> | null> => {
    const shouldRetryWithFreshToken = !!opts.auth && !tokenResult.isFresh;

    try {
      return await fn(tokenResult.token);
    } catch (error) {
      // Only refresh when the initial token came from cache and may be stale.
      if (!shouldRetryWithFreshToken) {
        if (isUnauthorized?.(error)) {
          return null;
        }
        throw error;
      }

      // Force refresh token and retry
      const newToken = await getToken(siteUrl, headers, {
        ...opts,
        forceRefresh: true,
      });
      try {
        return await fn(newToken.token);
      } catch (retryError) {
        if (isUnauthorized?.(retryError)) {
          return null;
        }
        throw retryError;
      }
    }
  };

  // createContext REQUIRES explicit headers
  const createContext = async (reqOpts: {
    headers: Headers;
  }): Promise<ConvexContext<TApi>> => {
    const tokenResult = await getToken(siteUrl, reqOpts.headers, opts);

    // Internal fetch functions
    const fetchAuthQuery = async <Query extends FunctionReference<'query'>>(
      query: Query,
      args: Query['_args'],
      callerOpts?: CallerOpts
    ): Promise<FunctionReturnType<Query> | null> => {
      // Proactive skip if not authenticated and skipUnauth
      if (callerOpts?.skipUnauth && !tokenResult.token) {
        return null;
      }
      return callWithTokenAndRetry(
        (token) => {
          const argsAndOptions = getArgsAndOptions([args], token);
          return fetchQuery(query, argsAndOptions[0], argsAndOptions[1]);
        },
        tokenResult,
        reqOpts.headers
      );
    };

    const fetchAuthMutation = async <
      Mutation extends FunctionReference<'mutation'>,
    >(
      mutation: Mutation,
      args: Mutation['_args'],
      callerOpts?: CallerOpts
    ): Promise<FunctionReturnType<Mutation> | null> => {
      if (callerOpts?.skipUnauth && !tokenResult.token) {
        return null;
      }
      return callWithTokenAndRetry(
        (token) => {
          const argsAndOptions = getArgsAndOptions([args], token);
          return fetchMutation(mutation, argsAndOptions[0], argsAndOptions[1]);
        },
        tokenResult,
        reqOpts.headers
      );
    };

    const fetchAuthAction = async <Action extends FunctionReference<'action'>>(
      action: Action,
      args: Action['_args'],
      callerOpts?: CallerOpts
    ): Promise<FunctionReturnType<Action> | null> => {
      if (callerOpts?.skipUnauth && !tokenResult.token) {
        return null;
      }
      return callWithTokenAndRetry(
        (token) => {
          const argsAndOptions = getArgsAndOptions([args], token);
          return fetchAction(action, argsAndOptions[0], argsAndOptions[1]);
        },
        tokenResult,
        reqOpts.headers
      );
    };

    return {
      token: tokenResult.token,
      isAuthenticated: !!tokenResult.token,
      caller: createServerCaller(opts.api, {
        fetchQuery: fetchAuthQuery,
        fetchMutation: fetchAuthMutation,
        fetchAction: fetchAuthAction,
        meta: crpcMeta,
        transformer: opts.transformer,
      }),
    };
  };

  // Factory that takes context function, returns lazy caller
  const createCaller = (
    ctxFn: () => Promise<ConvexContext<TApi>>
  ): LazyCaller<TApi> => createLazyCaller(opts.api, ctxFn);

  return { createContext, createCaller };
}
