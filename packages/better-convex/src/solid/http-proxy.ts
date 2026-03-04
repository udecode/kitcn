/**
 * HTTP Proxy for TanStack Query (SolidJS)
 *
 * Provides queryOptions/mutationOptions for HTTP endpoints,
 * colocated under `crpc.http.*` namespace.
 *
 * @example
 * ```ts
 * const crpc = useCRPC();
 *
 * // GET endpoint → queryOptions (no subscription)
 * const data = createQuery(() => crpc.http.todos.get.queryOptions({ id }));
 *
 * // POST endpoint → mutationOptions
 * const mutation = createMutation(() => crpc.http.todos.create.mutationOptions());
 * await mutation.mutateAsync({ title: 'New todo' });
 * ```
 */

import type { DefaultError, QueryFilters } from '@tanstack/query-core';
import type {
  SolidMutationOptions,
  SolidQueryOptions,
} from '@tanstack/solid-query';
import type { z } from 'zod';
import { HttpClientError, type HttpErrorCode } from '../crpc/http-types';
import {
  type CombinedDataTransformer,
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type { DistributiveOmit, Simplify } from '../internal/types';
import type { CRPCHttpRouter, HttpRouterRecord } from '../server/http-router';
import type { HttpProcedure } from '../server/http-types';
import type { UnsetMarker } from '../server/types';

// ============================================================================
// HTTP Route Map (from codegen)
// ============================================================================

export type HttpRouteInfo = { path: string; method: string };
export type HttpRouteMap = Record<string, HttpRouteInfo>;

// ============================================================================
// Hybrid Input Types (tRPC-like JSON body, explicit param/query/form)
// ============================================================================

/** Form value types (matches Hono's FormValue) */
export type HttpFormValue = string | Blob;

/** Reserved keys that are not part of JSON body */
const RESERVED_KEYS = new Set([
  'params',
  'searchParams',
  'form',
  'fetch',
  'init',
  'headers',
]);

/**
 * Hybrid input args: JSON body fields at root, explicit params/searchParams/form.
 * - JSON body: spread at root level (tRPC-style)
 * - Path params: { params: { id: '123' } }
 * - Query params: { searchParams: { limit: '10' } }
 * - Form data: { form: { file: blob } } - typed via .form() builder
 * - Client options: { headers, fetch, init } - for per-call customization
 */
export type HttpInputArgs = {
  /** Path parameters (e.g., :id in /users/:id) */
  params?: Record<string, string>;
  /** Query string parameters */
  searchParams?: Record<string, string | string[]>;
  /** Form data body (Content-Type: multipart/form-data) - typed via .form() builder */
  form?: Record<string, HttpFormValue | HttpFormValue[]>;
  /** Custom fetch function (per-call override) */
  fetch?: typeof fetch;
  /** Standard RequestInit (per-call override) */
  init?: RequestInit;
  /** Additional headers (per-call override) */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Any other properties are JSON body fields */
  [key: string]: unknown;
};

/**
 * Client request options (matches Hono's ClientRequestOptions).
 * Standard RequestInit in `init` takes highest priority and can override
 * things that are set automatically like body, method, headers.
 */
export type HttpClientOptions = {
  /** Custom fetch function */
  fetch?: typeof fetch;
  /**
   * Standard RequestInit - takes highest priority.
   * Can override body, method, headers if needed.
   */
  init?: RequestInit;
  /** Additional headers (or async function returning headers) */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
};

// ============================================================================
// Type Inference Utilities
// ============================================================================

/** Infer schema type or return empty object if UnsetMarker */
type InferSchemaOrEmpty<T> = T extends UnsetMarker
  ? object
  : T extends z.ZodTypeAny
    ? z.infer<T>
    : object;

/** Infer merged input from HttpProcedure (flat - used internally) */
type InferHttpInput<T> =
  T extends HttpProcedure<
    infer TInput,
    infer _TOutput,
    infer TParams,
    infer TQuery
  >
    ? Simplify<
        InferSchemaOrEmpty<TParams> &
          InferSchemaOrEmpty<TQuery> &
          InferSchemaOrEmpty<TInput>
      >
    : object;

/**
 * Extract string keys from a Zod object schema.
 * Used for param/query which are always strings in URLs.
 */
type ZodObjectKeys<T> =
  T extends z.ZodObject<infer Shape>
    ? { [K in keyof Shape]: string }
    : Record<string, string>;

/**
 * Extract string or string[] keys from a Zod object schema.
 * Query params can have array values.
 */
type ZodQueryKeys<T> =
  T extends z.ZodObject<infer Shape>
    ? { [K in keyof Shape]?: string | string[] }
    : Record<string, string | string[]>;

/**
 * Infer client-side args from HttpProcedure with proper nesting.
 * - params: only present if TParams is defined, always strings (URL path params)
 * - searchParams: only present if TQuery is defined, always strings (URL query params)
 * - form: only present if TForm is defined, typed from schema
 * - JSON body fields spread at root level (typed from schema)
 * - Client options (fetch, init, headers) always optional for per-call overrides
 */
type InferHttpClientArgs<T> =
  T extends HttpProcedure<
    infer TInput,
    infer _TOutput,
    infer TParams,
    infer TQuery,
    infer _TMethod,
    infer TForm
  >
    ? Simplify<
        // params key only if TParams is defined - always strings (URL path params)
        (TParams extends UnsetMarker
          ? object
          : { params: ZodObjectKeys<TParams> }) &
          // searchParams key only if TQuery is defined - always strings (URL query params)
          (TQuery extends UnsetMarker
            ? object
            : { searchParams: ZodQueryKeys<TQuery> }) &
          // form key only if TForm is defined - typed from schema
          (TForm extends UnsetMarker
            ? object
            : TForm extends z.ZodTypeAny
              ? { form: z.infer<TForm> }
              : object) &
          // JSON body fields spread at root - use actual inferred types
          (TInput extends UnsetMarker
            ? object
            : TInput extends z.ZodTypeAny
              ? z.infer<TInput>
              : object) & {
            // Client options always optional for per-call overrides
            fetch?: typeof fetch;
            init?: RequestInit;
            headers?:
              | Record<string, string>
              | (() =>
                  | Record<string, string>
                  | Promise<Record<string, string>>);
          }
      >
    : HttpInputArgs;

/** Infer output type from HttpProcedure */
type InferHttpOutput<T> =
  T extends HttpProcedure<
    infer _TInput,
    infer TOutput,
    infer _TParams,
    infer _TQuery
  >
    ? TOutput extends UnsetMarker
      ? unknown
      : TOutput extends z.ZodTypeAny
        ? z.infer<TOutput>
        : unknown
    : unknown;

// ============================================================================
// HTTP Query Key
// ============================================================================

/** Query key with args (3-element) or prefix key without args (2-element) for invalidation */
export type HttpQueryKey =
  | readonly ['httpQuery', string, unknown]
  | readonly ['httpQuery', string];
export type HttpMutationKey = readonly ['httpMutation', string];

// ============================================================================
// HTTP Procedure Options Types
// ============================================================================

type ReservedQueryOptions = 'queryKey' | 'queryFn';
type ReservedMutationOptions = 'mutationFn';

/** Query options for GET HTTP endpoints - compatible with both createQuery and createSuspenseQuery */
type HttpQueryOptsReturn<T extends HttpProcedure> = Omit<
  SolidQueryOptions<
    InferHttpOutput<T>,
    Error,
    InferHttpOutput<T>,
    HttpQueryKey
  >,
  'queryFn'
> & {
  queryFn: () => Promise<InferHttpOutput<T>>;
};

/** Mutation options for POST/PUT/PATCH/DELETE HTTP endpoints - typed variables */
type HttpMutationOptsReturn<T extends HttpProcedure> = SolidMutationOptions<
  InferHttpOutput<T>,
  DefaultError,
  InferHttpClientArgs<T>
>;

/** Query options (TanStack Query only - client opts go in args) */
type HttpQueryOptions<T extends HttpProcedure> = DistributiveOmit<
  HttpQueryOptsReturn<T>,
  ReservedQueryOptions
>;

/** Mutation options (TanStack Query only - client opts go in mutate args) */
type HttpMutationOptions<T extends HttpProcedure> = DistributiveOmit<
  HttpMutationOptsReturn<T>,
  ReservedMutationOptions
>;

/**
 * Decorated GET procedure with queryOptions and mutationOptions.
 * - queryOptions: For cached data fetching (createQuery/createSuspenseQuery)
 * - mutationOptions: For one-time actions like exports (createMutation)
 */
type DecorateHttpQuery<T extends HttpProcedure> = {
  queryOptions: keyof InferHttpInput<T> extends never
    ? (
        args?: InferHttpClientArgs<T>,
        opts?: HttpQueryOptions<T>
      ) => HttpQueryOptsReturn<T>
    : object extends InferHttpInput<T>
      ? (
          args?: InferHttpClientArgs<T>,
          opts?: HttpQueryOptions<T>
        ) => HttpQueryOptsReturn<T>
      : (
          args: InferHttpClientArgs<T>,
          opts?: HttpQueryOptions<T>
        ) => HttpQueryOptsReturn<T>;
  /** Get query key for QueryClient methods (with args = exact match, without = prefix) */
  queryKey: (args?: InferHttpClientArgs<T>) => HttpQueryKey;
  /** Get query filter for QueryClient methods (e.g., invalidateQueries) */
  queryFilter: (
    args?: InferHttpClientArgs<T>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
  /** Mutation options for GET endpoints (exports, downloads - no caching) */
  mutationOptions: (opts?: HttpMutationOptions<T>) => HttpMutationOptsReturn<T>;
  /** Get mutation key for QueryClient methods */
  mutationKey: () => HttpMutationKey;
};

/**
 * Decorated POST/PUT/PATCH/DELETE procedure with mutationOptions.
 * The mutationFn receives typed args inferred from server schemas.
 */
type DecorateHttpMutation<T extends HttpProcedure> = {
  mutationOptions: (opts?: HttpMutationOptions<T>) => HttpMutationOptsReturn<T>;
  /** Get mutation key for QueryClient methods */
  mutationKey: () => HttpMutationKey;
};

// ============================================================================
// Vanilla HTTP Client Types (direct calls only, no TanStack Query)
// ============================================================================

/** Vanilla HTTP query - only direct call, no TanStack Query */
type VanillaHttpQuery<T extends HttpProcedure> = {
  query: keyof InferHttpInput<T> extends never
    ? (args?: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>
    : object extends InferHttpInput<T>
      ? (args?: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>
      : (args: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>;
};

/** Vanilla HTTP mutation - only direct call, no TanStack Query */
type VanillaHttpMutation<T extends HttpProcedure> = {
  mutate: keyof InferHttpInput<T> extends never
    ? (args?: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>
    : object extends InferHttpInput<T>
      ? (args?: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>
      : (args: InferHttpClientArgs<T>) => Promise<InferHttpOutput<T>>;
};

/** Vanilla HTTP client type - only query/mutate methods */
export type VanillaHttpCRPCClient<T extends HttpRouterRecord> = {
  [K in keyof T]: T[K] extends HttpProcedure<
    infer _TInput,
    infer _TOutput,
    infer _TParams,
    infer _TQuery,
    infer TMethod,
    infer _TForm
  >
    ? TMethod extends 'GET'
      ? VanillaHttpQuery<T[K]>
      : VanillaHttpMutation<T[K]>
    : T[K] extends CRPCHttpRouter<infer R>
      ? VanillaHttpCRPCClient<R>
      : T[K] extends HttpRouterRecord
        ? VanillaHttpCRPCClient<T[K]>
        : never;
};

/** Extract vanilla HTTP client from router */
export type VanillaHttpCRPCClientFromRouter<T> =
  T extends CRPCHttpRouter<infer R> ? VanillaHttpCRPCClient<R> : never;

// ============================================================================
// HTTP Client Type (recursive) - Full client with TanStack Query options
// ============================================================================

/**
 * HTTP Client type from router record.
 * Maps each procedure to queryOptions (GET) or mutationOptions (POST/etc).
 * Uses infer to extract the method type literal for proper GET/non-GET distinction.
 */
export type HttpCRPCClient<T extends HttpRouterRecord> = {
  [K in keyof T]: T[K] extends HttpProcedure<
    infer _TInput,
    infer _TOutput,
    infer _TParams,
    infer _TQuery,
    infer TMethod,
    infer _TForm
  >
    ? TMethod extends 'GET'
      ? DecorateHttpQuery<T[K]>
      : DecorateHttpMutation<T[K]>
    : T[K] extends CRPCHttpRouter<infer R>
      ? HttpCRPCClient<R>
      : T[K] extends HttpRouterRecord
        ? HttpCRPCClient<T[K]>
        : never;
};

/**
 * HTTP Client type from a CRPCHttpRouter.
 * Use this when your type is the router object (with _def).
 */
export type HttpCRPCClientFromRouter<TRouter extends CRPCHttpRouter<any>> =
  HttpCRPCClient<TRouter['_def']['record']>;

// ============================================================================
// HTTP Proxy Options
// ============================================================================

export interface HttpProxyOptions<TRoutes extends HttpRouteMap> {
  /** Base URL for the Convex HTTP API (e.g., https://your-site.convex.site) */
  convexSiteUrl: string;
  /** Custom fetch function (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Default headers or async function returning headers (for auth tokens) */
  headers?:
    | { [key: string]: string | undefined }
    | (() =>
        | { [key: string]: string | undefined }
        | Promise<{ [key: string]: string | undefined }>);
  /** Error handler called on HTTP errors */
  onError?: (error: HttpClientError) => void;
  /** Runtime route definitions (from codegen httpRoutes) */
  routes: TRoutes;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
}

// ============================================================================
// HTTP Request Execution
// ============================================================================

/**
 * Replace URL path parameters with actual values.
 * e.g., '/users/:id' with { id: '123' } -> '/users/123'
 */
function replaceUrlParam(url: string, params: Record<string, string>): string {
  return url.replace(/:(\w+)/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? encodeURIComponent(value) : `:${key}`;
  });
}

/**
 * Build URLSearchParams from query object.
 * Handles array values as multiple params with same key (like Hono).
 */
function buildSearchParams(
  query: Record<string, string | string[]>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v);
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  }
  return params;
}

/**
 * Hono-style HTTP request executor.
 * Processes args in the same way as Hono's ClientRequestImpl.fetch().
 */
async function executeHttpRequest(opts: {
  convexSiteUrl: string;
  route: { path: string; method: string };
  procedureName: string;
  /** Hono-style input args */
  args?: HttpInputArgs;
  /** Per-request client options */
  clientOpts?: HttpClientOptions;
  /** Base headers from proxy config */
  baseHeaders?:
    | { [key: string]: string | undefined }
    | (() =>
        | { [key: string]: string | undefined }
        | Promise<{ [key: string]: string | undefined }>);
  /** Base fetch from proxy config */
  baseFetch?: typeof fetch;
  /** Wire transformer for payload serialization. */
  transformer: CombinedDataTransformer;
}): Promise<unknown> {
  const { method, path } = opts.route;
  const args = opts.args ?? {};

  // Process request body (form or json, mutually exclusive)
  let rBody: BodyInit | undefined;
  let cType: string | undefined;

  if (args.form) {
    const form = new FormData();
    for (const [k, v] of Object.entries(args.form)) {
      if (Array.isArray(v)) {
        for (const v2 of v) {
          form.append(k, v2);
        }
      } else {
        form.append(k, v);
      }
    }
    rBody = form;
    // Don't set Content-Type - browser sets with boundary
  } else {
    // Extract JSON body (all non-reserved keys at root level)
    const jsonBody: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (!RESERVED_KEYS.has(key) && value !== undefined) {
        jsonBody[key] = value;
      }
    }
    if (Object.keys(jsonBody).length > 0) {
      rBody = JSON.stringify(opts.transformer.input.serialize(jsonBody));
      cType = 'application/json';
    }
  }

  // Extract client options from args (per-call overrides)
  const argsClientOpts: HttpClientOptions = {};
  if (args.fetch) argsClientOpts.fetch = args.fetch as typeof fetch;
  if (args.init) argsClientOpts.init = args.init as RequestInit;
  if (args.headers)
    argsClientOpts.headers = args.headers as HttpClientOptions['headers'];

  // Merge client opts: args override clientOpts param
  const mergedClientOpts = { ...opts.clientOpts, ...argsClientOpts };

  // Build headers (merge in order: cType, baseHeaders, clientOpts.headers, args.headers)
  const resolvedBaseHeaders =
    typeof opts.baseHeaders === 'function'
      ? await opts.baseHeaders()
      : opts.baseHeaders;
  const resolvedClientHeaders =
    typeof mergedClientOpts.headers === 'function'
      ? await mergedClientOpts.headers()
      : mergedClientOpts.headers;

  const headerValues: Record<string, string> = {
    ...resolvedClientHeaders,
  };

  if (cType) {
    headerValues['Content-Type'] = cType;
  }

  // Merge base headers (lower priority), filtering out undefined values
  const finalHeaders: Record<string, string> = {};
  if (resolvedBaseHeaders) {
    for (const [key, value] of Object.entries(resolvedBaseHeaders)) {
      if (value !== undefined) {
        finalHeaders[key] = value;
      }
    }
  }
  Object.assign(finalHeaders, headerValues);

  // Build URL with path params
  let url = opts.convexSiteUrl + path;
  if (args.params) {
    url = opts.convexSiteUrl + replaceUrlParam(path, args.params);
  }

  // Add query params
  if (args.searchParams) {
    const queryString = buildSearchParams(args.searchParams).toString();
    if (queryString) {
      url = `${url}?${queryString}`;
    }
  }

  // Determine if body should be sent (not for GET/HEAD)
  const methodUpperCase = method.toUpperCase();
  const setBody = !(methodUpperCase === 'GET' || methodUpperCase === 'HEAD');

  // Execute fetch (mergedClientOpts.init has highest priority per Hono pattern)
  const fetchFn = mergedClientOpts.fetch ?? opts.baseFetch ?? globalThis.fetch;
  const response = await fetchFn(url, {
    body: setBody ? rBody : undefined,
    method: methodUpperCase,
    headers: finalHeaders,
    ...mergedClientOpts.init,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: { code: 'UNKNOWN', message: response.statusText },
    }));

    const errorCode: HttpErrorCode =
      (errorData?.error?.code as HttpErrorCode) || 'UNKNOWN';
    const errorMessage = errorData?.error?.message || response.statusText;

    throw new HttpClientError({
      code: errorCode,
      status: response.status,
      procedureName: opts.procedureName,
      message: errorMessage,
    });
  }

  // Handle empty responses (204 No Content, etc.)
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0' || response.status === 204) {
    return;
  }

  // Check Content-Type to determine how to parse the response
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return opts.transformer.output.deserialize(await response.json());
  }

  // Non-JSON responses (text/plain, text/csv, etc.) return as text
  return response.text();
}

