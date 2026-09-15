/** biome-ignore-all lint/suspicious/noExplicitAny: Better Auth plugin contracts are intentionally loose. */
/** biome-ignore-all lint/suspicious/noConsole: auth plugin warnings should reach users. */

import type { BetterAuthPlugin, Session, User } from 'better-auth';
import {
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth/minimal';
import { bearer as bearerPlugin } from 'better-auth/plugins/bearer';
import type { Jwk, JwtOptions } from 'better-auth/plugins/jwt';
import { jwt as jwtPlugin } from 'better-auth/plugins/jwt';
import type { AuthConfig, AuthProvider } from 'convex/server';
import { omit } from '../../internal/upstream';

export const JWT_COOKIE_NAME = 'convex_jwt';

type JwtCookieTokenRequest = {
  headers: Headers;
};

export const getJwtCookieToken = async <Token>(
  session: unknown,
  getToken: (request: JwtCookieTokenRequest) => Promise<Token>
) => {
  if (!session) {
    return;
  }
  return await getToken({ headers: new Headers() });
};

const getJwksAlg = (authProvider: AuthProvider) => {
  const isCustomJwt =
    'type' in authProvider && authProvider.type === 'customJwt';
  if (isCustomJwt && authProvider.algorithm !== 'RS256') {
    throw new Error('Only RS256 is supported for custom JWT with Better Auth');
  }
  return isCustomJwt ? authProvider.algorithm : 'EdDSA';
};

const parseAuthConfig = (authConfig: AuthConfig, opts: { jwks?: string }) => {
  const providerConfigs = authConfig.providers.filter(
    (provider) => provider.applicationID === 'convex'
  );
  if (providerConfigs.length > 1) {
    throw new Error(
      "Multiple auth providers with applicationID 'convex' detected. Please use only one."
    );
  }
  const providerConfig = providerConfigs[0];
  if (!providerConfig) {
    throw new Error(
      "No auth provider with applicationID 'convex' found. Please add one to your auth config."
    );
  }
  if (!('type' in providerConfig) || providerConfig.type !== 'customJwt') {
    return providerConfig;
  }

  const isDataUriJwks = providerConfig.jwks?.startsWith('data:text/');

  if (isDataUriJwks && !opts.jwks) {
    throw new Error(
      'Static JWKS detected in auth config, but missing from Convex plugin'
    );
  }
  if (!isDataUriJwks && opts.jwks) {
    console.warn(
      'Static JWKS provided to Convex plugin, but not to auth config. This adds an unnecessary network request for token verification.'
    );
  }
  return providerConfig;
};

const createOpenIdConfig = (basePath: string, signingAlgorithm: string) => {
  const siteUrl = `${process.env.CONVEX_SITE_URL}`;
  const baseUrl = `${siteUrl}${basePath}`;

  return {
    issuer: siteUrl,
    authorization_endpoint: `${baseUrl}/oauth2/authorize`,
    token_endpoint: `${baseUrl}/oauth2/token`,
    userinfo_endpoint: `${baseUrl}/oauth2/userinfo`,
    jwks_uri: `${baseUrl}/convex/jwks`,
    registration_endpoint: `${baseUrl}/oauth2/register`,
    end_session_endpoint: `${baseUrl}/oauth2/endsession`,
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    acr_values_supported: [
      'urn:mace:incommon:iap:silver',
      'urn:mace:incommon:iap:bronze',
    ],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [signingAlgorithm],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],
    code_challenge_methods_supported: ['S256'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'nbf',
      'iat',
      'jti',
      'email',
      'email_verified',
      'name',
    ],
  };
};

