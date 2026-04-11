/** biome-ignore-all lint/suspicious/noConsole: lib */
import type { BaseURLConfig, BetterAuthOptions } from 'better-auth';
import { type HttpRouter, httpActionGeneric } from 'convex/server';
import { corsRouter } from '../internal/upstream/server/cors';
import { toAuthErrorResponse } from './error-response';

import type { GetAuth } from './types';

type TrustedOriginsOption = BetterAuthOptions['trustedOrigins'];

type AuthRouteContract = {
  $context: Promise<{
    options: {
      trustedOrigins?: TrustedOriginsOption;
    };
  }>;
  handler: (request: Request) => Promise<Response>;
  options: {
    basePath?: string;
    baseURL?: BaseURLConfig;
    trustedOrigins?: TrustedOriginsOption;
  };
};

const LOCAL_AUTH_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const LOCAL_CONVEX_AUTH_IP_PATHS = new Set([
  '/convex/.well-known/openid-configuration',
  '/convex/jwks',
  '/convex/token',
]);

const withLocalConvexAuthIp = (request: Request, basePath: string) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return request;
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return request;
  }

  if (!LOCAL_AUTH_HOSTS.has(url.hostname)) {
    return request;
  }

  if (request.method !== 'GET') {
    return request;
  }

  const normalizedBasePath =
    basePath.length > 1 && basePath.endsWith('/')
      ? basePath.slice(0, -1)
      : basePath;
  const normalizedPath =
    normalizedBasePath === '/'
      ? url.pathname
      : url.pathname.startsWith(normalizedBasePath)
        ? url.pathname.slice(normalizedBasePath.length) || '/'
        : url.pathname;
  if (!LOCAL_CONVEX_AUTH_IP_PATHS.has(normalizedPath)) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', '127.0.0.1');
  return new Request(url.toString(), {
    headers,
    method: request.method,
  });
};

export const registerRoutes = <Ctx>(
  http: HttpRouter,
  getAuth: GetAuth<Ctx, AuthRouteContract>,
  opts: {
    cors?:
      | {
          // These values are appended to the default values
          allowedHeaders?: string[];
          allowedOrigins?: string[];
          exposedHeaders?: string[];
        }
      | boolean;
    verbose?: boolean;
  } = {}
) => {
  const staticAuth = getAuth({} as any);
  const path = staticAuth.options.basePath ?? '/api/auth';
  const authRequestHandler = httpActionGeneric(async (ctx, request) => {
    if (opts?.verbose) {
      console.log('options.baseURL', staticAuth.options.baseURL);
      console.log('request headers', request.headers);
    }

    const auth = getAuth(ctx as any);
    const authRequest = withLocalConvexAuthIp(request, path);
    let response: Response;
    try {
      response = await auth.handler(authRequest);
    } catch (error) {
      const errorResponse = toAuthErrorResponse(error);
      if (errorResponse) {
        return errorResponse;
      }
      throw error;
    }

    if (opts?.verbose) {
      console.log('response headers', response.headers);
    }

    return response;
  });
  const wellKnown = http.lookup('/.well-known/openid-configuration', 'GET');

  // If registerRoutes is used multiple times, this may already be defined
  if (!wellKnown) {
    // Redirect root well-known to api well-known
    http.route({
      handler: httpActionGeneric(async () => {
        const url = `${process.env.CONVEX_SITE_URL}${path}/convex/.well-known/openid-configuration`;

        return Response.redirect(url);
      }),
      method: 'GET',
      path: '/.well-known/openid-configuration',
    });
  }
  if (!opts.cors) {
    http.route({
      handler: authRequestHandler,
      method: 'GET',
      pathPrefix: `${path}/`,
    });

    http.route({
      handler: authRequestHandler,
      method: 'POST',
      pathPrefix: `${path}/`,
    });

    return;
  }

  const corsOpts =
    typeof opts.cors === 'boolean'
      ? { allowedHeaders: [], allowedOrigins: [], exposedHeaders: [] }
      : opts.cors;
  let trustedOriginsOption: TrustedOriginsOption | undefined;
  const cors = corsRouter(http, {
    allowCredentials: true,

    allowedHeaders: [
      'Content-Type',
      'Better-Auth-Cookie',
      'Authorization',
    ].concat(corsOpts.allowedHeaders ?? []),
    debug: opts?.verbose,
    enforceAllowOrigins: false,
    exposedHeaders: ['Set-Better-Auth-Cookie'].concat(
      corsOpts.exposedHeaders ?? []
    ),
    allowedOrigins: async (request) => {
      const resolvedTrustedOrigins =
        trustedOriginsOption ??
        (await staticAuth.$context).options.trustedOrigins ??
        [];
      trustedOriginsOption = resolvedTrustedOrigins;
      const rawOrigins = Array.isArray(resolvedTrustedOrigins)
        ? resolvedTrustedOrigins
        : ((await resolvedTrustedOrigins(request)) ?? []);
      const trustedOrigins = rawOrigins.filter(
        (origin): origin is string => typeof origin === 'string'
      );

      return trustedOrigins
        .map((origin) =>
          // Strip trailing wildcards, unsupported for allowedOrigins
          origin.endsWith('*') && origin.length > 1
            ? origin.slice(0, -1)
            : origin
        )
        .concat(corsOpts.allowedOrigins ?? []);
    },
  });

  cors.route({
    handler: authRequestHandler,
    method: 'GET',
    pathPrefix: `${path}/`,
  });

  cors.route({
    handler: authRequestHandler,
    method: 'POST',
    pathPrefix: `${path}/`,
  });
};