// ============================================================================
// HTTP Proxy Implementation
// ============================================================================

/**
 * Create a recursive proxy for HTTP routes with TanStack Query integration.
 *
 * Terminal methods:
 * - GET endpoints: `queryOptions`, `queryKey`
 * - POST/PUT/PATCH/DELETE: `mutationOptions`, `mutationKey`
 */
function createRecursiveHttpProxy(
  opts: {
    convexSiteUrl: string;
    routes: HttpRouteMap;
    headers?:
      | { [key: string]: string | undefined }
      | (() =>
          | { [key: string]: string | undefined }
          | Promise<{ [key: string]: string | undefined }>);
    fetch?: typeof fetch;
    onError?: (error: HttpClientError) => void;
    transformer: CombinedDataTransformer;
  },
  path: string[] = []
): unknown {
  return new Proxy(() => {}, {
    get(_, prop: string | symbol) {
      // Ignore symbols and internal properties
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return; // Prevent Promise detection

      const routeKey = path.join('.');
      const route = opts.routes[routeKey];

      // Terminal method: query (vanilla client - direct call for GET)
      if (prop === 'query') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }

        return async (args?: HttpInputArgs) => {
          try {
            return await executeHttpRequest({
              convexSiteUrl: opts.convexSiteUrl,
              route,
              procedureName: routeKey,
              args,
              baseHeaders: opts.headers,
              baseFetch: opts.fetch,
              transformer: opts.transformer,
            });
          } catch (error) {
            if (opts.onError && error instanceof HttpClientError) {
              opts.onError(error);
            }
            throw error;
          }
        };
      }

      // Terminal method: mutate (vanilla client - direct call for mutations)
      if (prop === 'mutate') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }

        return async (args?: HttpInputArgs) => {
          try {
            return await executeHttpRequest({
              convexSiteUrl: opts.convexSiteUrl,
              route,
              procedureName: routeKey,
              args,
              baseHeaders: opts.headers,
              baseFetch: opts.fetch,
              transformer: opts.transformer,
            });
          } catch (error) {
            if (opts.onError && error instanceof HttpClientError) {
              opts.onError(error);
            }
            throw error;
          }
        };
      }

      // Terminal method: queryOptions (for GET endpoints)
      // API: (args?, queryOpts?) - client opts (headers, fetch, init) go in args
      if (prop === 'queryOptions') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }
        if (route.method !== 'GET') {
          throw new Error(
            `queryOptions is only available for GET endpoints, got ${route.method} for ${routeKey}`
          );
        }

        return (args?: HttpInputArgs, queryOpts?: Record<string, unknown>) => ({
          ...queryOpts,
          queryKey: ['httpQuery', routeKey, args] as const,
          queryFn: async () => {
            try {
              return await executeHttpRequest({
                convexSiteUrl: opts.convexSiteUrl,
                route,
                procedureName: routeKey,
                args,
                baseHeaders: opts.headers,
                baseFetch: opts.fetch,
                transformer: opts.transformer,
              });
            } catch (error) {
              if (opts.onError && error instanceof HttpClientError) {
                opts.onError(error);
              }
              throw error;
            }
          },
        });
      }

      // Terminal method: queryKey (for GET endpoints)
      // When called without args or empty object, return 2-element key for prefix matching
      // When called with args, return 3-element key for exact match
      if (prop === 'queryKey') {
        return (args?: unknown) => {
          // undefined or empty object = no args = prefix key
          const hasArgs =
            args !== undefined &&
            !(
              typeof args === 'object' &&
              args !== null &&
              Object.keys(args).length === 0
            );
          return hasArgs
            ? (['httpQuery', routeKey, args] as const)
            : (['httpQuery', routeKey] as const);
        };
      }

      // Terminal method: queryFilter (for GET endpoints, used for invalidation)
      if (prop === 'queryFilter') {
        return (args?: unknown, filters?: Record<string, unknown>) => {
          // undefined or empty object = no args = prefix key
          const hasArgs =
            args !== undefined &&
            !(
              typeof args === 'object' &&
              args !== null &&
              Object.keys(args).length === 0
            );
          return {
            ...filters,
            queryKey: hasArgs
              ? (['httpQuery', routeKey, args] as const)
              : (['httpQuery', routeKey] as const),
          };
        };
      }

      // Terminal method: mutationOptions (for all HTTP methods)
      // API: (mutationOpts?) - client opts (headers, fetch, init) go in mutate() args
      if (prop === 'mutationOptions') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }

        return (mutationOpts?: Record<string, unknown>) => ({
          ...mutationOpts,
          mutationKey: ['httpMutation', routeKey] as const,
          mutationFn: async (args: HttpInputArgs) => {
            try {
              return await executeHttpRequest({
                convexSiteUrl: opts.convexSiteUrl,
                route,
                procedureName: routeKey,
                args,
                baseHeaders: opts.headers,
                baseFetch: opts.fetch,
                transformer: opts.transformer,
              });
            } catch (error) {
              if (opts.onError && error instanceof HttpClientError) {
                opts.onError(error);
              }
              throw error;
            }
          },
        });
      }

      // Terminal method: mutationKey (for POST/PUT/PATCH/DELETE)
      if (prop === 'mutationKey') {
        return () => ['httpMutation', routeKey] as const;
      }

      // Continue path accumulation
      return createRecursiveHttpProxy(opts, [...path, prop]);
    },
  });
}

