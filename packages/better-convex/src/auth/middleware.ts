/** biome-ignore-all lint/suspicious/noConsole: auth debug logs */
import type { Context, MiddlewareHandler } from 'hono';
import { toAuthErrorResponse } from './error-response';
import type { GetAuth } from './types';

export interface AuthMiddlewareOptions {
  /** Base path for auth routes (default: '/api/auth') */
  basePath?: string;
  /** Log request/response headers for debugging */
  verbose?: boolean;
}

/**
 * Create auth middleware that handles auth routes and OpenID well-known redirect.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { cors } from 'hono/cors';
 * import { authMiddleware } from 'better-convex/auth';
 * import { createHttpRouter } from 'better-convex/server';
 *
 * const app = new Hono();
 * app.use('/api/*', cors({ origin: process.env.SITE_URL, credentials: true }));
 * app.use(authMiddleware(getAuth));
 *
 * export default createHttpRouter(app, appRouter);
 * ```
 */
export function authMiddleware(
  getAuth: GetAuth,
  opts: AuthMiddlewareOptions = {}
): MiddlewareHandler {
  const basePath = opts.basePath ?? '/api/auth';

  return async (c: Context, next) => {
    // OpenID well-known redirect
    if (c.req.path === '/.well-known/openid-configuration') {
      return c.redirect(
        `${process.env.CONVEX_SITE_URL}${basePath}/convex/.well-known/openid-configuration`
      );
    }

    // Auth routes
    if (c.req.path.startsWith(basePath)) {
      if (opts.verbose) {
        console.log('request headers', c.req.raw.headers);
      }

      const auth = getAuth(c.env as any);
      let response: Response;
      try {
        response = await auth.handler(c.req.raw);
      } catch (error) {
        const errorResponse = toAuthErrorResponse(error);
        if (errorResponse) {
          return errorResponse;
        }
        throw error;
      }

      if (opts.verbose) {
        console.log('response headers', response.headers);
      }

      return response;
    }

    return next();
  };
}
