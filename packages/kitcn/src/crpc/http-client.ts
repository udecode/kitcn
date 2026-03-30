/**
 * HTTP Client Helpers
 *
 * Framework-agnostic utilities for executing HTTP requests
 * against Convex HTTP endpoints.
 */

import { HttpClientError, type HttpErrorCode } from './http-types';
import type { CombinedDataTransformer } from './transformer';

// ============================================================================
// Types
// ============================================================================

/** Form value types (matches Hono's FormValue) */
export type HttpFormValue = string | Blob;

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

/** HTTP proxy options (framework-agnostic parts) */
export interface HttpProxyBaseOptions {
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
}

// ============================================================================
// Utilities
// ============================================================================

/** Reserved keys that are not part of JSON body */
export const RESERVED_KEYS = new Set([
  'params',
  'searchParams',
  'form',
  'fetch',
  'init',
  'headers',
]);

/**
 * Replace URL path parameters with actual values.
 * e.g., '/users/:id' with { id: '123' } -> '/users/123'
 */
export function replaceUrlParam(
  url: string,
  params: Record<string, string>
): string {
  return url.replace(/:(\w+)/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? encodeURIComponent(value) : `:${key}`;
  });
}

/**
 * Build URLSearchParams from query object.
 * Handles array values as multiple params with same key (like Hono).
 */
export function buildSearchParams(
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
export async function executeHttpRequest(opts: {
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