/**
 * Create an HTTP proxy with TanStack Query integration (SolidJS).
 *
 * Returns a proxy that provides:
 * - `queryOptions` for GET endpoints (no subscription)
 * - `mutationOptions` for POST/PUT/PATCH/DELETE endpoints
 *
 * @example
 * ```ts
 * const httpProxy = createHttpProxy<AppRouter>({
 *   convexSiteUrl: process.env.CONVEX_SITE_URL!,
 *   routes: httpRoutes,
 * });
 *
 * // GET endpoint
 * const opts = httpProxy.todos.get.queryOptions({ id: '123' });
 * const data = createQuery(() => opts);
 *
 * // POST endpoint
 * const mutation = createMutation(() => httpProxy.todos.create.mutationOptions());
 * await mutation.mutateAsync({ title: 'New todo' });
 * ```
 */
export function createHttpProxy<
  TRouter extends CRPCHttpRouter<any>,
  TRoutes extends HttpRouteMap = HttpRouteMap,
>(opts: HttpProxyOptions<TRoutes>): HttpCRPCClientFromRouter<TRouter> {
  const transformer = getTransformer(opts.transformer);
  return createRecursiveHttpProxy({
    convexSiteUrl: opts.convexSiteUrl,
    routes: opts.routes,
    headers: opts.headers,
    fetch: opts.fetch,
    onError: opts.onError,
    transformer,
  }) as HttpCRPCClientFromRouter<TRouter>;
}