export const convex = (opts: {
  authConfig: AuthConfig;
  jwks?: string;
  jwksRotateOnTokenGenerationError?: boolean;
  jwt?: {
    definePayload?: (session: {
      session: Session & Record<string, any>;
      user: User & Record<string, any>;
    }) => Promise<Record<string, any>> | Record<string, any> | undefined;
    expirationSeconds?: number;
  };
  /**
   * @deprecated Use jwt.expirationSeconds instead.
   */
  jwtExpirationSeconds?: number;
  options?: BetterAuthOptions;
}) => {
  const jwtExpirationSeconds =
    opts.jwt?.expirationSeconds ?? opts.jwtExpirationSeconds ?? 60 * 15;
  const providerConfig = parseAuthConfig(opts.authConfig, opts);
  const signingAlgorithm = getJwksAlg(providerConfig);
  const openIdConfig = createOpenIdConfig(
    opts.options?.basePath ?? '/api/auth',
    signingAlgorithm
  );

  const jwtOptions = {
    jwt: {
      issuer: `${process.env.CONVEX_SITE_URL}`,
      audience: 'convex',
      expirationTime: `${jwtExpirationSeconds}s`,
      definePayload: async ({ user, session }) => ({
        ...(opts.jwt?.definePayload
          ? await opts.jwt.definePayload({ session, user })
          : omit(user, ['id', 'image'])),
        sessionId: session.id,
        iat: Math.floor(Date.now() / 1000),
      }),
    },
    jwks: {
      keyPairConfig: {
        alg: signingAlgorithm,
      },
    },
  } satisfies JwtOptions;
  const jwks = opts.jwks ? JSON.parse(opts.jwks) : undefined;
  const jwt = jwtPlugin({
    ...jwtOptions,
    adapter: {
      createJwk: async (webKey, ctx) => {
        if (opts.jwks) {
          throw new Error('Not implemented');
        }
        return await ctx.context.adapter.create<Omit<Jwk, 'id'>, Jwk>({
          model: 'jwks',
          data: {
            ...webKey,
            createdAt: new Date(),
          },
        });
      },
      getJwks: async (ctx) => {
        if (opts.jwks) {
          return jwks;
        }
        const keys: Jwk[] = await ctx.context.adapter.findMany<Jwk>({
          model: 'jwks',
          sortBy: {
            direction: 'desc',
            field: 'createdAt',
          },
        });
        return keys.map((key) => ({
          ...key,
          createdAt: new Date(key.createdAt),
          ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}),
        }));
      },
    },
  });
  const bearer = bearerPlugin();
  const schema = {
    user: {
      fields: { userId: { type: 'string', required: false, input: false } },
    } as const,
    ...jwt.schema,
  };

  return {
    id: 'convex',
    init: (ctx) => {
      const { options } = ctx;
      if (options.basePath !== '/api/auth' && !opts.options?.basePath) {
        console.warn(
          `Better Auth basePath set to ${options.basePath} but no basePath is set in the Convex plugin. This is probably a mistake.`
        );
      }
      if (
        opts.options?.basePath &&
        options.basePath !== opts.options?.basePath
      ) {
        console.warn(
          `Better Auth basePath ${options.basePath} does not match Convex plugin basePath ${opts.options?.basePath}. This is probably a mistake.`
        );
      }
    },
    hooks: {
      before: [
        ...bearer.hooks.before,
        {
          matcher: (ctx) => {
            return !ctx.context.adapter.options?.isRunMutationCtx;
          },
          handler: createAuthMiddleware(async (ctx) => {
            ctx.query = { ...ctx.query, disableRefresh: true };
            ctx.context.internalAdapter.deleteSession = async (
              ..._args: any[]
            ) => {};
            const knownSafePaths = ['/api-key/list', '/api-key/get'];
            const noopWrite = (method: string, result: unknown = 0) => {
              return async (..._args: any[]) => {
                if (ctx.path && !knownSafePaths.includes(ctx.path)) {
                  console.warn(
                    `[convex-better-auth] Write operation "${method}" skipped in query context for ${ctx.path}`
                  );
                }
                return result;
              };
            };
            ctx.context.adapter.create = noopWrite('create') as any;
            ctx.context.adapter.incrementOne = noopWrite(
              'incrementOne',
              {}
            ) as any;
            ctx.context.adapter.update = noopWrite('update') as any;
            ctx.context.adapter.updateMany = noopWrite('updateMany') as any;
            ctx.context.adapter.delete = noopWrite('delete') as any;
            ctx.context.adapter.deleteMany = noopWrite('deleteMany') as any;
            return { context: ctx };
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => {
            return Boolean(
              ctx.path?.startsWith('/sign-in') ||
                ctx.path?.startsWith('/sign-up') ||
                ctx.path?.startsWith('/callback') ||
                ctx.path?.startsWith('/oauth2/callback') ||
                ctx.path?.startsWith('/magic-link/verify') ||
                ctx.path?.startsWith('/email-otp/verify-email') ||
                ctx.path?.startsWith('/phone-number/verify') ||
                ctx.path?.startsWith('/siwe/verify') ||
                ctx.path?.startsWith('/update-session') ||
                (ctx.path?.startsWith('/get-session') && ctx.context.session)
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            // OAuth redirect starts have no session to mint a token for.
            if (!(ctx.context.session ?? ctx.context.newSession)) {
              return;
            }
            const originalSession = ctx.context.session;
            try {
              ctx.context.session =
                ctx.context.session ?? ctx.context.newSession;
              const tokenResponse = await getJwtCookieToken(
                ctx.context.session,
                async ({ headers }) =>
                  await jwt.endpoints.getToken({
                    ...ctx,
                    asResponse: false,
                    headers,
                    method: 'GET',
                    returnHeaders: false,
                    returnStatus: false,
                  })
              );
              if (tokenResponse) {
                const jwtCookie = ctx.context.createAuthCookie(
                  JWT_COOKIE_NAME,
                  {
                    maxAge: jwtExpirationSeconds,
                  }
                );
                ctx.setCookie(
                  jwtCookie.name,
                  tokenResponse.token,
                  jwtCookie.attributes
                );
              }
            } catch (_error) {}
            ctx.context.session = originalSession;
          }),
        },
        {
          matcher: (ctx) => {
            return Boolean(
              ctx.path?.startsWith('/sign-out') ||
                ctx.path?.startsWith('/delete-user') ||
                (ctx.path?.startsWith('/get-session') && !ctx.context.session)
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
              maxAge: 0,
            });
            ctx.setCookie(jwtCookie.name, '', jwtCookie.attributes);
          }),
        },
      ],
    },
    endpoints: {
      getOpenIdConfig: createAuthEndpoint(
        '/convex/.well-known/openid-configuration',
        {
          method: 'GET',
          metadata: {
            isAction: false,
          },
        },
        async () => openIdConfig
      ),
      getJwks: createAuthEndpoint(
        '/convex/jwks',
        {
          method: 'GET',
          metadata: {
            openapi: {
              description: 'Get the JSON Web Key Set',
              responses: {
                '200': {
                  description: 'JSON Web Key Set retrieved successfully',
                },
              },
            },
          },
        },
        async (ctx) => {
          return await jwt.endpoints.getJwks({
            ...ctx,
            asResponse: false,
            returnHeaders: false,
            returnStatus: false,
          });
        }
      ),
      getLatestJwks: createAuthEndpoint(
        '/convex/latest-jwks',
        {
          isAction: true,
          method: 'POST',
          metadata: {
            SERVER_ONLY: true,
            openapi: {
              description:
                'Delete and regenerate JWKS, and return the new JWKS for static usage',
            },
          },
        },
        async (ctx) => {
          await jwtPlugin(jwtOptions).endpoints.getJwks({
            ...ctx,
            asResponse: false,
            method: 'GET',
            returnHeaders: false,
            returnStatus: false,
          });
          const jwks: any[] = await ctx.context.adapter.findMany({
            model: 'jwks',
            limit: 1,
            sortBy: {
              direction: 'desc',
              field: 'createdAt',
            },
          });
          jwks[0].alg = jwtOptions.jwks.keyPairConfig.alg;
          return jwks;
        }
      ),
      rotateKeys: createAuthEndpoint(
        '/convex/rotate-keys',
        {
          isAction: true,
          method: 'POST',
          metadata: {
            SERVER_ONLY: true,
            openapi: {
              description:
                'Delete and regenerate JWKS, and return the new JWKS for static usage',
            },
          },
        },
        async (ctx) => {
          await ctx.context.adapter.deleteMany({
            model: 'jwks',
            where: [],
          });

          await jwtPlugin(jwtOptions).endpoints.getJwks({
            ...ctx,
            asResponse: false,
            method: 'GET',
            returnHeaders: false,
            returnStatus: false,
          });
          const jwks: any[] = await ctx.context.adapter.findMany({
            model: 'jwks',
            limit: 1,
            sortBy: {
              direction: 'desc',
              field: 'createdAt',
            },
          });
          jwks[0].alg = jwtOptions.jwks.keyPairConfig.alg;
          return jwks;
        }
      ),
      getToken: createAuthEndpoint(
        '/convex/token',
        {
          method: 'GET',
          requireHeaders: true,
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              description: 'Get a JWT token',
            },
          },
        },
        async (ctx) => {
          const runEndpoint = async () => {
            const response = await jwt.endpoints.getToken({
              ...ctx,
              asResponse: false,
              returnHeaders: false,
              returnStatus: false,
            });
            const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
              maxAge: jwtExpirationSeconds,
            });
            ctx.setCookie(jwtCookie.name, response.token, jwtCookie.attributes);
            return response;
          };
          try {
            return await runEndpoint();
          } catch (error: any) {
            if (!opts.jwks && error?.code === 'ERR_JOSE_NOT_SUPPORTED') {
              if (opts.jwksRotateOnTokenGenerationError) {
                await ctx.context.adapter.deleteMany({
                  model: 'jwks',
                  where: [],
                });
                return await runEndpoint();
              }
              console.error(
                'Try temporarily setting jwksRotateOnTokenGenerationError: true on the Convex Better Auth plugin.'
              );
            }
            throw error;
          }
        }
      ),
    },
    schema,
  } satisfies BetterAuthPlugin;
};
