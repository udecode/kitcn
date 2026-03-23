import type { JwtOptions } from 'better-auth/plugins';
import type { AuthProvider } from 'convex/server';

type JwksDoc = {
  id: string;
  publicKey: string;
  privateKey: string;
  createdAt: number;
  expiresAt?: number;
  alg?: string;
  crv?: string;
};

export const createPublicJwks = (jwks: JwksDoc[], options?: JwtOptions) => {
  const keyPairConfig = options?.jwks?.keyPairConfig;
  const defaultCrv =
    keyPairConfig && 'crv' in keyPairConfig ? keyPairConfig.crv : undefined;

  return {
    keys: jwks.map((keySet) => ({
      alg: keySet.alg ?? options?.jwks?.keyPairConfig?.alg ?? 'EdDSA',
      crv: keySet.crv ?? defaultCrv,
      ...JSON.parse(keySet.publicKey),
      kid: keySet.id,
    })),
  };
};

export const getAuthConfigProvider = (opts?: {
  basePath?: string;
  /**
   * @param jwks - Optional static JWKS to avoid fetching from the database.
   *
   * This should be a stringified document from the Better Auth JWKS table. You
   * can create one in the console.
   *
   * Example:
   * ```bash
   * npx convex run generated/auth:generateJwk | npx convex env set JWKS
   * ```
   *
   * Then use it in your auth config:
   * ```ts
   * export default {
   *   providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
   * } satisfies AuthConfig;
   * ```
   */
  jwks?: string;
}) => {
  const parsedJwks = opts?.jwks ? JSON.parse(opts.jwks) : undefined;

  return {
    type: 'customJwt',
    issuer: `${process.env.CONVEX_SITE_URL}`,
    applicationID: 'convex',
    algorithm: 'RS256',
    jwks: parsedJwks
      ? `data:text/plain;charset=utf-8;base64,${btoa(
          JSON.stringify(createPublicJwks(parsedJwks))
        )}`
      : `${process.env.CONVEX_SITE_URL}${opts?.basePath ?? '/api/auth'}/convex/jwks`,
  } satisfies AuthProvider;
};
