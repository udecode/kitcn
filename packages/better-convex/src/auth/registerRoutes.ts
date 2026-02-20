/** biome-ignore-all lint/suspicious/noConsole: lib */
import { type HttpRouter, httpActionGeneric } from 'convex/server';
import { corsRouter } from '../internal/upstream/server/cors';

import type { GetAuth } from './types';

type AuthRouteContract = {
  $context: Promise<{
    options: {
      trustedOrigins?:
        | string[]
        | ((request: Request) => Promise<string[]> | string[]);
    };
  }>;
  handler: (request: Request) => Promise<Response>;
  options: {
    basePath?: string;
    baseURL?: string;
    trustedOrigins?:
      | string[]
      | ((request: Request) => Promise<string[]> | string[]);
  };
};

export const registerRoutes = (
  http: HttpRouter,
  getAuth: GetAuth<unknown, AuthRouteContract>,
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
    const response = await auth.handler(request);

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
  let trustedOriginsOption:
    | ((request: Request) => Promise<string[]> | string[])
    | string[]
    | undefined;
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
      trustedOriginsOption =
        trustedOriginsOption ??
        (await staticAuth.$context).options.trustedOrigins ??
        [];
      const trustedOrigins = Array.isArray(trustedOriginsOption)
        ? trustedOriginsOption
        : ((await trustedOriginsOption?.(request)) ?? []);

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
