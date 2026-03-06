/** biome-ignore-all lint/suspicious/noExplicitAny: lib */

/**
 * Next.js + Better Auth wrapper for Convex caller factory.
 * Uses @convex-dev/better-auth for token management.
 */

import { type GetTokenOptions, getToken } from '@convex-dev/better-auth/utils';

import { defaultIsUnauthorized } from '../crpc/error';
import { createCallerFactory } from '../server/caller-factory';

const handler = (request: Request, siteUrl: string) => {
  const requestUrl = new URL(request.url);
  const nextUrl = `${siteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const newRequest = new Request(nextUrl, request);
  newRequest.headers.set('accept-encoding', 'application/json');
  newRequest.headers.set('host', new URL(siteUrl).host);
  return fetch(newRequest, { method: request.method, redirect: 'manual' });
};

const nextJsHandler = (siteUrl: string) => ({
  GET: (request: Request) => handler(request, siteUrl),
  POST: (request: Request) => handler(request, siteUrl),
});

/** Auth options for server-side calls. */
type AuthOptions = {
  /** Enable/disable JWT caching. Default: true */
  jwtCache?: boolean;
  /** Custom function to detect UNAUTHORIZED errors. Default checks code property. */
  isUnauthorized?: (error: unknown) => boolean;
  /** Expiration tolerance in seconds. */
  expirationToleranceSeconds?: number;
};

type ConvexBetterAuthOptions<TApi> = Omit<GetTokenOptions, 'jwtCache'> & {
  api: TApi;
  convexSiteUrl: string;
  convexUrl?: string;
  /** Auth options. JWT caching is enabled by default (set `auth.jwtCache: false` to disable). */
  auth?: AuthOptions;
};

/**
 * Create Convex caller factory with Better Auth integration for Next.js.
 *
 * @example
 * ```ts
 * // server.ts
 * export const { createContext, createCaller, handler } = convexBetterAuth({
 *   api,
 *   convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
 * }); // JWT caching enabled by default
 *
 * // rsc.tsx
 * const createRSCContext = cache(async () => {
 *   const heads = await headers();
 *   return createContext({ headers: heads });
 * });
 * export const caller = createCaller(createRSCContext);
 *
 * // app/page.tsx - single call!
 * const posts = await caller.posts.list();
 * ```
 */
export function convexBetterAuth<TApi extends Record<string, unknown>>(
  opts: ConvexBetterAuthOptions<TApi>
) {
  // Default auth to {} - JWT caching enabled by default
  const auth = opts.auth ?? {};
  const jwtCacheEnabled = auth.jwtCache !== false;

  const { createContext, createCaller } = createCallerFactory({
    api: opts.api,
    auth: jwtCacheEnabled
      ? {
          getToken: (siteUrl, headers, getTokenOpts) => {
            const mutableHeaders = new Headers(headers);
            mutableHeaders.delete('content-length');
            mutableHeaders.delete('transfer-encoding');
            return getToken(siteUrl, mutableHeaders, {
              ...(getTokenOpts as GetTokenOptions),
              jwtCache: {
                enabled: true,
                expirationToleranceSeconds: auth.expirationToleranceSeconds,
                isAuthError: auth.isUnauthorized ?? defaultIsUnauthorized,
              },
            });
          },
          isUnauthorized: auth.isUnauthorized ?? defaultIsUnauthorized,
        }
      : undefined,
    convexSiteUrl: opts.convexSiteUrl,
    convexUrl: opts.convexUrl,
  });

  return {
    createCaller,
    createContext,
    handler: nextJsHandler(opts.convexSiteUrl),
  };
}
